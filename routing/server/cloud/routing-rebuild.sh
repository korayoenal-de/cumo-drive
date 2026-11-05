#!/bin/bash
# CUMO DRIVE: Routing Profil aktualisieren und Graph neu bauen, erzeugt aus build_cloud_init.py.
set -euo pipefail
mkdir -p /opt/cumo-routing
cat > /opt/cumo-routing/config.yml <<'CUMO_EOF'
# CUMO DRIVE Routing Server (GraphHopper) auf dem Linux Server, erzeugt aus routing/server/config.yml.
graphhopper:
  datareader.file: data/region.osm.pbf
  graph.location: data/graph-cache

  # Merkmale, die das Sportwagen Profil braucht
  graph.encoded_values: car_access, car_average_speed, road_class, road_environment, road_access, surface, track_type, max_width, curvature, toll, urban_density

  # Wege, die für Autos nie in Frage kommen, gar nicht erst einlesen
  import.osm.ignored_highways: footway,cycleway,path,pedestrian,steps,bridleway,construction,proposed,platform,corridor,via_ferrata

  custom_models.directory: custom_models

  profiles:
    - name: sportwagen
      custom_model_files: [sportwagen.json]
    - name: auto
      custom_model_files: [car.json]

  # Landmarken beschleunigen flexible Anfragen (Rundtouren, Änderungen zur Laufzeit)
  profiles_lm:
    - profile: sportwagen
    - profile: auto
  profiles_ch: []

  prepare.min_network_size: 200
  prepare.lm.landmarks: 16
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
chmod 0644 /opt/cumo-routing/config.yml
mkdir -p /opt/cumo-routing/custom_models
cat > /opt/cumo-routing/custom_models/sportwagen.json <<'CUMO_EOF'
{
  "distance_influence": 5,
  "priority": [
    {
      "if": "!car_access",
      "multiply_by": "0"
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
chmod 0644 /opt/cumo-routing/custom_models/sportwagen.json
mkdir -p /opt/cumo-routing
cat > /opt/cumo-routing/setup-server.sh <<'CUMO_EOF'
#!/bin/bash
# CUMO DRIVE Routing Server auf einem Linux Server (Ubuntu 24.04) einrichten oder aktualisieren.
# Läuft beim ersten Start über cloud init und danach wöchentlich (cumo-routing-update.timer).
# Lädt die Kartendaten, fügt sie zusammen, baut den Graphen und startet GraphHopper neu.
set -euo pipefail
BASE=/opt/cumo-routing
GH_VERSION=11.0
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
# Unter 40 GB RAM passen Import und laufender Server nicht gleichzeitig in den Speicher.
# Der Server pausiert dann während des Imports (sonntags nachts), die App nutzt solange Valhalla.
MEM_GB=$(free -g | awk '/^Mem:/{print $2}')
if [ "$MEM_GB" -lt 40 ]; then systemctl stop cumo-routing || true; fi
sudo -u cumo java -Xmx$HEAP -jar "bin/graphhopper-web-$GH_VERSION.jar" import config.import.yml >> "$BASE/import.log" 2>&1
rm -rf data/graph-cache data/region.osm.pbf
mv data/graph-cache.new data/graph-cache
mv data/region.new.osm.pbf data/region.osm.pbf
chown -R cumo:cumo "$BASE"
systemctl start cumo-routing
log "Fertig, Server läuft"
# POI Kacheln für "Stopps an der Strecke" aus denselben Kartendaten. Ein Fehler hier stoppt das Routing nicht,
# die App nutzt dann weiter den alten Stand oder Overpass.
if [ -x "$BASE/poi-tiles.sh" ]; then
  "$BASE/poi-tiles.sh" || log "POI Kacheln fehlgeschlagen, alter Stand bleibt"
fi

CUMO_EOF
chmod 0755 /opt/cumo-routing/setup-server.sh
chown -R cumo:cumo /opt/cumo-routing/config.yml /opt/cumo-routing/custom_models
nohup /opt/cumo-routing/setup-server.sh > /opt/cumo-routing/rebuild.log 2>&1 &
echo 'Neuaufbau läuft im Hintergrund (etwa zwei Stunden). Der Server bleibt dabei erreichbar, Fortschritt: tail -f /opt/cumo-routing/rebuild.log'
