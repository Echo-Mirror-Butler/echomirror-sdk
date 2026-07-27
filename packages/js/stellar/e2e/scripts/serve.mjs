/**
 * Bundle the e2e harness page with esbuild and serve it on port 4173.
 * Used as Playwright's webServer.
 */
import * as esbuild from 'esbuild'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appDir = join(here, '..', 'app')

await esbuild.build({
  entryPoints: [join(appDir, 'main.ts')],
  bundle: true,
  format: 'iife',
  outfile: join(appDir, 'bundle.js'),
  // stellar-base expects Node's Buffer & global in the browser
  inject: [join(here, 'buffer-shim.mjs')],
  define: { global: 'globalThis', 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
})

const types = { '.html': 'text/html', '.js': 'text/javascript' }
createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : (req.url ?? '/index.html')
  try {
    const body = await readFile(join(appDir, path))
    res.setHeader('content-type', types[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream')
    res.end(body)
  } catch {
    res.statusCode = 404
    res.end('not found')
  }
}).listen(4173, () => console.log('e2e harness on http://localhost:4173'))
