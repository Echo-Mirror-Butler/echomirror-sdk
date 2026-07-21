# EchoMirror SwiftUI Example

This minimal SwiftUI app demonstrates the Swift SDK surface added for iOS and
macOS clients:

- Mood log form using `MoodClient.logMood`
- Stellar balance lookup using `StellarClient.getBalance`
- Shared `EchoMirrorConfig` setup for testnet development

Create an Xcode iOS app target, add `packages/swift/EchoMirrorSDK` as a local
Swift package dependency, then copy these source files into the app target.
