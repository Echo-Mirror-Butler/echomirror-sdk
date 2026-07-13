<div align="center">
  <img src="https://raw.githubusercontent.com/Echo-Mirror-Butler/Echo-Mirror-Butler-/development/assets/splash_logo.png" alt="EchoMirror Logo" width="120" height="120" />

  <h1>EchoMirror SDK</h1>

  <p><strong>Embed mood intelligence, Stellar micro-payments, and social wellness into any app — in minutes.</strong></p>

  <p>
    <a href="https://www.npmjs.com/package/@echomirror/core"><img src="https://img.shields.io/npm/v/@echomirror/core?color=0c1a2e&label=npm&style=flat-square" /></a>
    <a href="https://pub.dev/packages/echomirror_sdk"><img src="https://img.shields.io/pub/v/echomirror_sdk?color=0c1a2e&label=pub.dev&style=flat-square" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" /></a>
    <a href="https://github.com/Echo-Mirror-Butler/echomirror-sdk/issues"><img src="https://img.shields.io/github/issues/Echo-Mirror-Butler/echomirror-sdk?style=flat-square" /></a>
    <a href="https://discord.gg/echomirror"><img src="https://img.shields.io/badge/discord-join-7289da?style=flat-square&logo=discord" /></a>
  </p>

  <p>
    <a href="#packages">Packages</a> •
    <a href="#quickstart">Quickstart</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#examples">Examples</a> •
    <a href="#contributing">Contributing</a> •
    <a href="https://docs.echomirror.dev">Docs</a>
  </p>
</div>

---

## What is EchoMirror SDK?

EchoMirror is a social wellness platform — users track their mood, gift XLM tokens to friends, and reflect through an AI-powered mirror. The SDK opens this infrastructure to every developer.

**You get:**
- A privacy-first mood capture and AI reflection engine
- Stellar/ECHO token primitives with zero Horizon boilerplate
- A real-time social wellness feed from the global EchoMirror network
- Drop-in UI widgets for web and Flutter
- Aggregated, anonymous wellness analytics for your product

No need to build ML pipelines, manage Stellar accounts, or design journaling UX from scratch. Embed what you need, ship faster.

---

## Packages

This is a monorepo. Each package is independently installable.

| Package | Platform | Description |
|---|---|---|
| [`@echomirror/core`](./packages/js/core) | JS/TS | Auth, API client, shared types |
| [`@echomirror/mood`](./packages/js/mood) | JS/TS | Mood capture, streaks, AI reflections |
| [`@echomirror/stellar`](./packages/js/stellar) | JS/TS | XLM balance, ECHO token, Freighter, Friendbot |
| [`@echomirror/social`](./packages/js/social) | JS/TS | Global feed, leaderboard, follows |
| [`@echomirror/widget`](./packages/js/widget) | React / Web Component | Drop-in mood check-in widget |
| [`@echomirror/analytics`](./packages/js/analytics) | JS/TS | Emotional UX analytics events |
| [`@echomirror/react`](./packages/js/react) | React | React hooks + context providers |
| [`echomirror_sdk`](./packages/flutter) | Flutter/Dart | Full SDK for mobile (iOS + Android) |

---

## Quickstart

### JavaScript / TypeScript

```bash
npm install @echomirror/core @echomirror/mood
```

```ts
import { EchoMirrorClient } from '@echomirror/core'
import { logMood, getMoodStreak } from '@echomirror/mood'

const client = new EchoMirrorClient({ apiKey: 'your_api_key' })

// Log a mood entry
const entry = await logMood(client, {
  score: 7,          // 1–10
  note: 'Shipped something great today.',
  tags: ['work', 'proud'],
})

// Get the user's current streak
const streak = await getMoodStreak(client)
console.log(`${streak.current} day streak 🔥`)
```

### React

```bash
npm install @echomirror/react @echomirror/widget
```

