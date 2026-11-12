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
PEER=$(cat /etc/cumo-peer 2>/dev/null)
NOTIFY=$(cat /etc/cumo-notify 2>/dev/null || true)
STATE=/run/cumo-monitor
mkdir -p $STATE
say() { echo "$(date -Is) Überwachung: $1" >> /opt/cumo-routing/setup.log; [ -n "$NOTIFY" ] && curl -fs -m 10 -d "CUMO DRIVE: $1" "$NOTIFY" >/dev/null 2>&1; true; }
check() { # name url
  local f=$STATE/$1 n
  if curl -fs -m 10 "$2" >/dev/null; then
    [ "$(cat $f 2>/dev/null || echo 0)" -ge 3 ] && say "$1 antwortet wieder"
    echo 0 > $f
  else
    n=$(( $(cat $f 2>/dev/null || echo 0) + 1 )); echo $n > $f
    [ "$n" -eq 3 ] && say "$1 antwortet seit drei Minuten nicht ($2)"
  fi
}
# während des eigenen Neuaufbaus ist der eigene Dienst absichtlich aus
exec 9>/run/cumo-setup.lock
if flock -n 9; then check "Routing $(hostname)" http://localhost:8989/health; fi
[ -n "$PEER" ] && check "Routing Partner" "$PEER/health"
[ -n "$PEER" ] && check "POI Partner" "$PEER/poi/v1/meta.json"
systemctl is-enabled --quiet cumo-photon 2>/dev/null && check "Ortssuche $(hostname)" "http://localhost:2322/api?q=berlin&limit=1"
# Platte: ab 85 Prozent einmal am Tag melden
use=$(df --output=pcent / | tail -1 | tr -dc 0-9)
if [ "$use" -ge 85 ] && [ "$(cat $STATE/disk 2>/dev/null)" != "$(date +%F)" ]; then date +%F > $STATE/disk; say "Platte auf $(hostname) zu $use Prozent voll"; fi
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
