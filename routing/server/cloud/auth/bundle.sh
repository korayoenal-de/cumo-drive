#!/usr/bin/env bash
# Baut aus diesem Ordner ein einzelnes Skript cumo-auth.sh, das Koray auf die Server kopiert (17.11.).
# Aufruf: bash bundle.sh [Ziel]   Auf dem Server: bash cumo-auth.sh [count|enforce|off]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-cumo-auth.sh}"
{
  echo '#!/usr/bin/env bash'
  echo '# CUMO DRIVE: Anmeldung und Mengengrenzen am Routing Server einrichten. Aufruf als root: bash cumo-auth.sh [count|enforce|off]'
  echo 'set -euo pipefail'
  echo 'D=/opt/cumo-routing/auth-paket; mkdir -p "$D"'
  for f in auth_gate.py cumo-auth.caddy cumo-auth-gate.service install.sh; do
    echo "cat > \"\$D/$f\" <<'CUMO_EOF'"
    cat "$HERE/$f"
    echo 'CUMO_EOF'
  done
  echo 'bash "$D/install.sh" "${1:-count}"'
} > "$OUT"
chmod +x "$OUT"
echo "geschrieben: $OUT"
