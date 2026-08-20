---
sidebar_position: 3
---

# Architecture

EchoMirror SDK is a multi-language, multi-platform SDK built on a shared Rust core. This page shows exactly how the pieces fit together — which crates depend on which, how compiled artifacts cross language boundaries, and which package you need for a given use case.

## Dependency graph

The diagram below is derived directly from the `Cargo.toml` and `package.json` dependency declarations in this monorepo.

```mermaid
flowchart TD
    subgraph rust ["Rust Crates"]
        core["echomirror-core\n─────────────────\ntypes · HTTP client\nauth · config · errors"]
        stellar["echomirror-stellar\n─────────────────\nHorizon client · balances\nFriendbot · TX building"]
        sync["echomirror-sync\n─────────────────\nSSE streaming · resumable\ncursors · gap backfill\n[postgres feature: sqlx]"]
        ffi["echomirror-ffi\n─────────────────\nC-ABI  .so/.dylib/.dll\ncdylib + staticlib"]
        wasm["echomirror-wasm\n─────────────────\nWebAssembly  cdylib+rlib\ncrypto · hashing · XDR\nwasm-bindgen"]
        python["echomirror-python\n─────────────────\nPyO3 native extension\ncdylib · asyncio support"]
    end

    subgraph jslayer ["JavaScript / TypeScript"]
        jscore["@echomirror/core\n─────────────────\nAPI client · auth\nshared TS types"]
        mood["@echomirror/mood\n─────────────────\nmood logging · streaks\nAI reflections"]
        jsstellar["@echomirror/stellar\n─────────────────\nFreighter · Albedo\nXLM/ECHO balance · send"]
        react["@echomirror/react\n─────────────────\nProvider · hooks\ncontext"]
        social["@echomirror/social\n─────────────────\nfeed · leaderboard\nfollows"]
        analytics["@echomirror/analytics\n─────────────────\nemotion UX events\nprivacy-safe · standalone"]
        wasmjs["@echomirror/wasm\n─────────────────\nTS wrapper around\nwasm-bindgen output"]
    end

    subgraph native ["Native Packages"]
        flutter["echomirror_sdk\n(Flutter / Dart)\n─────────────────\nffi · http\nshared_preferences"]
        pylib["echomirror-python\n(pip install echomirror-sdk)\n─────────────────\nasync Python client"]
        swift["EchoMirrorSDK\n(Swift / SPM)\n─────────────────\niOS 15+ · macOS 12+"]
    end

    %% Rust internal dependencies
    stellar --> core
    sync --> core
    sync --> stellar
    ffi --> core
    ffi --> stellar
    python --> core
    python --> stellar

    %% Rust → compiled artifacts → language bindings
    wasm -- "wasm-pack → wasm-bindgen" --> wasmjs
    ffi -- "dart:ffi" --> flutter
    ffi -- "Swift FFI\n(EchoMirrorFFI.xcframework)" --> swift
    python -- "maturin build" --> pylib

    %% JS internal dependencies
    mood --> jscore
    jsstellar --> jscore
    react --> jscore
    social --> jscore
```

### Key observations

**`echomirror-wasm` is independent of the other crates.** It uses `wasm-bindgen` directly and implements its own crypto (sha2, hex). It is the WASM build target — not a wrapper around `echomirror-core`.

**`@echomirror/core` is a pure TypeScript package.** It is a REST API client for the EchoMirror backend, not a wrapper around `@echomirror/wasm`. The two serve different purposes: `/core` handles mood, auth, and social API calls; `/wasm` exposes cryptographic utilities (address validation, hashing) that run entirely in the browser without an API call.

**`@echomirror/analytics` is standalone.** It has no dependency on other `@echomirror/*` packages and can be dropped into any existing app without pulling in the rest of the SDK.

**Three distinct FFI surfaces.** The Rust codebase produces three compiled artifacts for non-Rust callers:

| Artifact | Output type | Consumed by |
|---|---|---|
| `echomirror-wasm` | `.wasm` via wasm-pack | `@echomirror/wasm` (JS/TS) |
| `echomirror-ffi` `.so/.dylib/.dll` | cdylib + staticlib | Flutter (`dart:ffi`), Swift (`xcframework`) |
| `echomirror-ffi` `.a` / `.xcframework` | staticlib | Swift SPM binary target |
| `echomirror-python` `_echomirror.so` | cdylib (PyO3) | Python (`echomirror` package) |

---

## Which package do I need?

Use this table to find the right starting point. Most use cases need only one or two packages.

### I'm building a **web app** (browser)

| Goal | Install |
|---|---|
| Log moods, get streaks, AI reflections | `@echomirror/core` + `@echomirror/mood` |
| Add Stellar wallet + ECHO balance | `@echomirror/stellar` |
| React hooks and Provider | `@echomirror/react` (includes `@echomirror/core`) |
| Drop-in floating mood widget | `@echomirror/widget` |
| Raw crypto utilities (address validation, hashing) with no backend call | `@echomirror/wasm` |
| Track emotional UX events | `@echomirror/analytics` (standalone, no SDK needed) |
| Social feed, leaderboard, follows | `@echomirror/social` |

**Typical React app** → `@echomirror/react` + `@echomirror/mood` + `@echomirror/stellar`

