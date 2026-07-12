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
): Promise<Response> {
  if (!config.apiKey.trim()) {
    throw new ProviderError('missing-key', 'No API key set. Add one in Linglens settings.')
  }
  const doFetch = config.fetchImpl ?? fetch
  const { url, init } = buildRequest(config)

  let res: Response
  try {
    res = await doFetch(url, { ...init, signal: config.signal })
  } catch {
    throw new ProviderError('network', 'Could not reach the provider. Check your connection.')
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw (mapError ?? errorFromStatus)(res.status, body)
  }
  return res
}
