#!/usr/bin/env node
/**
 * aggregate-changelogs.mjs
 *
 * Reads every packages/js/<name>/CHANGELOG.md and crates/<name>/CHANGELOG.md
 * (plus packages/flutter/CHANGELOG.md when it exists) and writes a single
 * aggregated docs-site/docs/changelog.md in reverse-chronological order,
 * grouped by release date and tagged with the package each entry came from.
 *
 * Run:
 *   node docs-site/scripts/aggregate-changelogs.mjs
 *
 * The docs.yml CI workflow runs this automatically before the Docusaurus build,
 * so the page is always up-to-date without manual editing.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Package source definitions
// ---------------------------------------------------------------------------

/**
 * @typedef {{ label: string, path: string, npmName?: string, ecosystem: string }} PackageSource
 */

/** @type {PackageSource[]} */
const JS_PACKAGES = readdirSync(join(repoRoot, 'packages', 'js'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => ({
    label: `@echomirror/${d.name}`,
    path: join(repoRoot, 'packages', 'js', d.name, 'CHANGELOG.md'),
    npmName: `@echomirror/${d.name}`,
    ecosystem: 'js',
  }));

/** @type {PackageSource[]} */
const RUST_CRATES = readdirSync(join(repoRoot, 'crates'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => ({
    label: d.name,
    path: join(repoRoot, 'crates', d.name, 'CHANGELOG.md'),
    ecosystem: 'rust',
  }));

/** @type {PackageSource[]} */
const OTHER_PACKAGES = [
  {
    label: 'echomirror_sdk (Flutter)',
    path: join(repoRoot, 'packages', 'flutter', 'CHANGELOG.md'),
    ecosystem: 'flutter',
  },
];

const ALL_SOURCES = [...JS_PACKAGES, ...RUST_CRATES, ...OTHER_PACKAGES];

// ---------------------------------------------------------------------------
// CHANGELOG.md parser
// ---------------------------------------------------------------------------

/**
 * A parsed release section extracted from one CHANGELOG.md.
 * @typedef {{ version: string, date: string|null, rawDate: string, body: string, package: PackageSource }} Release
 */

const VERSION_HEADING_RE = /^##\s+([^\s—–-]+)\s*(?:[—–-]\s*(.+))?$/;
const DATE_NORMALISE_RE = /^(\d{4}-\d{2}-\d{2})/;

/**
 * Parse a CHANGELOG.md string into an array of Release objects.
 *
 * @param {string} content
 * @param {PackageSource} pkg
 * @returns {Release[]}
 */
function parseChangelog(content, pkg) {
  const lines = content.split('\n');
  /** @type {Release[]} */
  const releases = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(VERSION_HEADING_RE);
    if (match) {
      if (current) {
        releases.push(current);
      }
      const version = match[1].replace(/^v/, '');
      const rawDate = (match[2] ?? '').trim();
      const dateMatch = rawDate.match(DATE_NORMALISE_RE);
      current = {
        version,
        date: dateMatch ? dateMatch[1] : null,
        rawDate,
        body: '',
        package: pkg,
      };
    } else if (current) {
      current.body += line + '\n';
    }
  }
  if (current) {
    releases.push(current);
  }

  return releases.map((r) => ({
    ...r,
    body: r.body.trimEnd(),
  }));
}

// ---------------------------------------------------------------------------
// Collect all releases
// ---------------------------------------------------------------------------

/** @type {Release[]} */
const allReleases = [];
/** @type {string[]} */
const missingChangelogs = [];

for (const pkg of ALL_SOURCES) {
  if (!existsSync(pkg.path)) {
    missingChangelogs.push(pkg.label);
    continue;
  }
  const content = readFileSync(pkg.path, 'utf8');
  const releases = parseChangelog(content, pkg);
  allReleases.push(...releases);
}

// ---------------------------------------------------------------------------
// Sort: releases with a date first (newest → oldest), undated at the bottom
// ---------------------------------------------------------------------------

allReleases.sort((a, b) => {
  if (a.date && b.date) return b.date.localeCompare(a.date);
  if (a.date) return -1;
  if (b.date) return 1;
  // Both undated — sort by package label then version descending
  if (a.package.label !== b.package.label) return a.package.label.localeCompare(b.package.label);
  return b.version.localeCompare(a.version);
});

// ---------------------------------------------------------------------------
// Build the ecosystem badge string
// ---------------------------------------------------------------------------

const ECOSYSTEM_BADGE = {
  js: '`npm`',
  rust: '`crate`',
  flutter: '`pub`',
};

/**
 * @param {Release} release
 * @returns {string}
 */
function packageBadge(release) {
  const badge = ECOSYSTEM_BADGE[release.package.ecosystem] ?? '';
  return badge ? ` ${badge}` : '';
}

// ---------------------------------------------------------------------------
// Render the aggregated Markdown document
// ---------------------------------------------------------------------------

const now = new Date().toISOString().slice(0, 10);

let output = `---
sidebar_position: 5
title: Changelog
description: Aggregated changelog for all EchoMirror SDK packages — auto-generated from per-package CHANGELOG.md files.
---

# Changelog

All notable changes across every EchoMirror SDK package are listed here in
reverse-chronological order, grouped by release date and tagged by package.

This page is **auto-generated** at docs-build time from the individual
\`CHANGELOG.md\` files in each package directory. Do not edit it manually —
your changes will be overwritten on the next build.

> 📡 **Subscribe** — an RSS feed for this changelog is available at
> [changelog/rss.xml](https://karanjadavi.github.io/echomirror-sdk/changelog/rss.xml)
> once the blog plugin is enabled.

_Last generated: ${now}_

---

`;

if (allReleases.length === 0) {
  output += '> No changelog entries found yet. Entries appear here once packages ship their first versioned release.\n';
} else {
  // Group by date (or "Undated" bucket)
  /** @type {Map<string, Release[]>} */
  const byDate = new Map();

  for (const release of allReleases) {
    const key = release.date ?? 'Undated';
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(release);
  }

  for (const [date, releases] of byDate) {
    output += `## ${date === 'Undated' ? 'Undated releases' : date}\n\n`;

    for (const release of releases) {
      const badge = packageBadge(release);
      output += `### ${release.package.label}${badge} — v${release.version}\n\n`;
      if (release.body) {
        output += release.body + '\n\n';
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Gap notice for non-JS packages
// ---------------------------------------------------------------------------

if (missingChangelogs.length > 0) {
  output += `---

## Packages without changelogs yet

The following packages do not yet have a \`CHANGELOG.md\` file and are excluded
from this page. Once they adopt Changesets (JS) or start maintaining a
\`CHANGELOG.md\` alongside their \`Cargo.toml\` / \`pubspec.yaml\`, entries will
appear here automatically:

${missingChangelogs.map((name) => `- \`${name}\``).join('\n')}

> **Rust crates** — the source of truth for versioning is \`Cargo.toml\`. Until
> \`CHANGELOG.md\` files are added to each crate, refer to the [GitHub Releases](https://github.com/Echo-Mirror-Butler/echomirror-sdk/releases)
> page for historical change notes.
>
> **Flutter** — \`pubspec.yaml\` tracks the version; a \`CHANGELOG.md\` will be
> added once pub.dev publishing is set up.
`;
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

const outPath = join(repoRoot, 'docs-site', 'docs', 'changelog.md');
writeFileSync(outPath, output, 'utf8');

console.log(`✅  Aggregated ${allReleases.length} release(s) from ${ALL_SOURCES.length - missingChangelogs.length} package(s) → ${outPath}`);

if (missingChangelogs.length > 0) {
  console.log(
    `ℹ️   Skipped ${missingChangelogs.length} package(s) with no CHANGELOG.md:\n     ${missingChangelogs.join(', ')}`
  );
}
