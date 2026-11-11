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
            models: [{ name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'] }],
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

  const keyInput = page.locator('#geminiKey')
  await keyInput.fill('AIzaBADKEY')
  await expect(page.locator('#geminiStatus')).toContainText("doesn't look like a working Gemini key")

  await keyInput.fill('AIzaGOODKEY0000000000000000000000000000')
  await expect(page.locator('#geminiStatus')).toContainText('Connected (gemini-3.1-flash-lite)')
  await expect(page.locator('#tab-settings')).toBeVisible()

  const stored = await page.evaluate(async () => (await chrome.storage.local.get('linglens.settings'))['linglens.settings'])
  expect(stored).toMatchObject({
    provider: 'gemini',
    apiKeys: { gemini: 'AIzaGOODKEY0000000000000000000000000000' },
    models: { gemini: 'gemini-3.1-flash-lite' },
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
  await page.getByRole('button', { name: 'Enter key' }).click()
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

test('Connect OpenRouter: approving on openrouter.ai saves the key without copying it', async ({
  context,
  extensionId,
}) => {
  // Tabs opened by the extension bypass Playwright routing on their first
  // navigation, so capture the auth URL in the worker instead of loading the
  // real openrouter.ai, then play OpenRouter's part: redirect to the callback.
  const [sw] = context.serviceWorkers()
  await sw.evaluate(() => {
    const g = globalThis as unknown as { __authUrl?: string }
    chrome.tabs.create = (async (props: chrome.tabs.CreateProperties) => {
      g.__authUrl = props.url
      return { id: 424242 } as chrome.tabs.Tab
    }) as typeof chrome.tabs.create
  })
  await context.route(/^https:\/\/github\.com\/ZGhey\/linglens\?/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>repo</h1>' }),
  )
  let exchangeBody: Record<string, string> = {}
  await context.route('https://openrouter.ai/api/v1/auth/keys', (route) => {
    exchangeBody = JSON.parse(route.request().postData() ?? '{}')
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"key":"sk-or-v1-e2e"}' })
  })
  await context.route('https://openrouter.ai/api/v1/key', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { is_free_tier: true, free_model_daily_requests: { used: 0, limit: 50, remaining: 50 } },
      }),
    }),
  )

  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/src/options/index.html`)
  await page.locator('#connectOpenRouter').click()
  await expect(page.locator('#openrouterStatus')).toContainText('Waiting for you to approve')

  const authUrl = await expect
    .poll(() => sw.evaluate(() => (globalThis as unknown as { __authUrl?: string }).__authUrl))
    .toBeTruthy()
    .then(() => sw.evaluate(() => (globalThis as unknown as { __authUrl: string }).__authUrl))
  const auth = new URL(authUrl)
  expect(auth.origin + auth.pathname).toBe('https://openrouter.ai/auth')
  expect(auth.searchParams.get('code_challenge_method')).toBe('S256')
  const callback = auth.searchParams.get('callback_url')!

  // A forged callback with the wrong state is ignored.
  const forged = await context.newPage()
  await forged.goto(callback.replace(/linglens_oauth=[^&]+/, 'linglens_oauth=forged') + '&code=evil')
  await page.waitForTimeout(500)
  expect(exchangeBody.code).toBeUndefined()

  // OpenRouter redirects the auth tab to the callback with a one-time code.
  const authTab = await context.newPage()
  // The worker closes the tab as soon as it sees the code, so the navigation
  // itself may be cut short.
  await authTab.goto(callback + '&code=test-code').catch(() => {})

  await expect(page.locator('#openrouterStatus')).toContainText('50 requests left today', {
    timeout: 15_000,
  })
  expect(exchangeBody.code).toBe('test-code')
  expect(exchangeBody.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(auth.toString()).not.toContain(exchangeBody.code_verifier)

  const stored = await page.evaluate(async () => (await chrome.storage.local.get('linglens.settings'))['linglens.settings'])
  expect(stored).toMatchObject({
    provider: 'openrouter',
    apiKeys: { openrouter: 'sk-or-v1-e2e' },
    models: { openrouter: 'openrouter/free' },
  })
  // The callback tab is closed once the code is taken.
  await expect.poll(() => authTab.isClosed()).toBe(true)
})
