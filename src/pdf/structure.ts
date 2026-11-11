// Pure PDF text → document structure. Turns pdf.js text items (already reduced
// to plain positioned strings) into paragraphs and headings, then into the same
// HTML shape the pipeline extracts from web pages. No pdf.js or DOM imports, so
// it runs in Node tests.
//
// Coordinates are PDF user space: origin bottom-left, y grows upward, so a
// paragraph's `top` is numerically larger than its `bottom`.

/** One positioned run of text from a page (pdf.js TextItem, simplified). */
export interface PdfTextItem {
  str: string
  /** Baseline origin. */
  x: number
  y: number
  width: number
  /** Font size / glyph height in user-space units. */
  height: number
  /** pdf.js marks the last item of a visual line. */
  hasEOL: boolean
}

/** An outline (bookmark) entry, resolved to a page. */
export interface PdfOutlineEntry {
  title: string
  /** 1 = top level. */
  level: number
  /** 0-based page index. */
  page: number
  /** Destination top in user space, when the bookmark carries one. */
  top: number | null
}

export interface PdfParagraph {
  /** 0-based page index. */
  page: number
  text: string
  top: number
  bottom: number
  left: number
  right: number
  /** Set when the paragraph is a heading (1..6). */
  headingLevel?: number
}

interface Line {
  text: string
  y: number
  height: number
  left: number
  right: number
}

/** Longest paragraph block we emit. The pipeline truncates local context from
 *  the start, so an oversized block (a failed paragraph split) could push the
 *  selected term out of the window — split long runs instead. */
export const MAX_PARAGRAPH_CHARS = 800

/** Hard caps on what one PDF contributes to the pipeline input. */
export const MAX_PAGES = 400
export const MAX_DOC_CHARS = 1_500_000

const CJK = /[　-ヿ㐀-䶿一-鿿가-힯＀-￯]/

function isCjk(ch: string | undefined): boolean {
  return ch !== undefined && CJK.test(ch)
}

/** Join two text runs, inserting a space only where the script uses one. */
function joinRuns(a: string, b: string): string {
  if (!a) return b
  if (!b) return a
  if (/\s$/.test(a) || /^\s/.test(b)) return a + b
  if (isCjk(a[a.length - 1]) || isCjk(b[0])) return a + b
  return `${a} ${b}`
}

/** Join two lines of one paragraph, undoing end-of-line hyphenation
 *  ("contex-" + "tual" → "contextual"). */
function joinLines(a: string, b: string): string {
  if (/[a-z]-$/.test(a) && /^[a-z]/.test(b)) return a.slice(0, -1) + b
  return joinRuns(a, b)
}

function normalizeText(s: string): string {
  // Expand common Latin ligatures so selections and search line up with text.
  return s
    .replace(/ﬀ/g, 'ff')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/ﬃ/g, 'ffi')
    .replace(/ﬄ/g, 'ffl')
    .replace(/\s+/g, ' ')
}

/** Group a page's items into visual lines, in content order. */
export function groupLines(items: readonly PdfTextItem[]): Line[] {
  const lines: Line[] = []
  let current: Line | null = null
  let prevRight = 0

  const flush = () => {
    if (current && current.text.trim()) {
      current.text = current.text.trim()
      lines.push(current)
    }
    current = null
  }

  for (const item of items) {
    const str = normalizeText(item.str)
    const h = Math.abs(item.height) || 1
    if (current && Math.abs(item.y - current.y) > h * 0.5) flush()
    if (str.trim()) {
      if (!current) {
        current = { text: str, y: item.y, height: h, left: item.x, right: item.x + item.width }
      } else {
        // A visible horizontal gap between runs is a word break the PDF didn't
        // encode as a space character.
        const gap = item.x - prevRight
        current.text =
          gap > h * 0.15 ? joinRuns(current.text, str) : current.text + str
        current.height = Math.max(current.height, h)
        current.left = Math.min(current.left, item.x)
        current.right = Math.max(current.right, item.x + item.width)
      }
      prevRight = item.x + item.width
    }
    if (item.hasEOL) flush()
  }
  flush()
  return lines
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** Split text longer than the cap at sentence (or, failing that, word) breaks. */
function splitLong(text: string): string[] {
  if (text.length <= MAX_PARAGRAPH_CHARS) return [text]
  const out: string[] = []
  let rest = text
  while (rest.length > MAX_PARAGRAPH_CHARS) {
    const window = rest.slice(0, MAX_PARAGRAPH_CHARS)
    let cut = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('。'),
      window.lastIndexOf('! '),
      window.lastIndexOf('? '),
    )
    if (cut < MAX_PARAGRAPH_CHARS / 3) cut = window.lastIndexOf(' ')
    if (cut < MAX_PARAGRAPH_CHARS / 3) cut = MAX_PARAGRAPH_CHARS - 1
    out.push(rest.slice(0, cut + 1).trim())
    rest = rest.slice(cut + 1).trim()
  }
  if (rest) out.push(rest)
  return out
}

/**
 * Turn one page's lines into paragraphs. A new paragraph starts at a vertical
 * gap clearly larger than the line spacing, or where the font size changes
 * (heading ↔ body). Paragraphs over the cap are split.
 */
