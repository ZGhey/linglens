# Chrome Web Store listing — copy-paste

Fill the Developer Dashboard fields with the text below.

## Store listing tab

**Name**

```
Linglens — explain any term in your language
```

**Summary** (short description, ≤132 chars)

```
Select any term on a page; get it explained in your language, grounded in the page — with your own API key. BYOK, private.
```

**Category**: `Productivity` (alternative: `Developer Tools`)

**Language**: English

**Screenshots**: upload `docs/store/01-trigger.png` … `05-settings.png` (1280×800).

**Detailed description**

```
Linglens explains a word or phrase you select on any web page — in the language
you read best, grounded in the page you're reading, using your own LLM API key.

You know the word; what you don't know is what a term means HERE — "runner" in a
CI doc, "sink" in a streaming doc, "hydration" in a frontend doc. Highlight it,
click the icon, and Linglens explains it in context.

WHY LINGLENS
• Your language — explanations come back in the language you configure
  (English, 中文, 日本語, and more), not just English.
• Your key, your control — bring your own key: OpenAI, Anthropic, Google Gemini,
  DeepSeek, or any OpenAI-compatible endpoint, including a local model that never
  leaves your machine. Real token counts and an optional cost estimate are shown
  per explanation.
• A conversation — ask a follow-up right in the popup and keep the thread.

PRIVATE BY DESIGN
No accounts, no servers, no tracking. Your key and data stay on your device;
requests go straight from your browser to the provider you choose. A selection
alone sends nothing — only clicking the icon calls the LLM, so an accidental
highlight never costs a token.

Open source. Bring your own key.
```

## Privacy practices tab

**Single purpose**

```
Linglens explains a user-selected word or phrase using the context of the page
it appears on, written in the user's chosen language, via the user's own LLM API
key.
```

**Permission justifications**

- `host_permissions` (`<all_urls>`):
  ```
  Lets the user select and explain a term on any page they read, and sends that
  request to the LLM provider or custom endpoint the user configures. Page
  content is accessed only when the user explicitly triggers an explanation.
  ```
- `storage`:
  ```
  Stores the user's API key, settings, and local explanation history on their
  own device. Nothing is uploaded.
  ```
- `contextMenus`:
  ```
  Adds the right-click "Explain with Linglens" entry.
  ```

**Are you using remote code?** No.

**Data usage** — disclose "Website content" as handled (the selected text + a
bounded page summary). Key point for the form: this is sent **only to the LLM
provider the user configures**, at the user's explicit action — it is never
collected by, or transmitted to, the developer. Certify all three:
- Not sold or transferred to third parties outside the approved use case
  (delivering the explanation via the user's own provider).
- Not used for any purpose unrelated to the single purpose above.
- Not used to determine creditworthiness or for lending.

**Privacy policy URL**: the raw URL of `PRIVACY.md` once the repo is on GitHub,
e.g. `https://raw.githubusercontent.com/<you>/linglens/main/PRIVACY.md`
(or a GitHub Pages URL).
