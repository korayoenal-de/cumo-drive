#!/usr/bin/env bash
# Anmeldung an den eigenen Servern einrichten (Koray 16.11.). Auf jedem Routing Server als root ausführen:
#   bash install.sh            Zählen ohne Sperren (ENFORCE=0), sicher für alte App Stände
#   bash install.sh enforce    ohne gültiges Token Status 401
#   bash install.sh off        Prüfung wieder ausbauen
# Sichert die Caddyfile, prüft sie mit caddy validate und spielt bei einem Fehler die Sicherung zurück.
set -euo pipefail
MODE="${1:-count}"
DIR=/opt/cumo-routing/auth
CF=/etc/caddy/Caddyfile
BK=/etc/caddy/Caddyfile.vor-auth.$(date +%Y%m%d%H%M%S)
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ "$MODE" = off ]; then
  cp "$CF" "$BK"
  sed -i '/import \/etc\/caddy\/cumo-auth.caddy/d' "$CF"
  caddy validate --config "$CF" >/dev/null && systemctl reload caddy || { cp "$BK" "$CF"; echo "Caddyfile ungültig, Sicherung zurück"; exit 1; }
  systemctl disable --now cumo-auth-gate || true
  echo "Prüfung ausgebaut"; exit 0
fi

apt-get install -y -q python3-jwt python3-cryptography >/dev/null
mkdir -p "$DIR"
install -m 644 "$HERE/auth_gate.py" "$DIR/auth_gate.py"
install -m 644 "$HERE/cumo-auth.caddy" /etc/caddy/cumo-auth.caddy
install -m 644 "$HERE/cumo-auth-gate.service" /etc/systemd/system/cumo-auth-gate.service
[ "$MODE" = enforce ] && sed -i 's/ENFORCE=0/ENFORCE=1/' /etc/systemd/system/cumo-auth-gate.service
systemctl daemon-reload
systemctl enable --now cumo-auth-gate
systemctl restart cumo-auth-gate
# Python mit jwt und cryptography braucht auf dem Server ein paar Sekunden bis zum ersten Antworten (17.11.: nach 1 s noch nicht da)
for i in $(seq 1 20); do curl -sf localhost:9180/stats >/dev/null && break; sleep 1; done
curl -sf localhost:9180/stats >/dev/null || { echo "Prüfdienst startet nicht"; journalctl -u cumo-auth-gate -n 20 --no-pager; exit 1; }

cp "$CF" "$BK"
if ! grep -q 'import /etc/caddy/cumo-auth.caddy' "$CF"; then
  # nach jeder öffnenden Zeile eines Site Blocks (Adresse gefolgt von {) einfügen
  awk '{print} /^[^#\t ].*\{[[:space:]]*$/ && !/^\(/ {print "\timport /etc/caddy/cumo-auth.caddy"}' "$BK" > "$CF"
fi
if caddy validate --config "$CF" >/dev/null 2>&1; then
  systemctl reload caddy
  echo "Eingerichtet ($MODE). Sicherung: $BK"
  curl -s localhost:9180/stats; echo
else
  cp "$BK" "$CF"
  echo "Caddyfile ungültig, Sicherung zurückgespielt:"; caddy validate --config "$CF" 2>&1 | tail -5
  exit 1
fi
