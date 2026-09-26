#!/usr/bin/env node
// scripts/pack-smoke.mjs — pack-and-install smoke test (issue #194).
//
// `check-exports.mjs` validates each package *in place*: publint reads the
// manifest on disk and attw packs it, but neither one ever installs the result
// or evaluates a single line of it. Every packaging mistake that only shows up
// after publish therefore sails through CI and lands on npm:
//
//   - a `files` array that forgot `dist`, publishing an empty tarball
//   - an `exports` target pointing at a build output that is never emitted
//   - an ESM or CJS entry that parses but throws on evaluation
//   - a `@echomirror/*` dependency that is not in `dependencies` at all, so
//     the consumer gets a bare specifier npm has to guess at
//   - a dual-package hazard: the ESM and CJS builds disagreeing at runtime
//
// This script closes that gap the same way a user experiences it:
//
//   1. `npm pack` every workspace package into a scratch directory.
//   2. Read the actual tarballs and assert every file the manifest points at
//      (main/module/types/browser/exports, recursively) is really inside.
//   3. `npm install` all the tarballs into a throwaway project *outside* the
//      monorepo, so nothing is resolved through the root `node_modules` or the
//      workspace links — the install has to stand on its own, exactly as it
//      would for a consumer who ran `npm i @echomirror/core`.
//   4. `import()` every package in one process and `require()` every package
//      that advertises a `require` condition in another, asserting each one
//      evaluates and exports something.
//
// The two probes run in separate processes on purpose: evaluating the ESM and
// the CJS build of the same package in one process is what surfaces a
// dual-package hazard, and this test is not trying to reproduce that failure —
// each condition is a different artifact and deserves a clean runtime.
//
//   node scripts/pack-smoke.mjs           # or: npm run check:package
//   PACK_SMOKE_KEEP=1 node scripts/pack-smoke.mjs   # keep the scratch project
//
// Requires the packages to be built first (`npm run build`), which is what CI
// does before invoking it.

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES_DIR = join(REPO_ROOT, 'packages/js')

/**
 * Packages whose tarball cannot be evaluated in this environment, with the
 * reason. Everything else is imported for real.
 *
 * Only one entry today. `@echomirror/wasm`'s `dist/index.js` statically
 * re-exports the wasm-bindgen binding through the `#wasm-binding` import-map
 * entry, which points at `wasm-node/echomirror_wasm.cjs` — a wasm-pack output
 * that needs a Rust toolchain plus four `wasm-opt` invocations. Producing it is
 * rust-ci.yml's wasm-build job and wasm-publish.yml's release path, neither of
 * which runs here, so importing it would only ever fail with
 * ERR_MODULE_NOT_FOUND. The tarball-contents check in step 2 still applies to
 * it, which is the half that catches a broken `files` array.
 */
const IMPORT_SKIPPED = {
  '@echomirror/wasm': 'wasm-bindgen artifacts require `npm run build:wasm` (Rust + wasm-pack); see rust-ci.yml wasm-build',
}

const failures = []

function fail(message) {
  failures.push(message)
  console.error(`  ✗ ${message}`)
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
}

function heading(text) {
  console.log(`\n=== ${text}`)
}

// ── Step 1: discover the publishable packages ────────────────────────────────

