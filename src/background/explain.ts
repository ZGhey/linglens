// The real explanation flow, factored out of the chrome messaging layer so it
// can be unit-tested without a browser. Dependencies (settings + provider call)
// are injected.
//
// Cache rule (ticket 06): the document-level summary is built once per URL and
// reused on later selections. The cheap local-context lookup is recomputed each
// time. Nothing runs until an explicit EXPLAIN arrives — no eager summarization.

import * as pipeline from '@/pipeline'
import type { DocumentSummary, PipelineSettings } from '@/pipeline/types'
import {
  ProviderError,
  type ExplainResult,
  type ProviderConfig,
  type ProviderId,
} from '@/providers/types'
import { activeConfig, type Settings } from '@/settings'
import type { ExplainRequest, ExplainResponse } from '@/messaging/types'

export interface ExplainDeps {
  getSettings: () => Promise<Settings>
  explain: (
    id: ProviderId,
    payload: pipeline.PromptPayload,
    config: ProviderConfig,
    onDelta?: (delta: string) => void,
  ) => Promise<ExplainResult>
}

export interface ExplainService {
  /** Handle an explanation request. When onDelta is passed, streamed token
   * deltas are forwarded to it; the resolved response still carries the full text.
   * An optional signal aborts the in-flight provider call. */
  handle: (
    req: ExplainRequest,
    onDelta?: (delta: string) => void,
    signal?: AbortSignal,
  ) => Promise<ExplainResponse>
  /** Number of cached page summaries — for tests/introspection. */
  cachedPages: () => number
}

/** Cheap, stable fingerprint (djb2) of the page HTML, so that changed content —
 *  including an SPA that mutates the DOM under the same URL — gets a fresh cache
 *  key instead of a stale summary. */
function fingerprint(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Bound on cached pages; oldest is evicted first (Map keeps insertion order). */
const MAX_CACHED_PAGES = 50

export function createExplainService(deps: ExplainDeps): ExplainService {
  // In-memory, per-worker cache keyed by URL + content fingerprint. An MV3 worker
  // can be evicted after ~30s idle, which clears this — but rebuilding the summary
  // is LLM-free (deterministic heuristics), so a rebuild costs the user nothing.
  // The hard requirement ("never call the LLM without an explicit trigger") is
  // unaffected.
  const summaryCache = new Map<string, DocumentSummary>()

  async function handle(
    req: ExplainRequest,
    onDelta?: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<ExplainResponse> {
    const term = req.term.trim()
    if (!term) {
      return { ok: false, error: { kind: 'no-selection', message: 'Select a term to explain.' } }
    }

    const settings = await deps.getSettings()
    const cfg = activeConfig(settings)
    if (!cfg.apiKey.trim()) {
      return {
        ok: false,
        error: { kind: 'missing-key', message: 'No API key set. Open Linglens settings to add one.' },
      }
    }

    // Per-request overrides (popup toggle / follow-up thread) win over the
    // configured defaults for this one explanation.
    const verbosity = req.verbosity ?? settings.verbosity
    const targetLang = req.targetLang ?? settings.targetLang
    const pipelineSettings: PipelineSettings = { targetLang, verbosity }
    const doc = pipeline.extractDocument(req.html)

    // Build the summary once per (URL + content) and reuse it on later selections;
    // a content change on the same URL yields a new key and a fresh summary.
    const cacheKey = `${req.url}\x00${fingerprint(req.html)}`
    let summary = summaryCache.get(cacheKey)
    if (!summary) {
      summary = pipeline.buildSummary(doc, pipelineSettings)
      summaryCache.set(cacheKey, summary)
      if (summaryCache.size > MAX_CACHED_PAGES) {
        summaryCache.delete(summaryCache.keys().next().value as string)
      }
    }

    const payload = pipeline.assembleWith(summary, doc, {
      selection: term,
      settings: pipelineSettings,
      contextHint: req.contextHint,
      followUp: req.followUp,
    })

    try {
      const result = await deps.explain(
        cfg.provider,
        payload,
        { apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl, signal },
        onDelta,
      )
      return {
        ok: true,
        term,
        explanation: result.text,
        verbosity,
        targetLang,
        title: summary.title,
        usage: result.usage,
      }
    } catch (err) {
      if (err instanceof ProviderError) {
        return { ok: false, error: { kind: err.kind, message: err.message } }
      }
      return { ok: false, error: { kind: 'unknown', message: 'Something went wrong. Try again.' } }
    }
  }

  return { handle, cachedPages: () => summaryCache.size }
}
