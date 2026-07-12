// Content script: turns a text selection into a floating explanation popup and
// bridges to the background worker. Ticket 02 wires the plumbing; the worker
// still returns a stub (no LLM, no extraction).

import {
  EXPLAIN_PORT,
  type ExplainRequest,
  type ExplainResponse,
  type ExplainStreamMessage,
  type OpenOptionsRequest,
} from '@/messaging/types'
import type { FollowUpTurn, Verbosity } from '@/pipeline/types'
import type { TokenUsage } from '@/providers/types'
import { addUsage } from '@/settings'
import { Popup } from './popup'
import { TriggerIcon } from './trigger-icon'
import { showPdfNotice } from './pdf-notice'

/** True when Chrome is showing a PDF in its built-in viewer — where text
 *  selection lives in an internal frame the content script can't read. */
function isPdfView(): boolean {
  return document.contentType === 'application/pdf'
}

const PDF_HINT_SEEN_KEY = 'linglens.pdfHintSeen'

/** A viewport point the popup is anchored to. */
interface Anchor {
  x: number
  y: number
}

let popup: Popup | null = null
/** The token-free trigger icon shown after a selection, if any. */
let icon: TriggerIcon | null = null

// The in-flight EXPLAIN port, if any. Held at module scope so dismissing or
// replacing the popup can disconnect it — the worker aborts its provider call on
// disconnect, so an abandoned stream stops draining (and billing) the LLM.
let activePort: chrome.runtime.Port | null = null

function closeActivePort(): void {
  activePort?.disconnect()
  activePort = null
}

/** Bound on follow-up turns per popup, so replayed threads stay cheap (the
 *  whole thread is resent to the provider on every follow-up). */
const MAX_FOLLOW_UPS = 8

/** Everything one popup accumulated: the original explanation, its follow-up
 *  thread, and running usage/cost totals. Dies with the popup. */
interface PopupSession {
  term: string
  anchor: Anchor
  hint: string
  verbosity: Verbosity
  /** Language of this thread; carried on follow-ups so it can't drift. */
  targetLang: string
  explanation: string
  turns: FollowUpTurn[]
  usage?: TokenUsage
  cost?: number
}

function openSettings(): void {
  const msg: OpenOptionsRequest = { type: 'OPEN_OPTIONS' }
  void chrome.runtime.sendMessage(msg)
}

function currentSelectionText(): string {
  return (window.getSelection()?.toString() ?? '').trim()
}

const BLOCK_TAGS = new Set(['P', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'ARTICLE', 'SECTION', 'DIV'])

/** Text of the nearest block element enclosing the selection, so the worker can
 *  disambiguate which section a repeated term belongs to. */
