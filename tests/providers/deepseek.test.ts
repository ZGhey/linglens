import { describe, it, expect, vi } from 'vitest'
import { deepseekProvider } from '@/providers/deepseek'
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

describe('deepseekProvider', () => {
  it('is resolvable from the registry', () => {
    expect(getProvider('deepseek').id).toBe('deepseek')
  })

  it('posts to the DeepSeek endpoint with an OpenAI-shaped body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok('解释'))
    const out = await deepseekProvider.explain(payload, {
      apiKey: 'sk-ds',
      model: 'deepseek-v4-flash',
      fetchImpl,
    })
    expect(out.text).toBe('解释')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer sk-ds')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('deepseek-v4-flash')
    expect(body.messages[1].content).toContain('runner')
    expect(body.messages[1].content).toContain('Chinese')
  })

  it('maps 401 to invalid-key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }))
    await expect(
      deepseekProvider.explain(payload, { apiKey: 'bad', model: 'deepseek-v4-flash', fetchImpl }),
    ).rejects.toMatchObject({ kind: 'invalid-key' })
  })
})
