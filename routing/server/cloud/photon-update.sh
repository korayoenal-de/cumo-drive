#!/bin/bash
# CUMO DRIVE Ortssuche (Photon Europa) aktuell halten (Koray 12.11.).
# Lädt den fertigen Wochenstand, wenn er neuer ist als der eigene, tauscht ihn ein und prüft ihn.
# Liefert der neue Stand keine Treffer, kommt der alte zurück. Die App fragt solange den anderen
# Server oder den öffentlichen Dienst. Aufruf über cumo-photon-update.timer.
set -euo pipefail
DIR=/opt/photon
URL=https://download1.graphhopper.com/public/europe/photon-db-europe-1.0-latest.tar.bz2
LOG=/opt/cumo-routing/setup.log
log() { echo "$(date -Is) Ortssuche: $*" >> "$LOG"; }
ok() { curl -fsS -m 10 'http://127.0.0.1:2322/api?q=Berlin&limit=1' 2>/dev/null | grep -q '"Berlin"'; }
wait_ok() { for _ in $(seq 1 30); do ok && return 0; sleep 5; done; return 1; }
cd "$DIR"

NEW=$(curl -fsSI -m 30 "$URL" | tr -d '\r' | awk -F': ' 'tolower($1)=="last-modified"{print $2}')
[ -n "$NEW" ] || { log "Stand nicht abrufbar, übersprungen"; exit 0; }
[ "$NEW" = "$(cat stand.txt 2>/dev/null || true)" ] && [ "${FORCE:-0}" != 1 ] && exit 0
FREE=$(df --output=avail -BG "$DIR" | tail -1 | tr -dc 0-9)
[ "$FREE" -ge 110 ] || { log "zu wenig Platz ($FREE GB frei), übersprungen"; exit 0; }

log "neuer Stand vom $NEW, lade"
curl -fL --retry 5 -sS -o db.tar.bz2.part "$URL"
rm -rf photon_data.new && mkdir photon_data.new
( lbzip2 -dc db.tar.bz2.part 2>/dev/null || bzip2 -dc db.tar.bz2.part ) | tar -x --strip-components=1 -C photon_data.new
rm -f db.tar.bz2.part
[ -d photon_data.new/node_1 ] || { log "Archiv unvollständig, alter Stand bleibt"; rm -rf photon_data.new; exit 1; }
chown -R photon:photon photon_data.new

systemctl stop cumo-photon
rm -rf photon_data.old
[ -d photon_data ] && mv photon_data photon_data.old
mv photon_data.new photon_data
systemctl start cumo-photon
if wait_ok; then
  echo "$NEW" > stand.txt
  rm -rf photon_data.old
  log "Stand vom $NEW läuft"
else
  systemctl stop cumo-photon
  rm -rf photon_data
  [ -d photon_data.old ] && mv photon_data.old photon_data
  systemctl start cumo-photon
  log "neuer Stand liefert keine Treffer, alter Stand läuft wieder"
  exit 1
fi
