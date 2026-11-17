/**
 * Fingerabdruck eines Fehlers (Koray 17.11., Absturzberichte): gleiche Fehler sollen zusammengezählt werden, auch wenn
 * Zahlen, Kennungen oder Zeilennummern im Paket sich ändern. Reine Rechnung ohne React Native, getestet in lib.test.ts.
 */

/** Zahlen, Kennungen und Adressen aus der Meldung nehmen */
export function normalizeMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\d+(\.\d+)?/g, '<n>')
    .trim()
    .slice(0, 300);
}

/** Die ersten Funktionsnamen im Stapel, ohne Zeilen und Spalten (die ändern sich mit jedem Update) */
export function topFrames(stack: string | undefined, n = 3): string[] {
  if (!stack) return [];
  const out: string[] = [];
  for (const line of stack.split('\n')) {
    // Hermes und V8: "at name (datei:zeile:spalte)", JavaScriptCore: "name@datei:zeile:spalte"
    const m = /^\s*at\s+([^\s(]+)/.exec(line) ?? /^\s*([^@\s]+)@/.exec(line);
    if (m && m[1] !== 'anonymous' && !/^(Error|global code)$/.test(m[1])) out.push(m[1]);
    if (out.length >= n) break;
  }
  return out;
}

/** kurzer, stabiler Schlüssel (FNV 1a, 2 mal 32 Bit, hex) */
export function errorFingerprint(message: string, stack?: string): string {
  const s = normalizeMessage(message) + '|' + topFrames(stack).join('>');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
