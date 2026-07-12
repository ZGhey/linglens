import { ProviderError, type ExplainResult, type ProviderConfig, type TokenUsage } from './types'
import { sendProviderRequest } from './http'

// Buffered request/response plumbing for every adapter. Each adapter supplies
// only what actually differs — how to build the request and how to pull the text
// out of the response (plus an optional provider-specific error mapper). The
// shared request lead-in (guard, fetch, error mapping) lives in http.ts.

export interface ProviderCall {
  /** Build the endpoint + request init from the resolved config. */
  buildRequest: (config: ProviderConfig) => { url: string; init: RequestInit }
  /** Pull the explanation text out of the parsed JSON response. */
  extractText: (data: unknown) => string | undefined
  /** Pull the provider-reported token usage out of the response, if present. */
  extractUsage?: (data: unknown) => TokenUsage | undefined
  /** Optional provider-specific status->error mapping (defaults to errorFromStatus). */
  mapError?: (status: number, body: string) => ProviderError
}

export async function callProvider(
  config: ProviderConfig,
  call: ProviderCall,
): Promise<ExplainResult> {
  const res = await sendProviderRequest(config, call.buildRequest, call.mapError)
  const data = (await res.json()) as unknown
  const text = call.extractText(data)?.trim()
  if (!text) throw new ProviderError('unknown', 'The provider returned an empty response.')
  return { text, usage: call.extractUsage?.(data) }
}