function selectionContextHint(): string {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return ''
  let node: Node | null = sel.getRangeAt(0).startContainer
  let el = node instanceof Element ? node : node?.parentElement ?? null
  while (el && !BLOCK_TAGS.has(el.tagName)) el = el.parentElement
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function dismiss(event: MouseEvent): void {
  if (!popup) return
  if (event.target instanceof Node && popup.element.contains(event.target)) return
  closeActivePort()
  popup.remove()
  popup = null
  document.removeEventListener('mousedown', dismiss, true)
}

function explainSelection(
  term: string,
  anchor: Anchor,
  verbosity?: Verbosity,
  contextHint?: string,
  targetLang?: string,
): void {
  // Replacing an existing popup abandons its stream — disconnect so the worker
  // aborts it rather than draining to completion.
  closeActivePort()
  popup?.remove()
  const active = new Popup()
  popup = active
  active.showAt(anchor.x, anchor.y)
  active.renderLoading(term)
  document.addEventListener('mousedown', dismiss, true)

  // Capture the enclosing block now; a toggle re-run passes it back in because
  // the original selection may be gone by then.
  const hint = contextHint ?? selectionContextHint()

  const request: ExplainRequest = {
    type: 'EXPLAIN',
    term,
    url: location.href,
    html: document.documentElement.outerHTML,
    contextHint: hint,
    verbosity,
    targetLang,
  }

  let streaming = false
  runExplainPort(active, request, {
    onDelta: (text) => {
      if (!streaming) {
        active.beginStreaming(term)
        streaming = true
      }
      active.appendDelta(text)
    },
    onResult: (res) => {
      if (res.ok) {
        const session: PopupSession = {
          term,
          anchor,
          hint,
          verbosity: res.verbosity,
          targetLang: res.targetLang,
          explanation: res.explanation,
          turns: [],
          usage: res.usage,
          cost: res.cost,
        }
        renderSession(active, session)
      } else {
        active.renderError(term, res.error, openSettings)
      }
    },
    onInterrupted: () =>
      active.renderError(term, { kind: 'unknown', message: 'The explanation was interrupted.' }, openSettings),
  })
}

/** One EXPLAIN round-trip over a fresh port: deltas, then exactly one result.
 *  onInterrupted fires when the port dies without a result. */
function runExplainPort(
  active: Popup,
  request: ExplainRequest,
  handlers: {
    onDelta: (text: string) => void
    onResult: (res: ExplainResponse) => void
    onInterrupted: () => void
  },
): void {
  const port = chrome.runtime.connect({ name: EXPLAIN_PORT })
  activePort = port
  let finished = false

  const clearActive = () => {
    if (activePort === port) activePort = null
  }

  port.onMessage.addListener((msg: ExplainStreamMessage) => {
    if (popup !== active) return
    if (msg.type === 'delta') {
      handlers.onDelta(msg.text)
      return
    }
    finished = true
    handlers.onResult(msg.response)
    port.disconnect()
    clearActive()
  })

  port.onDisconnect.addListener(() => {
    clearActive()
    if (finished || popup !== active) return
    handlers.onInterrupted()
  })

  port.postMessage(request)
}

/** Render the finished card from session state: original answer, thread,
 *  cumulative usage, and the follow-up input while under the cap. */
function renderSession(active: Popup, session: PopupSession): void {
  active.renderExplanation(session.term, session.explanation, {
    verbosity: session.verbosity,
    // Toggling re-runs from scratch, which would silently drop the thread and
    // its running totals — so the toggle is only offered before any follow-up.
    onToggleVerbosity:
      session.turns.length === 0
        ? (v) => explainSelection(session.term, session.anchor, v, session.hint, session.targetLang)
        : undefined,
    usage: session.usage,
    cost: session.cost,
    thread: session.turns,
    onFollowUp:
      session.turns.length < MAX_FOLLOW_UPS
        ? (question) => sendFollowUp(active, session, question)
        : undefined,
  })
}

function sendFollowUp(active: Popup, session: PopupSession, question: string): void {
  active.beginFollowUpStream(question)

  const request: ExplainRequest = {
    type: 'EXPLAIN',
    term: session.term,
    url: location.href,
    html: document.documentElement.outerHTML,
    contextHint: session.hint,
    verbosity: session.verbosity,
    targetLang: session.targetLang,
    followUp: {
      explanation: session.explanation,
      turns: session.turns,
      question,
    },
  }

  runExplainPort(active, request, {
    onDelta: (text) => active.appendDelta(text),
    onResult: (res) => {
      if (res.ok) {
        session.turns.push({ question, answer: res.explanation })
        // Running totals; a turn without provider-reported usage leaves the
        // totals unchanged rather than inventing numbers.
        session.usage = addUsage(session.usage, res.usage)
        if (res.cost !== undefined) session.cost = (session.cost ?? 0) + res.cost
        renderSession(active, session)
      } else {
        // Keep the thread on screen; restore the input, then surface the error.
        renderSession(active, session)
        active.showFollowUpError(res.error, openSettings)
      }
    },
    onInterrupted: () => {
      renderSession(active, session)
      active.showFollowUpError(
        { kind: 'unknown', message: 'The follow-up was interrupted.' },
        openSettings,
      )
    },
  })
}

/** Where to anchor the popup for the current selection when there is no mouse
 *  event (context-menu / keyboard trigger): just below the selection rect. */
function selectionAnchor(): Anchor {
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0) {
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (rect.width || rect.height) return { x: rect.left, y: rect.bottom }
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
}

/** Explain the current selection, positioned from its bounding rect. Used by the
 *  explicit triggers (context-menu, keyboard) — those skip the trigger icon. */
function triggerCurrentSelection(): void {
  const term = currentSelectionText()
  if (!term) {
    // An explicit trigger with no reachable selection on a PDF: say why rather
    // than do nothing.
    if (isPdfView()) showPdfNotice("Linglens can't read PDF text yet — try it on a web page.")
    return
  }
  dismissIcon()
  void explainSelection(term, selectionAnchor())
}

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

function dismissIcon(): void {
  icon?.remove()
  icon = null
}

/** A term worth offering the icon for: short and within one block. A long or
 *  multi-paragraph (contains a newline) selection is almost always copied text,
 *  not a term to explain, so we don't clutter it with an icon. */
function shouldOfferIcon(term: string): boolean {
  return term.length <= 200 && !term.includes('\n')
}

// Primary trigger: highlight text, release the mouse. This only shows the
// (token-free) trigger icon; clicking the icon is what explains and calls the LLM.
document.addEventListener('mouseup', (event) => {
  const target = event.target
  // A click inside our own popup or icon is not a new selection.
  if (popup && target instanceof Node && popup.element.contains(target)) return
  if (icon && target instanceof Node && icon.element.contains(target)) return

  const term = currentSelectionText()
  if (!term || !shouldOfferIcon(term)) {
    dismissIcon()
    return
  }
  // Capture the selection's context now — it may be gone by the time the user
  // clicks the icon.
  const hint = selectionContextHint()
  const anchor = { x: event.clientX, y: event.clientY }
  dismissIcon()
  const active = new TriggerIcon(() => {
    dismissIcon()
    void explainSelection(term, anchor, undefined, hint)
  })
  icon = active
  active.showAt(anchor.x, anchor.y)
})

// Dismiss the icon when the anchor goes stale or the user backs out.
window.addEventListener('scroll', dismissIcon, true)
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') dismissIcon()
})

// Secondary triggers: context-menu entry and keyboard command, relayed by the worker.
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'TRIGGER_SELECTION'
  ) {
    triggerCurrentSelection()
  }
})

maybeNotifyPdfOnce()

console.debug('[Linglens] content script ready')
