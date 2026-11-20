/**
 * Rundtour mit dem besten verfügbaren Routing.
 *
 * Valhalla baut eine Runde ohne Autobahn (Via Punkte im Hügelland), GraphHopper liefert,
 * wenn ein Schlüssel hinterlegt ist, mehrere Zufallsrunden mit Kurven, Breiten und
 * Straßenklassen. Alle Kandidaten werden mit derselben Bewertung verglichen und die beste
 * Runde gewinnt, die den Etappen Check besteht.
 *
 * Grenze heute: Keiner der beiden öffentlichen Dienste kann Kurven aktiv bevorzugen. Das
 * leistet erst ein eigener Routing Server mit Sportwagen Profil.
 */
import { HIGHLIGHT_ROADS, type HighlightRoad } from './highlight-roads';
import { findHighlights } from './navigation/highlights';
import { cumulativeKm } from './navigation/route';
import { avoidedPasses, avoidedPoints } from './avoid-pass';
import { bigCityKm, cumoAvailable, cumoPlan, cumoRoundTrips, roundTripScope } from './cumo-routing';
import { corridorBack, doubledStretch } from './doubled';
import { scoreRoute, type GhRoute } from './graphhopper';
import { PASSES, passLoopVia, TIER_WEIGHT } from './passes';
import { planChecked, type PlannedTour, type PlanStep } from './plan';
import { closureExclude, closuresNear, closuresOnRoute, prefetchClosures } from './road-closures';
import { regionScore } from './regions';
import { bearingTo, destination, DIRECTIONS, hillyVia, loopPoints, roundTrip, type Direction } from './roundtrip';
import { countCurves } from './stats';
import { flatten, haversine, type LatLon, type Profile } from './tour';
import { tourFun } from './fun-score';
import type { Avoid } from './valhalla';
import { ensureRoadArea, onRoadData } from './road-data';
import { reverseName } from './geocode';
import { tr } from '@/i18n';

export type SmartRequest = {
  name: string;
  start: LatLon;
  km: number;
  direction: Direction;
  bearing?: number;
  profile: Profile;
  avoid: Avoid;
  seed?: number;
  /** Linien der bisherigen Würfe: ähnliche Runden verlieren, damit Neu würfeln wirklich etwas Neues bringt */
  shown?: LatLon[][];
  /** intern: schon eine gedrehte Richtung, nicht noch einmal drehen */
  rotated?: boolean;
  /**
   * intern: Faktor für die Länge, mit der die Varianten geplant werden (nicht die Wunschlänge, nach der bewertet wird).
   * Bericht 17.11.: in Tälern wurden die Runden viel zu lang (Ponte di Legno 376 statt 240 km), dann einmal mit
   * angepasstem Radius nachplanen.
   */
  scale?: number;
};

export type Engine = 'cumo' | 'graphhopper' | 'valhalla';
export type SmartTour = PlannedTour & { engine: Engine; score: number; curves: number; passes?: string[] };

/** Bonus der Pass Runden (je Pass nach Stufe), damit sie in der gemeinsamen Bewertung mitzählen */
const passBonus = new WeakMap<object, number>();

/**
 * Anteil der Runde, der auf einer schon gezeigten Runde liegt (Stichprobe alle 20 Punkte, 150 m Abstand).
 * Ab 60 % gilt sie als dieselbe Runde (Koray 10.11.: Neu würfeln brachte genau dieselbe Runde).
 */
function sameAsShown(t: PlannedTour, shown: LatLon[][] | undefined): boolean {
  if (!shown?.length) return false;
  const line = flatten(t).map((x) => x.p).filter((_, i) => i % 20 === 0);
  if (!line.length) return false;
  return shown.some((old) => {
    const probe = old.filter((_, i) => i % 5 === 0);
    const hit = line.filter((p) => probe.some((q) => Math.abs(q[0] - p[0]) < 0.003 && Math.abs(q[1] - p[1]) < 0.004 && haversine(p, q) < 150)).length;
    return hit / line.length >= 0.6;
  });
}

/**
 * Bringt Neu würfeln noch eine gute Alternative? (Koray 10.11.: wenn nichts Gutes mehr kommt, ehrlich sagen
 * statt endlos weiter zu würfeln.) Keine Alternative ist eine Runde, die großteils auf einer schon gezeigten
 * liegt, oder die klar schlechter ist als eine gezeigte: Länge weit daneben, mehr als 3 km (oder 6 %)
 * Stichstraße, oder Fahrspaß mehr als 15 Punkte unter der besten gezeigten Runde.
 */
export function noGoodAlternative(t: PlannedTour, prev: PlannedTour[], km: number, fun: number | null, bestFun: number | null): boolean {
  if (!prev.length) return false;
  // fast dieselbe Runde zählt nur dann als neu, wenn sie klar besser ist (Bad Gastein: gleiche Runde,
  // aber 0,6 statt 7 km Stichstraße)
  if (sameAsShown(t, prev.map((p) => flatten(p).map((x) => x.p)))) {
    const better = spurKm(t) < Math.min(...prev.map(spurKm)) - 2 || (fun != null && bestFun != null && fun >= bestFun + 8);
    if (!better) return true;
  }
  // schlechter als schon Gezeigtes: zählt nur, wenn eine gezeigte Runde es besser konnte
  if (lengthOff(t, km) && prev.some((p) => !lengthOff(p, km))) return true;
  const spur = spurKm(t);
  if (spur > Math.max(3, km * 0.06) && spur > Math.min(...prev.map(spurKm)) + 1) return true;
  return fun != null && bestFun != null && fun < bestFun - 15;
}

/**
 * Fahrspaß der Runde 0 bis 100, wie ihn die App anzeigt (Koray und Björn 20.11.2026: Rundtour ab Lorsch, Würfe mit 20,
 * 54, 43, 65; eine 20 sollte gar nicht erst kommen). Einmal je Runde gerechnet.
 */
const funCache = new WeakMap<PlannedTour, number>();
export function funOf(t: PlannedTour): number {
  const hit = funCache.get(t);
  if (hit != null) return hit;
  const f = tourFun(flatten(t).map((x) => x.p))?.score ?? 0;
  funCache.set(t, f);
  return f;
}
/** Gewicht des Fahrspaß in der Bewertung: 10 Punkte Fahrspaß wiegen so viel wie etwa 13 Kurven je 100 km */
const FUN_WEIGHT = 4;
/**
 * Mindestschwelle für gewürfelte Runden (Koray 20.11.2026): unter 51 Fahrspaß soll keine Runde kommen, solange es eine
 * bessere gibt. Runden darunter verlieren in der Wertung deutlich, und die Suche probiert weitere Richtungen.
 */
export const FUN_FLOOR = 51;

/**
 * Gleiche Bewertung für alle Kandidaten; gesperrte km wiegen schwer. Prüfstellen (Zufahrten,
 * Spielstraßen) und kleine Straßen ohne Nummer kosten ebenfalls, damit der Ersatzweg keine
 * schmalen Schlenker wählt.
 */
function scoreTour(t: PlannedTour, curves: number, fastKm: number, targetKm: number): number {
  const ghLike: GhRoute = {
    shape: [], km: t.laenge_km, minutes: t.minutes, curvyShare: curvyShare(t), curves, narrowKm: 0, unpavedKm: 0, fastKm, seed: 0,
  };
  return scoreRoute(ghLike, targetKm) - (t.km_je_klasse?.raus ?? 0) * 40 - (t.km_je_klasse?.pruefen ?? 0) * 20 - (t.km_klein ?? 0) * 12;
}

/**
 * Zeitgrenze für die Nacharbeit an einer Runde (Koray 19.11.2026, Routen Check: Linthal 220 km plante 39 s, Bonneval
 * 270 km 29 s). Gemessen an Linthal: erste Planung 6 bis 8 s, die beiden gedrehten Richtungen weitere 20 s, das
 * Nachplanen der Länge noch einmal 10 bis 23 s, und am Ende stand trotzdem eine Rückfrage. Die erste Planung läuft
 * unverändert. Danach gilt ein gemeinsames Budget: ist es aufgebraucht, bleibt die beste bisherige Runde, und die App
 * fragt wie bisher nach, wenn Länge oder Stich nicht passen.
 */
