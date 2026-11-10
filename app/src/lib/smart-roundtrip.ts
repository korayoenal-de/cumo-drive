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
import { checkLine } from './check';
import { HIGHLIGHT_ROADS, type HighlightRoad } from './highlight-roads';
import { findHighlights } from './navigation/highlights';
import { cumulativeKm } from './navigation/route';
import { bigCityKm, cumoAvailable, cumoPlan, cumoRoundTrips } from './cumo-routing';
import { doubledStretch } from './doubled';
import { ghRoundTripCandidates, graphhopperKey, scoreRoute, type GhRoute } from './graphhopper';
import { PASSES, passLoopVia, TIER_WEIGHT } from './passes';
import { planChecked, type PlannedTour, type PlanStep } from './plan';
import { closureExclude, closuresNear, closuresOnRoute, prefetchClosures } from './road-closures';
import { DIRECTIONS, hillyVia, loopPoints, roundTrip, type Direction } from './roundtrip';
import { countCurves } from './stats';
import { flatten, haversine, type LatLon, type Profile } from './tour';
import type { Avoid } from './valhalla';

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

export async function smartRoundTrip(req: SmartRequest, onStep?: (s: PlanStep) => void, signal?: AbortSignal): Promise<SmartTour> {
  const seed = req.seed ?? Math.floor(Math.random() * 1e6);
  const heading =
    req.bearing ?? (req.direction === 'zufall' ? seed % 360 : DIRECTIONS.find((d) => d.id === req.direction)!.bearing);
  const candidates: SmartTour[] = [];
  let lastError: unknown = null;
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
    let reachKm = req.km;
    const tried = new Set<string>();
    for (let attempt = 0; attempt < 3; attempt++) {
      const loop = passLoopVia(PASSES, req.start, reachKm, dir, month, seed + attempt);
      if (!loop) break;
      const key = loop.passes.map((p) => p.id).join('+');
      if (tried.has(key)) break;
      tried.add(key);
      try {
        onStep?.('route');
        const t = await planChecked(req.name, [req.start, ...loop.via, req.start], req.profile, req.avoid, own ? undefined : onStep, signal, true);
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
        cumoRoundTrips(req.name, req.start, req.km, heading, req.profile, req.avoid, free ? 6 : 5, (seed * 11) % 100000, signal, free),
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
        scoreTour(t, t.curves, 0, req.km) + favKm(t) * 4 + highlightBonus(t) - offCourse(t, req.start, free ? undefined : heading) - townPenalty(t) + (passBonus.get(t) ?? 0);
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
            const again = await cumoPlan(req.name, pts, req.profile, req.avoid, signal, ex);
            const leftHits = closuresOnRoute(flatten(again).map((x) => x.p), closures);
            const left = uniqueHits(leftHits);
            // nur nehmen, wenn die Runde ihre Länge behält
            const keepsLength = again.laenge_km >= t.laenge_km * 0.8 && again.laenge_km <= t.laenge_km * 1.3 + 5;
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
      if (candidates.length) return candidates.sort((a, b) => b.score - a.score)[0];
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }

  // die Pass Varianten sind auch dann fertig, wenn der Block oben mit einem Fehler endete
  if (passJob) await passJob;

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
        { start: req.start, km: req.km, direction: req.direction, bearing: turn(attempt), profile: req.profile, avoid: req.avoid, seed: seed + attempt * 7919 },
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

  // 2. GraphHopper Varianten, nur für kurvige Profile und mit Schlüssel
  if (graphhopperKey() && req.profile !== 'schnell') {
    try {
      onStep?.('route');
      const gh = await ghRoundTripCandidates(req.start, req.km, heading, 4, seed % 100000, signal);
      for (const c of gh.slice(0, 2)) {
        onStep?.('check');
        const chk = await checkLine(c.shape, undefined, signal);
        const t: PlannedTour = {
          name: req.name, wegpunkte: [req.start, req.start], ...chk, laenge_km: +c.km.toFixed(1), minutes: c.minutes, geprueft: true, fixes: 0,
        };
        candidates.push({ ...t, engine: 'graphhopper', curves: c.curves, score: scoreTour(t, c.curves, c.fastKm, req.km) - spurKm(t) * 100 });
      }
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = lastError ?? e;
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
  return { km: d.points.length ? (d.km * points.length) / d.points.length : 0, points };
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
  const circ = req.km / 1.45;
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
  const line = flatten(t);
  const spur = spurOf(t);
  if (spur.km < 0.2) return t;
  const via: LatLon[] = [];
  let last = 0;
  for (const x of line) {
    if (x.km - last < 7 || x.km > t.laenge_km - 3) continue;
    if (spur.points.some((q) => haversine(q, x.p) < 600)) continue;
    via.push(x.p);
    last = x.km;
  }
  try {
    const r = await cumoPlan(req.name, [req.start, ...via, req.start], req.profile, req.avoid, signal);
    if (spurKm(r) < spur.km - 0.1 && r.laenge_km <= t.laenge_km * 1.25 + 3 && (r.km_je_klasse?.raus ?? 0) === 0) {
      return { ...t, ...r, engine: 'cumo', curves: r.curves, score: t.score };
    }
  } catch (e) {
    if (signal?.aborted) throw e;
  }
  return t;
}

/**
 * Raster der Stützpunkte aller Traumstrecken (Zellen etwa 220 m), einmal aufgebaut. Vorher verglich favKm
 * jeden Punkt der Tour mit jedem Punkt jeder Strecke in der Nähe: bei einer 150 km Rundtour mit 14 Varianten
 * waren das über 1,5 s Rechenzeit am Rechner, auf dem Handy ein Mehrfaches (Messung 10.11.).
 */
const FAV_CELL = 0.002;
let favGrid: Map<string, LatLon[]> | null = null;
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
  const reach = req.km * 0.4;
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
