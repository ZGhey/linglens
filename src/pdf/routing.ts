// Pure helpers for routing PDFs into the Linglens reader page.

/** Path of the reader page inside the extension (as emitted to dist/). */
export const READER_PATH = 'src/reader/index.html'

/** Schemes the reader will load. blob:/data: URLs belong to the page that made
 *  them and can't be refetched from the extension; anything else is refused. */
const LOADABLE = new Set(['http:', 'https:', 'file:'])

/** True when a PDF at this URL can be handed to the reader. */
export function isReaderLoadable(url: string): boolean {
  try {
    return LOADABLE.has(new URL(url).protocol)
  } catch {
    return false
  }
}

/** Reader page URL for a PDF, given the extension's reader page URL. */
export function readerUrlFor(readerPageUrl: string, pdfUrl: string): string {
  return `${readerPageUrl}?file=${encodeURIComponent(pdfUrl)}`
}

/** The PDF URL a reader page was opened with, or null if missing/not loadable. */
export function pdfUrlFromReaderSearch(search: string): string | null {
  const file = new URLSearchParams(search).get('file')
  return file && isReaderLoadable(file) ? file : null
}

/** A readable name for the document: the URL's last path segment, decoded. */
export function fileNameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? ''
    return decodeURIComponent(last) || url
  } catch {
    return url
  }
}

/** True when the first bytes of a response are a PDF. The header may sit after
 *  some leading junk, which readers tolerate within the first 1 KB. */
export function looksLikePdf(head: Uint8Array): boolean {
  let text = ''
  for (const b of head.subarray(0, 1024)) text += String.fromCharCode(b)
  return text.includes('%PDF-')
}