// RT_EXTRA_MS nur für Messungen im Routen Check (Vergleich ohne Zeitgrenze)
const EXTRA_MS = +(process.env.RT_EXTRA_MS ?? 12_000);

/** Läuft höchstens ms lang; danach wird die Arbeit abgebrochen und null geliefert. Ein Abbruch von außen geht durch. */
async function budgeted<T>(ms: number, parent: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
  if (ms <= 0) return null;
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  parent?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await run(ctl.signal);
  } catch (e) {
    if (parent?.aborted) throw e;
    return null;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', onAbort);
  }
}

export function smartRoundTrip(req: SmartRequest, onStep?: (s: PlanStep) => void, signal?: AbortSignal): Promise<SmartTour> {
  // Regeln nur für Rundtouren (gesperrte Mauttunnel, cumo-routing.ts)
  return roundTripScope(() => planRoundTrip(req, onStep, signal));
}

async function planRoundTrip(req: SmartRequest, onStep?: (s: PlanStep) => void, signal?: AbortSignal): Promise<SmartTour> {
  const T0 = Date.now();
  const seed = req.seed ?? Math.floor(Math.random() * 1e6);
  const heading =
    req.bearing ?? (req.direction === 'zufall' ? seed % 360 : DIRECTIONS.find((d) => d.id === req.direction)!.bearing);
  const candidates: SmartTour[] = [];
  let lastError: unknown = null;
  // Web: Strecken und Stopps im Umkreis der Runde nachladen (kachelweise, Sicherheitskonzept 17.11.); App: sofort fertig
  await ensureRoadArea([req.start], Math.max(15, req.km / 2.5) + 10);
  // Verkehrsmeldungen im Umkreis schon jetzt holen, parallel zu den Varianten (Koray 9.11.: Rundtour zu langsam)
  {
    const r = Math.max(8, req.km * 0.32) / 111;
    const lat = req.start[0];
    const lon = req.start[1];
    const k = r / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    prefetchClosures([[lat + r, lon], [lat, lon + k], [lat - r, lon], [lat, lon - k], [lat + r, lon]]);
  }

  // Pässe Profil: gezielt über bekannte Pässe in Reichweite, die jetzt offen sind.
  // Bergstraßen sind viel länger als die Luftlinie; passt die Länge nicht, wird die Reichweite
  // nachgeregelt und neu gewählt (höchstens drei Versuche).
  // Pass Varianten bei jeder kurvigen Runde (Koray 8.11.: Pässe werden ohnehin bevorzugt, kein eigenes Profil mehr);
  // sie gewinnen nur als echte Runde, sonst treten sie gegen die normalen Runden an
  // Mit eigenem Server laufen die Pass Varianten gleichzeitig mit den freien Varianten (10.11.: bei 150 km
  // liefen sie 14 s lang nacheinander davor). Ohne eigenen Server bleibt es beim Nacheinander, dort darf
  // eine gute Pass Runde sofort gewinnen.
  const own = await cumoAvailable();
  const passPhase = async (): Promise<SmartTour | null> => {
    const month = new Date().getMonth() + 1;
    const dir = req.direction === 'zufall' && req.bearing === undefined ? null : heading;
    let reachKm = req.km * (req.scale ?? 1);
    const tried = new Set<string>();
    for (let attempt = 0; attempt < 3; attempt++) {
      // Ausgelassene Pässe (Auslassen in der Rundtour, 13.11.) kommen nicht als Ziel der Pass Runde in Frage
      const skipped = new Set(avoidedPasses().map((a) => a.id));
      const loop = passLoopVia(skipped.size ? PASSES.filter((p) => !skipped.has(p.id)) : PASSES, req.start, reachKm, dir, month, seed + attempt);
      if (!loop) break;
      const key = loop.passes.map((p) => p.id).join('+');
      if (tried.has(key)) break;
      tried.add(key);
      try {
        onStep?.('route');
        // Mit eigenem Server direkt dort planen: findet er keinen Weg (Pass im Winter gesperrt, Stresstest 10.11.),
        // fiel planChecked auf Valhalla zurück und rechnete je Pass Runde 10 bis 20 s. Sperrungen prüft später
        // die gemeinsame Bewertung der drei besten.
        const t = own
          ? await cumoPlan(req.name, [req.start, ...loop.via, req.start], req.profile, req.avoid, signal, avoidedPoints())
          : await planChecked(req.name, [req.start, ...loop.via, req.start], req.profile, req.avoid, onStep, signal, true);
        const curves = countCurves(flatten(t).map((x) => x.p));
        const bonus = loop.passes.reduce((sum, p) => sum + TIER_WEIGHT[p.tier] * 15, 0);
        // Hin und zurück auf derselben Straße zählt hart dagegen (Tester 8.11.: Runde ab Gernsheim war fast
        // ganz ein Hin und Zurück), und nur eine echte Runde darf sofort gewinnen
        const spur = spurKm(t);
        const cand: SmartTour = {
          ...t,
          engine: own ? 'cumo' : 'valhalla',
          curves,
          score: scoreTour(t, curves, 0, req.km) + bonus - spur * 100,
          passes: loop.passes.map((p) => p.name),
        };
        candidates.push(cand);
        passBonus.set(cand, bonus);
        const ratio = t.laenge_km / req.km;
        // Nur ohne eigenen Server sofort nehmen; sonst tritt die Pass Runde gegen die freien Varianten an
        // (Tester 9.11.: eine Pass Runde durch die Rheinebene gewann ungeprüft, Fahrspaß fast null)
        if (!own && (t.km_je_klasse?.raus ?? 0) === 0 && ratio > 0.7 && ratio < 1.3 && spur < Math.max(2, t.laenge_km * 0.05)) return cand;
        if (own && ratio > 0.7 && ratio < 1.3) break;
        reachKm = reachKm / Math.max(0.5, Math.min(2.5, ratio));
      } catch (e) {
        if (signal?.aborted) throw e;
        lastError = e;
        break;
      }
    }
    return null;
  };
  let passJob: Promise<SmartTour | null> | null = null;
  if (req.profile === 'kurvig' || req.profile === 'paesse') {
    if (own) {
      // Fehler hier nicht unbehandelt lassen; ein Abbruch wird unten über das Signal erkannt
      passJob = passPhase().catch(() => null);
    } else {
      const early = await passPhase();
      if (early) return early;
      const fit = candidates.filter((c) => (c.km_je_klasse?.raus ?? 0) === 0 && c.laenge_km < req.km * 1.5 && spurKm(c) < Math.max(2, c.laenge_km * 0.05));
      if (fit.length) return fit.sort((a, b) => b.score - a.score)[0];
    }
  }

  // 0. Eigener Routing Server: Sportwagen Profil mit Kurven, mehrere Varianten, alles lokal
  if (own) {
    try {
      onStep?.('route');
      // Ohne Richtung in sechs Richtungen suchen: so gewinnt das Hügelland mit Kurven statt der Weg durch die Ebene und Städte
      const free = req.direction === 'zufall' && req.bearing === undefined;
      // Runden über kuratierte Traumstrecken gleichzeitig mit den freien Varianten rechnen
      const curvy = req.profile === 'kurvig' || req.profile === 'paesse';
      const [free6, loops, circles] = await Promise.all([
        // Seeds weit auseinander, sonst überschneiden sich die Varianten zweier Würfe (seed + i) und
        // Neu würfeln bringt dieselbe Runde
        cumoRoundTrips(req.name, req.start, req.km * (req.scale ?? 1), heading, req.profile, req.avoid, free ? 6 : 5, (seed * 11) % 100000, signal, free),
        curvy ? favoriteLoops(req, free ? undefined : heading, seed, signal) : Promise.resolve([]),
        circleLoops(req, heading, free, seed, signal),
        passJob,
      ]);
      if (signal?.aborted) throw new Error('Abgebrochen');
      onStep?.('compare');
      // Erst ohne Stichstraßen bewerten: Kurven, Länge, Traumstrecken, Richtung. Die drei besten
      // bekommen die Stichstraße herausgeplant, danach zählt jeder übrige km mit 300 Punkten.
      // (Heppenheim 5.11.: eine Runde mit 11 Kurven durch Mannheim gewann gegen Runden mit 30 Kurven,
      // weil diese 0,8 km Stichstraße hatten, die sich leicht herausplanen ließ.)
      // Seit 10.11. treten die Pass Runden hier mit derselben Bewertung an (plus Pass Bonus): vorher zählte
      // ihr Hin und Zurück nur ein Drittel, und sie gewannen gegen bessere freie Runden (Bensheim, Osten:
      // 10,9 km Hin und Zurück über die Juhöhe, bei jedem Neu würfeln dieselbe Runde).
      const base = (t: PlannedTour & { curves: number }) =>
        scoreTour(t, t.curves, 0, req.km) + funOf(t) * FUN_WEIGHT - (funOf(t) < FUN_FLOOR ? 1500 : 0) + favKm(t) * 4 + regionPoints(t, req.profile === 'entspannt') + highlightBonus(t) - offCourse(t, req.start, free ? undefined : heading) - townPenalty(t) + (passBonus.get(t) ?? 0);
      const passCands = candidates.splice(0);
      const ranked = [...free6, ...loops, ...circles]
        .filter((t) => (t.km_je_klasse?.raus ?? 0) === 0)
        .map((t) => ({ ...t, engine: 'cumo' as const, score: base(t) }) as SmartTour)
        .concat(passCands.filter((t) => (t.km_je_klasse?.raus ?? 0) === 0).map((t) => ({ ...t, score: base(t) })))
        // schon gezeigte Runden nach hinten, damit Neu würfeln etwas anderes zeigt; Länge weit daneben ganz nach hinten
        // (Koray 10.11.: 200 km gewünscht, eine 68 km Pass Runde kam unter die drei besten)
        .map((t) => (sameAsShown(t, req.shown) ? { ...t, score: t.score - 400 } : t))
        .map((t) => (lengthOff(t, req.km) ? { ...t, score: t.score - 3000 } : t))
        .sort((a, b) => b.score - a.score);
      for (const t of ranked) {
        const p = passCands.find((c) => c.wegpunkte === t.wegpunkte && c.passes === t.passes);
        if (p) passBonus.set(t, passBonus.get(p) ?? 0);
      }
      const top = await Promise.all(
        ranked.slice(0, 3).map(async (t) => {
          const d = await despur(t, req, signal);
          if (d !== t) passBonus.set(d, passBonus.get(t) ?? 0);
          return d;
        }),
      );
      // Aktuelle Sperrungen auch bei der Rundtour (Tester 9.11.: Runde ab Altleiningen fuhr durch eine
      // gesperrte Strecke bei Freinsheim). Die Meldungen sind meist schon vorab geholt.
      onStep?.('traffic');
      const closures = await closuresNear(top.map((t) => flatten(t).map((x) => x.p)).flat(), signal);
      // Jede der drei besten um ihre Sperrungen herum neu planen, bevor gewertet wird (10.11.: vorher bekamen
      // sie nur 1000 Strafpunkte je Sperrung, umgeplant wurde erst der Sieger; so verloren gute Runden gegen
      // schlechte, die zufällig keine Sperrung trafen)
      const fixed = await Promise.all(
        top.map(async (t) => {
          const hits = closures.length ? closuresOnRoute(flatten(t).map((x) => x.p), closures) : [];
          if (!hits.length) return { t, hits: 0 };
          onStep?.('fix');
          try {
            const ex = closureExclude(hits, t.wegpunkte);
            // Runden vom Server haben nur Start und Ziel als Wegpunkte (beide am Start). Mit ihnen allein
            // neu gerechnet entsteht eine Runde von 0 km (Koray 10.11.: 56 statt 200 km). Dann Stützpunkte
            // entlang der Runde nehmen, abseits der Sperrungen.
            // Auch vorhandene Stützpunkte (alle 7 km nach despur) können auf der gesperrten Straße liegen und
            // zwingen die Route dann wieder hindurch: solche weglassen; bleiben zu wenige, neu entlang der Runde
            const closedAt = hits.flatMap((h) => h.points.filter((_, i) => i % 4 === 0));
            const kept = t.wegpunkte.filter((w, i) => i === 0 || i === t.wegpunkte.length - 1 || !closedAt.some((q) => haversine(q, w) < 1500));
            const pts = kept.length > 2 ? kept : viaAlong(t, req.start, closedAt);
            if (pts.length < 3) return { t, hits: uniqueHits(hits) };
            let again = await cumoPlan(req.name, pts, req.profile, req.avoid, signal, ex);
            // Liegt ein Stützpunkt vor der Sperrung, fährt die Umplanung bis zu ihm hinein und auf demselben Weg
            // zurück (Koray 16.11.: 1,4 km Stich bei Jugenheim, Stützpunkt 1,9 km vor der Sperrung der K 144).
            // despur lief schon vorher, also hier noch einmal: Stützpunkte am Stich weglassen und neu rechnen.
            // Höchstens zweimal (Jugenheim: 3,0 km Stich, nach dem ersten Mal 0,28 km bei Michelstadt)
            let use = pts;
            for (let round = 0; round < 2; round++) {
              const spur = spurOf(again);
              if (spur.km < 0.2 || use.length <= 3) break;
              const near = (w: LatLon) => spur.points.some((q) => haversine(q, w) < 3000);
              const fewer = use.filter((w, i) => i === 0 || i === use.length - 1 || !near(w));
              if (fewer.length >= use.length || fewer.length <= 2) break;
              const tryIt = await cumoPlan(req.name, fewer, req.profile, req.avoid, signal, ex).catch((e) => {
                if (signal?.aborted) throw e;
                return null;
              });
              if (!tryIt || spurKm(tryIt) >= spur.km - 0.1 || tryIt.laenge_km < t.laenge_km * 0.8) break;
              again = tryIt;
              use = fewer;
            }
            const leftHits = closuresOnRoute(flatten(again).map((x) => x.p), closures);
            const left = uniqueHits(leftHits);
            // nur nehmen, wenn die Runde ihre Länge behält, gemessen auch am Wunsch (Koray 16.11.: 100 km ab Corvara
            // wurden um das gesperrte Pordoijoch 142 km). Länge geht vor: sonst bleibt die Runde mit Sperrung, und
            // beim Losfahren kommt das Gesperrt Blatt mit der Umfahrung.
            const keepsLength =
              again.laenge_km >= t.laenge_km * 0.8 && again.laenge_km <= t.laenge_km * 1.3 + 5 && again.laenge_km <= req.km * 1.3 + 5;
            if (left < uniqueHits(hits) && keepsLength && (again.km_je_klasse?.raus ?? 0) === 0) {
              const n: SmartTour = { ...t, ...again, engine: 'cumo', curves: again.curves, score: t.score };
              passBonus.set(n, passBonus.get(t) ?? 0);
              return { t: n, hits: left };
            }
          } catch (e) {
            if (signal?.aborted) throw e;
          }
          return { t, hits: uniqueHits(hits) };
        }),
      );
      for (const { t, hits } of fixed) {
        const seen = sameAsShown(t, req.shown) ? 400 : 0;
        // Länge weit daneben verliert immer gegen eine passende Runde
        const off = lengthOff(t, req.km) ? 3000 : 0;
        candidates.push({ ...t, score: base(t) - spurKm(t) * 300 - hits * 1000 - seen - off });
      }
      // Entartete Runden (unter 35 % der Länge) nie nehmen, solange es etwas anderes gibt
      const real = candidates.filter((t) => t.laenge_km >= req.km * 0.35);
      const pool = real.length ? real : candidates;
      pool.sort((a, b) => b.score - a.score);
      const best = pool[0];
      // Stresstest 10.11.: in Alpentälern (Chur nach Westen, Brig nach Osten, Sölden) führt die gewählte
      // Richtung oft in ein Tal ohne Ausgang, Pässe im Winter zu. Dann zusätzlich 60 Grad links und rechts
      // davon probieren; genommen wird eine gedrehte Runde nur, wenn sie trotz Abweichung klar besser ist.
      if (process.env.DEBUG_RT && !req.rotated && !req.scale) console.log('zeit basis', Date.now() - T0, 'ms', best ? `${best.laenge_km.toFixed(0)} km spur ${spurKm(best).toFixed(1)}` : 'nichts');
      // ab hier Nacharbeit mit Zeitgrenze (EXTRA_MS)
      const deadline = Date.now() + EXTRA_MS;
      const left = () => deadline - Date.now();
      // Stresstest 10.11.: in Alpentälern (Chur nach Westen, Brig nach Osten, Sölden) führt die gewählte
      // Richtung oft in ein Tal ohne Ausgang, Pässe im Winter zu. Dann zusätzlich 60 Grad links und rechts
      // davon probieren; genommen wird eine gedrehte Runde nur, wenn sie trotz Abweichung klar besser ist.
      const rotate = async (): Promise<SmartTour | undefined> => {
        if (!best || req.rotated || spurKm(best) <= Math.max(3, req.km * 0.06) || left() < 3000) return undefined;
        onStep?.('compare');
        const alt =
          (await budgeted(left(), signal, (sig) =>
            Promise.all(
              [-60, 60].map((d) =>
                smartRoundTrip({ ...req, bearing: (heading + d + 360) % 360, rotated: true, seed: seed + (d > 0 ? 17 : 29) }, undefined, sig).catch((e) => {
                  if (signal?.aborted) throw e;
                  return null;
                }),
              ),
            ),
          )) ?? [];
        const better = alt
          .filter((t): t is SmartTour => !!t && t.laenge_km >= req.km * 0.35 && spurKm(t) < spurKm(best) - 2)
          .map((t) => ({ ...t, score: t.score - 250 }))
          .sort((a, b) => b.score - a.score)[0];
        if (process.env.DEBUG_RT) console.log('zeit gedreht', Date.now() - T0, 'ms', alt.map((t) => (t ? `${t.laenge_km.toFixed(0)} km spur ${spurKm(t).toFixed(1)}` : 'nichts')).join(' | ') || 'Zeit um');
        return better && better.score > best.score ? better : undefined;
      };
      // Länge weit neben dem Wunsch: mit angepasstem Radius nachplanen, höchstens zweimal (Bericht 17.11.: Ponte di
      // Legno 376 statt 240 km, Lienz 222 statt 110 km; Andraz sprang beim ersten Mal von 107 auf 233 km)
      const needLength = !!best && !lengthFits(best.laenge_km, req.km) && !req.rotated && !req.scale;
      const fixLength = async (): Promise<SmartTour | undefined> => {
        if (!best || !needLength) return undefined;
        // Länge und doppelte km zusammen: 50 % daneben wiegt so viel wie 10 km doppelt (Ponte di Legno: 376 km mit 1,6 km
        // doppelt gegen 242 km mit 2,9 km doppelt, die zweite ist klar besser)
        const cost = (t: PlannedTour) => (Math.abs(t.laenge_km - req.km) / req.km) * 20 + spurKm(t);
        let pick: SmartTour = best;
        let f = 1;
        let got = best.laenge_km;
        const tried: { f: number; km: number }[] = [{ f: 1, km: got }];
        for (let step = 0; step < 3 && !lengthFits(got, req.km); step++) {
          // dritter Versuch nur zwischen einem zu kurzen und einem zu langen Ergebnis (Bericht 17.11.: Lugano 43 und 126 km)
          const lo = tried.filter((x) => x.km < req.km).sort((x, y) => y.km - x.km || y.f - x.f)[0];
          const hi = tried.filter((x) => x.km > req.km).sort((x, y) => x.km - y.km || x.f - y.f)[0];
          if (step === 2 && !(lo && hi)) break;
          // Budget fast aufgebraucht: kein neuer Versuch mehr, die bisher beste Runde bleibt
          if (left() < 1500) break;
          // gedämpft: die Länge folgt dem Radius nicht linear (Lugano sprang sonst von 125 auf 53 km)
          // in der Plakette oben sichtbar, warum es länger dauert (Koray 17.11.)
          onStep?.(got < req.km ? 'longer' : 'shorter');
          f =
            step === 2 && lo && hi
              ? lo.f + ((hi.f - lo.f) * (req.km - lo.km)) / (hi.km - lo.km)
              : Math.max(0.4, Math.min(2, f * Math.pow(req.km / got, 0.8)));
          const again = await budgeted(left(), signal, (sig) => smartRoundTrip({ ...req, scale: f, rotated: true, seed: seed + 41 + step }, undefined, sig));
          if (process.env.DEBUG_RT) console.log('zeit laenge', Date.now() - T0, 'ms', again ? `f ${f.toFixed(2)} ${again.laenge_km.toFixed(0)} km spur ${spurKm(again).toFixed(1)}` : 'nichts oder Zeit um');
          if (!again) break;
          got = again.laenge_km;
          tried.push({ f, km: got });
          // nur nehmen, was die Wunschlänge trifft; sonst bleibt die erste Runde und die App fragt nach (Lugano)
          // Passt die bisherige gar nicht, gewinnt die passende, solange sie kaum mehr doppelt fährt (Bericht 17.11.: Andraz
          // 222 km bei 170 gewünscht blieb liegen, weil 107 km nach der Kostenrechnung fast gleich gut waren)
          const fitsNow = lengthFits(got, req.km);
          if (fitsNow && ((!lengthFits(pick.laenge_km, req.km) && spurKm(again) <= spurKm(pick) + 2) || cost(again) < cost(pick) - 1)) pick = again;
        }
        return pick !== best ? pick : undefined;
      };
      // Reihenfolge nach Bedarf (19.11.): stimmt die Länge nicht, zuerst die Länge, weil das Budget selten für beides
      // reicht (Linthal: die gedrehten Richtungen brauchten 20 s und brachten nichts, die Länge 10 s und half)
      const reworked = needLength ? ((await fixLength()) ?? (await rotate())) : await rotate();
      if (reworked) return reworked;
      // Unter der Schwelle (Koray 20.11.: Lorsch nach Südosten in die Rheinebene, Fahrspaß 18): bei zufälliger Richtung
      // die beiden anderen Drittel des Kreises probieren, bei gewählter Richtung 60 Grad links und rechts davon.
      // Genommen wird die Runde mit klar mehr Fahrspaß; erreicht keine die Schwelle, bleibt die beste.
      const anyHeading = req.direction === 'zufall' && req.bearing === undefined;
      if (best && !req.rotated && funOf(best) < FUN_FLOOR && left() > 3000) {
        onStep?.('compare');
        const alt =
          (await budgeted(left(), signal, (sig) =>
            Promise.all(
              (anyHeading ? [120, 240] : [-60, 60]).map((d) =>
                smartRoundTrip({ ...req, bearing: (heading + d + 360) % 360, rotated: true, seed: seed + d + 3 }, undefined, sig).catch((e) => {
                  if (signal?.aborted) throw e;
                  return null;
                }),
              ),
            ),
          )) ?? [];
        const better = alt
          .filter((t): t is SmartTour => !!t && lengthFits(t.laenge_km, req.km) && spurKm(t) <= Math.max(3, spurKm(best) + 1))
          .sort((a, b) => funOf(b) - funOf(a))[0];
        if (better && funOf(better) >= funOf(best) + 10) return better;
      }
      if (best) return best;
      // Nichts in dieser Richtung (Mayrhofen nach Süden: Talende, nur Hochgebirge): erst drei andere Richtungen
      // mit dem eigenen Server, bevor der langsame Ersatzweg rechnet (Stresstest 10.11.: 78 bis 97 s über Valhalla)
      if (!req.rotated) {
        onStep?.('route');
        const alt = await Promise.all(
          [-90, 90, 180].map((d) =>
            smartRoundTrip({ ...req, bearing: (heading + d + 360) % 360, rotated: true, seed: seed + d }, undefined, signal).catch((e) => {
              if (signal?.aborted) throw e;
              return null;
            }),
          ),
        );
        const any = alt.filter((t): t is SmartTour => !!t && t.laenge_km >= req.km * 0.35).sort((a, b) => b.score - a.score)[0];
        if (any) return any;
      }
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }

  // die Pass Varianten sind auch dann fertig, wenn der Block oben mit einem Fehler endete
  if (passJob) await passJob;

  // Gedrehte Richtung (siehe oben) nur mit dem eigenen Server: der Ersatzweg über Valhalla kostete in Alpentälern
  // bis zu 40 s und gewann dann mit einer kurzen, wenig kurvigen Runde (Stresstest 10.11.: Sölden 33,8 km)
  if (req.rotated) throw lastError ?? new Error('Keine Runde in dieser Richtung.');

  // 1. Valhalla: ohne Autobahn, Via Punkte im Hügelland, geprüft und umgeplant. Bleibt eine
  // Stichstraße über 1 km, die nicht an einem Via Punkt hängt, eine zweite Runde mit anderem Seed.
  // In den Alpen enden viele Täler als Sackgasse (Tegernsee 8.11.: 40 km Hin und Zurück): dann bis zu vier Würfe
  let bestSpur = Infinity;
  // Bei Zufall drehen die Würfe drei und vier die Richtung, raus aus dem Tal in eine andere Gegend
  const anyDir = req.direction === 'zufall' && req.bearing === undefined;
  const turn = (attempt: number) => (anyDir && attempt >= 2 ? (heading + (attempt === 2 ? 120 : 240)) % 360 : heading);
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt >= 2 && bestSpur < 3) break;
    onStep?.('route');
    try {
      const r = await roundTrip(
        { start: req.start, km: req.km * (req.scale ?? 1), direction: req.direction, bearing: turn(attempt), profile: req.profile, avoid: req.avoid, seed: seed + attempt * 7919 },
        signal,
      );
      const t = await despurVias(req, r.via, onStep, signal);
      const curves = countCurves(flatten(t).map((x) => x.p));
      const spur = spurKm(t);
      candidates.push({ ...t, engine: 'valhalla', curves, score: scoreTour(t, curves, 0, req.km) - spur * 100 });
      bestSpur = Math.min(bestSpur, spur);
      if (spur < 1) break;
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
      break;
    }
  }

  if (!candidates.length) throw lastError ?? new Error('Keine Rundtour gefunden.');
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

