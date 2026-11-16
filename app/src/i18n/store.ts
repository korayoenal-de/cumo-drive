/**
 * Gewählte Sprache synchron lesen und schreiben (vor dem ersten Import der Texte): eine kleine Datei im
 * Dokumente Ordner der App. AsyncStorage wäre zu spät, Texte in Listen am Modulanfang stünden sonst in der
 * Gerätesprache. Fehlt das Modul (Tests), gilt die Gerätesprache.
 */
type FileApi = { File: new (...a: unknown[]) => { exists: boolean; textSync(): string; create(): void; writeSync(s: string): void; delete(): void }; Paths: { document: unknown } };

let fs: FileApi | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  fs = require('expo-file-system') as FileApi;
} catch {
  fs = null;
}

const NAME = 'cumo-sprache.txt';

export function readChoice(): string | null {
  try {
    if (!fs) return null;
    const f = new fs.File(fs.Paths.document, NAME);
    return f.exists ? f.textSync().trim() || null : null;
  } catch {
    return null;
  }
}

export function writeChoice(v: string | null): void {
  try {
    if (!fs) return;
    const f = new fs.File(fs.Paths.document, NAME);
    if (!v) {
      if (f.exists) f.delete();
      return;
    }
    if (!f.exists) f.create();
    f.writeSync(v);
  } catch {
    // dann gilt beim nächsten Start die Gerätesprache
  }
}
