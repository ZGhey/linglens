import { defineConfig } from '@playwright/test'

// Demo recording only (not part of the test suite): npm run demo:record
export default defineConfig({
  testDir: '.',
  testMatch: 'record.spec.ts',
  timeout: 300_000,
  workers: 1,
  reporter: 'list',
  webServer: {
    command: 'node scripts/demo/mock-llm.mjs',
    port: 5299,
    reuseExistingServer: true,
    stdout: 'ignore',
    cwd: '../..',
  },
})
