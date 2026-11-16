/** Web: gewählte Sprache im Browser (localStorage), synchron beim Laden */
const KEY = 'cumo.sprache.v1';

export function readChoice(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeChoice(v: string | null): void {
  try {
    if (v) window.localStorage.setItem(KEY, v);
    else window.localStorage.removeItem(KEY);
  } catch {
    // ohne Speicher gilt die Browsersprache
  }
}
