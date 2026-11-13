/**
 * Web Planer, Modus Rundtour wie in der App (planner.tsx, planner-result.tsx): Start, Länge in km oder als
 * Dauer, Richtung oder Zufall, Vermeiden; danach das Ergebnis mit Kennzahlen, Highlights, Warnungen,
 * Höhenprofil, Stopps und deinen bisherigen Runden. Neu würfeln bringt eine andere Runde gleicher Länge
 * und sagt ehrlich, wenn es keine bessere mehr gibt (noGoodAlternative aus lib/smart-roundtrip).
 */
import { useCallback, useRef, useState } from 'react';

import { buildTour, newSeed, toPlanError, type PlanPhase, type TourRequest } from '@/components/planner/create-tour';
import { reverseName } from '@/lib/geocode';
import { formatMinutes, targetKm } from '@/lib/intent';
import { saveTour, syncLibrary } from '@/lib/library';
import { exportTour } from '@/lib/route-file';
import { DIRECTIONS, type Direction } from '@/lib/roundtrip';

import { WebDirectionDial } from './web-direction-dial';
import { logSignal } from '@/lib/signals';
import { noGoodAlternative } from '@/lib/smart-roundtrip';
import { tourFun, TOUR_FUN_NAMES, type TourFun } from '@/lib/fun-score';
import { countCurves } from '@/lib/stats';
import { flatten, PROFILE_CHOICES, type LatLon, type Profile } from '@/lib/tour';
import { clearAvoidedPasses } from '@/lib/avoid-pass';
import { type Avoid } from '@/lib/valhalla';
import { showToast } from '@/lib/toast';
import { spliceStop } from '@/lib/stop-splice';
import { Spacing } from '@/constants/theme';

import { type PlannedTour as LibPlannedTour } from '@/lib/plan';
import { Accordion, Chip, Gauge, PlaceSearch, Section, Toggle } from './web-parts';
import { ResultDetails, ResultStats, StatusLine } from './web-result';
import { StopsPanel } from './web-tour-panels';
import { BODY, C, STEP_TEXT } from './web-shared';
import { S } from './web-styles';
import { ConfirmSheet, MoreMenu } from './web-ui';

export const KM_STEPS = [25, 50, 75, 100, 150, 200, 300];
const MIN_STEPS = [60, 90, 120, 180, 240, 300, 420];
/** Neu würfeln ohne gute Alternative (wie in der App, Koray 10.11.) */
export const NO_MORE_ROLLS = 'Eine bessere Runde gibt es hier gerade nicht. Probier eine andere Richtung oder Länge.';

const PHASE_TEXT: Record<PlanPhase, string> = { ...STEP_TEXT, start: 'Startort wird bestimmt' };

export type Roll = { tour: LibPlannedTour; req: TourRequest; fun: TourFun | null };
export type RoundState = { rolls: Roll[]; idx: number; savedId: string | null; savedFor: LibPlannedTour | null; note: string | null };

const EMPTY: RoundState = { rolls: [], idx: -1, savedId: null, savedFor: null, note: null };

/**
 * Zustand und Ablauf der Rundtour: bauen, neu würfeln (mit gezeigten Linien, damit etwas anderes kommt),
 * zu einer früheren Runde zurück, speichern. setBusy und setError zeigen den Fortschritt in der Seitenleiste.
 */
