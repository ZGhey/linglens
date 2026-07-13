# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Linglens

Chrome (Manifest V3) extension MVP. Select a word/phrase on any page and get a
plain-language explanation grounded in the **whole document's** meaning, in the
user's language, via their own API key (BYOK). See `README.md` for the product overview.

All logs, comments, and code are written in English.

## Commands

- `npm run dev` — Vite dev server with HMR (CRXJS).
- `npm run build` — typecheck (`tsc --noEmit`) then `vite build` to `dist/`.
- `npm run typecheck` — types only.
- `npm test` — unit tests (Vitest, jsdom). Single file: `npx vitest run tests/providers/stream.test.ts`. Watch: `npm run test:watch`.
- `npm run test:e2e` — builds, then Playwright loads the built `dist/` as an unpacked extension (`--load-extension`, `--headless=new`) and drives the real content-script/worker flow; `e2e/static-server.mjs` serves `e2e/fixture.html` on :5199.

To try it live: `npm run build`, then load `dist/` unpacked at chrome://extensions.

## Architecture

The MV3 manifest is generated from `src/manifest.config.ts` (CRXJS). The toolbar
**action popup** and the **options page** both point at `src/options/index.html`
— the settings UI is the pinned-icon popup and the fallback options door.

Four processes, split so API keys never enter page context:

- **Content script** (`src/content/`) — turns a selection into a floating
  **shadow-DOM popup** (`popup.ts`; page CSS can't bleed in). Opens a
  `chrome.runtime` port per explanation and streams token deltas into the card.
  `PopupSession` holds all per-popup state (thread, running token usage); the
  worker is stateless, so **follow-up requests carry the whole thread**, and
  verbosity + language are pinned into the session so mid-session setting changes
  don't shift an ongoing thread. `activePort` is disconnected on dismiss/replace
  so the worker aborts an abandoned stream.
- **Background service worker** (`src/background/`) — owns LLM calls and a
  per-page summary cache (keyed by URL + content fingerprint). `explain.ts` is an
  **injectable `ExplainService`** (`createExplainService(deps)`), unit-testable
  with no browser/network. EXPLAIN runs over a port (`EXPLAIN_PORT`); the port's
  `onDisconnect` fires an `AbortController`. Hard rule: **nothing calls the LLM
  until an explicit EXPLAIN** — no eager summarization. History is written
  fire-and-forget on first explanations only.
- **Pipeline** (`src/pipeline/`) — **pure, no browser/network deps**. `(html,
  selection, settings) → bounded PromptPayload` = document summary (title +
  heading outline + topic, code blocks excluded) + the local section the
  selection sits in. Context sent to the LLM is deliberately **bounded** (summary
  + local section, never the whole document). This is the highest-value test
  seam (fixture HTML in `tests/`, `tests/fixtures/`).
- **Providers** (`src/providers/`) — **data-driven registry**. `registry.ts`
  lists provider descriptors (`id/label/wire/baseUrl/models`, plus a
  user-configurable `custom` OpenAI-compatible entry). `wire.ts` defines one
  `WIRE_DEFS` entry per wire (`openai`/`anthropic`/`gemini`) and derives the
  buffered `WIRES` and streaming `STREAM_WIRES` from it. **Adding an
  OpenAI-compatible provider is one registry entry; a genuinely new API shape is
  one new wire.** `http.ts` holds the shared request preamble (key guard, fetch,
  abort, error mapping); `call.ts` buffers, `stream.ts` parses SSE and throws
  `StreamUnsupported` so the registry falls back to a buffered call (a non-SSE
  endpoint never surfaces as an error). Calls resolve to `ExplainResult {text,
  usage?}` where `usage` is always **provider-reported, never estimated**. The
  per-provider files (`openai.ts` etc.) are thin descriptor-bound re-exports kept
  as unit-test seams. Errors are typed `ProviderError` (`ErrorKind`) and never
  swallowed.
- **Settings** (`src/settings/`) — `chrome.storage.local`. Labels/models are
  derived from the provider registry (one source of truth). `usage.ts` holds the
  token-usage helper (`addUsage`); usage counts shown in the UI are always
  provider-reported and **never converted to a currency** (vendor prices go stale
  and add upkeep — a deliberate non-feature). `src/history/` persists explained
  terms.

The content↔worker wire contract lives in `src/messaging/types.ts`
(`ExplainRequest`/`ExplainResponse`, `ExplainStreamMessage`, `EXPLAIN_PORT`).

Test seams: the pure pipeline carries most coverage; provider
adapters mock the `fetch` boundary; the worker `ExplainService` uses injected
deps; the shadow-DOM popup and the full selection→popup flow are covered by a
small Playwright e2e.

## Agent skills

### Issue tracker

Issues and specs live as local markdown under `.scratch/<feature-slug>/` (current
feature: `context-lens`, issues in `.scratch/context-lens/issues/`). See
`docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file.
See `docs/agents/triage-labels.md`.

### Domain docs

Single-context convention (repo-root `CONTEXT.md` + `docs/adr/`), created on
demand by the domain-modeling skill. See `docs/agents/domain.md`.
