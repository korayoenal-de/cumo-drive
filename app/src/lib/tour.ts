/**
 * Touren Datenmodell und Hilfsfunktionen (GPX lesen und schreiben, Abschnitte berechnen).
 * Plattformunabhängig bis auf parseGpx, das einen DOMParser braucht (Web).
 */

export type LatLon = [number, number];
export type CheckClass = 'ok' | 'pruefen' | 'raus';

export type Warning = {
  klasse: CheckClass;
  start_km: number;
  laenge_km: number;
  name: string;
  ort: string;
  gruende: string[];
  mitte: LatLon;
};

export type Tour = {
  name: string;
  laenge_km: number;
  km_je_klasse?: Record<CheckClass, number>;
  wegpunkte: LatLon[];
  linie: { c: CheckClass; p: LatLon[] }[];
  warnungen: Warning[];
  /** true, wenn die Tour durch den Etappen Check gelaufen ist */
  geprueft?: boolean;
};

export type Profile = 'kurvig' | 'paesse' | 'entspannt' | 'schnell';

export const PROFILES: { id: Profile; label: string }[] = [
  { id: 'kurvig', label: 'Kurvig' },
  { id: 'paesse', label: 'Pässe' },
  { id: 'entspannt', label: 'Entspannt' },
  { id: 'schnell', label: 'Schnell' },
];

export function haversine(a: LatLon, b: LatLon): number {
  const r = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** Alle Punkte der Linie in Reihenfolge, mit km ab Start. */
export function flatten(tour: Tour): { p: LatLon; km: number }[] {
  const out: { p: LatLon; km: number }[] = [];
  let km = 0;
  for (const run of tour.linie) {
    for (const p of run.p) {
      const last = out[out.length - 1];
      if (last) {
        if (last.p[0] === p[0] && last.p[1] === p[1]) continue;
        km += haversine(last.p, p) / 1000;
      }
      out.push({ p, km });
    }
  }
  return out;
}

export type Leg = { from: number; to: number; startKm: number; endKm: number; warnings: Warning[] };

/** Teilt die Tour an den Wegpunkten in Abschnitte (Wegpunkt i bis i+1). */
export function legs(tour: Tour): Leg[] {
  const pts = flatten(tour);
  if (pts.length === 0 || tour.wegpunkte.length < 2) return [];
  let cursor = 0;
  const kms = tour.wegpunkte.map((w, i) => {
    if (i === 0) return 0;
    if (i === tour.wegpunkte.length - 1) return pts[pts.length - 1].km;
    // nächster Linienpunkt ab dem letzten Treffer, damit Schleifen nicht zurückspringen
    let best = cursor;
    let bd = Infinity;
    for (let j = cursor; j < pts.length; j++) {
      const d = haversine(w, pts[j].p);
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    cursor = best;
    return pts[best].km;
  });
  const out: Leg[] = [];
  for (let i = 0; i < kms.length - 1; i++) {
    const startKm = kms[i];
    const endKm = kms[i + 1];
    out.push({
      from: i,
      to: i + 1,
      startKm,
      endKm,
      warnings: tour.warnungen.filter((w) => w.start_km >= startKm && w.start_km < endKm),
    });
  }
  return out;
}

export function reverseTour(tour: Tour): Tour {
  const total = tour.laenge_km;
  return {
    ...tour,
    wegpunkte: [...tour.wegpunkte].reverse(),
    linie: [...tour.linie].reverse().map((r) => ({ c: r.c, p: [...r.p].reverse() })),
    warnungen: tour.warnungen
      .map((w) => ({ ...w, start_km: Math.max(0, +(total - w.start_km - w.laenge_km).toFixed(1)) }))
      .sort((a, b) => a.start_km - b.start_km),
  };
}

/** Liest eine GPX Datei (Wegpunkte, Route oder Track). Braucht DOMParser. */
export function parseGpx(text: string, fallbackName: string): Tour {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const read = (tag: string): LatLon[] =>
    Array.from(doc.getElementsByTagName(tag)).map((el) => [
      parseFloat(el.getAttribute('lat') ?? '0'),
      parseFloat(el.getAttribute('lon') ?? '0'),
    ]);
  const route = read('rtept');
  const track = read('trkpt');
  const line = track.length > route.length ? track : route;
  if (line.length < 2) throw new Error('In der Datei sind keine Routen oder Trackpunkte.');
  let wegpunkte = read('wpt');
  if (wegpunkte.length < 2) wegpunkte = [line[0], line[line.length - 1]];
  const name = doc.getElementsByTagName('name')[0]?.textContent?.trim() || fallbackName;
  const tour: Tour = { name, laenge_km: 0, wegpunkte, linie: [{ c: 'ok', p: line }], warnungen: [], geprueft: false };
  const pts = flatten(tour);
  tour.laenge_km = +pts[pts.length - 1].km.toFixed(1);
  return tour;
}

export function toGpx(tour: Tour): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const wpts = tour.wegpunkte.map(([la, lo]) => `  <wpt lat="${la}" lon="${lo}"></wpt>`).join('\n');
  const pts = flatten(tour)
    .map(({ p }) => `      <trkpt lat="${p[0]}" lon="${p[1]}"></trkpt>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" creator="CUMO DRIVE" version="1.1">
  <metadata><name>${esc(tour.name)}</name></metadata>
${wpts}
  <trk>
    <name>${esc(tour.name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

export function formatKm(km: number, digits = 1): string {
  return km.toFixed(digits).replace('.', ',');
}
