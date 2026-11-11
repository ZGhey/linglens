// Gmail's attachment preview draws each PDF page as an image under a
// mouse-capturing overlay. It keeps an invisible, exactly aligned text layer
// (one <p> per line inside each page's [role=document]), but the overlay means
// a drag never creates a DOM selection. So, inside the preview, Linglens does
// the selecting itself: it maps the drag (or a double-click) onto the text
// layer, draws its own highlight, and offers the usual trigger icon. The
// document context is the preview's text, rebuilt like a PDF's.

import { ShadowHost } from '../shadow-host'
import type { Anchor, SelectionUi } from '../selection-ui'
import {
  buildParagraphs,
  buildPdfHtml,
  normalizeSelectionText,
  paragraphAt,
  type PdfTextItem,
} from '@/pdf/structure'
import { GMAIL_ORIGIN } from './origins'

export { GMAIL_ORIGIN }

// --- Pure helpers (unit-tested) ----------------------------------------------

/** Characters that make up a word for double-click selection. CJK has no word
 *  breaks, so a double-click there takes the run of CJK characters. */
const WORD_CHAR = /[\p{L}\p{N}_'’-]/u
const CJK_CHAR = /[぀-ヿ㐀-䶿一-鿿가-힯]/

/** [start, end) of the word around `offset` in `text`. */
export function wordBounds(text: string, offset: number): [number, number] {
  const at = Math.min(Math.max(offset, 0), Math.max(text.length - 1, 0))
  const ch = text[at] ?? ''
  const same = CJK_CHAR.test(ch)
    ? (c: string) => CJK_CHAR.test(c)
    : WORD_CHAR.test(ch) && !CJK_CHAR.test(ch)
      ? (c: string) => WORD_CHAR.test(c) && !CJK_CHAR.test(c)
      : null
  if (!same) return [at, at]
  let start = at
  let end = at + 1
  while (start > 0 && same(text[start - 1])) start--
  while (end < text.length && same(text[end])) end++
  return [start, end]
}

/** One line of the preview's text layer, by position. */
export interface LineBox {
  text: string
  left: number
  top: number
  right: number
  bottom: number
}

/** Index of the line a point belongs to: a line whose box contains it, else
 *  the line nearest vertically (ties: nearest horizontally). */
export function lineAt(lines: readonly LineBox[], x: number, y: number): number {
  let best = -1
  let bestScore = Infinity
  lines.forEach((l, i) => {
    const dy = y < l.top ? l.top - y : y > l.bottom ? y - l.bottom : 0
    const dx = x < l.left ? l.left - x : x > l.right ? x - l.right : 0
    const score = dy * 1000 + dx
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
}

/** Selected text between two carets (line index + char offset), in reading
 *  order, with wrapped lines joined into one phrase. */
export function textBetween(
  lines: readonly LineBox[],
  a: { line: number; offset: number },
  b: { line: number; offset: number },
): string {
  const [s, e] = a.line < b.line || (a.line === b.line && a.offset <= b.offset) ? [a, b] : [b, a]
  const parts: string[] = []
  for (let i = s.line; i <= e.line; i++) {
    const t = lines[i].text
    parts.push(t.slice(i === s.line ? s.offset : 0, i === e.line ? e.offset : t.length))
  }
  return normalizeSelectionText(parts.join('\n'))
}

// --- DOM ---------------------------------------------------------------------

interface Line {
  el: HTMLElement
  node: Text
  page: number
  box: LineBox
}

/** The preview's pages and their text lines, measured now (positions change
 *  with scroll and zoom). Empty when no PDF preview is open. */
function readPreview(): Line[] {
  const lines: Line[] = []
  document.querySelectorAll<HTMLElement>('[role="document"]').forEach((page, pageIndex) => {
    for (const el of page.querySelectorAll<HTMLElement>('p')) {
      const node = [...el.childNodes].find((n): n is Text => n.nodeType === Node.TEXT_NODE)
      const r = el.getBoundingClientRect()
      if (!node || !node.data.trim() || r.width === 0) continue
      lines.push({
        el,
        node,
        page: pageIndex,
        box: { text: node.data, left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      })
    }
  })
  return lines
}

function pageRects(): DOMRect[] {
  return [...document.querySelectorAll<HTMLElement>('[role="document"]')]
    .filter((p) => p.querySelector('p'))
    .map((p) => p.getBoundingClientRect())
}

function inAnyRect(rects: DOMRect[], x: number, y: number): boolean {
  return rects.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)
}

/** Char offset in a line nearest to x (measured glyph by glyph). */
function offsetAt(line: Line, x: number): number {
  const range = document.createRange()
  const len = line.node.data.length
  for (let i = 0; i < len; i++) {
    range.setStart(line.node, i)
    range.setEnd(line.node, i + 1)
    const r = range.getBoundingClientRect()
    if (x < r.left + r.width / 2) return i
  }
  return len
}

function caretAt(lines: Line[], x: number, y: number): { line: number; offset: number } | null {
  const i = lineAt(
    lines.map((l) => l.box),
    x,
    y,
  )
  return i < 0 ? null : { line: i, offset: offsetAt(lines[i], x) }
}

const HIGHLIGHT_STYLES = `
  :host { all: initial; }
  .cl-hl {
    position: fixed; pointer-events: none; z-index: 2147483645;
    background: rgba(66, 133, 244, 0.32); border-radius: 2px;
  }
`

class Highlight extends ShadowHost {
  constructor() {
    super('linglens-gmail-highlight', HIGHLIGHT_STYLES)
  }
  draw(lines: Line[], a: { line: number; offset: number }, b: { line: number; offset: number }): void {
    const [s, e] = a.line < b.line || (a.line === b.line && a.offset <= b.offset) ? [a, b] : [b, a]
    for (const old of this.root.querySelectorAll('.cl-hl')) old.remove()
    const range = document.createRange()
    for (let i = s.line; i <= e.line; i++) {
      const line = lines[i]
      range.setStart(line.node, i === s.line ? s.offset : 0)
      range.setEnd(line.node, i === e.line ? e.offset : line.node.data.length)
      for (const r of range.getClientRects()) {
        const d = document.createElement('div')
        d.className = 'cl-hl'
        d.style.left = `${r.left}px`
        d.style.top = `${r.top}px`
        d.style.width = `${r.width}px`
        d.style.height = `${r.height}px`
        this.root.appendChild(d)
      }
    }
    this.mount()
  }
}

/** The previewed file's name, shown as the preview's title. */
function previewTitle(): string {
  const heading = [...document.querySelectorAll<HTMLElement>('[role="heading"]')]
    .filter((h) => h.getClientRects().length > 0)
    .map((h) => (h.textContent ?? '').trim())
    .find((t) => /\.pdf$/i.test(t))
  return heading ?? document.title
}

/** The preview's text as the pipeline document, plus the selection's paragraph. */
function previewDocument(lines: Line[], at: { line: number }, term: string) {
  const pages: PdfTextItem[][] = []
  for (const l of lines) {
    // Viewport y grows downward; the PDF structure code expects y growing up.
    ;(pages[l.page] ??= []).push({
      str: l.box.text,
      x: l.box.left,
      y: -l.box.bottom,
      width: l.box.right - l.box.left,
      height: l.box.bottom - l.box.top,
      hasEOL: true,
    })
  }
  for (let i = 0; i < pages.length; i++) pages[i] ??= []
  const paragraphs = buildParagraphs(pages)
  const sel = lines[at.line]
  const hint = paragraphAt(
    paragraphs,
    sel.page,
    { x: (sel.box.left + sel.box.right) / 2, y: -(sel.box.top + sel.box.bottom) / 2 },
    term,
  )
  return { html: buildPdfHtml(previewTitle(), paragraphs, []), hint }
}

/** Whether an event came from Linglens's own UI (icon, popup). */
function fromLinglens(event: Event): boolean {
  return event
    .composedPath()
    .some((n) => n instanceof HTMLElement && n.id.startsWith('linglens-'))
}

/**
 * Enable select-to-explain inside Gmail's PDF preview. `setDocument` hands the
 * preview's text to the content script's document source for the explanation
 * that follows (null when the selection is cleared).
 */
export function startGmailPreviewSelection(
  ui: SelectionUi,
  setDocument: (doc: { html: string } | null) => void,
): void {
  const highlight = new Highlight()
  let lines: Line[] = []
  let start: { line: number; offset: number } | null = null
  let downAt: { x: number; y: number } | null = null

  const clear = () => {
    highlight.remove()
    start = null
    downAt = null
  }

  const finish = (a: { line: number; offset: number }, b: { line: number; offset: number }, anchor: Anchor) => {
    const term = textBetween(
      lines.map((l) => l.box),
      a,
      b,
    )
    if (!term) {
      clear()
      return
    }
    highlight.draw(lines, a, b)
    const doc = previewDocument(lines, a.line <= b.line ? a : b, term)
    setDocument({ html: doc.html })
    // After the page's own mouseup handling (which sees no DOM selection and
    // hides any icon), offer ours.
    setTimeout(() => ui.offer(term, anchor, doc.hint), 0)
  }

  document.addEventListener(
    'mousedown',
    (e) => {
      if (e.button !== 0 || fromLinglens(e)) return
      clear()
      if (!inAnyRect(pageRects(), e.clientX, e.clientY)) {
        // A click outside the preview: later selections are ordinary page text.
        setDocument(null)
        return
      }
      lines = readPreview()
      start = caretAt(lines, e.clientX, e.clientY)
      downAt = { x: e.clientX, y: e.clientY }
    },
    true,
  )

  document.addEventListener(
    'mousemove',
    (e) => {
      if (!start || !downAt || !(e.buttons & 1)) return
      const end = caretAt(lines, e.clientX, e.clientY)
      if (end) highlight.draw(lines, start, end)
    },
    true,
  )

  document.addEventListener(
    'mouseup',
    (e) => {
      if (!start || !downAt || fromLinglens(e)) return
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y)
      const end = caretAt(lines, e.clientX, e.clientY)
      const a = start
      downAt = null
      start = null
      if (moved < 4 || !end) {
        highlight.remove()
        return
      }
      finish(a, end, { x: e.clientX, y: e.clientY })
    },
    true,
  )

  document.addEventListener(
    'dblclick',
    (e) => {
      if (fromLinglens(e) || !inAnyRect(pageRects(), e.clientX, e.clientY)) return
      lines = readPreview()
      const at = caretAt(lines, e.clientX, e.clientY)
      if (!at) return
      const [s, end] = wordBounds(lines[at.line].box.text, at.offset)
      if (end <= s) return
      finish({ line: at.line, offset: s }, { line: at.line, offset: end }, { x: e.clientX, y: e.clientY })
    },
    true,
  )

  // Positions go stale on scroll/zoom; closing the preview ends it.
  window.addEventListener('scroll', () => highlight.remove(), true)
  window.addEventListener('hashchange', () => {
    clear()
    setDocument(null)
    ui.dismiss()
  })
}
