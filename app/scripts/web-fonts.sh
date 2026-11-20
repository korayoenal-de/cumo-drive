#!/bin/bash
# Schriften fürs Web als WOFF2 (Performance 20.11.2026): Latin und Latin Extended, alle OpenType Merkmale (Tabellenziffern),
# aus den Paketen von @expo-google-fonts nach public/fonts. Braucht fonttools und brotli (pip install fonttools brotli).
set -euo pipefail
cd "$(dirname "$0")/.."
NM=node_modules/@expo-google-fonts
for spec in archivo/800ExtraBold/Archivo_800ExtraBold archivo/900Black/Archivo_900Black inter/400Regular/Inter_400Regular \
  inter/500Medium/Inter_500Medium inter/600SemiBold/Inter_600SemiBold inter/700Bold/Inter_700Bold inter/800ExtraBold/Inter_800ExtraBold; do
  pyftsubset "$NM/$spec.ttf" --output-file="public/fonts/$(basename "$spec").woff2" --flavor=woff2 --layout-features='*' \
    --unicodes="U+0000-024F,U+0259,U+02C6-02DD,U+1E00-1EFF,U+2000-206F,U+20AC,U+2122,U+2190-21FF,U+2212,U+2215,U+2248,U+2260,U+2264,U+2265,U+25B2-25BC,U+2713,U+2715"
done
