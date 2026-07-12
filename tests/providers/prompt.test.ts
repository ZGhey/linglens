import { describe, it, expect } from 'vitest'
import { buildUserPrompt, buildMessages } from '@/providers'
import type { PromptPayload } from '@/pipeline/types'

const base: Omit<PromptPayload, 'verbosity'> = {
  summary: { title: 'Doc', outline: ['A'], topic: 'about runners' },
  localContext: { heading: 'A', text: 'a runner runs jobs' },
  term: 'runner',
  targetLang: 'Chinese',
}

describe('buildUserPrompt verbosity', () => {
  it('asks for 1-2 sentences when concise', () => {
    const prompt = buildUserPrompt({ ...base, verbosity: 'concise' })
    expect(prompt).toContain('1-2 short sentences')
    expect(prompt).not.toContain('4-6 sentences')
  })

  it('asks for a fuller answer with an example when detailed', () => {
    const prompt = buildUserPrompt({ ...base, verbosity: 'detailed' })
    expect(prompt).toContain('4-6 sentences')
    expect(prompt).toContain('example')
  })
})

describe('buildMessages', () => {
  it('is a single user message on a first explanation', () => {
    const messages = buildMessages({ ...base, verbosity: 'concise' })
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toContain('runner')
  })

  it('replays the whole thread for a follow-up, alternating roles', () => {
    const messages = buildMessages({
      ...base,
      verbosity: 'concise',
      followUp: {
        explanation: 'runners execute jobs',
        turns: [{ question: 'self-hosted too?', answer: 'yes, on your machine' }],
        question: 'how are they billed?',
      },
    })
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user'])
    expect(messages[1].content).toBe('runners execute jobs')
    expect(messages[2].content).toBe('self-hosted too?')
    expect(messages[3].content).toBe('yes, on your machine')
    // The new question keeps grounding + language pinned.
    expect(messages[4].content).toContain('how are they billed?')
    expect(messages[4].content).toContain('Chinese')
  })

  it('applies the verbosity length instruction to the follow-up answer too', async () => {
    const concise = buildMessages({
      ...base,
      verbosity: 'concise',
      followUp: { explanation: 'e', turns: [], question: 'q?' },
    })
    expect(concise.at(-1)!.content).toContain('1-2 short sentences')

    const detailed = buildMessages({
      ...base,
      verbosity: 'detailed',
      followUp: { explanation: 'e', turns: [], question: 'q?' },
    })
    expect(detailed.at(-1)!.content).toContain('4-6 sentences')
  })
})