export function linesToParagraphs(lines: readonly Line[], page: number): PdfParagraph[] {
  const bodyHeight = median(lines.map((l) => l.height)) || 1
  const paragraphs: PdfParagraph[] = []

  let group: Line[] = []
  const flush = () => {
    if (group.length === 0) return
    let text = ''
    for (const l of group) text = joinLines(text, l.text)
    const top = Math.max(...group.map((l) => l.y + l.height))
    const bottom = Math.min(...group.map((l) => l.y))
    const left = Math.min(...group.map((l) => l.left))
    const right = Math.max(...group.map((l) => l.right))
    // Heading heuristic (used when the PDF has no outline): a short, single
    // line set clearly larger than the page's body text.
    const only = group.length === 1 ? group[0] : null
    const headingLevel =
      only && only.text.length <= 120 && only.height >= bodyHeight * 1.25
        ? only.height >= bodyHeight * 1.6
          ? 1
          : 2
        : undefined
    for (const part of splitLong(text.trim())) {
      paragraphs.push({ page, text: part, top, bottom, left, right, headingLevel })
    }
    group = []
  }

  for (const line of lines) {
    const prev = group[group.length - 1]
    if (prev) {
      const gap = prev.y - line.y // baseline-to-baseline; positive going down
      const sizeChange =
        Math.max(prev.height, line.height) / Math.max(1e-6, Math.min(prev.height, line.height))
      const spacing = Math.max(prev.height, line.height)
      // gap <= 0: the line is beside or above the previous one (new column).
      if (gap <= 0 || gap > spacing * 1.6 || sizeChange > 1.2) flush()
    }
    group.push(line)
  }
  flush()
  return paragraphs
}

/** Paragraphs for a whole document, capped by MAX_PAGES / MAX_DOC_CHARS. */
export function buildParagraphs(pages: readonly (readonly PdfTextItem[])[]): PdfParagraph[] {
  const all: PdfParagraph[] = []
  let chars = 0
  for (let i = 0; i < Math.min(pages.length, MAX_PAGES); i++) {
    for (const p of linesToParagraphs(groupLines(pages[i]), i)) {
      if (chars + p.text.length > MAX_DOC_CHARS) return all
      chars += p.text.length
      all.push(p)
    }
  }
  return all
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Serialize the structure as HTML for the pipeline. When the PDF has an outline,
 * its bookmarks are the headings (placed before the first paragraph at or below
 * the bookmark's destination) and the font-size heuristic is ignored; otherwise
 * heuristic headings are used.
 */
export function buildPdfHtml(
  title: string,
  paragraphs: readonly PdfParagraph[],
  outline: readonly PdfOutlineEntry[],
): string {
  const useOutline = outline.length > 0
  // Bookmarks waiting to be placed, in document order.
  const pending = [...outline].sort(
    (a, b) => a.page - b.page || (b.top ?? Infinity) - (a.top ?? Infinity),
  )

  const parts: string[] = []
  const heading = (level: number, text: string) => {
    const l = Math.min(6, Math.max(1, level))
    parts.push(`<h${l}>${escapeHtml(text)}</h${l}>`)
  }

  for (const p of paragraphs) {
    while (
      pending.length > 0 &&
      (pending[0].page < p.page ||
        (pending[0].page === p.page && (pending[0].top === null || p.top <= pending[0].top + 2)))
    ) {
      const entry = pending.shift()!
      heading(entry.level, entry.title)
    }
    if (!useOutline && p.headingLevel) heading(p.headingLevel, p.text)
    else parts.push(`<p>${escapeHtml(p.text)}</p>`)
  }
  for (const entry of pending) heading(entry.level, entry.title)

  return (
    `<!doctype html><html><head><title>${escapeHtml(title)}</title></head>` +
    `<body><main>${parts.join('')}</main></body></html>`
  )
}

/**
 * The paragraph a selection sits in: on its page, the paragraph whose box
 * contains the point; among several (or none), the closest one that contains
 * the term. Returns its text — exactly a block of the generated HTML, so the
 * pipeline's hint matching lands on it.
 */
export function paragraphAt(
  paragraphs: readonly PdfParagraph[],
  page: number,
  point: { x: number; y: number },
  term: string,
): string {
  const onPage = paragraphs.filter((p) => p.page === page)
  const needle = normalizeText(term).trim().toLowerCase()
  const hasTerm = (p: PdfParagraph) => !needle || p.text.toLowerCase().includes(needle)
  const tol = 2

  const containing = onPage.filter(
    (p) =>
      point.y >= p.bottom - tol &&
      point.y <= p.top + tol &&
      point.x >= p.left - tol &&
      point.x <= p.right + tol,
  )
  const hit = containing.find(hasTerm) ?? (containing.length === 1 ? containing[0] : undefined)
  if (hit) return hit.text

  const distance = (p: PdfParagraph) =>
    point.y > p.top ? point.y - p.top : point.y < p.bottom ? p.bottom - point.y : 0
  const candidates = onPage.filter(hasTerm).sort((a, b) => distance(a) - distance(b))
  return candidates[0]?.text ?? ''
}
