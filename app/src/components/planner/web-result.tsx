/**
 * Ergebnis im Web Planer wie in der App (planner-result.tsx, tour-mode.tsx): Kennzahlen, Hinweise,
 * Highlights nach Fahrspaß Pegel, Warnungen mit Prüfhinweis, Höhenprofil und Stopps an der Strecke.
 * Für Route und Rundtour gleich; die Rechnung kommt aus lib (findHighlights, warningText, tourFun).
 */
import { useEffect, useMemo, useState } from 'react';

import { FUN_NAMES, toFunLevel } from '@/components/ui/fun-gauge';
import { warningText, TRUST_WITH_WARNINGS } from '@/components/planner/planner-parts';
import { bigDuration } from '@/components/planner/planner-shared';
import { type TourFun } from '@/lib/fun-score';
import { findHighlights, highlightFacts, type Highlight } from '@/lib/navigation/highlights';
import { cumulativeKm } from '@/lib/navigation/route';
import { closedHint, passState, usePassLive } from '@/lib/pass-live';
import { PASS_STATUS_URL, PASSES, passesAlong, TIER_LABEL, warnSpeech } from '@/lib/passes';
import { elevationProfile, type ElevationProfile } from '@/lib/stats';
import { formatKm, type LatLon, type Tour, type Warning } from '@/lib/tour';
import { Colors, Radius, Spacing } from '@/constants/theme';

import { Metric, Section, ElevationChart, Gauge } from './web-parts';
import { FunPillWeb } from './web-fun';
import { BODY, C, type PlannedTour } from './web-shared';
import { S } from './web-styles';

/** Kennzahlen: Strecke, Fahrzeit, Fahrspaß (ohne Fahrspaß die Kurven), wie Stats in der App */
export function ResultStats(props: { tour: PlannedTour; curves: number; fun: TourFun | null; onFun: () => void; delta?: number | null }) {
  const { tour, fun } = props;
  return (
    <div style={S.metrics}>
      <Metric label="Strecke" value={`${formatKm(tour.laenge_km, 0)} km`} />
      <Metric label="Fahrzeit" value={tour.minutes ? bigDuration(tour.minutes) : '…'} />
      {fun ? (
        <Metric label={props.delta != null ? `Fahrspaß ${props.delta >= 0 ? `+${props.delta}` : `minus ${Math.abs(props.delta)}`}` : 'Fahrspaß'} value="">
          <FunPillWeb fun={fun} onOpen={props.onFun} />
        </Metric>
      ) : (
        <Metric label="Kurven" value={String(props.curves)} />
      )}
    </div>
  );
}

/** Alles unter den Kennzahlen: Passhinweis, Highlights, Warnungen, Höhenprofil */
export function ResultDetails(props: { tour: PlannedTour; line: LatLon[]; onFly: (p: LatLon) => void; onHoverKm: (km: number | null) => void; elev: ElevationProfile | null }) {
  const live = usePassLive();
  const passes = useMemo(() => passesAlong(PASSES, props.line), [props.line]);
  const hint = closedHint(passes.map((x) => x.pass), live);
  const warnings = props.tour.warnungen.filter((w) => w.klasse !== 'ok');
  return (
    <>
      {hint ? (
        <a href={PASS_STATUS_URL} target="_blank" rel="noreferrer" style={{ ...S.winterNote, textDecoration: 'none' }}>
          <b style={{ fontSize: 15 }}>{hint.title}</b>
          <span style={{ fontSize: 15 }}>{hint.text} Klick für den aktuellen Passstatus.</span>
        </a>
      ) : null}
      <HighlightsWeb line={props.line} onFly={props.onFly} />
      {warnings.length ? <WarningsWeb warnings={warnings} checked={props.tour.geprueft !== false} onFly={props.onFly} /> : null}
      {props.elev && props.elev.km.length > 2 ? <ElevationChart e={props.elev} onHoverKm={props.onHoverKm} /> : null}
    </>
  );
}

