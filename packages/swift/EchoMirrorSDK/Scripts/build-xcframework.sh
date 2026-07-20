#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/packages/swift/EchoMirrorSDK"
ARTIFACT_DIR="$PACKAGE_DIR/Artifacts"
BUILD_DIR="$PACKAGE_DIR/.build/ffi"
HEADER_DIR="$PACKAGE_DIR/CHeaders"

IOS_DEVICE_TARGET="aarch64-apple-ios"
IOS_SIM_TARGETS=("aarch64-apple-ios-sim" "x86_64-apple-ios")
MACOS_TARGETS=("aarch64-apple-darwin" "x86_64-apple-darwin")

rm -rf "$ARTIFACT_DIR/EchoMirrorFFI.xcframework" "$BUILD_DIR"
mkdir -p "$ARTIFACT_DIR" "$BUILD_DIR/ios-simulator" "$BUILD_DIR/macos"

build_target() {
  local target="$1"
  rustup target add "$target"
  cargo build -p echomirror-ffi --release --target "$target"
}

build_target "$IOS_DEVICE_TARGET"
for target in "${IOS_SIM_TARGETS[@]}"; do
  build_target "$target"
done
for target in "${MACOS_TARGETS[@]}"; do
  build_target "$target"
done

lipo -create \
  "$ROOT_DIR/target/aarch64-apple-ios-sim/release/libechomirror_ffi.a" \
  "$ROOT_DIR/target/x86_64-apple-ios/release/libechomirror_ffi.a" \
  -output "$BUILD_DIR/ios-simulator/libechomirror_ffi.a"

lipo -create \
  "$ROOT_DIR/target/aarch64-apple-darwin/release/libechomirror_ffi.a" \
  "$ROOT_DIR/target/x86_64-apple-darwin/release/libechomirror_ffi.a" \
  -output "$BUILD_DIR/macos/libechomirror_ffi.a"

xcodebuild -create-xcframework \
  -library "$ROOT_DIR/target/aarch64-apple-ios/release/libechomirror_ffi.a" \
  -headers "$HEADER_DIR" \
  -library "$BUILD_DIR/ios-simulator/libechomirror_ffi.a" \
  -headers "$HEADER_DIR" \
  -library "$BUILD_DIR/macos/libechomirror_ffi.a" \
  -headers "$HEADER_DIR" \
  -output "$ARTIFACT_DIR/EchoMirrorFFI.xcframework"
