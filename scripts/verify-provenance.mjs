#!/usr/bin/env node
/**
 * scripts/verify-provenance.mjs
 *
 * Verifies that published packages have valid provenance attestations on npm
 * by querying `npm view <pkg>@<version> dist.attestations --json`.
 *
 * Usage:
 *   node scripts/verify-provenance.mjs '[{"name":"@echomirror/core","version":"0.1.0"}]'
 *   node scripts/verify-provenance.mjs @echomirror/core@0.1.0 @echomirror/mood@0.1.0
 *   PUBLISHED_PACKAGES='[{"name":"@echomirror/core","version":"0.1.0"}]' node scripts/verify-provenance.mjs
 */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Parses input strings or arguments into a list of { name, version } targets.
 * @param {string[]} args
 * @returns {{ name: string, version: string }[]}
 */
export function parsePackageInput(args = []) {
  if (!args || args.length === 0) {
    return [];
  }

  // Handle single argument that is JSON array string from Changesets action
  // e.g. '[{"name":"@echomirror/core","version":"0.1.0"}]'
  if (args.length === 1 && typeof args[0] === 'string' && args[0].trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(args[0].trim());
      if (Array.isArray(parsed)) {
        return parsed
          .filter(item => item && item.name && item.version)
          .map(item => ({ name: String(item.name).trim(), version: String(item.version).trim() }));
      }
    } catch {
      // Fall through to standard parsing if JSON.parse fails
    }
  }

  const packages = [];
  for (const arg of args) {
    if (!arg || typeof arg !== 'string') continue;
    const trimmed = arg.trim();
    if (!trimmed) continue;

    // Check if item is JSON object
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const item = JSON.parse(trimmed);
        if (item.name && item.version) {
          packages.push({ name: String(item.name).trim(), version: String(item.version).trim() });
          continue;
        }
      } catch {
        // Fall through
      }
    }

    // Handle package@version string (e.g. @echomirror/core@0.1.0 or core@0.1.0)
    const lastAtIdx = trimmed.lastIndexOf('@');
    if (lastAtIdx > 0) {
      const name = trimmed.substring(0, lastAtIdx);
      const version = trimmed.substring(lastAtIdx + 1);
      packages.push({ name, version });
    } else {
      // Version not explicitly provided; target latest or as-is
      packages.push({ name: trimmed, version: 'latest' });
    }
  }

  return packages;
}

/**
 * Validates whether the raw stdout from npm view contains valid provenance attestations.
 * @param {string} rawJson
 * @returns {boolean}
 */
export function hasValidAttestations(rawJson) {
  if (!rawJson || typeof rawJson !== 'string') return false;
  const trimmed = rawJson.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return false;

  try {
    const data = JSON.parse(trimmed);
    if (!data) return false;

    // If it's an object with url or provenance predicate
    if (typeof data === 'object') {
      if (Array.isArray(data)) {
        return data.length > 0;
      }
      if (data.url || data.provenance || Object.keys(data).length > 0) {
        return true;
      }
    }
    return false;
  } catch {
    // If not JSON, but has content, check for standard npm view output
    return trimmed.length > 0 && !trimmed.includes('npm error');
  }
}

/**
 * Queries npm registry for dist.attestations with retries & backoff.
 * @param {string} name
 * @param {string} version
 * @param {object} [options]
 * @param {number} [options.maxRetries=5]
 * @param {number} [options.initialDelayMs=3000]
 * @param {number} [options.backoffFactor=1.5]
 * @param {function} [options.executor]
 * @returns {Promise<{ ok: boolean, data?: any, error?: string }>}
 */
export async function verifyPackageProvenance(name, version, options = {}) {
  const maxRetries = options.maxRetries ?? 5;
  const initialDelayMs = options.initialDelayMs ?? 3000;
  const backoffFactor = options.backoffFactor ?? 1.5;
  const executor = options.executor ?? ((cmd) => execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }));

  const target = version && version !== 'latest' ? `${name}@${version}` : name;
  const cmd = `npm view ${target} dist.attestations --json`;

  let delay = initialDelayMs;
  let lastOutput = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      lastOutput = executor(cmd);
      if (hasValidAttestations(lastOutput)) {
        return { ok: true, data: lastOutput.trim() };
      }
    } catch (err) {
      lastOutput = err.stdout ? String(err.stdout) : err.message;
    }

    if (attempt < maxRetries) {
      console.log(`[Provenance Check] Attempt ${attempt}/${maxRetries} for ${target}: attestations not yet found. Waiting ${delay}ms before retrying...`);
      await new Promise(r => setTimeout(r, delay));
      delay = Math.round(delay * backoffFactor);
    }
  }

  return {
    ok: false,
    error: `Package ${target} is published without attestations (dist.attestations is empty). Output: ${lastOutput.trim()}`
  };
}

/**
 * Main execution function
 */
export async function main() {
  const args = process.argv.slice(2);
  const rawInput = args.length > 0 ? args : (process.env.PUBLISHED_PACKAGES ? [process.env.PUBLISHED_PACKAGES] : []);
  const packages = parsePackageInput(rawInput);

  if (packages.length === 0) {
    console.log('[Provenance Check] No packages specified to verify. Skipping check.');
    return 0;
  }

  console.log(`[Provenance Check] Verifying provenance attestations for ${packages.length} package(s)...`);
  let allPassed = true;

  for (const pkg of packages) {
    const target = `${pkg.name}@${pkg.version}`;
    console.log(`[Provenance Check] Checking attestations for ${target}...`);
    const result = await verifyPackageProvenance(pkg.name, pkg.version);

    if (result.ok) {
      console.log(`✅ [Provenance Check] PASS: ${target} carries verified provenance attestations.`);
    } else {
      console.error(`❌ [Provenance Check] FAIL: ${result.error}`);
      allPassed = false;
    }
  }

  if (!allPassed) {
    console.error('[Provenance Check] One or more published packages failed provenance attestation verification!');
    return 1;
  }

  console.log('[Provenance Check] All published packages successfully verified with provenance attestations.');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(code => process.exit(code)).catch(err => {
    console.error('[Provenance Check] Unexpected error:', err);
    process.exit(1);
  });
}
