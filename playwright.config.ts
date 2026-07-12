import { defineConfig } from '@playwright/test'

// E2E runs against the built extension in dist/. Build before running:
//   npm run test:e2e  (runs `vite build` first)
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  webServer: {
    command: 'node e2e/static-server.mjs',
    port: 5199,
    reuseExistingServer: true,
    stdout: 'ignore',
  },
  use: {
    baseURL: 'http://localhost:5199',
  },
})
