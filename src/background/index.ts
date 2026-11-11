// Background service worker. Owns LLM calls and the per-page summary cache so
// API keys never enter page context. Delegates the real flow to the injectable
// ExplainService (see explain.ts).

import { explainStreamWith } from '@/providers'
import { loadSettings } from '@/settings'
import { addHistoryEntry } from '@/history'
import { createExplainService } from './explain'
import {
  EXPLAIN_PORT,
  type ExplainRequest,
  type Message,
  type OpenPdfReaderResponse,
  type TriggerSelectionRequest,
} from '@/messaging/types'
import { READER_PATH, isReaderLoadable, looksLikePdf, readerUrlFor } from '@/pdf/routing'

const service = createExplainService({
  getSettings: loadSettings,
  explain: explainStreamWith,
})

const CONTEXT_MENU_ID = 'linglens-explain'

// Register the right-click entry once on install.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Explain with Linglens',
    contexts: ['selection'],
  })
})

/** Tell a tab to explain its current selection. A web page hears it through
 *  its content script; the PDF reader (an extension page, which tabs.sendMessage
 *  doesn't reach) hears a runtime broadcast addressed to its tab. */
function triggerSelectionInTab(tabId: number, frameId?: number): void {
  const msg: TriggerSelectionRequest = { type: 'TRIGGER_SELECTION' }
  // Content scripts run in every frame; deliver only to the frame the user
  // acted in when known (context menu). Without a frame (keyboard command), the
  // content script itself only acts in the focused frame.
  const target = frameId !== undefined ? chrome.tabs.sendMessage(tabId, msg, { frameId }) : chrome.tabs.sendMessage(tabId, msg)
  void target.catch(() => {
    // No content script on this page (e.g. chrome:// URLs) — nothing to do.
  })
  const broadcast: TriggerSelectionRequest = { type: 'TRIGGER_SELECTION', tabId }
  void chrome.runtime.sendMessage(broadcast).catch(() => {
    // No extension page listening — nothing to do.
  })
}

// PDFs the user (or a failed reader load) sent back to Chrome's own viewer for
// this browser session. Session storage survives worker restarts.
const PDF_BYPASS_KEY = 'linglens.pdfBypass'
const MAX_BYPASSED = 200

async function bypassedPdfs(): Promise<string[]> {
  const raw = await chrome.storage.session.get(PDF_BYPASS_KEY)
  return (raw[PDF_BYPASS_KEY] as string[] | undefined) ?? []
}

async function bypassPdf(url: string): Promise<void> {
  const list = (await bypassedPdfs()).filter((u) => u !== url)
  list.push(url)
  await chrome.storage.session.set({ [PDF_BYPASS_KEY]: list.slice(-MAX_BYPASSED) })
}

/** Whether the reader will be able to load this URL again. Leaving Chrome's
 *  viewer for a PDF that can't be refetched (one-time download links, POST
 *  results, expired signed URLs) would lose it, so check first: a credentialed
 *  GET whose first bytes are a PDF. Only the head is read; the body is dropped.
 *  file:// can't be fetched from the worker — the reader loads it via XHR. */
async function refetchesAsPdf(url: string): Promise<boolean> {
  if (url.startsWith('file:')) return true
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, { credentials: 'include', signal: controller.signal })
    if (!res.ok || !res.body) return false
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (size < 1024) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.length
    }
    void reader.cancel().catch(() => {})
    const head = new Uint8Array(size)
    let offset = 0
    for (const c of chunks) {
      head.set(c, offset)
      offset += c.length
    }
    return looksLikePdf(head)
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Send a tab showing a PDF in Chrome's viewer to the Linglens reader, unless
 *  the reader is off, the user bypassed it, or the PDF can't be refetched. */
async function openPdfReader(tabId: number, url: string): Promise<OpenPdfReaderResponse> {
  const settings = await loadSettings()
  if (!settings.pdfReader || !isReaderLoadable(url)) return { redirected: false }
  if ((await bypassedPdfs()).includes(url)) return { redirected: false }
  if (!(await refetchesAsPdf(url))) return { redirected: false }
  await chrome.tabs.update(tabId, {
    url: readerUrlFor(chrome.runtime.getURL(READER_PATH), url),
  })
  return { redirected: true }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && tab?.id !== undefined) {
    triggerSelectionInTab(tab.id, info.frameId)
  }
})

// Keyboard command declared in the manifest.
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'explain-selection') return
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (tab?.id !== undefined) triggerSelectionInTab(tab.id)
  })
})

function messageType(msg: unknown): Message['type'] | undefined {
  if (typeof msg === 'object' && msg !== null) {
    const t = (msg as { type?: unknown }).type
    if (t === 'OPEN_OPTIONS' || t === 'OPEN_PDF_READER' || t === 'PDF_BYPASS') return t
  }
  return undefined
}

function messageUrl(msg: unknown): string {
  const url = (msg as { url?: unknown }).url
  return typeof url === 'string' ? url : ''
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (messageType(message)) {
    case 'OPEN_OPTIONS':
      chrome.runtime.openOptionsPage()
      return false
    case 'OPEN_PDF_READER': {
      // Act only on the sending tab's own top-level document, and take its URL
      // from the sender (set by Chrome), never from the message body — so a
      // content script can't make the worker probe or open arbitrary URLs with
      // the user's cookies.
      const tabId = sender.tab?.id
      const url = sender.url
      if (tabId === undefined || sender.frameId !== 0 || !url) return false
      openPdfReader(tabId, url)
        .then(sendResponse)
        .catch(() => sendResponse({ redirected: false } satisfies OpenPdfReaderResponse))
      return true // async response
    }
    case 'PDF_BYPASS':
      // Only an extension page (the reader) may bypass — not a content script.
      if (!sender.url?.startsWith(chrome.runtime.getURL(''))) return false
      bypassPdf(messageUrl(message))
        .then(() => sendResponse(true))
        .catch(() => sendResponse(false))
      return true
    default:
      return false
  }
})

// EXPLAIN runs over a per-request port so the worker can stream token deltas
// back to the content script before the final result.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== EXPLAIN_PORT) return
  // Dismissing the popup disconnects the port; abort the provider call so an
  // abandoned stream stops draining (and billing) the LLM.
  const controller = new AbortController()
  port.onDisconnect.addListener(() => controller.abort())
  port.onMessage.addListener((message: unknown) => {
    if (!isExplainRequest(message)) return
    void service
      .handle(message, (text) => safePost(port, { type: 'delta', text }), controller.signal)
      .then((response) => {
        safePost(port, { type: 'result', response })
        // Record first explanations for the history list; follow-ups belong to
        // their popup session. Fire-and-forget — history must never delay or
        // fail an explanation.
        if (response.ok && !message.followUp) {
          void loadSettings()
            .then((s) =>
              addHistoryEntry(
                {
                  term: response.term,
                  explanation: response.explanation,
                  url: message.url,
                  title: response.title,
                  verbosity: response.verbosity,
                },
                s.historyLimit,
              ),
            )
            .catch(() => {})
        }
      })
  })
})

function isExplainRequest(msg: unknown): msg is ExplainRequest {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'EXPLAIN'
}

/** Post to a port that may already be disconnected (popup dismissed mid-stream). */
function safePost(port: chrome.runtime.Port, message: unknown): void {
  try {
    port.postMessage(message)
  } catch {
    // Port closed by the other end — nothing to deliver to.
  }
}

console.debug('[Linglens] service worker ready')
