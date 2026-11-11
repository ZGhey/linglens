import { afterEach, describe, expect, it } from 'vitest'
import { MESSAGES, setLocale, t } from '@/i18n'

afterEach(() => setLocale(null))

describe('i18n', () => {
  it('has the same placeholders in every locale', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const key of Object.keys(MESSAGES.en) as (keyof typeof MESSAGES.en)[]) {
      expect(vars(MESSAGES.zh[key]), key).toEqual(vars(MESSAGES.en[key]))
    }
  })

  it('fills placeholders and switches locale', () => {
    setLocale('en')
    expect(t('keyHint', { provider: 'OpenAI' })).toBe('Enter your OpenAI API key.')
    setLocale('zh')
    expect(t('keyHint', { provider: 'OpenAI' })).toBe('填写你的 OpenAI API key。')
  })
})
