/**
 * Karte direkt bearbeiten im Web Planer, wie in der App (Koray 11.11.):
 * - Start, Ziel und Zwischenziele mit der Maus (oder dem Finger) greifen und verschieben
 * - die Linie greifen und ziehen: an der Stelle entsteht ein neues Zwischenziel
 * - ein Klick auf einen Punkt öffnet seine Aktionen
 * Während des Ziehens zeigt eine gestrichelte Linie den neuen Verlauf. Danach meldet oben links ein Hinweis
 * „Strecke wird angepasst“ und dann das Ergebnis mit Rückgängig (AdjustChip).
 */
import { useCallback, useEffect, useRef } from 'react';

import { formatKm, type LatLon } from '@/lib/tour';
import { insertVia } from '@/lib/route-edit';
import { Colors } from '@/constants/theme';

import { type MapInstance } from './map-web';
import { BODY, C } from './web-shared';

type Pt = { x: number; y: number };
type LayerEvent = { point: Pt; lngLat: { lat: number; lng: number }; features?: { properties: Record<string, unknown> }[]; preventDefault: () => void; originalEvent?: Event };

/** Ab so vielen Pixeln Bewegung ist es Ziehen statt Klicken */
const DRAG_PX = 5;

const toLngLat = (p: LatLon) => [p[1], p[0]];
const lineJson = (pts: LatLon[]) => ({
  type: 'FeatureCollection',
  features: pts.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts.map(toLngLat) } }] : [],
});
const pointJson = (p: LatLon | null) => ({
  type: 'FeatureCollection',
  features: p ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: toLngLat(p) } }] : [],
});

/** Ebenen für die gestrichelte Vorschau und den gezogenen Punkt (einmal nach dem Laden des Stils) */
export function addDraftLayers(map: MapInstance) {
  map.addSource('draft', { type: 'geojson', data: lineJson([]) });
  map.addSource('draft-pt', { type: 'geojson', data: pointJson(null) });
  // unter den Punkten, damit sie greifbar bleiben
  map.addLayer(
    {
      id: 'draft-line',
      type: 'line',
      source: 'draft',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': Colors.signal, 'line-width': 3, 'line-dasharray': [1.5, 1.5] },
    },
    'wp-circle',
  );
  map.addLayer({
    id: 'draft-dot',
    type: 'circle',
    source: 'draft-pt',
    paint: { 'circle-radius': 12, 'circle-color': Colors.signal, 'circle-stroke-color': Colors.text, 'circle-stroke-width': 3 },
  });
}

/** Gestrichelter Entwurf durch die Punkte, solange eine geänderte Strecke rechnet */
export function setDraft(map: MapInstance | null, pts: LatLon[] | null, dot: LatLon | null = null) {
  if (!map) return;
  map.getSource('draft')?.setData(lineJson(pts ?? []));
  map.getSource('draft-pt')?.setData(pointJson(dot));
}

/** Die alte Strecke blass, solange die neue rechnet */
export function dimTour(map: MapInstance | null, on: boolean) {
  if (!map?.getLayer('tour-line')) return;
  map.setPaintProperty('tour-line', 'line-opacity', on ? 0.35 : 1);
  map.setPaintProperty('tour-casing', 'line-opacity', on ? 0.35 : 1);
}

export type MapEditHandlers = {
  /** Punkt idx (0 Start, dann Zwischenziele, zuletzt Ziel) nach p verschoben */
  onMovePoint: (idx: number, p: LatLon) => void;
  /** Linie an Stelle p gezogen: dort ein Zwischenziel */
  onPullLine: (p: LatLon) => void;
  /** Klick auf einen Punkt ohne Ziehen */
  onPointClick: (idx: number, at: Pt) => void;
};

/**
 * Greifen und Ziehen auf der Karte. pts sind die gesetzten Punkte in Reihenfolge, line die Strecke.
 * Liefert eine Funktion, die sagt, ob der letzte Klick in Wahrheit das Ende eines Ziehens war.
 */
