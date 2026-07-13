import { describe, it, expect, vi } from 'vitest'
import { geminiProvider } from '@/providers/gemini'
import { anthropicProvider } from '@/providers/anthropic'
import { getProvider } from '@/providers'
import type { PromptPayload } from '@/pipeline/types'

const payload: PromptPayload = {
  summary: { title: 'Doc', outline: ['A'], topic: 'about sinks' },
  localContext: { heading: 'A', text: 'a sink receives events' },
  term: 'sink',
  targetLang: 'Chinese',
  verbosity: 'concise',
}

const geminiOk = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 })

const anthropicOk = (text: string) =>
  new Response(JSON.stringify({ content: [{ text }] }), { status: 200 })

describe('registry', () => {
  it('resolves all three providers', () => {
    expect(getProvider('openai').id).toBe('openai')
    expect(getProvider('gemini').id).toBe('gemini')
    expect(getProvider('anthropic').id).toBe('anthropic')
  })
})

describe('geminiProvider', () => {
  it('sends model + key in the URL and parses the candidate text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(geminiOk('解释'))
    const out = await geminiProvider.explain(payload, { apiKey: 'g-key', model: 'gemini-2.5-flash', fetchImpl })
    expect(out.text).toBe('解释')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toContain('gemini-2.5-flash:generateContent')
    expect(url).toContain('key=g-key')
    const body = JSON.parse(init.body)
    expect(body.contents[0].parts[0].text).toContain('sink')
    expect(body.systemInstruction.parts[0].text).toBeTruthy()
  })

  it('maps a 400 API-key error to invalid-key', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('API key not valid', { status: 400 }))
    await expect(
      geminiProvider.explain(payload, { apiKey: 'bad', model: 'm', fetchImpl }),
    ).rejects.toMatchObject({ kind: 'invalid-key' })
  })

  it('maps 429 to rate-limited', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('slow', { status: 429 }))
    await expect(
      geminiProvider.explain(payload, { apiKey: 'g', model: 'm', fetchImpl }),
    ).rejects.toMatchObject({ kind: 'rate-limited' })
  })

  it('throws missing-key without fetching', async () => {
    const fetchImpl = vi.fn()
    await expect(
      geminiProvider.explain(payload, { apiKey: '', model: 'm', fetchImpl }),
    ).rejects.toMatchObject({ kind: 'missing-key' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('anthropicProvider', () => {
  it('sends x-api-key + version headers and parses content text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(anthropicOk('a grounded explanation'))
    const out = await anthropicProvider.explain(payload, {
      apiKey: 'sk-ant',
      model: 'claude-3-5-haiku-latest',
      fetchImpl,
    })
    expect(out.text).toBe('a grounded explanation')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('sk-ant')
    expect(init.headers['anthropic-version']).toBeTruthy()
    const body = JSON.parse(init.body)
    expect(body.model).toBe('claude-3-5-haiku-latest')
    expect(body.system).toBeTruthy()
    expect(body.messages[0].content).toContain('sink')
  })

  it('maps 401 to invalid-key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }))
    await expect(
      anthropicProvider.explain(payload, { apiKey: 'bad', model: 'm', fetchImpl }),
    ).rejects.toMatchObject({ kind: 'invalid-key' })
  })

  it('maps a fetch rejection to network', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(
      anthropicProvider.explain(payload, { apiKey: 'sk', model: 'm', fetchImpl }),
    ).rejects.toMatchObject({ kind: 'network' })
  })
})
