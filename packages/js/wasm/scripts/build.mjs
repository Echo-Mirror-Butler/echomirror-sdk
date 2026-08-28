#!/usr/bin/env node
// Builds the echomirror-wasm crate for both wasm-pack targets — `web`
// (browser ESM, fetch-based instantiation) and `nodejs` (CJS, sync
// require-based instantiation) — in two build variants:
//
//   Scalar (baseline):  wasm-web/       wasm-node/
//   SIMD128:            wasm-web-simd/  wasm-node-simd/
//
// wasm-opt runs automatically as part of `wasm-pack build --release`,
// configured via [package.metadata.wasm-pack.profile.release] in the
// crate's Cargo.toml. The SIMD build additionally passes --enable-simd to
// wasm-opt explicitly so the optimizer can apply SIMD-aware passes on top.
//
// The SIMD build is gated behind RUSTFLAGS="-C target-feature=+simd128"
// and the `simd` Cargo feature. wasm-opt's --enable-simd flag is required
// to preserve (and further optimize) the SIMD intrinsics in the output —
// without it, wasm-opt would strip unsupported instructions.
//
// Pass WASM_BUILD_DEV=1 for an unoptimized --dev build (scalar only) during
// local iteration. Pass WASM_BUILD_SIMD_ONLY=1 to skip the scalar build
// when you only need to inspect the SIMD artifact.

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoRoot = path.resolve(pkgRoot, '../../..')
const crateDir = path.join(repoRoot, 'crates/echomirror-wasm')

const dev = process.env.WASM_BUILD_DEV === '1'
const simdOnly = process.env.WASM_BUILD_SIMD_ONLY === '1'
const profileArgs = dev ? ['--dev'] : ['--release']

// ── Build variants ────────────────────────────────────────────────────────────

/**
 * @typedef {{ wasmPackTarget: string, outDir: string, simd: boolean }} BuildVariant
 */

/** @type {BuildVariant[]} */
const variants = []

if (!simdOnly) {
  variants.push(
    { wasmPackTarget: 'web', outDir: path.join(pkgRoot, 'wasm-web'), simd: false },
    { wasmPackTarget: 'nodejs', outDir: path.join(pkgRoot, 'wasm-node'), simd: false },
  )
}

if (!dev) {
  // SIMD builds are only produced for release — the dev build skips them to
  // keep the inner-loop turnaround fast. You can force a SIMD-only dev build
  // with: WASM_BUILD_SIMD_ONLY=1 WASM_BUILD_DEV=1 (though wasm-opt is a
  // no-op in --dev mode, so the SIMD numbers won't reflect optimized output).
  variants.push(
    { wasmPackTarget: 'web', outDir: path.join(pkgRoot, 'wasm-web-simd'), simd: true },
    { wasmPackTarget: 'nodejs', outDir: path.join(pkgRoot, 'wasm-node-simd'), simd: true },
  )
}

// ── Run builds ────────────────────────────────────────────────────────────────

for (const { wasmPackTarget, outDir, simd } of variants) {
  const label = `${wasmPackTarget}${simd ? ' [SIMD]' : ' [scalar]'}`
  console.log(
    `\n> wasm-pack build --target ${wasmPackTarget}${dev ? ' --dev' : ' --release'}${simd ? ' --features simd  (RUSTFLAGS=-C target-feature=+simd128)' : ''}`,
  )

  // For SIMD builds: inject the target-feature flag via RUSTFLAGS. We
  // intentionally do NOT set this globally — only the SIMD variant needs it,
  // and a global RUSTFLAGS would affect every crate in the workspace build.
  const env = { ...process.env }
  if (simd) {
    const existing = env.RUSTFLAGS ?? ''
    // Append so that any user-supplied RUSTFLAGS (e.g. instrument flags in CI)
    // are preserved.
    env.RUSTFLAGS = `${existing} -C target-feature=+simd128`.trim()
  }

  const result = spawnSync(
    'wasm-pack',
    [
      'build',
      crateDir,
      '--target',
      wasmPackTarget,
      '--out-dir',
      outDir,
      '--out-name',
      'echomirror_wasm',
      // wasm-pack 0.15 parses the variadic --features option greedily when
      // it comes before --release, forwarding --release to cargo twice.
      // Put profile flags first so Cargo receives each flag exactly once.
      ...profileArgs,
      ...(simd ? ['--features', 'simd'] : []),
    ],
    { stdio: 'inherit', env },
  )

  if (result.error) {
    console.error(
      '\nFailed to run wasm-pack. Install it with `cargo install wasm-pack` or ' +
        'ensure the `wasm-pack` npm devDependency is installed (npm ci).',
    )
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  // ── Post-process wasm-pack output ──────────────────────────────────────────

  // wasm-pack writes its own package.json/.gitignore/README into out-dir.
  // This package's own package.json + "imports" map is authoritative for
  // publishing, so drop the generated manifest files and keep only the
  // compiled JS/TS/WASM artifacts.
  for (const file of ['package.json', 'README.md', '.gitignore']) {
    const p = path.join(outDir, file)
    if (existsSync(p)) rmSync(p)
  }

  if (wasmPackTarget === 'nodejs') {
    // Force CommonJS interpretation of the nodejs-target output regardless
    // of this package's "type": "module" — wasm-pack's nodejs target always
    // emits `module.exports`-style CJS. Node resolves module systems by file
    // extension first, so renaming .js -> .cjs makes that unambiguous instead
    // of relying on a nested package.json override.
    for (const file of readdirSync(outDir)) {
      if (file.endsWith('.js')) {
        renameSync(path.join(outDir, file), path.join(outDir, file.replace(/\.js$/, '.cjs')))
      }
    }
  }

  // ── Re-optimize SIMD .wasm with wasm-opt --enable-simd ────────────────────
  //
  // wasm-pack runs wasm-opt automatically from [package.metadata.wasm-pack],
  // but that configuration doesn't thread --enable-simd through. Without this
  // flag, wasm-opt treats SIMD instructions as invalid and may silently drop
  // or mis-optimize them. We run a second wasm-opt pass here, in-place, with
  // --enable-simd added. The -O4 is repeated so the combined optimization
  // level matches the scalar build.
  if (simd && !dev) {
    const wasmFile = path.join(outDir, 'echomirror_wasm_bg.wasm')
    console.log(`\n> wasm-opt --enable-simd -O4 (in-place) on ${path.relative(pkgRoot, wasmFile)}`)

    const optResult = spawnSync(
      'wasm-opt',
      [wasmFile, '--enable-simd', '-O4', '-o', wasmFile],
      { stdio: 'inherit' },
    )

    if (optResult.error) {
      console.warn(
        '\nwasm-opt not found in PATH — skipping SIMD re-optimization pass.',
        'Install binaryen (brew install binaryen / apt install binaryen) for the full benefit.',
      )
    } else if (optResult.status !== 0) {
      console.error('\nwasm-opt SIMD pass failed — SIMD build may be invalid. Aborting.')
      process.exit(optResult.status ?? 1)
    }
  }

  console.log(`  ✓ ${label} → ${path.relative(pkgRoot, outDir)}`)
}

console.log('\nwasm-pack build complete.')
console.log('  Scalar:  wasm-web/  wasm-node/')
if (!dev) {
  console.log('  SIMD128: wasm-web-simd/  wasm-node-simd/')
  console.log(
    '\nThe SIMD builds require WASM SIMD128 support in the runtime.',
    'See packages/js/wasm/src/detect-simd.ts for the runtime detection logic.',
  )
}