export function useRoundTrip(opts: { setBusy: (s: string | null) => void; setError: (s: string | null) => void; onShow: (t: LibPlannedTour) => void }) {
  const [st, setSt] = useState<RoundState>(EMPTY);
  const abort = useRef<AbortController | null>(null);
  const exhausted = useRef<TourRequest | null>(null);
  const { setBusy, setError, onShow } = opts;

  const run = useCallback(
    async (req: TourRequest, keep: boolean) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setError(null);
      setBusy(PHASE_TEXT.route);
      if (!keep) exhausted.current = null;
      setSt((s) => ({ ...s, note: null }));
      const earlier = keep ? st.rolls.filter((r) => r.req === req) : [];
      const shown = earlier.map((r) => flatten(r.tour).map((x) => x.p));
      try {
        const step = (p: PlanPhase) => !ctrl.signal.aborted && setBusy(PHASE_TEXT[p]);
        let tour = await buildTour(req, newSeed(), step, ctrl.signal, shown);
        if (earlier.length) {
          // ohne gute Alternative einmal still mit anderem Würfelwert nachlegen, dann ehrlich sagen
          const best = Math.max(...earlier.map((r) => r.fun?.score ?? 0));
          const weak = (t: LibPlannedTour) => noGoodAlternative(t, earlier.map((r) => r.tour), req.km, tourFun(flatten(t).map((x) => x.p))?.score ?? null, best);
          if (weak(tour) && !ctrl.signal.aborted) tour = await buildTour(req, newSeed(), step, ctrl.signal, [...shown, flatten(tour).map((x) => x.p)]);
          if (weak(tour) && !ctrl.signal.aborted) {
            exhausted.current = req;
            setSt((s) => ({ ...s, note: NO_MORE_ROLLS }));
            return;
          }
        }
        if (ctrl.signal.aborted) return;
        const fun = tourFun(flatten(tour).map((x) => x.p));
        logSignal('geplant', tour, { mode: 'rundtour', profile: req.profile, suggested: true, fun: fun?.score ?? null });
        const item: Roll = { tour, req, fun };
        setSt((s) => {
          const rolls = keep ? [...s.rolls, item].slice(-5) : [item];
          return { rolls, idx: rolls.length - 1, savedId: null, savedFor: null, note: null };
        });
        onShow(tour);
      } catch (e) {
        const err = toPlanError(e, ctrl.signal);
        if (err.kind !== 'aborted') setError(err.message);
      } finally {
        if (abort.current === ctrl) setBusy(null);
      }
    },
    [st.rolls, setBusy, setError, onShow],
  );

  const cur = st.idx >= 0 ? st.rolls[st.idx] : null;
  return {
    state: st,
    current: cur,
    create: (req: TourRequest) => {
      // Neue Runde: ausgelassene Pässe der vorigen gelten nicht mehr
      clearAvoidedPasses();
      void run(req, false);
    },
    /** Auslassen oder Wieder einplanen (13.11.): dieselbe Anfrage neu planen */
    replan: () => {
      if (cur) void run(cur.req, false);
    },
    reroll: () => {
      if (!cur) return;
      logSignal('neu_gewuerfelt', cur.tour, { mode: 'rundtour', profile: cur.req.profile, suggested: true });
      if (exhausted.current === cur.req) {
        setSt((s) => ({ ...s, note: NO_MORE_ROLLS }));
        return;
      }
      void run(cur.req, true);
    },
    pick: (i: number) => {
      const r = st.rolls[i];
      if (!r) return;
      setSt((s) => ({ ...s, idx: i, note: null, savedId: null, savedFor: null }));
      onShow(r.tour);
    },
    save: () => {
      if (!cur) return;
      const t = saveTour({ ...cur.tour, curves: countCurves(flatten(cur.tour).map((x) => x.p)), profile: cur.req.profile }, '', st.savedId ?? undefined);
      setSt((s) => ({ ...s, savedId: t.id, savedFor: cur.tour }));
      void syncLibrary();
      showToast('Unter Touren gespeichert, auch in der App');
    },
    /** Stopp einplanen, die Runde bleibt eine Runde (spliceStop wie in der App) */
    addStop: async (p: LatLon) => {
      if (!cur) return;
      setBusy('Stopp wird eingeplant');
      try {
        const t = await spliceStop(cur.tour, p, cur.req.profile, cur.req.avoid);
        const item: Roll = { ...cur, tour: t, fun: tourFun(flatten(t).map((x) => x.p)) };
        setSt((s) => ({ ...s, rolls: s.rolls.map((r, i) => (i === s.idx ? item : r)), savedFor: null, savedId: s.savedId }));
        onShow(t);
        showToast('Stopp eingeplant');
      } catch {
        showToast('Der Stopp ließ sich nicht einplanen', { tone: 'error' });
      } finally {
        setBusy(null);
      }
    },
    discard: () => {
      abort.current?.abort();
      setSt(EMPTY);
    },
    cancel: () => abort.current?.abort(),
  };
}

export type RoundTrip = ReturnType<typeof useRoundTrip>;

