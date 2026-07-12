// A small floating button shown next to a fresh text selection. It costs no
// tokens — clicking it is what opens the explanation popup and calls the LLM,
// so an accidental selection never bills the user. Rendered in a Shadow DOM
// (page CSS can't touch it) and built with DOM APIs only (no innerHTML) so it
// survives strict Trusted-Types pages. Keyboard / context-menu triggers bypass
// this and explain directly, since those are already explicit.

import { ShadowHost } from './shadow-host'

const HOST_ID = 'linglens-trigger-host'
const SVG_NS = 'http://www.w3.org/2000/svg'

const STYLES = `
  :host { all: initial; }
  .cl-trigger {
    position: fixed;
    z-index: 2147483646;
    width: 28px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    background: #8b5cf6; border: none; border-radius: 50%;
    box-shadow: 0 2px 10px rgba(76, 29, 149, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.12);
    cursor: pointer; padding: 0;
    transition: transform 150ms ease, background 150ms ease, box-shadow 150ms ease;
  }
  .cl-trigger:hover {
    background: #7c3aed; transform: scale(1.06);
    box-shadow: 0 4px 14px rgba(76, 29, 149, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.18);
  }
  .cl-trigger:active { transform: scale(0.94); }
  @media (prefers-reduced-motion: reduce) {
    .cl-trigger { transition: background 150ms ease; }
    .cl-trigger:hover, .cl-trigger:active { transform: none; }
  }
`

/** Build a small magnifier glyph with SVG DOM nodes (no innerHTML). */
function lensGlyph(): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '15')
  svg.setAttribute('height', '15')
  const circle = document.createElementNS(SVG_NS, 'circle')
  circle.setAttribute('cx', '10')
  circle.setAttribute('cy', '10')
  circle.setAttribute('r', '6')
  circle.setAttribute('fill', 'none')
  circle.setAttribute('stroke', '#fff')
  circle.setAttribute('stroke-width', '2')
  const handle = document.createElementNS(SVG_NS, 'line')
  handle.setAttribute('x1', '14.5')
  handle.setAttribute('y1', '14.5')
  handle.setAttribute('x2', '20')
  handle.setAttribute('y2', '20')
  handle.setAttribute('stroke', '#fff')
  handle.setAttribute('stroke-width', '2')
  handle.setAttribute('stroke-linecap', 'round')
  svg.append(circle, handle)
  return svg
}

export class TriggerIcon extends ShadowHost {
  private button: HTMLButtonElement

  constructor(onTrigger: () => void) {
    super(HOST_ID, STYLES)
    this.button = document.createElement('button')
    this.button.className = 'cl-trigger'
    this.button.title = 'Explain with Linglens'
    this.button.appendChild(lensGlyph())
    // Stop the click from bubbling to the page (and to our own outside-dismiss
    // handlers) before firing the explanation.
    this.button.addEventListener('click', (e) => {
      e.stopPropagation()
      onTrigger()
    })
    // Don't let the mousedown clear the selection or reach dismiss handlers.
    this.button.addEventListener('mousedown', (e) => e.preventDefault())
    this.root.appendChild(this.button)
  }

  /** Position the icon just past a viewport point and attach it to the page. */
  showAt(x: number, y: number): void {
    this.button.style.left = `${Math.min(x + 6, window.innerWidth - 34)}px`
    this.button.style.top = `${y + 6}px`
    this.mount()
  }
}
