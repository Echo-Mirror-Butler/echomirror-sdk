#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PLUGIN_DIR="$ROOT_DIR/packages/flutter"
OUT_DIR="$PLUGIN_DIR/ios/Frameworks"
BUILD_DIR="$PLUGIN_DIR/build/ios"
FRAMEWORK_NAME="EchoMirrorFFI"
HEADER="$BUILD_DIR/Headers/echomirror_ffi.h"

rm -rf "$OUT_DIR/$FRAMEWORK_NAME.xcframework" "$BUILD_DIR"
mkdir -p "$BUILD_DIR/Headers"

cat > "$HEADER" <<'HEADER'
#include <stdint.h>

void echomirror_free_string(char *ptr);
uint8_t echomirror_verify_mood_score(uint8_t score);
char *echomirror_hash_public_key(const char *public_key);
uint8_t echomirror_is_valid_stellar_address(const char *address);
char *echomirror_serialize_cursor(uint32_t ledger_sequence, const char *paging_token, uint64_t total_processed);
char *echomirror_version(void);
HEADER

rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
cargo build -p echomirror-ffi --target aarch64-apple-ios --release
cargo build -p echomirror-ffi --target aarch64-apple-ios-sim --release
cargo build -p echomirror-ffi --target x86_64-apple-ios --release

create_framework() {
  local platform="$1"
  local lib="$2"
  local framework="$BUILD_DIR/$platform/$FRAMEWORK_NAME.framework"
  mkdir -p "$framework/Headers" "$framework/Modules"
  cp "$lib" "$framework/$FRAMEWORK_NAME"
  cp "$HEADER" "$framework/Headers/echomirror_ffi.h"
  cat > "$framework/Modules/module.modulemap" <<MODULE
framework module $FRAMEWORK_NAME {
  umbrella header "echomirror_ffi.h"
  export *
  module * { export * }
}
MODULE
  cat > "$framework/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>dev.echomirror.ffi</string><key>CFBundleName</key><string>$FRAMEWORK_NAME</string><key>CFBundlePackageType</key><string>FMWK</string><key>CFBundleVersion</key><string>0.1.0</string><key>CFBundleShortVersionString</key><string>0.1.0</string></dict></plist>
PLIST
}

SIM_UNIVERSAL="$BUILD_DIR/libechomirror_ffi_sim.a"
lipo -create \
  "$ROOT_DIR/target/aarch64-apple-ios-sim/release/libechomirror_ffi.a" \
  "$ROOT_DIR/target/x86_64-apple-ios/release/libechomirror_ffi.a" \
  -output "$SIM_UNIVERSAL"

create_framework iphoneos "$ROOT_DIR/target/aarch64-apple-ios/release/libechomirror_ffi.a"
create_framework iphonesimulator "$SIM_UNIVERSAL"

xcodebuild -create-xcframework \
  -framework "$BUILD_DIR/iphoneos/$FRAMEWORK_NAME.framework" \
  -framework "$BUILD_DIR/iphonesimulator/$FRAMEWORK_NAME.framework" \
  -output "$OUT_DIR/$FRAMEWORK_NAME.xcframework"
