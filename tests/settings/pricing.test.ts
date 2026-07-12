import { describe, it, expect } from 'vitest'
import { addUsage, estimateCost, formatCost, priceKey, DEFAULT_MODEL_PRICES } from '@/settings'
import { mergeSettings } from '@/settings'

describe('addUsage', () => {
  it('sums both sides field-wise', () => {
    expect(
      addUsage({ inputTokens: 10, outputTokens: 3 }, { inputTokens: 5, outputTokens: 2 }),
    ).toEqual({ inputTokens: 15, outputTokens: 5 })
  })

  it('returns the present side when the other is missing', () => {
    const u = { inputTokens: 1, outputTokens: 1 }
    expect(addUsage(u, undefined)).toBe(u)
    expect(addUsage(undefined, u)).toBe(u)
    expect(addUsage(undefined, undefined)).toBeUndefined()
  })
})

describe('estimateCost', () => {
  it('prices input and output at their own per-1M rates', () => {
    const cost = estimateCost(
      { inputTokens: 1_000_000, outputTokens: 500_000 },
      { input: 0.3, output: 1.2 },
    )
    expect(cost).toBeCloseTo(0.3 + 0.6, 10)
  })

  it('is undefined without usage or without a price', () => {
    expect(estimateCost(undefined, { input: 1, output: 1 })).toBeUndefined()
    expect(estimateCost({ inputTokens: 1, outputTokens: 1 }, undefined)).toBeUndefined()
  })

  it('a zero price means free, not unknown', () => {
    expect(estimateCost({ inputTokens: 5000, outputTokens: 100 }, { input: 0, output: 0 })).toBe(0)
  })
})

describe('formatCost', () => {
  it('renders free, sub-cent, and normal amounts distinctly', () => {
    expect(formatCost(0)).toBe('$0')
    expect(formatCost(0.00213)).toBe('~$0.0021')
    expect(formatCost(0.5)).toBe('~$0.50')
  })
})

describe('modelPrices persistence semantics', () => {
  it('seeds first-time users with the default table', () => {
    expect(mergeSettings(undefined).modelPrices).toEqual(DEFAULT_MODEL_PRICES)
  })

  it('treats a stored table as authoritative so cleared prices stay cleared', () => {
    const stored = { modelPrices: { [priceKey('openai', 'gpt-4o-mini')]: { input: 1, output: 2 } } }
    const merged = mergeSettings(stored as never)
    expect(merged.modelPrices).toEqual(stored.modelPrices)
    // Defaults are NOT overlaid back in — a user who deleted a price keeps it deleted.
    expect(merged.modelPrices['openai:gpt-4o']).toBeUndefined()
  })
})
