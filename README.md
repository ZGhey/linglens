# Linglens

**Select a term on any web page and get it explained — in your language, grounded in the page you're reading, using your own API key.**

![Linglens demo — select a term, click the icon, get a grounded explanation, ask a follow-up, and read it in your language](docs/demo.gif)

Linglens is a Chrome (Manifest V3) extension for reading technical documentation
in a language that isn't your first. You know the words; what you don't know is
what a term means _here_ — "runner" in a CI doc, "sink" in a streaming doc,
"hydration" in a frontend doc. Highlight it, click the icon, and Linglens
explains it in the context of that page, written in the language you read best.

Bring your own key. Your key and your data stay on your machine; requests go
straight from your browser to the provider _you_ choose.

## Why another explainer?

Full-page translators translate words but don't _explain_ a term's meaning in
context, and they mangle code. Other AI explainers are English-only and run on
someone else's key and someone else's cost. Linglens is different on three axes:

- **Your language.** Explanations come back in the language you configure
  (English, 中文, 日本語, and more) — not just English.
- **Your key, your control.** BYOK: OpenAI, Anthropic, Google Gemini, DeepSeek,
  or any OpenAI-compatible endpoint — including a **local model** that never
  leaves your machine. Real provider-reported token counts and an optional USD
  cost estimate are shown per explanation, so you always know what you spent.
- **A conversation, not a one-shot.** Ask a follow-up right in the popup —
  "give an example", "how is this different from X?" — and keep the thread.

## Features

- Click-to-explain: a selection shows a small icon; **only clicking it calls the
  LLM**, so an accidental highlight never costs a token.
- Streaming answers rendered in a floating dark-glass popup that reads on any
  page (light or dark).
- Concise ↔ detailed length toggle; per-explanation token + cost readout.
- Follow-up thread with running usage/cost totals.
- Local, searchable history of the terms you've explained (no API call to
  re-read), with a configurable cap.
- Configure provider, model, key, language, length, and per-model prices from a
  toolbar popup.

## Install

### From source (available now)

```bash
git clone <this-repo>
cd linglens
npm install
npm run build        # outputs to dist/
```

Then in Chrome: open `chrome://extensions`, enable **Developer mode**, click
**Load unpacked**, and select the `dist/` folder. Pin the toolbar icon.

### Chrome Web Store

Coming soon.

## Quick start

1. Click the pinned Linglens icon to open settings.
2. Pick a provider and paste your API key (or point the **Custom
   (OpenAI-compatible)** provider at a local model — no key needed for most
   local servers, enter any placeholder).
3. Choose your explanation language.
4. On any page, select a term → click the icon that appears.

Your key is stored locally and sent only to the provider you chose. See
[PRIVACY.md](./PRIVACY.md).

## Development

```bash
npm run dev          # Vite dev server with HMR
npm run typecheck    # tsc --noEmit
npm test             # unit tests (Vitest)
npx vitest run tests/providers/stream.test.ts   # a single test file
npm run test:e2e     # builds, then Playwright drives the loaded extension
```

Architecture notes for contributors live in [CLAUDE.md](./CLAUDE.md).

## License

[MIT](./LICENSE).
