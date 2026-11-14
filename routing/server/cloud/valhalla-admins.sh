#!/bin/bash
# Ländergrenzen für den eigenen Valhalla (Koray 14.11.).
#
# Valhalla schreibt beim Bau in jede Kante das Land und die Fahrseite. Die Grenzen nimmt es aus der Karte.
# Unsere Karte besteht aus Ausschnitten (Elsass, Rhône Alpes, Norditalien ...), darin sind die Grenzen von
# Frankreich und Italien unvollständig und fehlten in admins.sqlite. Ohne Land nahm Valhalla dort Linksverkehr
# an und zählte an Kreisverkehren die Ausfahrten falsch ("2. Ausfahrt" statt der 1.).
#
# Darum kommen die Grenzen aus den vollständigen Länderdateien von Geofabrik (nur die Grenzrelationen werden
# herausgefiltert) plus den vollständigen Ländern aus unserer Karte. Grenzen ändern sich selten: neu gebaut wird,
# wenn die Datei älter als 28 Tage ist, fehlt oder ein Land fehlt (oder mit --force).
# Danach prüft das Skript, dass alle Länder drin sind, und tauscht die Datei erst dann aus.
set -euo pipefail
IMAGE=ghcr.io/valhalla/valhalla-scripted:latest
CF=/opt/valhalla/custom_files
SRC=/opt/valhalla/admin-src
DB=$CF/admins.sqlite
NEED="AT CH DE FR IT SI"
log() { echo "$(date -Is) Valhalla Grenzen: $*" >> /opt/valhalla/setup.log; }

countries() {
  python3 - "$1" <<'PY'
import sqlite3, sys
try:
    c = sqlite3.connect(sys.argv[1])
    print(" ".join(sorted(r[0] for r in c.execute("select iso_code from admins where admin_level=2 and iso_code is not null"))))
except Exception:
    print("")
PY
}
complete() { local have; have=" $(countries "$1") "; for c in $NEED; do [[ "$have" == *" $c "* ]] || return 1; done; }

if [ "${1:-}" != "--force" ] && [ -f "$DB" ] && complete "$DB" && [ -z "$(find "$DB" -mtime +28)" ]; then
  log "aktuell ($(countries "$DB"))"; exit 0
fi

mkdir -p "$SRC"; cd "$SRC"
log "Neubau gestartet"
for land in france italy; do
  for i in 1 2 3; do
    curl -sfL -o "$land.new.osm.pbf" "https://download.geofabrik.de/europe/$land-latest.osm.pbf" && break
    sleep 120
  done
  mv "$land.new.osm.pbf" "$land.osm.pbf"
done
# nur Grenzrelationen samt ihrer Wege und Punkte
for f in france italy; do
  osmium tags-filter --overwrite -o "b-$f.osm.pbf" "$f.osm.pbf" r/boundary=administrative
done
osmium tags-filter --overwrite -o b-region.osm.pbf /opt/cumo-routing/data/region.osm.pbf r/boundary=administrative
osmium merge --overwrite -o boundaries.osm.pbf b-region.osm.pbf b-france.osm.pbf b-italy.osm.pbf
rm -f b-*.osm.pbf france.osm.pbf italy.osm.pbf

# eigene Konfiguration, die in eine neue Datei schreibt
docker run --rm --entrypoint valhalla_build_config "$IMAGE" --mjolnir-admin /admin-src/admins.new.sqlite > valhalla.admins.json
rm -f admins.new.sqlite
docker run --rm -v "$SRC":/admin-src --entrypoint valhalla_build_admins "$IMAGE" \
  --config /admin-src/valhalla.admins.json /admin-src/boundaries.osm.pbf > admins-build.log 2>&1

if ! complete admins.new.sqlite; then
  log "FEHLER: Länder unvollständig ($(countries admins.new.sqlite)), alte Datei bleibt"; exit 1
fi
[ -f "$DB" ] && cp -p "$DB" "$DB.alt"
mv admins.new.sqlite "$DB"
log "fertig ($(countries "$DB"))"
