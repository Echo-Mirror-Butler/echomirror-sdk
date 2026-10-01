#!/usr/bin/env node
// Load the built extension into headless Chromium and fail on any manifest or
// runtime load error (issue #216). Chrome rejects missing icons, a missing
// service worker, or an invalid CSP at install time, and installExtension()
// surfaces that rejection as a thrown error.
//
// Puppeteer is intentionally not a workspace dependency (it downloads a
// browser on install); CI installs it into a scratch prefix and points
// NODE_PATH at it:
//
//   npm install --prefix "$RUNNER_TEMP/smoke" puppeteer@24
//   NODE_PATH="$RUNNER_TEMP/smoke/node_modules" node scripts/smoke-load.mjs [dir]

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { EXTENSION_ROOT } from './validate-manifest.mjs'

const puppeteer = createRequire(import.meta.url)('puppeteer')
const dir = resolve(process.argv[2] ?? join(EXTENSION_ROOT, 'dist'))
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))

const browser = await puppeteer.launch({
  headless: true,
  pipe: true,
  enableExtensions: true,
  // GitHub's Ubuntu 24.04 runners block the unprivileged user namespaces the
  // Chromium sandbox needs.
  args: process.env.CI ? ['--no-sandbox'] : [],
})

let failed = false
try {
  const id = await browser.installExtension(dir)
  console.log(`✓ installed ${manifest.name} ${manifest.version} as ${id}`)

  const workerUrl = `chrome-extension://${id}/${manifest.background.service_worker}`
  await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url() === workerUrl, { timeout: 15_000 })
  console.log('✓ background service worker started')

  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  page.on('console', (msg) => msg.type() === 'error' && errors.push(`console: ${msg.text()}`))
  page.on('requestfailed', (req) => errors.push(`requestfailed: ${req.url()} (${req.failure()?.errorText})`))

  await page.goto(`chrome-extension://${id}/${manifest.action.default_popup}`, { waitUntil: 'load' })
  await page.waitForSelector('#check-btn', { timeout: 5_000 })

  const icons = Object.entries(manifest.icons)
  const rendered = await page.evaluate(
    (entries) =>
      Promise.all(
        entries.map(
          ([size, file]) =>
            new Promise((done) => {
              const img = new Image()
              img.onload = () => done({ size: Number(size), file, width: img.naturalWidth, height: img.naturalHeight })
              img.onerror = () => done({ size: Number(size), file, width: 0, height: 0 })
              img.src = `/${file}`
            }),
        ),
      ),
    icons,
  )
  for (const icon of rendered) {
    if (icon.width !== icon.size || icon.height !== icon.size) {
      errors.push(`icon ${icon.file} rendered at ${icon.width}x${icon.height}, expected ${icon.size}x${icon.size}`)
    }
  }
  console.log(`✓ popup loaded, ${rendered.length} icons checked`)

  if (errors.length) {
    failed = true
    console.error(`✗ popup errors:\n${errors.map((e) => `  - ${e}`).join('\n')}`)
  }
} catch (err) {
  failed = true
  console.error(`✗ extension failed to load from ${dir}:\n  ${err.message}`)
} finally {
  await browser.close()
}

process.exit(failed ? 1 : 0)
