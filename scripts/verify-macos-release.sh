#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 2 ]]; then
  echo "Usage: $0 <installer.dmg> <installer.zip>" >&2
  exit 2
fi

dmg_path="$1"
zip_path="$2"
for artifact in "$dmg_path" "$zip_path"; do
  if [[ ! -s "$artifact" ]]; then
    echo "Required macOS release artifact is missing or empty: $artifact" >&2
    exit 1
  fi
done

temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/aioffice-macos-release.XXXXXX")"
dmg_mount="$(mktemp -d "$temporary_root/dmg.XXXXXX")"
cleanup() {
  hdiutil detach "$dmg_mount" -quiet >/dev/null 2>&1 || true
  rm -rf "$temporary_root"
}
trap cleanup EXIT

verify_app() {
  local app_path="$1"
  if [[ ! -d "$app_path" ]]; then
    echo "AIOffice.app was not found in the macOS package: $app_path" >&2
    exit 1
  fi

  codesign --verify --deep --strict --verbose=2 "$app_path"
  local signature
  signature="$(codesign --display --verbose=4 "$app_path" 2>&1)"
  if ! grep -q '^Authority=Developer ID Application:' <<<"$signature"; then
    echo "AIOffice.app is not signed with a Developer ID Application certificate: $app_path" >&2
    exit 1
  fi

  spctl --assess --type execute --verbose=4 "$app_path"
  xcrun stapler validate "$app_path"
}

hdiutil attach "$dmg_path" -readonly -nobrowse -mountpoint "$dmg_mount" >/dev/null
dmg_app="$(find "$dmg_mount" -maxdepth 3 -type d -name 'AIOffice.app' -print -quit)"
if [[ -z "$dmg_app" ]]; then
  echo "AIOffice.app was not found inside the disk image: $dmg_path" >&2
  exit 1
fi
verify_app "$dmg_app"
hdiutil detach "$dmg_mount" -quiet >/dev/null

zip_root="$temporary_root/zip"
mkdir -p "$zip_root"
ditto -x -k "$zip_path" "$zip_root"
zip_app="$(find "$zip_root" -maxdepth 4 -type d -name 'AIOffice.app' -print -quit)"
if [[ -z "$zip_app" ]]; then
  echo "AIOffice.app was not found inside the ZIP archive: $zip_path" >&2
  exit 1
fi
verify_app "$zip_app"

echo "Verified Developer ID signature, Gatekeeper acceptance, and notarization ticket in both macOS artifacts."
