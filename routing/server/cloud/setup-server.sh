#!/bin/bash
# CUMO DRIVE Routing Server auf einem Linux Server (Ubuntu 24.04) einrichten oder aktualisieren.
# Läuft beim ersten Start über cloud init und danach wöchentlich (cumo-routing-update.timer).
# Lädt die Kartendaten, fügt sie zusammen, baut den Graphen und startet GraphHopper neu.
set -euo pipefail
BASE=/opt/cumo-routing
GH_VERSION=11.0
HEAP=26g
REGIONS=(
  europe/dach-latest.osm.pbf
  europe/italy/nord-est-latest.osm.pbf
  europe/italy/nord-ovest-latest.osm.pbf
  europe/france/alsace-latest.osm.pbf
  europe/france/lorraine-latest.osm.pbf
  europe/france/franche-comte-latest.osm.pbf
  europe/france/rhone-alpes-latest.osm.pbf
  europe/france/provence-alpes-cote-d-azur-latest.osm.pbf
  europe/slovenia-latest.osm.pbf
)
log() { echo "$(date -Is) $*" | tee -a "$BASE/setup.log"; }
mkdir -p "$BASE/bin" "$BASE/download" "$BASE/data"
cd "$BASE"
if [ ! -f "bin/graphhopper-web-$GH_VERSION.jar" ]; then
  log "GraphHopper $GH_VERSION laden"
  curl -fL --retry 5 -o "bin/graphhopper-web-$GH_VERSION.jar" "https://github.com/graphhopper/graphhopper/releases/download/$GH_VERSION/graphhopper-web-$GH_VERSION.jar"
fi
files=()
for r in "${REGIONS[@]}"; do
  f="download/$(echo "$r" | tr '/' '_')"
  log "Kartendaten laden: $r"
  curl -fL --retry 5 -z "$f" -o "$f" "https://download.geofabrik.de/$r"
  files+=("$f")
done
log "Kartendaten zusammenfügen"
osmium merge "${files[@]}" -o data/region.new.osm.pbf --overwrite
log "Graph bauen (dauert etwa eine Stunde)"
rm -rf data/graph-cache.new
sed 's#data/graph-cache#data/graph-cache.new#; s#data/region.osm.pbf#data/region.new.osm.pbf#' config.yml > config.import.yml
chown -R cumo:cumo "$BASE"
sudo -u cumo java -Xmx$HEAP -jar "bin/graphhopper-web-$GH_VERSION.jar" import config.import.yml >> "$BASE/import.log" 2>&1
systemctl stop cumo-routing || true
rm -rf data/graph-cache data/region.osm.pbf
mv data/graph-cache.new data/graph-cache
mv data/region.new.osm.pbf data/region.osm.pbf
chown -R cumo:cumo "$BASE"
systemctl start cumo-routing
log "Fertig, Server läuft"