```tsx
import { EchoMirrorProvider } from '@echomirror/react'
import { MoodWidget } from '@echomirror/widget'

export default function App() {
  return (
    <EchoMirrorProvider apiKey="your_api_key">
      <YourApp />
      {/* Floating mood check-in — works on any page */}
      <MoodWidget position="bottom-right" theme="auto" />
    </EchoMirrorProvider>
  )
}
```

### Stellar Payments

```bash
npm install @echomirror/core @echomirror/stellar
```

```ts
import { EchoMirrorClient } from '@echomirror/core'
import { getBalance, sendEcho, connectFreighter } from '@echomirror/stellar'

const client = new EchoMirrorClient({ apiKey: 'your_api_key' })

// Connect user's Freighter wallet (browser)
const wallet = await connectFreighter()

// Get live XLM + ECHO balance
const balance = await getBalance(client, wallet.publicKey)
console.log(`${balance.xlm} XLM  •  ${balance.echo} ECHO`)

// Gift ECHO tokens to a friend
await sendEcho(client, {
  from: wallet.publicKey,
  to: 'GFRIEND_PUBLIC_KEY_HERE',
  amount: 5,
  memo: 'Great energy today ✨',
})
```

### Flutter

```yaml
# pubspec.yaml
dependencies:
  echomirror_sdk: ^1.0.0
```

```dart
import 'package:echomirror_sdk/echomirror_sdk.dart';

void main() async {
  await EchoMirror.initialize(apiKey: 'your_api_key');

  // Log a mood
  final entry = await EchoMirror.mood.log(
    score: 8,
    note: 'Morning walk helped a lot.',
    tags: ['wellness', 'outdoors'],
  );

  // Get Stellar balance
  final balance = await EchoMirror.stellar.getBalance(publicKey);
  print('Balance: ${balance.xlm} XLM');
}
```

---

## Architecture

```
echomirror-sdk/
├── packages/
│   ├── js/
│   │   ├── core/          # EchoMirrorClient, auth, API layer, TypeScript types
│   │   ├── mood/          # Mood logging, streak engine, AI reflections
│   │   ├── stellar/       # Horizon client, Freighter adapter, ECHO token ops
│   │   ├── social/        # Global mirror feed, leaderboard, follows
│   │   ├── widget/        # React + Web Component mood widget
│   │   ├── analytics/     # Emotional UX event tracking
│   │   └── react/         # React hooks, providers, context
│   └── flutter/           # Dart SDK — mirrors JS package structure
├── examples/
│   ├── react-app/         # Vite + React example showing all packages
│   ├── next-app/          # Next.js example with SSR
│   ├── flutter-app/       # Flutter example app
│   └── vanilla-js/        # Browser-only, no bundler
├── docs/                  # Docusaurus docs site
└── CONTRIBUTING.md
```

### How it connects to EchoMirror

```
Your App  →  EchoMirror SDK  →  EchoMirror API  →  Supabase (mood, auth, social)
                                                 →  Stellar Horizon (XLM, ECHO token)
                                                 →  AI inference (reflections, insights)
```

The SDK handles auth token refresh, request retries, Stellar account derivation, and WebSocket subscriptions for the real-time social feed. You write product code, not plumbing.

---

## Use Cases

### For Wellness Apps
Add a daily mood log + AI reflection to a meditation, fitness, or therapy app. Users get their streak and insights without leaving your experience.

### For Productivity Tools
Embed the `<MoodWidget />` in a Notion clone or task manager. Correlate emotional state with task completion in your analytics — know when your users are burning out before they do.

### For Social Platforms
Pull the global EchoMirror feed and show users how the world is feeling right now. Show community leaderboards. Let users gift ECHO tokens to each other as reactions.

### For Web3 / DeFi Apps
Use `@echomirror/stellar` standalone — the cleanest abstraction for Freighter wallet connection, ECHO token operations, and XLM balance queries on Stellar mainnet and testnet.

