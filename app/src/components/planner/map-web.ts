/**
 * Lädt MapLibre GL im Browser zur Laufzeit (fertiger Build vom CDN) und zeichnet Touren.
 * So bleibt der Expo Bundler frei von Worker Dateien; die App auf dem Handy nutzt später
 * eine native Karte.
 */
import type { LatLon, Tour } from '@/lib/tour';
import { Colors } from '@/constants/theme';

const VERSION = '5.7.3';
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';

export type MapLib = any;
export type MapInstance = any;

let loading: Promise<MapLib> | null = null;

export function loadMapLibre(): Promise<MapLib> {
  const w = window as unknown as { maplibregl?: MapLib };
  if (w.maplibregl) return Promise.resolve(w.maplibregl);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `https://unpkg.com/maplibre-gl@${VERSION}/dist/maplibre-gl.css`;
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = `https://unpkg.com/maplibre-gl@${VERSION}/dist/maplibre-gl.js`;
    js.onload = () => resolve(w.maplibregl);
    js.onerror = () => reject(new Error('Die Karte konnte nicht geladen werden. Bitte Internetverbindung prüfen.'));
    document.head.appendChild(js);
  });
  return loading;
}

const toLngLat = (p: LatLon) => [p[1], p[0]];

export function tourGeoJson(tour: Tour) {
  return {
    type: 'FeatureCollection',
    features: tour.linie.map((run) => ({
      type: 'Feature',
      properties: { c: run.c },
      geometry: { type: 'LineString', coordinates: run.p.map(toLngLat) },
    })),
  };
}

export function pointsGeoJson(points: LatLon[]) {
  return {
    type: 'FeatureCollection',
    features: points.map((p, i) => ({
      type: 'Feature',
      properties: { idx: i, label: i === 0 ? 'S' : i === points.length - 1 ? 'Z' : String(i), kind: i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'via' },
      geometry: { type: 'Point', coordinates: toLngLat(p) },
    })),
  };
}

/** Legt Quellen und Ebenen für Tour und Wegpunkte an (einmal nach dem Laden des Stils). */
export function addTourLayers(map: MapInstance) {
  map.addSource('tour', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('wp', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'tour-casing',
    type: 'line',
    source: 'tour',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': Colors.ground, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 5, 14, 11] },
  });
  map.addLayer({
    id: 'tour-line',
    type: 'line',
    source: 'tour',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ['match', ['get', 'c'], 'raus', Colors.signal, 'pruefen', Colors.warn, Colors.text],
      'line-width': ['interpolate', ['linear'], ['zoom'], 6, ['match', ['get', 'c'], 'ok', 2.5, 4], 14, ['match', ['get', 'c'], 'ok', 6, 8]],
    },
  });
  map.addSource('hover', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'hover-dot',
    type: 'circle',
    source: 'hover',
    paint: { 'circle-radius': 7, 'circle-color': Colors.signal, 'circle-stroke-color': Colors.text, 'circle-stroke-width': 3 },
  });
  map.addLayer({
    id: 'wp-circle',
    type: 'circle',
    source: 'wp',
    paint: {
      'circle-radius': 11,
      'circle-color': ['match', ['get', 'kind'], 'via', Colors.text, Colors.signal],
      'circle-stroke-color': Colors.ground,
      'circle-stroke-width': 2.5,
    },
  });
  map.addLayer({
    id: 'wp-label',
    type: 'symbol',
    source: 'wp',
    layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true },
    paint: { 'text-color': ['match', ['get', 'kind'], 'via', Colors.ground, '#FFFFFF'] },
  });
}

export function hoverGeoJson(p: LatLon | null) {
  return {
    type: 'FeatureCollection',
    features: p ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: toLngLat(p) } }] : [],
  };
}

export function boundsOf(points: LatLon[]): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  let s = 90, w = 180, n = -90, e = -180;
  for (const [la, lo] of points) {
    s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo);
  }
  return [[w, s], [e, n]];
}

/**
 * Pässe als eigene Ebene unter der Tour: Ikonen ab Zoom 5, bekannte ab 6,5, Geheimtipps ab 8.
 * Wahrscheinlich gesperrte Pässe sind gedimmt.
 */
