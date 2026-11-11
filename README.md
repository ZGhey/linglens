# Linglens

[![CI](https://github.com/ZGhey/linglens/actions/workflows/ci.yml/badge.svg)](https://github.com/ZGhey/linglens/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

**Select a term on any web page or PDF and get it explained — in your language, grounded in the document you're reading, using your own API key.**

![Linglens demo — select "hydration" in a React article, click the icon, and the explanation streams in, in Chinese, grounded in the article](docs/demo-web.gif)

Linglens is a Chrome (Manifest V3) extension for reading technical documentation
in a language that isn't your first. You know the words; what you don't know is
what a term means _here_ — "runner" in a CI doc, "sink" in a streaming doc,
"hydration" in a frontend doc. Highlight it, click the icon, and Linglens
explains it in the context of that page, written in the language you read best.

**Open source · no servers · no telemetry.** Bring your own key: it's stored
locally and never leaves your browser except in the request _you_ trigger to the
provider _you_ choose. Nothing goes to us — there is no "us" backend. (One caveat
you own, not us: a provider's _free_ tier may train on your prompts — Google
Gemini's does, its paid tier doesn't. Use a paid key or a local model if that
matters. See [PRIVACY.md](./PRIVACY.md).)

## Why another explainer?

Full-page translators translate words but don't _explain_ a term's meaning in
context, and they mangle code. Most AI explainers are English-only and run on
someone else's key, someone else's cost, and someone else's server. Linglens is
different on three axes:

- **Your language.** Explanations come back in the language you configure
  (English, 中文, 日本語, and more) — not just English.
- **Your key, your control.** Bring your own API key — OpenAI, Anthropic, Google Gemini, DeepSeek,
  or any OpenAI-compatible endpoint — including a **local model** that never
  leaves your machine. Real provider-reported token counts are shown per
  explanation, so you always know exactly what each answer used.
- **A conversation, not a one-shot.** Ask a follow-up right in the popup —
  "give an example", "how is this different from X?" — and keep the thread.

**Works in PDFs.** PDFs open in a built-in reader; the explanation is grounded in
the section you selected from — here "dropout" in *Regularization*, not the
data-cleaning "dropout" a paragraph above.

![Linglens in a PDF — selecting "dropout" in the Regularization section explains the regularization technique](docs/demo-pdf.gif)

**Set up in seconds.** Paste a free Gemini key (or connect OpenRouter, or bring
any provider's key) and it's checked automatically.

![Linglens setup — paste a free Gemini key and it connects](docs/demo-setup.gif)

## Features

- Click-to-explain: a selection shows a small icon; **only clicking it calls the
  LLM**, so an accidental highlight never costs a token.
- Streaming answers rendered in a floating dark-glass popup that reads on any
  page (light or dark).
- Concise ↔ detailed length toggle; per-explanation token readout.
- Follow-up thread with running token-usage totals.
- Local, searchable history of the terms you've explained (no API call to
  re-read), with a configurable cap.
- Works in PDFs: PDFs open in a built-in reader (pdf.js) where you select and
  explain text just like on a web page — grounded in the whole PDF, including
  Chinese/Japanese/Korean documents. Switch back to Chrome's viewer per PDF or
  turn the reader off in settings.
- Works in Gmail's PDF attachment previews and inside embedded frames.
- Guided setup: a free Gemini key in ~30 seconds, one-click OpenRouter, or any
  provider's key — checked automatically when you paste it.
- English and Chinese interface, following your browser's language.
- Configure provider, model, key, language, and length from a toolbar popup.

## Install

### Chrome Web Store

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/linglens/fcababcnfnoibpmfcbghdkogfofkmejo).

### From source

```bash
git clone https://github.com/ZGhey/linglens
cd linglens
npm install
npm run build        # outputs to dist/
```

Then in Chrome: open `chrome://extensions`, enable **Developer mode**, click
**Load unpacked**, and select the `dist/` folder. Pin the toolbar icon.

## Quick start

1. Click the pinned Linglens icon and choose **Set up**.
2. Easiest: **Free Gemini key** — open Google AI Studio, sign in with your
   Google account, click **Create API key**, and paste the key back into
   Linglens. It is checked and saved automatically (no credit card).
3. Already have a key? Choose **Enter it manually** and pick your provider (or
   point the **Custom (OpenAI-compatible)** provider at a local model — no key
   needed for most local servers, enter any placeholder).
4. Choose your explanation language.
5. On any page or PDF, select a term → click the icon that appears.

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

## Contributing

Issues and pull requests welcome. Dev setup is above; the architecture overview
lives in [CLAUDE.md](./CLAUDE.md). CI (typecheck + unit + e2e) runs on every PR.

## License

[MIT](./LICENSE).
