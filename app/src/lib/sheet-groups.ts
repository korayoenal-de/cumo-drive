/**
 * Optionen gliedern (Konzept Koray 15.11.2026): Trennlinien zwischen Themen, wie in den Menüs von iOS,
 * ohne Flächen, ohne Überschriften, auf einer Ebene.
 *
 * Regeln:
 * - Gefährliches (danger) steht immer zuletzt, hinter einer Linie.
 * - Zwischen Themen (group) eine Linie, aber erst ab vier harmlosen Einträgen (minForLines).
 *   Inhaltslisten (Touren, Ausfahrten) setzen minForLines 1: Linie zwischen den Dingen und den Wegen.
 * - Einträge ohne group gehören zum Thema davor.
 *
 * Reine Rechnung, damit testbar.
 */
export type Groupable = { group?: string; danger?: boolean; primary?: boolean };

export function groupRows<T extends Groupable>(items: T[], minForLines = 4): { item: T; line: boolean }[] {
  const ordered = [...items.filter((i) => !i.danger), ...items.filter((i) => i.danger)];
  const harmless = ordered.filter((i) => !i.danger && !i.primary).length;
  let theme: string | undefined;
  return ordered.map((item, i) => {
    const prev = ordered[i - 1];
    let line = false;
    if (prev && item.danger && !prev.danger) line = true;
    else if (prev && !item.danger && harmless >= minForLines && item.group && theme && item.group !== theme) line = true;
    if (item.group) theme = item.group;
    return { item, line };
  });
}
