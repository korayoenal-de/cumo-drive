// Push Benachrichtigungen (Koray 10.11.) über die Expo Push API.
// Aufgerufen von Datenbank Triggern per pg_net (supabase/migrations/20261110180000_push_benachrichtigungen.sql)
// bei neuer privater Nachricht, neuer Nachricht im Chat einer Ausfahrt, Einladung, Anfrage und Antwort.
// Nimmt nur Aufrufe mit dem Header x-notify-secret an (Edge Function Secret NOTIFY_SECRET, gleicher Wert im Vault).
// Der Aufruf trägt nur Kennungen; Inhalte liest die Funktion selbst mit der Dienstrolle nach.
import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Event =
  | { type: 'dm'; id: number; actor?: string | null }
  | { type: 'ride_message'; id: number; actor?: string | null }
  | { type: 'ride_member'; ride: string; user: string; status: string; old?: string | null; actor?: string | null }
  | { type: 'ride_start'; ride: string; actor?: string | null }
  | { type: 'contact'; to: string; actor: string; state: 'pending' | 'accepted' };

type Note = { user: string; title: string; body: string; data: { url: string; chat?: string; type: string } };

type ExpoTicket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Vergleich in konstanter Zeit, damit das Secret nicht über Laufzeiten erraten werden kann */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Leerraum zusammenziehen und auf höchstens n Zeichen kürzen (nach Zeichen, nicht Bytes) */
function short(s: string, n = 120): string {
  const chars = Array.from(s.replace(/\s+/g, ' ').trim());
  return chars.length <= n ? chars.join('') : `${chars.slice(0, n - 1).join('').trimEnd()}…`;
}

async function nameOf(id: string): Promise<string> {
  const { data } = await db.from('profiles').select('display_name').eq('id', id).maybeSingle();
  return (data?.display_name as string | null)?.trim() || 'Ein Fahrer';
}

async function unreadOf(user: string): Promise<number> {
  const { count } = await db.from('direct_messages').select('id', { count: 'exact', head: true }).eq('recipient', user).is('read_at', null);
  return count ?? 0;
}

async function directMessage(id: number): Promise<Note[]> {
  const { data: m } = await db.from('direct_messages').select('id,sender,recipient,body').eq('id', id).maybeSingle();
  if (!m) return [];
  const { data: p } = await db.from('profiles').select('allow_messages').eq('id', m.recipient).maybeSingle();
  if (!p) return [];
  // Blockiert: keine Mitteilung (Koray 12.11.)
  const { count: blocked } = await db.from('blocks').select('blocker', { count: 'exact', head: true }).eq('blocker', m.recipient).eq('blocked', m.sender);
  if (blocked) return [];
  if (!p.allow_messages) {
    // Wer keine Nachrichten möchte, bekommt trotzdem Antworten in Unterhaltungen, die er selbst begonnen hat
    const { count } = await db.from('direct_messages').select('id', { count: 'exact', head: true }).eq('sender', m.recipient).eq('recipient', m.sender);
    if (!count) return [];
  }
  return [{ user: m.recipient, title: await nameOf(m.sender), body: short(m.body), data: { url: `/nachrichten/${m.sender}`, chat: `dm:${m.sender}`, type: 'dm' } }];
}

async function rideMessage(id: number): Promise<Note[]> {
  const { data: m } = await db.from('ride_messages').select('id,ride_id,user_id,body').eq('id', id).maybeSingle();
  if (!m) return [];
  const { data: r } = await db.from('rides').select('id,name,owner').eq('id', m.ride_id).maybeSingle();
  if (!r) return [];
  const { data: members } = await db.from('ride_members').select('user_id').eq('ride_id', r.id).eq('status', 'zugesagt').limit(200);
  const to = new Set<string>([r.owner, ...((members ?? []) as { user_id: string }[]).map((x) => x.user_id)]);
  to.delete(m.user_id);
  if (!to.size) return [];
  const sender = await nameOf(m.user_id);
  const body = short(`${sender}: ${m.body}`);
  return [...to].map((user) => ({ user, title: short(r.name, 60), body, data: { url: `/ausfahrt/chat?id=${r.id}`, chat: `ride:${r.id}`, type: 'ride_message' } }));
}

