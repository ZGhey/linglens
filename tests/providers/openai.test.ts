import { describe, it, expect, vi } from 'vitest'
import { openaiProvider } from '@/providers/openai'
import { ProviderError } from '@/providers/types'
import type { PromptPayload } from '@/pipeline/types'

const payload: PromptPayload = {
  summary: { title: 'GitHub Actions Runner', outline: ['Installation'], topic: 'The runner runs jobs.' },
  localContext: { heading: 'Installation', text: 'Download and configure the runner.' },
  term: 'runner',
  targetLang: 'Chinese',
  verbosity: 'concise',
}

function okResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
}

describe('openaiProvider.explain', () => {
  it('sends a correctly shaped request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse('解释'))
    await openaiProvider.explain(payload, { apiKey: 'sk-test', model: 'gpt-4o-mini', fetchImpl })

    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('gpt-4o-mini')
    expect(body.messages).toHaveLength(2)
    const user = body.messages[1].content
    expect(user).toContain('runner')
    expect(user).toContain('Chinese')
    expect(user).toContain('GitHub Actions Runner')
  })

  it('parses the explanation out of the response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse('  a grounded explanation  '))
    const out = await openaiProvider.explain(payload, { apiKey: 'sk', model: 'm', fetchImpl })
    expect(out.text).toBe('a grounded explanation')
  })

  it('throws missing-key when no key is set (no fetch attempted)', async () => {
    const fetchImpl = vi.fn()
    await expect(
      openaiProvider.explain(payload, { apiKey: '  ', model: 'm', fetchImpl }),
    ).rejects.toMatchObject({ kind: 'missing-key' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('maps 401 to invalid-key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }))
    await expect(
      openaiProvider.explain(payload, { apiKey: 'sk', model: 'm', fetchImpl }),
    ).rejects.toMatchObject({ kind: 'invalid-key' })
  })

  it('maps 429 to rate-limited', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('slow down', { status: 429 }))
    await expect(
      openaiProvider.explain(payload, { apiKey: 'sk', model: 'm', fetchImpl }),
    ).rejects.toMatchObject({ kind: 'rate-limited' })
  })

  it('maps a fetch rejection to network', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(
      openaiProvider.explain(payload, { apiKey: 'sk', model: 'm', fetchImpl }),
    ).rejects.toMatchObject({ kind: 'network' })
  })

  it('surfaces an empty response as an error rather than returning ""', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(''))
    await expect(
      openaiProvider.explain(payload, { apiKey: 'sk', model: 'm', fetchImpl }),
    ).rejects.toBeInstanceOf(ProviderError)
  })
})
