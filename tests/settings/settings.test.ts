import { describe, it, expect } from 'vitest'
import { mergeSettings, activeConfig, DEFAULT_SETTINGS } from '@/settings'

describe('mergeSettings', () => {
  it('fills defaults when nothing is stored', () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it('overlays stored values and keeps unset keys at their defaults', () => {
    const merged = mergeSettings({ provider: 'anthropic', apiKeys: { anthropic: 'sk-ant' } as never })
    expect(merged.provider).toBe('anthropic')
    expect(merged.apiKeys.anthropic).toBe('sk-ant')
    expect(merged.apiKeys.openai).toBe('')
    expect(merged.targetLang).toBe('English')
  })

  it('keeps a stored model verbatim, including a non-preset id (free-text)', () => {
    const merged = mergeSettings({ models: { gemini: 'gemini-3.1-pro-preview' } as never })
    expect(merged.models.gemini).toBe('gemini-3.1-pro-preview')
  })
})

describe('activeConfig', () => {
  it('returns the selected provider key + model', () => {
    const settings = mergeSettings({
      provider: 'openai',
      apiKeys: { openai: 'sk-o' } as never,
      models: { openai: 'gpt-4o' } as never,
    })
    expect(activeConfig(settings)).toEqual({
      provider: 'openai',
      apiKey: 'sk-o',
      model: 'gpt-4o',
      baseUrl: 'https://api.openai.com/v1',
    })
  })
})

describe('retired models', () => {
  it('upgrades a stored retired Gemini model to its replacement', () => {
    const merged = mergeSettings({ models: { gemini: 'gemini-3.5-flash' } as never })
    expect(merged.models.gemini).toBe('gemini-3.1-flash-lite')
  })
})

describe('retired models (all providers)', () => {
  it('upgrades retired Anthropic and DeepSeek ids', () => {
    const merged = mergeSettings({
      models: { anthropic: 'claude-3-5-haiku-latest', deepseek: 'deepseek-chat' } as never,
    })
    expect(merged.models.anthropic).toBe('claude-haiku-5-5')
    expect(merged.models.deepseek).toBe('deepseek-flash')
  })
})