/**
 * Doppelt gefahrene km auf kurzen Stücken: Stichstraßen und kleine Schleifen durch Ortschaften.
 * Rund um den Start zählt nicht, Hin und Rückweg von zu Hause lassen sich nicht vermeiden.
 */
function spurOf(t: PlannedTour) {
  const line = flatten(t).map((x) => x.p);
  // 40 m Toleranz: Bundesstraßen mit getrennten Fahrbahnen liegen hin und zurück 20 bis 30 m auseinander
  // (Stichstraße bei Traisa am 5.11. wurde mit 20 m nicht erkannt)
  const d = doubledStretch(line, 300, 40);
  const home = line[0];
  const points = d.points.filter((q) => haversine(q, home) > 1500);
  const km = d.points.length ? (d.km * points.length) / d.points.length : 0;
  // dazu Hin und Zurück auf zwei Straßen im selben Tal (Bericht 17.11.: Spittal, Liesertal mit A10 und B99)
  const c = corridorBack(line);
  // hier 5 km um zu Hause frei: aus Städten im Tal (Bozen) geht es hin und zurück zwangsläufig auf Parallelstraßen
  const cPoints = c.points.filter((q) => haversine(q, home) > 5000);
  const cKm = c.points.length ? (c.km * cPoints.length) / c.points.length : 0;
  return { km: km + cKm, points: [...points, ...cPoints] };
}
export function spurKm(t: PlannedTour): number {
  return spurOf(t).km;
}

