#!/usr/bin/env bash
# Testlauf vor jedem Update (Koray 17.11.2026): ohne grünen Lauf kein OTA Update und kein Build.
#
# Aufruf im Ordner app:  npm run vor-update
# Optionen:  OHNE_ROUTEN=1  lässt die festen Routen aus (nur wenn sich am Routing nichts geändert hat)
#
# Schritte: Typen, Lint, lib Tests, QS Korpus, Stresstest, Simulation (lokale Testdatenbank),
# feste Routen des Tageschecks über die echten Routing Server. Bericht in qa/out/vor-update.md.
set -uo pipefail
cd "$(dirname "$0")/.."

OUT=qa/out
mkdir -p "$OUT"
LOG="$OUT/vor-update.log"
: > "$LOG"
TS=(--tsconfig scripts/replay/tsconfig.json)
declare -a ROWS=()
FAILED=0

step() {
  local name=$1; shift
  local t0=$SECONDS
  printf '%-14s ' "$name"
  if "$@" >> "$LOG" 2>&1; then
    local s=$((SECONDS - t0)); echo "ok      ${s} s"; ROWS+=("| $name | ok | ${s} s |")
  else
    local s=$((SECONDS - t0)); echo "FEHLER  ${s} s"; ROWS+=("| $name | **Fehler** | ${s} s |"); FAILED=$((FAILED + 1))
  fi
}

# Zeitbudgets schwanken auf ausgelasteten Rechnern; ein zweiter Versuch, damit nur echte Langsamkeit rot wird
stress() {
  npx tsx "${TS[@]}" qa/stress.ts || { echo "Stresstest: zweiter Versuch"; npx tsx "${TS[@]}" qa/stress.ts; }
}

sim() {
  bash qa/sim/setup-pg.sh && SIM_STUB=qa/sim/stub.sql npx tsx qa/sim/run.ts
}

echo "Testlauf vor dem Update, $(date '+%d.%m.%Y %H:%M'), Stand $(git rev-parse --short HEAD 2>/dev/null)"
step "Typen" npx tsc --noEmit
step "Lint" npx eslint src
step "lib Tests" npm test --silent
step "QS Korpus" npx tsx "${TS[@]}" qa/check.ts
step "Stresstest" stress
step "Simulation" sim
if [ "${OHNE_ROUTEN:-}" != 1 ]; then
  step "Feste Routen" npx tsx "${TS[@]}" qa/daily/run.ts --pflicht --out "$OUT/routen"
fi

{
  echo "# Testlauf vor dem Update"
  echo
  echo "$(date '+%d.%m.%Y %H:%M'), Stand $(git rev-parse --short HEAD 2>/dev/null). Vollständige Ausgabe in vor-update.log."
  echo
  echo "| Schritt | Ergebnis | Dauer |"
  echo "| --- | --- | --- |"
  printf '%s\n' "${ROWS[@]}"
} > "$OUT/vor-update.md"

if [ "$FAILED" -gt 0 ]; then
  echo "$FAILED Schritte mit Fehler. Kein Update, erst beheben. Details: $LOG"
  exit 1
fi
echo "Alles grün. Das Update darf raus."
