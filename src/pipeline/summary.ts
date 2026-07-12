import type { DocumentSummary, ExtractedDoc, LocalContext, PipelineSettings } from './types'
import { DEFAULTS } from './types'

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max)
}

/**
 * Deterministic document summary — title + heading outline + a heuristic topic
 * built from the leading prose. No LLM call, so this stays pure and cheap.
 */
export function buildSummary(doc: ExtractedDoc, settings: PipelineSettings): DocumentSummary {
  const maxOutline = settings.maxOutlineEntries ?? DEFAULTS.maxOutlineEntries
  const maxTopic = settings.maxTopicChars ?? DEFAULTS.maxTopicChars

  const outline = doc.blocks
    .filter((b) => b.kind === 'heading')
    .map((b) => b.text)
    .slice(0, maxOutline)

  const prose = doc.blocks.filter((b) => b.kind === 'prose').map((b) => b.text)
  const topic = truncate(prose.join(' '), maxTopic)

  return { title: doc.title, outline, topic }
}

/**
 * The section/paragraph the selection lives in, with its nearest preceding
 * heading. Falls back to the leading prose when the selection can't be located.
 */
export function selectLocalContext(
  doc: ExtractedDoc,
  selection: string,
  settings: PipelineSettings,
  contextHint?: string,
): LocalContext {
  const maxLocal = settings.maxLocalContextChars ?? DEFAULTS.maxLocalContextChars
  const needle = selection.trim().toLowerCase()

  const headingBefore = (index: number): string | null => {
    for (let i = index - 1; i >= 0; i--) {
      if (doc.blocks[i].kind === 'heading') return doc.blocks[i].text
    }
    return null
  }

  // Prefer the block the hint pins down — this disambiguates repeated terms.
  // The hint is the selection's enclosing block text, so the matching prose
  // block is the longest one that overlaps it.
  const hint = (contextHint ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  let matchIndex = -1
  if (hint) {
    let best = 0
    doc.blocks.forEach((b, i) => {
      if (b.kind !== 'prose') return
      const t = b.text.toLowerCase()
      if ((hint.includes(t) || t.includes(hint)) && b.text.length > best) {
        best = b.text.length
        matchIndex = i
      }
    })
  }

  // Fall back to the first prose block containing the term.
  if (matchIndex === -1) {
    matchIndex = doc.blocks.findIndex(
      (b) => b.kind === 'prose' && needle.length > 0 && b.text.toLowerCase().includes(needle),
    )
  }

  if (matchIndex !== -1) {
    return {
      heading: headingBefore(matchIndex),
      text: truncate(doc.blocks[matchIndex].text, maxLocal),
    }
  }

  // Fallback: first prose block (the intro).
  const introIndex = doc.blocks.findIndex((b) => b.kind === 'prose')
  if (introIndex !== -1) {
    return {
      heading: headingBefore(introIndex),
      text: truncate(doc.blocks[introIndex].text, maxLocal),
    }
  }

  return { heading: null, text: '' }
}
