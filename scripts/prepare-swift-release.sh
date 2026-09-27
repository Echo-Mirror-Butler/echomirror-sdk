#!/usr/bin/env bash
set -euo pipefail

tag="${1:?usage: prepare-swift-release.sh vX.Y.Z}"
if [[ ! "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Expected a Swift semantic version tag such as v0.1.0" >&2
  exit 1
fi
if [[ ! "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ ]]; then
  echo "Run this script from the Swift release preparation workflow" >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
archive_dir="$root/.build/swift-release"
archive="$archive_dir/EchoMirrorFFI.xcframework.zip"
manifest="$root/packages/swift/EchoMirrorSDK/swift-release.json"

bash "$root/scripts/build-xcframework.sh"
mkdir -p "$archive_dir"
rm -f "$archive"
ditto -c -k --sequesterRsrc --keepParent \
  "$root/packages/swift/EchoMirrorSDK/Artifacts/EchoMirrorFFI.xcframework" "$archive"
checksum="$(swift package compute-checksum "$archive")"
printf '{\n  "tag": "%s",\n  "checksum": "%s",\n  "artifactRunId": %s\n}\n' \
  "$tag" "$checksum" "$GITHUB_RUN_ID" > "$manifest"
echo "Prepared $archive with SwiftPM checksum $checksum"
echo "Commit $manifest before creating tag $tag."
