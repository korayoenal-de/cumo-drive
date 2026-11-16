// Eingang der Rückmeldungen (Koray 16.11.): Claudes geplante Prüfläufe holen hier neue Meldungen ab und setzen danach
// Status, Befund und Lösung. Schutz: Header x-feedback-key gleich dem Secret FEEDBACK_KEY. Ohne gesetztes Secret ist die
// Funktion zu. Gibt keine Namen oder E-Mail Adressen aus, nur eine kurze Kennung des Fahrers.
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
});
const STATUS = ['neu', 'geprueft', 'loesung', 'wartet', 'erledigt', 'informiert'];

function same(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  const secret = Deno.env.get('FEEDBACK_KEY') ?? '';
  if (!secret || !same(req.headers.get('x-feedback-key') ?? '', secret)) return json({ error: 'nicht erlaubt' }, 401);

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const status = (url.searchParams.get('status') ?? 'neu').split(',').filter((s) => STATUS.includes(s));
    const limit = Math.min(50, Number(url.searchParams.get('limit') ?? 20) || 20);
    const { data, error } = await db
      .from('feedback')
      .select('id, created_at, updated_at, owner, source, ref, area, note, reasons, score, lat, lon, version, context, status, finding, solution')
      .in('status', status.length ? status : ['neu'])
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) return json({ error: error.message }, 500);
    const rows = data ?? [];
    // Fahrtprotokoll zu Problem melden mitliefern (letzte Minuten der Fahrt, zum Nachspielen)
    const reportIds = rows.filter((r) => r.source === 'melden' && r.ref).map((r) => r.ref);
    const logs = new Map<string, unknown>();
    if (reportIds.length) {
      const { data: reps } = await db.from('nav_reports').select('id, log').in('id', reportIds);
      for (const r of reps ?? []) logs.set(r.id, r.log);
    }
    return json({
      items: rows.map((r) => ({ ...r, owner: r.owner ? String(r.owner).slice(0, 8) : null, log: r.ref ? logs.get(r.ref) ?? null : null })),
    });
  }

  if (req.method === 'PATCH') {
    const body = await req.json().catch(() => null) as { id?: string; status?: string; finding?: string; solution?: string } | null;
    if (!body?.id || (body.status && !STATUS.includes(body.status))) return json({ error: 'id oder status fehlt' }, 400);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status) patch.status = body.status;
    if (typeof body.finding === 'string') patch.finding = body.finding.slice(0, 4000);
    if (typeof body.solution === 'string') patch.solution = body.solution.slice(0, 4000);
    const { error } = await db.from('feedback').update(patch).eq('id', body.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: 'GET oder PATCH' }, 405);
});
