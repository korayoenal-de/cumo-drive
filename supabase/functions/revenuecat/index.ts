// Kaufabgleich (Koray 16.11.): RevenueCat schickt hier jedes Ereignis zu einem Abo. Die Funktion schreibt plan und
// plan_until in profiles, my_entitlement liest daraus. Schutz: Header Authorization gleich dem Secret REVENUECAT_KEY
// (in RevenueCat beim Webhook als Authorization Header eingetragen). Ohne gesetztes Secret ist die Funktion zu.
// RevenueCat kennt das Konto unter der Supabase Konto ID (Purchases.logIn in der App).
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
});

const PLANS: Record<string, string> = {
  'de.rallycumo.drive.jahr': 'jahr',
  'de.rallycumo.drive.monat': 'monat',
  'de.rallycumo.drive.woche': 'woche',
  'de.rallycumo.drive.saison': 'saison',
};
const SAISON_DAYS = 183;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function same(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type RcEvent = {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  transferred_from?: string[];
  transferred_to?: string[];
};

/** Supabase Konto aus den IDs des Ereignisses (anonyme RevenueCat IDs beginnen mit $RCAnonymousID) */
function accountOf(e: RcEvent): string | null {
  for (const id of [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])]) if (id && UUID.test(id)) return id;
  return null;
}

async function setPlan(uid: string, plan: string | null, until: string | null) {
  const { error } = await db.from('profiles').upsert({ id: uid, plan, plan_until: until }, { onConflict: 'id' });
  if (error) throw error;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('REVENUECAT_KEY') ?? '';
  const auth = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!secret || !same(auth, secret)) return json({ error: 'nicht erlaubt' }, 401);
  if (req.method !== 'POST') return json({ error: 'nur POST' }, 405);

  const body = (await req.json().catch(() => null)) as { event?: RcEvent } | null;
  const e = body?.event;
  if (!e?.type) return json({ error: 'kein Ereignis' }, 400);
  if (e.type === 'TEST') return json({ ok: true, test: true });

  try {
    if (e.type === 'TRANSFER') {
      // Kauf zieht auf ein anderes Konto um (Käufe wiederherstellen mit anderem Konto): alt leeren, neu setzen
      for (const id of e.transferred_from ?? []) if (UUID.test(id)) await setPlan(id, null, null);
      const to = (e.transferred_to ?? []).find((id) => UUID.test(id));
      if (to && e.product_id && PLANS[e.product_id] && e.expiration_at_ms) {
        await setPlan(to, PLANS[e.product_id], new Date(e.expiration_at_ms).toISOString());
      }
      return json({ ok: true });
    }

    const uid = accountOf(e);
    const plan = e.product_id ? PLANS[e.product_id] : undefined;
    if (!uid || !plan) return json({ ok: true, skipped: 'kein Konto oder Produkt' });

    let until: string | null = e.expiration_at_ms ? new Date(e.expiration_at_ms).toISOString() : null;
    if (plan === 'saison' && !until) {
      const from = e.purchased_at_ms ?? Date.now();
      until = new Date(from + SAISON_DAYS * 86400000).toISOString();
    }

    switch (e.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE':
      case 'UNCANCELLATION':
      case 'NON_RENEWING_PURCHASE':
      case 'SUBSCRIPTION_EXTENDED':
      case 'TEMPORARY_ENTITLEMENT_GRANT':
      case 'CANCELLATION':
      case 'BILLING_ISSUE':
      case 'EXPIRATION':
        // Gekündigt oder abgelaufen: das Ende steht im Ablaufdatum, my_entitlement vergleicht mit jetzt.
        // Bei einer Erstattung kommt CANCELLATION mit einem Ablaufdatum in der Vergangenheit.
        await setPlan(uid, plan, until);
        break;
      default:
        return json({ ok: true, skipped: e.type });
    }
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Fehler' }, 500);
  }
});