/** Formular der Rundtour: Start, Länge, Richtung, Vermeiden, Tour erstellen */
export function RoundTripPanel(props: {
  initialStart: { p: LatLon; name: string } | null;
  center: () => LatLon | null;
  profile: Profile;
  setProfile: (p: Profile) => void;
  avoid: Avoid;
  setAvoid: (a: Avoid) => void;
  busy: boolean;
  onCreate: (req: TourRequest) => void;
}) {
  const [start, setStart] = useState<{ p: LatLon; name: string } | null>(props.initialStart);
  const [lengthBy, setLengthBy] = useState<'km' | 'dauer'>('km');
  const [kmIdx, setKmIdx] = useState(3);
  const [minIdx, setMinIdx] = useState(2);
  const [dir, setDir] = useState<Direction>('zufall');
  const [locError, setLocError] = useState<string | null>(null);
  const km = lengthBy === 'km' ? KM_STEPS[kmIdx] : targetKm({ minutes: MIN_STEPS[minIdx] }, props.profile);

  const useLocation = () => {
    setLocError(null);
    if (!navigator.geolocation) {
      setLocError('Dein Browser gibt keinen Standort heraus. Wähle den Start über die Suche.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const p: LatLon = [pos.coords.latitude, pos.coords.longitude];
        setStart({ p, name: await reverseName(p) });
      },
      () => setLocError('Standort nicht freigegeben. Erlaube ihn im Browser oder wähle den Start über die Suche.'),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  const avoidText = [props.avoid.closures && 'Sperrungen', props.avoid.rough && 'rauer Belag', props.avoid.ferries && 'Fähren', props.avoid.tolls && 'Maut'].filter(Boolean).join(', ') || 'Nichts';
  const stepBtn = { width: 52, height: 52, borderRadius: 26, border: 'none', background: C.surface2, color: C.text, font: `700 22px ${BODY}`, cursor: 'pointer' } as const;

  return (
    <div style={S.stack}>
      <Section title="Start">
        {start ? (
          <div style={S.startRow}>
            <span>{start.name}</span>
            <button style={{ ...S.link, fontSize: 15 }} onClick={() => setStart(null)}>
              ändern
            </button>
          </div>
        ) : (
          <div style={S.stackTight}>
            <div style={S.btnRow}>
              <button style={S.secondary} onClick={useLocation}>
                Mein Standort
              </button>
              <button
                style={S.secondary}
                onClick={async () => {
                  const c = props.center();
                  if (c) setStart({ p: c, name: await reverseName(c) });
                }}>
                Kartenmitte
              </button>
            </div>
            <PlaceSearch placeholder="Startort suchen" onPick={(p) => setStart({ p: p.p, name: p.name })} />
            {locError ? <p style={S.errorText}>{locError}</p> : null}
          </div>
        )}
      </Section>
      <Section title="Länge">
        <div style={{ background: C.surface, borderRadius: 20, padding: Spacing.l, display: 'flex', flexDirection: 'column', gap: Spacing.m }}>
          <div style={S.chips}>
            <Chip on={lengthBy === 'km'} onSurface onClick={() => setLengthBy('km')}>
              Kilometer
            </Chip>
            <Chip on={lengthBy === 'dauer'} onSurface onClick={() => setLengthBy('dauer')}>
              Dauer
            </Chip>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              style={stepBtn}
              aria-label="Kürzer"
              disabled={lengthBy === 'km' ? kmIdx === 0 : minIdx === 0}
              onClick={() => (lengthBy === 'km' ? setKmIdx((i) => Math.max(0, i - 1)) : setMinIdx((i) => Math.max(0, i - 1)))}>
              −
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ ...S.metricValue, fontSize: 30 }}>{lengthBy === 'km' ? KM_STEPS[kmIdx] : formatMinutes(MIN_STEPS[minIdx])}</span>
              <span style={S.metricLabel}>{lengthBy === 'km' ? 'km' : `etwa ${km} km`}</span>
            </div>
            <button
              style={stepBtn}
              aria-label="Länger"
              disabled={lengthBy === 'km' ? kmIdx === KM_STEPS.length - 1 : minIdx === MIN_STEPS.length - 1}
              onClick={() => (lengthBy === 'km' ? setKmIdx((i) => Math.min(KM_STEPS.length - 1, i + 1)) : setMinIdx((i) => Math.min(MIN_STEPS.length - 1, i + 1)))}>
              +
            </button>
          </div>
        </div>
      </Section>
      <Section title="Richtung" aside={dir === 'zufall' ? 'Zufall' : DIRECTIONS.find((d) => d.id === dir)?.label}>
        <WebDirectionDial value={dir} onChange={setDir} />
      </Section>
      {PROFILE_CHOICES.length > 1 && (
        <Section title="Profil">
          <div style={S.chips}>
            {PROFILE_CHOICES.map((p) => (
              <Chip key={p.id} on={props.profile === p.id} onClick={() => props.setProfile(p.id)}>
                {p.label}
              </Chip>
            ))}
          </div>
        </Section>
      )}
      <div>
        <Accordion label="Vermeiden" summary={avoidText}>
          <Toggle id="rt-closures" on={props.avoid.closures} label="Gesperrte Straßen" note="Wir planen um gesperrte Straßen herum." onChange={(v) => props.setAvoid({ ...props.avoid, closures: v })} />
          <Toggle id="rt-ferries" on={props.avoid.ferries} label="Fähren" onChange={(v) => props.setAvoid({ ...props.avoid, ferries: v })} />
          <Toggle id="rt-tolls" on={props.avoid.tolls} label="Maut" onChange={(v) => props.setAvoid({ ...props.avoid, tolls: v })} />
          <Toggle id="rt-rough" on={props.avoid.rough} label="Rauer Belag" note="Kopfsteinpflaster und schlechter Asphalt." onChange={(v) => props.setAvoid({ ...props.avoid, rough: v })} />
        </Accordion>
      </div>
      <button
        style={S.primary}
        disabled={props.busy || !start}
        onClick={() => start && props.onCreate({ start: { p: start.p, name: start.name }, km, direction: dir, profile: props.profile, avoid: props.avoid })}>
        {start ? 'Tour erstellen' : 'Erst Start wählen'}
      </button>
    </div>
  );
}

