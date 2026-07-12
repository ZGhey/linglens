import { ProviderError, type ExplainResult, type ProviderConfig, type TokenUsage } from './types'
import { sendProviderRequest } from './http'

// Streaming counterpart to call.ts. Given a stream spec (how to build the
// stream-enabled request + how to pull a token delta out of one SSE event), it
// POSTs, reads the Server-Sent-Events body, and invokes onDelta for each token
// while accumulating the full text. Shared plumbing (missing-key guard, fetch
// injection, HTTP/network error mapping) mirrors call.ts so the two can't drift.

export interface StreamSpec {
  /** Build the stream-enabled endpoint + request init from the resolved config. */
  buildRequest: (config: ProviderConfig) => { url: string; init: RequestInit }
  /** Pull the token delta (if any) out of one parsed SSE `data:` JSON object. */
  parseEvent: (data: unknown) => string | undefined
  /** Pull token-usage fields out of one SSE event. Providers report usage in
   * different events (or split across them), so partials are merged across the
   * stream with later values winning per field. */
  parseUsage?: (data: unknown) => Partial<TokenUsage> | undefined
  /** Pull the full text out of a buffered JSON response — used when an endpoint
   * ignores `stream: true` and answers with a normal body (see below). */
  extractText: (data: unknown) => string | undefined
  /** Pull usage out of a buffered JSON response. */
  extractUsage?: (data: unknown) => TokenUsage | undefined
  /** Optional provider-specific status->error mapping (defaults to errorFromStatus). */
  mapError?: (status: number, body: string) => ProviderError
}

export async function streamProvider(
  config: ProviderConfig,
  spec: StreamSpec,
  onDelta: (delta: string) => void,
): Promise<ExplainResult> {
  const res = await sendProviderRequest(config, spec.buildRequest, spec.mapError)

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream') || !res.body) {
    // Endpoint ignored `stream: true` and answered with a normal body. Parse THIS
    // response as buffered — never a second request, which would double-bill the
    // already-consumed tokens — and emit the whole thing as one delta.
    const data = (await res.json().catch(() => undefined)) as unknown
    const text = spec.extractText(data)?.trim()
    if (!text) throw new ProviderError('unknown', 'The provider returned an empty response.')
    onDelta(text)
    return { text, usage: spec.extractUsage?.(data) }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  const usage: Partial<TokenUsage> = {}

  const flushLine = (line: string): void => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const data = trimmed.slice(5).trim()
    if (!data || data === '[DONE]') return
    let json: unknown
    try {
      json = JSON.parse(data)
    } catch {
      return // Ignore keep-alive comments / partial frames.
    }
    const delta = spec.parseEvent(json)
    if (delta) {
      full += delta
      onDelta(delta)
    }
    const u = spec.parseUsage?.(json)
    if (u?.inputTokens !== undefined) usage.inputTokens = u.inputTokens
    if (u?.outputTokens !== undefined) usage.outputTokens = u.outputTokens
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        flushLine(buffer.slice(0, nl))
        buffer = buffer.slice(nl + 1)
      }
    }
  } catch (err) {
    // A user-initiated abort just stops the stream; anything else is a genuine
    // mid-stream connection drop, mapped like the buffered path's network error.
    if (config.signal?.aborted) throw err
    throw new ProviderError('network', 'Lost connection to the provider mid-stream.')
  }
  if (buffer) flushLine(buffer)

  const text = full.trim()
  if (!text) {
    throw new ProviderError('unknown', 'The provider returned an empty response.')
  }
  return {
    text,
    usage:
      usage.inputTokens !== undefined && usage.outputTokens !== undefined
        ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
        : undefined,
  }
}
