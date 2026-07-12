import { parse, HTMLElement } from 'node-html-parser'
import type { Block, ExtractedDoc } from './types'

// Tags that never carry document meaning — dropped before extraction.
const NOISE = 'nav, header, footer, aside, script, style, form, noscript, template, svg'
const HEADINGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6'])
const PROSE = new Set(['P', 'LI', 'BLOCKQUOTE'])
const CODE = new Set(['PRE'])

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function pickMainRegion(root: HTMLElement): HTMLElement {
  const body = root.querySelector('body') ?? root
  return body.querySelector('main') ?? body.querySelector('article') ?? body
}

function extractTitle(root: HTMLElement, main: HTMLElement): string {
  const titleTag = normalize(root.querySelector('title')?.text ?? '')
  if (titleTag) return titleTag
  const h1 = main.querySelector('h1')
  return h1 ? normalize(h1.text) : ''
}

/**
 * Turn a raw HTML string into an ordered list of typed blocks. Pure: uses a
 * dependency-free parser so it runs in a service worker (no DOM) and in Node
 * tests alike. Code blocks are captured but flagged so prose stays clean.
 */
export function extractDocument(html: string): ExtractedDoc {
  const root = parse(html, { comment: false })
  const main = pickMainRegion(root)

  // Strip noise in place so it cannot be collected as prose.
  main.querySelectorAll(NOISE).forEach((el) => el.remove())

  const blocks: Block[] = []

  const walk = (el: HTMLElement): void => {
    const tag = el.tagName
    if (tag && HEADINGS.has(tag)) {
      const text = normalize(el.text)
      if (text) blocks.push({ kind: 'heading', level: Number(tag[1]), text })
      return
    }
    if (tag && CODE.has(tag)) {
      const text = el.text.replace(/\n{2,}/g, '\n').trim()
      if (text) blocks.push({ kind: 'code', text })
      return
    }
    if (tag && PROSE.has(tag)) {
      const text = normalize(el.text)
      if (text) blocks.push({ kind: 'prose', text })
      return
    }
    // Container element: descend into children in document order.
    for (const child of el.childNodes) {
      if (child instanceof HTMLElement) walk(child)
    }
  }

  walk(main)
  return { title: extractTitle(root, main), blocks }
}
