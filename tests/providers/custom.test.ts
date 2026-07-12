import { describe, it, expect, vi } from 'vitest'
import { getProvider } from '@/providers'
import type { PromptPayload } from '@/pipeline/types'

const payload: PromptPayload = {
  summary: { title: 'Doc', outline: ['A'], topic: 'about runners' },
  localContext: { heading: 'A', text: 'a runner runs jobs' },
  term: 'runner',
  targetLang: 'Chinese',
  verbosity: 'concise',
}

const ok = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })

function sse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder()
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

const frame = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`

describe('custom (OpenAI-compatible) provider', () => {
  it('posts to the user-supplied base URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok('local answer'))
    const out = await getProvider('custom').explain(payload, {
      apiKey: 'sk-any',
      model: 'llama-3',
      baseUrl: 'http://localhost:1234/v1',
      fetchImpl,
    })
    expect(out.text).toBe('local answer')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:1234/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer sk-any')
    expect(JSON.parse(init.body).model).toBe('llama-3')
  })

  it('normalizes a trailing slash on the base URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok('ok'))
    await getProvider('custom').explain(payload, {
      apiKey: 'sk',
      model: 'm',
      baseUrl: 'http://localhost:1234/v1/',
      fetchImpl,
    })
    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:1234/v1/chat/completions')
  })

  it('rejects with a clear error when no base URL is set', async () => {
    const fetchImpl = vi.fn()
    await expect(
      getProvider('custom').explain(payload, { apiKey: 'sk', model: 'm', fetchImpl }),
    ).rejects.toMatchObject({ kind: 'unknown' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('custom provider streaming', () => {
  const cfg = (fetchImpl: typeof fetch) => ({
    apiKey: 'sk',
    model: 'llama-3',
    baseUrl: 'http://localhost:1234/v1',
    fetchImpl,
  })

  it('streams token deltas when the endpoint returns SSE', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sse([frame('Hel'), frame('lo'), 'data: [DONE]\n\n']))
    const deltas: string[] = []
    const out = await getProvider('custom').explainStream(payload, cfg(fetchImpl), (d) => deltas.push(d))
    expect(deltas).toEqual(['Hel', 'lo'])
    expect(out.text).toBe('Hello')
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).stream).toBe(true)
  })

  it('buffers in place when the endpoint ignores stream (single request, no double-bill)', async () => {
    // The stream request gets a plain-JSON answer; it is reused, not re-fetched.
    const fetchImpl = vi.fn().mockResolvedValue(ok('buffered answer'))
    const deltas: string[] = []
    const out = await getProvider('custom').explainStream(payload, cfg(fetchImpl), (d) => deltas.push(d))
    expect(out.text).toBe('buffered answer')
    expect(deltas).toEqual(['buffered answer'])
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
