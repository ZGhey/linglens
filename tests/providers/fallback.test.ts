import { describe, expect, it, vi } from 'vitest'
import { STREAM_WIRES, WIRES } from '@/providers/wire'
import { streamProvider } from '@/providers/stream'
import { callProvider } from '@/providers/call'
import type { PromptPayload } from '@/pipeline/types'

const payload: PromptPayload = {
  summary: { title: 'T', outline: [], topic: '' },
  localContext: { heading: null, text: 'ctx' },
  term: 'term',
  targetLang: 'English',
  verbosity: 'concise',
}

function sse(text: string): Response {
  const body = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

describe('retry without tuning fields on HTTP 400', () => {
  it('streams: a rejected tuning field costs one retry, not a broken provider', async () => {
    const bodies: Record<string, unknown>[] = []
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string))
      return bodies.length === 1
        ? new Response('{"error":{"message":"Unsupported parameter: reasoning_effort"}}', { status: 400 })
        : sse('ok')
    }) as unknown as typeof fetch
    const spec = STREAM_WIRES.openai('https://api.test/v1', payload)
    const out = await streamProvider({ apiKey: 'k', model: 'gpt-6-luna', fetchImpl }, spec, () => {})
    expect(out.text).toBe('ok')
    expect(bodies[0]).toMatchObject({ reasoning_effort: 'none' })
    expect(bodies[1]).not.toHaveProperty('reasoning_effort')
    expect(bodies[1]).not.toHaveProperty('temperature')
    expect(bodies[1]).toMatchObject({ model: 'gpt-6-luna', stream: true })
  })

  it('buffered Gemini: retries without generationConfig', async () => {
    const bodies: Record<string, unknown>[] = []
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string))
      return bodies.length === 1
        ? new Response('{"error":{"message":"Invalid JSON payload: thinkingLevel"}}', { status: 400 })
        : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }))
    }) as unknown as typeof fetch
    const call = WIRES.gemini('https://g.test/v1beta/models', payload)
    const out = await callProvider({ apiKey: 'k', model: 'gemini-3.6-flash', fetchImpl }, call)
    expect(out.text).toBe('ok')
    expect(bodies[0]).toHaveProperty('generationConfig')
    expect(bodies[1]).not.toHaveProperty('generationConfig')
  })

  it('a second 400 surfaces as the usual error (one retry only)', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 400 })) as unknown as typeof fetch
    const spec = STREAM_WIRES.anthropic('https://a.test', payload)
    await expect(
      streamProvider({ apiKey: 'k', model: 'claude-haiku-5-5', fetchImpl }, spec, () => {}),
    ).rejects.toMatchObject({ kind: 'unknown' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
