// Packages dist/ into a Chrome Web Store upload:
//
//   node scripts/zip.mjs   ->  dist-zip/echomirror-chrome-<version>.zip
//
// A ~90 line deflate ZIP writer keeps the release path dependency-free; the
// Web Store only needs a plain, uncommented archive of the unpacked folder.

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { deflateRawSync } from 'node:zlib'
import { crc32 } from './lib/crc32.mjs'
import { manifest } from './manifest.mjs'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const dist = join(root, 'dist')
const outDir = join(root, 'dist-zip')

/** @returns {Promise<string[]>} file paths relative to `dir`, depth first */
async function walk(dir, prefix = '') {
  const found = []
  for (const entry of (await readdir(dir)).sort()) {
    const absolute = join(dir, entry)
    if ((await stat(absolute)).isDirectory()) {
      found.push(...(await walk(absolute, `${prefix}${entry}/`)))
    } else {
      found.push(`${prefix}${entry}`)
    }
  }
  return found
}

/** MS-DOS date/time pair used by the ZIP headers. */
function dosStamp(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

/**
 * @param {Array<{ name: string, data: Buffer }>} files
 * @returns {Buffer} a deflate-compressed ZIP archive
 */
export function createZip(files, now = new Date()) {
  const { time, day } = dosStamp(now)
  const locals = []
  const central = []
  let offset = 0

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const compressed = deflateRawSync(file.data, { level: 9 })
    const checksum = crc32(file.data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(8, 8) // method: deflate
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(day, 12)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(file.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28) // extra field length
    locals.push(local, name, compressed)

    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4) // version made by
    entry.writeUInt16LE(20, 6) // version needed
    entry.writeUInt16LE(0, 8)
    entry.writeUInt16LE(8, 10)
    entry.writeUInt16LE(time, 12)
    entry.writeUInt16LE(day, 14)
    entry.writeUInt32LE(checksum, 16)
    entry.writeUInt32LE(compressed.length, 20)
    entry.writeUInt32LE(file.data.length, 24)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt16LE(0, 30) // extra
    entry.writeUInt16LE(0, 32) // comment
    entry.writeUInt16LE(0, 34) // disk number
    entry.writeUInt16LE(0, 36) // internal attributes
    entry.writeUInt32LE(0, 38) // external attributes
    entry.writeUInt32LE(offset, 42)
    central.push(entry, name)

    offset += local.length + name.length + compressed.length
  }

  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4) // this disk
  end.writeUInt16LE(0, 6) // disk with central directory
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...locals, directory, end])
}

async function main() {
  let names
  try {
    names = await walk(dist)
  } catch {
    throw new Error('dist/ not found — run `npm run build` first')
  }

  // Source maps are a dev aid; they only bloat the store upload.
  const packable = names.filter((name) => !name.endsWith('.map'))
  if (!packable.includes('manifest.json')) {
    throw new Error('dist/manifest.json is missing — the build did not complete')
  }

  // `walk` already yields forward-slash paths, which is what ZIP requires.
  const files = await Promise.all(
    packable.map(async (name) => ({
      name,
      data: await readFile(join(dist, ...name.split('/'))),
    })),
  )

  await mkdir(outDir, { recursive: true })
  const target = join(outDir, `echomirror-chrome-${manifest.version}.zip`)
  const archive = createZip(files)
  await writeFile(target, archive)

  const kb = (archive.length / 1024).toFixed(1)
  console.log(`packaged ${files.length} files -> ${relative(root, target)} (${kb} KB)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
