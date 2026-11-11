// Key checks for providers with a models-list endpoint: listing models proves
// a key works without generating text (nothing calls the LLM before an
// explicit EXPLAIN). Gemini and OpenRouter have their own modules.

import type { ProviderId } from '@/providers/types'

/** Where each provider's users create an API key. */
export const KEY_PAGES: Partial<Record<ProviderId, string>> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://platform.claude.com/settings/keys',
  deepseek: 'https://platform.deepseek.com/api_keys',
}

interface ListSpec {
  url: string
  headers: (key: string) => Record<string, string>
}

const LIST_MODELS: Partial<Record<ProviderId, ListSpec>> = {
  openai: {
    url: 'https://api.openai.com/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  deepseek: {
    url: 'https://api.deepseek.com/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/models?limit=1000',
    headers: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }),
  },
}

export type ModelsKeyCheck =
  | { ok: true; models: string[] }
  | { ok: false; reason: 'invalid' | 'rate-limited' | 'network' | 'unknown'; status?: number }

export function canCheckKey(provider: ProviderId): boolean {
  return provider in LIST_MODELS
}

/** List the models a key can use. */
export async function checkKeyByModels(
  provider: ProviderId,
  rawKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ModelsKeyCheck> {
  const spec = LIST_MODELS[provider]
  if (!spec) return { ok: false, reason: 'unknown' }
  let res: Response
  try {
    res = await fetchImpl(spec.url, { headers: spec.headers(rawKey.trim()) })
  } catch {
    return { ok: false, reason: 'network' }
  }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'invalid', status: res.status }
  if (res.status === 429) return { ok: false, reason: 'rate-limited', status: 429 }
  if (!res.ok) return { ok: false, reason: 'unknown', status: res.status }
  const body = (await res.json().catch(() => null)) as { data?: { id?: unknown }[] } | null
  const models = (body?.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string')
  return { ok: true, models }
}

/** The model to use after a successful check: keep the current one if the key
 *  has it, else the first preset the key has, else keep the current one. */
export function chooseModel(current: string, presets: readonly string[], available: readonly string[]): string {
  if (available.length === 0 || available.includes(current)) return current
  return presets.find((p) => available.includes(p)) ?? current
}
