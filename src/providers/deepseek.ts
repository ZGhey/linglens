import { providerFromDescriptor, PROVIDER_MAP } from './registry'

// DeepSeek is OpenAI-compatible: same chat/completions body and response shape.
export const deepseekProvider = providerFromDescriptor(PROVIDER_MAP.deepseek)