function discoverPackages() {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(PACKAGES_DIR, entry.name))
    .flatMap((dir) => {
      let manifest
      try {
        manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      } catch {
        return []
      }
      if (!manifest.name || manifest.private) return []
      return [{ name: manifest.name, version: manifest.version, dir }]
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ── Step 2: pack, and check the tarballs contain what the manifest promises ──

/** Every relative file path a manifest points a consumer or bundler at. */
function declaredEntryPoints(manifest) {
  const found = new Set()

  const visit = (node) => {
    if (typeof node === 'string') {
      if (node.startsWith('./') && !node.includes('*')) found.add(node)
      return
    }
    if (node && typeof node === 'object') {
      // `exports` is a map of condition -> target; a nested target is another
      // map (or, for a subpath, a string). Either way, recurse.
      for (const value of Object.values(node)) visit(value)
    }
  }

  for (const field of ['main', 'module', 'types', 'typings', 'browser']) visit(manifest[field])
  visit(manifest.exports)
  for (const bin of Object.values(manifest.bin ?? {})) visit(bin)

  return [...found]
}

function tarEntries(tarball) {
  return new Set(
    run('tar', ['-tzf', tarball])
      .split('\n')
      .filter(Boolean)
      // npm tarballs put everything under a `package/` prefix.
      .map((line) => line.replace(/^package\//, ''))
      .filter((line) => !line.endsWith('/')),
  )
}

function packAll(packages, packDir) {
  const packed = []

  for (const pkg of packages) {
    heading(`npm pack ${pkg.name}`)
    let result
    try {
      result = JSON.parse(
        run('npm', ['pack', '--json', '--pack-destination', packDir], { cwd: pkg.dir }),
      )
    } catch (err) {
      fail(`${pkg.name}: npm pack failed — ${firstLine(err.stderr || err.message)}`)
      continue
    }

    const filename = result?.[0]?.filename
    if (!filename) {
      fail(`${pkg.name}: npm pack produced no tarball`)
      continue
    }

    const tarball = join(packDir, filename)
    const entries = tarEntries(tarball)
    const missing = declaredEntryPoints(JSON.parse(readFileSync(join(pkg.dir, 'package.json'), 'utf8'))).filter(
      (entry) => !entries.has(entry),
    )

    if (missing.length > 0) {
      fail(
        `${pkg.name}: tarball ${filename} is missing ${missing.join(', ')} — ` +
          'either `files` does not cover it or the build never emitted it (run `npm run build`)',
      )
      continue
    }

    console.log(`  ok ${filename} (${entries.size} files, all declared entry points present)`)
    packed.push({ ...pkg, tarball, entries })
  }

  return packed
}

function firstLine(text) {
  return String(text).trim().split('\n')[0]
}

// ── Step 3: install the tarballs into a throwaway consumer project ───────────

function installTarballs(packed, consumerDir) {
  if (packed.length === 0) {
    fail('nothing was packed, so there is nothing to install')
    return false
  }

  writeFileSync(
    join(consumerDir, 'package.json'),
    `${JSON.stringify(
      { name: 'echomirror-pack-smoke', version: '0.0.0', private: true, type: 'module' },
      null,
      2,
    )}\n`,
  )

  const specifiers = packed.map((pkg) => pkg.tarball)
  console.log(`\n=== npm install ${specifiers.length} tarball(s) into a scratch project`)

  try {
    run('npm', ['install', '--no-audit', '--no-fund', ...specifiers], {
      cwd: consumerDir,
      stdio: ['ignore', 'inherit', 'inherit'],
    })
  } catch (err) {
    fail(
      `npm install of the packed tarballs failed — ${firstLine(err.stderr || err.message)}. ` +
        'An unpublished internal dependency or an unresolvable version range shows up here.',
    )
    return false
  }
  console.log('  ok installed')

  // Confirm each package really is the local tarball and not a same-version
  // copy pulled from the registry — otherwise the probes below would silently
  // be testing already-published code instead of this tree.
  const lockPath = join(consumerDir, 'node_modules', '.package-lock.json')
  if (!existsSync(lockPath)) {
    console.warn('  ! node_modules/.package-lock.json not written; skipping the local-tarball check')
    return true
  }
  const installed = JSON.parse(readFileSync(lockPath, 'utf8')).packages ?? {}
  for (const pkg of packed) {
    const entry = installed[`node_modules/${pkg.name}`]
    if (!entry) {
      fail(`${pkg.name}: missing from the installed tree`)
    } else if (entry.version !== pkg.version) {
      fail(`${pkg.name}: installed version ${entry.version} does not match the packed ${pkg.version}`)
    } else if (typeof entry.resolved === 'string' && !entry.resolved.startsWith('file:')) {
      fail(`${pkg.name}: resolved from the registry (${entry.resolved}) instead of the local tarball`)
    } else {
      console.log(`  ok ${pkg.name}@${entry.version} installed from the local tarball`)
    }
  }

  return failures.length === 0
}

// ── Step 4: evaluate every package the way a consumer would ─────────────────

// The probes are separate files rather than inline `--eval` so that a syntax
// error in a package surfaces as a module load failure attributed to that
// package, not as a parse error in the harness.

const ESM_PROBE = `
// Generated by scripts/pack-smoke.mjs — do not edit.
const names = process.argv.slice(2)
let failed = 0
for (const name of names) {
  try {
    const mod = await import(name)
    const keys = Object.keys(mod)
    if (keys.length === 0) {
      console.error(\\\`  x \\\${name} (esm): evaluated but exported nothing\\\`)
      failed += 1
      continue
    }
    const shown = keys.slice(0, 6).join(', ')
    console.log(\\\`  ok \\\${name} (esm) — \\\${keys.length} export(s): \\\${shown}\\\${keys.length > 6 ? ', …' : ''}\\\`)
  } catch (err) {
    console.error(\\\`  x \\\${name} (esm): [\\\${err.code ?? 'Error'}] \\\${err.message}\\\`)
    failed += 1
  }
}
process.exit(failed === 0 ? 0 : 1)
`

const CJS_PROBE = `
// Generated by scripts/pack-smoke.mjs — do not edit.
const names = process.argv.slice(2)
let failed = 0
for (const name of names) {
  try {
    const mod = require(name)
    const keys = Object.keys(mod)
    if (keys.length === 0) {
      console.error(\\\`  x \\\${name} (cjs): evaluated but exported nothing\\\`)
      failed += 1
      continue
    }
    const shown = keys.slice(0, 6).join(', ')
    console.log(\\\`  ok \\\${name} (cjs) — \\\${keys.length} export(s): \\\${shown}\\\${keys.length > 6 ? ', …' : ''}\\\`)
  } catch (err) {
    console.error(\\\`  x \\\${name} (cjs): [\\\${err.code ?? 'Error'}] \\\${err.message}\\\`)
    failed += 1
  }
}
process.exit(failed === 0 ? 0 : 1)
`

/** Does the manifest advertise a CommonJS entry point? */
function hasRequireCondition(exportsField) {
  const visit = (node) => {
    if (!node || typeof node !== 'object') return false
    for (const [key, value] of Object.entries(node)) {
      if (key === 'require' || key === 'default') return true
      if (visit(value)) return true
    }
    return false
  }
  return visit(exportsField)
}

function probe(consumerDir, filename, code, names, label) {
  if (names.length === 0) {
    console.log(`\n=== ${label}: nothing to probe`)
    return
  }
  heading(`${label}: ${names.join(', ')}`)
  const script = join(consumerDir, filename)
  writeFileSync(script, code)
  try {
    run('node', [script, ...names], { cwd: consumerDir, stdio: ['ignore', 'inherit', 'inherit'] })
  } catch (err) {
    fail(`${label} probe reported failures (exit ${err.status ?? 'signal ' + err.signal})`)
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

const packages = discoverPackages()
if (packages.length === 0) {
  console.error('No publishable packages found under packages/js — nothing to smoke-test.')
  process.exit(1)
}

const scratch = mkdtempSync(join(tmpdir(), 'echomirror-pack-smoke-'))
const packDir = join(scratch, 'tarballs')
const consumerDir = join(scratch, 'consumer')
mkdirSync(packDir, { recursive: true })
mkdirSync(consumerDir, { recursive: true })

console.log(`Packing and installing ${packages.length} package(s) as a consumer would.`)
console.log(`Scratch project: ${scratch}`)

try {
  const packed = packAll(packages, packDir)

  if (installTarballs(packed, consumerDir)) {
    const esmNames = []
    const cjsNames = []
    for (const pkg of packed) {
      const manifest = JSON.parse(readFileSync(join(pkg.dir, 'package.json'), 'utf8'))
      if (IMPORT_SKIPPED[pkg.name]) {
        console.log(`\n=== skipping runtime import of ${pkg.name}: ${IMPORT_SKIPPED[pkg.name]}`)
        continue
      }
      esmNames.push(pkg.name)
      if (hasRequireCondition(manifest.exports)) cjsNames.push(pkg.name)
    }

    probe(consumerDir, 'esm-probe.mjs', ESM_PROBE, esmNames, 'ESM import()')
    probe(consumerDir, 'cjs-probe.cjs', CJS_PROBE, cjsNames, 'CommonJS require()')
  }
} finally {
  if (process.env.PACK_SMOKE_KEEP) {
    console.log(`\nPACK_SMOKE_KEEP is set — leaving ${scratch} in place.`)
  } else {
    rmSync(scratch, { recursive: true, force: true })
  }
}

console.log('')
if (failures.length > 0) {
  console.error(`Pack-and-install smoke test FAILED (${failures.length} problem(s)):`)
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  process.exit(1)
}

console.log('Pack-and-install smoke test passed: every package installed from its tarball and evaluated.')
