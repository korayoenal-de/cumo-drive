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
import { cumoAvailable, cumoPlan, cumoRoundTrips } from './cumo-routing';
import { doubledStretch } from './doubled';
import { ghRoundTripCandidates, graphhopperKey, scoreRoute, type GhRoute } from './graphhopper';
import { PASSES, passLoopVia, TIER_WEIGHT } from './passes';
import { planChecked, type PlannedTour, type PlanStep } from './plan';
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
};

export type Engine = 'cumo' | 'graphhopper' | 'valhalla';
export type SmartTour = PlannedTour & { engine: Engine; score: number; curves: number; passes?: string[] };

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

/** Erlaubte Abweichung von der Wunschlänge (Koray 6.11.: höchstens 15 %) */
const BAND = 0.15;
const devOf = (t: PlannedTour, km: number) => Math.abs(t.laenge_km - km) / km;
const inBand = (t: PlannedTour, km: number) => t.laenge_km > 0 && devOf(t, km) <= BAND;

/**
 * Sieger wählen: zuerst nur Runden in der Wunschlänge (plus oder minus 15 %), unter ihnen die beste
 * Bewertung. Passt keine, gewinnt die mit der kleinsten Abweichung (Bewertung als Gleichstand).
 */
function pick<T extends PlannedTour & { score: number }>(list: T[], km: number): T | undefined {
  const usable = list.filter((t) => t.laenge_km > 0);
  const fit = usable.filter((t) => inBand(t, km));
  if (fit.length) return fit.sort((a, b) => b.score - a.score)[0];
  return usable.sort((a, b) => devOf(a, km) - devOf(b, km) || b.score - a.score)[0];
}

/** Median der Längen, um eine zweite Runde nachzuskalieren */
function medianKm(list: PlannedTour[]): number {
  const v = list.map((t) => t.laenge_km).filter((x) => x > 0).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
}

