# EchoMirrorSDK for Swift

EchoMirrorSDK is a Swift Package Manager wrapper around the Rust `echomirror-ffi`
crate. It exposes Swift-native clients for mood, Stellar, and social features
while keeping ownership of Rust-allocated values explicit.

## Build the binary target

The package links a local XCFramework generated from `echomirror-ffi`:

```bash
packages/swift/EchoMirrorSDK/Scripts/build-xcframework.sh
swift test --package-path packages/swift/EchoMirrorSDK
```

The build script produces:

```text
packages/swift/EchoMirrorSDK/Artifacts/EchoMirrorFFI.xcframework
```

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
