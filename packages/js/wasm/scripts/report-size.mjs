#!/usr/bin/env node
// Reports the optimized .wasm binary size for both build targets and fails
// if either exceeds the documented budget. Run after `npm run build:wasm`.
import { statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

// See README.md "Bundle size" — budget is set with headroom above the
// measured wasm-opt -O4 output for this crate, to catch real regressions
// (e.g. an accidentally-added heavy dependency) without flapping on noise.
const BUDGET_BYTES = 250 * 1024

const files = [
  path.join(pkgRoot, 'wasm-web/echomirror_wasm_bg.wasm'),
  path.join(pkgRoot, 'wasm-node/echomirror_wasm_bg.wasm'),
]

let failed = false
for (const file of files) {
  if (!statSync(file, { throwIfNoEntry: false })) {
    console.error(`Missing ${path.relative(pkgRoot, file)} — run \`npm run build:wasm\` first.`)
    failed = true
    continue
  }
  const { size } = statSync(file)
  const kb = (size / 1024).toFixed(1)
  const budgetKb = (BUDGET_BYTES / 1024).toFixed(0)
  const over = size > BUDGET_BYTES
  if (over) failed = true
  console.log(`${path.relative(pkgRoot, file)}: ${kb} KB (budget ${budgetKb} KB) — ${over ? 'OVER BUDGET' : 'OK'}`)
}

if (failed) {
  console.error('\nOne or more .wasm artifacts are missing or exceed the size budget.')
  process.exit(1)
}
