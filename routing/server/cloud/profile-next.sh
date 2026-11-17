#!/bin/bash
# CUMO DRIVE: neue Profile für den nächsten Neuaufbau bereitlegen, erzeugt aus build_cloud_init.py.
# Aufruf vom Mac: ssh root@IP 'bash -s' < profile-next.sh   (ändert nichts am laufenden Server)
set -euo pipefail
cd /opt/cumo-routing
rm -rf custom_models.next && mkdir -p custom_models.next
cat > config.next.yml <<'CUMO_EOF'
# CUMO DRIVE Routing Server (GraphHopper) auf dem Linux Server, erzeugt aus routing/server/config.yml.
graphhopper:
  datareader.file: data/region.osm.pbf
  graph.location: data/graph-cache

  # Merkmale, die das Sportwagen Profil braucht
  graph.encoded_values: car_access, car_average_speed, road_class, road_environment, road_access, surface, track_type, max_width, curvature, toll, urban_density
  # Ohne Thread Zahl bricht der Import bei der Berechnung der Ortsdichte ab (ForkJoinPool mit 0 Threads)
  graph.urban_density.threads: 4

  # Wege, die für Autos nie in Frage kommen, gar nicht erst einlesen
  import.osm.ignored_highways: footway,cycleway,path,pedestrian,steps,bridleway,construction,proposed,platform,corridor,via_ferrata

  custom_models.directory: custom_models

  profiles:
    - name: sportwagen
      custom_model_files: [sportwagen.json]
    - name: auto
      custom_model_files: [car.json]
    # Fest eingebaute Profile für Kurvig und Sehr kurvig (6.11.): Breite und Kurven Regeln liegen im Server,
    # die Landmarken sind dafür vorberechnet. Als Zusatz pro Anfrage dauerte eine Route mit 700 km 16 statt 2 Sekunden.
    - name: kurvig
      custom_model_files: [sportwagen.json, kurvig.json]
    # Schnell (17.11., Sicherheitskonzept Maßnahme 3): Breite und langsamere Kurven liegen im Server statt in der App.
    # auto bleibt ohne Landmarken für ältere App Stände.
    - name: schnell
      custom_model_files: [car.json, schnell.json]
    # Sehr kurvig gibt es seit 8.11. nicht mehr in der App; das Profil ist seit 12.11. aus dem Server (spart rund eine Stunde je Neuaufbau)

  # Landmarken beschleunigen flexible Anfragen (Rundtouren, Änderungen zur Laufzeit)
  profiles_lm:
    - profile: sportwagen
    - profile: schnell
    - profile: kurvig
  profiles_ch: []

  prepare.min_network_size: 200
  prepare.lm.landmarks: 16
  # Landmarken je Profil parallel rechnen; mit einem Thread dauerte der Neuaufbau am 7.11. über zwei Stunden
  prepare.lm.threads: 4
  routing.non_ch.max_waypoint_distance: 1000000
  routing.max_visited_nodes: 3000000
  graph.dataaccess.default_type: RAM_STORE

server:
  application_connectors:
    - type: http
      port: 8989
      # nur lokal, nach außen geht es über Caddy mit HTTPS
      bind_host: 127.0.0.1
  request_log:
    appenders: []
  admin_connectors:
    - type: http
      port: 8990
      bind_host: localhost
