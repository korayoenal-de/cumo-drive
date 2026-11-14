#!/bin/bash
# Wöchentlicher Neubau des eigenen Valhalla aus der frischen Karte (Koray 13.11.), Server 2 dienstags 3:00,
# einen Tag nach dem Neuaufbau von GraphHopper. So passen Abbiegehinweise und Routing zur selben Karte.
# Während des Neubaus (einige Stunden, nachts) fragt die App den öffentlichen Valhalla als Notfall.
#
# 14.11.: Das alte Bild (nilsnolde, Valhalla 3.5.1) zählte an manchen Kreisverkehren eine Ausfahrt zu viel
# (Elsass: "2. Ausfahrt" statt der 1.). Der öffentliche Server läuft mit 3.9.1, darum jetzt das offizielle Bild
# valhalla-scripted in derselben Version und dieselben Standardeinstellungen wie dort (Zufahrten wieder an).
# Gebaut wird in einem eigenen Lauf; danach startet ein zweiter Behälter, der nur noch ausliefert. Sonst baute
# jeder Neustart des Servers alles neu (force_rebuild).
set -euo pipefail
IMAGE=ghcr.io/valhalla/valhalla-scripted:latest
log() { echo "$(date -Is) Valhalla: $*" >> /opt/valhalla/setup.log; }
if systemctl is-active --quiet cumo-routing-update.service; then log "GraphHopper baut gerade, Valhalla später"; exit 1; fi
rm -f /opt/valhalla/ready
ln -f /opt/cumo-routing/data/region.osm.pbf /opt/valhalla/custom_files/region.osm.pbf
for i in 1 2 3 4; do docker pull -q "$IMAGE" >/dev/null && break; sleep 30; done
docker rm -f valhalla >/dev/null 2>&1 || true
# Einstellungen frisch aus dem neuen Bild (die alte Datei kam aus 3.5.1)
[ -f /opt/valhalla/custom_files/valhalla.json ] && mv /opt/valhalla/custom_files/valhalla.json /opt/valhalla/custom_files/valhalla.json.alt
log "Neubau gestartet ($(docker run --rm --entrypoint valhalla_service "$IMAGE" --version 2>&1 | head -1))"
docker run -d --name valhalla \
  -p 127.0.0.1:8002:8002 \
  -v /opt/valhalla/custom_files:/custom_files \
  -e use_tiles_ignore_pbf=False -e force_rebuild=True -e build_elevation=True -e build_admins=True -e build_time_zones=True \
  -e build_tar=True -e serve_tiles=True -e server_threads=6 \
  "$IMAGE" >/dev/null
for i in $(seq 1 720); do
  if curl -sf -m 5 http://127.0.0.1:8002/status >/dev/null; then
    # Bau fertig: auf einen Behälter wechseln, der nur ausliefert und Neustarts übersteht
    docker rm -f valhalla >/dev/null 2>&1 || true
    docker run -d --name valhalla --restart unless-stopped \
      -p 127.0.0.1:8002:8002 \
      -v /opt/valhalla/custom_files:/custom_files \
      -e use_tiles_ignore_pbf=True -e force_rebuild=False -e build_elevation=False -e build_admins=False -e build_time_zones=False \
      -e build_tar=False -e serve_tiles=True -e server_threads=6 \
      "$IMAGE" >/dev/null
    for j in $(seq 1 60); do curl -sf -m 5 http://127.0.0.1:8002/status >/dev/null && break; sleep 5; done
    touch /opt/valhalla/ready; log "fertig"; exit 0
  fi
  sleep 60
done
log "nach 12 Stunden nicht fertig"
exit 1
