// Guided free Gemini key: check a pasted key and pick a model, without ever
// generating text (hard rule: nothing calls the LLM before an explicit EXPLAIN).
// The check lists the key's models — free, and it proves the key works.

import { PROVIDER_MAP } from '@/providers/registry'

/** Where the user creates a key (Google sign-in, no card needed). */
export const AI_STUDIO_KEY_URL = 'https://aistudio.google.com/apikey'

const MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000'

export type KeyCheck =
  | { ok: true; model: string; note?: string }
  | {
      ok: false
      reason: 'invalid' | 'region' | 'network' | 'unknown'
      message: string
    }

interface ModelEntry {
  name?: string
  supportedGenerationMethods?: string[]
}

/** A stable (not preview/experimental) Flash model id: gemini-<ver>-flash[-lite]. */
const STABLE_FLASH = /^gemini-(\d+(?:\.\d+)?)-flash(-lite)?$/

/**
 * Choose the default model from the ids the key can use: the first registry
 * preset that is available, else the newest stable Flash (Lite as a fallback),
 * else any Gemini text model, else the first preset.
 */
export function pickGeminiModel(available: readonly string[], presets: readonly string[]): string {
  const ids = available.map((n) => n.replace(/^models\//, ''))
  const preset = presets.find((p) => ids.includes(p))
  if (preset) return preset

  const flash = ids
    .map((id) => ({ id, m: STABLE_FLASH.exec(id) }))
    .filter((x): x is { id: string; m: RegExpExecArray } => x.m !== null)
    .sort((a, b) => {
      const lite = Number(Boolean(a.m[2])) - Number(Boolean(b.m[2]))
      return lite !== 0 ? lite : Number(b.m[1]) - Number(a.m[1])
    })
  if (flash.length > 0) return flash[0].id

  return ids.find((id) => id.startsWith('gemini-')) ?? presets[0] ?? ''
}

function googleMessage(body: unknown): string {
  const msg = (body as { error?: { message?: unknown } } | null)?.error?.message
  return typeof msg === 'string' ? msg : ''
}

/** Check a Gemini key by listing its models. */
export async function checkGeminiKey(
  rawKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<KeyCheck> {
  const key = rawKey.trim()
  const presets = PROVIDER_MAP.gemini.models
  let res: Response
  try {
    res = await fetchImpl(MODELS_URL, { headers: { 'x-goog-api-key': key } })
  } catch {
    return {
      ok: false,
      reason: 'network',
      message: "Couldn't reach Google. Check your internet connection and paste the key again.",
    }
  }

  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // non-JSON body; fall through on status
  }

  if (res.ok) {
    const models = ((body as { models?: ModelEntry[] } | null)?.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name ?? '')
      .filter(Boolean)
    return { ok: true, model: pickGeminiModel(models, presets) }
  }

  const message = googleMessage(body)
  if (res.status === 429) {
    // The key is real; Google is throttling it (common on brand-new free-tier
    // projects). Accept it and say so rather than calling it broken.
    return {
      ok: true,
      model: presets[0] ?? '',
      note: 'Key saved. Google is rate-limiting it right now — if an explanation fails, wait a minute and try again.',
    }
  }
  if (/location is not supported/i.test(message)) {
    return {
      ok: false,
      reason: 'region',
      message:
        "Google doesn't offer the Gemini API in your region. Use OpenRouter or another provider with your own key instead.",
    }
  }
  const keyRejected =
    res.status === 401 ||
    res.status === 403 ||
    (res.status === 400 && (/API_KEY_INVALID/.test(JSON.stringify(body)) || /api key/i.test(message)))
  if (keyRejected) {
    return {
      ok: false,
      reason: 'invalid',
      message:
        res.status === 403 && message
          ? `Google rejected this key: ${message}`
          : "That doesn't look like a working Gemini key. Copy it again from AI Studio (it starts with “AIza”).",
    }
  }
  return {
    ok: false,
    reason: 'unknown',
    message: message
      ? `Google returned an error: ${message}`
      : `Google returned an unexpected error (HTTP ${res.status}). Try again in a moment.`,
  }
}
