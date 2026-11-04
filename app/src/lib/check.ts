/**
 * Etappen Check im Browser: gleicht eine Linie über Valhalla mit dem Straßennetz ab
 * und bewertet jedes Stück nach Sportwagen Regeln (ok, pruefen, raus).
 *
 * Gleiche Idee wie routing/src/analyze_route.py, aber auf Valhalla Kantendaten:
 * Valhalla kennt Klasse, Nutzung und Belag, aber keine Höchstbreite und keine Furten.
 * Dafür sorgt die Abschnittsregel: Nebenstraßen ohne Nummer mit mindestens zwei harten
 * Signalen werden komplett gesperrt.
 */
import { traceAttributes, type Edge } from './valhalla';
import { haversine, type CheckClass, type LatLon, type Tour, type Warning } from './tour';

const NON_CAR_USE = new Set(['track', 'cycleway', 'footway', 'path', 'steps', 'pedestrian', 'bridleway', 'mountain_bike', 'sidewalk']);
const SMALL_USE = new Set(['living_street', 'driveway', 'alley', 'parking_aisle']);
const BAD_SURFACE = new Set(['gravel', 'dirt', 'path', 'impassable', 'compacted']);
const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary']);
const NUMBERED = /\b([A-Z]{1,3}\s?\d{1,4}[a-z]?|\d{2,4})\b/;

function classify(e: Edge): { c: CheckClass; why: string[] } {
  const why: string[] = [];
  if (e.use && NON_CAR_USE.has(e.use)) why.push(`als ${kindLabel(e.use)} eingetragen`);
  if (e.unpaved) why.push('unbefestigt');
  else if (e.surface && BAD_SURFACE.has(e.surface)) why.push(`Belag ${surfaceLabel(e.surface)}`);
  if (why.length) return { c: 'raus', why };
  const soft: string[] = [];
  if (e.surface === 'paved_rough') soft.push('rauer Belag');
  if (e.use && SMALL_USE.has(e.use)) soft.push(`als ${kindLabel(e.use)} eingetragen`);
  if (e.road_class === 'service_other' || e.road_class === 'residential') {
    if ((e.lane_count ?? 1) <= 1 && !(e.names ?? []).length) soft.push('kleine Straße ohne Namen');
  }
  return soft.length ? { c: 'pruefen', why: soft } : { c: 'ok', why: [] };
}

function kindLabel(u: string) {
  return (
    { track: 'Wirtschafts oder Waldweg', cycleway: 'Radweg', footway: 'Fußweg', path: 'Pfad', steps: 'Treppe', pedestrian: 'Fußgängerzone', bridleway: 'Reitweg', mountain_bike: 'MTB Strecke', living_street: 'Spielstraße', driveway: 'Zufahrt', alley: 'Gasse', parking_aisle: 'Parkplatzgasse', sidewalk: 'Gehweg' } as Record<string, string>
  )[u] ?? u;
}

function surfaceLabel(s: string) {
  return ({ gravel: 'Schotter', dirt: 'Erde', path: 'Pfad', impassable: 'unbefahrbar', compacted: 'verdichtet', paved_rough: 'rau' } as Record<string, string>)[s] ?? s;
}

function isMinor(e: Edge) {
  if (MAJOR.has(e.road_class ?? '')) return false;
  return !(e.names ?? []).some((n) => NUMBERED.test(n));
}

/**
 * Bewertet Kanten, inklusive Abschnittsregel.
 * lenient: für importierte Touren mit dünnen Punkten (calimoto exportiert nur alle paar hundert
 * Meter einen Punkt). Isolierte Sperrstücke unter 1 km außerhalb eines gesperrten Abschnitts
 * sind dann meist Abgleichfehler (etwa an Passhöhen mit Parkplätzen) und werden nur zum
 * Prüfhinweis; Abschnitte unter 1 km zählen nicht als gesperrte Zone. Kalibriert an fünf
 * gefahrenen CDC Etappen: gute Etappen 0 km raus, Val Resia (RCO EAST 26 E3) bleibt 15,7 km raus.
 */
