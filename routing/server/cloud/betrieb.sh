#!/bin/bash
# CUMO DRIVE Betrieb mit zwei Servern (Koray 12.11.): Sicherung, gegenseitige Überwachung, Absicherung, Übertragung.
# Idempotent. Aufruf vom Mac: ssh root@IP 'PEER_IP=<andere IP> bash -s' < betrieb.sh
set -euo pipefail
: "${PEER_IP:?PEER_IP fehlt}"
export DEBIAN_FRONTEND=noninteractive
BASE=/opt/cumo-routing
PEER_HOST="$(echo "$PEER_IP" | tr . -).sslip.io"
echo "https://$PEER_HOST" > /etc/cumo-peer
echo "$PEER_IP" > /etc/cumo-peer-ip

# 1. Absicherung: nur Schlüssel, Schutz gegen Anmeldeversuche, automatische Sicherheitsupdates
apt-get install -y -qq fail2ban unattended-upgrades rsync >/dev/null
# Anmeldung nur per Schlüssel nur mit LOCK_SSH=1 (Korays ausdrückliches OK, er braucht dann seinen Schlüssel)
if [ "${LOCK_SSH:-0}" = 1 ]; then
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/10-cumo.conf
  sshd -t && systemctl reload ssh
fi
systemctl enable --now fail2ban >/dev/null 2>&1 || true
ufw allow 443/udp >/dev/null   # HTTP/3 für Mobilnetze

# 2. Übertragung: zstd und gzip, POI Kacheln einen Tag im Cache
sed -i 's/^\tencode gzip$/\tencode zstd gzip/' /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 && systemctl reload caddy

# 3. Sicherung: jede Nacht Einstellungen, Skripte, Profile und POI Kacheln auf den anderen Server,
#    14 Stände (unveränderte Dateien als Hardlink, kostet kaum Platz). Graph und Kartendaten sind
#    aus dem Netz neu baubar und liegen ohnehin auf beiden Servern.
cat > "$BASE/backup.sh" <<'EOS'
#!/bin/bash
set -euo pipefail
PEER=$(cat /etc/cumo-peer-ip)
ME=$(hostname)
DAY=$(date +%F)
DEST=/opt/backup/$ME
SSH="ssh -o BatchMode=yes -o ConnectTimeout=15"
$SSH root@$PEER "mkdir -p $DEST/$DAY"
rsync -a --delete -e "$SSH" --link-dest="$DEST/latest" \
  --exclude 'data/' --exclude 'download/' --exclude 'poi-builds/' --exclude 'bin/*.jar' \
  /opt/cumo-routing /etc/caddy/Caddyfile /etc/systemd/system/cumo-* /etc/cumo-peer /etc/cumo-peer-ip \
  root@$PEER:$DEST/$DAY/
$SSH root@$PEER "ln -sfn $DEST/$DAY $DEST/latest; ls -1d $DEST/20* | head -n -14 | xargs -r rm -rf"
echo "$(date -Is) Sicherung nach $PEER fertig" >> /opt/cumo-routing/setup.log
EOS
chmod +x "$BASE/backup.sh"
cat > /etc/systemd/system/cumo-backup.service <<'EOS'
[Unit]
Description=CUMO DRIVE Sicherung auf den anderen Server
[Service]
Type=oneshot
ExecStart=/opt/cumo-routing/backup.sh
EOS
cat > /etc/systemd/system/cumo-backup.timer <<'EOS'
[Unit]
Description=CUMO DRIVE Sicherung jede Nacht
[Timer]
OnCalendar=*-*-* 02:10:00
RandomizedDelaySec=600
Persistent=true
[Install]
WantedBy=timers.target
EOS

# 4. Überwachung: jede Minute der eigene Dienst von außen und der andere Server. Zustandswechsel stehen im
#    Protokoll; ist in /etc/cumo-notify eine Adresse hinterlegt (Webhook, zum Beispiel ntfy), geht eine Nachricht raus.
cat > "$BASE/monitor.sh" <<'EOS'
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
EOS
chmod +x "$BASE/monitor.sh"
cat > /etc/systemd/system/cumo-monitor.service <<'EOS'
[Unit]
Description=CUMO DRIVE Überwachung
[Service]
Type=oneshot
ExecStart=/opt/cumo-routing/monitor.sh
EOS
cat > /etc/systemd/system/cumo-monitor.timer <<'EOS'
[Unit]
Description=CUMO DRIVE Überwachung jede Minute
[Timer]
OnBootSec=3min
OnUnitActiveSec=1min
[Install]
WantedBy=timers.target
EOS
# Protokolle klein halten
cat > /etc/logrotate.d/cumo <<'EOS'
/opt/cumo-routing/*.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
  copytruncate
}
EOS
chown -R cumo:cumo "$BASE"
systemctl daemon-reload
systemctl enable --now cumo-backup.timer cumo-monitor.timer >/dev/null 2>&1
echo "Betrieb eingerichtet auf $(hostname), Partner $PEER_HOST"
