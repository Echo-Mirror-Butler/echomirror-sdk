---
title: "EchoMirror SDK — Initial JS package releases (v0.1.0 / v0.2.0)"
date: 2026-08-19
authors: [echomirror]
tags: [release, js, npm, stellar, mood, analytics, wasm, react, social]
description: >
  First wave of EchoMirror SDK JavaScript packages published to npm:
  @echomirror/core, mood, react, social, analytics, wasm (v0.1.0) and
  @echomirror/stellar (v0.2.0).
---

The first wave of EchoMirror SDK JavaScript / TypeScript packages are now
available on npm. All packages follow [Semantic Versioning](https://semver.org).

{/* truncate */}

## What shipped

| Package | Version | Highlights |
|---|---|---|
| `@echomirror/core` | 0.1.0 | API client, JWT auth, shared types |
| `@echomirror/mood` | 0.1.0 | Mood logging, streaks, AI reflections |
| `@echomirror/stellar` | **0.2.0** | Multi-wallet (Freighter/Albedo/xBull), ECHO payments, typed errors |
| `@echomirror/react` | 0.1.0 | Provider, hooks (`useMoodStreak`, `useStellarBalance`) |
| `@echomirror/social` | 0.1.0 | Global feed, leaderboard, real-time SSE updates |
| `@echomirror/analytics` | 0.1.0 | Privacy-safe UX event tracking, client-side aggregation |
| `@echomirror/wasm` | 0.1.0 | Rust-compiled WASM — dual browser + Node.js target |

## Install

```bash
npm install @echomirror/core @echomirror/mood @echomirror/stellar
```

## Full changelog

See the [aggregated changelog](https://karanjadavi.github.io/echomirror-sdk/docs/next/changelog)
for detailed per-package release notes, or subscribe to this feed's
[RSS](https://karanjadavi.github.io/echomirror-sdk/changelog/rss.xml) /
[Atom](https://karanjadavi.github.io/echomirror-sdk/changelog/atom.xml) to be
notified of future releases.
