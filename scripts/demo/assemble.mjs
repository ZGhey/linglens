// Turns the frames recorded by record.spec.ts into README GIFs (docs/demo-*.gif)
// and Chrome Web Store screenshots (docs/store/{en,zh}-*.png, 1280x800, no alpha).
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const out = path.join(here, 'out')
const ff = (...args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' })

// --- GIFs ---------------------------------------------------------------------
for (const [reel, target] of [
  ['gif-web', 'docs/demo-web.gif'],
  ['gif-pdf', 'docs/demo-pdf.gif'],
  ['gif-setup', 'docs/demo-setup.gif'],
]) {
  const frames = JSON.parse(readFileSync(path.join(out, `${reel}.json`), 'utf8'))
  const list = frames.map((f) => `file '${f.file}'\nduration ${(f.ms / 1000).toFixed(3)}`).join('\n')
  // concat needs the last file repeated for its duration to apply.
  const concat = path.join(out, `${reel}.txt`)
  writeFileSync(concat, `${list}\nfile '${frames[frames.length - 1].file}'\n`)
  ff(
    '-f', 'concat', '-safe', '0', '-i', concat,
    '-vf', 'scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
    '-loop', '0', path.join(root, target),
  )
  console.log('wrote', target)
}

// --- Store screenshots ----------------------------------------------------------
const SHOTS = {
  en: [
    ['en-web', 'Select any term — get it explained in context'],
    ['en-pdf', 'Works in PDFs, grounded in the whole document'],
    ['zh-web', 'Explanations in your language'],
    ['en-setup', 'Set up in seconds with a free Gemini key'],
    ['en-settings', 'Your key, your provider — stored only in your browser'],
  ],
  zh: [
    ['zh-web', '划词即解释，结合上下文'],
    ['zh-pdf', 'PDF 里也能划词，结合整篇文档理解'],
    ['zh-setup', '30 秒免费获取 Gemini key'],
    ['zh-settings', '支持多家模型，key 只保存在你的浏览器'],
  ],
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const storeDir = path.join(root, 'docs/store')
rmSync(path.join(out, 'store'), { recursive: true, force: true })
mkdirSync(path.join(out, 'store'), { recursive: true })
for (const [lang, shots] of Object.entries(SHOTS)) {
  for (const [i, [still, caption]] of shots.entries()) {
    const img = readFileSync(path.join(out, `${still}.png`)).toString('base64')
    await page.setContent(`<!doctype html><html><body style="margin:0;width:1280px;height:800px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Segoe UI',sans-serif">
      <div style="height:60px;display:flex;align-items:center;padding:0 28px;color:#fff;font-size:21px;font-weight:650;letter-spacing:-0.01em;background:linear-gradient(90deg,#7c3aed,#a78bfa);box-shadow:0 2px 8px rgba(76,29,149,.3);position:relative;z-index:1">${i + 1} · ${caption}</div>
      <img src="data:image/png;base64,${img}" style="display:block;width:1280px;height:740px;object-fit:cover;object-position:top">
    </body></html>`)
    const tmp = path.join(out, 'store', `${lang}-${i + 1}.png`)
    await page.screenshot({ path: tmp })
    const target = path.join(storeDir, `${lang}-${i + 1}.png`)
    ff('-i', tmp, '-vf', 'format=rgb24', target)
    console.log('wrote', path.relative(root, target))
  }
}
await browser.close()
