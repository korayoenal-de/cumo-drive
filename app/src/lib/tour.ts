/**
 * Touren Datenmodell und Hilfsfunktionen (GPX lesen und schreiben, Abschnitte berechnen).
 * Plattformunabhängig, GPX und KML werden ohne DOMParser gelesen.
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

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Punkte eines GPX Tags (wpt, rtept, trkpt) ohne DOMParser, damit es auch in der App läuft. */
function gpxPoints(text: string, tag: string): LatLon[] {
  const out: LatLon[] = [];
  const re = new RegExp(`<${tag}\\b([^>]*)>`, 'g');
  for (const m of text.matchAll(re)) {
    const lat = /\blat\s*=\s*["']([-\d.eE+]+)["']/.exec(m[1]);
    const lon = /\blon\s*=\s*["']([-\d.eE+]+)["']/.exec(m[1]);
    if (lat && lon) out.push([parseFloat(lat[1]), parseFloat(lon[1])]);
  }
  return out;
}

function finish(name: string, line: LatLon[], wegpunkte: LatLon[]): Tour {
  if (line.length < 2) throw new Error('In der Datei ist keine Route oder Strecke.');
  const wp = wegpunkte.length >= 2 ? wegpunkte : [line[0], line[line.length - 1]];
  const tour: Tour = { name, laenge_km: 0, wegpunkte: wp, linie: [{ c: 'ok', p: line }], warnungen: [], geprueft: false };
  const pts = flatten(tour);
  tour.laenge_km = +pts[pts.length - 1].km.toFixed(1);
  return tour;
}

/** Liest eine GPX Datei (Wegpunkte, Route oder Track). */
export function parseGpx(text: string, fallbackName: string): Tour {
  const route = gpxPoints(text, 'rtept');
  const track = gpxPoints(text, 'trkpt');
  const line = track.length > route.length ? track : route;
  const name = /<name>([\s\S]*?)<\/name>/.exec(text);
  return finish((name && decode(name[1])) || fallbackName, line, gpxPoints(text, 'wpt'));
}

/** Liest eine KML Datei (Google My Maps, Google Earth, calimoto): längste Linie und Punkte. */
export function parseKml(text: string, fallbackName: string): Tour {
  const coords = (s: string): LatLon[] =>
    s
      .trim()
      .split(/\s+/)
      .map((c) => c.split(',').map(Number))
      .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
      .map((c) => [c[1], c[0]] as LatLon);
  const lines: LatLon[][] = [];
  for (const m of text.matchAll(/<LineString\b[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g)) lines.push(coords(m[1]));
  // gx:Track (Google Earth Aufzeichnung)
  const gx = Array.from(text.matchAll(/<gx:coord>([^<]+)<\/gx:coord>/g)).map((m) => {
    const [lon, lat] = m[1].trim().split(/\s+/).map(Number);
    return [lat, lon] as LatLon;
  });
  if (gx.length > 1) lines.push(gx);
  // mehrere Abschnitte (zum Beispiel Etappen) hintereinander zu einer Linie verbinden
  const line = lines.filter((l) => l.length > 1).flat();
  const points: LatLon[] = [];
  for (const m of text.matchAll(/<Point\b[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g)) points.push(...coords(m[1]).slice(0, 1));
  const name = /<Document\b[\s\S]*?<name>([\s\S]*?)<\/name>/.exec(text) ?? /<name>([\s\S]*?)<\/name>/.exec(text);
  return finish((name && decode(name[1])) || fallbackName, line, points.length >= 2 ? points : []);
}

/** Erkennt GPX oder KML am Inhalt. */
export function parseRouteFile(text: string, fileName: string): Tour {
  const base = fileName.replace(/\.(gpx|kml|xml)$/i, '') || 'Importierte Tour';
  if (/<kml\b/i.test(text)) return parseKml(text, base);
  if (/<gpx\b/i.test(text)) return parseGpx(text, base);
  throw new Error('Das ist keine GPX oder KML Datei.');
}

/** Dateiname ohne Sonderzeichen. */
export function fileBase(name: string): string {
  return name.replace(/[^\wäöüÄÖÜß -]+/g, '').replace(/\s+/g, ' ').trim() || 'tour';
}

export function toGpx(tour: Tour): string {
  const wpts = tour.wegpunkte
    .map(([la, lo], i) => `  <wpt lat="${la}" lon="${lo}"><name>${i === 0 ? 'Start' : i === tour.wegpunkte.length - 1 ? 'Ziel' : `Via ${i}`}</name></wpt>`)
    .join('\n');
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

/** KML für Google My Maps, Google Earth und andere Planer: Strecke plus Start, Via und Ziel. */
export function toKml(tour: Tour): string {
  const line = flatten(tour)
    .map(({ p }) => `${p[1]},${p[0]},0`)
    .join(' ');
  const marks = tour.wegpunkte
    .map(([la, lo], i) => {
      const n = i === 0 ? 'Start' : i === tour.wegpunkte.length - 1 ? 'Ziel' : `Via ${i}`;
      return `    <Placemark><name>${n}</name><styleUrl>#punkt</styleUrl><Point><coordinates>${lo},${la},0</coordinates></Point></Placemark>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(tour.name)}</name>
    <Style id="strecke"><LineStyle><color>ff1c46e2</color><width>5</width></LineStyle></Style>
    <Style id="punkt"><IconStyle><scale>0.9</scale></IconStyle></Style>
    <Placemark>
      <name>${esc(tour.name)}</name>
      <description>${formatKm(tour.laenge_km)} km, geplant mit CUMO DRIVE</description>
      <styleUrl>#strecke</styleUrl>
      <LineString><tessellate>1</tessellate><coordinates>${line}</coordinates></LineString>
    </Placemark>
${marks}
  </Document>
</kml>
`;
}

export function formatKm(km: number, digits = 1): string {
  return km.toFixed(digits).replace('.', ',');
}
