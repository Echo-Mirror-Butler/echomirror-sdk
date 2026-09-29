#!/usr/bin/env node
// Static manifest check (issue #216): every file the manifest points at must
// exist, and every PNG icon must actually be the size its key declares. Chrome
// refuses to load an extension with a missing icon/service worker/popup, so
// this catches that class of regression without a browser. The headless
// Chromium load in scripts/smoke-load.mjs is the end-to-end counterpart.
//
//   node scripts/validate-manifest.mjs [dir]   # defaults to dist/

import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const EXTENSION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Width/height from a PNG's IHDR chunk, or null if the file is not a PNG. */
export function pngSize(file) {
  const buf = readFileSync(file)
  const signature = '89504e470d0a1a0a'
  if (buf.length < 24 || buf.subarray(0, 8).toString('hex') !== signature) return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/** Every [file, context] pair the manifest references. */
function referencedFiles(manifest) {
  const refs = []
  const iconSets = [
    ['icons', manifest.icons],
    ['action.default_icon', manifest.action?.default_icon],
  ]
  for (const [where, icons] of iconSets) {
    if (typeof icons === 'string') refs.push({ file: icons, where })
    else if (icons) {
      for (const [size, file] of Object.entries(icons)) refs.push({ file, where: `${where}.${size}`, size: Number(size) })
    }
  }
  if (manifest.action?.default_popup) refs.push({ file: manifest.action.default_popup, where: 'action.default_popup' })
  if (manifest.options_page) refs.push({ file: manifest.options_page, where: 'options_page' })
  if (manifest.background?.service_worker) {
    refs.push({ file: manifest.background.service_worker, where: 'background.service_worker' })
  }
  for (const [i, script] of (manifest.content_scripts ?? []).entries()) {
    for (const file of [...(script.js ?? []), ...(script.css ?? [])]) refs.push({ file, where: `content_scripts[${i}]` })
  }
  return refs
}

/**
 * Validate the manifest in `dir`. Returns a list of human-readable errors
 * (empty when valid). To check the source tree before a build: with
 * `compiledFrom`, a referenced `foo.js` is accepted when `<compiledFrom>/foo.ts`
 * exists, and with `staticFrom`, any other file is also looked up there.
 */
export function validateManifest(dir, { compiledFrom, staticFrom } = {}) {
  const errors = []
  const manifestPath = join(dir, 'manifest.json')
  if (!existsSync(manifestPath)) return [`${manifestPath} does not exist`]

  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (err) {
    return [`manifest.json is not valid JSON: ${err.message}`]
  }

  if (manifest.manifest_version !== 3) errors.push('manifest_version must be 3')
  if (!manifest.icons?.['128']) errors.push('icons.128 is required for the Chrome Web Store')
  if (typeof manifest.content_security_policy?.extension_pages !== 'string') {
    errors.push('content_security_policy.extension_pages must be set explicitly')
  }

  for (const { file, where, size } of referencedFiles(manifest)) {
    let path = join(dir, file)
    if (!existsSync(path) && compiledFrom && file.endsWith('.js')) {
      path = join(dir, compiledFrom, file.replace(/\.js$/, '.ts'))
    } else if (!existsSync(path) && staticFrom) {
      path = join(dir, staticFrom, file)
    }
    if (!existsSync(path)) {
      errors.push(`${where}: "${file}" does not exist`)
      continue
    }
    if (size && file.endsWith('.png')) {
      const dims = pngSize(path)
      if (!dims) errors.push(`${where}: "${file}" is not a PNG`)
      else if (dims.width !== size || dims.height !== size) {
        errors.push(`${where}: "${file}" is ${dims.width}x${dims.height}, expected ${size}x${size}`)
      }
    }
  }
  return errors
}

/**
 * Write a throwaway extension directory (for regression tests). String values
 * are written as UTF-8; `{ base64 }` values are decoded first (binary icons).
 */
export function writeFixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'echomirror-ext-'))
  for (const [name, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true })
    writeFileSync(join(dir, name), typeof contents === 'string' ? contents : Buffer.from(contents.base64, 'base64'))
  }
  return dir
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? join(EXTENSION_ROOT, 'dist'))
  const errors = validateManifest(dir)
  if (errors.length) {
    console.error(`✗ ${dir}/manifest.json:\n${errors.map((e) => `  - ${e}`).join('\n')}`)
    process.exit(1)
  }
  console.log(`✓ ${dir}/manifest.json references only files that exist`)
}
