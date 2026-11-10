/**
 * Lernen aus der Nutzung (Koray 10.11.): was Fahrer mit Runden und Routen tun, landet als Signal in
 * public.route_signals (Migration 20261110120000_routen_signale.sql). Später werden daraus je Straßenstück
 * gelernte Strecken: gespeichert, losgefahren und gut bewertet zählt dafür, neu gewürfelt und gelöscht dagegen.
 * Gefahrene Touren mit Bewertung liegen schon in drives und werden dort ausgewertet.
 *
 * Datenschutz: Die Linie verliert die ersten und letzten 2 km (die Haustür), wird auf etwa 100 m ausgedünnt
 * und nie wieder gelesen, nur zusammengefasst ausgewertet. Ohne Konto wird nichts gesendet.
 * Alles läuft im Hintergrund; ein Fehler ändert nichts an der App.
 */
import { supabase } from './supabase';
import { flatten, haversine, type LatLon, type Profile, type Tour } from './tour';

export type SignalKind = 'geplant' | 'gespeichert' | 'uebernommen' | 'losgefahren' | 'neu_gewuerfelt' | 'geloescht' | 'veroeffentlicht';

const TRIM_M = 2000;
const STEP_M = 100;

/** Linie ohne die ersten und letzten 2 km, ausgedünnt; null, wenn danach nichts übrig bleibt */
export function trimmedLine(tour: Tour): LatLon[] | null {
  const f = flatten(tour);
  if (f.length < 2) return null;
  const total = f[f.length - 1].km;
  if (total * 1000 < TRIM_M * 2 + 500) return null;
  const out: LatLon[] = [];
  for (const x of f) {
    if (x.km * 1000 < TRIM_M || (total - x.km) * 1000 < TRIM_M) continue;
    if (!out.length || haversine(out[out.length - 1], x.p) >= STEP_M) out.push(x.p);
  }
  return out.length > 1 ? out : null;
}

function encode(points: LatLon[]): string {
  let s = '';
  let pLa = 0;
  let pLo = 0;
  const put = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    s += String.fromCharCode(n + 63);
  };
  for (const [la, lo] of points) {
    const a = Math.round(la * 1e5);
    const b = Math.round(lo * 1e5);
    put(a - pLa);
    put(b - pLo);
    pLa = a;
    pLo = b;
  }
  return s;
}

/**
 * Kurzer Schlüssel einer Tour aus ihrem Verlauf (FNV 1a über 21 Punkte in gleichen Abständen, auf etwa 1 km
 * gerundet). Gleich für dieselbe Linie, auch nachdem Meine Touren sie beim Speichern ausgedünnt hat.
 */
export function tourKey(tour: Tour): string {
  const f = flatten(tour);
  if (!f.length) return 'leer';
  const total = f[f.length - 1].km;
  let h = 0x811c9dc5;
  let i = 0;
  for (let k = 0; k <= 20; k++) {
    const want = (total * k) / 20;
    while (i < f.length - 1 && f[i].km < want) i++;
    const v = `${f[i].p[0].toFixed(2)},${f[i].p[1].toFixed(2)};`;
    for (let c = 0; c < v.length; c++) {
      h ^= v.charCodeAt(c);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return `${h.toString(36)}${Math.round(total).toString(36)}`;
}

export type SignalInfo = { mode?: 'rundtour' | 'route'; profile?: Profile; suggested?: boolean; fun?: number | null };

/** Signal senden (im Hintergrund, Fehler werden geschluckt) */
export function logSignal(kind: SignalKind, tour: Tour, info: SignalInfo = {}) {
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const line = trimmedLine(tour);
      const km = flatten(tour).at(-1)?.km ?? 0;
      await supabase.from('route_signals').insert({
        kind,
        tour_key: tourKey(tour),
        // ohne Angabe: Start und Ziel am selben Ort ist eine Rundtour
        mode: info.mode ?? (tour.wegpunkte.length > 1 && haversine(tour.wegpunkte[0], tour.wegpunkte[tour.wegpunkte.length - 1]) < 300 ? 'rundtour' : 'route'),
        profile: info.profile ?? null,
        suggested: info.suggested ?? null,
        km: Math.round(km * 10) / 10,
        fun: info.fun != null ? Math.max(0, Math.min(100, Math.round(info.fun))) : null,
        line: line ? encode(line) : null,
      });
    } catch {
      // Lernen ist nie wichtiger als die App
    }
  })();
}
