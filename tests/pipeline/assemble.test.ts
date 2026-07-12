import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  extractDocument,
  buildSummary,
  selectLocalContext,
  assembleContext,
} from '@/pipeline'
import type { PipelineSettings } from '@/pipeline/types'

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)),
    'utf8',
  )
}

const settings: PipelineSettings = { targetLang: 'Chinese' }

describe('extractDocument', () => {
  it('extracts the title and strips nav/header/footer', () => {
    const doc = extractDocument(fixture('github-readme.html'))
    expect(doc.title).toContain('GitHub Actions')
    const allText = doc.blocks.map((b) => b.text).join('\n')
    expect(allText).not.toContain('Pricing')
    expect(allText).not.toContain('Copyright footer junk')
  })

  it('marks code blocks as code, keeping them out of prose', () => {
    const doc = extractDocument(fixture('github-readme.html'))
    const prose = doc.blocks.filter((b) => b.kind === 'prose').map((b) => b.text).join('\n')
    expect(prose).not.toContain('./config.sh')
    expect(doc.blocks.some((b) => b.kind === 'code')).toBe(true)
  })

  it('records heading levels', () => {
    const doc = extractDocument(fixture('github-readme.html'))
    const headings = doc.blocks.filter((b) => b.kind === 'heading')
    expect(headings.some((h) => h.level === 1)).toBe(true)
    expect(headings.some((h) => h.level === 2)).toBe(true)
    expect(headings.some((h) => h.level === 3)).toBe(true)
  })
})

describe('buildSummary', () => {
  it('builds title + heading outline + a topic summary', () => {
    const doc = extractDocument(fixture('github-readme.html'))
    const summary = buildSummary(doc, settings)
    expect(summary.title).toContain('GitHub Actions')
    expect(summary.outline).toContain('Installation')
    expect(summary.outline).toContain('Architecture')
    expect(summary.topic.length).toBeGreaterThan(0)
    // Topic is prose, not code.
    expect(summary.topic).not.toContain('./config.sh')
  })

  it('bounds the outline and topic length', () => {
    const doc = extractDocument(fixture('github-readme.html'))
    const summary = buildSummary(doc, { targetLang: 'English', maxOutlineEntries: 2, maxTopicChars: 40 })
    expect(summary.outline.length).toBeLessThanOrEqual(2)
    expect(summary.topic.length).toBeLessThanOrEqual(40)
  })

  it('still produces a topic for a flat article with no headings', () => {
    const doc = extractDocument(fixture('flat-article.html'))
    const summary = buildSummary(doc, settings)
    expect(summary.outline).toEqual([])
    expect(summary.topic).toContain('Hydration')
  })
})

describe('selectLocalContext', () => {
  it('selects the section the selection lives in, with its heading', () => {
    const doc = extractDocument(fixture('github-readme.html'))
    const local = selectLocalContext(doc, 'configure it against', settings)
    expect(local.text.toLowerCase()).toContain('configure it against')
    expect(local.heading).toBe('Installation')
  })

  it('picks the nearest preceding heading for a deeper section', () => {
    const doc = extractDocument(fixture('github-readme.html'))
    const local = selectLocalContext(doc, 'own hardware', settings)
    expect(local.heading).toBe('Self-hosted runners')
  })

  it('falls back to the intro when the selection is not found in prose', () => {
    const doc = extractDocument(fixture('github-readme.html'))
    const local = selectLocalContext(doc, 'zzz-not-present', settings)
    expect(local.text.length).toBeGreaterThan(0)
  })

  it('bounds the local-context length', () => {
    const doc = extractDocument(fixture('github-readme.html'))
    const local = selectLocalContext(doc, 'self-host', { targetLang: 'English', maxLocalContextChars: 30 })
    expect(local.text.length).toBeLessThanOrEqual(30)
  })

  it('handles a flat article by returning the paragraph containing the term', () => {
    const doc = extractDocument(fixture('flat-article.html'))
    const local = selectLocalContext(doc, 'Partial hydration', settings)
    expect(local.heading).toBeNull()
    expect(local.text).toContain('Partial hydration')
  })

  it('uses the context hint to disambiguate a term that appears in two sections', () => {
    const doc = extractDocument(fixture('github-readme.html'))
    // "runner" appears in the intro (heading: GitHub Actions Runner) and in the
    // Self-hosted runners section. Without a hint the first match (intro) wins.
    const noHint = selectLocalContext(doc, 'runner', settings)
    expect(noHint.heading).toBe('GitHub Actions Runner')

    // With a hint pointing at the self-hosted paragraph, the correct section wins.
    const withHint = selectLocalContext(
      doc,
      'runner',
      settings,
      'A self-hosted runner is a machine you manage that connects to GitHub and executes workflow jobs on your own hardware.',
    )
    expect(withHint.heading).toBe('Self-hosted runners')
    expect(withHint.text).toContain('self-hosted runner')
  })
})

describe('assembleContext', () => {
  it('produces a full bounded payload', () => {
    const payload = assembleContext({
      html: fixture('github-readme.html'),
      selection: 'runner',
      settings,
    })
    expect(payload.term).toBe('runner')
    expect(payload.targetLang).toBe('Chinese')
    expect(payload.summary.title).toContain('GitHub Actions')
    expect(payload.localContext.text.length).toBeGreaterThan(0)
  })

  it('excludes code from prose even on a code-heavy page', () => {
    const payload = assembleContext({
      html: fixture('mostly-code.html'),
      selection: 'sink',
      settings,
    })
    expect(payload.summary.topic).toContain('sink')
    expect(payload.summary.topic).not.toContain('brokers')
    expect(payload.localContext.text).not.toContain('9092')
  })
})
