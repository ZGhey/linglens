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
  type TriggerSelectionRequest,
} from '@/messaging/types'

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

/** Tell a tab's content script to explain its current selection. */
function triggerSelectionInTab(tabId: number): void {
  const msg: TriggerSelectionRequest = { type: 'TRIGGER_SELECTION' }
  void chrome.tabs.sendMessage(tabId, msg).catch(() => {
    // No content script on this page (e.g. chrome:// URLs) — nothing to do.
  })
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && tab?.id !== undefined) {
    triggerSelectionInTab(tab.id)
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
    if (t === 'OPEN_OPTIONS') return t
  }
  return undefined
}

chrome.runtime.onMessage.addListener((message) => {
  if (messageType(message) === 'OPEN_OPTIONS') chrome.runtime.openOptionsPage()
  return false
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