export function rateEdges(edges: Edge[], lenient = false): { c: CheckClass; why: string[] }[] {
  const rated = edges.map(classify);
  const inZone = new Array(edges.length).fill(false);
  let i = 0;
  while (i < edges.length) {
    if (!isMinor(edges[i])) {
      i++;
      continue;
    }
    let j = i;
    let hits = 0;
    let km = 0;
    while (j < edges.length && isMinor(edges[j])) {
      if (rated[j].c === 'raus') hits++;
      km += edges[j].length ?? 0;
      j++;
    }
    // bei Importen (dünne Punkte) zählen Mini Zonen unter 1 km nicht als gesperrter Abschnitt
    if (hits >= 2 && !(lenient && km < 1)) {
      const reason = `Teil eines ${km.toFixed(1).replace('.', ',')} km langen Nebenstraßen Abschnitts mit ${hits} Sperrsignalen`;
      for (let k = i; k < j; k++) {
        inZone[k] = true;
        if (rated[k].c !== 'raus') rated[k] = { c: 'raus', why: [reason, ...rated[k].why] };
      }
    }
    i = j;
  }
  if (lenient) {
    let a = 0;
    while (a < edges.length) {
      if (rated[a].c !== 'raus' || inZone[a]) {
        a++;
        continue;
      }
      let b = a;
      let km = 0;
      while (b < edges.length && rated[b].c === 'raus' && !inZone[b]) km += edges[b++].length ?? 0;
      if (km < 1) {
        for (let k = a; k < b; k++) rated[k] = { c: 'pruefen', why: ['kurzes Stück, vermutlich Abgleichfehler', ...rated[k].why] };
      }
      a = b;
    }
  }
  return rated;
}

/** Dünnt eine Linie aus, damit die Anfrage klein bleibt. */
function thin(points: LatLon[], minM: number): LatLon[] {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) if (haversine(out[out.length - 1], points[i]) >= minM) out.push(points[i]);
  out.push(points[points.length - 1]);
  return out;
}

/** Prüft eine ganze Linie in Stücken und baut daraus Linienläufe und Warnungen. */
export async function checkLine(
  line: LatLon[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
  lenient = false,
): Promise<Pick<Tour, 'linie' | 'warnungen' | 'km_je_klasse' | 'laenge_km'>> {
  const pts = thin(line, 40);
  const CHUNK = 600;
  // Stücke nach Punktzahl und Länge: der öffentliche Server nimmt höchstens 200 km pro Abgleich
  const MAX_CHUNK_M = 150000;
  const chunks: LatLon[][] = [];
  let cur: LatLon[] = [pts[0]];
  let curM = 0;
  for (let i = 1; i < pts.length; i++) {
    cur.push(pts[i]);
    curM += haversine(pts[i - 1], pts[i]);
    if ((cur.length >= CHUNK || curM >= MAX_CHUNK_M) && i < pts.length - 1) {
      chunks.push(cur);
      cur = [pts[i]];
      curM = 0;
    }
  }
  if (cur.length > 1) chunks.push(cur);
  const edges: Edge[] = [];
  const shapes: LatLon[][] = [];
  for (let k = 0; k < chunks.length; k++) {
    const r = await traceAttributes(chunks[k], signal);
    for (const e of r.edges) {
      edges.push(e);
      shapes.push(r.shape.slice(e.begin_shape_index ?? 0, (e.end_shape_index ?? 0) + 1));
    }
    onProgress?.(k + 1, chunks.length);
  }
  const rated = rateEdges(edges, lenient);

  const linie: Tour['linie'] = [];
  const warnungen: Warning[] = [];
  const kmBy: Record<CheckClass, number> = { ok: 0, pruefen: 0, raus: 0 };
  let km = 0;
  let open: Warning | null = null;
  edges.forEach((e, idx) => {
    const { c, why } = rated[idx];
    const len = e.length ?? 0;
    kmBy[c] += len;
    const shape = shapes[idx];
    const last = linie[linie.length - 1];
    if (last && last.c === c) last.p.push(...shape.slice(1));
    else if (shape.length) linie.push({ c, p: [...shape] });
    if (c !== 'ok') {
      if (open && open.klasse === c && Math.abs(open.start_km + open.laenge_km - km) < 0.3) {
        open.laenge_km = +(km + len - open.start_km).toFixed(2);
        for (const w of why) if (!open.gruende.includes(w)) open.gruende.push(w);
        if (!open.name && e.names?.length) open.name = e.names[0];
      } else {
        open = {
          klasse: c, start_km: +km.toFixed(1), laenge_km: +len.toFixed(2), name: e.names?.[0] ?? '', ort: '',
          gruende: [...why], mitte: shape[Math.floor(shape.length / 2)] ?? shape[0],
        };
        warnungen.push(open);
      }
    }
    km += len;
  });
  // kurze Prüfhinweise unter 300 m weglassen, sie stören mehr als sie helfen
  const filtered = warnungen.filter((w) => w.klasse === 'raus' || w.laenge_km >= 0.3);
  return {
    linie,
    warnungen: filtered,
    laenge_km: +km.toFixed(1),
    km_je_klasse: { ok: +kmBy.ok.toFixed(1), pruefen: +kmBy.pruefen.toFixed(1), raus: +kmBy.raus.toFixed(1) },
  };
}