CUMO_EOF
cat > custom_models.next/kurvig.json <<'CUMO_EOF'
{
  "distance_influence": 5,
  "priority": [
    { "if": "max_width < 1.9", "multiply_by": "0" },
    { "else_if": "max_width < 3", "multiply_by": "0.1" },
    { "else_if": "max_width >= 3 && max_width < 4.5", "multiply_by": "0.85" },
    { "if": "road_class == PRIMARY && urban_density == RURAL", "multiply_by": "0.35" },
    { "if": "road_class == SECONDARY && urban_density == RURAL", "multiply_by": "0.7" },
    { "if": "road_class == RESIDENTIAL", "multiply_by": "0.5" },
    { "if": "curvature > 0.95", "multiply_by": "0.3" },
    { "else_if": "curvature > 0.85", "multiply_by": "0.6" }
  ]
}
CUMO_EOF
cat > custom_models.next/schnell.json <<'CUMO_EOF'
{
  "priority": [
    { "if": "max_width < 1.9", "multiply_by": "0" },
    { "else_if": "max_width >= 2.5 && max_width < 3", "multiply_by": "0.1" },
    { "else_if": "max_width >= 3 && max_width < 4.5", "multiply_by": "0.6" }
  ],
  "speed": [
    { "if": "curvature < 0.9", "multiply_by": "0.75" },
    { "if": "curvature < 0.7", "multiply_by": "0.7" }
  ]
}
CUMO_EOF
cat > custom_models.next/sehr_kurvig.json <<'CUMO_EOF'
{
  "distance_influence": 5,
  "priority": [
    { "if": "max_width < 1.9", "multiply_by": "0" },
    { "else_if": "max_width >= 2.5 && max_width < 3", "multiply_by": "0.1" },
    { "else_if": "max_width >= 3 && max_width < 4.5", "multiply_by": "0.6" },
    { "if": "road_class == PRIMARY", "multiply_by": "0.2" },
    { "if": "road_class == SECONDARY", "multiply_by": "0.55" },
    { "if": "road_class == RESIDENTIAL", "multiply_by": "0.4" },
    { "if": "curvature > 0.95", "multiply_by": "0.15" },
    { "else_if": "curvature > 0.85", "multiply_by": "0.4" },
    { "else_if": "curvature > 0.75", "multiply_by": "0.8" }
  ]
}
CUMO_EOF
cat > custom_models.next/sportwagen.json <<'CUMO_EOF'
{
  "distance_influence": 5,
  "priority": [
    {
      "if": "!car_access",
      "multiply_by": "0"
    },
    {
      "if": "road_access == DESTINATION || road_access == CUSTOMERS",
      "multiply_by": "0.1"
    },
    {
      "if": "road_class == TRACK || road_class == LIVING_STREET || road_class == PEDESTRIAN",
      "multiply_by": "0"
    },
    {
      "if": "road_class == SERVICE",
      "multiply_by": "0.1"
    },
    {
      "if": "track_type != MISSING && track_type != GRADE1",
      "multiply_by": "0"
    },
    {
      "if": "surface == UNPAVED || surface == COMPACTED || surface == FINE_GRAVEL || surface == GRAVEL || surface == GROUND || surface == DIRT || surface == GRASS || surface == SAND",
      "multiply_by": "0"
    },
    {
      "if": "surface == COBBLESTONE || surface == PAVING_STONES",
      "multiply_by": "0.3"
    },
    {
      "if": "max_width < 1.9",
      "multiply_by": "0"
    },
    {
      "if": "road_class == MOTORWAY || road_class == TRUNK",
      "multiply_by": "0.15"
    },
    {
      "if": "road_environment == FERRY",
      "multiply_by": "0.3"
    },
    {
      "if": "urban_density == CITY",
      "multiply_by": "0.2"
    },
    {
      "else_if": "urban_density == RESIDENTIAL",
      "multiply_by": "0.5"
    },
    {
      "if": "curvature > 0.97",
      "multiply_by": "0.45"
    },
    {
      "else_if": "curvature > 0.9",
      "multiply_by": "0.7"
    },
    {
      "else_if": "curvature > 0.8",
      "multiply_by": "0.9"
    }
  ],
  "speed": [
    {
      "if": "true",
      "limit_to": "car_average_speed"
    },
    {
      "if": "road_class == RESIDENTIAL || road_class == UNCLASSIFIED",
      "limit_to": "40"
    }
  ]
}
CUMO_EOF
cp setup-server.sh setup-server.sh.bak 2>/dev/null || true
cat > setup-server.sh.new <<'CUMO_EOF'
#!/bin/bash
# CUMO DRIVE Routing Server auf einem Linux Server (Ubuntu 24.04) einrichten oder aktualisieren.
# Läuft beim ersten Start über cloud init und danach wöchentlich (cumo-routing-update.timer).
# Lädt die Kartendaten, fügt sie zusammen, baut den Graphen und startet GraphHopper neu.
set -euo pipefail
exec 9>/run/cumo-setup.lock
flock -w 300 9 || { echo "$(date -Is) Neuaufbau läuft schon, Abbruch" >> /opt/cumo-routing/setup.log; exit 0; }
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
osmium merge "${files[@]}" -o data/region.merged.osm.pbf --overwrite
# Die Teile haben oft verschiedene Stände (15.11.: DACH vom 13., Frankreich vom 14.), dann stecken Grenzpunkte in
# zwei Versionen in der Datei und GraphHopper bricht ab. time-filter behält von jedem Objekt nur die neueste Version.
osmium time-filter data/region.merged.osm.pbf -o data/region.new.osm.pbf --overwrite
rm -f data/region.merged.osm.pbf
log "Graph bauen (dauert mehrere Stunden, vor allem die Landmarken)"
rm -rf data/graph-cache.new
# Neue Profilliste (config.next.yml, 17.11.) gilt wie neue Profile erst mit dem neuen Graphen
CONFIG_NEXT=0
CONFIG_SRC=config.yml
if [ -f config.next.yml ]; then CONFIG_NEXT=1; CONFIG_SRC=config.next.yml; log "Neue Profilliste aus config.next.yml"; fi
sed 's#data/graph-cache#data/graph-cache.new#; s#data/region.osm.pbf#data/region.new.osm.pbf#' "$CONFIG_SRC" > config.import.yml
# Neue Profile (custom_models.next) gelten erst mit dem neuen Graphen: der laufende Graph passt nur zu den alten
# Dateien, sonst startet er nicht (15.11.: "Profiles do not match" nach einem gescheiterten Import)
MODELS_NEXT=0
if [ -d custom_models.next ]; then
  MODELS_NEXT=1
  sed -i 's#custom_models.directory: custom_models#custom_models.directory: custom_models.next#' config.import.yml
  log "Neue Profile aus custom_models.next"
