#!/bin/bash
# Wöchentlicher Neubau des eigenen Valhalla aus der frischen Karte (Koray 13.11.), Server 2 dienstags 3:00,
# einen Tag nach dem Neuaufbau von GraphHopper. So passen Abbiegehinweise und Routing zur selben Karte.
# Während des Neubaus (einige Stunden, nachts) fragt die App den öffentlichen Valhalla als Notfall.
set -euo pipefail
log() { echo "$(date -Is) Valhalla: $*" >> /opt/valhalla/setup.log; }
if systemctl is-active --quiet cumo-routing-update.service; then log "GraphHopper baut gerade, Valhalla später"; exit 1; fi
rm -f /opt/valhalla/ready
ln -f /opt/cumo-routing/data/region.osm.pbf /opt/valhalla/custom_files/region.osm.pbf
for i in 1 2 3 4; do docker pull -q ghcr.io/nilsnolde/docker-valhalla/valhalla:latest >/dev/null && break; sleep 30; done
docker rm -f valhalla >/dev/null 2>&1 || true
# Grundstückszufahrten nicht einlesen (Koray 14.11.): sonst zählt Valhalla sie an Kreisverkehren als Ausfahrt
# und sagt "2. Ausfahrt", wo es die erste ist (Elsass, gegen GraphHopper und den öffentlichen Valhalla geprüft)
python3 -c 'import json; p="/opt/valhalla/custom_files/valhalla.json"; c=json.load(open(p)); c["mjolnir"]["include_driveways"]=False; json.dump(c, open(p,"w"), indent=2)'
log "Neubau gestartet"
docker run -d --name valhalla --restart unless-stopped \
  -p 127.0.0.1:8002:8002 \
  -v /opt/valhalla/custom_files:/custom_files \
  -e use_tiles_ignore_pbf=False -e force_rebuild=True -e build_elevation=True -e build_admins=True -e build_time_zones=True \
  -e build_tar=True -e serve_tiles=True -e server_threads=6 \
  ghcr.io/nilsnolde/docker-valhalla/valhalla:latest >/dev/null
for i in $(seq 1 720); do
  if curl -sf -m 5 http://127.0.0.1:8002/status >/dev/null; then touch /opt/valhalla/ready; log "fertig"; exit 0; fi
  sleep 60
done
log "nach 12 Stunden nicht fertig"
exit 1
