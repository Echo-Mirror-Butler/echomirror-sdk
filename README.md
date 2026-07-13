<div align="center">
  <h1>EchoMirror SDK</h1>
  <p><strong>Mood intelligence · Stellar payments · Blockchain sync — for every platform and language.</strong></p>

  <p>
    <a href="https://www.npmjs.com/package/@echomirror/core"><img src="https://img.shields.io/npm/v/@echomirror/core?color=0c1a2e&label=npm&style=flat-square" /></a>
    <a href="https://crates.io/crates/echomirror-core"><img src="https://img.shields.io/crates/v/echomirror-core?color=ce422b&label=crates.io&style=flat-square" /></a>
    <a href="https://pub.dev/packages/echomirror_sdk"><img src="https://img.shields.io/pub/v/echomirror_sdk?color=0c1a2e&label=pub.dev&style=flat-square" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" /></a>
    <a href="https://github.com/Echo-Mirror-Butler/echomirror-sdk/issues"><img src="https://img.shields.io/github/issues/Echo-Mirror-Butler/echomirror-sdk?style=flat-square" /></a>
  </p>

  <p>
    <a href="#architecture">Architecture</a> ·
    <a href="#packages">Packages</a> ·
    <a href="#quickstart">Quickstart</a> ·
    <a href="#extensions">Extensions</a> ·
    <a href="#blockchain-sync">Blockchain Sync</a> ·
    <a href="#contributing">Contributing</a>
  </p>
</div>

---

## What is EchoMirror SDK?

EchoMirror is a social wellness platform — users log their mood, gift ECHO tokens over Stellar, and reflect through an AI-powered mirror. The SDK opens this infrastructure to every developer, on every platform.

**Built on Rust.** The performance-critical core — Stellar cryptography, XDR transaction encoding, blockchain sync, and balance verification — is written in Rust and shipped as:

- **WebAssembly** for browsers and Node.js (`@echomirror/wasm`)
- **C-ABI shared library** for Flutter, Swift, Python, and any FFI-capable runtime (`echomirror-ffi`)
- **Native Rust crates** for server-side Rust backends (`echomirror-core`, `echomirror-stellar`, `echomirror-sync`)

**Language bindings on top.** Idiomatic wrappers in TypeScript (React, Node.js, vanilla JS), Dart/Flutter, Python, and Swift sit on top of the Rust core — so you get native ergonomics without reimplementing crypto in every language.

**Extensions included.** A VS Code extension brings live ECHO balance, Friendbot funding, and the blockchain sync explorer directly into your editor. A Chrome/Firefox extension lets you inject the mood widget and watch Stellar transactions on any site.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        EchoMirror API                           │
│              (auth · mood · AI reflections · social)            │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP/REST
┌───────────────────────────▼─────────────────────────────────────┐
│                     Rust Core Layer                             │
│                                                                 │
│  echomirror-core   echomirror-stellar   echomirror-sync         │
│  ─────────────     ────────────────     ────────────────        │
│  client, types,    Horizon client,      streaming ledger        │
│  error handling,   balance queries,     sync engine,            │
│  config, auth      tx building,         resumable cursors,      │
│                    Friendbot            event broadcast         │
│                                                                 │
│  echomirror-wasm           echomirror-ffi                       │
│  ─────────────────         ──────────────────                   │
│  → WASM for browser        → C-ABI .so/.dylib/.dll             │
│    and Node.js               for Flutter, Swift, Python         │
└────┬──────────────────────────────────┬────────────────────────┘
     │  wasm-bindgen                    │  dart:ffi / ctypes / swift-ffi
     ▼                                  ▼
┌──────────────────┐        ┌────────────────────────────────────┐
│  JS/TS packages  │        │        Native packages             │
│                  │        │                                    │
│  @echomirror/    │        │  echomirror_sdk (Flutter/Dart)     │
│    core          │        │  echomirror-python                 │
│    mood          │        │  EchoMirrorSDK (Swift)             │
│    stellar       │        │                                    │
│    social        │        └────────────────────────────────────┘
│    analytics     │
│    react         │
│    wasm          │
│    widget        │
└────┬─────────────┘
     │
     ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Extensions                               │
