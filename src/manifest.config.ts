import { defineManifest } from '@crxjs/vite-plugin'

// Manifest V3 declaration. Content script, background service worker, and
// options page are all declared here; CRXJS rewrites the paths at build time.
export default defineManifest({
  manifest_version: 3,
  name: 'Linglens',
  version: '0.1.1',
  // Kept in step with the Chrome Web Store "Summary" field (max 132 chars).
  description:
    'Select any term on a page; get it explained in your language, grounded in the page — with your own API key. Private.',
  minimum_chrome_version: '116',
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
  commands: {
    'explain-selection': {
      suggested_key: {
        default: 'Ctrl+Shift+E',
        mac: 'Command+Shift+E',
      },
      description: 'Explain the current selection with Linglens',
    },
  },
})
