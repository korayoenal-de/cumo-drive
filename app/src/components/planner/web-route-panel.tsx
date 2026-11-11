/**
 * Web Planer, Modus Tour planen (Route) wie in der App (tour-mode.tsx): feste Felder Start, Zwischenziele
 * und Ziel, jede Etappe mit eigenem Profil (Kurvig oder Schnell), Zwischenziel auf einer Etappe einfügen,
 * Reihenfolge per Anfasser ziehen (orange Linie zeigt die Zielposition), Start und Ziel tauschen.
 * Zustand und Planung kommen aus use-tour-plan.ts, genau wie in der App.
 */
import { useMemo, useRef, useState, type DragEvent } from 'react';

import { directNote, type PlannedTour } from '@/lib/plan';
import { closedHint, passState, type LiveRow } from '@/lib/pass-live';
import { passPoint, passSummary, type Pass } from '@/lib/passes';
import { formatKm, legs, LEG_PROFILE_CHOICES, type LatLon, type Profile } from '@/lib/tour';
import { type TourFun } from '@/lib/fun-score';
import { type Avoid } from '@/lib/valhalla';
import { showToast } from '@/lib/toast';
import { type ElevationProfile } from '@/lib/stats';
import { Radius, Spacing } from '@/constants/theme';

import { keyOf, profileWord, type PointKind } from './planner-shared';
import { type TourPlan } from './use-tour-plan';
import { Accordion, PlaceSearch, Toggle } from './web-parts';
import { ResultDetails, ResultStats } from './web-result';
import { AddHighlight, StopsPanel } from './web-tour-panels';
import { BODY, C } from './web-shared';
import { S } from './web-styles';
import { XIcon } from './web-ui';

type Edit = { kind: PointKind; index?: number; insert?: boolean } | null;