/** Stützpunkte einer Stichstraße in Gruppen teilen: je Stichstraße eine Gruppe, in Fahrtrichtung. */
function spurGroups(points: LatLon[]): LatLon[][] {
  const groups: LatLon[][] = [];
  for (const p of points) {
    const g = groups[groups.length - 1];
    if (g && haversine(g[g.length - 1], p) < 1000) g.push(p);
    else groups.push([p]);
  }
  return groups;
}

/**
 * Ersatzweg ohne eigenen Server: Liegt ein Via Punkt in einer Seitenstraße, fährt die Route dort
 * hinein und auf demselben Weg wieder heraus (Stichstraße). Die doppelten Stützpunkte liegen auf
 * dem Rückweg, der letzte jeder Gruppe also an der Abzweigung. Den Via Punkt, der die Stichstraße
 * erzeugt, dorthin verschieben: die Runde behält ihre Form, fährt aber nicht mehr hinein.
 * Parallel wird der Punkt ganz weggelassen; genommen wird, was weniger doppelt fährt und
 * nicht unter 60 % der Länge fällt (Bensheim 5.11.: Weglassen allein machte 63 zu 21 km).
 * Höchstens dreimal, solange es besser wird.
 */
async function despurVias(req: SmartRequest, via: LatLon[], onStep?: (s: PlanStep) => void, signal?: AbortSignal): Promise<PlannedTour> {
  let v = [...via];
  let t = await planChecked(req.name, [req.start, ...v, req.start], req.profile, req.avoid, onStep, signal, true);
  for (let round = 0; round < 3; round++) {
    const spur = spurOf(t);
    if (spur.km < 0.2) break;
    const moved = [...v];
    const hit = new Set<number>();
    for (const g of spurGroups(spur.points)) {
      // Via Punkt mit dem kleinsten Abstand zur Stichstraße, höchstens 3 km
      let k = -1;
      let best = 3000;
      v.forEach((q, i) => {
        const d = Math.min(...g.map((p) => haversine(q, p)));
        if (d < best) {
          best = d;
          k = i;
        }
      });
      if (k < 0) continue;
      moved[k] = g[g.length - 1];
      hit.add(k);
    }
    if (!hit.size) break;
    // Zwei Wege probieren: Punkt an die Abzweigung schieben, oder ganz weglassen. Liegt der Punkt
    // schon an der Abzweigung, wendet die Route trotzdem dahinter; dann hilft nur Weglassen.
    const dropped = v.filter((_, i) => !hit.has(i));
    const tries = dropped.length ? [moved, dropped] : [moved];
    const results = await Promise.all(
      tries.map((w) => planChecked(req.name, [req.start, ...w, req.start], req.profile, req.avoid, onStep, signal, true).catch((e) => {
        if (signal?.aborted) throw e;
        return null;
      })),
    );
    // Weniger doppelt ist besser, aber eine Runde, die viel zu kurz wird, auch nicht
    const cost = (r: PlannedTour) => spurKm(r) * 4 + (Math.abs(r.laenge_km - req.km) / req.km) * 10;
    let pick = -1;
    let pickCost = Infinity;
    results.forEach((r, i) => {
      if (!r || r.laenge_km < t.laenge_km * 0.6 || spurKm(r) >= spur.km - 0.1) return;
      if (cost(r) < pickCost) {
        pickCost = cost(r);
        pick = i;
      }
    });
    if (pick < 0) break;
    t = results[pick]!;
    v = tries[pick];
  }
  return t;
}

