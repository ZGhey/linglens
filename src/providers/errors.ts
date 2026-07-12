import { ProviderError } from './types'

// Shared HTTP-status -> typed-error mapping, so every adapter surfaces the same
// user-facing error kinds. Provider-specific quirks (e.g. Gemini's 400-for-bad-key)
// layer on top of this.
export function errorFromStatus(status: number): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError('invalid-key', 'Your API key was rejected. Check it in Linglens settings.')
  }
  if (status === 429) {
    return new ProviderError('rate-limited', 'Rate limited by the provider. Wait a moment and try again.')
  }
  return new ProviderError('unknown', `Provider returned an unexpected error (HTTP ${status}).`)
}