│                                                                  │
│  VS Code Extension          Chrome / Firefox Extension           │
│  ─────────────────          ───────────────────────────          │
│  • Live ECHO status bar     • Inject mood widget on any site     │
│  • Friendbot command        • Watch Stellar TXs in background    │
│  • Sync explorer panel      • Popup balance checker              │
│  • Mood log snippets        • Desktop notifications on TX        │
└──────────────────────────────────────────────────────────────────┘
```

---

## Packages

### Rust Crates

| Crate | Description |
|---|---|
| [`echomirror-core`](./crates/echomirror-core) | Client, types, config, error handling |
| [`echomirror-stellar`](./crates/echomirror-stellar) | Horizon client, balance, Friendbot, TX building |
| [`echomirror-sync`](./crates/echomirror-sync) | Streaming blockchain sync engine with resumable cursors |
| [`echomirror-ffi`](./crates/echomirror-ffi) | C-ABI bindings for Flutter, Python, Swift |
| [`echomirror-wasm`](./crates/echomirror-wasm) | WebAssembly build for browser and Node.js |

### JavaScript / TypeScript

| Package | Platform | Description |
|---|---|---|
| [`@echomirror/core`](./packages/js/core) | JS/TS | API client, auth, shared TypeScript types |
| [`@echomirror/mood`](./packages/js/mood) | JS/TS | Mood logging, streaks, AI reflections |
| [`@echomirror/stellar`](./packages/js/stellar) | JS/TS | Freighter wallet, XLM balance, ECHO token |
| [`@echomirror/social`](./packages/js/social) | JS/TS | Global feed, leaderboard, follows |
| [`@echomirror/analytics`](./packages/js/analytics) | JS/TS | Emotional UX event tracking |
| [`@echomirror/react`](./packages/js/react) | React | Hooks, Provider, context |
| [`@echomirror/widget`](./packages/js/widget) | React + Web Component | Drop-in floating mood widget |
| [`@echomirror/wasm`](./packages/js/wasm) | Browser + Node.js | Rust WASM — crypto, cursor serialization |

### Native

| Package | Platform | Description |
|---|---|---|
| [`echomirror_sdk`](./packages/flutter) | Flutter/Dart | Full SDK — mood, Stellar, social, blockchain sync, FFI |
| `echomirror-python` *(coming)* | Python | Async client — `pip install echomirror` |
| `EchoMirrorSDK` *(coming)* | Swift | iOS/macOS SDK via SPM |

### Extensions

| Extension | Description |
|---|---|
| [`extensions/vscode`](./extensions/vscode) | VS Code — status bar, Sync Explorer, snippets, Friendbot |
| [`extensions/chrome`](./extensions/chrome) | Chrome/Edge/Brave — mood widget injection, TX watcher |
| `extensions/firefox` *(coming)* | Firefox — same as Chrome, MV2/MV3 dual manifest |

---

## Quickstart

### Rust (server-side)

```bash
cargo add echomirror-core echomirror-stellar echomirror-sync
```

```rust
use echomirror_core::{EchoMirrorClient, EchoMirrorConfig};
use echomirror_stellar::{get_balance, fund_testnet_account};
use echomirror_sync::{SyncEngine, SyncFilter};

#[tokio::main]
async fn main() {
    let client = EchoMirrorClient::new(EchoMirrorConfig::testnet("your_api_key")).unwrap();
    client.set_auth_token(Some("user_jwt".into())).await;

    // Get Stellar balance (queries Horizon directly — no API round-trip)
    let balance = get_balance(&client, "GPUBLIC_KEY").await.unwrap();
    println!("{} XLM  •  {} ECHO", balance.xlm, balance.echo);

    // Stream real-time blockchain events
    let engine = SyncEngine::builder(&client)
        .watch("GPUBLIC_KEY")
        .filter(SyncFilter::new().asset("ECHO").min_amount(1.0))
        .build();

    let mut stream = engine.clone().subscribe();
    engine.start();

    while let Ok(event) = stream.recv().await {
        println!("{:?}", event);
    }
}
```

### JavaScript / TypeScript

```bash
npm install @echomirror/core @echomirror/mood @echomirror/stellar
```

```ts
import { EchoMirrorClient } from '@echomirror/core'
import { logMood, getMoodStreak } from '@echomirror/mood'
import { connectFreighter, getBalance, sendEcho } from '@echomirror/stellar'

