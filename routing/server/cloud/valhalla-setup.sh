#!/bin/bash
# Eigener Valhalla Server (Koray 12.11.): statt des öffentlichen FOSSGIS Servers, der höchstens eine Anfrage
# je Sekunde und keine starke Nutzung erlaubt. Läuft auf Server 2 neben GraphHopper, Kacheln aus denselben
# Kartendaten. Docker Image von nilsnolde (Valhalla, MIT Lizenz).
# Erst starten, wenn kein Neuaufbau von GraphHopper läuft: systemctl is-active cumo-routing-update.service
set -euo pipefail
log() { echo "$(date -Is) $*"; }
if systemctl is-active --quiet cumo-routing-update.service; then log "Neuaufbau läuft noch, später starten"; exit 1; fi
log "Docker installieren"
command -v docker >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker.io >/dev/null
systemctl enable --now docker >/dev/null
mkdir -p /opt/valhalla/custom_files
# Kartendaten als harter Link (gleiche Platte, kein zweites Mal 11 GB)
ln -f /opt/cumo-routing/data/region.osm.pbf /opt/valhalla/custom_files/region.osm.pbf
docker rm -f valhalla >/dev/null 2>&1 || true
log "Kacheln bauen und Dienst starten (dauert einige Stunden)"
docker run -d --name valhalla --restart unless-stopped \
  -p 127.0.0.1:8002:8002 \
  -v /opt/valhalla/custom_files:/custom_files \
  -e use_tiles_ignore_pbf=True -e build_elevation=False -e build_admins=True -e build_time_zones=True \
  -e build_tar=True -e serve_tiles=True -e server_threads=6 -e force_rebuild=False \
  ghcr.io/nilsnolde/docker-valhalla/valhalla:latest
for i in $(seq 1 600); do
  if curl -sf -m 5 http://127.0.0.1:8002/status >/dev/null; then log "Valhalla läuft"; break; fi
  sleep 60
done
# Webserver: /valhalla auf den lokalen Dienst
if ! grep -q "handle_path /valhalla" /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.vor-valhalla
  python3 - <<'PY'
p="/etc/caddy/Caddyfile"; s=open(p).read()
blk="\thandle_path /valhalla/* {\n\t\treverse_proxy 127.0.0.1:8002\n\t}\n"
i=s.index("\thandle {\n\t\treverse_proxy 127.0.0.1:8989")
open(p,"w").write(s[:i]+blk+s[i:])
PY
  if caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then systemctl reload caddy; log "Webserver ergänzt"; else cp /etc/caddy/Caddyfile.vor-valhalla /etc/caddy/Caddyfile; log "Webserver NICHT geändert"; fi
fi
log "FERTIG"; df -h / | tail -1; du -sh /opt/valhalla
