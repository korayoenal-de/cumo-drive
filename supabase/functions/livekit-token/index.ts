// Zugang zum Funk einer Gruppenfahrt (Funk Konzept, Koray 10.11.).
// Prüft mit dem JWT des Fahrers, ob er Mitglied der Fahrt ist, und gibt dann ein kurzes LiveKit Token
// für den Raum ride-<rideId> zurück. Der geheime LiveKit Schlüssel bleibt in den Secrets.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);

  const url = Deno.env.get('LIVEKIT_URL');
  const key = Deno.env.get('LIVEKIT_API_KEY');
  const secret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!url || !key || !secret) return json({ error: 'Funk ist noch nicht eingerichtet.' }, 503);

  const auth = req.headers.get('Authorization') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: u } = await db.auth.getUser();
  if (!u.user) return json({ error: 'Bitte anmelden.' }, 401);

  const body = (await req.json().catch(() => null)) as { ride?: string } | null;
  const ride = body?.ride ?? '';
  if (!UUID.test(ride)) return json({ error: 'Ungültige Fahrt.' }, 400);

  // Mitgliedschaft über die bestehende Funktion, mit den Rechten des Fahrers
  const { data: member, error } = await db.rpc('is_ride_member', { r: ride });
  if (error || member !== true) return json({ error: 'Du bist nicht in dieser Gruppenfahrt.' }, 403);

  const { data: prof } = await db.from('profiles').select('display_name').eq('id', u.user.id).maybeSingle();
  const name = (prof as { display_name?: string } | null)?.display_name ?? 'Fahrer';

  const at = new AccessToken(key, secret, { identity: u.user.id, name, ttl: '8h' });
  // Senden und hören im eigenen Raum; Daten nur für den Schalter "Nur die Lead spricht"
  at.addGrant({ room: `ride-${ride}`, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return json({ url, token: await at.toJwt() });
});
