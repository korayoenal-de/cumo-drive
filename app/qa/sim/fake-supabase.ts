/**
 * Fake Supabase für Node: genug PostgREST, RPC, Auth und Realtime, damit die echten App Module
 * (group/ride.ts, invites.ts, start.ts, ausfahrten.ts, drivers.ts) mit mehreren virtuellen Fahrern
 * gegen die lokale Test Datenbank laufen.
 *
 * * Tabellen und RPC werden zu SQL und laufen als Rolle authenticated mit der uid des Fahrers (RLS greift).
 * * Realtime ist ein Bus im Speicher: Broadcast, Presence und postgres_changes (nur INSERT, mit
 *   RLS Prüfung je Empfänger wie beim echten Realtime Server). Latenz und Paketverlust sind je Fahrer
 *   einstellbar, ebenso ein Netzausfall (online=false).
 */
import { clock, real } from './clock';
import { asAdmin, asUser, ident, lit, type DbError } from './db';

// ------------------------------------------------------------------------------------------------
// Server: Realtime Bus und Metadaten

type Meta = Record<string, unknown> & { presence_ref: string };
type PresenceEntry = { key: string; meta: Meta };

export type NetConfig = { latencyMs: number; loss: number };

export class SimServer {
  readonly clients = new Set<SimClient>();
  /** Presence je Thema: Kanal Instanz -> Eintrag (so sieht es der Realtime Server) */
  readonly presence = new Map<string, Map<SimChannel, PresenceEntry>>();
  readonly channels = new Map<string, Set<SimChannel>>();
  /** Nach so viel Funkstille entfernt der Server die Presence (Phoenix Heartbeat Timeout) */
  presenceTimeoutMs = 60000;
  private pending = 0;
  private rng: () => number;
  private fnMeta = new Map<string, { setof: boolean; void: boolean }>();
  private realtimeTables = new Set<string>();
  readonly log: string[] = [];
  stats = { broadcasts: 0, delivered: 0, dropped: 0, pgChanges: 0 };

  constructor(seed = 42) {
    let s = seed >>> 0;
    this.rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  }

  async init() {
    const r = await asAdmin(
      `select coalesce(json_agg(json_build_object('name', p.proname, 'setof', p.proretset, 'void', p.prorettype = 'void'::regtype)), '[]') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';`,
    );
    if (r.error) throw new Error(r.error.message);
    for (const f of JSON.parse(r.out) as { name: string; setof: boolean; void: boolean }[]) this.fnMeta.set(f.name, { setof: f.setof, void: f.void });
    const t = await asAdmin(`select coalesce(json_agg(tablename), '[]') from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public';`);
    for (const n of JSON.parse(t.out) as string[]) this.realtimeTables.add(n);
  }

  fn(name: string) {
    return this.fnMeta.get(name);
  }

  isRealtimeTable(t: string) {
    return this.realtimeTables.has(t);
  }

  random() {
    return this.rng();
  }

  /** Zustellung an einen Client mit dessen Latenz (Reihenfolge bleibt je Client erhalten). */
  deliver(to: SimClient, fn: () => void, lossy: boolean) {
    if (!to.online) {
      this.stats.dropped++;
      return;
    }
    if (lossy && to.net.loss > 0 && this.rng() < to.net.loss) {
      this.stats.dropped++;
      return;
    }
    this.pending++;
    real.setTimeout(() => {
      this.pending--;
      if (!to.online) {
        this.stats.dropped++;
        return;
      }
      this.stats.delivered++;
      try {
        fn();
      } catch (e) {
        console.error('Zustellung', e);
      }
    }, to.net.latencyMs);
  }

  track(ch: SimChannel, key: string, payload: Record<string, unknown>) {
    let m = this.presence.get(ch.topic);
    if (!m) this.presence.set(ch.topic, (m = new Map()));
    const old = m.get(ch);
    const entry: PresenceEntry = { key, meta: { ...payload, presence_ref: Math.random().toString(36).slice(2, 10) } };
    m.set(ch, entry);
    this.presenceDiff(ch.topic, [entry], old ? [old] : []);
  }

