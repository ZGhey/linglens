import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.resolve(dir, '../dist')
const paperPdf = readFileSync(path.resolve(dir, 'paper.pdf'))
const cjkPdf = readFileSync(path.resolve(dir, 'cjk.pdf'))

const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: ['--headless=new', `--disable-extensions-except=${distPath}`, `--load-extension=${distPath}`],
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

async function seedSettings(context: BrowserContext, extensionId: string, extra: object = {}) {
  const options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/src/options/index.html`)
  await options.evaluate(
    (extra) =>
      chrome.storage.local.set({
        'linglens.settings': {
          provider: 'openai',
          apiKeys: { openai: 'sk-e2e', gemini: '', anthropic: '' },
          models: { openai: 'gpt-4o-mini', gemini: '', anthropic: '' },
          targetLang: 'English',
          ...extra,
        },
      }),
    extra,
  )
  await options.close()
}

function servePdf(context: BrowserContext, url: string, body: Buffer) {
  return context.route(url, (route) =>
    route.fulfill({ status: 200, headers: { 'content-type': 'application/pdf' }, body }),
  )
}

/** Select the n-th occurrence of `word` inside the pdf.js text layer and
 *  release the mouse over it, like a user drag-select. */
async function selectInTextLayer(page: Page, word: string, occurrence = 0) {
  await page.evaluate(
    ({ word, occurrence }) => {
      const spans = [...document.querySelectorAll('.textLayer span')].filter((s) =>
        s.textContent?.includes(word),
      )
      const span = spans[occurrence]
      if (!span) throw new Error(`no text-layer span with ${word}`)
      const text = span.firstChild!
      const start = text.textContent!.indexOf(word)
      const range = document.createRange()
      range.setStart(text, start)
      range.setEnd(text, start + word.length)
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)
      const r = range.getBoundingClientRect()
      span.dispatchEvent(
        new MouseEvent('mouseup', { bubbles: true, clientX: r.left + 2, clientY: r.bottom }),
      )
    },
    { word, occurrence },
  )
}

test('a PDF opens in the Linglens reader and explains the selected occurrence', async ({
  context,
  extensionId,
}) => {
  await seedSettings(context, extensionId)
  await servePdf(context, 'https://example.test/paper.pdf', paperPdf)

  let requestBody = ''
  await context.route('https://api.openai.com/**', (route) => {
    requestBody = route.request().postData() ?? ''
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: 'MOCKED: dropout regularizes.' } }] }),
    })
  })

  const page = await context.newPage()
  await page.goto('https://example.test/paper.pdf')
  await page.waitForURL(`chrome-extension://${extensionId}/src/reader/index.html?file=*`, {
    timeout: 15_000,
  })
  await expect(page.locator('.textLayer').getByText('Regularization')).toBeAttached({
    timeout: 15_000,
  })

  // Second occurrence of "dropout" sits under the "Regularization" heading.
  await selectInTextLayer(page, 'dropout', 1)
  await page.getByRole('button', { name: 'Explain with Linglens' }).click()
  await expect(page.getByText('MOCKED: dropout regularizes.')).toBeVisible({ timeout: 15_000 })

  // Grounded in the PDF: the outline, and as local section the selected
  // occurrence's paragraph — not the first match in the document.
  const prompt = JSON.parse(requestBody).messages[1].content as string
  expect(prompt).toContain('- Regularization')
  const local = prompt.split('Local section')[1].split('Selected term')[0]
  expect(local).toContain('randomly disables units')
  expect(local).not.toContain('data-cleaning step')
})

