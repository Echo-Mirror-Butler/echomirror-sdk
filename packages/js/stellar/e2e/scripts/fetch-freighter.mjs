/**
 * Download the Freighter extension from the Chrome Web Store and unpack it to
 * e2e/.freighter so Playwright can load it with --load-extension.
 *
 * CRX3 files are a binary header followed by a plain ZIP — we locate the ZIP
 * magic and unzip from there. No Chrome installation is required.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FREIGHTER_EXTENSION_ID = 'bcacfldlkkdogcmkkibnjlakofdplcbk'
const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', '.freighter')

if (existsSync(join(outDir, 'manifest.json'))) {
  console.log(`Freighter already unpacked at ${outDir}`)
  process.exit(0)
}

const url =
  'https://clients2.google.com/service/update2/crx?response=redirect' +
  '&prodversion=131.0.0.0&acceptformat=crx3' +
  `&x=id%3D${FREIGHTER_EXTENSION_ID}%26uc`

console.log('Downloading Freighter CRX from the Chrome Web Store…')
const res = await fetch(url, { redirect: 'follow' })
if (!res.ok) {
  console.error(`Download failed: HTTP ${res.status}`)
  process.exit(1)
}
const crx = Buffer.from(await res.arrayBuffer())

// Find the embedded ZIP (magic PK\x03\x04) after the CRX3 header.
const zipStart = crx.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
if (zipStart < 0) {
  console.error('No ZIP payload found in CRX — the Web Store response format may have changed.')
  process.exit(1)
}

const zipPath = join(here, 'freighter.zip')
writeFileSync(zipPath, crx.subarray(zipStart))
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
execFileSync('unzip', ['-q', '-o', zipPath, '-d', outDir])
rmSync(zipPath)

const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'))
console.log(`Unpacked Freighter v${manifest.version} to ${outDir}`)
