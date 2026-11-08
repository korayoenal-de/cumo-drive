/**
 * Fahrspaß Wert im Web Planer, wie in der App (Konzept 7 Rechnung, 8.11.2026): Plakette in den Kennzahlen,
 * Klick öffnet die Rechnung mit gestapeltem Balken, Balken je Teil, Höhenprofil und Prüfung.
 */
import { useEffect, useState } from 'react';

import { TOUR_FUN_NAMES, TOUR_FUN_STEPS, type FunFacet, type TourFun } from '@/lib/fun-score';
import { type ElevationProfile } from '@/lib/stats';
import { Colors } from '@/constants/theme';

import { ElevationChart, Gauge } from './web-parts';
import { C } from './web-shared';
import { S } from './web-styles';

const TONES = ['#E2461C', '#EF6A43', '#F48D6C', '#F7B29A'];

function facetPoints(fun: TourFun): number[] {
  const raw = fun.facets.map((f) => f.weight * f.share * 100);
  const pts = raw.map(Math.floor);
  let left = fun.score - pts.reduce((x, y) => x + y, 0);
  const order = raw.map((r, i) => ({ i, rest: r - Math.floor(r) })).sort((x, y) => y.rest - x.rest);
  for (let k = 0; left > 0 && k < order.length; k++, left--) pts[order[k].i]++;
  return pts;
}

export function FunPillWeb(props: { fun: TourFun; onOpen: () => void }) {
  return (
    <button style={S.funPill} onClick={props.onOpen} aria-label={`Fahrspaß ${props.fun.score} von 100, ${TOUR_FUN_NAMES[props.fun.level]}. Zeigt, wie der Wert entsteht`}>
      <Gauge level={props.fun.level} size={22} />
      <span style={S.metricValue}>{props.fun.score}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M12 11v6M12 7.5v.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function FunDialog(props: {
  fun: TourFun;
  name: string;
  elev: ElevationProfile | null;
  onHoverKm: (km: number | null) => void;
  check: { tone: 'good' | 'warn' | 'none'; text: string } | null;
  onClose: () => void;
}) {
  const { fun } = props;
  const [open, setOpen] = useState<FunFacet['id'] | null>(null);
  const pts = facetPoints(fun);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);
  return (
    <div style={S.overlay} onClick={props.onClose}>
      <div role="dialog" aria-modal="true" aria-label="So entsteht der Fahrspaß Wert" style={S.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Gauge level={fun.level} size={48} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={S.dialogScore}>{fun.score}</span>
              <span style={{ font: S.metricLabel.font, fontWeight: 700, fontSize: 17, color: C.signal }}>{TOUR_FUN_NAMES[fun.level]}</span>
            </span>
            <span style={S.metricLabel}>{props.name}</span>
          </div>
          <button aria-label="Schließen" style={S.closeBtn} onClick={props.onClose}>
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 2, height: 12, borderRadius: 6, overflow: 'hidden', background: C.line }}>
            {pts.map((p, i) => (p > 0 ? <span key={i} style={{ width: `${p}%`, background: TONES[i] }} /> : null))}
          </div>
          <div style={{ position: 'relative', height: 20 }}>
            {TOUR_FUN_STEPS.map((v, i) => (
              <span key={v} style={{ position: 'absolute', left: `${v}%`, transform: 'translateX(-50%)', fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: i + 2 === fun.level ? C.text : C.muted }}>
                {v}
              </span>
            ))}
          </div>
        </div>

        <div>
          {fun.facets.map((f, i) => (
            <button key={f.id} style={S.billRow} aria-expanded={open === f.id} onClick={() => setOpen(open === f.id ? null : f.id)}>
              <span style={S.billPts}>+{pts[i]}</span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 17 }}>{f.label}</span>
                  <span style={S.metricLabel}>von {Math.round(f.weight * 100)}</span>
                </span>
                <span style={S.metricLabel}>{f.value}</span>
                <span style={{ height: 6, borderRadius: 3, background: C.line, overflow: 'hidden', marginTop: 4 }}>
                  <span style={{ display: 'block', height: 6, borderRadius: 3, width: `${Math.round(f.share * 100)}%`, background: TONES[i] }} />
                </span>
                {open === f.id ? <span style={{ ...S.metricLabel, marginTop: 4, lineHeight: 1.4 }}>{f.text}</span> : null}
              </span>
            </button>
          ))}
          <div style={{ ...S.billRow, borderBottom: 'none', cursor: 'default' }}>
            <span style={{ ...S.billPts, color: C.signal }}>{fun.score}</span>
            <span style={{ flex: 1, fontWeight: 700, fontSize: 17 }}>{TOUR_FUN_NAMES[fun.level]}</span>
            <span style={S.metricLabel}>von 100</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={S.metricLabel}>Unterwegs</span>
          {props.elev && props.elev.km.length > 2 ? <ElevationChart e={props.elev} onHoverKm={props.onHoverKm} /> : null}
          {props.check ? (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 14, background: props.check.tone === 'good' ? Colors.goodTint : props.check.tone === 'warn' ? Colors.warnTint : C.surface2 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, flex: 'none', background: props.check.tone === 'good' ? C.good : props.check.tone === 'warn' ? C.warn : C.muted }} />
              <span style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.4 }}>{props.check.text}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
