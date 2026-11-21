#!/bin/bash
# Navigationssymbole für CarPlay als PNG (weiß auf transparent, 64 pt in @2x und @3x) aus derselben Quelle wie in der App.
# Dazu je eine orange Fassung (-on): kurz vor dem Manöver wechselt das Symbol auf Signal Orange, weil CarPlay
# im Manöverfeld keine Animation erlaubt (Koray 7.11.).
# Der Config Plugin plugins/with-carplay.js legt sie beim Prebuild als Bilder ins Xcode Projekt.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
# tsx statt node: die Geometrie nutzt den Pfad Alias @/ (Übersetzungen)
npx tsx --tsconfig scripts/replay/tsconfig.json scripts/nav-icons.mts "$tmp" > /dev/null
# nur die eigenen Bilder ersetzen, die Autos (car-*) kommen aus einem anderen Skript
mkdir -p assets/carplay-icons && rm -f assets/carplay-icons/nav-*.png assets/carplay-icons/fun-*.png
for f in "$tmp"/*.svg; do
  n=$(basename "$f" .svg)
  rsvg-convert -w 128 -h 128 "$f" -o "assets/carplay-icons/$n@2x.png"
  rsvg-convert -w 192 -h 192 "$f" -o "assets/carplay-icons/$n@3x.png"
  # kräftige Fassung für die Zeile „Dann“ wird nie orange
  [[ "$n" == *-s ]] && continue
  # Helleres Orange als in der App: #E2461C wirkte auf dem Autodisplay dunkel und billig (Koray 10.11.)
  sed 's/#FFFFFF/#FF7A4D/g' "$f" > "$tmp/$n-on.tmp"
  rsvg-convert -w 128 -h 128 "$tmp/$n-on.tmp" -o "assets/carplay-icons/$n-on@2x.png"
  rsvg-convert -w 192 -h 192 "$tmp/$n-on.tmp" -o "assets/carplay-icons/$n-on@3x.png"
done
# Logo als Pegel für die Highlight Hinweise (fun-1 bis fun-5)
npx tsx --tsconfig scripts/replay/tsconfig.json scripts/fun-icons.mts "$tmp/fun" > /dev/null
for f in "$tmp"/fun/*.svg; do
  n=$(basename "$f" .svg)
  rsvg-convert -w 128 -h 128 "$f" -o "assets/carplay-icons/$n@2x.png"
  rsvg-convert -w 192 -h 192 "$f" -o "assets/carplay-icons/$n@3x.png"
done
rm -rf "$tmp"
ls assets/carplay-icons | wc -l