export function addPassLayers(map: MapInstance, data: unknown) {
  map.addSource('passes', { type: 'geojson', data });
  const minZoom = ['match', ['get', 'tier'], 'ikone', 5, 'bekannt', 6.5, 8];
  const visible = ['>=', ['zoom'], minZoom];
  map.addLayer(
    {
      id: 'pass-circle',
      type: 'circle',
      source: 'passes',
      filter: visible,
      paint: {
        'circle-radius': ['match', ['get', 'tier'], 'ikone', 7, 'bekannt', 5.5, 4.5],
        // wie in der App (TIER_DOT): Ikonen orange, bekannte gelb, Geheimtipps hell
        'circle-color': ['case', ['get', 'closed'], '#5A5A60', ['match', ['get', 'tier'], 'ikone', Colors.signal, 'bekannt', Colors.warn, Colors.text]],
        'circle-stroke-color': Colors.ground,
        'circle-stroke-width': 2,
      },
    },
    'tour-casing',
  );
  map.addLayer(
    {
      id: 'pass-label',
      type: 'symbol',
      source: 'passes',
      filter: ['all', visible, ['>=', ['zoom'], ['match', ['get', 'tier'], 'ikone', 6, 'bekannt', 8, 9.5]]],
      layout: {
        'text-field': ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'ele']], ' m'],
        'text-size': ['match', ['get', 'tier'], 'ikone', 12, 11],
        'text-font': ['Noto Sans Bold'],
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: {
        'text-color': ['case', ['get', 'closed'], '#7A7A80', Colors.text],
        'text-halo-color': Colors.ground,
        'text-halo-width': 1.6,
      },
    },
    'tour-casing',
  );
}

/** Fotoapparat als Kartenbild (weiß, doppelte Auflösung). */
function cameraImage(): ImageData | null {
  if (typeof document === 'undefined') return null;
  const px = 2;
  const c = document.createElement('canvas');
  c.width = c.height = 20 * px;
  const g = c.getContext('2d');
  if (!g) return null;
  g.scale(px, px);
  g.fillStyle = '#FFFFFF';
  // Gehäuse mit Sucherbuckel, Objektiv ausgestanzt
  const body = new Path2D('M 2 7 a 2 2 0 0 1 2 -2 h 2.5 l 1.5 -2 h 4 l 1.5 2 h 2.5 a 2 2 0 0 1 2 2 v 8 a 2 2 0 0 1 -2 2 h -12 a 2 2 0 0 1 -2 -2 Z M 10 7.5 a 3.6 3.6 0 1 0 0.01 0 Z');
  g.fill(body, 'evenodd');
  g.beginPath();
  g.arc(10, 11.1, 1.8, 0, Math.PI * 2);
  g.fill();
  return g.getImageData(0, 0, c.width, c.height);
}

/** Fotospots als Kreis mit Fotoapparat, über den Pässen und unter der Tour. */
export function addPhotoLayers(map: MapInstance) {
  const img = cameraImage();
  if (img && !map.hasImage('cumo-camera')) map.addImage('cumo-camera', img, { pixelRatio: 2 });
  map.addSource('photos', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer(
    {
      id: 'photo-circle',
      type: 'circle',
      source: 'photos',
      paint: {
        'circle-radius': 13,
        'circle-color': Colors.surface,
        'circle-opacity': 0.95,
        'circle-stroke-color': Colors.signal,
        'circle-stroke-width': 2.5,
      },
    },
    'tour-casing',
  );
  map.addLayer(
    {
      id: 'photo-count',
      type: 'symbol',
      source: 'photos',
      layout: { 'icon-image': 'cumo-camera', 'icon-allow-overlap': true, 'icon-ignore-placement': true },
    },
    'tour-casing',
  );
}

/** Fahrer der Gruppenfahrt: Kreis in der Farbe der Rolle mit Anfangsbuchstaben. */
export function addMemberLayers(map: MapInstance) {
  map.addSource('members', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'member-circle',
    type: 'circle',
    source: 'members',
    paint: {
      'circle-radius': 13,
      'circle-color': Colors.surface,
      'circle-stroke-width': 3,
      'circle-stroke-color': ['match', ['get', 'role'], 'lead', Colors.signal, 'schluss', Colors.warn, Colors.text],
      'circle-opacity': ['case', ['get', 'stale'], 0.5, 1],
    },
  });
  map.addLayer({
    id: 'member-label',
    type: 'symbol',
    source: 'members',
    layout: {
      'text-field': ['get', 'initial'],
      'text-size': 12,
      'text-font': ['Noto Sans Bold'],
      'text-allow-overlap': true,
    },
    paint: { 'text-color': Colors.text },
  });
  map.addLayer({
    id: 'member-name',
    type: 'symbol',
    source: 'members',
    layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-font': ['Noto Sans Bold'], 'text-offset': [0, 1.6], 'text-anchor': 'top' },
    paint: { 'text-color': Colors.text, 'text-halo-color': Colors.ground, 'text-halo-width': 1.6 },
  });
}

/* ---------- Karteneinstellungen und Ebenen wie in der App (Stand 10.11.2026) ---------- */

