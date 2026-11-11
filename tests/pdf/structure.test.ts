import { describe, expect, it } from 'vitest'
import {
  MAX_PARAGRAPH_CHARS,
  buildParagraphs,
  buildPdfHtml,
  groupLines,
  linesToParagraphs,
  normalizeSelectionText,
  paragraphAt,
  type PdfTextItem,
} from '@/pdf/structure'
import { assembleContext } from '@/pipeline'

/** One line of text as a single item at baseline y. */
function line(str: string, y: number, height = 10, x = 50): PdfTextItem {
  return { str, x, y, width: str.length * height * 0.5, height, hasEOL: true }
}

describe('groupLines', () => {
  it('joins runs on one baseline and splits on hasEOL', () => {
    const items: PdfTextItem[] = [
      { str: 'Hello', x: 0, y: 100, width: 25, height: 10, hasEOL: false },
      { str: 'world', x: 30, y: 100, width: 25, height: 10, hasEOL: true },
      { str: 'Next line', x: 0, y: 88, width: 45, height: 10, hasEOL: true },
    ]
    expect(groupLines(items).map((l) => l.text)).toEqual(['Hello world', 'Next line'])
  })

  it('does not insert spaces between CJK runs', () => {
    const items: PdfTextItem[] = [
      { str: '上下文', x: 0, y: 100, width: 30, height: 10, hasEOL: false },
      { str: '感知', x: 35, y: 100, width: 20, height: 10, hasEOL: true },
    ]
    expect(groupLines(items)[0].text).toBe('上下文感知')
  })

  it('expands ligatures', () => {
    expect(groupLines([line('eﬃcient', 100)])[0].text).toBe('efficient')
  })
})

describe('linesToParagraphs', () => {
  it('splits paragraphs at large vertical gaps and undoes hyphenation', () => {
    const lines = groupLines([
      line('A context-', 700),
      line('ual explanation.', 688),
      line('Second paragraph.', 650),
    ])
    const paras = linesToParagraphs(lines, 0)
    expect(paras.map((p) => p.text)).toEqual(['A contextual explanation.', 'Second paragraph.'])
  })

  it('removes a line-end hyphen before a lowercase continuation', () => {
    const paras = linesToParagraphs(groupLines([line('contex-', 700), line('tual', 688)]), 0)
    expect(paras[0].text).toBe('contextual')
  })

  it('flags a short large-font single line as a heading', () => {
    const lines = groupLines([
      line('Introduction', 720, 16),
      line('Body text one.', 690),
      line('Body text two.', 678),
      line('Body text three.', 666),
    ])
    const paras = linesToParagraphs(lines, 0)
    expect(paras[0]).toMatchObject({ text: 'Introduction', headingLevel: 1 })
    expect(paras[1].headingLevel).toBeUndefined()
  })

  it('caps oversized paragraphs at sentence breaks', () => {
    const sentence = 'This sentence is filler text for the cap test. '
    const lines = Array.from({ length: 40 }, (_, i) => line(sentence.trim(), 700 - i * 12))
    const paras = linesToParagraphs(groupLines(lines), 0)
    expect(paras.length).toBeGreaterThan(1)
    for (const p of paras) expect(p.text.length).toBeLessThanOrEqual(MAX_PARAGRAPH_CHARS)
  })
})

describe('buildPdfHtml + pipeline', () => {
  const pages = [
    [
      line('Neural Networks', 720, 16),
      line('A model learns weights from data.', 690),
      line('Training uses gradient descent.', 678),
      line('Regularization', 640, 16),
      line('Dropout randomly disables units during training.', 610),
    ],
    [line('Dropout is not used at inference time.', 700)],
  ]

  it('produces HTML the pipeline reads as title, outline and prose', () => {
    const html = buildPdfHtml('Deep Learning Notes', buildParagraphs(pages), [])
    const payload = assembleContext({
      html,
      selection: 'Dropout',
      settings: { targetLang: 'English' },
    })
    expect(payload.summary.title).toBe('Deep Learning Notes')
    expect(payload.summary.outline).toEqual(['Neural Networks', 'Regularization'])
    expect(payload.localContext.heading).toBe('Regularization')
  })

  it('uses bookmarks as headings when the PDF has an outline', () => {
    const html = buildPdfHtml('Notes', buildParagraphs(pages), [
      { title: 'Chapter 1', level: 1, page: 0, top: 730 },
      { title: 'Chapter 2', level: 1, page: 1, top: null },
    ])
    const payload = assembleContext({
      html,
      selection: 'inference',
      settings: { targetLang: 'English' },
    })
    expect(payload.summary.outline).toEqual(['Chapter 1', 'Chapter 2'])
    expect(payload.localContext.heading).toBe('Chapter 2')
  })

  it('escapes markup in PDF text', () => {
    const html = buildPdfHtml('<script>', buildParagraphs([[line('a < b && c > d', 700)]]), [])
    expect(html).not.toContain('<script>')
    expect(html).toContain('a &lt; b &amp;&amp; c &gt; d')
  })
})

describe('paragraphAt', () => {
  const paras = buildParagraphs([
    [
      line('Dropout appears here first.', 700),
      line('Unrelated text in between.', 660),
      line('Dropout appears here second.', 620),
    ],
  ])

  it('picks the paragraph under the selection point, not the first match', () => {
    expect(paragraphAt(paras, 0, { x: 60, y: 623 }, 'Dropout')).toBe('Dropout appears here second.')
  })

  it('falls back to the nearest paragraph containing the term', () => {
    expect(paragraphAt(paras, 0, { x: 60, y: 690 }, 'Dropout')).toBe('Dropout appears here first.')
  })

  it('makes the pipeline pick the selected occurrence', () => {
    const html = buildPdfHtml('Doc', paras, [])
    const hint = paragraphAt(paras, 0, { x: 60, y: 623 }, 'Dropout')
    const payload = assembleContext({
      html,
      selection: 'Dropout',
      settings: { targetLang: 'English' },
      contextHint: hint,
    })
    expect(payload.localContext.text).toBe('Dropout appears here second.')
  })
})

describe('normalizeSelectionText', () => {
  it('reads a selection across wrapped lines as one phrase', () => {
    expect(normalizeSelectionText('during training,\nwhich forces')).toBe(
      'during training, which forces',
    )
    expect(normalizeSelectionText('contex-\ntual')).toBe('contextual')
    expect(normalizeSelectionText('上下文\n感知')).toBe('上下文感知')
  })
})

describe('typeset paragraphs', () => {
  it('breaks paragraphs at a first-line indent with no vertical gap', () => {
    const lines = groupLines([
      line('First paragraph runs across the full column width here.', 700, 10, 50),
      line('It ends on this shorter line.', 688, 10, 50),
      line('Second paragraph starts indented.', 676, 10, 62),
      line('And continues at the margin again with more words.', 664, 10, 50),
    ])
    const paras = linesToParagraphs(lines, 0)
    expect(paras.map((p) => p.text.split(' ')[0])).toEqual(['First', 'Second'])
  })

  it('keeps a subscript on its line', () => {
    const items: PdfTextItem[] = [
      { str: 'set β', x: 50, y: 700, width: 25, height: 10, hasEOL: false },
      { str: '2', x: 75, y: 697, width: 4, height: 7, hasEOL: false },
      { str: 'to 0.95', x: 82, y: 700, width: 30, height: 10, hasEOL: true },
    ]
    expect(groupLines(items).map((l) => l.text)).toEqual(['set β2 to 0.95'])
  })
})
