#!/bin/bash
# CUMO DRIVE Routing Server auf einem Linux Server (Ubuntu 24.04) einrichten oder aktualisieren.
# Läuft beim ersten Start über cloud init und danach wöchentlich (cumo-routing-update.timer).
# Lädt die Kartendaten, fügt sie zusammen, baut den Graphen und startet GraphHopper neu.
set -euo pipefail
exec 9>/run/cumo-setup.lock
flock -n 9 || { echo "$(date -Is) Neuaufbau läuft schon, Abbruch" >> /opt/cumo-routing/setup.log; exit 0; }
BASE=/opt/cumo-routing
GH_VERSION=11.1
HEAP=24g
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
# Je Server anpassbar, ohne das Skript zu ändern (Testaufbau 12.11.: Mittelitalien und Pyrenäen nur auf Server 2):
# /etc/cumo-routing.env mit HEAP=30g und EXTRA_REGIONS="europe/italy/centro-latest.osm.pbf ..."
[ -f /etc/cumo-routing.env ] && . /etc/cumo-routing.env
for r in ${EXTRA_REGIONS:-}; do REGIONS+=("$r"); done
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
log "Graph bauen (dauert mehrere Stunden, vor allem die Landmarken)"
rm -rf data/graph-cache.new
sed 's#data/graph-cache#data/graph-cache.new#; s#data/region.osm.pbf#data/region.new.osm.pbf#' config.yml > config.import.yml
chown -R cumo:cumo "$BASE"
# Import (24 GB) und laufender Server (18 GB) passen erst ab 64 GB RAM sicher nebeneinander,
# auf 48 GB hat der Linux OOM Killer den Import beendet. Der Server pausiert darum während des Imports.
# Seit 12.11. gibt es zwei Server: gebaut wird nur, wenn der andere gesund ist, die App plant solange dort.
PEER=$(cat /etc/cumo-peer 2>/dev/null || true)
health() { curl -fs -m 10 "$1/health" > /dev/null; }
route_ok() { curl -fs -m 60 "http://localhost:8989/route?profile=kurvig&point=49.87,8.65&point=49.65,9.00&points_encoded=false" | grep -q '"paths"'; }
if [ -n "$PEER" ] && ! health "$PEER"; then
  log "Anderer Server ($PEER) antwortet nicht: Neuaufbau ausgesetzt, damit nie beide fehlen"
  rm -rf data/graph-cache.new data/region.new.osm.pbf
  exit 0
fi
MEM_GB=$(free -g | awk '/^Mem:/{print $2}')
STOPPED=0
if [ "$MEM_GB" -lt 64 ]; then systemctl stop cumo-routing || true; STOPPED=1; fi
# Scheitert der Import, läuft der alte Graph sofort weiter
if ! sudo -u cumo java -Xmx$HEAP -XX:+ExitOnOutOfMemoryError -jar "bin/graphhopper-web-$GH_VERSION.jar" import config.import.yml >> "$BASE/import.log" 2>&1; then
  log "Import gescheitert, alter Graph bleibt"
  rm -rf data/graph-cache.new
  [ "$STOPPED" = 1 ] && systemctl start cumo-routing
  exit 1
fi
# Tausch mit Rückweg: der alte Graph bleibt liegen, bis der neue eine Route geliefert hat
systemctl stop cumo-routing || true
rm -rf data/graph-cache.old data/region.old.osm.pbf
[ -d data/graph-cache ] && mv data/graph-cache data/graph-cache.old
[ -f data/region.osm.pbf ] && mv data/region.osm.pbf data/region.old.osm.pbf
mv data/graph-cache.new data/graph-cache
mv data/region.new.osm.pbf data/region.osm.pbf
chown -R cumo:cumo "$BASE"
systemctl start cumo-routing
OK=0
for i in $(seq 1 60); do
  sleep 15
  if health http://localhost:8989 && route_ok; then OK=1; break; fi
done
if [ "$OK" = 1 ]; then
  rm -rf data/graph-cache.old data/region.old.osm.pbf
  log "Fertig, Server läuft"
elif [ -d data/graph-cache.old ]; then
  log "Neuer Graph liefert keine Route: zurück zum alten"
  systemctl stop cumo-routing || true
  rm -rf data/graph-cache data/region.osm.pbf
  mv data/graph-cache.old data/graph-cache
  mv data/region.old.osm.pbf data/region.osm.pbf
  chown -R cumo:cumo "$BASE"
  systemctl start cumo-routing
  exit 1
else
  log "Neuer Graph liefert keine Route und es gibt keinen alten"
  exit 1
fi
# POI Kacheln für "Stopps an der Strecke" aus denselben Kartendaten. Ein Fehler hier stoppt das Routing nicht,
# die App nutzt dann weiter den alten Stand.
if [ -x "$BASE/poi-tiles.sh" ]; then
  "$BASE/poi-tiles.sh" || log "POI Kacheln fehlgeschlagen, alter Stand bleibt"
fi
