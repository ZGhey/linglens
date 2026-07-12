import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Vitest is configured separately from vite.config.ts so the CRXJS plugin
// (which needs a real extension build context) does not run during unit tests.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    environmentMatchGlobs: [['tests/**/*.dom.test.ts', 'jsdom']],
  },
})