fi
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
if [ "$MODELS_NEXT" = 1 ]; then
  rm -rf custom_models.old
  cp -a custom_models custom_models.old
  cp -a custom_models.next/. custom_models/
fi
if [ "$CONFIG_NEXT" = 1 ]; then cp config.yml config.old.yml; cp config.next.yml config.yml; fi
chown -R cumo:cumo "$BASE"
systemctl start cumo-routing
OK=0
for i in $(seq 1 60); do
  sleep 15
  if health http://localhost:8989 && route_ok; then OK=1; break; fi
done
if [ "$OK" = 1 ]; then
  rm -rf data/graph-cache.old data/region.old.osm.pbf
  [ "$MODELS_NEXT" = 1 ] && rm -rf custom_models.next custom_models.old && log "Neue Profile aktiv"
  [ "$CONFIG_NEXT" = 1 ] && rm -f config.next.yml config.old.yml && log "Neue Profilliste aktiv"
  log "Fertig, Server läuft"
elif [ -d data/graph-cache.old ]; then
  log "Neuer Graph liefert keine Route: zurück zum alten"
  systemctl stop cumo-routing || true
  rm -rf data/graph-cache data/region.osm.pbf
  mv data/graph-cache.old data/graph-cache
  mv data/region.old.osm.pbf data/region.osm.pbf
  if [ "$MODELS_NEXT" = 1 ] && [ -d custom_models.old ]; then rm -rf custom_models; mv custom_models.old custom_models; fi
  if [ "$CONFIG_NEXT" = 1 ] && [ -f config.old.yml ]; then mv config.old.yml config.yml; fi
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
CUMO_EOF
chmod 0755 setup-server.sh.new && mv setup-server.sh.new setup-server.sh
chown -R cumo:cumo config.next.yml custom_models.next
echo "Bereit für den nächsten Neuaufbau: $(grep -c '^    - name:' config.next.yml) Profile, $(ls custom_models.next | wc -l) Modelle"
