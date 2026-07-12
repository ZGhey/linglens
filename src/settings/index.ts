// Shared settings model + persistence. Stored in chrome.storage.local so the API
// key never leaves the browser except in a request to the chosen provider.

import { PROVIDERS, PROVIDER_MAP } from '@/providers'
import type { ProviderId } from '@/providers/types'
import type { Verbosity } from '@/pipeline/types'
import { DEFAULT_MODEL_PRICES, type ModelPrices } from './pricing'
import { DEFAULT_HISTORY_LIMIT, clampHistoryLimit } from '@/history'

export {
  DEFAULT_MODEL_PRICES,
  addUsage,
  estimateCost,
  formatCost,
  priceKey,
  type ModelPrice,
  type ModelPrices,
} from './pricing'

// Provider labels and preset models are read straight off the registry
// (`PROVIDERS` / `PROVIDER_MAP`) wherever needed, so they aren't re-exported here.

export interface Settings {
  provider: ProviderId
  /** One key per provider, so switching provider keeps each key. */
  apiKeys: Record<ProviderId, string>
  /** Selected model per provider. */
  models: Record<ProviderId, string>
  /** Language explanations are written in. */
  targetLang: string
  /** Base URL for the user-configured `custom` (OpenAI-compatible) provider. */
  customBaseUrl: string
  /** Default explanation length; the popup toggle overrides it per explanation. */
  verbosity: Verbosity
  /** USD per 1M tokens keyed "provider:model"; user edits win over defaults. */
  modelPrices: ModelPrices
  /** Max explained-term history entries to retain (oldest dropped past this). */
  historyLimit: number
}

/** Preset languages offered in the settings dropdown; users can still enter a
 * custom one via the "Custom…" option. */
export const LANGUAGE_PRESETS: string[] = [
  'English',
  '中文',
  '日本語',
  '한국어',
  'Español',
  'Français',
  'Deutsch',
  'Português',
]

const emptyPerProvider = (): Record<ProviderId, string> =>
  Object.fromEntries(PROVIDERS.map((p) => [p.id, ''])) as Record<ProviderId, string>

export const DEFAULT_SETTINGS: Settings = {
  provider: 'openai',
  apiKeys: emptyPerProvider(),
  models: Object.fromEntries(
    PROVIDERS.map((p) => [p.id, p.models[0] ?? '']),
  ) as Record<ProviderId, string>,
  targetLang: 'English',
  customBaseUrl: '',
  verbosity: 'concise',
  modelPrices: { ...DEFAULT_MODEL_PRICES },
  historyLimit: DEFAULT_HISTORY_LIMIT,
}

const STORAGE_KEY = 'linglens.settings'

/** Merge stored settings over defaults so new fields always have a value. */
export function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  return {
    provider: stored?.provider ?? DEFAULT_SETTINGS.provider,
    apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...stored?.apiKeys },
    models: { ...DEFAULT_SETTINGS.models, ...stored?.models },
    targetLang: stored?.targetLang ?? DEFAULT_SETTINGS.targetLang,
    customBaseUrl: stored?.customBaseUrl ?? DEFAULT_SETTINGS.customBaseUrl,
    verbosity: stored?.verbosity ?? DEFAULT_SETTINGS.verbosity,
    // Defaults seed first-time users only; once saved, the stored table is
    // authoritative so a price the user cleared stays cleared. Copied so callers
    // that mutate settings in place never touch the shared default table.
    modelPrices: { ...(stored?.modelPrices ?? DEFAULT_MODEL_PRICES) },
    historyLimit: clampHistoryLimit(stored?.historyLimit ?? DEFAULT_HISTORY_LIMIT),
  }
}

/** The active provider's key + model + base URL, ready to hand to an adapter.
 * Base URL is the user's for `custom`, else the provider's built-in one. */
export function activeConfig(settings: Settings): {
  provider: ProviderId
  apiKey: string
  model: string
  baseUrl: string
} {
  const descriptor = PROVIDER_MAP[settings.provider]
  const baseUrl = descriptor?.custom ? settings.customBaseUrl : (descriptor?.baseUrl ?? '')
  return {
    provider: settings.provider,
    apiKey: settings.apiKeys[settings.provider],
    model: settings.models[settings.provider],
    baseUrl,
  }
}

export async function loadSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get(STORAGE_KEY)
  return mergeSettings(raw[STORAGE_KEY] as Partial<Settings> | undefined)
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings })
}