const client = new EchoMirrorClient({ apiKey: 'your_api_key', network: 'testnet' })

// Mood
const entry = await logMood(client, { score: 8, note: 'Great day', tags: ['work'] })
const streak = await getMoodStreak(client)
console.log(`${streak.current} day streak 🔥`)

// Stellar
const wallet = await connectFreighter()
const balance = await getBalance(client, wallet.publicKey)
await sendEcho(client, { from: wallet.publicKey, to: 'GRECIPIENT', amount: 5, memo: '✨' })
```

### React

```bash
npm install @echomirror/react @echomirror/widget
```

```tsx
import { EchoMirrorProvider, useMoodStreak } from '@echomirror/react'
import { MoodWidget } from '@echomirror/widget'

function App() {
  const { streak } = useMoodStreak()
  return (
    <div>
      <p>{streak?.current} day streak 🔥</p>
      <MoodWidget position="bottom-right" theme="auto" />
    </div>
  )
}

export default function Root() {
  return (
    <EchoMirrorProvider apiKey="your_api_key" config={{ network: 'testnet' }}>
      <App />
    </EchoMirrorProvider>
  )
}
```

### Flutter

```yaml
dependencies:
  echomirror_sdk: ^0.1.0
```

```dart
import 'package:echomirror_sdk/echomirror_sdk.dart';

void main() async {
  await EchoMirror.initialize(
    apiKey: 'your_api_key',
    network: StellarNetwork.testnet,
  );
  runApp(const MyApp());
}

// In your widget:
final balance = await EchoMirror.instance.stellar.getBalance(publicKey);
final streak  = await EchoMirror.instance.mood.getStreak();

// Blockchain sync — real-time Stellar event stream
final sync = BlockchainSyncClient(EchoMirror.instance.config);
sync.watch(publicKey).listen((event) {
  if (event is LedgerSyncEvent) {
    print('New ledger: ${event.ledgerSequence}');
  }
});
```

### WebAssembly (browser, no bundler)

```html
<script type="module">
  import init, { isValidStellarAddress, hashPublicKey } from '@echomirror/wasm'
  await init()

  console.log(isValidStellarAddress('GPUBLIC_KEY')) // true
  console.log(hashPublicKey('GPUBLIC_KEY'))          // sha256 hex
</script>
```

---

## Blockchain Sync

The `echomirror-sync` Rust crate and `BlockchainSyncClient` in Flutter provide a **resumable, real-time Stellar blockchain sync engine**.

### How it works

1. **Start from any ledger** — pass a starting sequence number, or use `SyncCursor::genesis()` to start from the tip
2. **Resumable cursors** — after each page, the engine saves a `SyncCursor` (ledger sequence + paging token). Restart the engine anytime and it picks up exactly where it left off — no re-scanning
3. **Filters** — only emit events matching your rules: specific accounts, assets (`ECHO`/`XLM`), minimum amounts, memo prefixes
4. **Multi-account** — watch up to 100 accounts in a single engine instance
5. **Event types** — `TransactionDetected`, `LedgerClosed`, `SyncStarted`, `SyncPaused`, `SyncCompleted`, `Error`

### Persistence

Implement `CursorStore` to persist cursors in your database:

```rust
use echomirror_sync::{CursorStore, SyncCursor};
use async_trait::async_trait;

struct RedisCursorStore { client: redis::Client }

#[async_trait]
impl CursorStore for RedisCursorStore {
    async fn load(&self, account: &str) -> Option<SyncCursor> {
        // load from Redis
    }
    async fn save(&self, account: &str, cursor: &SyncCursor) {
        // save to Redis
    }
}

