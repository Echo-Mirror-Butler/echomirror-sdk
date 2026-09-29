#!/usr/bin/env node
// Assemble a loadable unpacked extension in dist/ (issue #216):
//   src/*.ts        -> dist/*.js  (tsc; no bundler needed, the entry points have no imports)
//   manifest.json, icons/*.png, public/* -> dist/
// then fail the build if the manifest references anything that is not there.

import { execFileSync } from 'node:child_process'
import { cpSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { EXTENSION_ROOT, validateManifest } from './validate-manifest.mjs'

const dist = join(EXTENSION_ROOT, 'dist')
rmSync(dist, { recursive: true, force: true })

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
execFileSync(process.execPath, [tsc, '-p', join(EXTENSION_ROOT, 'tsconfig.build.json')], { stdio: 'inherit' })

cpSync(join(EXTENSION_ROOT, 'manifest.json'), join(dist, 'manifest.json'))
cpSync(join(EXTENSION_ROOT, 'public'), dist, { recursive: true })
for (const icon of readdirSync(join(EXTENSION_ROOT, 'icons')).filter((f) => f.endsWith('.png'))) {
  cpSync(join(EXTENSION_ROOT, 'icons', icon), join(dist, 'icons', icon))
}

const errors = validateManifest(dist)
if (errors.length) {
  console.error(`✗ dist/manifest.json:\n${errors.map((e) => `  - ${e}`).join('\n')}`)
  process.exit(1)
}
console.log(`✓ built ${dist}`)
