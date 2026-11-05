/** Bausteine des Web Planers: Ortssuche, Abschnitt, Chip, Schalter, Höhenprofil, Kennzahl, Status. */
import { useEffect, useState, type ReactNode } from 'react';

import { searchPlaces, searchTowns, type Place } from '@/lib/geocode';
import { type LatLon } from '@/lib/tour';
import { type ElevationProfile } from '@/lib/stats';
import { passState, usePassLive } from '@/lib/pass-live';
import { PASSES, passPoint, passSummary, searchPasses } from '@/lib/passes';
import { Spacing, Type } from '@/constants/theme';

import { C, DISPLAY } from './web-shared';
import { S } from './web-styles';

/* ---------- Bausteine ---------- */

export function PlaceSearch(props: { near?: LatLon; placeholder: string; onPick: (p: Place) => void }) {
  const live = usePassLive();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const enough = q.trim().length >= 3;
  useEffect(() => {
    if (q.trim().length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const passHits: Place[] = searchPasses(PASSES, q, 3).map((p) => ({
        name: p.name,
        detail: `Pass, ${passSummary(p, undefined, passState(p, live).note)}, ${p.region}`,
        p: passPoint(p),
      }));
      // Städte und Gemeinden zuerst, damit "Heppenheim" die Stadt ist und nicht der Ortsteil von Worms
      Promise.all([searchTowns(q, props.near, ctrl.signal).catch(() => [] as Place[]), searchPlaces(q, props.near, ctrl.signal)])
        .then(([towns, places]) => {
          const near = (a: Place, b: Place) => Math.abs(a.p[0] - b.p[0]) + Math.abs(a.p[1] - b.p[1]) < 0.02;
          const merged: Place[] = [];
          for (const x of [...towns.slice(0, 3), ...places]) if (!merged.some((y) => y.name === x.name && near(x, y))) merged.push(x);
          const h = merged.slice(0, 7);
          setHits([...passHits, ...h.filter((x) => !passHits.some((y) => y.name === x.name))]);
          setOpen(true);
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, props.near, live]);
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={`search-${props.placeholder.replace(/\W+/g, '-')}`}
        aria-label={props.placeholder}
        placeholder={props.placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        style={S.search}
      />
      {open && enough && hits.length ? (
        <ul style={S.dropdown} role="listbox">
          {hits.map((h, i) => (
            <li key={i} style={{ listStyle: 'none' }}>
              <button
                style={S.dropItem}
                onClick={() => {
                  props.onPick(h);
                  setQ('');
                  setHits([]);
                  setOpen(false);
                }}>
                <span>{h.name}</span>
                <span style={S.dropDetail}>{h.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Section(props: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section style={S.section}>
      <div style={S.sectionHead}>
        <span style={S.label}>{props.title}</span>
        {props.aside ? <span style={S.aside}>{props.aside}</span> : null}
      </div>
      {props.children}
    </section>
  );
}

/** onSurface: Chip liegt in einer Surface Box und bekommt die hellere Füllung. */
export function Chip(props: { on: boolean; onClick: () => void; onSurface?: boolean; children: ReactNode }) {
  return (
    <button aria-pressed={props.on} onClick={props.onClick} style={props.on ? S.chipOn : props.onSurface ? S.chipOnSurface : S.chip}>
      {props.children}
    </button>
  );
}

export function Toggle(props: { id: string; on: boolean; label: string; note?: string; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={props.id} style={S.toggleRow}>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span>{props.label}</span>
        {props.note ? <span style={S.small}>{props.note}</span> : null}
      </span>
      <input id={props.id} type="checkbox" checked={props.on} onChange={(e) => props.onChange(e.target.checked)} style={{ display: 'none' }} />
      <span style={{ ...S.switch, background: props.on ? C.signal : C.line }}>
        <span style={{ ...S.knob, transform: props.on ? 'translateX(18px)' : 'translateX(0)' }} />
      </span>
    </label>
  );
}

export function ElevationChart(props: { e: ElevationProfile; onHoverKm: (km: number | null) => void }) {
  const { e } = props;
  const W = 360;
  const H = 86;
  const maxKm = e.km[e.km.length - 1] || 1;
  const lo = Math.floor(e.min / 100) * 100;
  const hi = Math.ceil(e.max / 100) * 100 || lo + 100;
  const x = (km: number) => (km / maxKm) * W;
  const y = (m: number) => H - 4 - ((m - lo) / (hi - lo)) * (H - 12);
  const d = e.km.map((k, i) => `${i ? 'L' : 'M'}${x(k).toFixed(1)},${y(e.m[i]).toFixed(1)}`).join(' ');
  const [hover, setHover] = useState<number | null>(null);
  const idx = hover === null ? -1 : e.km.findIndex((k) => k >= hover);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: Spacing.xs }}>
      <div style={S.sectionHead}>
        <span style={S.label}>Höhenprofil</span>
        <span style={S.small}>{idx >= 0 ? `km ${Math.round(e.km[idx])}: ${Math.round(e.m[idx])} m` : `${lo} bis ${hi} m`}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', background: C.surface, borderRadius: 10, cursor: 'crosshair' }}
        role="img"
        aria-label={`Höhenprofil von ${e.min} bis ${e.max} Meter`}
        onMouseMove={(ev) => {
          const r = (ev.currentTarget as SVGSVGElement).getBoundingClientRect();
          const km = ((ev.clientX - r.left) / r.width) * maxKm;
          setHover(km);
          props.onHoverKm(km);
        }}
        onMouseLeave={() => {
          setHover(null);
          props.onHoverKm(null);
        }}>
        <path d={`${d} L${W},${H} L0,${H} Z`} fill={C.surface2} />
        <path d={d} fill="none" stroke={C.text} strokeWidth={1.4} />
        {idx >= 0 ? <line x1={x(e.km[idx])} x2={x(e.km[idx])} y1={0} y2={H} stroke={C.signal} strokeWidth={1.5} /> : null}
      </svg>
    </div>
  );
}

export function Stat(props: { big: string; unit?: string; label: string; tone?: 'stop' | 'good'; small?: boolean }) {
  const color = props.tone === 'stop' ? C.signal : props.tone === 'good' ? C.good : C.text;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: DISPLAY, fontSize: props.small ? 20 : 30, lineHeight: 1, color, fontVariantNumeric: 'tabular-nums' }}>
        {props.big}
        {props.unit ? <span style={{ fontSize: Type.body }}> {props.unit}</span> : null}
      </span>
      <span style={S.small}>{props.label}</span>
    </div>
  );
}

export function Status(props: { text: string; onCancel: () => void }) {
  return (
    <div style={S.status} role="status">
      <span style={S.spinner} />
      <span style={{ flex: 1 }}>{props.text}</span>
      <button style={S.link} onClick={props.onCancel}>
        Abbrechen
      </button>
    </div>
  );
}
