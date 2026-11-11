import { defineConfig, type Plugin } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import { fileURLToPath } from 'node:url'
import { cp } from 'node:fs/promises'
import manifest from './src/manifest.config'

/** pdf.js fetches its CMaps, standard fonts, wasm decoders and ICC profiles by
 *  URL at runtime, so Vite can't bundle them. Copy them into dist/pdfjs/ (the
 *  reader points pdf.js at chrome.runtime.getURL('pdfjs/...')). */
function copyPdfjsAssets(): Plugin {
  const dirs = ['cmaps', 'standard_fonts', 'wasm', 'iccs']
  return {
    name: 'linglens-copy-pdfjs-assets',
    apply: 'build',
    async writeBundle(options) {
      const outDir = options.dir ?? 'dist'
      for (const dir of dirs) {
        await cp(
          fileURLToPath(new URL(`./node_modules/pdfjs-dist/${dir}`, import.meta.url)),
          `${outDir}/pdfjs/${dir}`,
          { recursive: true },
        )
      }
    },
  }
}

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [crx({ manifest }), copyPdfjsAssets()],
  build: {
    target: 'es2022',
    rollupOptions: {
      // The PDF reader isn't referenced from the manifest (the worker opens it
      // by URL), so it is listed as an explicit page entry.
      input: { reader: 'src/reader/index.html' },
    },
  },
})
