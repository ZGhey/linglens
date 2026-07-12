import { test as base, chromium, expect, type BrowserContext } from '@playwright/test'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.resolve(dir, '../dist')
const pdfBytes = readFileSync(path.resolve(dir, 'sample.pdf'))

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

test('shows a one-time PDF-not-supported notice, then never again', async ({ context }) => {
  // Serve a PDF with the correct content-type so Chrome uses its built-in viewer.
  await context.route('https://example.test/doc.pdf', (route) =>
    route.fulfill({ status: 200, headers: { 'content-type': 'application/pdf' }, body: pdfBytes }),
  )

  const first = await context.newPage()
  await first.goto('https://example.test/doc.pdf')
  await expect(first.locator('#linglens-pdf-notice-host')).toBeAttached({ timeout: 10_000 })
  await first.close()

  // Second PDF visit: the once-ever flag is set, so no notice this time.
  const second = await context.newPage()
  await second.goto('https://example.test/doc.pdf')
  await second.waitForTimeout(1500)
  await expect(second.locator('#linglens-pdf-notice-host')).toHaveCount(0)
})
