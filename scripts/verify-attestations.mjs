#!/usr/bin/env node
// scripts/verify-attestations.mjs — post-release provenance check (issue #206).
//
// Every @echomirror/* package is published from CI, so every published tarball
// should carry an npm provenance attestation — the signature that says "npm
// built this from commit X of Echo-Mirror-Butler/echomirror-sdk, run by
// GitHub Actions". Consumers see that as a badge on npmjs.com and can verify
// it themselves with `npm audit signatures` (documented in SECURITY.md).
//
// `release.yml` asks npm to generate those attestations
// (`NPM_CONFIG_PROVENANCE: "true"`). This script is the other half: it proves
// the request actually took effect, so a silently-unattested publish fails the
// release instead of being discovered by a consumer months later.
//
// It reads the version straight out of each package.json, so it always checks
// the versions that are on `main` right now. Run it locally at any time to
// audit what is already on the registry:
//
//   node scripts/verify-attestations.mjs
//
// Exit code is 0 only when every published package has attestations.

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGES_DIR = 'packages/js'
const EXPECTED_REPO = 'https://github.com/Echo-Mirror-Butler/echomirror-sdk'

/** Every workspace package under `packages/js/*` that is published to npm. */
function publishedPackages() {
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
      // A `private` package is never published, so there is nothing to attest.
      if (!manifest.name || manifest.private) return []
      return [{ name: manifest.name, version: manifest.version, dir, repository: manifest.repository }]
    })
}

/**
 * npm refuses to generate provenance unless the manifest carries a `repository`
 * pointing at the GitHub repo it is publishing from, so this is checked here
 * too — it is a much cheaper failure to catch pre-release than a rejected
 * `npm publish`.
 */
function checkRepository(pkg) {
  const url = pkg.repository?.url
  if (!url) {
    return `${pkg.name}: package.json is missing "repository" — npm will refuse to generate provenance for it`
  }
  const normalized = url.replace(/^git\+/, '').replace(/\.git$/, '')
  if (normalized !== EXPECTED_REPO) {
    return `${pkg.name}: "repository" points at ${normalized}, expected ${EXPECTED_REPO}`
  }
  if (!pkg.repository.directory) {
    return `${pkg.name}: "repository" is missing "directory" (monorepo package — it should be its path)`
  }
  return null
}

function npmView(spec, field) {
  return execFileSync('npm', ['view', spec, field, '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

const packages = publishedPackages()
if (packages.length === 0) {
  console.error('No publishable packages found under packages/js — nothing to verify.')
  process.exit(1)
}

const failures = []
let checked = 0

for (const pkg of packages) {
  const repoProblem = checkRepository(pkg)
  if (repoProblem) {
    failures.push(repoProblem)
    continue
  }

  const spec = `${pkg.name}@${pkg.version}`
  let dist
  try {
    dist = JSON.parse(npmView(spec, 'dist'))
  } catch (err) {
    // E404 here means the version was never published at all, which is its own
    // kind of failure worth surfacing rather than swallowing.
    const detail = (err.stderr || err.message || '').trim().split('\n').slice(0, 3).join(' ')
    failures.push(`${spec}: could not read from the registry — ${detail}`)
    continue
  }

  if (!dist?.attestations?.url) {
    failures.push(`${spec}: published WITHOUT a provenance attestation (dist.attestations is empty)`)
    continue
  }

  checked += 1
  console.log(`  ok  ${spec} — attested (${dist.attestations.provenance?.predicateType ?? 'provenance'})`)
}

console.log('')
if (failures.length > 0) {
  console.error(`Provenance check FAILED for ${failures.length} package(s):`)
  for (const failure of failures) console.error(`  ✗  ${failure}`)
  console.error('')
  console.error(
    'Published tarballs must carry npm provenance attestations (see SECURITY.md —\n' +
      '"Verifying a release"). Check that release.yml still requests them via\n' +
      'NPM_CONFIG_PROVENANCE and still has id-token: write.',
  )
  process.exit(1)
}

console.log(`Provenance check passed for all ${checked} published package(s).`)