async function rideMember(e: Extract<Event, { type: 'ride_member' }>): Promise<Note[]> {
  if (!UUID.test(e.ride) || !UUID.test(e.user)) return [];
  const { data: r } = await db.from('rides').select('id,name,owner,public,status').eq('id', e.ride).maybeSingle();
  if (!r || r.status === 'beendet') return [];
  const { data: m } = await db.from('ride_members').select('status,message').eq('ride_id', e.ride).eq('user_id', e.user).maybeSingle();
  // Inzwischen wieder geändert: dann gilt die neuere Änderung mit ihrer eigenen Mitteilung
  if (!m || m.status !== e.status) return [];
  const ride = short(r.name, 60);
  const url = r.public ? `/ausfahrt/${r.id}` : '/';
  const data = { url, type: 'ride_member' };
  if (e.status === 'eingeladen' && e.user !== r.owner) {
    return [{ user: e.user, title: 'Einladung zur Ausfahrt', body: short(`${await nameOf(r.owner)} lädt dich zu ${ride} ein.`), data }];
  }
  if (e.status === 'angefragt') {
    return [{ user: r.owner, title: 'Neue Anfrage', body: short(`${await nameOf(e.user)} möchte bei ${ride} mitfahren.`), data }];
  }
  if (e.old === 'angefragt' && e.status === 'zugesagt') {
    return [{ user: e.user, title: 'Du bist dabei', body: short(`Deine Anfrage für ${ride} ist angenommen.`), data }];
  }
  if (e.old === 'angefragt' && e.status === 'abgelehnt') {
    return [{ user: e.user, title: 'Anfrage abgelehnt', body: short(`Für ${ride} hat es diesmal nicht geklappt.`), data }];
  }
  if (e.old === 'eingeladen' && e.status === 'zugesagt' && e.user !== r.owner) {
    return [{ user: r.owner, title: 'Zusage', body: short(`${await nameOf(e.user)} fährt bei ${ride} mit.`), data }];
  }
  if (e.old === 'eingeladen' && e.status === 'abgesagt' && e.user !== r.owner) {
    const why = (m.message as string | null)?.trim();
    return [{ user: r.owner, title: 'Absage', body: short(`${await nameOf(e.user)} hat für ${ride} abgesagt${why ? `: ${why}` : ''}.`), data }];
  }
  return [];
}

/** Veranstalter hat die Gruppenfahrt gestartet: an alle, die zugesagt haben (Koray 12.11.) */
async function rideStart(e: Extract<Event, { type: 'ride_start' }>): Promise<Note[]> {
  if (!UUID.test(e.ride)) return [];
  const { data: r } = await db.from('rides').select('id,name,owner,public,status').eq('id', e.ride).maybeSingle();
  if (!r || r.status !== 'laeuft') return [];
  const { data: members } = await db.from('ride_members').select('user_id').eq('ride_id', r.id).eq('status', 'zugesagt').limit(200);
  const to = ((members ?? []) as { user_id: string }[]).map((x) => x.user_id).filter((u) => u !== r.owner);
  if (!to.length) return [];
  const lead = await nameOf(r.owner);
  const data = { url: r.public ? `/ausfahrt/${r.id}` : '/', type: 'ride_start' };
  return to.map((user) => ({ user, title: `${lead} hat die Gruppenfahrt gestartet`, body: short(`${r.name}: tippe, um mitzufahren. Funk und Live Karte sind an.`), data }));
}

