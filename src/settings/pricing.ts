// Model pricing for the cost readout. Prices are USD per 1M tokens and are
// USER-EDITABLE settings: the defaults below were researched 2026-07 but vendors
// reprice and delist models (several entries were already off the official pages
// then), so the options UI labels them as defaults to verify, and whatever the
// user saves wins. Token counts are always real; only the USD figure depends on
// these numbers.

import type { ProviderId } from '@/providers/types'
import type { TokenUsage } from '@/providers/types'

/** USD per 1M tokens, input and output. */
export interface ModelPrice {
  input: number
  output: number
}

/** Prices are keyed "provider:model" so the same model id under two providers
 * (e.g. a proxy) can carry different prices. */
export type ModelPrices = Record<string, ModelPrice>

export function priceKey(provider: ProviderId, model: string): string {
  return `${provider}:${model}`
}

/** Researched 2026-07. gpt-4o-mini was confirmed current; the rest were the
 * last published rates before those models left the official pricing pages. */
export const DEFAULT_MODEL_PRICES: ModelPrices = {
  'openai:gpt-4o-mini': { input: 0.15, output: 0.6 },
  'openai:gpt-4o': { input: 2.5, output: 10 },
  'deepseek:deepseek-chat': { input: 0.27, output: 1.1 },
  'deepseek:deepseek-reasoner': { input: 0.55, output: 2.19 },
  'gemini:gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini:gemini-1.5-pro': { input: 1.25, output: 5 },
  'anthropic:claude-3-5-haiku-latest': { input: 0.8, output: 4 },
  'anthropic:claude-3-5-sonnet-latest': { input: 3, output: 15 },
}

/** Sum two token counts, treating a missing side as zero contribution; returns
 * undefined only when both are absent (nothing to show). */
export function addUsage(
  a: TokenUsage | undefined,
  b: TokenUsage | undefined,
): TokenUsage | undefined {
  if (!a) return b
  if (!b) return a
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens }
}

/** Cost in USD for one call, or undefined when either side is unknown. */
export function estimateCost(
  usage: TokenUsage | undefined,
  price: ModelPrice | undefined,
): number | undefined {
  if (!usage || !price) return undefined
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000
}

/** Human display: "$0" for free, 4 decimals under a cent, else 2. */
export function formatCost(cost: number): string {
  if (cost === 0) return '$0'
  if (cost < 0.01) return `~$${cost.toFixed(4)}`
  return `~$${cost.toFixed(2)}`
}