### I'm building a **React Native / Expo** app

Use the JS packages above. The `@echomirror/wasm` package works in React Native with Metro's WASM support. For native crypto performance, you can also use `echomirror-ffi` via a native module.

### I'm building a **Flutter / Dart** app

Install `echomirror_sdk` from pub.dev. The Flutter package already bundles the FFI bridge to `echomirror-ffi` — you do not need to add the Rust crates separately.

```yaml
dependencies:
  echomirror_sdk: ^0.1.0
```

### I'm building an **iOS or macOS** app in Swift

Add `packages/swift/EchoMirrorSDK` as a Swift Package Manager local dependency, or wait for the SPM registry release. Build the XCFramework first:

```bash
packages/swift/EchoMirrorSDK/Scripts/build-xcframework.sh
```

### I'm building a **Python** backend

```bash
pip install echomirror-sdk
```

This installs the PyO3 native extension (`echomirror-python`) with full asyncio support.

### I'm building a **Rust** backend / server

Add whichever crates you need:

```toml
[dependencies]
echomirror-core = "0.1"       # always needed: client, types, auth
echomirror-stellar = "0.1"    # Stellar balance, Friendbot, TX building
echomirror-sync = "0.1"       # streaming ledger sync with resumable cursors
```

Add the `postgres` feature to `echomirror-sync` if you want the built-in cursor store:

```toml
echomirror-sync = { version = "0.1", features = ["postgres"] }
```

### I need **Stellar payments only** (no mood, no social)

- **TypeScript/JS** → `@echomirror/stellar` alone (it depends on `@echomirror/core` but that's a lightweight API client)
- **Rust** → `echomirror-stellar` + `echomirror-core`
- **Flutter** → `echomirror_sdk` (the Flutter package is unified; you only call the stellar APIs)
- **Python** → `pip install echomirror-sdk` then use `sdk.stellar.*`

### I need **address validation or hashing** with no backend

Use `@echomirror/wasm` directly. It runs entirely in the browser (or Node.js) — no API key, no backend call:

```ts
import { isValidStellarAddress, hashPublicKey } from '@echomirror/wasm'
console.log(isValidStellarAddress('GPUBLIC_KEY')) // true
console.log(hashPublicKey('GPUBLIC_KEY'))          // sha256 hex
```

### Decision flowchart

```mermaid
flowchart TD
    A[What platform?] --> B[Browser / Node.js]
    A --> C[React]
    A --> D[Flutter / Dart]
    A --> E[Swift iOS/macOS]
    A --> F[Python]
    A --> G[Rust server]

    B --> B1{Need mood/social?}
    B1 -- yes --> B2["@echomirror/core\n+ @echomirror/mood\n+ @echomirror/social"]
    B1 -- no, just crypto --> B3["@echomirror/wasm"]
    B1 -- just Stellar payments --> B4["@echomirror/stellar"]

    C --> C1["@echomirror/react\n+ @echomirror/mood\n+ @echomirror/stellar"]

    D --> D1["echomirror_sdk\n(pub.dev)"]

    E --> E1["EchoMirrorSDK\n(Swift Package Manager)"]

    F --> F1["pip install echomirror-sdk"]

    G --> G1{Which features?}
    G1 -- mood + auth --> G2["echomirror-core"]
    G1 -- + Stellar balance/TX --> G3["echomirror-stellar"]
    G1 -- + blockchain sync --> G4["echomirror-sync\n[+ postgres feature]"]
```

---

## Layer summary

```
┌──────────────────────────────────────────────────────────────────┐
│                    EchoMirror Platform API                       │
│            auth · mood · AI reflections · social feed            │
└───────────────────────────┬──────────────────────────────────────┘
                            │ HTTP / REST
┌───────────────────────────▼──────────────────────────────────────┐
│                        Rust Core Layer                           │
│                                                                  │
│  echomirror-core          echomirror-stellar   echomirror-sync   │
│  types · client · auth    Horizon · balance   SSE · cursors      │
│                           Friendbot · TX      gap backfill       │
└──────────┬────────────────────────┬──────────────────────────────┘
           │                        │
    wasm-bindgen               C-ABI + PyO3
           │                        │
    ┌──────▼──────┐    ┌────────────┴──────────────────────┐
    │ WASM target │    │           FFI targets              │
    │  (.wasm)    │    │  echomirror-ffi   echomirror-python│
    └──────┬──────┘    │  (.so/.dylib     (_echomirror.so) │
           │           │   .xcframework)                   │
           │           └──────────┬────────────────────────┘
           │                      │
    ┌──────▼──────┐    ┌──────────┴────────────────────────┐
    │ @echomirror │    │         Native packages            │
    │    /wasm    │    │  echomirror_sdk  (Flutter/Dart)    │
    └──────┬──────┘    │  EchoMirrorSDK  (Swift)           │
           │           │  echomirror     (Python)           │
           │           └───────────────────────────────────┘
    ┌──────▼──────────────────────────────────────────────┐
    │               JS / TS packages                      │
    │  @echomirror/core  · mood  · stellar  · social      │
    │  react  · analytics  · widget                       │
    └─────────────────────────────────────────────────────┘
```
