#!/bin/bash
# CUMO DRIVE Routing Server einrichten (einmalig, und wenn du die Region wechselst).
#
# Aufruf im Terminal:
#   cd ~/CUMO_DRIVE/routing/server
#   bash setup.sh            # Region Hessen, schnell zum Testen (Odenwald, Bergstraße, Taunus)
#   bash setup.sh alpen      # Alpenraum: AT, CH, Südbayern, Norditalien mit Dolomiten (braucht viel Arbeitsspeicher)
#   bash setup.sh dach       # Deutschland, Österreich, Schweiz komplett (braucht sehr viel Arbeitsspeicher)
#
# Lädt GraphHopper und die Kartendaten (OpenStreetMap über Geofabrik) und baut daraus den
# Routing Graphen mit dem Sportwagen Profil. Danach startest du den Server mit: bash start.sh

set -euo pipefail
cd "$(dirname "$0")"

GH_VERSION="11.0"
REGION="${1:-hessen}"

case "$REGION" in
  hessen) URL="https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf"; HEAP="3g" ;;
  bw) URL="https://download.geofabrik.de/europe/germany/baden-wuerttemberg-latest.osm.pbf"; HEAP="5g" ;;
  bayern) URL="https://download.geofabrik.de/europe/germany/bayern-latest.osm.pbf"; HEAP="6g" ;;
  alpen) URL="https://download.geofabrik.de/europe/alps-latest.osm.pbf"; HEAP="10g" ;;
  dach) URL="https://download.geofabrik.de/europe/dach-latest.osm.pbf"; HEAP="14g" ;;
  *) echo "Unbekannte Region: $REGION. Möglich: hessen, bw, bayern, alpen, dach"; exit 1 ;;
esac

# Java prüfen (GraphHopper braucht Java 17 oder neuer)
if ! command -v java >/dev/null 2>&1 || ! java -version >/dev/null 2>&1; then
  echo "Java fehlt. Installiere es einmalig mit Homebrew:"
  echo "  brew install openjdk@21"
  echo "  sudo ln -sfn \$(brew --prefix)/opt/openjdk@21/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-21.jdk"
  echo "Ohne Homebrew: https://adoptium.net (Temurin 21, macOS, Installer) laden und installieren."
  exit 1
fi
JAVA_MAJOR=$(java -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/')
if [ "${JAVA_MAJOR:-0}" -lt 17 ]; then
  echo "Java $JAVA_MAJOR ist zu alt, GraphHopper braucht 17 oder neuer (siehe oben: openjdk@21)."
  exit 1
fi

# Arbeitsspeicher grob prüfen
MEM_GB=$(( $(sysctl -n hw.memsize) / 1024 / 1024 / 1024 ))
NEED=${HEAP%g}
if [ "$MEM_GB" -lt $(( NEED + 4 )) ]; then
  echo "Hinweis: Dein Mac hat $MEM_GB GB Arbeitsspeicher. Für die Region $REGION werden etwa $NEED GB für GraphHopper empfohlen."
  echo "Wenn der Import abbricht, nimm eine kleinere Region (hessen, bw, bayern)."
fi

mkdir -p bin data
if [ ! -f "bin/graphhopper-web-$GH_VERSION.jar" ]; then
  echo "GraphHopper $GH_VERSION wird geladen ..."
  curl -fL --progress-bar -o "bin/graphhopper-web-$GH_VERSION.jar" \
    "https://github.com/graphhopper/graphhopper/releases/download/$GH_VERSION/graphhopper-web-$GH_VERSION.jar"
fi

if [ "$(cat data/region.txt 2>/dev/null || true)" != "$REGION" ] || [ ! -f data/region.osm.pbf ]; then
  echo "Kartendaten $REGION werden geladen (kann je nach Region einige Minuten dauern) ..."
  curl -fL --progress-bar -o data/region.osm.pbf.part "$URL"
  mv data/region.osm.pbf.part data/region.osm.pbf
  echo "$REGION" > data/region.txt
  rm -rf data/graph-cache
fi

echo "$HEAP" > data/heap.txt
echo "Routing Graph wird gebaut (Hessen etwa 5 Minuten, Alpen deutlich länger) ..."
java -Xmx"$HEAP" -jar "bin/graphhopper-web-$GH_VERSION.jar" import config.yml
echo
echo "Fertig. Server starten mit: bash start.sh"
