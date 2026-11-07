#!/bin/bash
# Navigationssymbole für CarPlay als PNG (weiß auf transparent, 64 pt in @2x und @3x) aus derselben Quelle wie in der App.
# Der Config Plugin plugins/with-carplay.js legt sie beim Prebuild als Bilder ins Xcode Projekt.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
node --experimental-strip-types scripts/nav-icons.mts "$tmp" > /dev/null
rm -rf assets/carplay-icons && mkdir -p assets/carplay-icons
for f in "$tmp"/*.svg; do
  n=$(basename "$f" .svg)
  rsvg-convert -w 128 -h 128 "$f" -o "assets/carplay-icons/$n@2x.png"
  rsvg-convert -w 192 -h 192 "$f" -o "assets/carplay-icons/$n@3x.png"
done
rm -rf "$tmp"
ls assets/carplay-icons | wc -l
