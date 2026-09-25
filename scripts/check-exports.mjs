import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const packages = [
  { name: '@echomirror/core', dir: 'packages/js/core', profile: 'strict' },
  { name: '@echomirror/mood', dir: 'packages/js/mood', profile: 'strict' },
  { name: '@echomirror/react', dir: 'packages/js/react', profile: 'strict' },
  { name: '@echomirror/social', dir: 'packages/js/social', profile: 'strict' },
  { name: '@echomirror/stellar', dir: 'packages/js/stellar', profile: 'strict' },
  { name: '@echomirror/analytics', dir: 'packages/js/analytics', profile: 'esm-only' },
  {
    name: '@echomirror/wasm',
    dir: 'packages/js/wasm',
    profile: 'esm-only',
    ignoreRules: ['internal-resolution-error'],
  },
]

let hasError = false

for (const pkg of packages) {
  const pkgDir = resolve(pkg.dir)
  console.log(`\n========================================`)
  console.log(`Validating ${pkg.name} (${pkg.dir})`)
  console.log(`========================================`)

  // 1. Run publint
  try {
    console.log(`Running publint...`)
    execFileSync('npx', ['publint', pkgDir], { stdio: 'inherit' })
  } catch (err) {
    console.error(`publint failed for ${pkg.name}`)
    hasError = true
  }

  // 2. Run attw
  try {
    console.log(`Running attw...`)
    const attwArgs = ['attw', '--pack', pkgDir]
    if (pkg.profile) {
      attwArgs.push('--profile', pkg.profile)
    }
    if (pkg.ignoreRules && pkg.ignoreRules.length > 0) {
      attwArgs.push('--ignore-rules', ...pkg.ignoreRules)
    }
    execFileSync('npx', attwArgs, { stdio: 'inherit' })
  } catch (err) {
    console.error(`attw failed for ${pkg.name}`)
    hasError = true
  }
}

if (hasError) {
  console.error('\nExport validation failed for one or more packages.')
  process.exit(1)
}

console.log('\nAll package exports verified successfully with publint and attw.')
