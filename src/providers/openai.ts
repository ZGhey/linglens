// Named per-provider export kept as a stable seam for provider unit tests; the
// app itself resolves providers through the registry (see index.ts).
import { providerFromDescriptor, PROVIDER_MAP } from './registry'

export const openaiProvider = providerFromDescriptor(PROVIDER_MAP.openai)