/**
 * Bleibt im Sieger eine Stichstraße, die Tour ohne sie neu rechnen: Stützpunkte etwa alle 7 km
 * entlang der Strecke, aber keiner in der Nähe der Stichstraße. Übernommen, wenn die Stichstraße
 * weg ist und die Tour nicht viel länger wird.
 */
/**
 * Anteil der Strecke, der sich windet: je Kilometer die Summe der Richtungswechsel, ab 45 Grad zählt
 * der Kilometer als kurvig. Lange gerade Stücke durch die Ebene (Heppenheim 5.11.: 44 km durch die
 * Rheinebene) drücken den Anteil und damit die Bewertung (scoreRoute: Anteil mal 40).
 */
function curvyShare(t: PlannedTour): number {
  const f = flatten(t);
  let chunks = 0;
  let curvy = 0;
  let turn = 0;
  let from = 0;
  let prev: number | null = null;
  let last = f[0];
  for (const x of f) {
    if (haversine(last.p, x.p) < 60) continue;
    const b = bearing(last.p, x.p);
    if (prev !== null) turn += Math.abs(((b - prev + 540) % 360) - 180);
    prev = b;
    last = x;
    if (x.km - from >= 1) {
      chunks++;
      if (turn >= 45) curvy++;
      turn = 0;
      from = x.km;
    }
  }
  return chunks ? curvy / chunks : 0;
}

