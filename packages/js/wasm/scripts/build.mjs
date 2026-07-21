#!/usr/bin/env node
// Builds the echomirror-wasm crate for both wasm-pack targets — `web`
// (browser ESM, fetch-based instantiation) and `nodejs` (CJS, sync
// require-based instantiation) — into sibling wasm-web/ and wasm-node/
// directories. wasm-opt runs automatically as part of `wasm-pack build
// --release`, configured via [package.metadata.wasm-pack.profile.release]
// in the crate's Cargo.toml.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoRoot = path.resolve(pkgRoot, '../../..')
const crateDir = path.join(repoRoot, 'crates/echomirror-wasm')

const dev = process.env.WASM_BUILD_DEV === '1'
const profileArgs = dev ? ['--dev'] : ['--release']

const targets = [
  { wasmPackTarget: 'web', outDir: path.join(pkgRoot, 'wasm-web') },
  { wasmPackTarget: 'nodejs', outDir: path.join(pkgRoot, 'wasm-node') },
]

for (const { wasmPackTarget, outDir } of targets) {
  console.log(`\n> wasm-pack build --target ${wasmPackTarget}${dev ? ' --dev' : ' --release'}`)

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
      ...profileArgs,
    ],
    { stdio: 'inherit' },
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
    // emits `module.exports`-style CJS. Node resolves module systems by
    // file extension first, so renaming .js -> .cjs makes that unambiguous
    // instead of relying on a nested package.json override.
    for (const file of readdirSync(outDir)) {
      if (file.endsWith('.js')) {
        renameSync(path.join(outDir, file), path.join(outDir, file.replace(/\.js$/, '.cjs')))
      }
    }
  }
}

console.log('\nwasm-pack build complete for web + nodejs targets.')
