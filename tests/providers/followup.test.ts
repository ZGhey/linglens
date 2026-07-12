import { describe, it, expect, vi } from 'vitest'
import { getProvider } from '@/providers'
import type { PromptPayload } from '@/pipeline/types'

// Follow-up threads must reach each wire as a properly-shaped multi-turn
// conversation, not a flattened prompt.

const payload: PromptPayload = {
  summary: { title: 'Doc', outline: ['A'], topic: 'about runners' },
  localContext: { heading: 'A', text: 'a runner runs jobs' },
  term: 'runner',
  targetLang: 'Chinese',
  verbosity: 'concise',
  followUp: {
    explanation: 'runners execute jobs',
    turns: [{ question: 'q1', answer: 'a1' }],
    question: 'q2',
  },
}

const openaiOk = new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), {
  status: 200,
})
const anthropicOk = new Response(JSON.stringify({ content: [{ text: 'x' }] }), { status: 200 })
const geminiOk = new Response(
  JSON.stringify({ candidates: [{ content: { parts: [{ text: 'x' }] } }] }),
  { status: 200 },
)

describe('follow-up request shapes', () => {
  it('openai wire: system + alternating user/assistant turns', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(openaiOk)
    await getProvider('openai').explain(payload, { apiKey: 'sk', model: 'm', fetchImpl })
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
    ])
    expect(body.messages[2].content).toBe('runners execute jobs')
    expect(body.messages[5].content).toContain('q2')
  })

  it('anthropic wire: system field + alternating messages', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(anthropicOk)
    await getProvider('anthropic').explain(payload, { apiKey: 'sk', model: 'm', fetchImpl })
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.system).toBeTruthy()
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
    ])
  })

  it('gemini wire: assistant turns become role "model"', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(geminiOk)
    await getProvider('gemini').explain(payload, { apiKey: 'sk', model: 'm', fetchImpl })
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual([
      'user',
      'model',
      'user',
      'model',
      'user',
    ])
    expect(body.contents[4].parts[0].text).toContain('q2')
  })
})
