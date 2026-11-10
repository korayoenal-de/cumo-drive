/**
 * Ebenen und Rückmeldungen im Web Planer nach den Design Prinzipien (Abschnitt 2):
 * Sheet (Optionen, Rückfrage, kurzes Formular) unten in der Seitenleiste, schwebendes Menü am Auslöser (⋯),
 * kompakter Umschalter und Mini Streckenbild. Nur DOM, die App nutzt components/ui.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { thumbShape, type ThumbShape } from '@/lib/route-thumb';
import { flatten, type Tour } from '@/lib/tour';

import { BODY, C, DISPLAY } from './web-shared';

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Ein und Ausblenden ohne Feder: Sheets 300 ms, Optionen 260 ms (wie components/ui/motion.ts) */
function useEnter(ms: number) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return { on, t: `${ms}ms ${EASE_OUT}` };
}

export type SheetRow = { key: string; label: string; hint?: string; danger?: boolean; onPress: () => void; disabled?: boolean };

/**
 * Sheet unten in der Seitenleiste (am Handy über die ganze Breite). Abdunkelung scrim, Tipp daneben schließt.
 * rows: Optionen zu einem Objekt (2 bis 6 Zeilen); children: kurzes Formular oder Rückfrage.
 */
export function WebSheet(props: { title: string; subtitle?: string; rows?: SheetRow[]; onClose: () => void; children?: ReactNode; narrow: boolean }) {
  const { on, t } = useEnter(300);
  const { onClose } = props;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const panel: CSSProperties = {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: props.narrow ? '100%' : 440,
    maxHeight: '86vh',
    overflowY: 'auto',
    boxSizing: 'border-box',
    background: C.surface,
    borderTopLeftRadius: Radius.l,
    borderTopRightRadius: Radius.l,
    padding: '12px 20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: Spacing.l,
    boxShadow: '0 -6px 24px rgba(0,0,0,0.45)',
    transform: on ? 'translateY(0)' : 'translateY(24px)',
    opacity: on ? 1 : 0,
    transition: `transform ${t}, opacity ${t}`,
    color: C.text,
    fontFamily: BODY,
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: on ? Colors.scrim : 'rgba(0,0,0,0)', transition: `background ${t}` }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={props.title} style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 36, height: 5, borderRadius: 3, background: C.line, alignSelf: 'center' }} aria-hidden />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: Spacing.m }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ font: `700 17px/22px ${BODY}` }}>{props.title}</span>
            {props.subtitle ? <span style={{ font: `600 15px/20px ${BODY}`, color: C.muted }}>{props.subtitle}</span> : null}
          </div>
          <button aria-label="Schließen" onClick={onClose} style={roundBtn}>
            <XIcon />
          </button>
        </div>
        {props.rows ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {props.rows.map((r, i) => (
              <button
                key={r.key}
                disabled={r.disabled}
                onClick={r.onPress}
                style={{ ...sheetRow, color: r.danger ? Colors.stopText : C.text, marginTop: r.danger && i > 0 ? Spacing.s : 0, transitionDelay: `${i * 45}ms` }}>
                <span style={{ font: `700 17px/22px ${BODY}` }}>{r.label}</span>
                {r.hint ? <span style={{ font: `600 15px/20px ${BODY}`, color: C.muted }}>{r.hint}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
        {props.children}
      </div>
    </div>
  );
}

/** Rückfrage vor Endgültigem: ganzer Satz als Titel, rote Taste nennt das Verb. */
export function ConfirmSheet(props: { title: string; text?: string; confirmLabel: string; onConfirm: () => void; onClose: () => void; narrow: boolean; busy?: boolean }) {
  return (
    <WebSheet title={props.title} subtitle={props.text} onClose={props.onClose} narrow={props.narrow}>
      <div style={{ display: 'flex', gap: Spacing.s }}>
        <button style={{ ...pillBtn, background: C.surface2, color: C.text }} onClick={props.onClose}>
          Abbrechen
        </button>
        <button style={{ ...pillBtn, background: C.signal, color: '#fff' }} disabled={props.busy} onClick={props.onConfirm}>
          {props.confirmLabel}
        </button>
      </div>
    </WebSheet>
  );
}

export type MenuItem = { key: string; label: string; danger?: boolean; onPress: () => void; disabled?: boolean };

/** ⋯ Knopf mit schwebendem Menü am Auslöser; Tipp daneben oder Escape schließt. */
export function MoreMenu(props: { label: string; items: MenuItem[]; onSurface?: boolean; align?: 'left' | 'right'; up?: boolean }) {
  const [open, setOpen] = useState(false);
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
    <div ref={box} style={{ position: 'relative', flex: 'none' }}>
      <button
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{ ...roundBtn, background: open ? C.line : props.onSurface ? C.surface2 : C.surface }}>
        <DotsIcon />
      </button>
      {open ? (
        <FloatList
          items={props.items}
          up={props.up}
          align={props.align ?? 'right'}
          onPick={(it) => {
            setOpen(false);
            it.onPress();
          }}
        />
      ) : null}
    </div>
  );
}

function FloatList(props: { items: MenuItem[]; align: 'left' | 'right'; up?: boolean; onPick: (it: MenuItem) => void }) {
  const { on, t } = useEnter(260);
  return (
    <div
      role="menu"
      style={{
        position: 'absolute',
        zIndex: 30,
        [props.align]: 0,
        ...(props.up ? { bottom: 52 } : { top: 52 }),
        minWidth: 230,
        padding: Spacing.xs,
        background: C.surface2,
        borderRadius: Radius.m,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        opacity: on ? 1 : 0,
        transform: on ? 'translateY(0)' : `translateY(${props.up ? 6 : -6}px)`,
        transition: `opacity ${t}, transform ${t}`,
      }}>
      {props.items.map((it) => (
        <button
          key={it.key}
          role="menuitem"
          disabled={it.disabled}
          onClick={() => props.onPick(it)}
          style={{ textAlign: 'left', minHeight: 44, padding: '0 12px', border: 'none', background: 'transparent', borderRadius: 10, cursor: 'pointer', font: `600 15px ${BODY}`, color: it.danger ? C.signal : C.text, whiteSpace: 'nowrap' }}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Kompakter Umschalter (Routen, Ausfahrten, Drivers) als Pille mit Reitern */
export function Segmented<T extends string>(props: { value: T; options: { id: T; label: string; badge?: number }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={props.label} style={{ display: 'flex', gap: 4, background: C.surface, borderRadius: Radius.pill, padding: 4, alignSelf: 'flex-start' }}>
      {props.options.map((o) => {
        const on = o.id === props.value;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={on}
            onClick={() => props.onChange(o.id)}
            style={{ height: 44, padding: '0 16px', borderRadius: Radius.pill, border: 'none', background: on ? C.surface2 : 'transparent', color: on ? C.text : C.muted, font: `700 15px ${BODY}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            {o.label}
            {o.badge ? <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: C.signal, color: '#fff', font: `700 13px/20px ${BODY}`, padding: '0 6px' }}>{o.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Mini Streckenbild wie in Meine Touren der App: Linie in Signalfarbe, Start als Punkt.
 * Statt der Tour geht auch eine fertige Form (shape); fehlt beides, bleibt die Fläche als ruhiger Platzhalter.
 */
export function RouteThumb(props: { tour?: Tour; shape?: ThumbShape | null; size?: number }) {
  const size = props.size ?? 56;
  const own = useMemo(() => (props.tour ? thumbShape(flatten(props.tour).map((x) => x.p), size) : null), [props.tour, size]);
  const shape = props.shape !== undefined ? props.shape : own;
  return (
    <div aria-hidden style={{ width: size, height: size, flex: 'none', borderRadius: Radius.m, background: C.surface2, overflow: 'hidden' }}>
      {shape ? (
        <svg width={size} height={size} style={{ animation: props.shape !== undefined ? `cumo-fade 220ms ${EASE_OUT}` : undefined }}>
          <polyline points={shape.points} fill="none" stroke={C.signal} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={shape.start[0]} cy={shape.start[1]} r={3} fill={C.text} />
        </svg>
      ) : null}
    </div>
  );
}

/** Graue Plakette mit Initiale des Absenders (wie FromBadge in der App, Koray 10.11. Variante A) */
export function FromBadge(props: { author?: string | null }) {
  const name = props.author?.trim();
  return (
    <span style={{ alignSelf: 'flex-start', maxWidth: '100%', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px 3px 3px', borderRadius: Radius.pill, background: C.surface2, boxSizing: 'border-box' }}>
      <span aria-hidden style={{ width: 18, height: 18, flex: 'none', borderRadius: 9, background: '#3A3A40', color: C.text, font: `700 10px/18px ${BODY}`, textAlign: 'center' }}>{(name || 'C').charAt(0).toUpperCase()}</span>
      <span style={{ font: `700 13px/16px ${BODY}`, color: '#C9C9CD', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name ? `Von ${name}` : 'Aus der Community'}</span>
    </span>
  );
}

/** Feld mit Label darüber (Formulare im Sheet) */
export function Field(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; area?: boolean; max?: number; id: string }) {
  const style: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 52,
    padding: props.area ? '14px' : '0 14px',
    background: C.surface2,
    color: C.text,
    border: 'none',
    borderRadius: Radius.m,
    font: `500 17px/22px ${BODY}`,
    outline: 'none',
    resize: 'vertical',
  };
  return (
    <label htmlFor={props.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ font: `600 15px ${BODY}`, color: C.muted }}>{props.label}</span>
      {props.area ? (
        <textarea id={props.id} rows={3} value={props.value} maxLength={props.max} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} style={style} />
      ) : (
        <input id={props.id} value={props.value} maxLength={props.max} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} style={style} />
      )}
    </label>
  );
}

export const pillBtn: CSSProperties = { flex: 1, height: 56, borderRadius: Radius.pill, border: 'none', cursor: 'pointer', font: `700 17px ${BODY}` };
export const roundBtn: CSSProperties = { width: 44, height: 44, flex: 'none', borderRadius: 22, border: 'none', background: C.surface2, color: C.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 };
const sheetRow: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, textAlign: 'left', minHeight: 56, padding: '10px 12px', border: 'none', borderRadius: Radius.m, background: 'transparent', cursor: 'pointer' };

/** Getönte Plakette (Status statt Fließtext) */
export function Badge(props: { tone: 'good' | 'warn' | 'signal' | 'muted'; children: ReactNode }) {
  const map = {
    good: [Colors.goodTint, C.good],
    warn: [Colors.warnTint, C.warn],
    signal: [Colors.signalTint, Colors.stopText],
    muted: [C.surface2, C.muted],
  } as const;
  const [bg, fg] = map[props.tone];
  return <span style={{ alignSelf: 'flex-start', font: `700 13px/16px ${BODY}`, color: fg, background: bg, padding: '4px 10px', borderRadius: Radius.pill, whiteSpace: 'nowrap' }}>{props.children}</span>;
}

/** Überschrift eines Bereichs in Archivo (Screen Titel) */
export function ViewTitle(props: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Spacing.m }}>
      <h2 style={{ flex: 1, margin: 0, fontFamily: DISPLAY, fontSize: 30, lineHeight: '34px', textTransform: 'uppercase', color: C.text }}>{props.children}</h2>
      {props.aside}
    </div>
  );
}

export function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <circle cx="5" cy="12" r="2" fill={C.text} />
      <circle cx="12" cy="12" r="2" fill={C.text} />
      <circle cx="19" cy="12" r="2" fill={C.text} />
    </svg>
  );
}

export function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke={C.text} strokeWidth="3" strokeLinecap="round">
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

/** Breite unter 760 px: Karte oben, Planer darunter (Handy, schmales Fenster) */
export function useNarrow(): boolean {
  const q = '(max-width: 760px)';
  const [n, setN] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setN(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return n;
}