/**
 * Abzug, wenn die Runde nicht in die gewählte Richtung fährt: Schwerpunkt der Strecke mehr als
 * 40 Grad neben der Richtung kostet 3 Punkte je Grad (Osten gewählt, Runde durch Mannheim im Westen).
 */
function offCourse(t: PlannedTour, start: LatLon, heading: number | undefined): number {
  if (heading === undefined) return 0;
  const f = flatten(t);
  const line = f.map((x) => x.p);
  const c: LatLon = [line.reduce((a, q) => a + q[0], 0) / line.length, line.reduce((a, q) => a + q[1], 0) / line.length];
  const centre = haversine(start, c) < 2000 ? 0 : Math.max(0, Math.abs(((bearing(start, c) - heading + 540) % 360) - 180) - 40) * 3;
  // Dazu jedes Stück hinter dem Start (mehr als 110 Grad neben der Richtung, weiter als 6 km weg): 4 Punkte je km.
  // Der Schwerpunkt allein merkte einen Schlenker auf die Gegenseite kaum (Koray 10.11.: Osten gewählt, Runde
  // westlich um Mannheim herum).
  let behind = 0;
  for (let i = 1; i < f.length; i++) {
    const p = f[i].p;
    if (haversine(start, p) < 6000) continue;
    if (Math.abs(((bearing(start, p) - heading + 540) % 360) - 180) > 110) behind += f[i].km - f[i - 1].km;
  }
  return centre + behind * 4;
}

/**
 * Abzug für Großstadt und bebaute Gebiete (Koray 10.11.: in der Nähe von Großstädten ist meistens keine gute
 * Route): je km in einer Großstadt Zone 8 Punkte (Liste BIG_CITIES, Städte mit Wegpunkt ausgenommen),
 * je km Großstadt laut Server 10, je km bebaut laut Server 2. Ergebnis je Tour gemerkt.
 */
/** Punkte für km in Fahrregionen (Koray 10.11.), je Tour gemerkt */
const regionMemo = new WeakMap<object, number>();
function regionPoints(t: PlannedTour, relaxed: boolean): number {
  const known = regionMemo.get(t.linie);
  if (known !== undefined) return known;
  const v = regionScore(flatten(t).map((x) => x.p), relaxed);
  regionMemo.set(t.linie, v);
  return v;
}

const townMemo = new WeakMap<object, number>();
function townPenalty(t: PlannedTour): number {
  const known = townMemo.get(t.linie);
  if (known !== undefined) return known;
  const v = bigCityKm(flatten(t).map((x) => x.p), [t.wegpunkte[0]]) * 8 + (t.stadtKm ?? 0) * 10 + (t.bebautKm ?? 0) * 2;
  townMemo.set(t.linie, v);
  return v;
}

/**
 * Runden über einen Kreis in die gewählte Richtung, wie beim Ersatzweg: Via Punkte auf dem Kreis,
 * ins Hügelland geschoben, dann über den eigenen Server. Die Rundtouren von GraphHopper kennen nur
 * die Richtung des ersten Stücks und laufen sonst oft in die Ebene (Heppenheim 5.11.: Osten
 * gewählt, Runde durch Mannheim). Ohne Richtung zwei gegenüberliegende Kreise.
 */
async function circleLoops(req: SmartRequest, heading: number, free: boolean, seed: number, signal?: AbortSignal) {
  // Kurvige Straßen sind etwa 1,45 mal so lang wie der Kreis
  const circ = (req.km * (req.scale ?? 1)) / 1.45;
  const out = await Promise.all(
    [0, 1].map(async (k) => {
      try {
        const base = loopPoints(req.start, circ, free ? (heading + k * 180) % 360 : heading, seed * 13 + k);
        const hilly = await hillyVia(base, Math.max(2, (circ / (2 * Math.PI)) * 0.35), req.profile, signal).catch((e) => {
          if (signal?.aborted) throw e;
          return base;
        });
        const via = k === 0 ? snapToHighlights(hilly, req.start) : hilly;
        const t = await cumoPlan(req.name, [req.start, ...via, req.start], req.profile, req.avoid, signal);
        const ratio = t.laenge_km / req.km;
        return ratio > 0.6 && ratio < 1.5 && (t.km_je_klasse?.raus ?? 0) === 0 ? t : null;
      } catch (e) {
        if (signal?.aborted) throw e;
        return null;
      }
    }),
  );
  return out.filter((t): t is NonNullable<typeof t> => t != null);
}

/**
 * Bonus für Highlights, die ganz gefahren werden (wie in der Liste unter der Route): Pegel mal 6,
 * eine Legende also 30 Punkte. Teilstücke zählen nur über favKm.
 */
function highlightBonus(t: PlannedTour): number {
  const line = flatten(t).map((x) => x.p);
  if (line.length < 2) return 0;
  return findHighlights(line, cumulativeKm(line), null).reduce((sum, h) => sum + h.level * 6, 0);
}

/**
 * Via Punkte auf Traumstrecken legen: Liegt eine bis 5 km neben dem Punkt, wird er durch zwei
 * Punkte auf ihr ersetzt (bei einem und drei Vierteln, in Fahrtrichtung der Runde), jede Strecke
 * höchstens einmal. Ein Punkt in der Mitte reicht nicht, dann biegt die Route oft vorher ab, und der
 * Bereich um die Traumstrecken allein zieht zu schwach (Heppenheim 5.11.: Weschnitztal statt
 * Zotzenbach). Stichstraßen an den Enden plant despur heraus.
 */
function snapToHighlights(via: LatLon[], start: LatLon): LatLon[] {
  const used = new Set<string>();
  const out: LatLon[] = [];
  let prev = start;
  for (const v of via) {
    let best: { r: HighlightRoad; d: number } | null = null;
    for (const r of HIGHLIGHT_ROADS) {
      if (used.has(r.id) || r.line.length < 4) continue;
      const d = Math.min(...r.line.map((q) => haversine(v, q)));
      if (d < 5000 && (!best || d < best.d)) best = { r, d };
    }
    const line = best?.r.line;
    if (!best || !line || Math.min(...line.map((q) => haversine(q, start))) < 2000) {
      out.push(v);
      prev = v;
      continue;
    }
    used.add(best.r.id);
    const a = line[Math.round((line.length - 1) * 0.25)];
    const b = line[Math.round((line.length - 1) * 0.75)];
    // das Ende zuerst, das näher am vorigen Punkt liegt
    const pair = haversine(prev, a) <= haversine(prev, b) ? [a, b] : [b, a];
    out.push(...pair);
    prev = pair[1];
  }
  return out;
}

/** Länge weit neben dem Wunsch (unter 60 % oder über 160 %) */
function lengthOff(t: PlannedTour, km: number): boolean {
  const r = t.laenge_km / km;
  return r < 0.6 || r > 1.6;
}

/**
 * Sperrungen zählen je Stelle, nicht je Meldung: TomTom meldet jede Sperrung einmal je Fahrtrichtung, und
 * lange Sperrungen in Abschnitten (Bensheim 10.11.: 12 Meldungen auf 6 Stellen). Treffer, deren Stücke
 * weniger als 300 m auseinander liegen, sind eine Stelle.
 */
function uniqueHits(hits: { points: LatLon[] }[]): number {
  const sites: LatLon[][] = [];
  for (const h of hits) {
    const near = sites.find((s) => s.some((q) => h.points.some((p) => haversine(p, q) < 300)));
    if (near) near.push(...h.points);
    else sites.push([...h.points]);
  }
  return sites.length;
}

/**
 * Stützpunkte entlang einer Runde, etwa alle 12 km, nicht in den letzten 3 km und nicht näher als 1,5 km
 * an den Stellen in away (Sperrungen). Für Runden, die nur Start und Ziel als Wegpunkte haben.
 */
