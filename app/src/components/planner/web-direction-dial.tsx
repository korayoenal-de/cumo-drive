/**
 * Richtungsregler im Web Planer wie in der App (direction-dial.tsx): Knopf auf dem Ring in die Himmelsrichtung
 * ziehen oder eine Beschriftung anklicken, rastet auf acht Richtungen ein. In der Mitte Zufall. Pfeiltasten
 * drehen um eine Richtung weiter.
 */
import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';

import { DIRECTIONS, type Direction } from '@/lib/roundtrip';

import { BODY, C } from './web-shared';

const SIZE = 260;
const M = SIZE / 2;
const R = 86;
const KNOB = 22;
const pt = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: M + r * Math.cos(a), y: M + r * Math.sin(a) };
};
const wedge = (deg: number, r: number, spread = 32) => {
  const a = pt(deg - spread, r);
  const b = pt(deg + spread, r);
  return `M ${M} ${M} L ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y} Z`;
};

export function WebDirectionDial(props: { value: Direction; onChange: (d: Direction) => void }) {
  const { value, onChange } = props;
  const box = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const cur = DIRECTIONS.find((d) => d.id === value);
  const deg = drag ?? cur?.bearing ?? null;

  const at = (e: RPointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * SIZE - M;
    const y = ((e.clientY - r.top) / r.height) * SIZE - M;
    return { r: Math.hypot(x, y), deg: ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360 };
  };
  const pick = (d: number) => {
    const s = DIRECTIONS[Math.round(d / 45) % 8];
    if (s.id !== value) onChange(s.id);
  };
  const step = (n: number) => {
    const i = cur ? DIRECTIONS.indexOf(cur) : n > 0 ? -1 : 0;
    onChange(DIRECTIONS[(i + n + 8) % 8].id);
  };
  const knob = deg != null ? pt(deg, R) : null;
  const label = value === 'zufall' ? 'Zufall' : cur!.label;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Richtung der Runde"
        aria-valuetext={label}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') step(1);
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') step(-1);
          else return;
          e.preventDefault();
        }}
        style={{ position: 'relative', width: '100%', maxWidth: SIZE, aspectRatio: '1', outline: 'none', touchAction: 'none' }}>
        <svg
          ref={box}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width="100%"
          height="100%"
          style={{ display: 'block', cursor: drag != null ? 'grabbing' : 'grab', userSelect: 'none' }}
          onPointerDown={(e) => {
            const t = at(e);
            // Ring und Beschriftung greifen, die Mitte gehört dem Zufall
            if (t.r < 55 || t.r > 128) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDrag(t.deg);
            pick(t.deg);
          }}
          onPointerMove={(e) => {
            if (drag == null) return;
            const t = at(e);
            setDrag(t.deg);
            pick(t.deg);
          }}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}>
          <circle cx={M} cy={M} r={R} stroke={C.surface2} strokeWidth={30} fill="none" />
          {deg != null && <path d={wedge(deg, R - 15)} fill={C.signal} opacity={0.22} />}
          {DIRECTIONS.map((d) => {
            const a = pt(d.bearing, R + 27);
            const t1 = pt(d.bearing, R - 9);
            const t2 = pt(d.bearing, R + 9);
            const on = value === d.id;
            const main = d.bearing % 90 === 0;
            return (
              <g key={d.id}>
                <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke={on ? C.signal : C.muted} strokeWidth={main ? 3 : 2} strokeLinecap="round" opacity={on ? 1 : 0.6} />
                <text x={a.x} y={a.y + 5} fontSize={main ? 15 : 12} fontWeight={on ? 800 : 600} fill={on ? C.text : C.muted} textAnchor="middle" style={{ font: `${on ? 800 : 600} ${main ? 15 : 12}px ${BODY}` }}>
                  {d.id}
                </text>
              </g>
            );
          })}
          {knob && (
            <>
              <line x1={M} y1={M} x2={knob.x} y2={knob.y} stroke={C.signal} strokeWidth={3} strokeLinecap="round" opacity={0.5} />
              <circle cx={knob.x} cy={knob.y} r={KNOB / 2 + 3} fill={C.ground} />
              <circle cx={knob.x} cy={knob.y} r={KNOB / 2} fill={C.signal} />
            </>
          )}
        </svg>
        <button
          aria-pressed={value === 'zufall'}
          aria-label="Zufällige Richtung"
          onClick={() => onChange('zufall')}
          style={{
            position: 'absolute', left: '50%', top: '50%', width: '35%', aspectRatio: '1', transform: 'translate(-50%, -50%)', borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: value === 'zufall' ? C.signal : C.surface, color: value === 'zufall' ? '#FFFFFF' : C.text, font: `700 15px ${BODY}`,
          }}>
          Zufall
        </button>
      </div>
      <span style={{ font: `600 13px ${BODY}`, color: C.muted, textAlign: 'center' }}>
        {value === 'zufall' ? 'Die Runde führt in eine zufällige Richtung. Knopf auf dem Ring ziehen für eine feste Richtung.' : `Die Runde führt Richtung ${label}.`}
      </span>
    </div>
  );
}
