// Public surface of the pure context-assembly pipeline.
//
//   (html, selection, settings) -> bounded PromptPayload
//
// Split so the worker can cache the expensive, document-level summary by URL and
// recompute only the cheap local context on later selections (ticket 06).

import { extractDocument } from './extract'
import { buildSummary, selectLocalContext } from './summary'
import type { AssembleInput, DocumentSummary, ExtractedDoc, PromptPayload } from './types'

export { extractDocument } from './extract'
export { buildSummary, selectLocalContext } from './summary'
export * from './types'

/** Combine a prebuilt summary with a fresh local-context lookup. */
export function assembleWith(
  summary: DocumentSummary,
  doc: ExtractedDoc,
  input: Omit<AssembleInput, 'html'>,
): PromptPayload {
  return {
    summary,
    localContext: selectLocalContext(doc, input.selection, input.settings, input.contextHint),
    term: input.selection.trim(),
    targetLang: input.settings.targetLang,
    verbosity: input.settings.verbosity ?? 'concise',
    followUp: input.followUp,
  }
}

/** One-shot assembly from raw HTML — parse, summarize, and locate in one call. */
export function assembleContext(input: AssembleInput): PromptPayload {
  const doc = extractDocument(input.html)
  const summary = buildSummary(doc, input.settings)
  return assembleWith(summary, doc, input)
}
