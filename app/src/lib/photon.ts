/**
 * Ortssuche über Photon. Seit 12.11. (Koray, Unabhängigkeit) zuerst die eigenen Server (Europa, unter /photon),
 * der öffentliche Dienst von komoot nur noch als Notfall. Welcher Dienst antwortet, wird fünf Minuten gemerkt;
 * ein eigener Server bekommt höchstens 4 s, der öffentliche 7 s, damit ein Ausfall die Suche nicht endlos hängen lässt.
 */
import { CUMO_ROUTING_SERVERS } from './cumo-routing';

const PUBLIC = 'https://photon.komoot.io';
const OWN = [...CUMO_ROUTING_SERVERS].reverse().map((u) => `${u}/photon`);
const OWN_TIMEOUT_MS = 4000;
/** Auch der öffentliche Dienst bekommt eine Frist: ohne sie drehte das Rad endlos, wenn er nicht antwortete (Koray 12.11.) */
const PUBLIC_TIMEOUT_MS = 7000;
const REMEMBER_MS = 5 * 60 * 1000;

let good: { base: string; at: number } | null = null;
/** eigene Server, die gerade nicht antworten: eine Weile überspringen, statt bei jeder Suche neu zu warten */
const badUntil = new Map<string, number>();
const BAD_MS = 60 * 1000;
/** Server ohne Ortssuche (404): lange überspringen, das ändert sich nicht von selbst */
const MISSING_MS = 30 * 60 * 1000;
/**
 * Eine einzelne langsame Antwort sperrt den eigenen Server nicht mehr. Vorher reichte eine Suche nach einem
 * Buchstaben (über 3 s), dann lief eine Minute lang alles über den öffentlichen Dienst, und der hing (12.11.).
 */
const slow = new Map<string, number>();

class PhotonError extends Error {
  constructor(message: string, readonly kind: 'timeout' | 'missing' | 'other') {
    super(message);
  }
}

async function ask(base: string, pathAndQuery: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  let timedOut = false;
  const t = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  try {
    const res = await fetch(`${base}${pathAndQuery}`, { signal: ctrl.signal });
    if (!res.ok) throw new PhotonError(`Ortssuche: Fehler ${res.status}`, res.status === 404 ? 'missing' : 'other');
    return res;
  } catch (e) {
    if (timedOut) throw new PhotonError('Ortssuche antwortet nicht', 'timeout');
    throw e;
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** pathAndQuery beginnt mit /api oder /reverse */
export async function photonFetch(pathAndQuery: string, signal?: AbortSignal): Promise<Response> {
  const remembered = good && Date.now() - good.at < REMEMBER_MS ? good.base : null;
  const now = Date.now();
  const order = [...new Set([...(remembered ? [remembered] : []), ...OWN.filter((b) => (badUntil.get(b) ?? 0) < now), PUBLIC])];
  let last: unknown = null;
  for (const base of order) {
    try {
      const res = await ask(base, pathAndQuery, signal, base === PUBLIC ? PUBLIC_TIMEOUT_MS : OWN_TIMEOUT_MS);
      good = { base, at: Date.now() };
      slow.delete(base);
      return res;
    } catch (e) {
      if (signal?.aborted) throw e;
      last = e;
      if (base === PUBLIC) continue;
      const kind = e instanceof PhotonError ? e.kind : 'other';
      if (kind === 'timeout') {
        // erst die zweite langsame Antwort in Folge sperrt den Server für eine Minute
        const n = (slow.get(base) ?? 0) + 1;
        slow.set(base, n);
        if (n < 2) continue;
      }
      if (good?.base === base) good = null;
      badUntil.set(base, Date.now() + (kind === 'missing' ? MISSING_MS : BAD_MS));
    }
  }
  throw last instanceof Error ? last : new Error('Ortssuche nicht erreichbar');
}
