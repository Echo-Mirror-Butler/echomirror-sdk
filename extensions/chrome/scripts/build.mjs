// Builds the unpacked extension into dist/.
//
//   node scripts/build.mjs [--minify] [--watch]
//
// Everything the browser loads is produced here: bundled ES modules (no remote
// code, per MV3), the HTML/CSS pages, generated icons and manifest.json.

import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { iconPng } from './icons.mjs'
import { manifest } from './manifest.mjs'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const dist = join(root, 'dist')
const ui = join(root, 'src', 'ui')

const minify = process.argv.includes('--minify')
const watch = process.argv.includes('--watch')

const ICON_SIZES = [16, 48, 128]

async function copyStatic() {
  await mkdir(dist, { recursive: true })
  for (const file of await readdir(ui)) {
    await cp(join(ui, file), join(dist, file))
  }
}

async function writeIcons() {
  await mkdir(join(dist, 'icons'), { recursive: true })
  for (const size of ICON_SIZES) {
    await writeFile(join(dist, 'icons', `icon${size}.png`), iconPng(size))
  }
}

async function writeManifest() {
  await writeFile(join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

async function assets() {
  await copyStatic()
  await writeIcons()
  await writeManifest()
}

const options = {
  entryPoints: [
    join(root, 'src', 'background.ts'),
    join(root, 'src', 'popup.ts'),
    join(root, 'src', 'options.ts'),
  ],
  outdir: dist,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  // Matches minimum_chrome_version in the manifest.
  target: ['chrome116'],
  minify,
  sourcemap: minify ? false : 'linked',
  logLevel: 'info',
}

// The bundle pulls the SDK from node_modules, i.e. the compiled dist output of
// the sibling workspaces. Fail with an actionable message instead of an
// esbuild resolve error when they have not been built yet.
for (const pkg of ['core', 'mood']) {
  const entry = join(root, '..', '..', 'packages', 'js', pkg, 'dist', 'index.js')
  if (!existsSync(entry)) {
    console.error(
      `@echomirror/${pkg} is not built (${entry} missing).\n` +
        'Run `npm run build -w packages/js/core -w packages/js/mood` from the repo root first.',
    )
    process.exit(1)
  }
}

await rm(dist, { recursive: true, force: true })
await assets()

if (watch) {
  const context = await esbuild.context({
    ...options,
    plugins: [
      {
        name: 'echomirror-assets',
        setup: (build) => build.onEnd(() => assets()),
      },
    ],
  })
  await context.watch()
  console.log('watching — load extensions/chrome/dist as an unpacked extension')
} else {
  await esbuild.build(options)
  console.log(`built ${dist}`)
}
