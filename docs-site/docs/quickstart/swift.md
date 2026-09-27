---
sidebar_position: 6
---

# Swift Quickstart

The Swift package wraps the Rust `echomirror-ffi` library for iOS 15+ and macOS 12+.
Choose a [Swift release tag](https://github.com/Echo-Mirror-Butler/echomirror-sdk/releases) that includes `EchoMirrorFFI.xcframework.zip`; a source branch without a release is not an installable URL package.

In Xcode, choose **File → Add Package Dependencies**, enter:

```text
https://github.com/Echo-Mirror-Butler/echomirror-sdk.git
```

Select an available version tag and add the `EchoMirrorSDK` library to your app target. In a Swift file, call the native-backed version function:

```swift
import EchoMirrorSDK

print("EchoMirror FFI version: \(EchoMirrorVersion.current())")
```

For a source checkout, first build the local XCFramework and then run the package tests:

```bash
bash scripts/build-xcframework.sh
swift build
swift test
```

The URL package downloads the versioned XCFramework from the same tag's GitHub Release. SwiftPM checks its SHA-256 checksum from `packages/swift/EchoMirrorSDK/swift-release.json` before linking it.

