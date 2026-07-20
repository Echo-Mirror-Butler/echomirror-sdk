// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "EchoMirrorSDK",
    platforms: [
        .iOS(.v15),
        .macOS(.v12)
    ],
    products: [
        .library(
            name: "EchoMirrorSDK",
            targets: ["EchoMirrorSDK"]
        )
    ],
    targets: [
        .binaryTarget(
            name: "EchoMirrorFFI",
            path: "Artifacts/EchoMirrorFFI.xcframework"
        ),
        .target(
            name: "EchoMirrorSDK",
            dependencies: ["EchoMirrorFFI"]
        ),
        .testTarget(
            name: "EchoMirrorSDKTests",
            dependencies: ["EchoMirrorSDK"]
        )
    ]
)
