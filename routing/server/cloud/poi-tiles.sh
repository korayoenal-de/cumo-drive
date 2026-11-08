#!/bin/bash
# POI Kacheln für "Stopps an der Strecke" aus data/region.osm.pbf bauen (Tankstellen, Aussichtspunkte,
# Restaurants, Cafés). Läuft als root nach jedem Graph Import (setup-server.sh) und lässt sich auch allein
# starten: /opt/cumo-routing/poi-tiles.sh
# Ergebnis: /opt/cumo-routing/poi/v1/{kind}/{x}_{y}.json und meta.json, Caddy liefert sie unter /poi/ aus.
# Neue Kacheln entstehen in poi-builds/, danach zeigt der Link poi/v1 in einem Schritt auf den neuen Stand.
set -euo pipefail
BASE=${CUMO_BASE:-/opt/cumo-routing}
SRC=${1:-$BASE/data/region.osm.pbf}
HERE=$(cd "$(dirname "$0")" && pwd)
PY=$HERE/poi_tiles.py
[ -f "$PY" ] || PY=$BASE/poi_tiles.py
WORK=$BASE/poi-work
BUILDS=$BASE/poi-builds
STAMP=$(date +%Y%m%d%H%M%S)
NEW=$BUILDS/v1-$STAMP
log() { echo "$(date -Is) POI: $*" | tee -a "$BASE/setup.log"; }
umask 022
if [ ! -f "$SRC" ]; then log "Kartendaten fehlen: $SRC"; exit 1; fi
mkdir -p "$WORK" "$BUILDS" "$BASE/poi"
START=$(date +%s)
log "Filtern aus $(du -h "$SRC" | cut -f1) Kartendaten (dauert einige Minuten)"
osmium tags-filter --overwrite --progress -o "$WORK/poi.osm.pbf" "$SRC" \
  nwr/amenity=fuel,parking,restaurant,cafe nwr/tourism=viewpoint,hotel,guest_house,motel,chalet
log "Auszug $(du -h "$WORK/poi.osm.pbf" | cut -f1), Export als GeoJSON"
osmium export --overwrite --progress -f geojsonseq --add-unique-id=type_id \
  --geometry-types=point,linestring,polygon -o "$WORK/poi.geojsonseq" "$WORK/poi.osm.pbf"
log "Kacheln schreiben"
rm -rf "$NEW"
python3 "$PY" "$WORK/poi.geojsonseq" "$NEW"
echo '[]' > "$BASE/poi/empty.json"
# Link poi/v1 in einem Schritt umhängen, ein alter echter Ordner an dieser Stelle wird ersetzt
if [ -d "$BASE/poi/v1" ] && [ ! -L "$BASE/poi/v1" ]; then rm -rf "$BASE/poi/v1"; fi
ln -sfn "$NEW" "$BASE/poi/v1.tmp"
mv -T "$BASE/poi/v1.tmp" "$BASE/poi/v1"
# ältere Stände und Zwischendateien aufräumen
for d in "$BUILDS"/v1-*; do [ "$d" = "$NEW" ] || rm -rf "$d"; done
rm -rf "$WORK"
chmod -R a+rX "$BASE/poi" "$BUILDS"
log "Fertig in $(( $(date +%s) - START )) s, $(du -sh "$NEW" | cut -f1) Kacheln, $(cat "$NEW/meta.json")"
