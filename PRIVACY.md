# Linglens — Privacy Policy

_Last updated: 2026-11_

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
- **Your settings** — chosen provider, model, base URL, target language, and
  explanation length.
- **Your history** — the terms you explained, their explanations, the page
  title/URL, and a timestamp, capped at the limit you set. Stored locally so
  you can re-read them without another API call; never uploaded.

Uninstalling the extension removes this local storage.

## What is sent, to whom, and when

Linglens only contacts the LLM provider **you** configure, and only when you
**explicitly trigger** an explanation — by clicking the trigger icon that
appears next to a selection, using the right-click menu, or pressing the
keyboard shortcut. Selecting text alone does **not** send anything. (The only
other provider requests are the key checks described under "Connecting a
provider account", which you start by pasting or connecting a key.)

When you trigger an explanation, the extension sends the following **directly
from your browser to your chosen provider's API** (or to the custom base URL
you entered):

- The selected term.
- A bounded summary of the page or PDF you are reading (title, heading
  outline, a short topic summary, and the section your selection sits in) —
  assembled locally from the document's content. Code blocks are excluded.
- For a follow-up question: the prior explanation and your follow-up turns.
- Your target language and length preference.

Your API key is included as the request's authentication. Nothing else — no
identifiers, no analytics — is attached.

**Your chosen provider then handles that request under their own privacy
policy.** Which provider receives your data is entirely your choice (OpenAI,
Anthropic, Google Gemini, DeepSeek, OpenRouter, or any OpenAI-compatible
endpoint you configure, including a local model that never leaves your
machine).

Note that a provider's **free tier may use your prompts to train or improve
their products** — Google's Gemini free tier does this, for example, while its
paid tier does not. This is the provider's policy, not Linglens's; check your
provider's terms, use a paid key, or run a local model if that matters to you.

## What Linglens does NOT do

- No first-party servers, accounts, or logins.
- No analytics, telemetry, tracking, or crash reporting.
- No selling or sharing of data with third parties (there is no data leaving
  your machine except the request you send to your own provider).
- No transmitting page, PDF or email content unless you trigger an
  explanation on a selection.

## Connecting a provider account

- **Free Gemini key:** Linglens opens Google AI Studio, where you create a key
  yourself. When you paste it, Linglens checks it by listing the models it can
  use (no text is generated) and stores it locally.
- **Other keys (OpenAI, Anthropic, DeepSeek, OpenRouter):** Linglens can open
  the provider's key page for you. When you paste a key in Settings, Linglens
  checks it the same way — one request to that provider's models-list (or
  key-info) endpoint, with the key as authentication; no text is generated and
  no page content is sent.
- **Connect OpenRouter:** Linglens opens OpenRouter's sign-in page. After you
  approve, OpenRouter redirects to Linglens's public project page with a
  one-time code; Linglens reads that code from the address, closes the tab and
  exchanges it (with a secret that never leaves your browser) for a key that
  belongs to your OpenRouter account. The key is stored locally like any other.

## The PDF reader

When the "Open PDFs in the Linglens reader" setting is on (the default), a PDF
you open is shown in Linglens's built-in reader instead of Chrome's viewer. The
reader downloads the PDF again from the same address (with your browser's
cookies, so PDFs behind a login keep working) and renders and indexes its text
**locally in your browser**, so that selecting text works and an explanation
can be grounded in the document. Nothing from the PDF leaves your machine
unless you trigger an explanation — and then only the bounded summary described
above. Turn the setting off to keep Chrome's own PDF viewer.

## Where Linglens runs

Linglens runs on the pages you visit, including inside embedded frames (for
example a document previewer inside a web app), so that selecting text there
works too. It stays out of rich-text editors (such as an email you are
composing) so nothing is inserted into what you write.

**Gmail attachment previews.** Gmail shows PDF attachments as images with a
hidden text layer that the browser can't select. On Gmail, when you drag or
double-click over such a preview, Linglens reads that hidden text **locally**
to find the words you selected and highlight them, and offers the usual icon.
Nothing is sent unless you then trigger an explanation — and then only the
bounded summary described above, built from the previewed document.

## Permissions, and why

- `storage` — to keep your key, settings, and history locally.
- `contextMenus` — to add the right-click "Explain with Linglens" entry.
- `host_permissions: <all_urls>` — so you can select and explain terms on any
  page, and so the extension can send your request to whatever provider or
  custom base URL you configure, and so the PDF reader can load the PDFs you
  open. Page content is read locally — to find what you selected, or when you
  trigger an explanation — and leaves your browser only in an explanation you
  trigger. PDFs shown in the reader are processed locally as described above.

## Contact

Linglens is open source. Questions or concerns: open an issue on the project's
repository.
