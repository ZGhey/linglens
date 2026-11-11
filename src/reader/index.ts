// Linglens PDF reader: a pdf.js viewer page that PDFs are routed into (see
// src/pdf/routing.ts), so the normal select → trigger icon → popup flow works on
// PDF text. The document handed to the pipeline is the PDF's text rebuilt as
// HTML (src/pdf/structure.ts); the context hint is the exact paragraph under the
// selection.

import './reader.css'
import 'pdfjs-dist/legacy/web/pdf_viewer.css'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PdfBypassRequest } from '@/messaging/types'
import { fileNameFromUrl, pdfUrlFromReaderSearch } from '@/pdf/routing'
import {
  buildParagraphs,
  buildPdfHtml,
  paragraphAt,
  MAX_PAGES,
  type PdfOutlineEntry,
  type PdfParagraph,
  type PdfTextItem,
} from '@/pdf/structure'
import { startSelectionUi } from '@/content/selection-ui'

// pdf_viewer.mjs reads `globalThis.pdfjsLib` when it is evaluated, so it is
// imported only after the core library above has loaded.
const viewerLib = await import('pdfjs-dist/legacy/web/pdf_viewer.mjs')

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/** Runtime assets copied into dist/pdfjs/ by the build (see vite.config.ts). */
const asset = (dir: string) => chrome.runtime.getURL(`pdfjs/${dir}/`)

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const container = $<HTMLDivElement>('viewerContainer')
const statusEl = $<HTMLDivElement>('status')
const titleEl = $<HTMLSpanElement>('docTitle')
const pageNumberEl = $<HTMLInputElement>('pageNumber')
const pageCountEl = $<HTMLSpanElement>('pageCount')
const scaleEl = $<HTMLSelectElement>('scale')
const findInputEl = $<HTMLInputElement>('findInput')
const findStatusEl = $<HTMLSpanElement>('findStatus')

const pdfUrl = pdfUrlFromReaderSearch(location.search)

/** Leave the reader for Chrome's own viewer, and stay there for this URL for
 *  the rest of the session (otherwise the content script would bounce the tab
 *  straight back here). */
async function openInChromeViewer(url: string): Promise<void> {
  const msg: PdfBypassRequest = { type: 'PDF_BYPASS', url }
  await chrome.runtime.sendMessage(msg).catch(() => {})
  if (url.startsWith('file:')) {
    // An extension page can't navigate itself to file://; the tabs API can.
    const tab = await chrome.tabs.getCurrent()
    if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { url })
  } else {
    location.replace(url)
  }
}

function setStatus(text: string): void {
  statusEl.textContent = text
}

if (!pdfUrl) {
  setStatus('No PDF to show. Open a PDF link and Linglens will display it here.')
} else {
  void start(pdfUrl)
}

