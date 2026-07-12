// A small dismissible toast telling the user Linglens can't read PDFs yet.
// Chrome renders PDFs in its built-in viewer whose text selection lives in an
// internal frame the content script can't reach — so a selection never produces
// a page-DOM event and the trigger icon can't appear. Rather than look broken,
// we say so. Shadow DOM + DOM APIs only (no innerHTML) so it survives strict
// Trusted-Types pages, matching the popup's Midnight-Violet glass look.

import { ShadowHost } from './shadow-host'

const HOST_ID = 'linglens-pdf-notice-host'

const STYLES = `
  :host { all: initial; }
  .cl-toast {
    position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
    max-width: 300px; box-sizing: border-box;
    display: flex; align-items: center; gap: 8px;
    font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #f8fafc;
    background: rgba(15, 23, 42, 0.9);
    backdrop-filter: blur(14px) saturate(1.4);
    -webkit-backdrop-filter: blur(14px) saturate(1.4);
    border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
    padding: 10px 14px; cursor: pointer;
    animation: cl-toast-in 200ms ease-out;
  }
  @keyframes cl-toast-in { from { opacity: 0; transform: translateY(8px); } }
  .cl-dot { width: 8px; height: 8px; border-radius: 50%; background: #8b5cf6; flex: none; }
  @media (prefers-reduced-motion: reduce) { .cl-toast { animation: none; } }
`

class PdfNotice extends ShadowHost {
  constructor(message: string) {
    super(HOST_ID, STYLES)
    const toast = document.createElement('div')
    toast.className = 'cl-toast'
    const dot = document.createElement('span')
    dot.className = 'cl-dot'
    const text = document.createElement('span')
    text.textContent = message
    toast.append(dot, text)
    toast.addEventListener('click', () => this.remove())
    this.root.appendChild(toast)
  }

  show(): void {
    this.mount()
  }
}

let current: PdfNotice | null = null

/** Show a single auto-dismissing toast (click to dismiss early). */
export function showPdfNotice(message: string): void {
  current?.remove()
  const notice = new PdfNotice(message)
  notice.show()
  current = notice
  setTimeout(() => {
    if (current === notice) {
      notice.remove()
      current = null
    }
  }, 5000)
}
