/**
 * Anmeldung an den eigenen Servern (Koray 16.11.: Schutz vor Kopierern). Die App schickt das Supabase Token
 * des Kontos mit jeder Anfrage an Routing, Ortssuche, Valhalla und POI Kacheln. Die Server prüfen es,
 * sobald das dort eingeschaltet ist; bis dahin wird es ignoriert. Im Browser noch ohne (routing-auth.web.ts),
 * weil der Kopf eine CORS Vorabfrage auslöst, die die Server erst noch beantworten müssen.
 */
let token: string | null = null;
let started = false;

/** Einmal beim Start: Token aktuell halten, auch nach dem Erneuern */
export function startRoutingAuth(): void {
  if (started) return;
  started = true;
  void import('./supabase').then(({ supabase }) => {
    void supabase.auth.getSession().then(({ data }) => {
      token = data.session?.access_token ?? null;
    });
    supabase.auth.onAuthStateChange((_e, s) => {
      token = s?.access_token ?? null;
    });
  });
}

/** Kopfzeile für Anfragen an die eigenen Server */
export function routingHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
