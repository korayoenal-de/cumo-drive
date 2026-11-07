#!/bin/bash
# Absicherung des Routing Servers (7.11.2026, nach dem Ausfall vom 6.11.):
#  1. Neuaufbau nie doppelt: setup-server.sh läuft nur, wenn kein anderer Import läuft (flock).
#     Am 6.11. liefen zwei Imports gleichzeitig, beide brachen ab, danach fehlte der Graph.
#  2. GraphHopper beendet sich bei Speichermangel, statt zu hängen; systemd startet ihn neu.
#  3. Wächter: prüft jede Minute /health und startet den Dienst nach drei Fehlschlägen neu,
#     aber nie während eines Imports.
# Aufruf: ssh root@IP 'bash -s' < harden.sh   (ändert nichts am laufenden Import)
set -euo pipefail
BASE=/opt/cumo-routing

# 1. Sperre im Neuaufbau: die erste Zeile nach "set -euo pipefail" bekommt einen flock
if ! grep -q "cumo-setup.lock" "$BASE/setup-server.sh"; then
  sed -i '0,/^set -euo pipefail$/s##set -euo pipefail\nexec 9>/run/cumo-setup.lock\nflock -n 9 || { echo "$(date -Is) Neuaufbau läuft schon, Abbruch" >> /opt/cumo-routing/setup.log; exit 0; }#' "$BASE/setup-server.sh"
fi
# auch im Import selbst bei Speichermangel beenden
sed -i 's#java -Xmx\$HEAP -jar#java -Xmx$HEAP -XX:+ExitOnOutOfMemoryError -jar#' "$BASE/setup-server.sh"

# 2. Dienst: bei Speichermangel beenden, Neustart nach 10 s (wie bisher)
sed -i 's#^ExecStart=/usr/bin/java -Xmx22g -jar#ExecStart=/usr/bin/java -Xmx22g -XX:+ExitOnOutOfMemoryError -jar#' /etc/systemd/system/cumo-routing.service

# 3. Wächter
cat > "$BASE/watchdog.sh" <<'EOF'
#!/bin/bash
# Startet cumo-routing neu, wenn /health dreimal hintereinander nicht antwortet.
# Während eines Neuaufbaus (Sperre gehalten) oder wenn der Dienst absichtlich gestoppt ist: nichts tun.
STATE=/run/cumo-watchdog.fails
exec 9>/run/cumo-setup.lock
flock -n 9 || exit 0
systemctl is-active --quiet cumo-routing || exit 0
# frisch gestartet: Laden dauert einige Minuten
up=$(( $(date +%s) - $(date -d "$(systemctl show cumo-routing -p ActiveEnterTimestamp --value)" +%s) ))
[ "$up" -lt 600 ] && { echo 0 > "$STATE"; exit 0; }
if curl -fs -m 10 http://localhost:8989/health > /dev/null; then echo 0 > "$STATE"; exit 0; fi
n=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$STATE"
if [ "$n" -ge 3 ]; then
  echo "$(date -Is) Wächter: /health antwortet nicht, Neustart" >> /opt/cumo-routing/setup.log
  echo 0 > "$STATE"
  systemctl restart cumo-routing
fi
EOF
chmod 0755 "$BASE/watchdog.sh"
cat > /etc/systemd/system/cumo-watchdog.service <<'EOF'
[Unit]
Description=CUMO DRIVE Routing Wächter
[Service]
Type=oneshot
ExecStart=/opt/cumo-routing/watchdog.sh
EOF
cat > /etc/systemd/system/cumo-watchdog.timer <<'EOF'
[Unit]
Description=CUMO DRIVE Routing Wächter jede Minute
[Timer]
OnBootSec=5min
OnUnitActiveSec=1min
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now cumo-watchdog.timer
echo "Absicherung aktiv:"
grep -n "cumo-setup.lock\|ExitOnOutOfMemoryError" "$BASE/setup-server.sh" /etc/systemd/system/cumo-routing.service
systemctl list-timers cumo-watchdog.timer --no-pager | head -3
