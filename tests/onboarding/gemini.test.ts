import { describe, expect, it, vi } from 'vitest'
import { checkGeminiKey, pickGeminiModel } from '@/onboarding/gemini'

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
}

describe('pickGeminiModel', () => {
  it('prefers the first available registry preset', () => {
    expect(
      pickGeminiModel(['models/gemini-9.0-flash', 'models/gemini-3.5-flash'], ['gemini-3.5-flash']),
    ).toBe('gemini-3.5-flash')
  })

  it('falls back to the newest stable Flash, skipping previews and Lite', () => {
    expect(
      pickGeminiModel(
        [
          'models/gemini-4.0-flash-lite',
          'models/gemini-3.9-flash',
          'models/gemini-4.0-flash',
          'models/gemini-5.0-flash-preview-01',
          'models/gemini-4.0-pro',
        ],
        ['gemini-1.0-flash'],
      ),
    ).toBe('gemini-4.0-flash')
  })

  it('uses Lite when it is the only stable Flash, then any Gemini, then the preset', () => {
    expect(pickGeminiModel(['models/gemini-4.0-flash-lite'], [])).toBe('gemini-4.0-flash-lite')
    expect(pickGeminiModel(['models/gemini-4.0-pro'], [])).toBe('gemini-4.0-pro')
    expect(pickGeminiModel([], ['gemini-3.5-flash'])).toBe('gemini-3.5-flash')
  })
})

describe('checkGeminiKey', () => {
  it('lists models (never generates) and returns the chosen model', async () => {
    const fetchImpl = respond(200, {
      models: [
        { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-9', supportedGenerationMethods: ['embedContent'] },
      ],
    })
    const result = await checkGeminiKey('  AIzaTEST  ', fetchImpl)
    expect(result).toEqual({ ok: true, model: 'gemini-3.5-flash' })
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(url)).toContain('/v1beta/models')
    expect(String(url)).not.toContain('generateContent')
    expect((init as RequestInit).headers).toEqual({ 'x-goog-api-key': 'AIzaTEST' })
  })

  it('reports an invalid key', async () => {
    const result = await checkGeminiKey(
      'bad',
      respond(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } }),
    )
    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('reports an unsupported region distinctly', async () => {
    const result = await checkGeminiKey(
      'k',
      respond(400, { error: { message: 'User location is not supported for the API use.' } }),
    )
    expect(result).toMatchObject({ ok: false, reason: 'region' })
  })

  it('accepts a rate-limited key with a note', async () => {
    const result = await checkGeminiKey('k', respond(429, { error: { message: 'Quota exceeded' } }))
    expect(result.ok).toBe(true)
    expect(result.ok && result.note).toMatch(/rate-limiting/)
  })

  it('reports network failures', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await checkGeminiKey('k', fetchImpl)).toMatchObject({ ok: false, reason: 'network' })
  })
})
