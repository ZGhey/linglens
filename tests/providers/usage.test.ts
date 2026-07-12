import { describe, it, expect, vi } from 'vitest'
import { getProvider } from '@/providers'
import type { PromptPayload } from '@/pipeline/types'

// Token-usage extraction across wires: real provider-reported numbers surface
// on ExplainResult.usage; endpoints that send none yield undefined.

const payload: PromptPayload = {
  summary: { title: 'Doc', outline: ['A'], topic: 'about runners' },
  localContext: { heading: 'A', text: 'a runner runs jobs' },
  term: 'runner',
  targetLang: 'Chinese',
  verbosity: 'concise',
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

function sse(frames: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder()
      for (const f of frames) controller.enqueue(enc.encode(f))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

describe('buffered usage extraction', () => {
  it('openai wire maps prompt/completion tokens', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({
        choices: [{ message: { content: 'x' } }],
        usage: { prompt_tokens: 1240, completion_tokens: 340 },
      }),
    )
    const out = await getProvider('openai').explain(payload, { apiKey: 'sk', model: 'm', fetchImpl })
    expect(out.usage).toEqual({ inputTokens: 1240, outputTokens: 340 })
  })

  it('anthropic wire maps input/output tokens', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({ content: [{ text: 'x' }], usage: { input_tokens: 900, output_tokens: 120 } }),
    )
    const out = await getProvider('anthropic').explain(payload, { apiKey: 'sk', model: 'm', fetchImpl })
    expect(out.usage).toEqual({ inputTokens: 900, outputTokens: 120 })
  })

  it('gemini wire maps usageMetadata counts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({
        candidates: [{ content: { parts: [{ text: 'x' }] } }],
        usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 90 },
      }),
    )
    const out = await getProvider('gemini').explain(payload, { apiKey: 'sk', model: 'm', fetchImpl })
    expect(out.usage).toEqual({ inputTokens: 800, outputTokens: 90 })
  })

  it('yields undefined usage when the endpoint reports none', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ choices: [{ message: { content: 'x' } }] }))
    const out = await getProvider('openai').explain(payload, { apiKey: 'sk', model: 'm', fetchImpl })
    expect(out.usage).toBeUndefined()
  })
})

describe('streaming usage extraction', () => {
  it('openai stream requests include_usage and read the final-chunk usage', async () => {
    const frames = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hi' } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 50, completion_tokens: 7 } })}\n\n`,
      'data: [DONE]\n\n',
    ]
    const fetchImpl = vi.fn().mockResolvedValue(sse(frames))
    const out = await getProvider('openai').explainStream(payload, { apiKey: 'sk', model: 'm', fetchImpl }, () => {})
    expect(out.text).toBe('Hi')
    expect(out.usage).toEqual({ inputTokens: 50, outputTokens: 7 })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).stream_options).toEqual({ include_usage: true })
  })

  it('anthropic stream merges input from message_start with output from message_delta', async () => {
    const frames = [
      `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 60, output_tokens: 1 } } })}\n\n`,
      `data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: 'Hey' } })}\n\n`,
      `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 9 } })}\n\n`,
    ]
    const fetchImpl = vi.fn().mockResolvedValue(sse(frames))
    const out = await getProvider('anthropic').explainStream(payload, { apiKey: 'sk', model: 'm', fetchImpl }, () => {})
    expect(out.text).toBe('Hey')
    expect(out.usage).toEqual({ inputTokens: 60, outputTokens: 9 })
  })
})
