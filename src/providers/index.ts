import type { PromptPayload } from '@/pipeline/types'
import {
  ProviderError,
  type ExplainResult,
  type Provider,
  type ProviderConfig,
  type ProviderId,
} from './types'
import { PROVIDERS, providerFromDescriptor } from './registry'

export * from './types'
export { buildMessages, buildUserPrompt, SYSTEM_PROMPT, type WireMessage } from './prompt'
export { PROVIDERS, PROVIDER_MAP } from './registry'
export type { ProviderDescriptor } from './registry'

// One Provider per descriptor, built from the data registry. Adding a provider
// means adding a registry entry — nothing here changes.
const REGISTRY: Record<ProviderId, Provider> = Object.fromEntries(
  PROVIDERS.map((d) => [d.id, providerFromDescriptor(d)]),
) as Record<ProviderId, Provider>

export function getProvider(id: ProviderId): Provider {
  const provider = REGISTRY[id]
  if (!provider) {
    // Guards against a stale provider id persisted in settings.
    throw new ProviderError('unknown', `Unknown provider "${id}".`)
  }
  return provider
}

export function explainWith(
  id: ProviderId,
  payload: PromptPayload,
  config: ProviderConfig,
): Promise<ExplainResult> {
  return getProvider(id).explain(payload, config)
}

export function explainStreamWith(
  id: ProviderId,
  payload: PromptPayload,
  config: ProviderConfig,
  onDelta: (delta: string) => void = () => {},
): Promise<ExplainResult> {
  return getProvider(id).explainStream(payload, config, onDelta)
}
