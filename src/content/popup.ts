// Floating explanation popup, rendered in a Shadow DOM so page CSS cannot bleed
// in and the popup's styles cannot leak onto the page. Pure DOM, no framework.

import type { ErrorKind, ExplainError } from '@/messaging/types'
import type { FollowUpTurn, Verbosity } from '@/pipeline/types'
import type { TokenUsage } from '@/providers/types'
import { ShadowHost } from './shadow-host'

/** Optional extras for the finished-explanation card. */
export interface ExplanationOptions {
  /** Length the explanation was generated at; drives the toggle's active state. */
  verbosity?: Verbosity
  /** Re-explain the same term at another length (popup Concise/Detailed toggle). */
  onToggleVerbosity?: (verbosity: Verbosity) => void
  /** Token counts shown in the footer; cumulative across the popup's thread. */
  usage?: TokenUsage
  /** Completed follow-up turns rendered under the original explanation. */
  thread?: FollowUpTurn[]
  /** Called with the typed question; presence renders the follow-up input. */
  onFollowUp?: (question: string) => void
}

const HOST_ID = 'linglens-popup-host'

// Distinct, actionable copy per error kind. Keeps the popup from ever showing a
// stuck spinner or a silent failure (ticket 08).
const ERROR_COPY: Record<ErrorKind, string> = {
  'missing-key': 'No API key set. Open settings and add your provider key to get started.',
  'invalid-key': 'Your API key was rejected. Open settings and check the key for the selected provider.',
  'rate-limited': 'The provider is rate-limiting you. Wait a few seconds and try again.',
  'no-selection': 'Select a word or phrase first, then trigger Linglens.',
  network: 'Could not reach the provider. Check your internet connection and retry.',
  unknown: 'Something went wrong. Please try again.',
}

/** The copy to show for an error. Curated per-kind copy wins for the actionable
 * kinds, but the open-ended `unknown` kind prefers a specific backend message
 * (e.g. "The provider returned an empty response.") when one is present — that
 * is far more diagnostic than the generic fallback. */
function errorText(error: ExplainError): string {
  if (error.kind === 'unknown' && error.message.trim()) return error.message
  return ERROR_COPY[error.kind]
}

/** Key errors are fixable in settings, so we offer a shortcut button for them. */
const FIXABLE_IN_SETTINGS: ReadonlySet<ErrorKind> = new Set(['missing-key', 'invalid-key'])

// Midnight-Violet dark-glass theme. The card floats over arbitrary pages (light
// or dark), so it commits to one dark, blurred, self-lit look that reads on any
// background rather than trying to match the page.
const STYLES = `
  :host { all: initial; }
  .cl-card {
    position: fixed;
    z-index: 2147483647;
    max-width: 360px;
    box-sizing: border-box;
    font: 13px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #f8fafc;
    /* High opacity so the card stays legible over bright pages (a lighter glass
       let the page bleed through and washed out the text); still translucent. */
    background: rgba(15, 23, 42, 0.92);
    backdrop-filter: blur(16px) saturate(1.4);
    -webkit-backdrop-filter: blur(16px) saturate(1.4);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
    padding: 12px 14px;
    /* Long follow-up threads scroll inside the card instead of growing past
       the viewport. */
    max-height: min(440px, 72vh);
    overflow-y: auto;
    animation: cl-in 160ms ease-out;
  }
  @keyframes cl-in { from { opacity: 0; transform: translateY(6px); } }
  .cl-term {
    font-weight: 600;
    font-size: 11px;
    color: #94a3b8;
    margin-bottom: 6px;
    word-break: break-word;
  }
  .cl-term b { color: #a78bfa; font-weight: 700; }
  .cl-body { white-space: pre-wrap; word-break: break-word; color: #f8fafc; }
  /* Blinking caret on the body that is currently streaming tokens. */
  .cl-streaming::after {
    content: '▋'; color: #8b5cf6; margin-left: 1px;
    animation: cl-blink 1s step-end infinite;
  }
  @keyframes cl-blink { 50% { opacity: 0; } }
  .cl-loading { color: #94a3b8; display: flex; align-items: center; gap: 8px; }
  .cl-spinner {
    width: 12px; height: 12px; border-radius: 50%;
    border: 2px solid rgba(148, 163, 184, 0.3); border-top-color: #8b5cf6;
    animation: cl-spin 0.7s linear infinite;
  }
  @keyframes cl-spin { to { transform: rotate(360deg); } }
  .cl-error { color: #f87171; }
  .cl-actions { margin-top: 10px; display: flex; gap: 8px; align-items: center; }
  .cl-btn {
    font: inherit; font-size: 12px; cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04); color: #e2e8f0;
    border-radius: 7px; padding: 4px 11px;
    transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
  }
  .cl-btn:hover {
    background: rgba(139, 92, 246, 0.16); border-color: rgba(139, 92, 246, 0.5); color: #f8fafc;
  }
  .cl-btn[disabled] {
    cursor: default;
    background: rgba(139, 92, 246, 0.22); border-color: rgba(139, 92, 246, 0.6); color: #f8fafc;
  }
  .cl-seg { display: flex; gap: 4px; margin-left: auto; }
  .cl-usage {
    color: #64748b; font-size: 11px; margin-top: 8px; font-variant-numeric: tabular-nums;
  }
  .cl-q { font-weight: 600; color: #cbd5e1; margin-top: 10px; }
  .cl-q::before { content: '↳ '; color: #8b5cf6; }
  .cl-a { margin-top: 4px; }
  .cl-ask { display: flex; gap: 6px; margin-top: 10px; }
  .cl-ask input {
    flex: 1; font: inherit; font-size: 12px; color: #f8fafc;
    background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 7px; padding: 5px 9px; outline: none;
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }
  .cl-ask input::placeholder { color: #64748b; }
  .cl-ask input:focus { border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.25); }
  .cl-followup-error { color: #f87171; font-size: 12px; margin-top: 6px; }
  @media (prefers-reduced-motion: reduce) {
    .cl-card { animation: none; }
    .cl-streaming::after { animation: none; }
    .cl-btn, .cl-ask input { transition: none; }
  }
`

