# EchoMirrorSDK for Swift

EchoMirrorSDK is a Swift Package Manager wrapper around the Rust `echomirror-ffi`
crate. It exposes Swift-native clients for mood, Stellar, and social features
while keeping ownership of Rust-allocated values explicit.

## Add by URL

In Xcode, add `https://github.com/Echo-Mirror-Butler/echomirror-sdk.git`, choose a tag listed in [Releases](https://github.com/Echo-Mirror-Butler/echomirror-sdk/releases), and select the `EchoMirrorSDK` product. Each Swift release includes a checksum-pinned XCFramework for iOS devices, iOS simulators, and macOS. The root `Package.swift` is the URL package manifest.

## Build the binary target locally

The package links a local XCFramework generated from `echomirror-ffi`:

```bash
bash scripts/build-xcframework.sh
swift build
swift test
```

The build script produces:

```text
packages/swift/EchoMirrorSDK/Artifacts/EchoMirrorFFI.xcframework
```

To publish a new tag, run the `Swift SDK CI` workflow with the `swift_release_tag` input. It builds a zip and records its checksum and workflow run ID in `swift-release.json`. Commit that file on `main` before creating the matching `vX.Y.Z` tag. The tag workflow verifies and uploads the exact prepared zip, then tests the URL package.

## Usage

```swift
import EchoMirrorSDK

let config = EchoMirrorConfig(apiKey: "your_api_key", network: .testnet)
let sdk = try EchoMirror(config: config)

let entry = try await sdk.mood.logMood(
    userId: "user-1",
    score: 8,
    note: "Feeling steady",
    tags: ["focus"]
)

let balance = try await sdk.stellar.getBalance(publicKey: "GPUBLIC_KEY")
let profile = try await sdk.social.profile(userId: "user-1")
```

## Memory ownership

Rust owns client handles until Swift calls the matching `*_client_free`
function from each client deinitializer. Rust-allocated strings are copied into
Swift strings and immediately released with `echomirror_free_string`.