/** Satellitenbild als Rasterebene unter den Beschriftungen der Grundkarte (Esri World Imagery, mit Namensnennung) */
export const SAT_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export function addSatelliteLayer(map: MapInstance) {
  map.addSource('sat', { type: 'raster', tiles: [SAT_TILES], tileSize: 256, maxzoom: 19, attribution: 'Satellit: Esri, Maxar, Earthstar Geographics' });
  const layers: { id: string; type: string }[] = map.getStyle().layers ?? [];
  const firstSymbol = layers.find((l) => l.type === 'symbol')?.id;
  map.addLayer({ id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' }, paint: { 'raster-opacity': 1 } }, firstSymbol);
}

/** Darstellung umschalten: Standard, Satellit, 3D Satellit (geneigt) */
export function applyMapStyle(map: MapInstance, style: 'standard' | 'satellit' | '3d') {
  if (!map.getLayer('sat')) return;
  map.setLayoutProperty('sat', 'visibility', style === 'standard' ? 'none' : 'visible');
  const pitch = style === '3d' ? 55 : 0;
  if (Math.abs(map.getPitch() - pitch) > 1) map.easeTo({ pitch, duration: 600 });
}

/** Feine Linien unter der Tour: Meine Touren hell, gefahrene Strecken grün */
export function addBackgroundLines(map: MapInstance) {
  map.addSource('mine', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('drives', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'mine-line', type: 'line', source: 'mine', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': 'rgba(244,244,242,0.45)', 'line-width': 2.5 } }, 'tour-casing');
  map.addLayer({ id: 'drives-line', type: 'line', source: 'drives', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': 'rgba(76,195,138,0.7)', 'line-width': 2.5 } }, 'tour-casing');
}

export function linesGeoJson(lines: LatLon[][]) {
  return {
    type: 'FeatureCollection',
    features: lines.filter((l) => l.length > 1).map((l) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: l.map(toLngLat) } })),
  };
}

/** Gefahrenstellen der Route als Punkte: gesperrt in Signal Orange, prüfen gelb */
export function addWarningLayer(map: MapInstance) {
  map.addSource('warn', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'warn-circle',
    type: 'circle',
    source: 'warn',
    paint: { 'circle-radius': 8, 'circle-color': ['match', ['get', 'c'], 'raus', Colors.signal, Colors.warn], 'circle-stroke-color': Colors.ground, 'circle-stroke-width': 2.5 },
  });
  map.addLayer({
    id: 'warn-label',
    type: 'symbol',
    source: 'warn',
    layout: { 'text-field': '!', 'text-size': 12, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true },
    paint: { 'text-color': Colors.ground },
  });
}

export function warningsGeoJson(tour: Tour) {
  return {
    type: 'FeatureCollection',
    features: tour.warnungen
      .filter((w) => w.klasse !== 'ok')
      .map((w) => ({ type: 'Feature', properties: { c: w.klasse }, geometry: { type: 'Point', coordinates: toLngLat(w.mitte) } })),
  };
}

/** Pins der Community: Routen am Start, Ausfahrten am Treffpunkt, Drivers am Wohnort */
export function addCommunityLayers(map: MapInstance) {
  // Pins bündeln sich zu Kreisen mit Zahl, näher heran lösen sie sich auf (wie in der App, 11.11.)
  map.addSource('community', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 44, clusterMaxZoom: 13 });
  map.addLayer({
    id: 'community-cluster',
    type: 'circle',
    source: 'community',
    filter: ['has', 'point_count'],
    paint: {
      'circle-radius': ['step', ['get', 'point_count'], 20, 10, 23, 100, 27],
      'circle-color': Colors.text,
      'circle-stroke-color': 'rgba(11,11,12,0.55)',
      'circle-stroke-width': 3,
    },
  });
  map.addLayer({
    id: 'community-count',
    type: 'symbol',
    source: 'community',
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 14, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true },
    paint: { 'text-color': Colors.ground },
  });
  map.addLayer({
    id: 'community-circle',
    type: 'circle',
    source: 'community',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': ['case', ['get', 'sel'], 11, 8],
      'circle-color': ['case', ['get', 'sel'], Colors.signal, Colors.surface],
      'circle-stroke-color': ['coalesce', ['get', 'ring'], Colors.signal],
      'circle-stroke-width': 3,
    },
  });
  map.addLayer({
    id: 'community-label',
    type: 'symbol',
    source: 'community',
    filter: ['!', ['has', 'point_count']],
    layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-font': ['Noto Sans Bold'], 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'text-color': Colors.text, 'text-halo-color': Colors.ground, 'text-halo-width': 1.6 },
  });
}

export function communityGeoJson(pins: { id: string; p: LatLon; label: string; ring?: string }[], selected: string | null) {
  return {
    type: 'FeatureCollection',
    features: pins.map((x) => ({ type: 'Feature', properties: { id: x.id, label: x.label, ring: x.ring ?? null, sel: x.id === selected }, geometry: { type: 'Point', coordinates: toLngLat(x.p) } })),
  };
}
