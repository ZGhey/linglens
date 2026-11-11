// Records the README demo GIFs and the Chrome Web Store screenshots from the
// built extension. Run: npm run demo:record (builds first). Explanations come
// from scripts/demo/mock-llm.mjs (canned, streamed), so no real key is used.
//
// Frames are screenshots (Playwright video is blank under --headless=new);
// scripts/demo/assemble.mjs turns them into GIFs and store PNGs with ffmpeg.

import { test, chromium, type BrowserContext, type Page } from '@playwright/test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '../../dist')
const out = path.resolve(here, 'out')
const W = 1280
const H = 800

test.setTimeout(240_000)

type Lang = 'en' | 'zh'

async function launch(lang: Lang): Promise<{ ctx: BrowserContext; id: string }> {
  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    locale: lang === 'zh' ? 'zh-CN' : 'en-US',
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    args: ['--headless=new', `--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  })
  let [sw] = ctx.serviceWorkers()
  if (!sw) sw = await ctx.waitForEvent('serviceworker')
  const id = new URL(sw.url()).host
  await ctx.route('http://demo.test/**', (route) => {
    const file = new URL(route.request().url()).pathname.slice(1)
    const body = readFileSync(path.join(here, file))
    const type = file.endsWith('.pdf') ? 'application/pdf' : 'text/html; charset=utf-8'
    return route.fulfill({ status: 200, headers: { 'content-type': type }, body })
  })
  return { ctx, id }
}

async function configure(ctx: BrowserContext, lang: Lang, extra: object = {}) {
  const [sw] = ctx.serviceWorkers()
  await sw.evaluate(
    ({ lang, extra }) =>
      chrome.storage.local.set({
        'linglens.settings': {
          provider: 'custom',
          apiKeys: { custom: 'demo' },
          models: { custom: 'demo' },
          customBaseUrl: 'http://localhost:5299/v1',
          targetLang: lang === 'zh' ? '中文' : 'English',
          ...extra,
        },
      }),
    { lang, extra },
  )
}

/** Frame recorder: each snap is a screenshot plus how long it is shown. */
class Reel {
  private frames: { file: string; ms: number }[] = []
  constructor(private readonly name: string) {
    rmSync(path.join(out, name), { recursive: true, force: true })
    mkdirSync(path.join(out, name), { recursive: true })
  }
  async snap(page: Page, ms: number) {
    const file = path.join(out, this.name, `${String(this.frames.length).padStart(4, '0')}.png`)
    await page.screenshot({ path: file })
    this.frames.push({ file, ms })
  }
  save() {
    writeFileSync(path.join(out, `${this.name}.json`), JSON.stringify(this.frames))
  }
}

/** A drawn cursor (headless screenshots have none), moved with the mouse. */
async function cursorTo(page: Page, x: number, y: number, steps = 1) {
  await page.evaluate(() => {
    if (document.getElementById('demo-cursor')) return
    const c = document.createElement('div')
    c.id = 'demo-cursor'
    c.style.cssText =
      'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-2px,-1px)'
    c.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 2l7 19 2.6-8.4L21 10z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    document.documentElement.appendChild(c)
  })
  await page.mouse.move(x, y, { steps })
  await page.evaluate(
    ([x, y]) => {
      const c = document.getElementById('demo-cursor')!
      c.style.left = `${x}px`
      c.style.top = `${y}px`
    },
    [x, y],
  )
}

/** Glide the cursor in a few recorded steps. */
async function glide(page: Page, reel: Reel | null, from: [number, number], to: [number, number], n = 6) {
  for (let i = 1; i <= n; i++) {
    await cursorTo(page, from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n)
    if (reel) await reel.snap(page, 40)
  }
}

/** Drag-select a word inside an element, recording the drag. */
async function dragSelect(page: Page, reel: Reel | null, box: { x0: number; x1: number; y: number }) {
  await cursorTo(page, box.x0, box.y)
  await page.mouse.down()
  const n = 6
  for (let i = 1; i <= n; i++) {
    const x = box.x0 + ((box.x1 - box.x0) * i) / n
    await page.mouse.move(x, box.y)
    await cursorTo(page, x, box.y)
    if (reel) await reel.snap(page, 50)
  }
  await page.mouse.up()
}

/** Record the popup while it streams, until the follow-up input appears. */
async function recordStream(page: Page, reel: Reel | null) {
  for (let i = 0; i < 120; i++) {
    if (reel) await reel.snap(page, 110)
    else await page.waitForTimeout(110)
    const done = await page.evaluate(
      () => !!document.getElementById('linglens-popup-host')?.shadowRoot?.querySelector('.cl-ask input'),
    )
    if (done) break
  }
}

async function iconCenter(page: Page) {
  await page.locator('#linglens-trigger-host').waitFor({ state: 'attached' })
  return page.evaluate(() => {
    const b = document
      .getElementById('linglens-trigger-host')!
      .shadowRoot!.querySelector('button')!
      .getBoundingClientRect()
    return [b.left + b.width / 2, b.top + b.height / 2] as [number, number]
  })
}

/** Text-layer/word geometry: left/right of `word` inside the element matching `sel`. */
async function wordBox(page: Page, sel: string, word: string, occurrence = 0) {
  return page.evaluate(
    ({ sel, word, occurrence }) => {
      const els = [...document.querySelectorAll(sel)].filter((e) => e.textContent?.includes(word))
      const el = els[occurrence]
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const node = walker.currentNode as Text
        const i = node.data.indexOf(word)
        if (i < 0) continue
        const r = document.createRange()
        r.setStart(node, i)
        r.setEnd(node, i + word.length)
        const b = r.getBoundingClientRect()
        return { x0: b.left + 1, x1: b.right - 1, y: b.top + b.height / 2 }
      }
      throw new Error(`no ${word}`)
    },
    { sel, word, occurrence },
  )
}

async function webScene(lang: Lang, reelName: string | null, still: string | null) {
  const { ctx } = await launch(lang)
  await configure(ctx, lang)
  const page = await ctx.newPage()
  await page.goto('http://demo.test/article.html')
  await page.waitForTimeout(800)
  const reel = reelName ? new Reel(reelName) : null
  const box = await wordBox(page, '#term', 'hydration')
  await cursorTo(page, box.x0 - 160, box.y + 90)
  if (reel) await reel.snap(page, 700)
  await glide(page, reel, [box.x0 - 160, box.y + 90], [box.x0, box.y])
  await dragSelect(page, reel, box)
  const icon = await iconCenter(page)
  if (reel) await reel.snap(page, 600)
  await glide(page, reel, [box.x1, box.y], icon, 5)
  if (reel) await reel.snap(page, 300)
  await page.mouse.click(icon[0], icon[1])
  await cursorTo(page, icon[0] - 120, icon[1] + 260)
  await recordStream(page, reel)
  if (reel) {
    await reel.snap(page, 3200)
    reel.save()
  }
  if (still) await page.screenshot({ path: path.join(out, `${still}.png`) })
  await ctx.close()
}

async function pdfScene(lang: Lang, reelName: string | null, still: string | null) {
  const { ctx } = await launch(lang)
  await configure(ctx, lang)
  const page = await ctx.newPage()
  await page.goto('http://demo.test/notes.pdf')
  await page.waitForURL(/src\/reader\/index\.html/)
  await page.locator('.textLayer span', { hasText: 'Regularization' }).waitFor({ state: 'attached' })
  // The reader settles its zoom after the first render; measure after that.
  await page.waitForTimeout(1800)
  const reel = reelName ? new Reel(reelName) : null
  // The second "dropout" (Regularization), not the data-cleaning one above it.
  let box = await wordBox(page, '.textLayer span', 'dropout', 1)
  await cursorTo(page, box.x0 + 220, box.y - 120)
  if (reel) await reel.snap(page, 900)
  await glide(page, reel, [box.x0 + 220, box.y - 120], [box.x0, box.y])
  // Wait until the word stops moving (zoom/layout settled) before dragging.
  for (let i = 0; i < 30; i++) {
    const a = await wordBox(page, '.textLayer span', 'dropout', 1)
    await page.waitForTimeout(250)
    box = await wordBox(page, '.textLayer span', 'dropout', 1)
    if (Math.abs(a.x0 - box.x0) < 0.5 && Math.abs(a.y - box.y) < 0.5) break
  }
  await dragSelect(page, reel, box)
  const icon = await iconCenter(page)
  if (reel) await reel.snap(page, 600)
  await glide(page, reel, [box.x1, box.y], icon, 5)
  await page.mouse.click(icon[0], icon[1])
  await cursorTo(page, icon[0] - 140, icon[1] + 300)
  await recordStream(page, reel)
  if (reel) {
    await reel.snap(page, 3400)
    reel.save()
  }
  if (still) await page.screenshot({ path: path.join(out, `${still}.png`) })
  await ctx.close()
}

async function setupScene(lang: Lang, reelName: string | null, still: string | null) {
  const { ctx, id } = await launch(lang)
  await ctx.route('https://generativelanguage.googleapis.com/**', async (route) => {
    await new Promise((r) => setTimeout(r, 900))
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [{ name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'] }],
      }),
    })
  })
  const page = await ctx.newPage()
  await page.goto(`chrome-extension://${id}/src/options/index.html`)
  await page.evaluate(() => (document.body.style.zoom = '1.3'))
  await page.waitForTimeout(500)
  const reel = reelName ? new Reel(reelName) : null
  const field = await page.locator('#geminiKey').boundingBox()
  // Rects already include the CSS zoom.
  const fx = field!.x + 40
  const fy = field!.y + field!.height / 2
  await cursorTo(page, fx + 200, fy + 140)
  if (reel) await reel.snap(page, 1400)
  await glide(page, reel, [fx + 200, fy + 140], [fx, fy])
  await page.locator('#geminiKey').click()
  // "Paste": the key appears at once, as it would from the clipboard.
  await page.locator('#geminiKey').fill('AIzaSyD3m0-Linglens-demo-key-0000000000')
  await cursorTo(page, fx + 260, fy + 120)
  for (let i = 0; i < 24; i++) {
    if (reel) await reel.snap(page, 120)
    else await page.waitForTimeout(120)
    const ok = await page.locator('#geminiStatus.ok').count()
    if (ok) break
  }
  if (reel) {
    await reel.snap(page, 3000)
    reel.save()
  }
  if (still) await page.screenshot({ path: path.join(out, `${still}.png`) })
  await ctx.close()
}

async function settingsScene(lang: Lang, still: string) {
  const { ctx, id } = await launch(lang)
  const [sw] = ctx.serviceWorkers()
  await sw.evaluate((lang) => {
    const zh = lang === 'zh'
    return chrome.storage.local.set({
      'linglens.settings': {
        provider: 'gemini',
        apiKeys: { gemini: 'AIzaSyD3m0' },
        models: { gemini: 'gemini-3.1-flash-lite' },
        targetLang: zh ? '中文' : 'English',
      },
    })
  }, lang)
  const page = await ctx.newPage()
  await page.goto(`chrome-extension://${id}/src/options/index.html`)
  await page.evaluate(() => (document.body.style.zoom = '1.3'))
  await page.locator('#tab-btn-settings').click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(out, `${still}.png`) })
  await ctx.close()
}

test('record demo reels and store stills', async () => {
  mkdirSync(out, { recursive: true })
  // README GIFs (Chinese UI + Chinese explanations: the multilingual wedge).
  await webScene('zh', 'gif-web', 'zh-web')
  await pdfScene('zh', 'gif-pdf', 'zh-pdf')
  await setupScene('zh', 'gif-setup', 'zh-setup')
  await settingsScene('zh', 'zh-settings')
  // English stills for the default store listing.
  await webScene('en', null, 'en-web')
  await pdfScene('en', null, 'en-pdf')
  await setupScene('en', null, 'en-setup')
  await settingsScene('en', 'en-settings')
})