/** Ergebnis der Rundtour mit einer Hauptaktion (Speichern) und den übrigen Aktionen im Menü ⋯ */
export function RoundResult(props: {
  round: RoundTrip;
  line: LatLon[];
  busy: boolean;
  narrow: boolean;
  onFun: () => void;
  onFly: (p: LatLon) => void;
  onHoverKm: (km: number | null) => void;
  elev: import('@/lib/stats').ElevationProfile | null;
  onAdjust: (t: LibPlannedTour, p: Profile) => void;
}) {
  const { round } = props;
  const cur = round.current!;
  const [ask, setAsk] = useState(false);
  const curves = countCurves(props.line);
  const rolls = round.state.rolls;
  const prev = round.state.idx > 0 ? rolls[round.state.idx - 1].fun : null;
  const delta = cur.fun && prev ? cur.fun.score - prev.score : null;
  const saved = round.state.savedFor === cur.tour;
  const dirWord = cur.req.direction === 'zufall' ? 'in zufälliger Richtung' : `Richtung ${DIRECTIONS.find((d) => d.id === cur.req.direction)?.label}`;
  let best = -1;
  rolls.forEach((r, i) => {
    if (r.fun && (best < 0 || r.fun.score > (rolls[best]?.fun?.score ?? -1))) best = i;
  });
  return (
    <div style={S.stack}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={S.headline}>{cur.tour.name}</span>
        <span style={S.metricLabel}>{`kurvig, ${dirWord}`}</span>
      </div>
      <ResultStats tour={cur.tour} curves={curves} fun={cur.fun} onFun={props.onFun} delta={delta} />
      {cur.req.note ? <p style={{ ...S.muted, color: C.warn }}>{cur.req.note}</p> : null}
      {round.state.note ? <StatusLine tone="warn" text={round.state.note} /> : null}
      {rolls.length > 1 ? (
        <Section title="Deine Runden">
          <div style={S.chips}>
            {rolls.map((r, i) =>
              r.fun ? (
                <button
                  key={i}
                  aria-pressed={i === round.state.idx}
                  aria-label={`Runde ${i + 1} anzeigen, Fahrspaß ${r.fun.score}, ${TOUR_FUN_NAMES[r.fun.level]}`}
                  onClick={() => round.pick(i)}
                  style={{ ...(i === round.state.idx ? S.chipOn : S.chip), display: 'flex', alignItems: 'center', gap: 6, boxShadow: i === best ? `inset 0 0 0 2px ${C.signal}` : undefined }}>
                  <Gauge level={r.fun.level} size={18} />
                  {r.fun.score}
                </button>
              ) : null,
            )}
          </div>
        </Section>
      ) : null}
      <ResultDetails tour={cur.tour} line={props.line} onFly={props.onFly} onHoverKm={props.onHoverKm} elev={props.elev} onAvoid={round.replan} />
      <div>
        <Accordion label="Unterwegs einplanen" summary="Tanken, Essen, Aussicht">
          <StopsPanel tour={cur.tour} busy={props.busy} onAdd={(p) => void round.addStop(p)} />
        </Accordion>
      </div>
      <div style={{ display: 'flex', gap: Spacing.s, alignItems: 'center' }}>
        {saved ? (
          <span style={{ flex: 1 }}>
            <StatusLine tone="good" text="Gespeichert, in der App unter Touren." />
          </span>
        ) : (
          <button style={S.primary} disabled={props.busy} onClick={round.save}>
            Speichern
          </button>
        )}
        <MoreMenu
          label="Weitere Aktionen"
          up
          items={[
            { key: 'adjust', label: 'Anpassen', onPress: () => props.onAdjust(cur.tour, cur.req.profile) },
            { key: 'gpx', label: 'Als GPX herunterladen', onPress: () => void exportTour(cur.tour, 'gpx') },
            { key: 'kml', label: 'Als KML herunterladen', onPress: () => void exportTour(cur.tour, 'kml') },
            { key: 'drop', label: 'Tour verwerfen', danger: true, onPress: () => setAsk(true) },
          ]}
        />
      </div>
      <button style={{ ...S.secondary, flex: 'none' }} disabled={props.busy} onClick={round.reroll}>
        Neu würfeln
      </button>
      {ask ? (
        <ConfirmSheet
          narrow={props.narrow}
          title="Möchtest du diese Runde wirklich verwerfen?"
          text="Gespeicherte Runden bleiben unter Touren."
          confirmLabel="Verwerfen"
          onClose={() => setAsk(false)}
          onConfirm={() => {
            setAsk(false);
            round.discard();
          }}
        />
      ) : null}
    </div>
  );
}
