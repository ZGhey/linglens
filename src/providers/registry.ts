import type { PromptPayload } from '@/pipeline/types'
import {
  ProviderError,
  type ExplainResult,
  type Provider,
  type ProviderConfig,
  type ProviderId,
} from './types'
import { callProvider } from './call'
import { streamProvider } from './stream'
import { WIRES, STREAM_WIRES, type Wire } from './wire'

// The provider registry: every provider is one data entry (id, label, wire, base
// URL, models). Most speak the OpenAI wire, so adding a hosted provider is a data
// change, not new code. The `custom` entry has no fixed base URL — the user
// supplies an OpenAI-compatible endpoint in settings.

export interface ProviderDescriptor {
  readonly id: ProviderId
  readonly label: string
  readonly wire: Wire
  /** Base URL the wire builds its endpoint from. Empty for `custom` (user-set). */
  readonly baseUrl: string
  /** Preset models offered in the settings dropdown. Empty = free-text (custom). */
  readonly models: readonly string[]
  /** True when the user supplies the base URL + model themselves. */
  readonly custom?: boolean
}

export const PROVIDERS: readonly ProviderDescriptor[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    wire: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    wire: 'openai',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    wire: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    models: ['gemini-1.5-flash', 'gemini-1.5-pro'],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    wire: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'],
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    wire: 'openai',
    baseUrl: '',
    models: [],
    custom: true,
  },
]

export const PROVIDER_MAP: Record<ProviderId, ProviderDescriptor> = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p]),
) as Record<ProviderId, ProviderDescriptor>

/** Turn a descriptor into a Provider. The base URL comes from config when set
 * (so `custom` works and any provider can be pointed at a proxy), else the
 * descriptor's own base URL. */
export function providerFromDescriptor(d: ProviderDescriptor): Provider {
  // Strip a trailing slash so a user base URL like "http://host/v1/" doesn't
  // produce a doubled "//chat/completions".
  const resolveBaseUrl = (config: ProviderConfig): string =>
    (config.baseUrl?.trim() || d.baseUrl).replace(/\/+$/, '')

  return {
    id: d.id,

    explain(payload: PromptPayload, config: ProviderConfig): Promise<ExplainResult> {
      const baseUrl = resolveBaseUrl(config)
      if (!baseUrl) {
        return Promise.reject(
          new ProviderError('unknown', 'No base URL set. Add one in Linglens settings.'),
        )
      }
      return callProvider(config, WIRES[d.wire](baseUrl, payload))
    },

    async explainStream(
      payload: PromptPayload,
      config: ProviderConfig,
      onDelta: (delta: string) => void,
    ): Promise<ExplainResult> {
      const baseUrl = resolveBaseUrl(config)
      if (!baseUrl) {
        throw new ProviderError('unknown', 'No base URL set. Add one in Linglens settings.')
      }
      // streamProvider itself buffers-in-place when the endpoint ignores
      // stream:true, so a non-streaming endpoint costs exactly one request.
      return streamProvider(config, STREAM_WIRES[d.wire](baseUrl, payload), onDelta)
    },
  }
}