  untrack(ch: SimChannel) {
    const m = this.presence.get(ch.topic);
    const old = m?.get(ch);
    if (!m || !old) return;
    m.delete(ch);
    this.presenceDiff(ch.topic, [], [old]);
  }

  presenceList(topic: string): PresenceEntry[] {
    return [...(this.presence.get(topic)?.values() ?? [])];
  }

  private presenceDiff(topic: string, joins: PresenceEntry[], leaves: PresenceEntry[]) {
    for (const ch of this.channels.get(topic) ?? []) {
      if (!ch.joined) continue;
      this.deliver(ch.client, () => ch.applyDiff(joins, leaves), false);
    }
  }

  join(ch: SimChannel) {
    let s = this.channels.get(ch.topic);
    if (!s) this.channels.set(ch.topic, (s = new Set()));
    s.add(ch);
  }

  leave(ch: SimChannel) {
    this.untrack(ch);
    this.channels.get(ch.topic)?.delete(ch);
  }

  broadcast(from: SimChannel, event: string, payload: unknown) {
    this.stats.broadcasts++;
    for (const ch of this.channels.get(from.topic) ?? []) {
      if (!ch.joined) continue;
      if (ch === from && !from.selfBroadcast) continue;
      this.deliver(ch.client, () => ch.emitBroadcast(event, payload), true);
    }
  }

  /** postgres_changes INSERT: an alle passenden Abos, deren Fahrer die Zeile per RLS lesen darf. */
  async emitInsert(table: string, rows: Record<string, unknown>[]) {
    const subs: { ch: SimChannel; cb: (p: unknown) => void; filter?: string }[] = [];
    for (const set of this.channels.values())
      for (const ch of set)
        for (const b of ch.pgBindings) if (b.table === table && (b.event === 'INSERT' || b.event === '*')) subs.push({ ch, cb: b.cb, filter: b.filter });
    for (const row of rows) {
      for (const s of subs) {
        if (!s.ch.joined || !s.ch.client.online) continue;
        if (s.filter) {
          const m = /^(\w+)=eq\.(.*)$/.exec(s.filter);
          if (m && String(row[m[1]]) !== m[2]) continue;
        }
        this.pending++;
        const r = await asUser(s.ch.client.userId, `select exists (select 1 from public.${ident(table)} where id = ${lit(row.id)})`);
        this.pending--;
        if (r.out !== 't') continue;
        this.stats.pgChanges++;
        const payload = { schema: 'public', table, commit_timestamp: new Date(clock.now()).toISOString(), eventType: 'INSERT', new: row, old: {}, errors: null };
        this.deliver(s.ch.client, () => s.cb(payload), false);
      }
    }
  }

  /** Server Zeit prüfen: Presence von Fahrern ohne Netz nach dem Timeout entfernen. */
  tick() {
    for (const c of this.clients) {
      if (c.online || c.offlineSince == null) continue;
      if (clock.now() - c.offlineSince < this.presenceTimeoutMs) continue;
      for (const [topic, m] of this.presence)
        for (const [ch, e] of m)
          if (ch.client === c) {
            m.delete(ch);
            this.presenceDiff(topic, [], [e]);
          }
    }
  }

  get busy() {
    return this.pending > 0;
  }
  track_pending(d: number) {
    this.pending += d;
  }
}

// ------------------------------------------------------------------------------------------------
// Realtime Kanal (API wie RealtimeChannel aus @supabase/realtime-js, so weit genutzt)

