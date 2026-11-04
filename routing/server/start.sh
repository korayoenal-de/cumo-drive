#!/bin/bash
# CUMO DRIVE Routing Server starten. Vorher einmal: bash setup.sh
# Läuft, bis du im Terminal Ctrl + C drückst.

set -euo pipefail
cd "$(dirname "$0")"

GH_VERSION="11.0"
if [ ! -d data/graph-cache ]; then
  echo "Noch kein Routing Graph vorhanden. Erst einrichten mit: bash setup.sh"
  exit 1
fi
HEAP="$(cat data/heap.txt 2>/dev/null || echo 3g)"
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 'unbekannt')"

echo "Routing Server startet ($(cat data/region.txt 2>/dev/null || echo Region unbekannt)) ..."
echo "  Am Mac:       http://localhost:8989"
echo "  Vom iPhone:   http://$IP:8989   (gleiches WLAN)"
echo "Die App findet den Server automatisch, solange der Expo Server auf demselben Mac läuft."
echo
exec java -Xmx"$HEAP" -jar "bin/graphhopper-web-$GH_VERSION.jar" server config.yml
