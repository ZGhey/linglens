import { describe, expect, it, vi } from 'vitest'
import { checkKeyByModels, chooseModel } from '@/onboarding/keycheck'

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('checkKeyByModels', () => {
  it('lists models with the provider-specific auth and never generates', async () => {
    const f = respond(200, { data: [{ id: 'claude-haiku-5-5' }] })
    expect(await checkKeyByModels('anthropic', ' sk-ant ', f)).toEqual({ ok: true, models: ['claude-haiku-5-5'] })
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(url)).toContain('/v1/models')
    expect((init as RequestInit).headers).toMatchObject({ 'x-api-key': 'sk-ant' })
  })

  it('maps rejected, throttled and unreachable', async () => {
    expect(await checkKeyByModels('openai', 'k', respond(401, {}))).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await checkKeyByModels('openai', 'k', respond(403, {}))).toMatchObject({ ok: false, reason: 'unverified' })
    expect(await checkKeyByModels('deepseek', 'k', respond(429, {}))).toMatchObject({ ok: false, reason: 'rate-limited' })
    const down = vi.fn(async () => {
      throw new TypeError('fail')
    }) as unknown as typeof fetch
    expect(await checkKeyByModels('openai', 'k', down)).toMatchObject({ ok: false, reason: 'network' })
  })
})

describe('chooseModel', () => {
  it('keeps an available current model, else picks the first available preset', () => {
    expect(chooseModel('gpt-6-luna', ['gpt-6-luna'], ['gpt-6-luna', 'x'])).toBe('gpt-6-luna')
    expect(chooseModel('gpt-4o', ['gpt-6-luna', 'gpt-6.1-sol'], ['gpt-6.1-sol'])).toBe('gpt-6.1-sol')
    expect(chooseModel('my-model', ['a'], ['b'])).toBe('my-model')
  })
})