export async function smartRoundTrip(req: SmartRequest, onStep?: (s: PlanStep) => void, signal?: AbortSignal): Promise<SmartTour> {
  const seed = req.seed ?? Math.floor(Math.random() * 1e6);
  const heading =
    req.bearing ?? (req.direction === 'zufall' ? seed % 360 : DIRECTIONS.find((d) => d.id === req.direction)!.bearing);
  const candidates: SmartTour[] = [];
  let lastError: unknown = null;

  // Pässe Profil: gezielt über bekannte Pässe in Reichweite, die jetzt offen sind.
  // Bergstraßen sind viel länger als die Luftlinie; passt die Länge nicht, wird die Reichweite
  // nachgeregelt und neu gewählt (höchstens drei Versuche).
  // läuft parallel zu den Varianten des eigenen Servers (vorher nacheinander, QS 6.11.: doppelte Wartezeit)
  const passChain: Promise<SmartTour | null> =
    req.profile === 'paesse'
      ? (async (): Promise<SmartTour | null> => {
        const month = new Date().getMonth() + 1;
        const dir = req.direction === 'zufall' && req.bearing === undefined ? null : heading;
        const own = await cumoAvailable();
        let reachKm = req.km;
        const tried = new Set<string>();
        // Bei einem Pass führt der Rückweg über einen Punkt seitlich; liefert die Reichweite wieder
        // denselben Pass, wird dieser Punkt näher heran oder weiter weg gelegt (Meran 6.11.: 59 statt 50 km)
        let side = 1;
        for (let attempt = 0; attempt < 3; attempt++) {
          const loop = passLoopVia(PASSES, req.start, reachKm, dir, month);
          if (!loop) break;
          const key = loop.passes.map((p) => p.id).join('+');
          if (tried.has(key) && loop.passes.length !== 1) break;
          tried.add(key);
          if (loop.passes.length === 1 && side !== 1) {
            const q = loop.via[loop.via.length - 1];
            loop.via[loop.via.length - 1] = [req.start[0] + (q[0] - req.start[0]) * side, req.start[1] + (q[1] - req.start[1]) * side];
          }
          try {
            onStep?.('route');
            const t = await planChecked(req.name, [req.start, ...loop.via, req.start], req.profile, req.avoid, onStep, signal, true);
            const curves = countCurves(flatten(t).map((x) => x.p));
            const bonus = loop.passes.reduce((sum, p) => sum + TIER_WEIGHT[p.tier] * 15, 0);
            const cand: SmartTour = {
              ...t,
              engine: own ? 'cumo' : 'valhalla',
              curves,
              // Pässe als Via Punkt erzeugen leicht ein Stück hin und auf demselben Weg zurück
              // (Brixen 6.11.: 37 km doppelt über den Pass). Das kostet wie bei den anderen Runden.
              score: scoreTour(t, curves, 0, req.km) + bonus - spurKm(t) * 100,
              passes: loop.passes.map((p) => p.name),
            };
            candidates.push(cand);
            const ratio = t.laenge_km / req.km;
            if ((t.km_je_klasse?.raus ?? 0) === 0 && inBand(t, req.km) && spurKm(t) < 0.5) return cand;
            reachKm = reachKm / Math.max(0.5, Math.min(2.5, ratio));
            side = side / Math.max(0.6, Math.min(1.6, ratio));
          } catch (e) {
            if (signal?.aborted) throw e;
            lastError = e;
            break;
          }
        }
        // Sonst zählen die Pass Runden unten mit den freien Varianten zusammen
        return null;
      })()
      : Promise.resolve(null);
  // Abbruch wird unten beim Warten gemeldet, hier nur als behandelt markieren
  passChain.catch(() => undefined);

  // 0. Eigener Routing Server: Sportwagen Profil mit Kurven, mehrere Varianten, alles lokal
  if (await cumoAvailable()) {
    try {
      onStep?.('route');
      // Ohne Richtung in sechs Richtungen suchen: so gewinnt das Hügelland mit Kurven statt der Weg durch die Ebene und Städte
      const free = req.direction === 'zufall' && req.bearing === undefined;
      // Runden über kuratierte Traumstrecken gleichzeitig mit den freien Varianten rechnen
      const curvy = req.profile === 'kurvig' || req.profile === 'paesse';
      const [own, loops, circles] = await Promise.all([
        // Seeds weit auseinander, sonst überschneiden sich die Varianten zweier Würfe (seed + i) und
        // Neu würfeln bringt dieselbe Runde
        cumoRoundTrips(req.name, req.start, req.km, heading, req.profile, req.avoid, free ? 6 : 5, (seed * 11) % 100000, signal, free),
        curvy ? favoriteLoops(req, free ? undefined : heading, seed, signal) : Promise.resolve([]),
        circleLoops(req, heading, free, seed, signal),
      ]);
      // Erst ohne Stichstraßen bewerten: Kurven, Länge, Traumstrecken, Richtung. Die drei besten
      // bekommen die Stichstraße herausgeplant, danach zählt jeder übrige km doppelt mit 100 Punkten.
      // (Heppenheim 5.11.: eine Runde mit 11 Kurven durch Mannheim gewann gegen Runden mit 30 Kurven,
      // weil diese 0,8 km Stichstraße hatten, die sich leicht herausplanen ließ.)
      const base = (t: PlannedTour & { curves: number }) =>
        scoreTour(t, t.curves, 0, req.km) + favKm(t) * 4 + highlightBonus(t) - offCourse(t, req.start, free ? undefined : heading);
      const usable = (t: PlannedTour) => (t.km_je_klasse?.raus ?? 0) === 0 && t.laenge_km > 0;
      // Stichstraßen schon vor dem Herausplanen mitbewerten, sonst gewinnt eine passende Länge mit
      // 40 km hin und zurück über einen Pass (Judenburg 6.11.)
      const rate = (t: PlannedTour & { curves: number }) => ({ ...t, engine: 'cumo' as const, spur: spurKm(t), score: base(t) - spurKm(t) * 100 });
      let pool = [...own, ...loops, ...circles].filter(usable).map(rate);
      const good = () =>
        pool.filter((t) => inBand(t, req.km) && t.spur < 0.5).length + candidates.filter((t) => inBand(t, req.km) && spurKm(t) < 0.5).length;
      // Keine saubere Variante in der Wunschlänge (kurvige Straßen im Gebirge sind viel länger als
      // der Kreis, in der Ebene kürzer): einmal mit nachgeregelter Länge neu rechnen
      if (good() < 1) {
        // Schätzung aus den Rundtouren des Servers; deren Länge streut stark (Judenburg 6.11.: 80 bis
        // 206 km für 100 km), darum zwei Längen um die Schätzung herum
        const med = medianKm(own.length ? own : pool.length ? pool : candidates);
        if (med > 0) {
          const est = Math.min(req.km * 2, Math.max(req.km * 0.5, (req.km * req.km) / med));
          const scaled = { ...req, km: est };
          const [lo, hi, circles2] = await Promise.all([
            cumoRoundTrips(req.name, req.start, est * 0.88, heading, req.profile, req.avoid, 4, (seed * 17 + 7) % 100000, signal, free),
            cumoRoundTrips(req.name, req.start, est * 1.12, heading, req.profile, req.avoid, 4, (seed * 19 + 3) % 100000, signal, free),
            circleLoops(scaled, heading, free, seed + 1, signal, req.km),
          ]);
          pool = [...pool, ...[...lo, ...hi, ...circles2].filter(usable).map(rate)];
        }
      }
      // Die drei besten in der Wunschlänge bekommen die Stichstraße herausgeplant; fehlen solche,
      // die nächstliegenden
      const fit = pool.filter((t) => inBand(t, req.km)).sort((a, b) => b.score - a.score);
      const rest = pool.filter((t) => !inBand(t, req.km)).sort((a, b) => devOf(a, req.km) - devOf(b, req.km));
      const top = await Promise.all([...fit, ...rest].slice(0, 3).map((t) => despur(t, req, signal)));
      for (const t of top) candidates.push({ ...t, score: base(t) - spurKm(t) * 100 });
      const early = await passChain;
      if (early) return early;
      const best = pick(candidates, req.km);
      if (best) return best;
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }

  {
    const early = await passChain.catch(() => null);
    if (early) return early;
  }

  // 1. Valhalla: ohne Autobahn, Via Punkte im Hügelland, geprüft und umgeplant. Bleibt eine
  // Stichstraße über 1 km, die nicht an einem Via Punkt hängt, eine zweite Runde mit anderem Seed.
  for (let attempt = 0; attempt < 2; attempt++) {
    onStep?.('route');
    try {
      const r = await roundTrip(
        { start: req.start, km: req.km, direction: req.direction, bearing: heading, profile: req.profile, avoid: req.avoid, seed: seed + attempt * 7919 },
        signal,
      );
      const t = await despurVias(req, r.via, onStep, signal);
      const curves = countCurves(flatten(t).map((x) => x.p));
      const spur = spurKm(t);
      candidates.push({ ...t, engine: 'valhalla', curves, score: scoreTour(t, curves, 0, req.km) - spur * 100 });
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

  const best = pick(candidates, req.km);
  if (!best) throw lastError ?? new Error('Keine Rundtour gefunden.');
  return best;
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
function spurKm(t: PlannedTour): number {
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
  const line = flatten(t).map((x) => x.p);
  const c: LatLon = [line.reduce((a, q) => a + q[0], 0) / line.length, line.reduce((a, q) => a + q[1], 0) / line.length];
  if (haversine(start, c) < 2000) return 0;
  const d = Math.abs(((bearing(start, c) - heading + 540) % 360) - 180);
  return Math.max(0, d - 40) * 3;
}

/**
 * Runden über einen Kreis in die gewählte Richtung, wie beim Ersatzweg: Via Punkte auf dem Kreis,
 * ins Hügelland geschoben, dann über den eigenen Server. Die Rundtouren von GraphHopper kennen nur
 * die Richtung des ersten Stücks und laufen sonst oft in die Ebene (Heppenheim 5.11.: Osten
 * gewählt, Runde durch Mannheim). Ohne Richtung zwei gegenüberliegende Kreise.
 */
async function circleLoops(req: SmartRequest, heading: number, free: boolean, seed: number, signal?: AbortSignal, targetKm = req.km) {
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
        const ratio = t.laenge_km / targetKm;
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
    // die Länge darf dabei nicht aus der Wunschlänge laufen (oder sich weiter entfernen)
    const lenOk = devOf(r, req.km) <= Math.max(BAND, devOf(t, req.km));
    if (spurKm(r) < spur.km - 0.1 && lenOk && (r.km_je_klasse?.raus ?? 0) === 0) {
      return { ...t, ...r, engine: 'cumo', curves: r.curves, score: t.score };
    }
  } catch (e) {
    if (signal?.aborted) throw e;
  }
  return t;
}

/** km der Tour auf kuratierten Traumstrecken */
function favKm(t: PlannedTour): number {
  const line = flatten(t);
  const near = HIGHLIGHT_ROADS.filter((r) => r.line.some((q) => line.some((x, i) => i % 20 === 0 && haversine(q, x.p) < 3000)));
  if (!near.length) return 0;
  let km = 0;
  for (let i = 1; i < line.length; i++) if (near.some((r) => r.line.some((q) => haversine(q, line[i].p) < 120))) km += line[i].km - line[i - 1].km;
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
