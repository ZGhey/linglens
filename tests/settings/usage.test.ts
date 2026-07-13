import { describe, it, expect } from 'vitest'
import { addUsage } from '@/settings'

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
