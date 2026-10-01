import { describe, expect, it } from 'vitest'
import manifest from '../manifest.json'
import { EXTENSION_ROOT, validateManifest, writeFixture } from '../scripts/validate-manifest.mjs'

// Issue #216: the manifest shipped pointing at icons that never existed, so
// Chrome refused to load the extension at all.

const PNG_16x16 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAEklEQVR4nGNgGAWjYBSMAggAAAQQAAFVN1rQAAAAAElFTkSuQmCC'

describe('manifest.json', () => {
  it('references only files that exist, with correctly sized icons', () => {
    expect(validateManifest(EXTENSION_ROOT, { compiledFrom: 'src', staticFrom: 'public' })).toEqual([])
  })

  it('ships the 16/32/48/128 icon set', () => {
    expect(Object.keys(manifest.icons)).toEqual(['16', '32', '48', '128'])
    expect(manifest.action.default_icon).toEqual(manifest.icons)
  })

  it('only requests the hosts the extension actually calls', () => {
    expect(manifest.host_permissions).toEqual([
      'https://horizon.stellar.org/*',
      'https://horizon-testnet.stellar.org/*',
    ])
  })

  it('declares an explicit extension_pages CSP limited to self + Horizon', () => {
    const csp = manifest.content_security_policy.extension_pages
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain('connect-src https://horizon.stellar.org https://horizon-testnet.stellar.org')
    expect(csp).not.toMatch(/unsafe-(eval|inline)/)
  })
})

describe('validateManifest', () => {
  const base = {
    manifest_version: 3,
    name: 'fixture',
    version: '0.0.0',
    content_security_policy: { extension_pages: "script-src 'self'" },
    icons: { '16': 'icons/icon16.png', '128': 'icons/icon128.png' },
  }

  it('reports a missing icon (the #216 regression)', () => {
    const dir = writeFixture({
      'manifest.json': JSON.stringify(base),
      'icons/icon16.png': { base64: PNG_16x16 },
    })
    expect(validateManifest(dir)).toEqual(['icons.128: "icons/icon128.png" does not exist'])
  })

  it('reports an icon whose pixel size does not match its key', () => {
    const dir = writeFixture({
      'manifest.json': JSON.stringify(base),
      'icons/icon16.png': { base64: PNG_16x16 },
      'icons/icon128.png': { base64: PNG_16x16 },
    })
    expect(validateManifest(dir)).toEqual(['icons.128: "icons/icon128.png" is 16x16, expected 128x128'])
  })

  it('reports a missing CSP', () => {
    const { content_security_policy: _csp, ...noCsp } = base
    const dir = writeFixture({
      'manifest.json': JSON.stringify(noCsp),
      'icons/icon16.png': { base64: PNG_16x16 },
      'icons/icon128.png': { base64: PNG_16x16 },
    })
    expect(validateManifest(dir)).toContain('content_security_policy.extension_pages must be set explicitly')
  })
})
