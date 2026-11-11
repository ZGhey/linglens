// Content script: wires the selection → popup flow (selection-ui.ts) into web
// pages, with the live page DOM as the document.

import { blockContextHint, startSelectionUi } from './selection-ui'
import { showPdfNotice } from './pdf-notice'
import type { OpenPdfReaderRequest, OpenPdfReaderResponse } from '@/messaging/types'

/** True when Chrome is showing a PDF in its built-in viewer — where text
 *  selection lives in an internal frame the content script can't read. */
function isPdfView(): boolean {
  return document.contentType === 'application/pdf'
}

/** The script runs in every frame; PDF routing and notices are top-level only
 *  (a PDF embedded in a frame keeps Chrome's viewer — see issue 15). */
const isTopFrame = window === window.top

const PDF_HINT_SEEN_KEY = 'linglens.pdfHintSeen'

const PDF_VIEWER_NOTICE =
  "Linglens can't read text in Chrome's PDF viewer. Turn on the Linglens PDF reader in settings to explain PDF text."

/** Back/forward onto a PDF the reader already took over: going through the
 *  redirect again would trap the Back button, so stay in Chrome's viewer. */
function isHistoryNavigation(): boolean {
  const nav = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined
  return nav?.type === 'back_forward'
}

/** On a PDF, ask the worker to reopen it in the Linglens reader. Resolves false
 *  when the PDF stays in Chrome's viewer (reader off, bypassed, unloadable). */
async function maybeOpenPdfReader(): Promise<boolean> {
  if (!isTopFrame || !isPdfView() || isHistoryNavigation()) return false
  const msg: OpenPdfReaderRequest = { type: 'OPEN_PDF_READER', url: location.href }
  try {
    const res = (await chrome.runtime.sendMessage(msg)) as OpenPdfReaderResponse | undefined
    return res?.redirected === true
  } catch {
    return false
  }
}

/** First time a PDF stays in Chrome's viewer (reader off or bypassed), say once
 *  where select-to-explain lives; never nag again. */
function maybeNotifyPdfOnce(): void {
  if (!isTopFrame || !isPdfView()) return
  void chrome.storage.local.get(PDF_HINT_SEEN_KEY).then((stored) => {
    if (stored[PDF_HINT_SEEN_KEY]) return
    void chrome.storage.local.set({ [PDF_HINT_SEEN_KEY]: true })
    showPdfNotice(PDF_VIEWER_NOTICE)
  })
}

startSelectionUi({
  url: () => location.href,
  html: () => document.documentElement.outerHTML,
  contextHint: blockContextHint,
  // An explicit trigger with no reachable selection on a PDF: say why rather
  // than do nothing.
  onEmptyTrigger: () => {
    if (isTopFrame && isPdfView()) showPdfNotice(PDF_VIEWER_NOTICE)
  },
})

void maybeOpenPdfReader().then((redirected) => {
  if (!redirected) maybeNotifyPdfOnce()
})

console.debug('[Linglens] content script ready')
