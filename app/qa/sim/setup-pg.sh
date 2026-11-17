#!/usr/bin/env bash
# Lokale Postgres Instanz für die Simulation (Socket /var/tmp/cumopg, Port 5499).
# Legt sie beim ersten Aufruf an und startet sie, wenn sie nicht läuft. Nur lokal, nie das echte Supabase.
set -euo pipefail
DIR=${SIM_PG_SOCKET:-/var/tmp/cumopg}
PORT=${SIM_PG_PORT:-5499}
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
[ -n "$BIN" ] || BIN=$(dirname "$(command -v pg_ctl)")
RUN=()
if [ "$(id -u)" = 0 ]; then RUN=(runuser -u postgres --); fi

mkdir -p "$DIR"
[ "$(id -u)" = 0 ] && chown postgres "$DIR"
if [ ! -f "$DIR/data/PG_VERSION" ]; then
  "${RUN[@]}" "$BIN/initdb" -D "$DIR/data" -U postgres --auth=trust >/dev/null
fi
if ! "${RUN[@]}" "$BIN/pg_ctl" -D "$DIR/data" status >/dev/null 2>&1; then
  "${RUN[@]}" "$BIN/pg_ctl" -D "$DIR/data" -l "$DIR/pg.log" -w \
    -o "-k $DIR -p $PORT -c listen_addresses='' -c fsync=off -c timezone=UTC" start >/dev/null
fi
# Zeitzone UTC wie bei Supabase (Zeitstempel kommen dort als +00:00)
echo "Postgres für die Simulation läuft: Socket $DIR, Port $PORT"