function viaAlong(t: PlannedTour, start: LatLon, away: LatLon[]): LatLon[] {
  const line = flatten(t);
  const via: LatLon[] = [];
  let last = 0;
  for (const x of line) {
    if (x.km - last < 12 || x.km > t.laenge_km - 3) continue;
    if (away.some((q) => haversine(q, x.p) < 1500)) continue;
    via.push(x.p);
    last = x.km;
  }
  return [start, ...via, start];
}

async function despur(t: SmartTour, req: SmartRequest, signal?: AbortSignal): Promise<SmartTour> {
  let cur: SmartTour = t;
  // Erst Stützpunkte nur direkt am Stich weglassen; bleibt er (Bericht 17.11.: Cortina 3,3 km bei Agordo, Prad 2,9 km),
  // liegen weitere Stützpunkte im selben Seitental und zwingen die Runde hinein: dann im Umkreis von 2,5 km weglassen.
  for (const radius of [600, 2500]) {
    const spur = spurOf(cur);
    if (spur.km < 0.2) break;
    const line = flatten(cur);
    const via: LatLon[] = [];
    let last = 0;
    for (const x of line) {
      if (x.km - last < 7 || x.km > cur.laenge_km - 3) continue;
      if (spur.points.some((q) => haversine(q, x.p) < radius)) continue;
      via.push(x.p);
      last = x.km;
    }
    try {
      const r = await cumoPlan(req.name, [req.start, ...via, req.start], req.profile, req.avoid, signal);
      if (process.env.DEBUG_RT) console.log('despur', radius, cur.laenge_km.toFixed(1), spur.km.toFixed(2), '->', r.laenge_km.toFixed(1), spurKm(r).toFixed(2), 'vias', via.length);
      // Liegt fast die ganze Runde auf der Stichstraße (Tal ohne Ausgang), bleiben kaum Stützpunkte und die
      // neue Runde schrumpft auf wenige km (Stresstest 10.11.: Bad Gastein 0 km, Chur 4,5 km). Länge halten,
      // gemessen an der ursprünglichen Runde.
      if (spurKm(r) < spur.km - 0.1 && r.laenge_km >= t.laenge_km * 0.75 && r.laenge_km <= t.laenge_km * 1.25 + 3 && (r.km_je_klasse?.raus ?? 0) === 0) {
        cur = { ...t, ...r, engine: 'cumo', curves: r.curves, score: t.score };
      }
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  return cur;
}

/**
 * Raster der Stützpunkte aller Traumstrecken (Zellen etwa 220 m), einmal aufgebaut. Vorher verglich favKm
 * jeden Punkt der Tour mit jedem Punkt jeder Strecke in der Nähe: bei einer 150 km Rundtour mit 14 Varianten
 * waren das über 1,5 s Rechenzeit am Rechner, auf dem Handy ein Mehrfaches (Messung 10.11.).
 */
const FAV_CELL = 0.002;
let favGrid: Map<string, LatLon[]> | null = null;
// Neu aufbauen, sobald die Daten (im Web nach der Anmeldung) da sind
onRoadData(() => {
  favGrid = null;
});
function nearFavPoint(p: LatLon): boolean {
  if (!favGrid) {
    favGrid = new Map();
    for (const r of HIGHLIGHT_ROADS) for (const q of r.line) {
      const k = `${Math.floor(q[0] / FAV_CELL)},${Math.floor(q[1] / FAV_CELL)}`;
      const list = favGrid.get(k);
      if (list) list.push(q);
      else favGrid.set(k, [q]);
    }
  }
  const cy = Math.floor(p[0] / FAV_CELL);
  const cx = Math.floor(p[1] / FAV_CELL);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const list = favGrid.get(`${cy + dy},${cx + dx}`);
      if (list) for (const q of list) if (haversine(q, p) < 120) return true;
    }
  return false;
}

/** km der Tour auf kuratierten Traumstrecken (Ergebnis je Tour gemerkt, es wird mehrfach gebraucht) */
const favKmMemo = new WeakMap<object, number>();
function favKm(t: PlannedTour): number {
  const known = favKmMemo.get(t.linie);
  if (known !== undefined) return known;
  const line = flatten(t);
  let km = 0;
  for (let i = 1; i < line.length; i++) if (nearFavPoint(line[i].p)) km += line[i].km - line[i - 1].km;
  favKmMemo.set(t.linie, km);
  return km;
}

function bearing(a: LatLon, b: LatLon) {
  const k = Math.cos((a[0] * Math.PI) / 180);
  return ((Math.atan2((b[1] - a[1]) * k, b[0] - a[0]) * 180) / Math.PI + 360) % 360;
}

/**
 * Runden über Traumstrecken: bis zu drei kuratierte Strecken in Reichweite, je eine Runde
 * Start, Anfang der Strecke, Ende der Strecke, zurück. Passt die Länge nicht, kommt eine zweite
 * Strecke dazu. Mit Richtung nur Strecken grob in dieser Richtung.
 */
async function favoriteLoops(req: SmartRequest, heading: number | undefined, seed: number, signal?: AbortSignal) {
  const dist = (r: HighlightRoad) => Math.min(...r.line.map((q) => haversine(req.start, q))) / 1000;
  const inDir = (r: HighlightRoad) => {
    if (heading === undefined) return true;
    const mid = r.line[Math.floor(r.line.length / 2)];
    const d = Math.abs(((bearing(req.start, mid) - heading + 540) % 360) - 180);
    return d < 70;
  };
  const reach = req.km * (req.scale ?? 1) * 0.4;
  const near = HIGHLIGHT_ROADS.filter((r) => r.line.length > 1 && dist(r) < reach && inDir(r)).sort((a, b) => dist(a) - dist(b)).slice(0, 6);
  // Neu würfeln soll andere Strecken bringen: Reihenfolge je Seed verschieben
  // jeder dritte Wurf ganz ohne feste Traumstrecke, dann entscheiden die freien Varianten
  if (seed % 3 === 2) return [];
  const shift = near.length ? Math.floor(seed / 2) % near.length : 0;
  const roads = [...near.slice(shift), ...near.slice(0, shift)];
  const plans: LatLon[][] = [];
  for (const r of roads.slice(0, 2)) {
    // nicht genau die Enden: die liegen oft an Abzweigen oder Ortsrändern, dort entstehen Stichstraßen
    const a = r.line[Math.min(r.line.length - 1, Math.max(1, Math.round(r.line.length * 0.1)))];
    const b = r.line[Math.max(0, Math.min(r.line.length - 2, Math.round(r.line.length * 0.9)))];
    // je Seed andersherum fahren, damit Neu würfeln auch hier Abwechslung bringt
    const near1 = haversine(req.start, a) <= haversine(req.start, b);
    const [p, q] = near1 !== (seed % 2 === 1) ? [a, b] : [b, a];
    plans.push([req.start, p, q, req.start]);
    // Zweite Strecke anhängen, falls eine weitere in der Nähe des Endes liegt
    const next = roads.find((o) => o !== r && Math.min(...o.line.map((x) => haversine(q, x))) < reach * 500);
    if (next) {
      const c = next.line[Math.min(next.line.length - 1, Math.max(1, Math.round(next.line.length * 0.1)))];
      const d = next.line[Math.max(0, Math.min(next.line.length - 2, Math.round(next.line.length * 0.9)))];
      const [m, n] = haversine(q, c) <= haversine(q, d) ? [c, d] : [d, c];
      plans.push([req.start, p, q, m, n, req.start]);
    }
  }
  const out = await Promise.all(
    plans.slice(0, 3).map(async (pts) => {
      try {
        const t = await cumoPlan(req.name, pts, req.profile, req.avoid, signal);
        const ratio = t.laenge_km / req.km;
        return ratio > 0.6 && ratio < 1.5 && (t.km_je_klasse?.raus ?? 0) === 0 ? t : null;
      } catch (e) {
        if (signal?.aborted) throw e;
        return null;
      }
    }),
  );
  return out.filter((t): t is NonNullable<typeof t> => t != null);
}

/* ---------- Wunschlänge nicht erreichbar (Koray 16.11.: Optionen A und B) ---------- */

/** Passt die Runde zur Wunschlänge? 70 % bis 130 % plus 5 km */
export function lengthFits(km: number, want: number): boolean {
  return km >= want * 0.7 && km <= want * 1.3 + 5;
}

/** Ab so vielen km auf demselben Weg zurück ist es keine echte Runde mehr (Routen Check 17.11.: Bourg Saint Maurice) */
export const SPUR_MAX_KM = 5;

/**
 * Soll die App nachfragen, statt die Runde still zu zeigen? Wenn die Länge weit daneben liegt oder die Runde über
 * 5 km auf demselben Weg zurückfährt (Talorte wie Bourg Saint Maurice, Bonneval). Dann bietet sie ehrlich hin und
 * zurück an.
 */
export function needsChoice(t: PlannedTour, want: number): boolean {
  return !lengthFits(t.laenge_km, want) || spurKm(t) > SPUR_MAX_KM;
}

/** Titel und Unterzeile der Rückfrage, für App und Web gleich */
export function choiceText(loop: PlannedTour, want: number): { title: string; subtitle: string } {
  const spur = spurKm(loop);
  if (spur > SPUR_MAX_KM && lengthFits(loop.laenge_km, want)) {
    return {
      title: tr('Von hier keine echte Runde'),
      subtitle: tr('Die Runde fährt {km} km auf demselben Weg zurück.', { km: Math.round(spur) }),
    };
  }
  return {
    title: tr('Von hier keine Runde mit {km} km', { km: want }),
    subtitle:
      loop.laenge_km > want
        ? tr('Die kürzeste Runde in diese Richtung hat {km} km.', { km: Math.round(loop.laenge_km) })
        : tr('Die längste Runde in diese Richtung hat {km} km.', { km: Math.round(loop.laenge_km) }),
  };
}

/** Hin und zurück oben empfehlen: wenn es zur Länge passt, näher dran ist oder die Runde ohnehin weit zurückfährt */
export function backRecommended(back: PlannedTour | null, loop: PlannedTour, want: number): boolean {
  if (!back) return false;
  return lengthFits(back.laenge_km, want) || Math.abs(back.laenge_km - want) < Math.abs(loop.laenge_km - want) || spurKm(loop) > SPUR_MAX_KM;
}

export type OutAndBack = SmartTour & { target: string };

/**
 * Hin und zurück zum schönsten Ziel in halber Länge (Option B): Sackgassen Täler wie Bonneval haben keine kurze
 * Runde, Fahrer fahren dort ohnehin auf den Pass und zurück. Ziele sind Pässe und angesagte Traumstrecken in
 * Reichweite; gewählt wird, was am besten zur Länge passt, bei gleicher Länge die höhere Stufe.
 */
export async function outAndBack(req: SmartRequest, signal?: AbortSignal): Promise<OutAndBack | null> {
  const half = req.km / 2;
  const air = (p: LatLon) => haversine(req.start, p) / 1000;
  // Bergstraßen sind etwa 1,4 mal so lang wie die Luftlinie
  const inReach = (p: LatLon) => {
    const d = air(p) * 1.4;
    return d >= half * 0.45 && d <= half * 1.25;
  };
  const skipped = new Set(avoidedPasses().map((a) => a.id));
  const targets: { name: string; p: LatLon; weight: number }[] = [
    ...PASSES.filter((p) => !skipped.has(p.id) && inReach([p.lat, p.lon])).map((p) => ({ name: p.name, p: [p.lat, p.lon] as LatLon, weight: TIER_WEIGHT[p.tier] })),
    ...HIGHLIGHT_ROADS.filter((r) => r.line.length > 1).flatMap((r) => {
      // das ferne Ende der Strecke ist das Ziel, so wird die ganze Strecke gefahren
      const a = r.line[0];
      const b = r.line[r.line.length - 1];
      const far = air(a) > air(b) ? a : b;
      return inReach(far) ? [{ name: r.name, p: far, weight: (r.level ?? 3) / 2 }] : [];
    }),
  ];
  if (!targets.length) return null;
  // nach Stufe und Nähe zur halben Länge, die besten acht rechnen
  const best = targets
    // Länge zählt mehr als die Stufe (Bericht 17.11.: Ponte di Legno 240 km, gewählt wurde die Kaunertaler Gletscherstraße mit 319 km)
    .map((t) => ({ ...t, fit: t.weight - Math.abs(air(t.p) * 1.4 - half) / Math.max(5, half * 0.1) }))
    .sort((x, y) => y.fit - x.fit)
    .slice(0, 8);
  const planned = await Promise.all(
    best.map((t) =>
      planChecked(tr('Hin und zurück: {name}', { name: t.name }), [req.start, t.p, req.start], req.profile, req.avoid, undefined, signal)
        .then((tour) => ({ t, tour }))
        .catch((e) => {
          if (signal?.aborted) throw e;
          return null;
        }),
    ),
  );
  let ok = planned.filter((x): x is NonNullable<typeof x> => !!x && lengthFits(x.tour.laenge_km, req.km));
  // Ziel zu nah (Routen Check 17.11.: Bonneval 70 km, nur der Mont Cenis mit 45 km): über den Pass hinaus weiter, bis
  // die halbe Länge erreicht ist, etwa über den Iseran nach Val d'Isère. Der Rückweg darf auch eine andere Straße nehmen.
  if (!ok.length) {
    // Kandidaten: zu kurz geplante Ziele und Ziele, die für die erste Auswahl zu nah lagen (Bonneval: der Iseran
    // liegt nur 7 km Luftlinie entfernt); Länge bis dorthin geschätzt mit 1,4 mal der Luftlinie
    const nearTargets = [
      ...PASSES.filter((p) => !skipped.has(p.id)).map((p) => ({ name: p.name, p: [p.lat, p.lon] as LatLon, weight: TIER_WEIGHT[p.tier] })),
    ].filter((t) => {
      const d = air(t.p) * 1.4;
      return d >= half * 0.15 && d < half * 0.45;
    });
    const short = [
      ...planned
        .filter((x): x is NonNullable<typeof x> => !!x && x.tour.laenge_km < req.km * 0.7)
        .map((x) => ({ t: x.t, oneWay: x.tour.laenge_km / 2 })),
      ...nearTargets.map((t) => ({ t: { ...t, fit: 0 }, oneWay: air(t.p) * 1.4 })),
    ]
      .sort((x, y) => y.t.weight - x.t.weight)
      .slice(0, 4);
    // zwei Weiten probieren, Bergstraßen sind deutlich länger als die Luftlinie (Iseran: 0,75 ergab 112 km statt 70)
    const longer = await Promise.all(
      short.flatMap((x) =>
        [0.35, 0.55].map(async (k) => {
          const rest = half - x.oneWay;
          if (rest < 5) return null;
          const on = destination(x.t.p, rest * k, bearingTo(req.start, x.t.p));
          try {
            const tour = await planChecked(tr('Hin und zurück: {name}', { name: x.t.name }), [req.start, x.t.p, on, req.start], req.profile, req.avoid, undefined, signal);
            if (process.env.DEBUG_RT) console.log('weiter', x.t.name, k, 'rest', rest.toFixed(1), '->', tour.laenge_km.toFixed(1));
            if (!lengthFits(tour.laenge_km, req.km)) return null;
            const town = await reverseName(on, signal).catch(() => '');
            return { t: { ...x.t, name: town ? tr('{pass} bis {town}', { pass: x.t.name, town }) : x.t.name }, tour };
          } catch (e) {
            if (signal?.aborted) throw e;
            return null;
          }
        }),
      ),
    );
    ok = longer.filter((x): x is NonNullable<typeof x> => !!x);
  }
  const pool = ok.length ? ok : planned.filter((x): x is NonNullable<typeof x> => !!x);
  if (!pool.length) return null;
  // passt die Länge: höhere Stufe gewinnt, dann die nähere Länge; sonst die nächste Länge
  const off = (x: (typeof pool)[number]) => Math.abs(x.tour.laenge_km - req.km) / req.km;
  const pick = ok.length ? pool.sort((x, y) => y.t.weight - x.t.weight || off(x) - off(y))[0] : pool.sort((x, y) => off(x) - off(y))[0];
  const curves = countCurves(flatten(pick.tour).map((x) => x.p));
  return { ...pick.tour, engine: 'cumo' as Engine, score: 0, curves, target: pick.t.name };
}