let engine = SyncEngine::builder(&client)
    .watch("GPUBLIC_KEY")
    .cursor_store(Arc::new(RedisCursorStore { client }))
    .build();
```

---

## Extensions

### VS Code Extension

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/publishers/EchoMirrorButler) *(coming soon)* or build locally:

```bash
cd extensions/vscode
npm install && npm run build
code --install-extension echomirror-sdk-vscode-0.1.0.vsix
```

**Features:**
- **Status bar** — live ECHO balance, refreshes every 60s
- **Sync Explorer** — real-time Stellar transaction stream in a VS Code panel
- **Friendbot command** — `EchoMirror: Fund Testnet Account` — one click, 10,000 XLM
- **Address validator** — `EchoMirror: Validate Stellar Address`
- **Code snippets** — `em-mood`, `em-streak`, `em-balance`, `em-freighter`, `em-send`, `em-sync` for TypeScript and Dart

### Chrome / Firefox Extension

```bash
cd extensions/chrome
npm install && npm run build
# Load extensions/chrome/dist as unpacked extension in chrome://extensions
```

**Features:**
- **Popup** — check any account's XLM + ECHO balance on any network
- **Inject mood widget** — adds the floating `<MoodWidget />` to any website
- **Background watcher** — monitors an account's Stellar transactions, sends desktop notifications on new TXs

---

## Build from Source

### JavaScript packages

```bash
npm install       # installs all workspaces
npm run build     # builds all @echomirror/* packages
npm run test      # runs all tests
```

### Rust crates

```bash
cargo build --workspace
cargo test --workspace
```

### WebAssembly

```bash
cargo install wasm-pack
wasm-pack build crates/echomirror-wasm --target web \
  --out-dir packages/js/wasm/wasm-dist
```

### Flutter FFI shared library

```bash
# macOS
cargo build -p echomirror-ffi --release
# → target/release/libechomirror_ffi.dylib

# Android arm64
cargo build -p echomirror-ffi --target aarch64-linux-android --release

# Android x86_64
cargo build -p echomirror-ffi --target x86_64-linux-android --release

# Linux
cargo build -p echomirror-ffi --release
# → target/release/libechomirror_ffi.so
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) — all merged PRs earn Stellar Wave points.

**Good first issues** — look for the `good first issue` label.

---

## Roadmap

**Rust crates**
- [x] `echomirror-core` — client, types, errors
- [x] `echomirror-stellar` — Horizon, balance, Friendbot, TX build
- [x] `echomirror-sync` — streaming ledger sync, resumable cursors
- [x] `echomirror-ffi` — C-ABI for Flutter/Python/Swift
- [x] `echomirror-wasm` — WASM for browser/Node.js
- [ ] `echomirror-sync` — SSE streaming (replace polling)
- [ ] `echomirror-sync` — PostgreSQL cursor store

**JS/TS packages**
- [x] `@echomirror/core`, `mood`, `stellar`, `react`
- [ ] Build pipeline (tsconfig, vitest)
- [ ] `@echomirror/social`, `analytics`, `widget`, `wasm`
- [ ] npm publish pipeline

**Native**
- [x] `echomirror_sdk` Flutter — mood, stellar, social, blockchain sync, FFI
- [ ] Riverpod providers
- [ ] Flutter tests
- [ ] Python binding (`echomirror-python`)
- [ ] Swift package (`EchoMirrorSDK`)
- [ ] pub.dev publish

**Extensions**
- [x] VS Code — status bar, sync explorer, snippets, Friendbot, validator
- [x] Chrome — popup, mood inject, background TX watcher
- [ ] Firefox — MV2 manifest
- [ ] VS Code Marketplace publish

---

## License

MIT — see [LICENSE](./LICENSE).

---

<div align="center">
  <p>Built with love by the <a href="https://github.com/Echo-Mirror-Butler">Echo Mirror Butler</a> team and contributors.</p>
</div>
