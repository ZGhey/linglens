// Explained-term history, persisted in chrome.storage.local by the worker on
// every successful first explanation (follow-ups belong to their popup session
// and are not recorded). Re-viewing an entry reads storage only — no LLM call.

import type { Verbosity } from '@/pipeline/types'

export interface HistoryEntry {
  term: string
  explanation: string
  url: string
  /** Document title at explanation time, for list display. */
  title: string
  verbosity: Verbosity
  /** Unix ms when the explanation was produced. */
  at: number
}

const STORAGE_KEY = 'linglens.history'

/** Default and hard ceiling for the user-configurable retained-entry cap. */
export const DEFAULT_HISTORY_LIMIT = 200
export const HISTORY_LIMIT_MAX = 1000

/** Coerce any stored/typed value into a sane whole-number limit in [1, MAX]. */
export function clampHistoryLimit(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_HISTORY_LIMIT
  return Math.max(1, Math.min(HISTORY_LIMIT_MAX, Math.floor(n)))
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  const raw = await chrome.storage.local.get(STORAGE_KEY)
  return (raw[STORAGE_KEY] as HistoryEntry[] | undefined) ?? []
}

// Writes are chained so two explanations resolving together can't interleave
// their read-modify-write and drop each other's entry. All writers live in the
// worker, so an in-module chain is sufficient serialization.
let writeQueue: Promise<void> = Promise.resolve()

/** Run fn as the next link in the serialized write chain (one failure can't
 * poison the rest of the chain). */
function enqueueWrite(fn: () => Promise<void>): Promise<void> {
  writeQueue = writeQueue.catch(() => {}).then(fn)
  return writeQueue
}

/** Append an entry (stamped now), newest first, keeping at most `limit` entries.
 * The same term on the same URL replaces its older entry (a re-explanation
 * updates rather than duplicates). */
export function addHistoryEntry(
  entry: Omit<HistoryEntry, 'at'>,
  limit: number = DEFAULT_HISTORY_LIMIT,
): Promise<void> {
  return enqueueWrite(async () => {
    const entries = await loadHistory()
    const rest = entries.filter((e) => !(e.term === entry.term && e.url === entry.url))
    const next = [{ ...entry, at: Date.now() }, ...rest].slice(0, clampHistoryLimit(limit))
    await chrome.storage.local.set({ [STORAGE_KEY]: next })
  })
}

/** Drop entries beyond `limit` (used when the user lowers the cap in settings). */
export function trimHistory(limit: number): Promise<void> {
  return enqueueWrite(async () => {
    const entries = await loadHistory()
    const next = entries.slice(0, clampHistoryLimit(limit))
    if (next.length !== entries.length) {
      await chrome.storage.local.set({ [STORAGE_KEY]: next })
    }
  })
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY)
}
