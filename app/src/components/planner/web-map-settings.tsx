/**
 * Karteneinstellungen im Web Planer wie in der App (components/map/map-settings-sheet.tsx): runder Knopf
 * oben rechts auf der Karte, darüber schwebt die Karte mit Darstellung und Ebenen. Die Werte liegen in
 * lib/map-settings (im Browser lokal gespeichert). Wetter gibt es nur in der App (WeatherKit).
 */
import { useEffect, useRef, useState } from 'react';

import { MAP_STYLES, setMapSettings, useMapSettings, type MapSettings } from '@/lib/map-settings';
import { Colors, Radius, Spacing } from '@/constants/theme';

import { Toggle } from './web-parts';
import { BODY, C } from './web-shared';
import { XIcon } from './web-ui';

type LayerKey = 'warnings' | 'passes' | 'passesAll' | 'myTours' | 'drives';

const LAYERS: { key: LayerKey; label: string; note: string }[] = [
  { key: 'warnings', label: 'Gefahrenstellen', note: 'Gesperrte und zu prüfende Stellen auf der Route' },
  { key: 'passes', label: 'Pässe in der Nähe von Start und Ziel', note: 'Bis 50 km um deine Tour, orange die Ikonen' },
  { key: 'passesAll', label: 'Alle Pässe anzeigen', note: 'Auch weit weg von deiner Tour' },
  { key: 'myTours', label: 'Gespeicherte Touren', note: 'Als feine Linien' },
  { key: 'drives', label: 'Gefahrene Strecken', note: 'Deine Fahrten in Grün, so siehst du, was noch fehlt' },
];

const PREVIEW: Record<MapSettings['style'], string> = {
  standard: 'linear-gradient(135deg, #1b1b1e 0%, #26262a 60%, #1b1b1e 100%)',
  satellit: 'linear-gradient(135deg, #2f4a2a 0%, #4b5d35 50%, #6b6a4a 100%)',
  '3d': 'linear-gradient(160deg, #6b6a4a 0%, #3e5530 45%, #24361f 100%)',
};

export function MapSettingsButton(props: { top: number; right: number }) {
  const [open, setOpen] = useState(false);
  const st = useMapSettings();
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', k);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', k);
    };
  }, [open]);
  return (
    <div ref={box} style={{ position: 'absolute', top: props.top, right: props.right, zIndex: 12 }}>
      <button
        aria-label="Karteneinstellungen"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{ width: 44, height: 44, borderRadius: 22, border: 'none', background: Colors.overlay, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke={C.text} strokeWidth="2" strokeLinejoin="round">
          <path d="M12 3l9 5-9 5-9-5z" />
          <path d="M3 13l9 5 9-5" />
        </svg>
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Karte"
          style={{ position: 'absolute', top: 52, right: 0, width: 340, maxWidth: 'calc(100vw - 32px)', maxHeight: '70vh', overflowY: 'auto', boxSizing: 'border-box', background: Colors.overlaySurface, borderRadius: Radius.l, padding: Spacing.l, display: 'flex', flexDirection: 'column', gap: Spacing.l, color: C.text, fontFamily: BODY, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ flex: 1, font: `900 22px Archivo_900Black, Archivo, sans-serif`, textTransform: 'uppercase' }}>Karte</span>
            <button aria-label="Schließen" onClick={() => setOpen(false)} style={{ width: 44, height: 44, borderRadius: 22, border: 'none', background: C.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <XIcon />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: Spacing.s }}>
            <span style={{ font: `600 15px ${BODY}`, color: C.muted }}>Darstellung</span>
            <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: Spacing.s }}>
              {MAP_STYLES.map((m) => {
                const on = st.style === m.id;
                return (
                  <button
                    key={m.id}
                    role="radio"
                    aria-checked={on}
                    onClick={() => setMapSettings({ style: m.id })}
                    style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 6, borderRadius: Radius.m, border: 'none', background: on ? C.surface2 : 'transparent', boxShadow: on ? `inset 0 0 0 2px ${C.signal}` : undefined, cursor: 'pointer', color: on ? C.text : C.muted, font: `600 13px ${BODY}` }}>
                    <span aria-hidden style={{ height: 52, borderRadius: 10, background: PREVIEW[m.id] }} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: Spacing.s }}>
            <span style={{ font: `600 15px ${BODY}`, color: C.muted }}>Auf der Karte</span>
            {LAYERS.filter((l) => l.key !== 'passesAll' || st.passes).map((l) => (
              <Toggle key={l.key} id={`ly-${l.key}`} on={!!st[l.key]} label={l.label} note={l.note} onChange={(v) => setMapSettings({ [l.key]: v })} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
