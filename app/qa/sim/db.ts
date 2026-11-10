/**
 * Lokale Test Datenbank für die Simulation (nie das echte Supabase Projekt).
 *
 * Jeder Aufruf läuft über psql in einer eigenen Transaktion mit der Rolle des virtuellen Fahrers:
 * `set local role authenticated` und `request.uid` (auth.uid() ist in stub.sql gestubbt). So greifen
 * Row Level Security, Spaltenrechte und security definer Funktionen wie in echt.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const PG = {
  socket: process.env.SIM_PG_SOCKET ?? '/var/tmp/cumopg',
  port: process.env.SIM_PG_PORT ?? '5499',
  user: process.env.SIM_PG_USER ?? 'postgres',
  db: process.env.SIM_PG_DB ?? 'sim',
};

/** Schutz: die Simulation spricht nur mit einem lokalen Socket, nie mit einer URL. */
if (!PG.socket.startsWith('/')) throw new Error('SIM_PG_SOCKET muss ein lokaler Socket Ordner sein');

const baseArgs = (db: string) => ['-h', PG.socket, '-p', PG.port, '-U', PG.user, '-d', db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];

export type DbError = { message: string; code?: string };
export type DbResult = { out: string; error: DbError | null };

let inflight = 0;
export const dbBusy = () => inflight > 0;
export let dbCalls = 0;

/** Ein SQL Skript ausführen, stdout zurück (letzte Zeile ist meist JSON). */
export function runSql(script: string, db = PG.db): Promise<DbResult> {
  inflight++;
  dbCalls++;
  return new Promise((resolve) => {
    const p = spawn('psql', baseArgs(db), { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => {
      inflight--;
      if (code === 0) return resolve({ out: out.trim(), error: null });
      const m = /ERROR:\s+(.*)/.exec(err);
      resolve({ out: out.trim(), error: { message: m ? m[1].trim() : err.trim() || `psql ${code}` } });
    });
    p.stdin.end(script);
  });
}

/** Als virtueller Fahrer (oder anon ohne uid) ausführen. */
export function asUser(uid: string | null, sql: string): Promise<DbResult> {
  const head = uid
    ? `begin;\nset local role authenticated;\nset local "request.uid" = ${lit(uid)};\nset local "request.role" = 'authenticated';\n`
    : `begin;\nset local role anon;\nset local "request.role" = 'anon';\n`;
  return runSql(`${head}${sql};\ncommit;\n`);
}

/** Als Superuser (nur für den Aufbau der Testdaten, wie die Registrierung bei Supabase). */
export function asAdmin(sql: string): Promise<DbResult> {
  return runSql(sql);
}

export function lit(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
  if (v instanceof Date) return `'${v.toISOString()}'`;
  return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
}

export const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error(`Ungültiger Name ${s}`);
  return `"${s}"`;
};

/**
 * Datenbank `sim` neu anlegen: stub.sql (Auth Stub), Supabase Standardrechte, dann alle Migrationen
 * in Reihenfolge. Fehlschläge einzelner Anweisungen (pg_cron, pg_net) werden gesammelt, nicht repariert.
 */
export function setupDatabase(migrationsDir: string, stubFile: string): { skipped: string[] } {
  const admin = (db: string, input: string) => spawnSync('psql', [...baseArgs(db).filter((a) => a !== '-v' && a !== 'ON_ERROR_STOP=1')], { input, encoding: 'utf8' });
  const r = admin('postgres', `drop database if exists ${PG.db} with (force);\ncreate database ${PG.db};\n`);
  if (r.status !== 0) throw new Error(`Datenbank anlegen: ${r.stderr}`);
  const skipped: string[] = [];
  const collect = (label: string, stderr: string) => {
    for (const line of stderr.split('\n')) {
      const m = /ERROR:\s+(.*)/.exec(line);
      // Rollen gibt es clusterweit schon aus der Datenbank t
      if (m && !/role "(anon|authenticated|service_role)" already exists/.test(m[1])) skipped.push(`${label}: ${m[1]}`);
    }
  };
  collect('stub.sql', admin(PG.db, readFileSync(stubFile, 'utf8')).stderr);
  // Wie in Supabase: neue Tabellen, Funktionen und Sequenzen gehören standardmäßig anon und authenticated
  collect(
    'supabase-defaults',
    admin(
      PG.db,
      `grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;
-- auth.role() wie bei Supabase aus dem JWT (hier request.role), ohne JWT (Betreiber SQL) null.
-- stub.sql liefert immer 'authenticated', dann griffe der Schutz der Abo Spalten auch beim Testaufbau.
create or replace function auth.role() returns text language sql stable as $f$ select nullif(current_setting('request.role', true), '') $f$;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
set search_path = public, extensions;`,
    ).stderr,
  );
  for (const f of readdirSync(migrationsDir).filter((x) => x.endsWith('.sql')).sort()) {
    // search_path wie bei Supabase (gen_random_uuid und Co. aus extensions)
    collect(f, admin(PG.db, `set search_path = public, extensions;\n${readFileSync(path.join(migrationsDir, f), 'utf8')}`).stderr);
  }
  return { skipped };
}
