#!/usr/bin/env node
/**
 * Enforce the byte-size budgets declared in a package's `size-limit` field.
 *
 * The old third-party action checked out the PR base branch and attempted to
 * build it from inside a workspace package. That made every PR fail whenever
 * the base branch had unrelated build debt. This checker evaluates the
 * already-built HEAD artifacts only, using gzip sizes as the browser transfer
 * budget, and has no external action/runtime dependency.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const packageDir = process.argv[2]
if (!packageDir) {
  console.error('Usage: node scripts/check-size-limit.mjs <package-directory>')
  process.exit(2)
}

const packageJsonPath = resolve(packageDir, 'package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const rules = packageJson['size-limit']

if (!Array.isArray(rules) || rules.length === 0) {
  console.error(`${packageJsonPath} has no size-limit configuration`)
  process.exit(2)
}

function parseBytes(limit) {
  const match = /^\s*([0-9]+(?:\.[0-9]+)?)\s*(B|KB|MB)\s*$/i.exec(limit)
  if (!match) throw new Error(`Unsupported size limit: ${limit}`)

  const multiplier = { B: 1, KB: 1_000, MB: 1_000_000 }[match[2].toUpperCase()]
  return Math.round(Number(match[1]) * multiplier)
}

function formatBytes(bytes) {
  if (bytes < 1_000) return `${bytes} B`
  return `${(bytes / 1_000).toFixed(2)} KB`
}

let failed = false
for (const rule of rules) {
  const artifactPath = resolve(packageDir, rule.path)
  const source = readFileSync(artifactPath)
  const compressedBytes = gzipSync(source, { level: 9 }).length
  const limitBytes = parseBytes(rule.limit)
  const label = rule.name ?? rule.path
  const status = compressedBytes <= limitBytes ? 'PASS' : 'FAIL'

  console.log(
    `${status} ${label}: ${formatBytes(compressedBytes)} gzip / ${formatBytes(limitBytes)} budget`,
  )
  if (compressedBytes > limitBytes) failed = true
}

if (failed) process.exit(1)
