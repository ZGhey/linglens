import { test as base, chromium, expect, type BrowserContext } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.resolve(dir, '../dist')

// Load the built extension into a persistent context. `--headless=new` is the
// only headless mode that supports extensions, so we pass it explicitly and keep
// Playwright's own `headless` flag off.
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

test('highlighting text renders a grounded explanation in the popup', async ({
  context,
  extensionId,
}) => {
  // Seed settings so the worker passes its missing-key guard.
  const options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/src/options/index.html`)
  await options.evaluate(() =>
    chrome.storage.local.set({
      'linglens.settings': {
        provider: 'openai',
        apiKeys: { openai: 'sk-e2e', gemini: '', anthropic: '' },
        models: { openai: 'gpt-4o-mini', gemini: '', anthropic: '' },
        targetLang: 'English',
      },
    }),
  )
  await options.close()

  // Mock the provider so the test needs no real key or network.
  await context.route('https://api.openai.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: 'MOCKED: a runner executes workflow jobs.' } }],
      }),
    }),
  )

  const page = await context.newPage()
  await page.goto('/fixture.html')

  // Select the target term; a selection now shows the (token-free) trigger icon,
  // not the popup. The content script registers its mouseup listener at
  // document_idle, so retry the one-shot dispatch until the icon attaches.
  await expect(async () => {
    await page.evaluate(() => {
      const el = document.getElementById('term')!
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 120, clientY: 120 }))
    })
    await expect(page.locator('#linglens-trigger-host')).toBeAttached({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })

  // Clicking the icon is what opens the popup and calls the (mocked) provider.
  await page.getByRole('button', { name: 'Explain with Linglens' }).click()

  // The (shadow-DOM) explanation renders. Playwright's text engine pierces open
  // shadow roots.
  await expect(page.locator('#linglens-popup-host')).toBeAttached({ timeout: 10_000 })
  await expect(page.getByText('MOCKED: a runner executes workflow jobs.')).toBeVisible({
    timeout: 10_000,
  })

  // Follow-up: type a question into the popup's thread input and get an answer
  // appended below the original explanation (same mocked provider).
  const followUpInput = page.locator('#linglens-popup-host input')
  await followUpInput.fill('what about self-hosted runners?')
  await followUpInput.press('Enter')
  await expect(page.getByText('what about self-hosted runners?')).toBeVisible({ timeout: 10_000 })
  // The mocked provider returns the same content for the follow-up answer, so
  // the text now appears twice: original + thread answer.
  await expect(page.getByText('MOCKED: a runner executes workflow jobs.')).toHaveCount(2, {
    timeout: 10_000,
  })
})
