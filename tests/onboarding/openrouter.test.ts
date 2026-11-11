import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  PENDING_TTL_MS,
  authUrl,
  callbackUrl,
  codeChallenge,
  codeFromCallback,
  exchangeCode,
  fetchKeyInfo,
  newPendingAuth,
  OpenRouterAuthError,
} from '@/onboarding/openrouter'

describe('PKCE', () => {
  it('computes the S256 challenge: base64url(SHA-256(verifier)), unpadded', async () => {
    const verifier = 'dBjftJeZ4CVP-mJ92IZ1gr4KZbGx-Mlk9vBc5hAxa0g'
    const expected = createHash('sha256').update(verifier).digest('base64url')
    expect(await codeChallenge(verifier)).toBe(expected)
    expect(expected).not.toMatch(/[+/=]/)
  })

  it('creates fresh verifier and state each time', () => {
    const a = newPendingAuth(0)
    const b = newPendingAuth(0)
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a.verifier).not.toBe(b.verifier)
    expect(a.state).not.toBe(b.state)
  })

  it('builds the auth URL with callback and challenge, never the verifier', async () => {
    const pending = newPendingAuth(0)
    const url = new URL(await authUrl(pending))
    expect(url.origin + url.pathname).toBe('https://openrouter.ai/auth')
    expect(url.searchParams.get('callback_url')).toBe(callbackUrl(pending.state))
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBe(pending.state)
    expect(url.toString()).not.toContain(pending.verifier)
  })
})

describe('codeFromCallback', () => {
  const pending = { state: 'st8', verifier: 'v', startedAt: 1000 }

  it('extracts the code from our callback for this attempt', () => {
    expect(codeFromCallback(`${callbackUrl('st8')}&code=abc`, pending, 2000)).toBe('abc')
  })

  it('accepts the code however OpenRouter appends it, and state from either place', () => {
    expect(codeFromCallback(`${callbackUrl('st8')}?code=abc`, pending, 2000)).toBe('abc')
    expect(
      codeFromCallback('https://github.com/ZGhey/linglens?linglens_oauth=x&state=st8&code=abc', pending, 2000),
    ).toBe('abc')
    expect(codeFromCallback('https://github.com/ZGhey/linglens/?state=st8&code=a%2Bb', pending, 2000)).toBe('a+b')
  })

  it('ignores other pages, other states, missing codes and expired attempts', () => {
    expect(codeFromCallback('https://github.com/other/repo?linglens_oauth=st8&code=abc', pending, 2000)).toBeNull()
    expect(codeFromCallback(`${callbackUrl('other')}&code=abc`, pending, 2000)).toBeNull()
    expect(codeFromCallback(callbackUrl('st8'), pending, 2000)).toBeNull()
    expect(codeFromCallback(`${callbackUrl('st8')}&code=abc`, pending, 1000 + PENDING_TTL_MS + 1)).toBeNull()
    expect(codeFromCallback('https://evil.test/ZGhey/linglens?linglens_oauth=st8&code=abc', pending, 2000)).toBeNull()
  })
})

describe('exchangeCode', () => {
  it('posts code + verifier and returns the key', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ key: 'sk-or-v1-x' }))) as unknown as typeof fetch
    expect(await exchangeCode('c', 'v', fetchImpl)).toBe('sk-or-v1-x')
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      code: 'c',
      code_verifier: 'v',
      code_challenge_method: 'S256',
    })
  })

  it('maps a rejected or expired code to a retry message', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 403 })) as unknown as typeof fetch
    await expect(exchangeCode('c', 'v', fetchImpl)).rejects.toBeInstanceOf(OpenRouterAuthError)
  })
})

describe('fetchKeyInfo', () => {
  it('reads free-tier status and remaining free requests', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { is_free_tier: true, free_model_daily_requests: { used: 3, limit: 50, remaining: 47 } },
          }),
        ),
    ) as unknown as typeof fetch
    expect(await fetchKeyInfo('k', fetchImpl)).toEqual({ isFreeTier: true, freeRequestsRemaining: 47 })
  })

  it('returns null on failure', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 })) as unknown as typeof fetch
    expect(await fetchKeyInfo('k', fetchImpl)).toBeNull()
  })
})
