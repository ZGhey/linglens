import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as pipeline from '@/pipeline'
import { createExplainService } from '@/background/explain'
import { ProviderError } from '@/providers/types'
import { mergeSettings } from '@/settings'
import type { ExplainRequest } from '@/messaging/types'

const html = readFileSync(
  fileURLToPath(new URL('../fixtures/github-readme.html', import.meta.url)),
  'utf8',
)

function req(overrides: Partial<ExplainRequest> = {}): ExplainRequest {
  return {
    type: 'EXPLAIN',
    term: 'runner',
    url: 'https://example.com/readme',
    html,
    contextHint: '',
    ...overrides,
  }
}

const keyedSettings = () =>
  mergeSettings({ provider: 'openai', apiKeys: { openai: 'sk-test' } as never })

beforeEach(() => vi.restoreAllMocks())

describe('createExplainService', () => {
  it('does not call the provider until an EXPLAIN is handled (no eager summarization)', () => {
    const explain = vi.fn()
    createExplainService({ getSettings: async () => keyedSettings(), explain })
    expect(explain).not.toHaveBeenCalled()
  })

  it('returns a grounded explanation on success', async () => {
    const explain = vi.fn().mockResolvedValue({ text: 'a grounded explanation' })
    const svc = createExplainService({ getSettings: async () => keyedSettings(), explain })
    const res = await svc.handle(req())
    expect(res).toEqual({
      ok: true,
      term: 'runner',
      explanation: 'a grounded explanation',
      verbosity: 'concise',
      targetLang: 'English',
      title: 'actions/runner: The GitHub Actions runner',
    })
    expect(explain).toHaveBeenCalledOnce()
  })

  it('surfaces the provider-reported token usage on the response', async () => {
    const explain = vi.fn().mockResolvedValue({
      text: 'x',
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    })
    const svc = createExplainService({ getSettings: async () => keyedSettings(), explain })
    const res = await svc.handle(req())
    expect(res).toMatchObject({ ok: true, usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 } })
  })

  it('omits usage when the provider reports none', async () => {
    const explain = vi.fn().mockResolvedValue({ text: 'x' })
    const svc = createExplainService({ getSettings: async () => keyedSettings(), explain })
    const res = await svc.handle(req())
    if (res.ok) expect(res.usage).toBeUndefined()
  })

  it('passes a follow-up thread through to the provider payload', async () => {
    const explain = vi.fn().mockResolvedValue({ text: 'follow-up answer' })
    const svc = createExplainService({ getSettings: async () => keyedSettings(), explain })
    const followUp = {
      explanation: 'runners execute jobs',
      turns: [{ question: 'q1', answer: 'a1' }],
      question: 'q2',
    }
    const res = await svc.handle(req({ followUp }))
    expect(res).toMatchObject({ ok: true, explanation: 'follow-up answer' })
    expect(explain.mock.calls[0][1]).toMatchObject({ followUp })
  })

  it('pins the thread language: a targetLang override wins over the setting', async () => {
    // Setting default is English; a follow-up carries the thread's language.
    const explain = vi.fn().mockResolvedValue({ text: 'x' })
    const svc = createExplainService({ getSettings: async () => keyedSettings(), explain })
    const res = await svc.handle(req({ targetLang: 'Chinese' }))
    expect(res).toMatchObject({ ok: true, targetLang: 'Chinese' })
    expect(explain.mock.calls[0][1]).toMatchObject({ targetLang: 'Chinese' })
  })

  it('lets a per-request verbosity override the configured default', async () => {
    const explain = vi.fn().mockResolvedValue({ text: 'long form' })
    const svc = createExplainService({ getSettings: async () => keyedSettings(), explain })
    const res = await svc.handle(req({ verbosity: 'detailed' }))
    expect(res).toMatchObject({ ok: true, verbosity: 'detailed' })
    // The assembled payload the provider sees carries the override too.
    expect(explain.mock.calls[0][1]).toMatchObject({ verbosity: 'detailed' })
  })

  it('forwards streamed token deltas to onDelta and returns the full text', async () => {
    const explain = vi.fn(
      async (
        _id: unknown,
        _p: unknown,
        _c: unknown,
        onDelta?: (d: string) => void,
      ): Promise<{ text: string }> => {
        onDelta?.('a ')
        onDelta?.('runner')
        return { text: 'a runner' }
      },
    )
    const svc = createExplainService({ getSettings: async () => keyedSettings(), explain })
    const deltas: string[] = []
    const res = await svc.handle(req(), (d) => deltas.push(d))
    expect(deltas).toEqual(['a ', 'runner'])
    expect(res).toEqual({
      ok: true,
      term: 'runner',
      explanation: 'a runner',
      verbosity: 'concise',
      targetLang: 'English',
      title: 'actions/runner: The GitHub Actions runner',
    })
  })

  it('builds the summary once per URL and reuses it on the second selection', async () => {
    const buildSummary = vi.spyOn(pipeline, 'buildSummary')
    const explain = vi.fn().mockResolvedValue({ text: 'x' })
    const svc = createExplainService({ getSettings: async () => keyedSettings(), explain })

    await svc.handle(req({ term: 'runner' }))
    await svc.handle(req({ term: 'self-hosted' }))

    expect(buildSummary).toHaveBeenCalledOnce()
    expect(svc.cachedPages()).toBe(1)
    expect(explain).toHaveBeenCalledTimes(2)
  })

  it('rebuilds the summary when the same URL serves changed content', async () => {
    const buildSummary = vi.spyOn(pipeline, 'buildSummary')
    const explain = vi.fn().mockResolvedValue({ text: 'x' })
    const svc = createExplainService({ getSettings: async () => keyedSettings(), explain })

    await svc.handle(req({ url: 'https://spa.app', html }))
    await svc.handle(req({ url: 'https://spa.app', html: html.replace('Runner', 'Executor') }))

    expect(buildSummary).toHaveBeenCalledTimes(2)
    expect(svc.cachedPages()).toBe(2)
  })

  it('rebuilds the summary for a different URL', async () => {
    const buildSummary = vi.spyOn(pipeline, 'buildSummary')
    const explain = vi.fn().mockResolvedValue({ text: 'x' })
    const svc = createExplainService({ getSettings: async () => keyedSettings(), explain })

    await svc.handle(req({ url: 'https://a.com' }))
    await svc.handle(req({ url: 'https://b.com' }))

    expect(buildSummary).toHaveBeenCalledTimes(2)
    expect(svc.cachedPages()).toBe(2)
  })

  it('returns missing-key without calling the provider when no key is set', async () => {
    const explain = vi.fn()
    const svc = createExplainService({ getSettings: async () => mergeSettings(undefined), explain })
    const res = await svc.handle(req())
    expect(res).toEqual({ ok: false, error: { kind: 'missing-key', message: expect.any(String) } })
    expect(explain).not.toHaveBeenCalled()
  })

  it('maps a ProviderError to a typed error response', async () => {
    const explain = vi.fn().mockRejectedValue(new ProviderError('rate-limited', 'slow down'))
    const svc = createExplainService({ getSettings: async () => keyedSettings(), explain })
    const res = await svc.handle(req())
    expect(res).toEqual({ ok: false, error: { kind: 'rate-limited', message: 'slow down' } })
  })

  it('rejects an empty selection', async () => {
    const explain = vi.fn()
    const svc = createExplainService({ getSettings: async () => keyedSettings(), explain })
    const res = await svc.handle(req({ term: '   ' }))
    expect(res).toMatchObject({ ok: false, error: { kind: 'no-selection' } })
    expect(explain).not.toHaveBeenCalled()
  })
})
