#!/bin/bash
# CUMO DRIVE Überwachung, jede Minute (Koray 13.11.: Monitoring für mögliche Incidents).
# Meldet Zustandswechsel in setup.log und, wenn /etc/cumo-notify eine Adresse enthält (ntfy), aufs Handy:
# Ausfall nach drei Minuten, Erholung, gescheiterte Neuaufbauten, volle Platte, knapper Speicher.
# Auf dem Server mit /etc/cumo-primary zusätzlich: Datenbank (Supabase) und eine Tagesmeldung um 8 Uhr,
# damit man weiß, dass die Überwachung selbst noch lebt.
PEER=$(cat /etc/cumo-peer 2>/dev/null)
NOTIFY=$(cat /etc/cumo-notify 2>/dev/null || true)
HOST=$(hostname)
STATE=/run/cumo-monitor
mkdir -p "$STATE"
say() { # text [priorität: default, high]
  echo "$(date -Is) Überwachung: $1" >> /opt/cumo-routing/setup.log
  [ -n "$NOTIFY" ] && curl -fs -m 10 -H "Title: CUMO DRIVE" -H "Priority: ${2:-default}" -H "Tags: ${3:-warning}" -d "$1" "$NOTIFY" >/dev/null 2>&1
  true
}
slug() { echo "$1" | tr -c 'A-Za-z0-9' '_'; }
check() { # name url [minuten]
  local f="$STATE/$(slug "$1")" n limit=${3:-3}
  if curl -fs -m 15 "$2" >/dev/null; then
    [ "$(cat "$f" 2>/dev/null || echo 0)" -ge "$limit" ] && say "$1 antwortet wieder" default white_check_mark
    echo 0 > "$f"
  else
    n=$(( $(cat "$f" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$f"
    [ "$n" -eq "$limit" ] && say "$1 antwortet seit $limit Minuten nicht ($2)" high rotating_light
  fi
}
once_a_day() { # schlüssel text
  local f="$STATE/day_$(slug "$1")"
  [ "$(cat "$f" 2>/dev/null)" = "$(date +%F)" ] && return
  date +%F > "$f"; say "$2" high warning
}

# eigener Dienst (während des eigenen Neuaufbaus absichtlich aus)
exec 9>/run/cumo-setup.lock
if flock -n 9; then check "Routing $HOST" http://localhost:8989/health; fi
exec 9>&-
# Partner
if [ -n "$PEER" ]; then
  check "Routing Partner" "$PEER/health" 5
  check "Stopps Partner" "$PEER/poi/v1/meta.json" 5
fi
systemctl is-enabled --quiet cumo-photon 2>/dev/null && check "Ortssuche $HOST" "http://localhost:2322/api?q=berlin&limit=1"
# Valhalla erst überwachen, wenn er einmal fertig gebaut ist (Marke ready, fehlt während des Neubaus)
[ -f /opt/valhalla/ready ] && check "Valhalla $HOST" http://127.0.0.1:8002/status

# echte Route alle 10 Minuten (Gesundheit allein sagt nicht, dass geplant werden kann)
if [ "$(( $(date +%M) % 10 ))" -eq 0 ] && flock -n /run/cumo-setup.lock true; then
  check "Planung $HOST" "http://localhost:8989/route?profile=kurvig&point=47.2692,11.4041&point=47.0,11.5&points_encoded=false" 1
fi

# gescheiterte Abläufe (Neuaufbau, Ortssuche, Sicherung, Valhalla)
for u in cumo-routing-update cumo-photon-update cumo-backup cumo-valhalla-update; do
  systemctl is-failed --quiet "$u.service" 2>/dev/null && once_a_day "fail_$u" "$u auf $HOST ist fehlgeschlagen, Details: journalctl -u $u"
done

# Platte ab 85 Prozent, freier Speicher unter 2 GB
use=$(df --output=pcent / | tail -1 | tr -dc 0-9)
[ "$use" -ge 85 ] && once_a_day disk "Platte auf $HOST zu $use Prozent voll"
avail=$(free -m | awk '/^Mem:/ {print $7}')
[ "$avail" -lt 2048 ] && once_a_day ram "Arbeitsspeicher auf $HOST knapp: $avail MB frei"

# Aktualität (Koray 14.11.: immer die neuesten Daten, und das sichergestellt). Einmal am Tag um 7 Uhr:
# Kartenstand, Alter der Routing Daten, Valhalla, Ortssuche, Stopps, laufende Zeitpläne, neue Programmversionen.
if [ "$(date +%H)" = "07" ] && [ "$(cat "$STATE/fresh" 2>/dev/null)" != "$(date +%F)" ]; then
  date +%F > "$STATE/fresh"
  now=$(date +%s)
  age_days() { [ -e "$1" ] && echo $(( (now - $(stat -c %Y "$1")) / 86400 )) || echo -1; }
  # Stand der OSM Karte (Zeitstempel im Kopf der Datei, sonst Dateidatum)
  pbf=/opt/cumo-routing/data/region.osm.pbf
  if [ -f "$pbf" ]; then
    ts=$(osmium fileinfo -g header.option.osmosis_replication_timestamp "$pbf" 2>/dev/null)
    osm=$( [ -n "$ts" ] && echo $(( (now - $(date -d "$ts" +%s)) / 86400 )) || age_days "$pbf")
    [ "$osm" -gt 10 ] && once_a_day fresh_osm "Kartendaten auf $HOST sind $osm Tage alt (wöchentlicher Neuaufbau prüfen)"
  fi
  g=$(age_days /opt/cumo-routing/data/graph-cache)
  [ "$g" -gt 9 ] && once_a_day fresh_gh "Routing Daten (GraphHopper) auf $HOST sind $g Tage alt"
  if [ -d /opt/valhalla ]; then
    v=$(age_days /opt/valhalla/custom_files/valhalla_tiles.tar)
    [ "$v" -gt 9 ] && once_a_day fresh_vh "Valhalla Daten auf $HOST sind $v Tage alt"
    # gleiche Version wie der öffentliche Server, der die Kreisverkehre richtig ansagt
    own=$(curl -fs -m 10 http://127.0.0.1:8002/status | python3 -c "import sys,json;print(json.load(sys.stdin).get('version',''))" 2>/dev/null)
    pub=$(curl -fs -m 15 https://valhalla1.openstreetmap.de/status | python3 -c "import sys,json;print(json.load(sys.stdin).get('version',''))" 2>/dev/null)
    [ -n "$own" ] && [ -n "$pub" ] && [ "${own%%-*}" != "${pub%%-*}" ] && once_a_day ver_vh "Valhalla auf $HOST hat $own, der öffentliche $pub. Beim nächsten Neubau kommt die neue Version, sonst valhalla-update.sh starten."
  fi
  systemctl is-enabled --quiet cumo-photon 2>/dev/null && { p=$(age_days /opt/photon/photon_data); [ "$p" -gt 40 ] && once_a_day fresh_ph "Ortssuche auf $HOST ist $p Tage alt"; }
  [ -f /opt/cumo-routing/poi/v1/meta.json ] && { q=$(age_days /opt/cumo-routing/poi/v1/meta.json); [ "$q" -gt 40 ] && once_a_day fresh_poi "Stopps (Tank, Aussicht, Essen) auf $HOST sind $q Tage alt"; }
  # die wöchentlichen Zeitpläne müssen laufen
  for t in cumo-routing-update cumo-valhalla-update cumo-photon-update; do
    systemctl list-unit-files "$t.timer" --no-legend 2>/dev/null | grep -q . || continue
    systemctl is-active --quiet "$t.timer" || once_a_day "timer_$t" "Zeitplan $t auf $HOST läuft nicht, die Daten werden nicht mehr erneuert"
  done
  # neue GraphHopper Version (nur Hinweis)
  ghv=$(cat /opt/cumo-routing/setup-server.sh /opt/cumo-routing/routing-rebuild.sh 2>/dev/null | grep -m1 -oE "GH_VERSION=[0-9.]+" | cut -d= -f2)
  ghl=$(curl -fs -m 15 https://api.github.com/repos/graphhopper/graphhopper/releases/latest | python3 -c "import sys,json;print(json.load(sys.stdin).get('tag_name',''))" 2>/dev/null)
  [ -n "$ghv" ] && [ -n "$ghl" ] && [ "$ghl" != "$ghv" ] && once_a_day ver_gh "GraphHopper $ghl ist erschienen, auf $HOST läuft $ghv"
fi

if [ -f /etc/cumo-primary ]; then
  # Datenbank: Antwort unter 500 heißt erreichbar (ohne Schlüssel kommt 401)
  code=$(curl -s -m 15 -o /dev/null -w "%{http_code}" https://onfxnfkhajxvjmmvmzda.supabase.co/rest/v1/)
  f="$STATE/db"
  if [ "$code" -ge 200 ] && [ "$code" -lt 500 ]; then
    [ "$(cat "$f" 2>/dev/null || echo 0)" -ge 3 ] && say "Datenbank antwortet wieder" default white_check_mark
    echo 0 > "$f"
  else
    n=$(( $(cat "$f" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$f"
    [ "$n" -eq 3 ] && say "Datenbank (Supabase) antwortet seit drei Minuten nicht (HTTP $code)" high rotating_light
  fi
  # Tagesmeldung um 8 Uhr: Überwachung lebt
  if [ "$(date +%H)" = "08" ] && [ "$(cat "$STATE/daily" 2>/dev/null)" != "$(date +%F)" ]; then
    date +%F > "$STATE/daily"
    [ -n "$NOTIFY" ] && curl -fs -m 10 -H "Title: CUMO DRIVE" -H "Priority: low" -H "Tags: green_circle" \
      -d "Alles im Blick: Server 1 und 2 werden überwacht. Platte $use Prozent, Speicher frei $avail MB." "$NOTIFY" >/dev/null 2>&1
  fi
fi
exit 0