async function start(url: string): Promise<void> {
  const fileName = fileNameFromUrl(url)
  document.title = fileName
  titleEl.textContent = fileName
  titleEl.title = url
  setStatus('Loading PDF…')
  // Wired before loading so a slow or stuck load can still be escaped.
  $('openNative').addEventListener('click', () => void openInChromeViewer(url))

  const eventBus = new viewerLib.EventBus()
  const linkService = new viewerLib.PDFLinkService({
    eventBus,
    externalLinkTarget: viewerLib.LinkTarget.BLANK,
    externalLinkRel: 'noopener noreferrer nofollow',
  })
  const findController = new viewerLib.PDFFindController({ eventBus, linkService })
  const viewer = new viewerLib.PDFViewer({
    container,
    viewer: $<HTMLDivElement>('viewer'),
    eventBus,
    linkService,
    findController,
    removePageBorders: false,
  })
  linkService.setViewer(viewer)

  const loadingTask = pdfjsLib.getDocument({
    url,
    // Send cookies so PDFs behind a login load like they did in the tab.
    withCredentials: true,
    cMapUrl: asset('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: asset('standard_fonts'),
    wasmUrl: asset('wasm'),
    iccUrl: asset('iccs'),
    enableXfa: false,
  })
  loadingTask.onPassword = (update: (password: string) => void, reason: number) => {
    const retry = reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD
    const password = window.prompt(retry ? 'Wrong password. Try again:' : 'This PDF is protected. Password:')
    if (password === null) void openInChromeViewer(url)
    else update(password)
  }

  let pdf: PDFDocumentProxy
  try {
    pdf = await loadingTask.promise
  } catch (err) {
    // Refetching can fail where the tab's own load succeeded (one-time links,
    // POST results, blocked cookies). Never strand the user: go back to
    // Chrome's viewer automatically.
    console.warn('[Linglens] reader could not load the PDF; using Chrome viewer', err)
    setStatus('Opening in Chrome’s viewer…')
    await openInChromeViewer(url)
    return
  }
  setStatus('')

  viewer.setDocument(pdf)
  linkService.setDocument(pdf, null)

  eventBus.on('pagesinit', () => {
    viewer.currentScaleValue = 'auto'
    const hashPage = Number(new URL(url).hash.match(/page=(\d+)/)?.[1])
    if (hashPage >= 1 && hashPage <= pdf.numPages) viewer.currentPageNumber = hashPage
  })
  pageCountEl.textContent = `/ ${pdf.numPages}`
  pageNumberEl.max = String(pdf.numPages)

  void pdf.getMetadata().then(({ info }) => {
    const title = (info as { Title?: unknown } | null)?.Title
    if (typeof title === 'string' && title.trim()) {
      document.title = title.trim()
      titleEl.textContent = title.trim()
    }
  }).catch(() => {})

  wireToolbar(url, pdf, viewer, eventBus)

  // Text structure for the pipeline, built in the background; an explanation
  // requested before it finishes simply waits for it.
  const structure = extractStructure(pdf)

  const tab = await chrome.tabs.getCurrent()
  startSelectionUi({
    url: () => url,
    html: async () => (await structure).html,
    contextHint: () => {
      const located = locateSelection(viewer)
      if (!located) return ''
      return structure.then((s) => paragraphAt(s.paragraphs, located.page, located.point, located.term))
    },
    tabId: tab?.id,
  })
}

/** Page index, PDF-space point and text of the current selection, read now
 *  (the selection may be gone by the time the hint is resolved). */
function locateSelection(viewer: InstanceType<typeof viewerLib.PDFViewer>):
  | { page: number; point: { x: number; y: number }; term: string }
  | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  const start = range.startContainer
  const el = start instanceof Element ? start : start.parentElement
  const pageEl = el?.closest<HTMLElement>('.page[data-page-number]')
  if (!pageEl) return null
  const pageNumber = Number(pageEl.dataset.pageNumber)
  const pageView = viewer.getPageView(pageNumber - 1)
  if (!pageView) return null
  const rect = range.getBoundingClientRect()
  const pageRect = pageEl.getBoundingClientRect()
  const [x, y] = pageView.viewport.convertToPdfPoint(
    rect.left + rect.width / 2 - pageRect.left,
    rect.top + rect.height / 2 - pageRect.top,
  )
  return { page: pageNumber - 1, point: { x, y }, term: sel.toString() }
}

interface Structure {
  html: string
  paragraphs: PdfParagraph[]
}

async function extractStructure(pdf: PDFDocumentProxy): Promise<Structure> {
  const pages: PdfTextItem[][] = []
  const count = Math.min(pdf.numPages, MAX_PAGES)
  for (let n = 1; n <= count; n++) {
    try {
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      const items: PdfTextItem[] = []
      for (const item of content.items) {
        if (!('str' in item)) continue // marked-content markers carry no text
        items.push({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height || Math.hypot(item.transform[2], item.transform[3]),
          hasEOL: item.hasEOL,
        })
      }
      pages.push(items)
    } catch {
      pages.push([]) // an unreadable page shouldn't sink the whole document
    }
  }
  const paragraphs = buildParagraphs(pages)
  const outline = await readOutline(pdf).catch(() => [])
  let title = fileNameFromUrl(pdfUrl ?? '')
  try {
    const { info } = await pdf.getMetadata()
    const t = (info as { Title?: unknown } | null)?.Title
    if (typeof t === 'string' && t.trim()) title = t.trim()
  } catch {
    // keep the file name
  }
  return { html: buildPdfHtml(title, paragraphs, outline), paragraphs }
}

