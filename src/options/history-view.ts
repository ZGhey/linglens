// Explained-term history rendering for the settings page. Reads entries from
// storage and builds the collapsible list; expanding an entry shows the stored
// explanation — nothing here talks to a provider.

import { loadHistory, clearHistory, type HistoryEntry } from '@/history'

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function renderEntry(entry: HistoryEntry): HTMLElement {
  const item = document.createElement('details')
  const summary = document.createElement('summary')

  const term = document.createElement('b')
  term.textContent = entry.term
  summary.appendChild(term)

  const when = document.createElement('span')
  when.className = 'when'
  const source = entry.title || safeHost(entry.url)
  when.textContent = ` — ${source} · ${new Date(entry.at).toLocaleDateString()}`
  summary.appendChild(when)
  item.appendChild(summary)

  const body = document.createElement('p')
  body.textContent = entry.explanation
  item.appendChild(body)

  // Defense in depth: only link out to http(s) URLs, even though entries are
  // recorded from location.href and can't normally carry another scheme.
  if (/^https?:/i.test(entry.url)) {
    const link = document.createElement('a')
    link.href = entry.url
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.textContent = 'Open page'
    link.style.fontSize = '12px'
    item.appendChild(link)
  }
  return item
}

/** Render the history list into `container`, toggling the clear button's
 * visibility with whether anything is stored. */
async function renderHistory(container: HTMLElement, clearBtn: HTMLButtonElement): Promise<void> {
  const entries = await loadHistory()
  container.innerHTML = ''
  clearBtn.hidden = entries.length === 0

  if (entries.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'Nothing explained yet.'
    container.appendChild(empty)
    return
  }
  for (const entry of entries) container.appendChild(renderEntry(entry))
}

/** Wire the history section: initial render plus the clear button. Returns a
 * refresh callback so callers can re-render after changing the retained set
 * (e.g. lowering the cap on save). */
export function mountHistory(container: HTMLElement, clearBtn: HTMLButtonElement): () => void {
  const refresh = () => void renderHistory(container, clearBtn)
  clearBtn.addEventListener('click', () => void clearHistory().then(refresh))
  refresh()
  return refresh
}
