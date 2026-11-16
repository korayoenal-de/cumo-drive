/**
 * Start im Auto ohne iPhone (Tester 10.11.): Das Autodisplay bietet Meine Touren und eine
 * Schnelle Runde an. Hier entstehen die Einträge der Liste, und hier wird eine gewählte Tour
 * oder eine frisch geplante Runde zur aktiven Tour. Die Vorschau mit Los kommt danach wie gewohnt
 * über CarPlaySync (carPlaySetTour).
 */
import { buildTour, FRESH_MS, locate, newSeed, toPlanError, type PlanErrorKind } from '@/components/planner/create-tour';
import { setActiveTour } from '@/lib/active-tour';
import { carPlayEndPlanning, carPlayHint, type CarTourItem } from '@/lib/carplay';
import { tourFunLevel } from '@/lib/fun-score';
import { readLibrary, type SavedTour } from '@/lib/library';
import { ensureTourFun } from '@/lib/tour-fun-queue';
import { normProfile } from '@/lib/tour';
import { closedOnTour, closureLabels, planAround } from '@/lib/plan';
import { aroundHint } from '@/components/tours/closed-sheet';
import { DEFAULT_AVOID } from '@/lib/valhalla';
import { avoidSetting } from '@/lib/avoid-settings';

/** Höchstens so viele Touren im Auto (CarPlay kürzt Listen je nach Auto ohnehin) */
const MAX_TOURS = 24;

function newest(list: SavedTour[]): SavedTour[] {
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_TOURS);
}

/** Liste für das Autodisplay: Name, km und Fahrspaß, neueste zuerst */
export function carTourItems(list: SavedTour[]): CarTourItem[] {
  return newest(list).map((t) => {
    const has = t.fun != null && t.fun >= 0;
    return {
      id: t.id,
      name: t.name,
      detail: `${Math.round(t.laenge_km)} km${has ? `, Fahrspaß ${t.fun}` : ''}`,
      fun: has ? tourFunLevel(t.fun!) : 0,
    };
  });
}

/** Fahrspaß der Touren im Auto nachrechnen lassen, falls er fehlt (nur bei verbundenem CarPlay) */
export function fillCarTourFun(list: SavedTour[]) {
  for (const t of newest(list)) ensureTourFun(t);
}

/** Tour aus Meine Touren gewählt: Linie und Wegpunkte liegen schon lokal, keine Neuplanung */
export function startSavedTour(id: string) {
  const t = readLibrary().find((x) => x.id === id);
  if (!t) {
    carPlayHint('Tour nicht gefunden', 'Sie ist nicht mehr gespeichert.');
    return;
  }
  const profile = normProfile(t.profile) ?? 'kurvig';
  void startChecked(t, profile);
}

/**
 * Gerade gesperrt (Koray 16.11.): Im Auto gibt es kein Blatt zum Wählen. Führt die Tour über eine gesperrte
 * Straße, fährt die App die Umfahrung und sagt es auf dem Autodisplay; ohne Umfahrung bleibt die Tour mit Hinweis.
 */
async function startChecked(t: SavedTour, profile: ReturnType<typeof normProfile> & string) {
  const hits = await closedOnTour(t).catch(() => []);
  if (!hits.length) {
    setActiveTour(t, profile, DEFAULT_AVOID);
    return;
  }
  const label = closureLabels(hits).join('. ');
  carPlayHint('Gerade gesperrt', `${label}. Die Umfahrung wird geplant.`);
  try {
    const alt = await planAround(t, hits, profile, DEFAULT_AVOID);
    setActiveTour({ ...alt.tour, name: t.name }, profile, DEFAULT_AVOID);
    carPlayHint('Gerade gesperrt', `${label}. Wir fahren außen herum: ${aroundHint(alt, t.laenge_km)}.`);
  } catch {
    setActiveTour(t, profile, DEFAULT_AVOID);
    carPlayHint('Gerade gesperrt', `${label}. Keine Umfahrung gefunden, die Route führt dort entlang.`);
  }
}

/** Kurze Gründe fürs Autodisplay statt der langen Texte aus dem Planer */
const SHORT: Record<PlanErrorKind, string> = {
  permission: 'Der Standort ist nicht freigegeben.',
  services: 'Die Ortungsdienste sind aus.',
  position: 'Dein Standort ist gerade nicht bestimmbar.',
  network: 'Der Routenplaner ist nicht erreichbar.',
  notfound: 'Keine passende Runde gefunden.',
  routing: 'Keine passende Runde gefunden.',
  aborted: '',
};

let running: AbortController | null = null;

/** Schnelle Runde ab dem aktuellen Standort, Richtung zufällig, Profil Kurvig */
export async function planCarRound(km: number) {
  running?.abort();
  const ctrl = new AbortController();
  running = ctrl;
  try {
    const start = await locate(ctrl.signal, FRESH_MS);
    if (ctrl.signal.aborted) return;
    const tour = await buildTour(
      { start, km, direction: 'zufall', profile: 'kurvig', avoid: avoidSetting() },
      newSeed(),
      () => undefined,
      ctrl.signal,
    );
    if (ctrl.signal.aborted) return;
    setActiveTour(tour, 'kurvig', avoidSetting());
    carPlayEndPlanning('');
  } catch (e) {
    // abgebrochen (im Auto oder durch eine neue Runde): das Autodisplay weiß es schon
    if (ctrl.signal.aborted) return;
    const kind = toPlanError(e, ctrl.signal).kind;
    carPlayEndPlanning(SHORT[kind] || 'Beim Planen ist etwas schiefgegangen.');
  } finally {
    if (running === ctrl) running = null;
  }
}

export function cancelCarRound() {
  running?.abort();
  running = null;
}