/** Flatten the PDF's bookmarks, resolving each to a page and destination top. */
async function readOutline(pdf: PDFDocumentProxy): Promise<PdfOutlineEntry[]> {
  const out: PdfOutlineEntry[] = []
  type Node = { title: string; dest: unknown; items: Node[] }
  const walk = async (nodes: Node[], level: number): Promise<void> => {
    for (const node of nodes) {
      if (out.length >= 200) return
      try {
        const dest = typeof node.dest === 'string' ? await pdf.getDestination(node.dest) : node.dest
        if (Array.isArray(dest) && dest.length > 0) {
          const ref = dest[0]
          const page =
            typeof ref === 'number' ? ref : await pdf.getPageIndex(ref as Parameters<typeof pdf.getPageIndex>[0])
          const kind = (dest[1] as { name?: string } | undefined)?.name
          const top =
            kind === 'XYZ' ? (dest[3] as number | null) : kind === 'FitH' || kind === 'FitBH' ? (dest[2] as number | null) : null
          if (node.title.trim()) out.push({ title: node.title.trim(), level, page, top: top ?? null })
        }
      } catch {
        // an unresolvable bookmark is skipped
      }
      if (node.items?.length) await walk(node.items, level + 1)
    }
  }
  const outline = (await pdf.getOutline()) as Node[] | null
  if (outline) await walk(outline, 1)
  return out
}

function wireToolbar(
  url: string,
  pdf: PDFDocumentProxy,
  viewer: InstanceType<typeof viewerLib.PDFViewer>,
  eventBus: InstanceType<typeof viewerLib.EventBus>,
): void {
  eventBus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => {
    pageNumberEl.value = String(pageNumber)
  })
  pageNumberEl.addEventListener('change', () => {
    const n = Math.round(Number(pageNumberEl.value))
    if (n >= 1 && n <= pdf.numPages) viewer.currentPageNumber = n
    else pageNumberEl.value = String(viewer.currentPageNumber)
  })

  const customOption = scaleEl.querySelector<HTMLOptionElement>('option[value="custom"]')!
  eventBus.on('scalechanging', ({ scale, presetValue }: { scale: number; presetValue?: string }) => {
    if (presetValue && [...scaleEl.options].some((o) => o.value === presetValue)) {
      scaleEl.value = presetValue
      customOption.hidden = true
      return
    }
    const preset = [...scaleEl.options].find((o) => o.value !== 'custom' && Number(o.value) === scale)
    if (preset) {
      scaleEl.value = preset.value
      customOption.hidden = true
    } else {
      customOption.textContent = `${Math.round(scale * 100)}%`
      customOption.hidden = false
      scaleEl.value = 'custom'
    }
  })
  scaleEl.addEventListener('change', () => {
    if (scaleEl.value !== 'custom') viewer.currentScaleValue = scaleEl.value
  })
  const zoom = (steps: number) => {
    if (steps > 0) viewer.increaseScale({ steps })
    else viewer.decreaseScale({ steps: -steps })
  }
  $('zoomIn').addEventListener('click', () => zoom(1))
  $('zoomOut').addEventListener('click', () => zoom(-1))

  const find = (type: '' | 'again', findPrevious = false) =>
    eventBus.dispatch('find', {
      source: null,
      type,
      query: findInputEl.value,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious,
      matchDiacritics: false,
    })
  findInputEl.addEventListener('input', () => find(''))
  findInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') find('again', e.shiftKey)
  })
  $('findNext').addEventListener('click', () => find('again'))
  $('findPrev').addEventListener('click', () => find('again', true))
  eventBus.on(
    'updatefindmatchescount',
    ({ matchesCount }: { matchesCount: { current: number; total: number } }) => {
      findStatusEl.textContent = matchesCount.total
        ? `${matchesCount.current} / ${matchesCount.total}`
        : findInputEl.value
          ? 'No matches'
          : ''
    },
  )
  eventBus.on('updatefindcontrolstate', ({ state }: { state: number }) => {
    if (state === viewerLib.FindState.NOT_FOUND) findStatusEl.textContent = 'No matches'
  })

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey
    if (!mod) return
    if (e.key === 'f') {
      e.preventDefault()
      findInputEl.focus()
      findInputEl.select()
    } else if (e.key === '=' || e.key === '+') {
      e.preventDefault()
      zoom(1)
    } else if (e.key === '-') {
      e.preventDefault()
      zoom(-1)
    } else if (e.key === '0') {
      e.preventDefault()
      viewer.currentScaleValue = 'auto'
    }
  })

  $('download').addEventListener('click', async () => {
    const data = await pdf.getData()
    const blobUrl = URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileNameFromUrl(url).toLowerCase().endsWith('.pdf')
      ? fileNameFromUrl(url)
      : 'document.pdf'
    a.click()
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000)
  })
  container.focus()
}
