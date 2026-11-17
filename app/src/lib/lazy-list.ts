/**
 * Liste, die ihre Daten erst beim ersten Zugriff lädt (Startprüfung 17.11., Performance Punkt 1).
 *
 * Strecken, Pässe und Empfehlungen wurden bisher beim Laden des JavaScript entpackt und aufbereitet, also bevor die
 * App das erste Bild zeigt (am Rechner rund 85 ms, auf dem iPhone mit Hermes geschätzt drei bis viermal so lang). Jetzt
 * passiert das beim ersten Zugriff auf eine der Listen oder spätestens im Vorladen nach der Startanimation
 * (lib/preload.ts). Aufrufer merken davon nichts: die Liste verhält sich wie ein normales Array.
 *
 * Umgesetzt als Proxy über dem echten Array: jeder Zugriff ruft zuerst ensure() (nach dem ersten Mal nur ein
 * Vergleich), dann geht er an das Array selbst. Methoden werden an das Array gebunden, damit Schleifen in filter, map
 * und Co. nicht noch einmal über den Proxy laufen.
 */
export function lazyList<T>(target: T[], ensure: () => void): T[] {
  return new Proxy(target, {
    get(t, key) {
      ensure();
      const v = Reflect.get(t, key) as unknown;
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
    has(t, key) {
      ensure();
      return Reflect.has(t, key);
    },
    ownKeys(t) {
      ensure();
      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, key) {
      ensure();
      return Reflect.getOwnPropertyDescriptor(t, key);
    },
    set(t, key, value) {
      ensure();
      return Reflect.set(t, key, value);
    },
  });
}
