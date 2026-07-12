import { describe, it, expect, beforeEach } from 'vitest'
import {
  addHistoryEntry,
  clearHistory,
  clampHistoryLimit,
  loadHistory,
  trimHistory,
  DEFAULT_HISTORY_LIMIT,
  HISTORY_LIMIT_MAX,
  type HistoryEntry,
} from '@/history'

// In-memory stand-in for chrome.storage.local, reset per test.
const store: Record<string, unknown> = {}
;(globalThis as { chrome?: unknown }).chrome = {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: store[key] }),
      set: async (items: Record<string, unknown>) => {
        Object.assign(store, items)
      },
      remove: async (key: string) => {
        delete store[key]
      },
    },
  },
}

const entry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  term: 'runner',
  explanation: 'runs jobs',
  url: 'https://a.com/readme',
  title: 'Doc',
  verbosity: 'concise',
  at: 1,
  ...overrides,
})

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
})

describe('history', () => {
  it('stores entries newest first', async () => {
    await addHistoryEntry(entry({ term: 'a', at: 1 }))
    await addHistoryEntry(entry({ term: 'b', at: 2 }))
    const entries = await loadHistory()
    expect(entries.map((e) => e.term)).toEqual(['b', 'a'])
  })

  it('replaces an older entry for the same term on the same URL', async () => {
    await addHistoryEntry(entry({ explanation: 'old', at: 1 }))
    await addHistoryEntry(entry({ explanation: 'new', at: 2 }))
    const entries = await loadHistory()
    expect(entries).toHaveLength(1)
    expect(entries[0].explanation).toBe('new')
  })

  it('keeps the same term on different URLs as separate entries', async () => {
    await addHistoryEntry(entry({ url: 'https://a.com' }))
    await addHistoryEntry(entry({ url: 'https://b.com' }))
    expect(await loadHistory()).toHaveLength(2)
  })

  it('defaults to the default cap, dropping the oldest', async () => {
    for (let i = 0; i < DEFAULT_HISTORY_LIMIT + 5; i++) {
      await addHistoryEntry(entry({ term: `t${i}` }))
    }
    const entries = await loadHistory()
    expect(entries).toHaveLength(DEFAULT_HISTORY_LIMIT)
    expect(entries[0].term).toBe(`t${DEFAULT_HISTORY_LIMIT + 4}`)
    expect(entries.at(-1)?.term).toBe('t5')
  })

  it('honors an explicit lower limit', async () => {
    for (let i = 0; i < 6; i++) await addHistoryEntry(entry({ term: `t${i}` }), 3)
    expect((await loadHistory()).map((e) => e.term)).toEqual(['t5', 't4', 't3'])
  })

  it('trimHistory shrinks an existing list to the new cap', async () => {
    for (let i = 0; i < 5; i++) await addHistoryEntry(entry({ term: `t${i}` }))
    await trimHistory(2)
    expect((await loadHistory()).map((e) => e.term)).toEqual(['t4', 't3'])
  })

  it('clamps the limit to [1, MAX]', () => {
    expect(clampHistoryLimit(0)).toBe(1)
    expect(clampHistoryLimit(-5)).toBe(1)
    expect(clampHistoryLimit(50.9)).toBe(50)
    expect(clampHistoryLimit(99999)).toBe(HISTORY_LIMIT_MAX)
    expect(clampHistoryLimit(NaN)).toBe(DEFAULT_HISTORY_LIMIT)
  })

  it('does not lose entries when two writes land together', async () => {
    await Promise.all([
      addHistoryEntry(entry({ term: 'x' })),
      addHistoryEntry(entry({ term: 'y' })),
    ])
    expect((await loadHistory()).map((e) => e.term).sort()).toEqual(['x', 'y'])
  })

  it('clears everything', async () => {
    await addHistoryEntry(entry())
    await clearHistory()
    expect(await loadHistory()).toEqual([])
  })
})
