import type { ErrorKind } from '@/messaging/types'
import type { PromptPayload } from '@/pipeline/types'

export type ProviderId = 'openai' | 'deepseek' | 'gemini' | 'anthropic' | 'custom'

export interface ProviderConfig {
  apiKey: string
  model: string
  /** Endpoint base URL. Omitted for built-in providers (they carry their own);
   * required for the user-configured `custom` provider. */
  baseUrl?: string
  /** Aborts the in-flight request (e.g. the user dismissed the popup mid-stream),
   * so an abandoned stream stops draining the provider instead of billing on. */
  signal?: AbortSignal
  /** Injectable fetch, for testing. Defaults to the global fetch. */
  fetchImpl?: typeof fetch
}

/** Token counts as reported by the provider's own usage accounting — real
 * numbers from the API response, never estimated locally. */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

/** What a provider call resolves with: the explanation text, plus usage when
 * the provider reported it (absent on endpoints that don't send usage). */
export interface ExplainResult {
  text: string
  usage?: TokenUsage
}

/** A provider-agnostic, user-surfaceable failure. Never swallowed by adapters. */
export class ProviderError extends Error {
  readonly kind: ErrorKind
  constructor(kind: ErrorKind, message: string) {
    super(message)
    this.name = 'ProviderError'
    this.kind = kind
  }
}

/**
 * The single internal provider interface. Adding a provider = adding one adapter
 * that implements this; nothing else in the app changes.
 */
export interface Provider {
  readonly id: ProviderId
  /** Buffered call: resolves with the whole explanation once. */
  explain(payload: PromptPayload, config: ProviderConfig): Promise<ExplainResult>
  /** Streaming call: invokes onDelta for each token and resolves with the full
   * text. Falls back to a single buffered emit if the endpoint can't stream. */
  explainStream(
    payload: PromptPayload,
    config: ProviderConfig,
    onDelta: (delta: string) => void,
  ): Promise<ExplainResult>
}
