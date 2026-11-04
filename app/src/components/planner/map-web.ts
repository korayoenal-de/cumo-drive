/**
 * Lädt MapLibre GL im Browser zur Laufzeit (fertiger Build vom CDN) und zeichnet Touren.
 * So bleibt der Expo Bundler frei von Worker Dateien; die App auf dem Handy nutzt später
 * eine native Karte.
 */
import type { LatLon, Tour } from '@/lib/tour';

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
      properties: { label: i === 0 ? 'S' : i === points.length - 1 ? 'Z' : String(i), kind: i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'via' },
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
    paint: { 'line-color': '#0B0B0C', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 5, 14, 11] },
  });
  map.addLayer({
    id: 'tour-line',
    type: 'line',
    source: 'tour',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ['match', ['get', 'c'], 'raus', '#E2461C', 'pruefen', '#E8B03A', '#F4F4F2'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 6, ['match', ['get', 'c'], 'ok', 2.5, 4], 14, ['match', ['get', 'c'], 'ok', 6, 8]],
    },
  });
  map.addSource('hover', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'hover-dot',
    type: 'circle',
    source: 'hover',
    paint: { 'circle-radius': 7, 'circle-color': '#E2461C', 'circle-stroke-color': '#F4F4F2', 'circle-stroke-width': 3 },
  });
  map.addLayer({
    id: 'wp-circle',
    type: 'circle',
    source: 'wp',
    paint: {
      'circle-radius': 11,
      'circle-color': ['match', ['get', 'kind'], 'via', '#F4F4F2', '#E2461C'],
      'circle-stroke-color': '#0B0B0C',
      'circle-stroke-width': 2.5,
    },
  });
  map.addLayer({
    id: 'wp-label',
    type: 'symbol',
    source: 'wp',
    layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true },
    paint: { 'text-color': ['match', ['get', 'kind'], 'via', '#0B0B0C', '#FFFFFF'] },
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
        'circle-color': ['case', ['get', 'closed'], '#5A5A60', ['match', ['get', 'tier'], 'ikone', '#E8B03A', 'bekannt', '#F4F4F2', '#9A9A9F']],
        'circle-stroke-color': '#0B0B0C',
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
        'text-color': ['case', ['get', 'closed'], '#7A7A80', ['match', ['get', 'tier'], 'ikone', '#E8B03A', '#F4F4F2']],
        'text-halo-color': '#0B0B0C',
        'text-halo-width': 1.6,
      },
    },
    'tour-casing',
  );
}
