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

  it('snaps a delisted stored model to the provider default', () => {
    const merged = mergeSettings({ models: { gemini: 'gemini-1.5-flash' } as never })
    expect(merged.models.gemini).toBe('gemini-2.5-flash')
  })

  it('keeps a stored model that is still a current preset', () => {
    const merged = mergeSettings({ models: { deepseek: 'deepseek-v4-pro' } as never })
    expect(merged.models.deepseek).toBe('deepseek-v4-pro')
  })

  it('never snaps the free-text custom model', () => {
    const merged = mergeSettings({ models: { custom: 'my-local-model' } as never })
    expect(merged.models.custom).toBe('my-local-model')
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
