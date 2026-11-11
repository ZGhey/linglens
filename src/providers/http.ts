import { ProviderError, type ProviderConfig } from './types'
import { errorFromStatus } from './errors'

// The request preamble shared by the buffered (call.ts) and streaming (stream.ts)
// paths: missing-key guard, injectable fetch, abort signal, network-error and
// HTTP-status mapping. Both consume the returned OK Response differently (parse
// JSON vs read the SSE body), so only the lead-in is shared here.

/** Send the built request and return the OK Response, or throw a typed
 * ProviderError (missing-key / network / mapped HTTP status). */
export async function sendProviderRequest(
  config: ProviderConfig,
  buildRequest: (config: ProviderConfig) => { url: string; init: RequestInit },
  mapError: ((status: number, body: string) => ProviderError) | undefined,
  buildFallbackRequest?: (config: ProviderConfig) => { url: string; init: RequestInit },
): Promise<Response> {
  if (!config.apiKey.trim()) {
    throw new ProviderError('missing-key', 'No API key set. Add one in Linglens settings.')
  }
  const doFetch = config.fetchImpl ?? fetch
  const send = async (build: typeof buildRequest): Promise<Response> => {
    const { url, init } = build(config)
    try {
      return await doFetch(url, { ...init, signal: config.signal })
    } catch {
      throw new ProviderError('network', 'Could not reach the provider. Check your connection.')
    }
  }

  const toError = mapError ?? errorFromStatus
  let res = await send(buildRequest)
  // A 400 can mean a model doesn't accept one of our optional tuning fields
  // (temperature, reasoning/thinking effort) — vendors change these per model.
  // Retry once with the plain request rather than break the provider; a 400
  // that names the key (Gemini's bad-key response) is final.
  if (res.status === 400 && buildFallbackRequest) {
    const body = await res.text().catch(() => '')
    const err = toError(400, body)
    if (err.kind === 'invalid-key') throw err
    res = await send(buildFallbackRequest)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw toError(res.status, body)
  }
  return res
}
