/**
 * Karteneinstellungen im Web Planer wie in der App (components/map/map-settings-sheet.tsx): runder Knopf
 * oben rechts auf der Karte, darüber schweben die Ebenen. Satellit gibt es nur in der App (Apple Karten),
 * im Web fehlt dafür eine kommerziell freie Quelle. Die Werte liegen in
 * lib/map-settings (im Browser lokal gespeichert). Wetter gibt es nur in der App (WeatherKit).
 */
import { useEffect, useRef, useState } from 'react';

import { setMapSettings, useMapSettings } from '@/lib/map-settings';
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
