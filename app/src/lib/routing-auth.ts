/**
 * Anmeldung an den eigenen Servern (Koray 16.11.: Schutz vor Kopierern). Die App schickt das Supabase Token
 * des Kontos mit jeder Anfrage an Routing, Ortssuche, Valhalla und POI Kacheln. Die Server prüfen es,
 * sobald das dort eingeschaltet ist; bis dahin wird es ignoriert. Gilt für App und Web Planer gleich (seit 17.11.,
 * die Server beantworten die CORS Vorabfrage). Keine eigene .web.ts Datei: die frühere leitete im Browser auf sich
 * selbst weiter und brach den Web Planer beim Start ab (Maximum call stack, 17.11.).
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

/**
 * Testlauf (vor-update, GitHub Actions) ohne Konto: eigener Schlüssel aus der Umgebung des Rechners, seit 18.11.
 * In der App und im Web Planer gibt es die Variable nicht (kein EXPO_PUBLIC), dort bleibt es beim Token des Kontos.
 */
const qaKey = (): string | undefined => (typeof process !== 'undefined' ? process.env?.ROUTING_QA_KEY : undefined);

/** Kopfzeile für Anfragen an die eigenen Server */
export function routingHeaders(): Record<string, string> {
  if (token) return { Authorization: `Bearer ${token}` };
  const qa = qaKey();
  return qa ? { 'X-Cumo-QA': qa } : {};
}
