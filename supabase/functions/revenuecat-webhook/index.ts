// Kauf Ereignisse von RevenueCat (Koray 17.11., Bezahlmodell): setzt profiles.plan und profiles.plan_until für das
// Konto, das gekauft hat. Die App selbst darf diese Spalten nicht ändern (Trigger protect_profile_entitlement), deshalb
// schreibt diese Funktion mit der service role. my_entitlement liest die Werte und bleibt die eine Wahrheit.
//
// Schutz: RevenueCat schickt den im Dashboard hinterlegten Authorization Header mit. Er muss dem Secret
// REVENUECAT_WEBHOOK_AUTH entsprechen (Koray trägt es in Supabase und in RevenueCat ein). Ohne Secret ist die Funktion zu.
//
// App User ID in RevenueCat ist die Supabase Konto ID (lib/purchase.ts). Produkte: de.rallycumo.drive.jahr, .monat,
// .woche (Abos mit Verlängerung, Ende aus expiration_at_ms) und .saison (Abo ohne Verlängerung, Kauf plus 183 Tage).
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
});

type Plan = 'jahr' | 'monat' | 'woche' | 'saison';
type RcEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  purchased_at_ms?: number;
  expiration_at_ms?: number | null;
  environment?: string;
  cancel_reason?: string;
};

const SAISON_DAYS = 183;
const DAY = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ereignisse, nach denen das Konto bis zum neuen Ende freigeschaltet ist */
const GRANT = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
]);

function same(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function planOf(productId: string | undefined): Plan | null {
  const m = /\.(jahr|monat|woche|saison)$/.exec(productId ?? '');
  return m ? (m[1] as Plan) : null;
}

export function userOf(e: RcEvent): string | null {
  for (const id of [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])]) {
    if (id && UUID.test(id)) return id;
  }
  return null;
}

/** Ende des Plans laut Ereignis; null, wenn es keins gibt */
export function untilOf(e: RcEvent, plan: Plan): Date | null {
  if (plan === 'saison') return e.purchased_at_ms ? new Date(e.purchased_at_ms + SAISON_DAYS * DAY) : null;
  return e.expiration_at_ms ? new Date(e.expiration_at_ms) : null;
}

type Current = { plan: Plan | null; plan_until: string | null };

/**
 * Was sich am Profil ändert, oder null für nichts. Ein laufender längerer Plan wird nicht verkürzt, etwa wenn
 * jemand mit gültigem Saison Pass zusätzlich ein Monatsabo abschließt.
 */
export function decide(e: RcEvent, cur: Current, now = Date.now()): { plan: Plan; plan_until: string } | null {
  const plan = planOf(e.product_id);
  if (!plan) return null;
  const curUntil = cur.plan_until ? Date.parse(cur.plan_until) : 0;
  const curActive = !!cur.plan && curUntil > now;

  if (GRANT.has(e.type ?? '')) {
    const until = untilOf(e, plan);
    if (!until) return null;
    if (curActive && cur.plan !== plan && curUntil > until.getTime()) return null;
    return { plan, plan_until: until.toISOString() };
  }
  // Ablauf: nur den gleichen Plan beenden, und nur, wenn er im Profil noch länger stand
  if (e.type === 'EXPIRATION' && cur.plan === plan && e.expiration_at_ms && curUntil > e.expiration_at_ms) {
    return { plan, plan_until: new Date(e.expiration_at_ms).toISOString() };
  }
  // Erstattung durch Apple: sofort beenden. Eine normale Kündigung läuft bis zum Ende der bezahlten Zeit.
  if (e.type === 'CANCELLATION' && e.cancel_reason === 'CUSTOMER_SUPPORT' && cur.plan === plan && curActive) {
    return { plan, plan_until: new Date(now).toISOString() };
  }
  return null;
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method !== 'POST') return json({ error: 'nur POST' }, 405);
    const secret = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '';
    const header = req.headers.get('authorization') ?? '';
    if (!secret || !(same(header, secret) || same(header, `Bearer ${secret}`))) return json({ error: 'nicht erlaubt' }, 401);

    const body = (await req.json().catch(() => null)) as { event?: RcEvent } | null;
    const e = body?.event;
    if (!e?.type) return json({ error: 'kein Ereignis' }, 400);
    if (e.type === 'TEST') return json({ ok: true, test: true });

    const uid = userOf(e);
    if (!uid) {
      // Anonyme Käufe ohne Konto kann es bei uns nicht geben (Kauf nur angemeldet); trotzdem quittieren, sonst
      // wiederholt RevenueCat das Ereignis tagelang
      console.log('revenuecat: ohne Konto', e.type, e.id);
      return json({ ok: true, skipped: 'kein Konto' });
    }

    const { data: cur, error: readErr } = await db.from('profiles').select('plan, plan_until').eq('id', uid).maybeSingle();
    if (readErr) return json({ error: readErr.message }, 500);
    const change = decide(e, (cur as Current | null) ?? { plan: null, plan_until: null });
    console.log('revenuecat', e.type, e.product_id, e.environment, uid.slice(0, 8), change ? change.plan_until : 'keine Änderung');
    if (!change) return json({ ok: true, changed: false });

    const { error } = cur
      ? await db.from('profiles').update(change).eq('id', uid)
      : await db.from('profiles').insert({ id: uid, ...change });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, changed: true });
  });
}