### For Flutter Mobile Apps
The `echomirror_sdk` Dart package gives native iOS and Android access to all features — mood, Stellar, social feed — with Riverpod providers included, plug-and-play with any GoRouter setup.

### For Games
Track player emotional state across sessions. Gift ECHO as in-game rewards. Show a "world mood" overlay on your game's home screen.

---

## Examples

| Example | Description |
|---|---|
| [`examples/react-app`](./examples/react-app) | Full Vite app — all packages wired together |
| [`examples/next-app`](./examples/next-app) | Server-side rendering with Next.js 14 |
| [`examples/flutter-app`](./examples/flutter-app) | Mobile app — mood + wallet + leaderboard |
| [`examples/vanilla-js`](./examples/vanilla-js) | Single HTML file, no bundler |

---

## API Reference

Full API docs at **[docs.echomirror.dev](https://docs.echomirror.dev)** (coming soon).

### `@echomirror/core`
| Export | Description |
|---|---|
| `EchoMirrorClient` | Main client class — pass your API key here |
| `EchoMirrorConfig` | Config interface |
| `MoodEntry`, `StellarBalance`, `UserProfile` | Core TypeScript types |

### `@echomirror/mood`
| Export | Description |
|---|---|
| `logMood(client, payload)` | Create a mood log entry |
| `getMoodStreak(client)` | Get current + longest streak |
| `getMoodHistory(client, options)` | Paginated mood history |
| `getAIReflection(client, entryId)` | Get AI-generated insight for an entry |
| `getMoodSummary(client, period)` | Aggregated stats for a time window |

### `@echomirror/stellar`
| Export | Description |
|---|---|
| `connectFreighter()` | Prompt Freighter wallet connection (browser) |
| `getBalance(client, publicKey)` | XLM + ECHO token balance |
| `sendEcho(client, payload)` | Send ECHO tokens to any Stellar address |
| `fundTestnetAccount(publicKey)` | Friendbot funding for testnet dev |
| `getTransactionHistory(client, publicKey)` | Paginated Stellar tx history |

### `@echomirror/widget`
| Export | Description |
|---|---|
| `<MoodWidget />` | React component — floating check-in UI |
| `<MoodWidgetProvider />` | Context for custom trigger integration |
| `defineMoodWidget()` | Register as a native Web Component |

---

## Contributing

We welcome contributions — bug fixes, new features, examples, and docs.

**See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.**

Quick start for contributors:

```bash
git clone https://github.com/Echo-Mirror-Butler/echomirror-sdk.git
cd echomirror-sdk
npm install          # installs all workspace packages
npm run build        # builds all packages
npm run test         # runs all tests
```

Each package in `packages/js/*` is an independent npm workspace with its own `src/`, `tests/`, and `README.md`.

---

## Roadmap

- [ ] `@echomirror/core` — API client + auth
- [ ] `@echomirror/mood` — mood log, streak, AI reflection
- [ ] `@echomirror/stellar` — Freighter, XLM, ECHO token
- [ ] `@echomirror/widget` — React + Web Component
- [ ] `@echomirror/social` — global feed, leaderboard
- [ ] `@echomirror/react` — hooks + providers
- [ ] `@echomirror/analytics` — emotional UX events
- [ ] `echomirror_sdk` — Flutter/Dart package
- [ ] Docusaurus docs site
- [ ] npm publish pipeline
- [ ] pub.dev publish pipeline
- [ ] Webhook support for mood events
- [ ] Offline-first mode (IndexedDB / Hive cache)

---

## License

MIT — see [LICENSE](./LICENSE).

---

<div align="center">
  <p>Built with love by the <a href="https://github.com/Echo-Mirror-Butler">Echo Mirror Butler</a> team and contributors.</p>
  <p>
    <a href="https://echomirrorbutler.vercel.app">App</a> •
    <a href="https://docs.echomirror.dev">Docs</a> •
    <a href="https://discord.gg/echomirror">Discord</a> •
    <a href="https://twitter.com/echomirrorapp">Twitter</a>
  </p>
</div>