/** Höhenprofil einer Linie nachladen (gehört genau zu dieser Linie) */
export function useElevation(line: LatLon[]): ElevationProfile | null {
  const [st, setSt] = useState<{ line: LatLon[]; data: ElevationProfile } | null>(null);
  useEffect(() => {
    if (line.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      elevationProfile(line, ctrl.signal)
        .then((data) => setSt({ line, data }))
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [line]);
  return st && st.line === line ? st.data : null;
}

const KIND_LABEL: Record<string, string> = { pass: 'Pass', rallye: 'Rallyestrecke', bergrennen: 'Bergrennstrecke', aussicht: 'Aussichtsstrecke', strecke: 'Traumstrecke' };

/** Highlights nach Fahrspaß Pegel gerankt; Klick klappt die Details an Ort und Stelle auf */
export function HighlightsWeb(props: { line: LatLon[]; onFly: (p: LatLon) => void }) {
  const live = usePassLive();
  const cum = useMemo(() => (props.line.length < 2 ? [] : cumulativeKm(props.line)), [props.line]);
  const list = useMemo(
    () => (props.line.length < 2 ? [] : findHighlights(props.line, cum, null).sort((a, b) => b.level - a.level || a.startKm - b.startKm)),
    [props.line, cum],
  );
  const [open, setOpen] = useState<string | null>(null);
  if (!list.length) return null;
  const at = (h: Highlight): LatLon => {
    const i = cum.findIndex((k) => k >= (h.startKm + h.endKm) / 2);
    return props.line[Math.max(0, i)];
  };
  return (
    <Section title={`Highlights auf der Strecke (${list.length})`}>
      <div style={{ background: C.surface, borderRadius: Radius.l, padding: Spacing.xs, display: 'flex', flexDirection: 'column' }}>
        {list.map((h) => {
          const lv = toFunLevel(h.level);
          const pass = h.kind === 'pass' ? PASSES.find((p) => p.id === h.id) : undefined;
          const state = pass ? passState(pass, live) : null;
          const isOpen = open === h.id;
          return (
            <div key={h.id} style={{ display: 'flex', flexDirection: 'column' }}>
              <button
                aria-expanded={isOpen}
                aria-label={`${h.name}, ${FUN_NAMES[lv]}, Details`}
                onClick={() => {
                  setOpen(isOpen ? null : h.id);
                  if (!isOpen) props.onFly(at(h));
                }}
                style={{ display: 'flex', alignItems: 'center', gap: Spacing.m, minHeight: 64, padding: '8px 10px', border: 'none', borderRadius: Radius.m, background: isOpen ? C.surface2 : 'transparent', color: C.text, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ font: `700 17px/22px ${BODY}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                  <span style={{ font: `600 15px/20px ${BODY}`, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{`km ${Math.round(h.startKm)} · ${highlightFacts(h)}`}</span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 72 }}>
                  <Gauge level={lv} size={28} label={`Fahrspaß ${FUN_NAMES[lv]}`} />
                  <span style={{ font: `700 13px ${BODY}`, color: C.muted }}>{FUN_NAMES[lv]}</span>
                </span>
              </button>
              {isOpen ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: Spacing.s, padding: '8px 12px 14px', font: `500 15px/21px ${BODY}`, color: C.muted }}>
                  <span style={{ color: C.text, fontWeight: 600 }}>{[KIND_LABEL[h.kind] ?? 'Strecke', pass ? TIER_LABEL[pass.tier] : h.note, pass?.region].filter(Boolean).join(' · ')}</span>
                  <span>
                    {[`${Math.max(1, Math.round(h.endKm - h.startKm))} km`, h.hairpins >= 3 ? `${h.hairpins} Kehren` : null, h.ele ? `${h.ele.toLocaleString('de-DE')} m hoch` : null, `ab km ${Math.round(h.startKm)}`].filter(Boolean).join(', ')}
                  </span>
                  {h.race ? <span><b style={{ color: C.text }}>{h.race.name}.</b> {h.race.note}</span> : null}
                  {pass && (pass.winter_closed || state?.closed) ? (
                    <span style={{ color: C.warn }}>{[state?.closed ? 'Gerade gesperrt.' : 'Wintersperre.', state?.note, pass.closed_months ? `Meist gesperrt ${pass.closed_months}.` : null].filter(Boolean).join(' ')}</span>
                  ) : null}
                  {h.warn?.length ? (
                    <span style={{ color: C.warn, fontWeight: 700 }}>{[warnSpeech(h.warn), pass?.car_note ? `${pass.car_note}.` : null].filter(Boolean).join(' ')}</span>
                  ) : pass?.car_note ? (
                    <span>Für Sportwagen: {pass.car_note}</span>
                  ) : null}
                  {pass?.source ? (
                    <a href={pass.source} target="_blank" rel="noreferrer" style={{ color: C.signal, fontWeight: 700, textDecoration: 'none' }}>
                      Mehr dazu
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/** Warnungen mit Prüfhinweis; Breiten mit höchstens zwei Nachkommastellen (warningText nutzt trimDecimals) */
export function WarningsWeb(props: { warnings: Warning[]; checked: boolean; onFly: (p: LatLon) => void }) {
  return (
    <Section title={`Warnungen (${props.warnings.length})`}>
      {props.checked ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: Spacing.s, color: C.muted, fontSize: 15 }}>
          <span style={{ ...S.dot, background: C.good }} />
          {TRUST_WITH_WARNINGS}
        </span>
      ) : null}
      <div style={{ background: C.surface, borderRadius: Radius.l, padding: Spacing.xs, display: 'flex', flexDirection: 'column' }}>
        {props.warnings.map((w, i) => (
          <button
            key={i}
            onClick={() => props.onFly(w.mitte)}
            style={{ display: 'flex', alignItems: 'flex-start', gap: Spacing.m, padding: '10px 10px', border: 'none', borderRadius: Radius.m, background: 'transparent', color: C.text, cursor: 'pointer', textAlign: 'left', font: `500 15px/21px ${BODY}` }}>
            <span aria-label={w.klasse === 'raus' ? 'Sperrung' : 'Warnung'} style={{ ...S.dot, width: 10, height: 10, borderRadius: 5, marginTop: 6, background: w.klasse === 'raus' ? C.signal : C.warn }} />
            <span style={{ flex: 1 }}>{warningText(w)}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

/** Kleine Statuszeile mit Punkt (gespeichert, Hinweise) */
export function StatusLine(props: { tone: 'good' | 'warn' | 'muted'; text: string }) {
  return (
    <span style={S.syncLine} role="status">
      <span style={{ ...S.dot, background: props.tone === 'good' ? C.good : props.tone === 'warn' ? C.warn : C.muted }} />
      {props.text}
    </span>
  );
}

export const tintBox = (tone: 'good' | 'warn' | 'signal') => ({
  padding: '12px 14px',
  borderRadius: Radius.m,
  background: tone === 'good' ? Colors.goodTint : tone === 'warn' ? Colors.warnTint : Colors.signalTint,
  color: tone === 'good' ? C.good : tone === 'warn' ? C.warn : Colors.stopText,
  font: `600 15px/21px ${BODY}`,
});

export type { Tour };