test('the keyboard-shortcut trigger reaches the reader tab', async ({ context, extensionId }) => {
  await seedSettings(context, extensionId)
  await servePdf(context, 'https://example.test/paper.pdf', paperPdf)
  await context.route('https://api.openai.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: 'MOCKED: via shortcut.' } }] }),
    }),
  )

  const page = await context.newPage()
  await page.goto('https://example.test/paper.pdf')
  await page.waitForURL(/src\/reader\/index\.html/, { timeout: 15_000 })
  await expect(page.locator('.textLayer').getByText('Regularization')).toBeAttached({
    timeout: 15_000,
  })
  await selectInTextLayer(page, 'Regularization')

  // Send what the worker sends on the command / context-menu click: the
  // runtime broadcast addressed to the reader's tab.
  const tabId = await page.evaluate(async () => (await chrome.tabs.getCurrent())!.id!)
  const [sw] = context.serviceWorkers()
  await sw.evaluate(async (tabId) => {
    await chrome.runtime.sendMessage({ type: 'TRIGGER_SELECTION', tabId }).catch(() => {})
  }, tabId)
  await expect(page.getByText('MOCKED: via shortcut.')).toBeVisible({ timeout: 15_000 })
})

test('Chinese PDF text decodes through the bundled CMaps', async ({ context, extensionId }) => {
  await seedSettings(context, extensionId)
  await servePdf(context, 'https://example.test/cjk.pdf', cjkPdf)
  const page = await context.newPage()
  await page.goto('https://example.test/cjk.pdf')
  await page.waitForURL(/src\/reader\/index\.html/, { timeout: 15_000 })
  await expect(page.locator('.textLayer')).toContainText('上下文感知', { timeout: 15_000 })
})

test('a PDF that cannot be refetched stays in Chrome’s viewer', async ({
  context,
  extensionId,
}) => {
  await seedSettings(context, extensionId)
  // Like a one-time download link: the tab's load succeeds, every later
  // request is refused. The worker's pre-check must keep the tab where it is.
  let served = 0
  await context.route('https://example.test/once.pdf', (route) => {
    served++
    return served === 1
      ? route.fulfill({ status: 200, headers: { 'content-type': 'application/pdf' }, body: paperPdf })
      : route.fulfill({ status: 403, body: 'gone' })
  })
  const page = await context.newPage()
  const visitedReader: string[] = []
  page.on('framenavigated', (f) => {
    if (f.url().includes('/src/reader/')) visitedReader.push(f.url())
  })
  await page.goto('https://example.test/once.pdf')
  await page.waitForTimeout(2500)
  expect(visitedReader).toEqual([])
  expect(page.url()).toBe('https://example.test/once.pdf')
  expect(await page.evaluate(() => document.contentType)).toBe('application/pdf')
})

test('a PDF the reader fails to load goes back to Chrome’s viewer', async ({
  context,
  extensionId,
}) => {
  await seedSettings(context, extensionId)
  // Tab load and the worker's pre-check succeed; the reader's own load gets a
  // body pdf.js can't parse. Going back to Chrome's viewer then works.
  let served = 0
  await context.route('https://example.test/twice.pdf', (route) => {
    served++
    return served === 3
      ? route.fulfill({ status: 200, headers: { 'content-type': 'application/pdf' }, body: '%PDF-1.4 broken' })
      : route.fulfill({ status: 200, headers: { 'content-type': 'application/pdf' }, body: paperPdf })
  })
  const page = await context.newPage()
  await page.goto('https://example.test/twice.pdf')
  await page.waitForURL(/src\/reader\/index\.html/, { timeout: 15_000 })
  await page.waitForURL('https://example.test/twice.pdf', { timeout: 15_000 })
  await page.waitForTimeout(1000)
  expect(page.url()).toBe('https://example.test/twice.pdf')
  expect(await page.evaluate(() => document.contentType)).toBe('application/pdf')
})

