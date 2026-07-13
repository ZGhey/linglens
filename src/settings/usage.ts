// Token-usage helpers. Usage counts are always the provider's own reported
// numbers (never estimated); the UI shows them per explanation and summed across
// a follow-up thread. No pricing lives here — the extension deliberately does not
// convert tokens to a currency (vendor prices go stale and add upkeep).

import type { TokenUsage } from '@/providers/types'

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
