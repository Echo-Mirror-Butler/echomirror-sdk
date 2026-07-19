#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PLUGIN_DIR="$ROOT_DIR/packages/flutter"

cargo ndk \
  -t arm64-v8a \
  -t armeabi-v7a \
  -t x86 \
  -t x86_64 \
  -o "$PLUGIN_DIR/android/src/main/jniLibs" \
  build -p echomirror-ffi --release
