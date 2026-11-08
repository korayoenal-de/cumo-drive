/**
 * Web Planer, Seitenleiste Rundtour und Beschreiben (KI Formular).
 */
import { useMemo, useState } from 'react';

import { reverseName, searchTowns } from '@/lib/geocode';
import { parseWish, STOPS, targetKm, formatMinutes, type Stop } from '@/lib/intent';
import { type PlanStep } from '@/lib/plan';
import { bearingTo, DIRECTIONS, type Direction } from '@/lib/roundtrip';
import { smartRoundTrip } from '@/lib/smart-roundtrip';
import { PROFILES, PROFILE_CHOICES, type LatLon, type Profile } from '@/lib/tour';
import { type Avoid } from '@/lib/valhalla';

import { type PlannedTour } from './web-shared';
import { Chip, PlaceSearch, Section } from './web-parts';
import { S } from './web-styles';

/* ---------- Rundtour ---------- */

export const KM_STEPS = [25, 50, 75, 100, 150, 200, 300];

export function RoundTripPanel(props: {
  initialStart: { p: LatLon; name: string } | null;
  center: () => LatLon | null;
  profile: Profile;
  setProfile: (p: Profile) => void;
  busy: boolean;
  onCreate: (start: LatLon, km: number, dir: Direction, name: string) => void;
}) {
  const [start, setStart] = useState<{ p: LatLon; name: string } | null>(props.initialStart);
  const [km, setKm] = useState(50);
  const [dir, setDir] = useState<Direction>('O');
  const [locError, setLocError] = useState<string | null>(null);

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

  const grid: (Direction | 'mitte')[] = ['NW', 'N', 'NO', 'W', 'mitte', 'O', 'SW', 'S', 'SO'];
  const arrow: Record<string, string> = { NW: '↖', N: '↑', NO: '↗', W: '←', O: '→', SW: '↙', S: '↓', SO: '↘' };

  return (
    <div style={S.stack}>
      <Section title="Start">
        {start ? (
          <div style={S.startRow}>
            <span>{start.name}</span>
            <button style={S.link} onClick={() => setStart(null)}>
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
                  if (c) setStart({ p: c, name: `Kartenmitte (${await reverseName(c)})` });
                }}>
                Kartenmitte
              </button>
            </div>
            <PlaceSearch placeholder="Startort suchen" onPick={(p) => setStart({ p: p.p, name: p.name })} />
            {locError ? <p style={S.errorText}>{locError}</p> : null}
          </div>
        )}
      </Section>
      <Section title="Länge" aside={`${km} km, etwa ${formatMinutes(Math.round((km / 55) * 60))}`}>
        <div style={S.chips}>
          {KM_STEPS.map((v) => (
            <Chip key={v} on={km === v} onClick={() => setKm(v)}>
              {v} km
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Richtung" aside={dir === 'zufall' ? 'Zufall' : DIRECTIONS.find((d) => d.id === dir)?.label}>
        <div style={S.compass}>
          {grid.map((g) =>
            g === 'mitte' ? (
              <button key={g} style={dir === 'zufall' ? S.compassOn : S.compassBtn} onClick={() => setDir('zufall')} aria-label="Zufällige Richtung">
                ?
              </button>
            ) : (
              <button key={g} style={dir === g ? S.compassOn : S.compassBtn} onClick={() => setDir(g)} aria-label={DIRECTIONS.find((d) => d.id === g)?.label}>
                {arrow[g]}
              </button>
            ),
          )}
        </div>
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
      <button
        style={S.primary}
        disabled={props.busy || !start}
        onClick={() => start && props.onCreate(start.p, km, dir, `Rundtour ${km} km ab ${start.name.replace(/^Kartenmitte \((.*)\)$/, '$1')}`)}>
        {start ? 'Rundtour erstellen' : 'Erst Start wählen'}
      </button>
      {start ? (
        <button style={S.link} disabled={props.busy} onClick={() => props.onCreate(start.p, km, dir, `Rundtour ${km} km ab ${start.name}`)}>
          Andere Variante würfeln
        </button>
      ) : null}
    </div>
  );
}

/* ---------- Beschreiben (KI Formular) ---------- */

export const DURATIONS: { label: string; min: number }[] = [
  { label: '1 h', min: 60 },
  { label: '2 h', min: 120 },
  { label: '3 h', min: 180 },
  { label: 'Halber Tag', min: 270 },
  { label: 'Tag', min: 420 },
];

export function DescribePanel(props: {
  center: () => LatLon | null;
  busy: boolean;
  avoid: Avoid;
  onCreate: (job: (signal: AbortSignal, step: (s: PlanStep) => void) => Promise<PlannedTour>) => void;
}) {
  const [text, setText] = useState('Ab Heppenheim in den Odenwald, Mittag mit Aussicht');
  const wish = useMemo(() => parseWish(text), [text]);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [style, setStyle] = useState<Profile | null>(null);
  const [stops, setStops] = useState<Stop[] | null>(null);

  // Chips folgen dem Text, bis man sie selbst antippt
  const effMinutes = minutes ?? wish.minutes ?? (wish.km ? null : 180);
  const effProfile = style ?? wish.profile ?? 'kurvig';
  const effStops = stops ?? wish.stops;
  const km = targetKm({ km: minutes === null ? wish.km : undefined, minutes: effMinutes ?? undefined }, effProfile);

  const summary = [
    `Rundtour ${wish.startName ? `ab ${wish.startName}` : 'ab Kartenmitte'}`,
    wish.towardName ? `Richtung ${wish.towardName}` : wish.direction ? DIRECTIONS.find((d) => d.id === wish.direction)?.label.replace(/^/, 'Richtung ') : null,
    effMinutes && (minutes !== null || !wish.km) ? `etwa ${formatMinutes(effMinutes)}` : `${km} km`,
    PROFILES.find((p) => p.id === effProfile)?.label.toLowerCase(),
    effStops.length ? `mit ${effStops.map((s) => STOPS.find((x) => x.id === s)?.label).join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const create = () =>
    props.onCreate(async (signal, step) => {
      step('route');
      let start = props.center();
      let startName = 'Kartenmitte';
      if (wish.startName) {
        const hits = await searchTowns(wish.startName, start ?? undefined, signal);
        if (!hits.length) throw new Error(`Startort "${wish.startName}" nicht gefunden. Schreib ihn genauer oder wähle die Kartenmitte.`);
        start = hits[0].p;
        startName = hits[0].name;
      }
      if (!start) throw new Error('Kein Start gefunden. Nenne einen Ort im Text.');
      let bearing: number | undefined;
      if (wish.towardName) {
        const hits = await searchTowns(wish.towardName, start, signal);
        if (hits.length) bearing = bearingTo(start, hits[0].p);
      }
      return smartRoundTrip(
        { name: `${wish.towardName ?? 'Rundtour'} ab ${startName}`, start, km, direction: wish.direction ?? 'zufall', bearing, profile: effProfile, avoid: props.avoid },
        step,
        signal,
      );
    });

  return (
    <div style={S.stack}>
      <div>
        <h2 style={S.h2}>Tour beschreiben</h2>
        <p style={S.muted}>Schreib, was du erleben willst. Die Chips übernehmen, was erkannt wurde, und lassen sich anpassen.</p>
      </div>
      <textarea id="wish" aria-label="Was willst du erleben?" value={text} onChange={(e) => setText(e.target.value)} rows={3} style={S.textarea} placeholder="Was willst du erleben?" />
      <Section title="Dauer" aside={effMinutes ? formatMinutes(effMinutes) : `${km} km`}>
        <div style={S.chips}>
          {DURATIONS.map((d) => (
            <Chip key={d.label} on={effMinutes === d.min} onClick={() => setMinutes(d.min)}>
              {d.label}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Fahrstil">
        <div style={S.chips}>
          {PROFILES.filter((p) => p.id !== 'schnell').map((p) => (
            <Chip key={p.id} on={effProfile === p.id} onClick={() => setStyle(p.id)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Stopps unterwegs">
        <div style={S.chips}>
          {STOPS.map((s) => {
            const on = effStops.includes(s.id);
            return (
              <Chip key={s.id} on={on} onClick={() => setStops(on ? effStops.filter((x) => x !== s.id) : [...effStops, s.id])}>
                {s.label}
              </Chip>
            );
          })}
        </div>
        <p style={S.small}>Stopps werden bald direkt eingeplant, heute fließen sie noch nicht in die Route ein.</p>
      </Section>
      <div style={S.understood}>
        <span style={S.label}>Verstanden</span>
        <span>{summary}. Nur Straßen, die der Etappen Check freigibt.</span>
      </div>
      <button style={S.primary} disabled={props.busy} onClick={create}>
        Tour erstellen
      </button>
    </div>
  );
}