export class Popup extends ShadowHost {
  private card: HTMLDivElement
  private streamBody: HTMLDivElement | null = null

  constructor() {
    super(HOST_ID, STYLES)
    this.card = document.createElement('div')
    this.card.className = 'cl-card'
    this.root.appendChild(this.card)
  }

  /** Position the popup near a viewport point and attach it to the page. */
  showAt(x: number, y: number): void {
    this.card.style.left = `${Math.min(x, window.innerWidth - 380)}px`
    this.card.style.top = `${y + 8}px`
    this.mount()
  }

  renderLoading(term: string): void {
    this.streamBody = null
    this.card.replaceChildren()
    this.card.appendChild(this.termLine(term))
    const loading = document.createElement('div')
    loading.className = 'cl-loading'
    const spinner = document.createElement('span')
    spinner.className = 'cl-spinner'
    const label = document.createElement('span')
    label.textContent = 'Explaining…'
    loading.append(spinner, label)
    this.card.appendChild(loading)
  }

  /** Switch from the spinner to an (initially empty) body that appendDelta grows
   *  as streamed tokens arrive. */
  beginStreaming(term: string): void {
    this.card.replaceChildren()
    this.card.appendChild(this.termLine(term))
    const body = document.createElement('div')
    body.className = 'cl-body cl-streaming'
    this.card.appendChild(body)
    this.streamBody = body
  }

  /** Append one streamed token delta to the streaming body, keeping the newest
   *  text in view as the scrollable card grows. */
  appendDelta(text: string): void {
    if (!this.streamBody) return
    this.streamBody.textContent += text
    this.card.scrollTop = this.card.scrollHeight
  }

