import { describe, it, expect, vi } from 'vitest'
import { streamProvider, type StreamSpec } from '@/providers/stream'
import type { ProviderConfig } from '@/providers/types'

// An OpenAI-shaped stream spec, mirroring the real openai wire.
const spec: StreamSpec = {
  buildRequest: (c) => ({
    url: 'https://api.test/v1/chat/completions',
    init: { method: 'POST', headers: { Authorization: `Bearer ${c.apiKey}` } },
  }),
  parseEvent: (d) => (d as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content,
  extractText: (d) => (d as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content,
}

/** A Response whose body streams the given text as bytes, one chunk per entry. */
function sseResponse(chunks: string[], contentType = 'text/event-stream'): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder()
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': contentType } })
}

const cfg = (fetchImpl: typeof fetch): ProviderConfig => ({ apiKey: 'sk', model: 'm', fetchImpl })

const frame = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`

describe('streamProvider', () => {
  it('emits a delta per SSE event and returns the accumulated text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse([frame('Hel'), frame('lo'), 'data: [DONE]\n\n']))
    const deltas: string[] = []
    const out = await streamProvider(cfg(fetchImpl), spec, (d) => deltas.push(d))
    expect(deltas).toEqual(['Hel', 'lo'])
    expect(out.text).toBe('Hello')
  })

  it('handles a frame split across read chunks', async () => {
    const f = frame('split')
    const mid = Math.floor(f.length / 2)
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse([f.slice(0, mid), f.slice(mid)]))
    const out = await streamProvider(cfg(fetchImpl), spec, () => {})
    expect(out.text).toBe('split')
  })

  it('trims surrounding whitespace from the accumulated text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse([frame('  spaced  ')]))
    const out = await streamProvider(cfg(fetchImpl), spec, () => {})
    expect(out.text).toBe('spaced')
  })

  it('maps a mid-stream connection drop to a network error', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(frame('partial')))
        controller.error(new Error('connection dropped'))
      },
    })
    const res = new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    const fetchImpl = vi.fn().mockResolvedValue(res)
    await expect(streamProvider(cfg(fetchImpl), spec, () => {})).rejects.toMatchObject({ kind: 'network' })
  })

  it('buffers a non-event-stream response in place (one request, one delta)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'buffered' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const deltas: string[] = []
    const out = await streamProvider(cfg(fetchImpl), spec, (d) => deltas.push(d))
    expect(out.text).toBe('buffered')
    expect(deltas).toEqual(['buffered'])
    // No second request — the endpoint's own response is reused, not re-fetched.
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('maps HTTP errors like the buffered path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }))
    await expect(streamProvider(cfg(fetchImpl), spec, () => {})).rejects.toMatchObject({ kind: 'invalid-key' })
  })

  it('guards a missing key before fetching', async () => {
    const fetchImpl = vi.fn()
    await expect(
      streamProvider({ apiKey: ' ', model: 'm', fetchImpl }, spec, () => {}),
    ).rejects.toMatchObject({ kind: 'missing-key' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
