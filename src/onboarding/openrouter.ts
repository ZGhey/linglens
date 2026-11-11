// One-click "Connect OpenRouter" via OpenRouter's OAuth PKCE flow. The user
// signs in on openrouter.ai and approves; OpenRouter mints a key billed to the
// user's own account and redirects to our callback URL with a one-time code,
// which we exchange (with the PKCE verifier) for the key. The user never copies
// a key.
//
// The callback is the project's public homepage (OpenRouter shows it as the
// app's identity). The worker watches tab navigations for it, so no extra
// permission is needed. The code is useless without the verifier, which never
// leaves the extension.

import { t } from '@/i18n'

export const OPENROUTER_AUTH_URL = 'https://openrouter.ai/auth'
export const OPENROUTER_EXCHANGE_URL = 'https://openrouter.ai/api/v1/auth/keys'
export const OPENROUTER_KEY_INFO_URL = 'https://openrouter.ai/api/v1/key'
export const OPENROUTER_CALLBACK_BASE = 'https://github.com/ZGhey/linglens'

/** Default model after connecting: routes to OpenRouter's free models, so a
 *  new account with no credits works immediately. */
export const OPENROUTER_DEFAULT_MODEL = 'openrouter/free'

/** Query parameter on the callback URL that carries our per-attempt state. */
const STATE_PARAM = 'linglens_oauth'

/** Codes expire 10 minutes after issuance; a pending attempt older than that
 *  can't succeed. */
export const PENDING_TTL_MS = 10 * 60 * 1000

export interface PendingAuth {
  state: string
  verifier: string
  /** Tab showing openrouter.ai, closed once the callback arrives. */
  authTabId?: number
  /** Tab to bring back to the front afterwards (the settings page). */
  openerTabId?: number
  startedAt: number
}

function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomToken(byteLength: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

/** S256 code challenge for a verifier: base64url(SHA-256(verifier)). */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

/** Fresh PKCE verifier (43 chars, base64url) and an unguessable state. */
export function newPendingAuth(now: number): PendingAuth {
  return { state: randomToken(16), verifier: randomToken(32), startedAt: now }
}

export function callbackUrl(state: string): string {
  return `${OPENROUTER_CALLBACK_BASE}?${STATE_PARAM}=${encodeURIComponent(state)}`
}

export async function authUrl(pending: PendingAuth): Promise<string> {
  const params = new URLSearchParams({
    callback_url: callbackUrl(pending.state),
    code_challenge: await codeChallenge(pending.verifier),
    code_challenge_method: 'S256',
    // Also sent as OpenRouter's own `state`, echoed on the callback, in case
    // our query parameter doesn't survive the redirect.
    state: pending.state,
    key_label: 'Linglens',
  })
  return `${OPENROUTER_AUTH_URL}?${params}`
}

/**
 * The authorization code from a navigation to our callback for this attempt,
 * or null when the URL isn't that callback (any other page, another attempt's
 * state, an expired attempt).
 */
export function codeFromCallback(url: string, pending: PendingAuth, now: number): string | null {
  if (now - pending.startedAt > PENDING_TTL_MS) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const base = new URL(OPENROUTER_CALLBACK_BASE)
  if (parsed.origin !== base.origin || parsed.pathname.replace(/\/$/, '') !== base.pathname) return null
  // Read parameters from the raw query rather than URLSearchParams: if the
  // code is appended with a second '?' (".../linglens?linglens_oauth=s?code=c")
  // URLSearchParams would fold it into the state's value.
  const params = (name: string) =>
    [...parsed.search.matchAll(new RegExp(`[?&]${name}=([^&?#]*)`, 'g'))].map((m) =>
      safeDecode(m[1]),
    )
  const states = [...params(STATE_PARAM), ...params('state')]
  if (!states.includes(pending.state)) return null
  return params('code').find(Boolean) ?? null
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export class OpenRouterAuthError extends Error {}

/** Exchange the code (+ verifier) for the user's key. */
export async function exchangeCode(
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  let res: Response
  try {
    res = await fetchImpl(OPENROUTER_EXCHANGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
    })
  } catch {
    throw new OpenRouterAuthError(t('openRouterUnreachable'))
  }
  if (res.status === 403) {
    throw new OpenRouterAuthError(t('openRouterExpired'))
  }
  if (!res.ok) {
    throw new OpenRouterAuthError(t('openRouterHttpError', { status: res.status }))
  }
  const body = (await res.json().catch(() => null)) as { key?: unknown } | null
  if (typeof body?.key !== 'string' || !body.key) {
    throw new OpenRouterAuthError(t('openRouterNoKey'))
  }
  return body.key
}

export interface OpenRouterKeyInfo {
  /** True when the account has never bought credits. */
  isFreeTier: boolean
  /** Free-model requests left today, when reported. */
  freeRequestsRemaining: number | null
}

/** Key status without generating text (GET /api/v1/key). */
export async function fetchKeyInfo(
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OpenRouterKeyInfo | null> {
  try {
    const res = await fetchImpl(OPENROUTER_KEY_INFO_URL, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) return null
    const data = ((await res.json()) as { data?: Record<string, unknown> }).data ?? {}
    const daily = data.free_model_daily_requests as { remaining?: unknown } | undefined
    return {
      isFreeTier: data.is_free_tier === true,
      freeRequestsRemaining: typeof daily?.remaining === 'number' ? daily.remaining : null,
    }
  } catch {
    return null
  }
}
