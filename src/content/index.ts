// Content script: wires the selection → popup flow (selection-ui.ts) into web
// pages, with the live page DOM as the document.

import { blockContextHint, startSelectionUi } from './selection-ui'
import { showPdfNotice } from './pdf-notice'

/** True when Chrome is showing a PDF in its built-in viewer — where text
 *  selection lives in an internal frame the content script can't read. */
function isPdfView(): boolean {
  return document.contentType === 'application/pdf'
}

const PDF_HINT_SEEN_KEY = 'linglens.pdfHintSeen'

/** First time the user opens any PDF, tell them once that PDFs aren't supported;
 *  never nag again. */
function maybeNotifyPdfOnce(): void {
  if (!isPdfView()) return
  void chrome.storage.local.get(PDF_HINT_SEEN_KEY).then((stored) => {
    if (stored[PDF_HINT_SEEN_KEY]) return
    void chrome.storage.local.set({ [PDF_HINT_SEEN_KEY]: true })
    showPdfNotice("Linglens doesn't read PDFs yet — it works on any web page.")
  })
}

startSelectionUi({
  url: () => location.href,
  html: () => document.documentElement.outerHTML,
  contextHint: blockContextHint,
  // An explicit trigger with no reachable selection on a PDF: say why rather
  // than do nothing.
  onEmptyTrigger: () => {
    if (isPdfView()) showPdfNotice("Linglens can't read PDF text yet — try it on a web page.")
  },
})

maybeNotifyPdfOnce()

console.debug('[Linglens] content script ready')
