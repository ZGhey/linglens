import { test as base, chromium, expect, type BrowserContext } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.resolve(dir, '../dist')

const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${distPath}`,
        `--load-extension=${distPath}`,
      ],
    })
    await use(context)
    await context.close()
  },
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers()
    if (!sw) sw = await context.waitForEvent('serviceworker')
    await use(new URL(sw.url()).host)
  },
})

/** The popup card lives in an open shadow root; read its viewport rect. */
async function cardRect(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const host = document.getElementById('linglens-popup-host')!
    const card = host.shadowRoot!.querySelector('.cl-card') as HTMLElement
    const r = card.getBoundingClientRect()
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      height: r.height,
      viewportH: window.innerHeight,
      viewportW: window.innerWidth,
    }
  })
}

test('the popup stays inside the viewport when anchored low and grown by follow-ups', async ({
  context,
  extensionId,
}) => {
  const options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/src/options/index.html`)
  await options.evaluate(() =>
    chrome.storage.local.set({
      'linglens.settings': {
        provider: 'openai',
        apiKeys: { openai: 'sk-e2e' },
        models: { openai: 'gpt-4o-mini' },
        targetLang: 'English',
      },
    }),
  )
  await options.close()

  // A long answer so a few follow-ups genuinely grow the card.
  const ANSWER = 'MOCKED. ' + 'A runner executes workflow jobs on a machine. '.repeat(6)
  await context.route('https://api.openai.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: ANSWER } }] }),
    }),
  )

  const page = await context.newPage()
  await page.goto('/fixture.html')

  // Anchor the popup NEAR THE BOTTOM of the viewport — the user's scenario. The
  // content script anchors to the mouseup's client coords.
  const anchorY = await page.evaluate(() => window.innerHeight - 80)

  await expect(async () => {
    await page.evaluate((y) => {
      const el = document.getElementById('term')!
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 200, clientY: y }))
    }, anchorY)
    await expect(page.locator('#linglens-trigger-host')).toBeAttached({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Explain with Linglens' }).click()
  await expect(page.locator('#linglens-popup-host')).toBeAttached({ timeout: 10_000 })
  await expect(page.getByText('MOCKED.').first()).toBeVisible({ timeout: 10_000 })

  // Grow the thread with follow-ups — the reported trigger for going off-screen.
  const input = page.locator('#linglens-popup-host input')
  for (let i = 1; i <= 3; i++) {
    await input.fill(`follow-up question number ${i}?`)
    await input.press('Enter')
    await expect(page.getByText(`follow-up question number ${i}?`)).toBeVisible({ timeout: 10_000 })
  }

  const r = await cardRect(page)
  // The user's exact symptom: the card runs off the bottom of the screen.
  expect(
    r.bottom,
    `card bottom ${r.bottom} exceeds viewport height ${r.viewportH} (card height ${r.height}, top ${r.top})`,
  ).toBeLessThanOrEqual(r.viewportH)
  expect(r.top, `card top ${r.top} is above the viewport`).toBeGreaterThanOrEqual(0)
  expect(r.right).toBeLessThanOrEqual(r.viewportW)
  expect(r.left).toBeGreaterThanOrEqual(0)
})

test('the popup follows the anchored term when the page scrolls', async ({
  context,
  extensionId,
}) => {
  const options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/src/options/index.html`)
  await options.evaluate(() =>
    chrome.storage.local.set({
      'linglens.settings': {
        provider: 'openai',
        apiKeys: { openai: 'sk-e2e' },
        models: { openai: 'gpt-4o-mini' },
        targetLang: 'English',
      },
    }),
  )
  await options.close()

  await context.route('https://api.openai.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: 'MOCKED answer.' } }] }),
    }),
  )

  const page = await context.newPage()
  await page.goto('/fixture.html')
  // Make the page tall enough to scroll.
  await page.evaluate(() => (document.body.style.minHeight = '3000px'))

  await expect(async () => {
    await page.evaluate(() => {
      const el = document.getElementById('term')!
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 200, clientY: 200 }))
    })
    await expect(page.locator('#linglens-trigger-host')).toBeAttached({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Explain with Linglens' }).click()
  await expect(page.getByText('MOCKED answer.')).toBeVisible({ timeout: 10_000 })

  // Read the placement from the inline style, not getBoundingClientRect: the
  // card's entry animation translates it, which would pollute a measured rect.
  const placedTop = () =>
    page.evaluate(() => {
      const host = document.getElementById('linglens-popup-host')!
      const card = host.shadowRoot!.querySelector('.cl-card') as HTMLElement
      return parseFloat(card.style.top)
    })

  const before = await placedTop()

  // Scroll the page: the term moves up by SCROLL px, so the card must move with
  // it. A viewport-pinned card would not move at all — that is the "it isn't
  // pinned to the word" symptom. Scroll events fire on a frame boundary, so poll
  // rather than reading straight after scrollTo.
  const SCROLL = 120
  await page.evaluate((y) => window.scrollTo(0, y), SCROLL)

  await expect
    .poll(placedTop, {
      message: `card did not follow the term on scroll (placed top stayed at ${before}, expected ${before - SCROLL})`,
      timeout: 5000,
    })
    .toBe(before - SCROLL)
})
