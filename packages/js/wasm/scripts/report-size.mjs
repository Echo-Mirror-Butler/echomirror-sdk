#!/usr/bin/env node
// Reports the optimized .wasm binary size for all build targets and fails if
// any exceed the documented budget. Run after `npm run build:wasm`.
//
// Scalar builds are always required. SIMD builds are optional — the script
// reports them if present and warns (but does not fail) if they are absent,
// since WASM_BUILD_DEV=1 skips them intentionally.
import { statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

// See packages/js/wasm/BENCHMARKS.md for the measured wasm-opt -O4 output
// sizes. Budgets are set with headroom above the measured size to catch real
// regressions (e.g. an accidentally-added heavy dependency) without flapping
// on noise. SIMD budget is slightly higher because the SIMD binary may
// contain additional v128 instruction encodings.
const SCALAR_BUDGET_BYTES = 250 * 1024
const SIMD_BUDGET_BYTES = 260 * 1024

const required = [
  {
    file: path.join(pkgRoot, 'wasm-web/echomirror_wasm_bg.wasm'),
    label: 'wasm-web   [scalar]',
    budget: SCALAR_BUDGET_BYTES,
    required: true,
  },
  {
    file: path.join(pkgRoot, 'wasm-node/echomirror_wasm_bg.wasm'),
    label: 'wasm-node  [scalar]',
    budget: SCALAR_BUDGET_BYTES,
    required: true,
  },
  {
    file: path.join(pkgRoot, 'wasm-web-simd/echomirror_wasm_bg.wasm'),
    label: 'wasm-web   [simd]  ',
    budget: SIMD_BUDGET_BYTES,
    required: false,
  },
  {
    file: path.join(pkgRoot, 'wasm-node-simd/echomirror_wasm_bg.wasm'),
    label: 'wasm-node  [simd]  ',
    budget: SIMD_BUDGET_BYTES,
    required: false,
  },
]

let failed = false

for (const { file, label, budget, required: isRequired } of required) {
  const stat = statSync(file, { throwIfNoEntry: false })

  if (!stat) {
    if (isRequired) {
      console.error(`✗ ${label}  MISSING — run \`npm run build:wasm\` first.`)
      failed = true
    } else {
      console.log(
        `  ${label}  (not built — run without WASM_BUILD_DEV=1 to produce SIMD artifacts)`,
      )
    }
    continue
  }

  const { size } = stat
  const kb = (size / 1024).toFixed(1)
  const budgetKb = (budget / 1024).toFixed(0)
  const over = size > budget

  if (over) failed = true

  const icon = over ? '✗' : '✓'
  console.log(
    `${icon} ${label}  ${kb.padStart(7)} KB  (budget ${budgetKb} KB)  ${over ? 'OVER BUDGET' : 'OK'}`,
  )
}

if (failed) {
  console.error('\nOne or more .wasm artifacts are missing or exceed the size budget.')
  process.exit(1)
}
