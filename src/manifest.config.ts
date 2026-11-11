import { defineManifest } from '@crxjs/vite-plugin'

// Manifest V3 declaration. Content script, background service worker, and
// options page are all declared here; CRXJS rewrites the paths at build time.
export default defineManifest({
  manifest_version: 3,
  name: 'Linglens',
  version: '0.2.1',
  // Localized in public/_locales (en, zh_CN); the English text is kept in step
  // with the Chrome Web Store "Summary" field (max 132 chars).
  default_locale: 'en',
  description: '__MSG_extDescription__',
  // 119: content_scripts.match_origin_as_fallback (about:blank / blob: frames).
  minimum_chrome_version: '119',
  homepage_url: 'https://github.com/ZGhey/linglens',
  icons: {
    16: 'src/icons/icon-16.png',
    32: 'src/icons/icon-32.png',
    48: 'src/icons/icon-48.png',
    128: 'src/icons/icon-128.png',
  },
  permissions: ['storage', 'contextMenus'],
  host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
      // Also run inside iframes: webmail and document previewers render
      // attachments (e.g. PDF text layers) in embedded frames, often
      // cross-origin or about:blank/blob: ones.
      all_frames: true,
      match_about_blank: true,
      // Not in CRXJS's manifest typing yet.
      ...({ match_origin_as_fallback: true } as object),
    },
  ],
  // Toolbar icon opens the settings UI as a popup; the same page is also kept as
  // the options page so it stays reachable from chrome://extensions.
  action: {
    default_popup: 'src/options/index.html',
    default_icon: {
      16: 'src/icons/icon-16.png',
      32: 'src/icons/icon-32.png',
      48: 'src/icons/icon-48.png',
    },
  },
  options_page: 'src/options/index.html',
  // pdf.js (PDF reader page) decodes some image formats with bundled wasm.
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
  commands: {
    'explain-selection': {
      suggested_key: {
        default: 'Ctrl+Shift+E',
        mac: 'Command+Shift+E',
      },
      description: '__MSG_cmdExplainSelection__',
    },
  },
})
