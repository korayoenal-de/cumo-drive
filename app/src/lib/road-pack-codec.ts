/**
 * Verschleierung der App Daten (siehe scripts/pack-road-data.ts). Der Text wird nur aus ASCII gebildet (Umlaute als
 * \u Folge), als Base64 kodiert und in Blöcke von 16 Zeichen zerlegt, deren Reihenfolge ein Schlüsselstrom mischt.
 * Ohne Schlüssel ergibt das weder lesbares JSON noch dekodierbares Base64.
 *
 * Bewusst so gebaut, dass das Entpacken auf dem iPhone schnell bleibt (Startprüfung 17.11.): statt jedes Zeichen in
 * JavaScript zu verschieben, arbeitet die App nur mit etwa 90.000 Blöcken und lässt atob und JSON.parse (beide nativ)
 * den Rest machen.
 */

/** Schlüssel, zerlegt, damit er nicht als ein Stück im Paket steht */
const K1 = [0x5c, 0x1f, 0xa3, 0x72];
const K2 = [0x09, 0xe4, 0x3b, 0xd8];
export const KEY = (((K1[0] ^ K2[0]) << 24) | ((K1[1] ^ K2[1]) << 16) | ((K1[2] ^ K2[2]) << 8) | (K1[3] ^ K2[3])) >>> 0;

const BLOCK = 16;

/** Reihenfolge der Blöcke: Fisher Yates mit xorshift32 */
function order(n: number, seed: number): Uint32Array {
  const p = new Uint32Array(n);
  for (let i = 0; i < n; i++) p[i] = i;
  let x = seed >>> 0 || 0x9e3779b9;
  for (let i = n - 1; i > 0; i--) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    const j = x % (i + 1);
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  return p;
}

/** Nicht ASCII Zeichen als \uXXXX, damit btoa und atob ohne UTF 8 auskommen */
function ascii(json: string): string {
  return json.replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

export function encode(json: string, seed: number): string {
  const b64 = btoa(ascii(json));
  const n = Math.ceil(b64.length / BLOCK);
  const p = order(n, seed);
  const out = new Array<string>(n);
  // Block i landet an Stelle p[i]
  for (let i = 0; i < n; i++) out[p[i]] = b64.slice(i * BLOCK, (i + 1) * BLOCK);
  // Länge des letzten (kürzeren) Blocks vorne mitgeben
  return String(b64.length) + ':' + out.join('');
}

export function decode(packed: string, seed: number): string {
  const colon = packed.indexOf(':');
  const len = Number(packed.slice(0, colon));
  const body = packed.slice(colon + 1);
  const n = Math.ceil(len / BLOCK);
  const p = order(n, seed);
  const lastLen = len - (n - 1) * BLOCK;
  // Startpunkte der Blöcke im gemischten Text: alle 16 lang, nur der ursprünglich letzte ist kürzer
  const lastPos = p[n - 1];
  const parts = new Array<string>(n);
  for (let i = 0; i < n; i++) {
    const at = p[i];
    const start = at * BLOCK - (at > lastPos ? BLOCK - lastLen : 0);
    parts[i] = body.slice(start, start + (i === n - 1 ? lastLen : BLOCK));
  }
  return atob(parts.join(''));
}