type Binding = { type: string; filter: Record<string, string>; cb: (p: unknown) => void };
type PgBinding = { event: string; table: string; filter?: string; cb: (p: unknown) => void };
type SubscribeCb = (status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED', err?: Error) => void;

export class SimChannel {
  joined = false;
  closed = false;
  private bindings: Binding[] = [];
  readonly pgBindings: PgBinding[] = [];
  private state: Record<string, Meta[]> = {};
  private subscribeCb: SubscribeCb | null = null;
  readonly selfBroadcast: boolean;
  readonly presenceKey: string;

  constructor(
    readonly client: SimClient,
    readonly topic: string,
    opts?: { config?: { broadcast?: { self?: boolean }; presence?: { key?: string } } },
  ) {
    this.selfBroadcast = !!opts?.config?.broadcast?.self;
    this.presenceKey = opts?.config?.presence?.key ?? Math.random().toString(36).slice(2);
  }

  on(type: string, filter: Record<string, string>, cb: (p: unknown) => void) {
    if (type === 'postgres_changes') this.pgBindings.push({ event: filter.event, table: filter.table, filter: filter.filter, cb });
    else this.bindings.push({ type, filter, cb });
    return this;
  }

  subscribe(cb?: SubscribeCb) {
    this.subscribeCb = cb ?? null;
    this.client.server.join(this);
    this.client.channels.add(this);
    if (this.client.online) this.rejoin();
    return this;
  }

  /** Beitritt (auch nach einem Netzausfall): voller Presence Stand, dann SUBSCRIBED. */
  rejoin() {
    const server = this.client.server;
    server.deliver(
      this.client,
      () => {
        if (this.closed) return;
        this.joined = true;
        this.syncState(server.presenceList(this.topic));
        this.subscribeCb?.('SUBSCRIBED');
      },
      false,
    );
  }

  /** Netz weg: wie realtime-js meldet der Kanal CHANNEL_ERROR und versucht später neu beizutreten. */
  connectionLost() {
    if (!this.joined) return;
    this.joined = false;
    this.subscribeCb?.('CHANNEL_ERROR', new Error('socket closed'));
  }

  presenceState() {
    return this.state;
  }

  async track(payload: Record<string, unknown>) {
    if (!this.joined || !this.client.online) return 'timed out';
    this.client.server.track(this, this.presenceKey, payload);
    return 'ok';
  }

  async untrack() {
    if (!this.joined || !this.client.online) return 'timed out';
    this.client.server.untrack(this);
    return 'ok';
  }

  async send(msg: { type: string; event: string; payload?: unknown }) {
    // Ohne Verbindung schickt realtime-js per REST, das ohne Netz ebenfalls scheitert
    if (!this.client.online) return 'error';
    if (msg.type === 'broadcast') this.client.server.broadcast(this, msg.event, msg.payload ?? {});
    else if (msg.type === 'presence' && msg.event === 'track') return this.track(msg.payload as Record<string, unknown>);
    else if (msg.type === 'presence' && msg.event === 'untrack') return this.untrack();
    return 'ok';
  }

  async unsubscribe() {
    this.closed = true;
    this.joined = false;
    this.client.server.leave(this);
    this.client.channels.delete(this);
    return 'ok';
  }

  emitBroadcast(event: string, payload: unknown) {
    if (this.closed) return;
    for (const b of this.bindings) if (b.type === 'broadcast' && (b.filter.event === event || b.filter.event === '*')) b.cb({ type: 'broadcast', event, payload });
  }

  private emitPresence(event: string, arg?: unknown) {
    for (const b of this.bindings) if (b.type === 'presence' && b.filter.event === event) b.cb(arg);
  }

  /** presence_diff wie RealtimePresence.syncDiff: erst joins, dann leaves, dann sync */
  applyDiff(joins: PresenceEntry[], leaves: PresenceEntry[]) {
    if (this.closed || !this.joined) return;
    for (const j of joins) {
      const cur = this.state[j.key] ?? [];
      this.state[j.key] = [...cur, j.meta];
      this.emitPresence('join', { key: j.key, currentPresences: cur, newPresences: [j.meta] });
    }
    for (const l of leaves) {
      const cur = this.state[l.key] ?? [];
      const rest = cur.filter((m) => m.presence_ref !== l.meta.presence_ref);
      if (rest.length) this.state[l.key] = rest;
      else delete this.state[l.key];
      this.emitPresence('leave', { key: l.key, currentPresences: rest, leftPresences: [l.meta] });
    }
    this.emitPresence('sync');
  }

  /** presence_state (voller Stand nach dem Beitritt) */
  private syncState(list: PresenceEntry[]) {
    const next: Record<string, Meta[]> = {};
    for (const e of list) (next[e.key] ??= []).push(e.meta);
    const prev = this.state;
    this.state = next;
    for (const k of Object.keys(next)) if (!prev[k]) this.emitPresence('join', { key: k, currentPresences: [], newPresences: next[k] });
    for (const k of Object.keys(prev)) if (!next[k]) this.emitPresence('leave', { key: k, currentPresences: [], leftPresences: prev[k] });
    this.emitPresence('sync');
  }
}

// ------------------------------------------------------------------------------------------------
// PostgREST Ersatz

type Filter = string; // fertiges SQL Prädikat
type Result = { data: unknown; error: (DbError & { code?: string }) | null; count?: number | null; status: number };

function parseOrList(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function opSql(col: string, op: string, val: string): string {
  const c = ident(col);
  switch (op) {
    case 'eq':
      return `${c} = ${lit(val)}`;
    case 'neq':
      return `${c} <> ${lit(val)}`;
    case 'gt':
      return `${c} > ${lit(val)}`;
    case 'gte':
      return `${c} >= ${lit(val)}`;
    case 'lt':
      return `${c} < ${lit(val)}`;
    case 'lte':
      return `${c} <= ${lit(val)}`;
    case 'is':
      return `${c} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`;
    case 'in':
      return `${c} in (${val.replace(/^\(|\)$/g, '').split(',').map((x) => lit(x)).join(', ')})`;
    default:
      throw new Error(`Filter ${op} nicht nachgebaut`);
  }
}

/** PostgREST Logik Ausdruck wie `and(a.eq.1,b.eq.2),c.is.null` */
function logicSql(expr: string, joiner: 'or' | 'and'): string {
  const parts = parseOrList(expr).map((t) => {
    const m = /^(and|or)\((.*)\)$/.exec(t);
    if (m) return `(${logicSql(m[2], m[1] as 'and' | 'or')})`;
    const [col, op, ...rest] = t.split('.');
    return opSql(col, op, rest.join('.'));
  });
  return parts.join(` ${joiner} `);
}

function cols(s: string | undefined): string {
  if (!s || s.trim() === '*') return '*';
  return s
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      if (/[()!:]/.test(c)) throw new Error(`Select ${c} (Einbettung) nicht nachgebaut`);
      return ident(c);
    })
    .join(', ');
}

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private selectCols: string | null = null;
  private returning = false;
  private values: Record<string, unknown>[] = [];
  private filters: Filter[] = [];
  private orders: string[] = [];
  private lim: number | null = null;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private onConflict: string | null = null;

  constructor(
    private client: SimClient,
    private table: string,
  ) {}

  select(c?: string) {
    if (this.op === 'select') this.selectCols = c ?? '*';
    else {
      this.returning = true;
      this.selectCols = c ?? '*';
    }
    return this;
  }
  insert(v: Record<string, unknown> | Record<string, unknown>[]) {
    this.op = 'insert';
    this.values = Array.isArray(v) ? v : [v];
    return this;
  }
  upsert(v: Record<string, unknown> | Record<string, unknown>[], o?: { onConflict?: string }) {
    this.op = 'upsert';
    this.values = Array.isArray(v) ? v : [v];
    this.onConflict = o?.onConflict ?? null;
    return this;
  }
  update(v: Record<string, unknown>) {
    this.op = 'update';
    this.values = [v];
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push(v === null ? `${ident(c)} is null` : `${ident(c)} = ${lit(v)}`);
    return this;
  }
  neq(c: string, v: unknown) {
    this.filters.push(`${ident(c)} <> ${lit(v)}`);
    return this;
  }
  gt(c: string, v: unknown) {
    this.filters.push(`${ident(c)} > ${lit(v)}`);
    return this;
  }
  gte(c: string, v: unknown) {
    this.filters.push(`${ident(c)} >= ${lit(v)}`);
    return this;
  }
  lt(c: string, v: unknown) {
    this.filters.push(`${ident(c)} < ${lit(v)}`);
    return this;
  }
  lte(c: string, v: unknown) {
    this.filters.push(`${ident(c)} <= ${lit(v)}`);
    return this;
  }
  is(c: string, v: null | boolean) {
    this.filters.push(`${ident(c)} is ${v === null ? 'null' : v}`);
    return this;
  }
  in(c: string, v: unknown[]) {
    this.filters.push(v.length ? `${ident(c)} in (${v.map(lit).join(', ')})` : 'false');
    return this;
  }
  or(expr: string) {
    this.filters.push(`(${logicSql(expr, 'or')})`);
    return this;
  }
  order(c: string, o?: { ascending?: boolean }) {
    this.orders.push(`${ident(c)} ${o?.ascending === false ? 'desc' : 'asc'}`);
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }
  maybeSingle() {
    this.mode = 'maybe';
    return this;
  }

  private where() {
    return this.filters.length ? ` where ${this.filters.join(' and ')}` : '';
  }

  private async pkCols(): Promise<string[]> {
    const r = await asAdmin(
      `select coalesce(json_agg(a.attname), '[]') from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = 'public.${this.table}'::regclass and i.indisprimary;`,
    );
    return JSON.parse(r.out) as string[];
  }

  async run(): Promise<Result> {
    const t = `public.${ident(this.table)}`;
    const server = this.client.server;
    // Realtime Tabellen brauchen die neue Zeile für postgres_changes
    const emit = this.op === 'insert' && server.isRealtimeTable(this.table);
    let sql: string;
    if (this.op === 'select') {
      sql = `select coalesce(json_agg(q), '[]') from (select ${cols(this.selectCols ?? '*')} from ${t}${this.where()}${this.orders.length ? ` order by ${this.orders.join(', ')}` : ''}${this.lim != null ? ` limit ${this.lim}` : ''}) q`;
    } else if (this.op === 'insert' || this.op === 'upsert') {
      const keys = [...new Set(this.values.flatMap((v) => Object.keys(v)))];
      const rows = this.values.map((v) => `(${keys.map((k) => (k in v ? lit(v[k]) : 'default')).join(', ')})`).join(', ');
      let conflict = '';
      if (this.op === 'upsert') {
        const pk = this.onConflict ? this.onConflict.split(',') : await this.pkCols();
        const upd = keys.filter((k) => !pk.includes(k));
        conflict = ` on conflict (${pk.map(ident).join(', ')}) do ${upd.length ? `update set ${upd.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(', ')}` : 'nothing'}`;
      }
      const ret = emit ? ' returning *' : this.returning ? ` returning ${cols(this.selectCols ?? '*')}` : '';
      sql = `with q as (insert into ${t} (${keys.map(ident).join(', ')}) values ${rows}${conflict}${ret}) select ${ret ? `coalesce((select json_agg(q) from q), '[]')` : `'[]'`}`;
      // ohne returning muss die CTE trotzdem laufen
      if (!ret) sql = `insert into ${t} (${keys.map(ident).join(', ')}) values ${rows}${conflict};\nselect '[]'`;
    } else if (this.op === 'update') {
      const v = this.values[0];
      const set = Object.keys(v).map((k) => `${ident(k)} = ${lit(v[k])}`).join(', ');
      sql = this.returning
        ? `with q as (update ${t} set ${set}${this.where()} returning ${cols(this.selectCols ?? '*')}) select coalesce((select json_agg(q) from q), '[]')`
        : `update ${t} set ${set}${this.where()};\nselect '[]'`;
    } else {
      sql = this.returning
        ? `with q as (delete from ${t}${this.where()} returning ${cols(this.selectCols ?? '*')}) select coalesce((select json_agg(q) from q), '[]')`
        : `delete from ${t}${this.where()};\nselect '[]'`;
    }
    const r = await this.client.query(sql);
    if (r.error) return { data: null, error: r.error, status: 400 };
    let rows = JSON.parse(r.out || '[]') as Record<string, unknown>[];
    if (emit) {
      void server.emitInsert(this.table, rows);
      if (!this.returning) rows = [];
      else if (this.selectCols && this.selectCols !== '*') {
        const keep = this.selectCols.split(',').map((c) => c.trim());
        rows = rows.map((x) => Object.fromEntries(keep.map((k) => [k, x[k]])));
      }
    }
    if (this.op !== 'select' && !this.returning) return { data: null, error: null, status: 201 };
    if (this.mode === 'many') return { data: rows, error: null, status: 200 };
    if (rows.length === 1) return { data: rows[0], error: null, status: 200 };
    if (rows.length === 0 && this.mode === 'maybe') return { data: null, error: null, status: 200 };
    return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, status: 406 };
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.run().then(ok, bad);
  }
}

