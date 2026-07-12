# Linglens — Privacy Policy

_Last updated: 2026-07_

Linglens is a bring-your-own-key (BYOK) browser extension. It has **no
first-party server**: nothing you do is sent to us, because there is no "us"
backend to send it to. This document describes exactly what the extension
touches and where it goes.

## What is stored, and where

Everything Linglens stores lives in your browser's local extension storage
(`chrome.storage.local`) on your machine. It is never uploaded anywhere by the
extension.

- **Your API key(s)** — one per provider you configure. Stored locally; used
  only to authenticate the requests you trigger to the provider you selected.
- **Your settings** — chosen provider, model, base URL, target language,
  explanation length, and per-model prices.
- **Your history** — the terms you explained, their explanations, the page
  title/URL, and a timestamp, capped at the limit you set. Stored locally so
  you can re-read them without another API call; never uploaded.

Uninstalling the extension removes this local storage.

## What is sent, to whom, and when

Linglens only contacts the LLM provider **you** configure, and only when you
**explicitly trigger** an explanation — by clicking the trigger icon that
appears next to a selection, using the right-click menu, or pressing the
keyboard shortcut. Selecting text alone does **not** send anything.

When you trigger an explanation, the extension sends the following **directly
from your browser to your chosen provider's API** (or to the custom base URL
you entered):

- The selected term.
- A bounded summary of the page you are reading (title, heading outline, a
  short topic summary, and the section your selection sits in) — assembled
  locally from the page's content. Code blocks are excluded.
- For a follow-up question: the prior explanation and your follow-up turns.
- Your target language and length preference.

Your API key is included as the request's authentication. Nothing else — no
identifiers, no analytics — is attached.

**Your chosen provider then handles that request under their own privacy
policy.** Which provider receives your data is entirely your choice (OpenAI,
Anthropic, Google Gemini, DeepSeek, or any OpenAI-compatible endpoint you
configure, including a local model that never leaves your machine).

## What Linglens does NOT do

- No first-party servers, accounts, or logins.
- No analytics, telemetry, tracking, or crash reporting.
- No selling or sharing of data with third parties (there is no data leaving
  your machine except the request you send to your own provider).
- No reading or transmitting page content unless you trigger an explanation on
  a selection.

## Permissions, and why

- `storage` — to keep your key, settings, and history locally.
- `contextMenus` — to add the right-click "Explain with Linglens" entry.
- `host_permissions: <all_urls>` — so you can select and explain terms on any
  page, and so the extension can send your request to whatever provider or
  custom base URL you configure. Page content is only read at the moment you
  trigger an explanation.

## Contact

Linglens is open source. Questions or concerns: open an issue on the project's
repository.