  renderExplanation(term: string, explanation: string, opts: ExplanationOptions = {}): void {
    this.streamBody = null
    this.card.replaceChildren()
    this.card.appendChild(this.termLine(term))

    const body = document.createElement('div')
    body.className = 'cl-body'
    body.textContent = explanation
    this.card.appendChild(body)

    // Completed follow-up turns, oldest first, under the original explanation.
    for (const turn of opts.thread ?? []) {
      const q = document.createElement('div')
      q.className = 'cl-q'
      q.textContent = turn.question
      this.card.appendChild(q)
      const a = document.createElement('div')
      a.className = 'cl-body cl-a'
      a.textContent = turn.answer
      this.card.appendChild(a)
    }

    const actions = document.createElement('div')
    actions.className = 'cl-actions'
    const copy = document.createElement('button')
    copy.className = 'cl-btn'
    copy.textContent = 'Copy'
    copy.addEventListener('click', () => {
      // Copy the whole thread when there is one, not just the first answer.
      const thread = (opts.thread ?? [])
        .map((t) => `\n\nQ: ${t.question}\nA: ${t.answer}`)
        .join('')
      void navigator.clipboard.writeText(explanation + thread).then(() => {
        copy.textContent = 'Copied'
        setTimeout(() => (copy.textContent = 'Copy'), 1200)
      })
    })
    actions.appendChild(copy)

    // Concise/Detailed segmented toggle; the current length is highlighted and
    // inert, the other re-explains the same term at that length.
    if (opts.verbosity && opts.onToggleVerbosity) {
      const seg = document.createElement('div')
      seg.className = 'cl-seg'
      for (const v of ['concise', 'detailed'] as const) {
        const btn = document.createElement('button')
        btn.className = 'cl-btn'
        btn.textContent = v === 'concise' ? 'Concise' : 'Detailed'
        if (v === opts.verbosity) btn.disabled = true
        else btn.addEventListener('click', () => opts.onToggleVerbosity!(v))
        seg.appendChild(btn)
      }
      actions.appendChild(seg)
    }

    this.card.appendChild(actions)

    // Real provider-reported token counts (never estimated); omitted when the
    // endpoint sends no usage. Cumulative across the popup's thread.
    if (opts.usage) {
      const meta = document.createElement('div')
      meta.className = 'cl-usage'
      const fmt = (n: number) => n.toLocaleString('en-US')
      meta.textContent = `↑ ${fmt(opts.usage.inputTokens)} in · ↓ ${fmt(opts.usage.outputTokens)} out`
      this.card.appendChild(meta)
    }

    // Follow-up input. The content script owns the thread state and the cap.
    if (opts.onFollowUp) {
      const ask = document.createElement('div')
      ask.className = 'cl-ask'
      const input = document.createElement('input')
      input.placeholder = 'Ask a follow-up…'
      const send = document.createElement('button')
      send.className = 'cl-btn'
      send.textContent = 'Ask'
      const submit = () => {
        const question = input.value.trim()
        if (!question) return
        input.value = ''
        opts.onFollowUp!(question)
      }
      send.addEventListener('click', submit)
      input.addEventListener('keydown', (e) => {
        // isComposing: Enter that confirms an IME candidate (CJK input) must
        // not submit a half-composed question.
        if (e.key === 'Enter' && !e.isComposing) submit()
        // Keep page-level shortcuts from firing while typing in the popup.
        e.stopPropagation()
      })
      ask.appendChild(input)
      ask.appendChild(send)
      this.card.appendChild(ask)
    }

    // After a follow-up completes the card re-renders from state; keep the
    // just-answered turn in view instead of snapping back to the top.
    if (opts.thread?.length) this.card.scrollTop = this.card.scrollHeight
  }

  /** Append a follow-up question and an (initially empty) streaming answer body
   *  below the existing thread, keeping the card content. appendDelta grows it. */
  beginFollowUpStream(question: string): void {
    // Remove the input row (blocks a second concurrent question) and any stale
    // inline error; the full card is re-rendered from state when the result
    // lands, which restores them.
    this.card.querySelector('.cl-ask')?.remove()
    this.card.querySelector('.cl-followup-error')?.remove()
    const q = document.createElement('div')
    q.className = 'cl-q'
    q.textContent = question
    this.card.appendChild(q)
    const a = document.createElement('div')
    a.className = 'cl-body cl-a cl-streaming'
    this.card.appendChild(a)
    this.streamBody = a
    this.card.scrollTop = this.card.scrollHeight
  }

  /** Inline typed error under the thread (a follow-up failing must not wipe the
   *  card); key errors keep their settings shortcut like the first-turn path. */
  showFollowUpError(error: ExplainError, onOpenSettings?: () => void): void {
    this.streamBody = null
    const err = document.createElement('div')
    err.className = 'cl-followup-error'
    err.textContent = errorText(error)
    this.card.appendChild(err)
    if (FIXABLE_IN_SETTINGS.has(error.kind) && onOpenSettings) {
      const btn = document.createElement('button')
      btn.className = 'cl-btn'
      btn.style.marginTop = '6px'
      btn.textContent = 'Open settings'
      btn.addEventListener('click', onOpenSettings)
      this.card.appendChild(btn)
    }
  }

  renderError(term: string, error: ExplainError, onOpenSettings?: () => void): void {
    this.streamBody = null
    this.card.replaceChildren()
    this.card.appendChild(this.termLine(term))

    const err = document.createElement('div')
    err.className = 'cl-error'
    err.textContent = errorText(error)
    this.card.appendChild(err)

    if (FIXABLE_IN_SETTINGS.has(error.kind) && onOpenSettings) {
      const actions = document.createElement('div')
      actions.className = 'cl-actions'
      const btn = document.createElement('button')
      btn.className = 'cl-btn'
      btn.textContent = 'Open settings'
      btn.addEventListener('click', onOpenSettings)
      actions.appendChild(btn)
      this.card.appendChild(actions)
    }
  }

  private termLine(term: string): HTMLElement {
    const el = document.createElement('div')
    el.className = 'cl-term'
    const bold = document.createElement('b')
    bold.textContent = term
    // Built with DOM APIs (no innerHTML) so the popup survives strict
    // Trusted-Types pages like x.com and github.com.
    el.append('Linglens · ', bold)
    return el
  }
}
