/**
 * Ortssuche über Photon. Seit 12.11. (Koray, Unabhängigkeit) zuerst die eigenen Server (Europa, unter /photon),
 * der öffentliche Dienst von komoot nur noch als Notfall. Welcher Dienst antwortet, wird fünf Minuten gemerkt;
 * ein eigener Server bekommt höchstens 2,5 s, damit ein Ausfall die Suche nicht spürbar bremst.
 */
import { CUMO_ROUTING_SERVERS } from './cumo-routing';

const PUBLIC = 'https://photon.komoot.io';
const OWN = [...CUMO_ROUTING_SERVERS].reverse().map((u) => `${u}/photon`);
const OWN_TIMEOUT_MS = 2500;
const REMEMBER_MS = 5 * 60 * 1000;

let good: { base: string; at: number } | null = null;
/** eigene Server, die gerade nicht antworten: eine Minute überspringen, statt bei jeder Suche neu zu warten */
const badUntil = new Map<string, number>();
const BAD_MS = 60 * 1000;

async function ask(base: string, pathAndQuery: string, signal: AbortSignal | undefined, timeoutMs: number | null): Promise<Response> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  const t = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(`${base}${pathAndQuery}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Ortssuche: Fehler ${res.status}`);
    return res;
  } finally {
    if (t) clearTimeout(t);
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
      const res = await ask(base, pathAndQuery, signal, base === PUBLIC ? null : OWN_TIMEOUT_MS);
      good = { base, at: Date.now() };
      return res;
    } catch (e) {
      if (signal?.aborted) throw e;
      last = e;
      if (good?.base === base) good = null;
      if (base !== PUBLIC) badUntil.set(base, Date.now() + BAD_MS);
    }
  }
  throw last instanceof Error ? last : new Error('Ortssuche nicht erreichbar');
}