// ------------------------------------------------------------------------------------------------
// Client je virtuellem Fahrer

export class SimClient {
  online = true;
  offlineSince: number | null = null;
  readonly channels = new Set<SimChannel>();
  net: NetConfig = { latencyMs: 5, loss: 0 };
  /** Mitschnitt der SQL Aufrufe (für Fehlersuche) */
  calls = 0;

  constructor(
    readonly server: SimServer,
    readonly userId: string | null,
    readonly email: string | null = null,
  ) {
    server.clients.add(this);
  }

  async query(sql: string) {
    this.calls++;
    if (!this.online) return { out: '', error: { message: 'TypeError: Network request failed' } };
    return asUser(this.userId, sql);
  }

  /** Netz an oder aus (Funkloch, Flugmodus) */
  setOnline(on: boolean) {
    if (on === this.online) return;
    this.online = on;
    if (!on) {
      this.offlineSince = clock.now();
      for (const ch of this.channels) ch.connectionLost();
    } else {
      this.offlineSince = null;
      // realtime-js verbindet neu und tritt allen Kanälen wieder bei (receive('ok') feuert erneut)
      for (const ch of this.channels) ch.rejoin();
    }
  }

  // ---- API wie SupabaseClient

  readonly auth = {
    getUser: async () => ({ data: { user: this.userId ? { id: this.userId, email: this.email } : null }, error: null }),
    getSession: async () => ({ data: { session: this.userId ? { user: { id: this.userId, email: this.email }, access_token: 'sim' } : null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signUp: async () => {
      throw new Error('signUp ist in der Simulation gesperrt');
    },
    signInWithPassword: async () => {
      throw new Error('Anmelden ist in der Simulation gesperrt');
    },
    signOut: async () => ({ error: null }),
  };

  from(table: string) {
    return new Query(this, table);
  }

  async rpc(name: string, args: Record<string, unknown> = {}): Promise<Result> {
    const meta = this.server.fn(name);
    if (!meta) return { data: null, error: { message: `Could not find the function public.${name} in the schema cache`, code: 'PGRST202' }, status: 404 };
    const call = `public.${ident(name)}(${Object.entries(args)
      .map(([k, v]) => `${ident(k)} => ${lit(v)}`)
      .join(', ')})`;
    const sql = meta.setof ? `select coalesce(json_agg(q), '[]') from ${call} q` : meta.void ? `select 'null' from (select ${call}) q` : `select coalesce(to_json(${call})::text, 'null')`;
    const r = await this.query(sql);
    if (r.error) return { data: null, error: r.error, status: 400 };
    return { data: JSON.parse(r.out || 'null'), error: null, status: 200 };
  }

  channel(topic: string, opts?: ConstructorParameters<typeof SimChannel>[2]) {
    // supabase-js setzt "realtime:" davor, für den Bus reicht das Thema
    return new SimChannel(this, topic, opts);
  }

  async removeChannel(ch: SimChannel) {
    return ch.unsubscribe();
  }

  async removeAllChannels() {
    for (const ch of [...this.channels]) await ch.unsubscribe();
    return [];
  }

  readonly functions = {
    invoke: async () => ({ data: null, error: { message: 'Edge Functions gibt es in der Simulation nicht' } }),
  };

  readonly storage = {
    from: () => {
      throw new Error('Storage gibt es in der Simulation nicht');
    },
  };
}
