import { test as base, chromium, expect, type BrowserContext } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.resolve(dir, '../dist')

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

test('first run: pasting a Gemini key connects it without generating text', async ({
  context,
  extensionId,
}) => {
  const seen: string[] = []
  await context.route('https://generativelanguage.googleapis.com/**', (route) => {
    seen.push(route.request().url())
    const key = route.request().headers()['x-goog-api-key']
    return key === 'AIzaGOODKEY0000000000000000000000000000'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            models: [{ name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] }],
          }),
        })
      : route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 400, message: 'API key not valid.' } }),
        })
  })

  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/src/options/index.html`)

  // Unconfigured, in a tab: onboarding leads; the settings form waits.
  await expect(page.getByRole('heading', { name: /Free Gemini key/ })).toBeVisible()
  await expect(page.locator('#tab-settings')).toBeHidden()
  await expect(page.locator('.tabs')).toBeHidden()

  // "Open Google AI Studio" opens the key page in a new tab.
  const [studio] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Open Google AI Studio' }).click(),
  ])
  expect(studio.url()).toContain('aistudio.google.com/apikey')
  await studio.close()

  const keyInput = page.getByPlaceholder(/Paste your Gemini key/)
  await keyInput.fill('AIzaBADKEY')
  await expect(page.locator('#geminiStatus')).toContainText("doesn't look like a working Gemini key")

  await keyInput.fill('AIzaGOODKEY0000000000000000000000000000')
  await expect(page.locator('#geminiStatus')).toContainText('Connected (gemini-3.5-flash)')
  await expect(page.locator('#tab-settings')).toBeVisible()

  const stored = await page.evaluate(async () => (await chrome.storage.local.get('linglens.settings'))['linglens.settings'])
  expect(stored).toMatchObject({
    provider: 'gemini',
    apiKeys: { gemini: 'AIzaGOODKEY0000000000000000000000000000' },
    models: { gemini: 'gemini-3.5-flash' },
  })
  // Only the models list was called — never generateContent.
  expect(seen.length).toBeGreaterThan(0)
  for (const url of seen) expect(url).not.toContain('generateContent')
})

test('first run: "Enter it manually" reveals the normal settings form', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/src/options/index.html`)
  await page.getByRole('button', { name: 'Enter it manually' }).click()
  await expect(page.locator('#onboarding')).toBeHidden()
  await expect(page.locator('#provider')).toBeVisible()
})

test('configured: the settings page opens straight to the normal UI', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/src/options/index.html`)
  await page.evaluate(() =>
    chrome.storage.local.set({
      'linglens.settings': { provider: 'openai', apiKeys: { openai: 'sk-x' } },
    }),
  )
  await page.reload()
  await expect(page.locator('#onboarding')).toBeHidden()
  await expect(page.locator('.tabs')).toBeVisible()
})