/** Kontaktanfrage und Annahme unter Drivers (Koray 13.11.); nur, wenn die Zeile noch so besteht */
async function contact(e: Extract<Event, { type: 'contact' }>): Promise<Note[]> {
  if (!UUID.test(e.to) || !UUID.test(e.actor)) return [];
  const [requester, addressee] = e.state === 'pending' ? [e.actor, e.to] : [e.to, e.actor];
  const { data: c } = await db.from('contacts').select('status').eq('requester', requester).eq('addressee', addressee).maybeSingle();
  if (!c || (e.state === 'accepted') !== (c.status === 'accepted')) return [];
  const who = await nameOf(e.actor);
  const data = { url: '/community', type: 'contact' };
  return e.state === 'pending'
    ? [{ user: e.to, title: 'Kontaktanfrage', body: short(`${who} möchte dich als Kontakt hinzufügen.`), data }]
    : [{ user: e.to, title: 'Neuer Kontakt', body: short(`${who} hat deine Anfrage angenommen.`), data }];
}

async function notes(e: Event): Promise<Note[]> {
  let list: Note[] = [];
  if (e.type === 'dm' && Number.isSafeInteger(e.id)) list = await directMessage(e.id);
  else if (e.type === 'ride_message' && Number.isSafeInteger(e.id)) list = await rideMessage(e.id);
  else if (e.type === 'ride_member') list = await rideMember(e);
  else if (e.type === 'ride_start') list = await rideStart(e);
  else if (e.type === 'contact') list = await contact(e);
  // Wer etwas selbst ausgelöst hat, bekommt dazu keine Mitteilung
  return e.actor ? list.filter((n) => n.user !== e.actor) : list;
}

async function send(list: Note[]): Promise<{ sent: number; removed: number }> {
  if (!list.length) return { sent: 0, removed: 0 };
  const users = [...new Set(list.map((n) => n.user))];
  const { data: rows } = await db.from('push_tokens').select('token,user_id').in('user_id', users);
  const tokens = (rows ?? []) as { token: string; user_id: string }[];
  if (!tokens.length) return { sent: 0, removed: 0 };
  // App Symbol: Zahl ungelesener privater Nachrichten
  const badge = new Map<string, number>();
  await Promise.all(users.map(async (u) => badge.set(u, await unreadOf(u))));

  const messages = tokens.flatMap((t) =>
    list
      .filter((n) => n.user === t.user_id)
      .map((n) => ({ to: t.token, title: n.title, body: n.body, data: n.data, sound: 'default', badge: badge.get(n.user) ?? 0, channelId: 'default', priority: 'high' })),
  );
  const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate', 'Content-Type': 'application/json' };
  // Optional: Expo Zugangstoken, falls in Expo die erweiterte Push Sicherheit eingeschaltet ist
  const access = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (access) headers.Authorization = `Bearer ${access}`;

  let sent = 0;
  const dead = new Set<string>();
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH, { method: 'POST', headers, body: JSON.stringify(chunk) });
    if (!res.ok) {
      console.error(`Expo Push ${res.status}`);
      continue;
    }
    const tickets = ((await res.json()) as { data?: ExpoTicket[] }).data ?? [];
    tickets.forEach((t, k) => {
      if (t.status === 'ok') sent++;
      else if (t.details?.error === 'DeviceNotRegistered') dead.add(chunk[k].to);
      else console.error(`Expo Ticket ${t.details?.error ?? t.message ?? 'Fehler'}`);
    });
  }
  if (dead.size) await db.from('push_tokens').delete().in('token', [...dead]);
  return { sent, removed: dead.size };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Nur POST', { status: 405 });
  const secret = Deno.env.get('NOTIFY_SECRET') ?? '';
  if (!secret || !sameSecret(req.headers.get('x-notify-secret') ?? '', secret)) return new Response('Nicht erlaubt', { status: 401 });
  const e = (await req.json().catch(() => null)) as Event | null;
  if (!e || typeof e !== 'object' || !('type' in e)) return new Response('Ungültig', { status: 400 });
  try {
    const result = await send(await notes(e));
    return Response.json(result);
  } catch (err) {
    console.error(`notify ${e.type}: ${err instanceof Error ? err.message : String(err)}`);
    return new Response('Fehler', { status: 500 });
  }
});
