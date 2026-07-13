// Message contract across the content-script <-> service-worker boundary.
// Kept in one place so every component agrees on the wire shape.

import type { FollowUpThread, Verbosity } from '@/pipeline/types'
import type { TokenUsage } from '@/providers/types'

export interface ExplainRequest {
  type: 'EXPLAIN'
  /** The term the user selected. */
  term: string
  /** Page URL, used as the per-page summary cache key. */
  url: string
  /** Full page HTML, extracted by the content script (browser has it already). */
  html: string
  /**
   * Text of the DOM block the selection sits in (nearest paragraph/heading),
   * captured from the live selection. Lets the pipeline pick the correct local
   * section even when the term occurs more than once in the document.
   */
  contextHint: string
  /** Per-explanation length override (popup toggle); falls back to the setting. */
  verbosity?: Verbosity
  /** Language override so a follow-up stays in the thread's language even if the
   * setting changed mid-session; falls back to the setting. */
  targetLang?: string
  /** Present when this is a follow-up question about an explanation the popup
   * already showed; carries the whole thread so the worker stays stateless. */
  followUp?: FollowUpThread
}

/** Canonical, user-facing error kinds surfaced from the pipeline/adapters. */
export type ErrorKind =
  | 'missing-key'
  | 'invalid-key'
  | 'rate-limited'
  | 'no-selection'
  | 'network'
  | 'unknown'

export interface ExplainError {
  kind: ErrorKind
  message: string
}

export type ExplainResponse =
  | {
      ok: true
      term: string
      explanation: string
      verbosity: Verbosity
      /** Language the explanation was written in; a follow-up echoes it back so
       * the thread stays in one language. */
      targetLang: string
      /** Document title from the summary, used by the history list. */
      title: string
      /** Provider-reported token counts; absent when the endpoint sends none. */
      usage?: TokenUsage
    }
  | { ok: false; error: ExplainError }

/** Name of the long-lived port the content script opens per EXPLAIN so the
 *  worker can stream token deltas back before the final result. */
export const EXPLAIN_PORT = 'linglens-explain'

/** Worker -> content, over the EXPLAIN port: incremental token deltas followed
 *  by exactly one final result (which carries the full text or a typed error). */
export type ExplainStreamMessage =
  | { type: 'delta'; text: string }
  | { type: 'result'; response: ExplainResponse }

/** Ask the worker to open the options page (content scripts can't do it directly). */
export interface OpenOptionsRequest {
  type: 'OPEN_OPTIONS'
}

/** Worker -> content: explain whatever the user currently has selected. Sent by
 *  the context-menu entry and the keyboard command. */
export interface TriggerSelectionRequest {
  type: 'TRIGGER_SELECTION'
}

export type Message = ExplainRequest | OpenOptionsRequest | TriggerSelectionRequest
