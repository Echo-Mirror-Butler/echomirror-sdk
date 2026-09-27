// swift-tools-version: 5.9

import Foundation
import PackageDescription

// A source checkout uses the locally built binary. Tagged releases carry a
// checksum file and resolve the matching archive from GitHub Releases instead.
let binaryPath = "packages/swift/EchoMirrorSDK/Artifacts/EchoMirrorFFI.xcframework"
let packageRoot = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let binaryTarget: Target
if FileManager.default.fileExists(atPath: packageRoot.appendingPathComponent(binaryPath).path) {
    binaryTarget = .binaryTarget(name: "EchoMirrorFFI", path: binaryPath)
} else {
    let releasePath = "packages/swift/EchoMirrorSDK/swift-release.json"
    guard let data = FileManager.default.contents(atPath: packageRoot.appendingPathComponent(releasePath).path),
          let release = try? JSONDecoder().decode(SwiftRelease.self, from: data) else {
        fatalError("Build the XCFramework with scripts/build-xcframework.sh or use a tagged Swift release")
    }
    binaryTarget = .binaryTarget(
        name: "EchoMirrorFFI",
        url: "https://github.com/Echo-Mirror-Butler/echomirror-sdk/releases/download/\(release.tag)/EchoMirrorFFI.xcframework.zip",
        checksum: release.checksum
    )
}

struct SwiftRelease: Decodable {
    let tag: String
    let checksum: String
}

let package = Package(
    name: "EchoMirrorSDK",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [.library(name: "EchoMirrorSDK", targets: ["EchoMirrorSDK"])],
    targets: [
        binaryTarget,
        .target(
            name: "EchoMirrorSDK",
            dependencies: ["EchoMirrorFFI"],
            path: "packages/swift/EchoMirrorSDK/Sources/EchoMirrorSDK"
        ),
        .testTarget(
            name: "EchoMirrorSDKTests",
            dependencies: ["EchoMirrorSDK"],
            path: "packages/swift/EchoMirrorSDK/Tests/EchoMirrorSDKTests"
        )
    ]
)