test('a phrase selected across a line wrap gets the icon and is explained whole', async ({
  context,
  extensionId,
}) => {
  await seedSettings(context, extensionId)
  await servePdf(context, 'https://example.test/paper.pdf', paperPdf)
  let requestBody = ''
  await context.route('https://api.openai.com/**', (route) => {
    requestBody = route.request().postData() ?? ''
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: 'MOCKED: wrapped phrase.' } }] }),
    })
  })
  const page = await context.newPage()
  await page.goto('https://example.test/paper.pdf')
  await page.waitForURL(/src\/reader\/index\.html/, { timeout: 15_000 })
  const line1 = page.locator('.textLayer span', { hasText: 'Here dropout randomly' })
  const line2 = page.locator('.textLayer span', { hasText: 'which forces the network' })
  await expect(line2).toBeAttached({ timeout: 15_000 })

  // Real mouse drag from "training," at the end of line 1 into line 2.
  const b1 = (await line1.boundingBox())!
  const b2 = (await line2.boundingBox())!
  await page.mouse.move(b1.x + b1.width * 0.78, b1.y + b1.height / 2)
  await page.mouse.down()
  await page.mouse.move(b2.x + b2.width * 0.3, b2.y + b2.height / 2, { steps: 8 })
  await page.mouse.up()

  await page.getByRole('button', { name: 'Explain with Linglens' }).click()
  await expect(page.getByText('MOCKED: wrapped phrase.')).toBeVisible({ timeout: 15_000 })
  const prompt = JSON.parse(requestBody).messages[1].content as string
  const term = prompt.match(/Selected term: "([^"]*)"/)?.[1] ?? ''
  expect(term).toContain('training, which')
  expect(term).not.toMatch(/\n/)
})

test('with the reader turned off, PDFs stay in Chrome’s viewer', async ({
  context,
  extensionId,
}) => {
  await seedSettings(context, extensionId, { pdfReader: false })
  await servePdf(context, 'https://example.test/paper.pdf', paperPdf)
  const page = await context.newPage()
  await page.goto('https://example.test/paper.pdf')
  await page.waitForTimeout(2000)
  expect(page.url()).toBe('https://example.test/paper.pdf')
})

test('Back from the reader does not bounce into the reader again', async ({
  context,
  extensionId,
}) => {
  await seedSettings(context, extensionId)
  await servePdf(context, 'https://example.test/paper.pdf', paperPdf)
  const page = await context.newPage()
  await page.goto('/fixture.html')
  await page.goto('https://example.test/paper.pdf')
  await page.waitForURL(/src\/reader\/index\.html/, { timeout: 15_000 })
  await page.goBack()
  await page.waitForTimeout(2000)
  // Back lands on the PDF in Chrome's viewer and stays there; one more Back
  // reaches the page before it.
  expect(page.url()).toBe('https://example.test/paper.pdf')
  await page.goBack()
  await expect(page).toHaveURL(/fixture\.html/)
})

test('“Chrome viewer” leaves the reader and stays out for that PDF', async ({
  context,
  extensionId,
}) => {
  await seedSettings(context, extensionId)
  await servePdf(context, 'https://example.test/paper.pdf', paperPdf)
  const page = await context.newPage()
  await page.goto('https://example.test/paper.pdf')
  await page.waitForURL(/src\/reader\/index\.html/, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Chrome viewer' }).click()
  await page.waitForURL('https://example.test/paper.pdf', { timeout: 15_000 })
  await page.reload()
  await page.waitForTimeout(2000)
  expect(page.url()).toBe('https://example.test/paper.pdf')
})

test('on a Chinese browser the reader keeps a neutral document language (text-layer metrics)', async () => {
  // A zh-CN document language makes the browser resolve the text layer's
  // generic sans-serif to a CJK font, so selections drift off the visible words.
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    locale: 'zh-CN',
    args: ['--headless=new', `--disable-extensions-except=${distPath}`, `--load-extension=${distPath}`],
  })
  try {
    await context.route('https://example.test/paper.pdf', (route) =>
      route.fulfill({ status: 200, headers: { 'content-type': 'application/pdf' }, body: paperPdf }),
    )
    const page = await context.newPage()
    await page.goto('https://example.test/paper.pdf')
    await page.waitForURL(/src\/reader\/index\.html/, { timeout: 15_000 })
    await expect(page.locator('#download')).toHaveText('下载') // UI is still Chinese
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en')
  } finally {
    await context.close()
  }
})
