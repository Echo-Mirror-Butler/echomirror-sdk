import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { manifest } from '../scripts/manifest.mjs'
import { createZip } from '../scripts/zip.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

describe('manifest', () => {
  it('is manifest v3 with a module service worker', () => {
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' })
  })

  it('requests only the three permissions the features need', () => {
    expect([...(manifest.permissions as string[])].sort()).toEqual([
      'alarms',
      'notifications',
      'storage',
    ])
    expect(manifest.host_permissions).toEqual(['https://api.echomirror.dev/*'])
  })

  it('declares no content scripts or remotely hosted code', () => {
    expect(manifest.content_scripts).toBeUndefined()
    const policy = (manifest.content_security_policy as { extension_pages: string }).extension_pages
    expect(policy).toContain("script-src 'self'")
    expect(policy).toContain("object-src 'self'")
  })

  it('points every declared page and icon at a file the build emits', () => {
    const emitted = new Set([
      'popup.html',
      'options.html',
      'background.js',
      'icons/icon16.png',
      'icons/icon48.png',
      'icons/icon128.png',
    ])
    const action = manifest.action as { default_popup: string; default_icon: Record<string, string> }
    expect(emitted.has(action.default_popup)).toBe(true)
    expect((manifest.options_ui as { page: string }).page).toBe('options.html')
    for (const path of [
      ...Object.values(action.default_icon),
      ...Object.values(manifest.icons as Record<string, string>),
    ]) {
      expect(emitted.has(path)).toBe(true)
    }
  })

  it('keeps the version in step with package.json', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    expect(manifest.version).toBe(pkg.version)
  })
})

/** Python ships with a real zip reader; use whichever binary this host has. */
function pythonBinary(): string | null {
  for (const candidate of ['python3', 'python']) {
    try {
      execFileSync(candidate, ['-c', 'import zipfile'], { stdio: 'ignore' })
      return candidate
    } catch {
      // Try the next candidate.
    }
  }
  return null
}

describe('createZip', () => {
  it('writes a well-formed archive', () => {
    const files = [
      { name: 'manifest.json', data: Buffer.from('{"manifest_version":3}') },
      { name: 'icons/icon16.png', data: Buffer.from('not really a png, but bytes are bytes') },
    ]

    const archive = createZip(files)

    expect(archive.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    // End-of-central-directory record lists both entries.
    const eocd = archive.length - 22
    expect(archive.readUInt32LE(eocd)).toBe(0x06054b50)
    expect(archive.readUInt16LE(eocd + 10)).toBe(2)

    // Round-trip through a real unzip implementation rather than trusting the
    // header maths: Node ships none, so shell out to Python's zipfile when the
    // host has it.
    const python = pythonBinary()
    if (!python) return

    const listing = execFileSync(
      python,
      [
        '-c',
        'import sys,zipfile,io;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));' +
          'print(z.testzip());print("\\n".join(n+":"+z.read(n).decode() for n in z.namelist()))',
      ],
      { input: archive, encoding: 'utf8' },
    )
      .replace(/\r\n/g, '\n')
      .trim()

    expect(listing).toBe(
      [
        'None',
        'manifest.json:{"manifest_version":3}',
        'icons/icon16.png:not really a png, but bytes are bytes',
      ].join('\n'),
    )
  })
})
