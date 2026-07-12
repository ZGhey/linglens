// Minimal static file server for E2E fixtures. No dependencies so it runs
// anywhere Playwright's webServer can spawn it.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, normalize } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT ?? 5199)

const server = createServer(async (req, res) => {
  const path = normalize(req.url === '/' ? '/fixture.html' : (req.url ?? '/')).replace(/^(\.\.[/\\])+/, '')
  try {
    const body = await readFile(join(root, path))
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
})

server.listen(port, () => console.log(`fixture server on http://localhost:${port}`))