export function useMapEdit(mapRef: { current: MapInstance | null }, ready: boolean, enabled: boolean, pts: LatLon[], canPull: boolean, h: MapEditHandlers) {
  const live = useRef({ pts, enabled, canPull, h });
  useEffect(() => {
    live.current = { pts, enabled, canPull, h };
  });
  const justDragged = useRef(0);

  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    const canvas = () => m.getCanvas() as HTMLCanvasElement;

    /** Ziehen begonnen: idx eines Punkts oder -1 für die Linie */
    const start = (e: LayerEvent, idx: number) => {
      const { enabled: on } = live.current;
      if (!on) return;
      e.preventDefault();
      const from = e.point;
      let moved = false;
      let at: LatLon = [e.lngLat.lat, e.lngLat.lng];
      const draft = (p: LatLon) => {
        const all = live.current.pts;
        if (idx >= 0) return all.map((q, k) => (k === idx ? p : q));
        // Linie gezogen: Punkt dorthin, wo er den kleinsten Umweg macht
        return insertVia(all, p);
      };
      const move = (ev: LayerEvent) => {
        if (!moved && Math.hypot(ev.point.x - from.x, ev.point.y - from.y) < DRAG_PX) return;
        if (!moved) canvas().style.cursor = 'grabbing';
        moved = true;
        at = [ev.lngLat.lat, ev.lngLat.lng];
        setDraft(m, draft(at), at);
      };
      const end = () => {
        m.off('mousemove', move);
        m.off('touchmove', move);
        m.off('mouseup', end);
        m.off('touchend', end);
        canvas().style.cursor = '';
        if (!moved) {
          if (idx >= 0) live.current.h.onPointClick(idx, from);
          setDraft(m, null);
          justDragged.current = Date.now();
          return;
        }
        justDragged.current = Date.now();
        // die Vorschau bleibt stehen, bis die neue Strecke da ist
        setDraft(m, draft(at));
        if (idx >= 0) live.current.h.onMovePoint(idx, at);
        else live.current.h.onPullLine(at);
      };
      m.on('mousemove', move);
      m.on('touchmove', move);
      m.on('mouseup', end);
      m.on('touchend', end);
    };

    const onPoint = (e: LayerEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const touch = e.originalEvent && 'touches' in e.originalEvent ? (e.originalEvent as TouchEvent) : null;
      if (touch && touch.touches.length > 1) return;
      start(e, Number(f.properties.idx));
    };
    const onLine = (e: LayerEvent) => {
      if (!live.current.canPull) return;
      // ein Punkt liegt darüber: der hat Vorrang
      if (m.queryRenderedFeatures([e.point.x, e.point.y], { layers: ['wp-circle'] }).length) return;
      const touch = e.originalEvent && 'touches' in e.originalEvent ? (e.originalEvent as TouchEvent) : null;
      if (touch && touch.touches.length > 1) return;
      start(e, -1);
    };
    const hoverPoint = () => live.current.enabled && (canvas().style.cursor = 'grab');
    const hoverLine = () => live.current.enabled && live.current.canPull && (canvas().style.cursor = 'grab');
    const leave = () => (canvas().style.cursor = '');

    m.on('mousedown', 'wp-circle', onPoint);
    m.on('touchstart', 'wp-circle', onPoint);
    m.on('mousedown', 'tour-casing', onLine);
    m.on('mouseenter', 'wp-circle', hoverPoint);
    m.on('mouseleave', 'wp-circle', leave);
    m.on('mouseenter', 'tour-casing', hoverLine);
    m.on('mouseleave', 'tour-casing', leave);
    return () => {
      m.off('mousedown', 'wp-circle', onPoint);
      m.off('touchstart', 'wp-circle', onPoint);
      m.off('mousedown', 'tour-casing', onLine);
      m.off('mouseenter', 'wp-circle', hoverPoint);
      m.off('mouseleave', 'wp-circle', leave);
      m.off('mouseenter', 'tour-casing', hoverLine);
      m.off('mouseleave', 'tour-casing', leave);
    };
  }, [mapRef, ready]);

  /** true, wenn der Klick gerade zu einem Ziehen oder Punktklick gehörte und nicht als Kartenklick zählen soll */
  return useCallback(() => Date.now() - justDragged.current < 350, []);
}

export type AdjustState =
  | { kind: 'busy' }
  | { kind: 'done'; text: string; warn: boolean; onUndo: () => void };

/** Ergebnistext nach einer Änderung auf der Karte, wie in der App */
export function adjustText(beforeKm: number | null, nowKm: number, spurKmNow: number): { text: string; warn: boolean } {
  if (spurKmNow >= 0.3) return { text: `${formatKm(spurKmNow, 1)} km hin und zurück`, warn: true };
  const d = beforeKm != null ? Math.round(nowKm - beforeKm) : 0;
  return { text: d === 0 ? 'Angepasst' : `${d > 0 ? '+' : '−'}${Math.abs(d)} km`, warn: false };
}

/** Hinweis oben links über der Karte: erst Laden, dann Ergebnis mit Rückgängig (7 s bei Warnung, sonst 5 s) */
export function AdjustChip(props: { state: AdjustState | null; onDone: () => void }) {
  const { state: shown, onDone } = props;
  useEffect(() => {
    if (shown?.kind !== 'done') return;
    const t = setTimeout(onDone, shown.warn ? 7000 : 5000);
    return () => clearTimeout(t);
  }, [shown, onDone]);
  if (!shown) return null;
  const base: React.CSSProperties = {
    position: 'absolute', top: 12, left: 12, zIndex: 6, height: 44, display: 'flex', alignItems: 'center', gap: 10,
    padding: '0 18px 0 14px', borderRadius: 22, background: 'rgba(11,11,12,0.86)', boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
    font: `700 15px ${BODY}`, color: '#FFFFFF', overflow: 'hidden', maxWidth: 'calc(100% - 90px)', animation: 'cdChipIn 220ms cubic-bezier(0.22,1,0.36,1)',
  };
  if (shown.kind === 'busy')
    return (
      <div style={base} role="status" aria-live="polite">
        <style>{`@keyframes cdChipIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}@keyframes cdPulse{0%,100%{opacity:1}50%{opacity:.35}}@keyframes cdBar{from{width:6%}to{width:92%}}`}</style>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: C.signal, animation: 'cdPulse 1.04s infinite' }} />
        Strecke wird angepasst
        <span style={{ position: 'absolute', left: 0, bottom: 0, height: 3, background: C.signal, animation: 'cdBar 7s cubic-bezier(0.22,1,0.36,1) forwards' }} />
      </div>
    );
  return (
    <button
      style={{ ...base, border: 'none', cursor: 'pointer' }}
      onClick={shown.onUndo}
      aria-label={`${shown.text}. Rückgängig`}>
      <style>{`@keyframes cdChipIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}`}</style>
      <span style={{ color: shown.warn ? C.warn : '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shown.text}</span>
      <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.18)' }} />
      <span style={{ color: C.signal, whiteSpace: 'nowrap' }}>↶ Rückgängig</span>
    </button>
  );
}