export function RoutePanel(props: {
  plan: TourPlan;
  profile: Profile;
  avoid: Avoid;
  setAvoid: (a: Avoid) => void;
  /** Bearbeitung durch dich (für das automatische Speichern) */
  touch: () => void;
  routeTour: PlannedTour | null;
  line: LatLon[];
  curves: number;
  fun: TourFun | null;
  onFun: () => void;
  elev: ElevationProfile | null;
  onFly: (p: LatLon) => void;
  onHoverKm: (km: number | null) => void;
  passes: { pass: Pass; km: number }[];
  passesNear: { pass: Pass; dKm: number }[];
  live: Map<string, LiveRow> | null;
  near?: LatLon;
}) {
  const { plan, profile, avoid, routeTour } = props;
  const pts = plan.pts;
  const busy = plan.step !== null;
  const [edit, setEdit] = useState<Edit>(null);
  const [legMenu, setLegMenu] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const parts = useMemo(() => (routeTour ? legs(routeTour) : []), [routeTour]);
  const hint = closedHint(props.passes.map((x) => x.pass), props.live);
  const slots: (LatLon | null)[] = [plan.start, ...plan.vias, plan.ziel];
  const nameOf = (p: LatLon) => plan.names[keyOf(p)] ?? `${p[0].toFixed(4)}, ${p[1].toFixed(4)}`;

  const pick = (e: NonNullable<Edit>, p: LatLon, name: string) => {
    props.touch();
    setEdit(null);
    if (e.insert) plan.insertAt(e.index ?? 0, p, profile, avoid, name);
    else plan.setSlot(e.kind, p, profile, avoid, name, e.index);
  };

  // Ziehen am Anfasser: nur gesetzte Punkte, Ziel der Reihenfolge über die Zeile unter der Maus
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const onDragOver = (e: DragEvent) => {
    if (!drag) return;
    e.preventDefault();
    let to = drag.to;
    rows.current.forEach((el, i) => {
      if (!el || !slots[i]) return;
      const r = el.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom) to = i;
    });
    if (to !== drag.to) setDrag({ ...drag, to });
  };
  const onDrop = () => {
    if (!drag) return;
    const filled = slots.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
    const from = filled.indexOf(drag.from);
    const to = filled.indexOf(drag.to);
    setDrag(null);
    if (from < 0 || to < 0 || from === to) return;
    const order = filled.map((_, i) => i);
    const [m] = order.splice(from, 1);
    order.splice(to, 0, m);
    props.touch();
    plan.reorder(order, profile, avoid);
  };

  function pointRow(slot: number, p: LatLon | null) {
    const kind: PointKind = slot === 0 ? 'start' : slot === slots.length - 1 ? 'ziel' : 'via';
    const viaIdx = kind === 'via' ? slot - 1 : undefined;
    const role = kind === 'start' ? 'Start' : kind === 'ziel' ? 'Ziel' : `Zwischenziel ${slot}`;
    const editing = edit && !edit.insert && edit.kind === kind && (kind !== 'via' || edit.index === viaIdx);
    const label = kind === 'start' ? 'S' : kind === 'ziel' ? 'Z' : String(slot);
    const dropHere = drag && drag.from !== slot && drag.to === slot;
    return (
      <div
        ref={(el) => {
          rows.current[slot] = el;
        }}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, opacity: drag?.from === slot ? 0.5 : 1 }}>
        {dropHere ? <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, [drag!.to < drag!.from ? 'top' : 'bottom']: -2, height: 3, borderRadius: 2, background: C.signal }} /> : null}
        <span style={kind === 'via' ? S.wpDot : S.wpDotEnd}>{label}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing || !p ? (
            <PlaceSearch
              key={`${kind}${viaIdx ?? ''}${p ? keyOf(p) : ''}`}
              id={`feld-${kind}${viaIdx ?? ''}`}
              near={p ?? props.near}
              initial={p ? nameOf(p) : undefined}
              autoFocus={!!editing}
              placeholder={kind === 'start' ? 'Wo geht es los?' : kind === 'ziel' ? 'Wohin geht es?' : 'Zwischenziel suchen'}
              onPick={(x) => pick({ kind, index: viaIdx }, x.p, x.name)}
              onBlurEmpty={editing ? () => setEdit(null) : undefined}
            />
          ) : (
            <button
              style={{ ...S.wpName, height: 52, background: C.surface, borderRadius: Radius.m, padding: '0 14px', boxSizing: 'border-box', width: '100%' }}
              title="Klick ändert den Ort"
              aria-label={`${role} ${nameOf(p)}, ändern`}
              disabled={!!drag}
              onClick={() => {
                setEdit({ kind, index: viaIdx });
                props.onFly(p);
              }}>
              {nameOf(p)}
            </button>
          )}
        </div>
        {p && !editing ? (
          <>
            {pts.length > 1 ? (
              <span
                draggable
                role="button"
                tabIndex={0}
                aria-label={`${role} verschieben`}
                title="Ziehen ändert die Reihenfolge"
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  setDrag({ from: slot, to: slot });
                }}
                onDragEnd={() => setDrag(null)}
                style={{ width: 32, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', color: C.muted }}>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke={C.muted} strokeWidth="2.4" strokeLinecap="round">
                  <path d="M5 8h14M5 12h14M5 16h14" />
                </svg>
              </span>
            ) : null}
            <button
              aria-label={`${role} entfernen`}
              disabled={busy && pts.length < 2}
              onClick={() => {
                props.touch();
                plan.removeAt(slot, profile, avoid);
              }}
              style={{ width: 44, height: 44, flex: 'none', borderRadius: 22, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <XIcon />
            </button>
          </>
        ) : null}
      </div>
    );
  }

  function legRow(i: number) {
    const a = slots[i];
    const b = slots[i + 1];
    const ready = !!a && !!b;
    const lp = plan.legProfile(i, profile);
    const part = plan.complete && routeTour ? parts[i] : undefined;
    const inserting = !!edit?.insert && edit.index === i;
    const choosing = legMenu === i;
    return (
      <div style={{ marginLeft: 11, paddingLeft: 21, borderLeft: `2px dotted ${C.line}`, display: 'flex', flexDirection: 'column', gap: Spacing.s, padding: '6px 0 6px 21px' }}>
        {ready ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: Spacing.s, flexWrap: 'wrap' }}>
            <button
              aria-label={`Zwischenziel auf Etappe ${i + 1} einfügen`}
              aria-pressed={inserting}
              onClick={() => setEdit(inserting ? null : { kind: 'via', index: i, insert: true })}
              style={{ width: 44, height: 44, borderRadius: 22, border: 'none', background: inserting ? C.text : C.surface, color: inserting ? C.ground : C.text, cursor: 'pointer', font: `700 20px ${BODY}` }}>
              +
            </button>
            <button
              aria-label={`Profil der Etappe ${i + 1}: ${profileWord(lp)}, ändern`}
              aria-expanded={choosing}
              onClick={() => setLegMenu(choosing ? null : i)}
              style={{ height: 44, padding: '0 16px', borderRadius: 22, border: 'none', background: choosing ? C.surface2 : C.surface, color: C.text, cursor: 'pointer', font: `600 15px ${BODY}` }}>
              {profileWord(lp)} ⌄
            </button>
            {part ? <span style={{ ...S.legKm, fontSize: 15 }}>{formatKm(part.endKm - part.startKm)} km</span> : null}
          </div>
        ) : null}
        {choosing ? (
          <div style={S.chips}>
            {LEG_PROFILE_CHOICES.map((c) => (
              <button
                key={c.id}
                aria-pressed={lp === c.id}
                onClick={() => {
                  setLegMenu(null);
                  if (c.id !== lp) {
                    props.touch();
                    plan.setLegProfile(i, c.id, profile, avoid);
                  }
                }}
                style={lp === c.id ? S.chipOn : S.chip}>
                {c.label}
              </button>
            ))}
          </div>
        ) : null}
        {inserting ? (
          <PlaceSearch
            id={`einfuegen-${i}`}
            autoFocus
            near={a ?? undefined}
            placeholder="Zwischenziel suchen"
            onPick={(x) => pick({ kind: 'via', index: i, insert: true }, x.p, x.name)}
            onBlurEmpty={() => setEdit(null)}
          />
        ) : null}
      </div>
    );
  }

  const avoidText = [avoid.closures && 'Sperrungen', avoid.rough && 'rauer Belag', avoid.ferries && 'Fähren', avoid.tolls && 'Maut'].filter(Boolean).join(', ') || 'Nichts';
  const note = routeTour ? directNote(routeTour.direkt, Math.max(1, pts.length - 1)) : null;

  return (
    <div style={S.stack}>
      {routeTour ? (
        <textarea
          id="tour-name"
          aria-label="Tourname"
          value={plan.name}
          rows={Math.min(4, Math.max(1, Math.ceil(plan.name.length / 18)))}
          maxLength={120}
          onChange={(e) => {
            props.touch();
            plan.setName(e.target.value.replace(/\n/g, ' '));
          }}
          style={{ ...S.headline, resize: 'none', overflow: 'hidden', fontFamily: S.headline.fontFamily }}
        />
      ) : null}
      {routeTour ? <ResultStats tour={routeTour} curves={props.curves} fun={props.fun} onFun={props.onFun} /> : null}
      {note ? <p style={S.muted}>{note}</p> : null}

      <section style={S.section} onDragOver={onDragOver} onDrop={onDrop}>
        <div style={{ ...S.sectionHead, alignItems: 'center' }}>
          <span style={S.label}>Route</span>
          {pts.length ? (
            <button
              style={{ ...S.link, fontSize: 15, textDecoration: 'none', color: C.muted }}
              onClick={() => {
                props.touch();
                plan.reset();
              }}>
              Zurücksetzen
            </button>
          ) : null}
        </div>
        <div>
          {slots.map((p, i) => (
            <div key={i === 0 ? 'start' : i === slots.length - 1 ? 'ziel' : `via${i - 1}-${p ? keyOf(p) : ''}`}>
              {pointRow(i, p)}
              {i < slots.length - 1 ? legRow(i) : null}
            </div>
          ))}
        </div>
        {plan.complete ? (
          <button
            style={{ ...S.link, fontSize: 15 }}
            disabled={busy}
            onClick={() => {
              props.touch();
              plan.swap(profile, avoid);
            }}>
            Start und Ziel tauschen
          </button>
        ) : null}
        {!pts.length ? <p style={S.muted}>Oder klick auf die Karte: der erste Punkt wird der Start, der zweite das Ziel.</p> : null}
      </section>

      {plan.roadWarn ? <p style={{ ...S.muted, color: C.warn }}>{plan.roadWarn}</p> : null}
      {plan.error ? (
        <div style={{ ...S.error, margin: 0, display: 'flex', flexDirection: 'column', gap: Spacing.s }}>
          <b>Das hat nicht geklappt</b>
          <span>{plan.error}</span>
          {pts.length >= 2 ? (
            <button style={{ ...S.secondary, flex: 'none', alignSelf: 'flex-start' }} onClick={() => plan.planNow(profile, avoid)}>
              Nochmal versuchen
            </button>
          ) : null}
        </div>
      ) : null}

      {hint && !routeTour ? (
        <div style={S.winterNote}>
          <b>{hint.title}</b>
          <span>{hint.text}</span>
        </div>
      ) : null}

      {routeTour ? <ResultDetails tour={routeTour} line={props.line} onFly={props.onFly} onHoverKm={props.onHoverKm} elev={props.elev} /> : null}

      <div>
        {routeTour ? (
          <Accordion label="Highlights/Pässe" summary="Pässe und Traumstrecken auf deinen Etappen">
            <AddHighlight
              pts={pts}
              taken={new Set(pts.map((p) => plan.names[keyOf(p)]).filter(Boolean))}
              live={props.live}
              busy={busy}
              onAdd={(leg, c) => {
                props.touch();
                if (c.line && c.line.length > 2) {
                  const snap = plan.snapshot();
                  const replaced = plan.insertRoad(leg, c.line, profile, avoid, c.name);
                  if (replaced) showToast(`${c.name} ersetzt ${replaced}, es lag nur 2 km davor`, { action: { label: 'Rückgängig', onPress: () => plan.restore(snap) } });
                } else plan.insertAt(leg, c.p, profile, avoid, c.name);
              }}
              onAddPass={(pass) => {
                props.touch();
                plan.add('via', passPoint(pass), profile, avoid, pass.name);
              }}
            />
          </Accordion>
        ) : null}
        {routeTour ? (
          <Accordion label="Unterwegs einplanen" summary="Tanken, Essen, Aussicht">
            <StopsPanel
              tour={routeTour}
              busy={busy}
              onAdd={(p) => {
                props.touch();
                plan.add('via', p, profile, avoid);
              }}
            />
          </Accordion>
        ) : null}
        <Accordion label="Vermeiden" summary={avoidText}>
          {(
            [
              ['closures', 'Gesperrte Straßen', 'Wir planen um gesperrte Straßen herum.'],
              ['ferries', 'Fähren', undefined],
              ['tolls', 'Maut', undefined],
              ['rough', 'Rauer Belag', 'Kopfsteinpflaster und schlechter Asphalt.'],
            ] as const
          ).map(([key, label, n]) => (
            <Toggle
              key={key}
              id={`av-${key}`}
              on={avoid[key]}
              label={label}
              note={n}
              onChange={(v) => {
                const next = { ...avoid, [key]: v };
                props.setAvoid(next);
                // gleich neu planen, ohne extra Knopf (wie in der App)
                if (pts.length >= 2) {
                  props.touch();
                  plan.planNow(profile, next);
                }
              }}
            />
          ))}
        </Accordion>
      </div>
      {pts.length >= 2 && !routeTour && !busy && !plan.error ? (
        <button style={S.primary} onClick={() => plan.planNow(profile, avoid)}>
          Route planen
        </button>
      ) : null}
    </div>
  );
}

/** Kurzbeschreibung eines Passes für die schwebende Karte über der Karte */
export function passNote(pass: Pass, live: Map<string, LiveRow> | null): string {
  return passSummary(pass, undefined, passState(pass, live).note);
}
