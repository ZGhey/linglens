import { test as base, chromium, expect, type BrowserContext } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.resolve(dir, '../dist')

const test = base.extend<{ context: BrowserContext }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: ['--headless=new', `--disable-extensions-except=${distPath}`, `--load-extension=${distPath}`],
    })
    await use(context)
    await context.close()
  },
})

test('selecting text inside a cross-origin iframe explains it from that frame', async ({
  context,
}) => {
  let [sw] = context.serviceWorkers()
  if (!sw) sw = await context.waitForEvent('serviceworker')
  await sw.evaluate(() =>
    chrome.storage.local.set({
      'linglens.settings': {
        provider: 'openai',
        apiKeys: { openai: 'sk-e2e' },
        models: { openai: 'gpt-4o-mini' },
        targetLang: 'English',
      },
    }),
  )
  let requestBody = ''
  await context.route('https://api.openai.com/**', (route) => {
    requestBody = route.request().postData() ?? ''
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: 'MOCKED: framed runner.' } }] }),
    })
  })

  const page = await context.newPage()
  await page.goto('/frame-host.html')
  const frame = page.frameLocator('#preview')
  await expect(frame.locator('#term')).toBeAttached({ timeout: 10_000 })
  const inner = page.frames().find((f) => f.url().startsWith('http://127.0.0.1:5199/'))!

  await expect(async () => {
    await inner.evaluate(() => {
      const el = document.getElementById('term')!
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 120, clientY: 120 }))
    })
    await expect(frame.locator('#linglens-trigger-host')).toBeAttached({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })

  await frame.getByRole('button', { name: 'Explain with Linglens' }).click()
  await expect(frame.getByText('MOCKED: framed runner.')).toBeVisible({ timeout: 10_000 })
  // The document is the framed one, not the mail client around it.
  const prompt = JSON.parse(requestBody).messages[1].content as string
  expect(prompt).toContain('runner')
  expect(prompt).not.toContain('Mail client')
  // Nothing shows up in the top frame.
  await expect(page.locator('#linglens-popup-host')).toHaveCount(0)
})

test('a keyboard trigger is ignored by a background frame holding a selection', async ({
  context,
}) => {
  let [sw] = context.serviceWorkers()
  if (!sw) sw = await context.waitForEvent('serviceworker')
  await sw.evaluate(() =>
    chrome.storage.local.set({
      'linglens.settings': { provider: 'openai', apiKeys: { openai: 'sk-e2e' }, targetLang: 'English' },
    }),
  )
  let calls = 0
  await context.route('https://api.openai.com/**', (route) => {
    calls++
    return route.fulfill({ status: 500, body: '' })
  })
  const page = await context.newPage()
  await page.goto('/frame-host.html')
  await expect(page.frameLocator('#preview').locator('#term')).toBeAttached({ timeout: 10_000 })
  const inner = page.frames().find((f) => f.url().startsWith('http://127.0.0.1:5199/'))!
  // The framed page selects text programmatically while the user is in the top page.
  await inner.evaluate(() => {
    const range = document.createRange()
    range.selectNodeContents(document.getElementById('term')!)
    window.getSelection()!.addRange(range)
  })
  await page.locator('h1').click()
  // What the worker sends for the keyboard command: every frame of the tab.
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    await chrome.tabs.sendMessage(tab.id!, { type: 'TRIGGER_SELECTION' }).catch(() => {})
  })
  await page.waitForTimeout(1500)
  await expect(page.frameLocator('#preview').locator('#linglens-popup-host')).toHaveCount(0)
  expect(calls).toBe(0)
})

test('Linglens stays out of rich-text editor frames (designMode), but works in plain about:blank frames', async ({
  context,
}) => {
  const page = await context.newPage()
  await page.goto('/frame-host.html')
  // Two same-origin about:blank frames: a plain one (positive control) and an
  // editor one, like TinyMCE/CKEditor composers.
  await page.evaluate(() => {
    for (const id of ['plain', 'editor']) {
      const f = document.createElement('iframe')
      f.id = id
      document.body.append(f)
      const doc = f.contentDocument!
      doc.body.innerHTML = '<p>The <span id="term">runner</span> executes jobs.</p>'
      if (id === 'editor') doc.designMode = 'on'
    }
  })
  const selectIn = (id: string) =>
    page.evaluate((id) => {
      const doc = (document.getElementById(id) as HTMLIFrameElement).contentDocument!
      const el = doc.getElementById('term')!
      const range = doc.createRange()
      range.selectNodeContents(el)
      const sel = doc.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 20, clientY: 20 }))
    }, id)

  await expect(async () => {
    await selectIn('plain')
    await expect(page.frameLocator('#plain').locator('#linglens-trigger-host')).toBeAttached({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })

  await selectIn('editor')
  await page.waitForTimeout(1000)
  const hostsInEditor = await page.evaluate(
    () =>
      (document.getElementById('editor') as HTMLIFrameElement).contentDocument!.querySelectorAll(
        '[id^="linglens-"]',
      ).length,
  )
  expect(hostsInEditor).toBe(0)
})
