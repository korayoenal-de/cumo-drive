/**
 * Planer für das Handy: Tour beschreiben (Freitext plus Chips) oder Rundtour einstellen,
 * dann Tour erstellen, prüfen und als Vorschau zeigen. Die Web Version liegt in planner.web.tsx.
 */
import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { RouteMap } from '@/components/map/route-map';
import {
  buildTour, findPlace, locate, newSeed, PHASES, toPlanError,
  type PlanError, type PlanPhase, type Spot, type TourRequest,
} from '@/components/planner/create-tour';
import { CLASS_COLORS } from '@/components/planner/route-preview';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { setActiveTour } from '@/lib/active-tour';
import { searchPlaces, type Place } from '@/lib/geocode';
import { formatMinutes, parseWish, STOPS, targetKm, type Stop, type TourWish } from '@/lib/intent';
import type { PlannedTour } from '@/lib/plan';
import { RIDE_MODES, useRideMode } from '@/lib/ride-mode';
import { bearingTo, DIRECTIONS, type Direction } from '@/lib/roundtrip';
import { formatKm, PROFILES, type CheckClass, type Profile } from '@/lib/tour';
import { DEFAULT_AVOID, type Avoid } from '@/lib/valhalla';

const WARN = '#E8B03A';

type Mode = 'beschreiben' | 'rundtour';

const DURATIONS: { minutes: number; big: string; unit: string }[] = [
  { minutes: 60, big: '1', unit: 'h' },
  { minutes: 120, big: '2', unit: 'h' },
  { minutes: 180, big: '3', unit: 'h' },
  { minutes: 270, big: '½', unit: 'Tag' },
  { minutes: 420, big: '1', unit: 'Tag' },
];

const STYLE_PROFILES: Profile[] = ['kurvig', 'paesse', 'entspannt'];
const PROFILE_WORD: Record<Profile, string> = { kurvig: 'kurvig', paesse: 'mit Pässen', entspannt: 'entspannt', schnell: 'zügig' };

const KM_STEPS = [25, 50, 75, 100, 150, 200, 300];
const MIN_STEPS = [60, 90, 120, 180, 240, 300, 420];

/** 3x3 Raster: acht Richtungen und in der Mitte Zufall */
const GRID: Direction[][] = [
  ['NW', 'N', 'NO'],
  ['W', 'zufall', 'O'],
  ['SW', 'S', 'SO'],
];

const CLASS_LABEL: Record<CheckClass, string> = { ok: 'Sauber', pruefen: 'Prüfen', raus: 'Gesperrt' };

function dirPhrase(d: Direction): string {
  if (d === 'zufall') return 'in zufälliger Richtung';
  return `Richtung ${DIRECTIONS.find((x) => x.id === d)!.label}`;
}

function joinDe(items: string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`;
}

/** Wunsch aus Freitext und Chips zusammenführen; Chips haben Vorrang. */
type Overrides = {
  minutes?: number | null;
  profile?: Profile;
  direction?: Direction;
  stops: Partial<Record<Stop, boolean>>;
};

type Effective = {
  startName?: string;
  towardName?: string;
  direction?: Direction;
  km?: number;
  minutes?: number;
  profile: Profile;
  stops: Stop[];
};

function effectiveWish(wish: TourWish, o: Overrides): Effective {
  const dur = o.minutes !== undefined ? { minutes: o.minutes ?? undefined } : { km: wish.km, minutes: wish.minutes };
  const direction = o.direction ?? wish.direction;
  return {
    startName: wish.startName,
    towardName: o.direction ? undefined : wish.towardName,
    direction,
    ...dur,
    profile: o.profile ?? wish.profile ?? 'kurvig',
    stops: STOPS.map((s) => s.id).filter((id) => o.stops[id] ?? wish.stops.includes(id)),
  };
}

function understoodSentence(e: Effective): string {
  const km = targetKm(e, e.profile);
  const parts: string[] = [`Rundtour ab ${e.startName ?? 'deinem Standort'}`];
  if (e.km) parts.push(`${e.km} km`);
  else if (e.minutes) parts.push(`${formatMinutes(e.minutes)} (etwa ${km} km)`);
  else parts.push(`etwa ${km} km`);
  parts.push(PROFILE_WORD[e.profile]);
  if (e.towardName) parts.push(`Richtung ${e.towardName}`);
  else parts.push(dirPhrase(e.direction ?? 'zufall'));
  let s = parts.join(', ') + '.';
  if (e.stops.length) s += ` Stopps: ${joinDe(e.stops.map((id) => STOPS.find((x) => x.id === id)!.label))}.`;
  return s;
}

type Stage =
  | { kind: 'form' }
  | { kind: 'working'; phase: PlanPhase; done: PlanPhase[] }
  | { kind: 'result'; tour: PlannedTour; req: TourRequest; stops: Stop[] }
  | { kind: 'error'; error: PlanError; req?: TourRequest };

export default function Planner() {
  const [rideMode, setRideMode] = useRideMode();
  const [mode, setMode] = useState<Mode>('beschreiben');
  const [view, setView] = useState<Stage>({ kind: 'form' });
  const abort = useRef<AbortController | null>(null);
  const lastStops = useRef<Stop[]>([]);

  // Beschreiben
  const [text, setText] = useState('');
  const [over, setOver] = useState<Overrides>({ stops: {} });
  const [micHint, setMicHint] = useState(false);
  const wish = parseWish(text);
  const eff = effectiveWish(wish, over);

  // Rundtour
  const [here, setHere] = useState<Spot | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<PlanError | null>(null);
  const [picked, setPicked] = useState<Spot | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [lengthBy, setLengthBy] = useState<'km' | 'dauer'>('km');
  const [kmIdx, setKmIdx] = useState(3);
  const [minIdx, setMinIdx] = useState(2);
  const [direction, setDirection] = useState<Direction>('zufall');
  const [profile, setProfile] = useState<Profile>('kurvig');
  const [avoid, setAvoid] = useState<Avoid>(DEFAULT_AVOID);

  const roundKm = lengthBy === 'km' ? KM_STEPS[kmIdx] : targetKm({ minutes: MIN_STEPS[minIdx] }, profile);

  async function findHere() {
    setLocating(true);
    setLocError(null);
    try {
      setHere(await locate());
    } catch (e) {
      setLocError(toPlanError(e));
    } finally {
      setLocating(false);
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    if (m === 'rundtour' && !here && !locating) void findHere();
  }

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    try {
      setHits(await searchPlaces(q, here?.p));
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  }

  async function run(prepare: (signal: AbortSignal) => Promise<TourRequest>, stops: Stop[], seed = newSeed()) {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    lastStops.current = stops;
    const done: PlanPhase[] = [];
    const step = (phase: PlanPhase) => {
      setView((v) => {
        const prev = v.kind === 'working' ? v.phase : null;
        if (prev && prev !== phase && !done.includes(prev)) done.push(prev);
        return { kind: 'working', phase, done: [...done] };
      });
    };
    step('start');
    let req: TourRequest | undefined;
    try {
      req = await prepare(ctrl.signal);
      const tour = await buildTour(req, seed, step, ctrl.signal);
      if (!ctrl.signal.aborted) setView({ kind: 'result', tour, req, stops });
    } catch (e) {
      const error = toPlanError(e, ctrl.signal);
      if (error.kind === 'aborted') setView({ kind: 'form' });
      else setView({ kind: 'error', error, req });
    }
  }

  function createFromWish() {
    const e = eff;
    void run(async (signal) => {
      const start: Spot = e.startName
        ? await findPlace(e.startName, here?.p, 'Den Startort', signal).then((p) => ({ p: p.p, name: p.name }))
        : here ?? (await locate(signal));
      let bearing: number | undefined;
      if (!e.direction && e.towardName) {
        const target = await findPlace(e.towardName, start.p, 'Die Region', signal);
        bearing = bearingTo(start.p, target.p);
      }
      return {
        start, km: targetKm(e, e.profile), direction: e.direction ?? 'zufall', bearing,
        towardName: e.towardName, profile: e.profile, avoid: DEFAULT_AVOID,
      };
    }, e.stops);
  }

  function createRoundTrip() {
    void run(async (signal) => {
      const start = picked ?? here ?? (await locate(signal));
      if (!picked && !here) setHere(start);
      return { start, km: roundKm, direction, profile, avoid };
    }, []);
  }

  function reroll(req: TourRequest) {
    void run(async () => req, lastStops.current);
  }

  function cancel() {
    abort.current?.abort();
    setView({ kind: 'form' });
  }

  const header = (
    <View style={styles.headerBlock}>
      <AppText variant="display">{mode === 'beschreiben' ? 'Tour\nbeschreiben' : 'Rundtour'}</AppText>
      <Segmented
        value={rideMode}
        options={RIDE_MODES.map((m) => ({ id: m.id, label: m.label }))}
        onChange={setRideMode}
      />
      <AppText variant="caption" muted>
        {RIDE_MODES.find((m) => m.id === rideMode)!.hint}
      </AppText>
    </View>
  );

  if (view.kind === 'working') {
    return (
      <Screen>
        {header}
        <Progress phase={view.phase} done={view.done} onCancel={cancel} />
      </Screen>
    );
  }

  if (view.kind === 'error') {
    return (
      <Screen>
        {header}
        <ErrorCard
          error={view.error}
          mode={mode}
          onRetry={() => (view.req ? reroll(view.req) : mode === 'beschreiben' ? createFromWish() : createRoundTrip())}
          onBack={() => setView({ kind: 'form' })}
          onUsePlace={() => {
            setView({ kind: 'form' });
            setMode('rundtour');
          }}
        />
      </Screen>
    );
  }

  if (view.kind === 'result') {
    return (
      <Screen>
        {header}
        <Result
          tour={view.tour}
          req={view.req}
          stops={view.stops}
          group={rideMode === 'gruppe'}
          onReroll={() => reroll(view.req)}
          onBack={() => setView({ kind: 'form' })}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <Segmented
        value={mode}
        options={[
          { id: 'beschreiben', label: 'Beschreiben' },
          { id: 'rundtour', label: 'Rundtour' },
        ]}
        onChange={switchMode}
      />

      {mode === 'beschreiben' ? (
        <>
          <View style={styles.inputCard}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Was willst du erleben?"
              placeholderTextColor={Colors.muted}
              multiline
              style={styles.freeText}
              accessibilityLabel="Tourwunsch"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Spracheingabe"
              onPress={() => setMicHint((v) => !v)}
              style={styles.mic}>
              <MicIcon />
            </Pressable>
          </View>
          {micHint && (
            <AppText variant="caption" muted>
              Spracheingabe folgt bald. Bis dahin einfach tippen, zum Beispiel: 2 Stunden kurvig in den Odenwald mit Kaffee.
            </AppText>
          )}

          <Section label="Dauer">
            <View style={styles.durRow}>
              {DURATIONS.map((d) => {
                const active = eff.minutes === d.minutes && !eff.km;
                return (
                  <Pressable
                    key={d.minutes}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={d.unit === 'Tag' ? (d.big === '½' ? 'Halber Tag' : 'Tag') : `${d.big} Stunden`}
                    onPress={() => setOver((o) => ({ ...o, minutes: active ? null : d.minutes }))}
                    style={[styles.durTile, active && styles.tileOn]}>
                    <AppText style={[styles.durBig, active && styles.onSignal]}>{d.big}</AppText>
                    <AppText variant="caption" style={active ? styles.onSignal : styles.mutedText}>
                      {d.unit === 'Tag' && d.big === '½' ? 'Halber Tag' : d.unit}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section label="Fahrstil">
            <View style={styles.wrap}>
              {STYLE_PROFILES.map((id) => (
                <Chip
                  key={id}
                  label={PROFILES.find((p) => p.id === id)!.label}
                  active={eff.profile === id}
                  onPress={() => setOver((o) => ({ ...o, profile: id }))}
                />
              ))}
            </View>
          </Section>

          <Section label="Richtung">
            <View style={styles.wrap}>
              {eff.towardName && <Chip label={eff.towardName} active onPress={() => setOver((o) => ({ ...o, direction: 'zufall' }))} />}
              <Chip
                label="Zufall"
                active={!eff.towardName && (eff.direction ?? 'zufall') === 'zufall'}
                onPress={() => setOver((o) => ({ ...o, direction: 'zufall' }))}
              />
              {DIRECTIONS.map((d) => (
                <Chip
                  key={d.id}
                  label={d.label}
                  active={!eff.towardName && eff.direction === d.id}
                  onPress={() => setOver((o) => ({ ...o, direction: d.id }))}
                />
              ))}
            </View>
          </Section>

          <Section label="Stopps">
            <View style={styles.wrap}>
              {STOPS.map((s) => {
                const active = eff.stops.includes(s.id);
                return (
                  <Chip
                    key={s.id}
                    label={s.label}
                    active={active}
                    onPress={() => setOver((o) => ({ ...o, stops: { ...o.stops, [s.id]: !active } }))}
                  />
                );
              })}
            </View>
          </Section>

          <View style={styles.card}>
            <AppText variant="label">Fahrzeug</AppText>
            <AppText variant="title">Noch kein Fahrzeug in der Garage</AppText>
            <AppText variant="caption" muted>
              Breite, Bodenfreiheit und Sprit fließen bald in die Prüfung ein. Bis dahin planen wir für einen typischen Sportwagen.
            </AppText>
          </View>

          <View style={styles.understood}>
            <View style={styles.dot} />
            <View style={styles.flex}>
              <AppText variant="label" style={styles.goodText}>Verstanden</AppText>
              <AppText>{understoodSentence(eff)}</AppText>
            </View>
          </View>

          <View style={styles.gapS}>
            <PrimaryButton label="Tour erstellen" onPress={createFromWish} />
            <AppText variant="caption" muted>
              Stopps werden bald eingeplant, heute zeigen wir sie nur an.
            </AppText>
          </View>
        </>
      ) : (
        <>
          <Section label="Start">
            <View style={styles.card}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: !picked }}
                onPress={() => {
                  setPicked(null);
                  if (!here && !locating) void findHere();
                }}
                style={styles.startRow}>
                <Radio on={!picked} />
                <View style={styles.flex}>
                  <AppText variant="title">Aktueller Standort</AppText>
                  <AppText variant="caption" muted>
                    {locating ? 'Standort wird bestimmt' : here ? here.name : locError ? locError.message : 'Wird beim Start bestimmt'}
                  </AppText>
                </View>
                {locating && <ActivityIndicator color={Colors.muted} />}
              </Pressable>
              {locError && !picked && (
                <View style={styles.wrap}>
                  {locError.kind === 'permission' || locError.kind === 'services' ? (
                    <Chip label="Einstellungen öffnen" active={false} onPress={() => void Linking.openSettings()} />
                  ) : null}
                  <Chip label="Nochmal versuchen" active={false} onPress={() => void findHere()} />
                </View>
              )}
              {picked && (
                <View style={styles.startRow}>
                  <Radio on />
                  <View style={styles.flex}>
                    <AppText variant="title">{picked.name}</AppText>
                    <AppText variant="caption" muted>Gewählter Ort</AppText>
                  </View>
                </View>
              )}
              <View style={styles.searchRow}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={() => void runSearch()}
                  placeholder="Anderen Startort suchen"
                  placeholderTextColor={Colors.muted}
                  returnKeyType="search"
                  style={styles.search}
                />
                <Pressable accessibilityRole="button" onPress={() => void runSearch()} style={styles.searchBtn}>
                  {searching ? <ActivityIndicator color={Colors.text} /> : <AppText style={styles.searchBtnText}>Suchen</AppText>}
                </Pressable>
              </View>
              {hits && (
                <View>
                  {hits.length === 0 && <AppText variant="caption" muted>Nichts gefunden. Versuch es mit dem Ortsnamen.</AppText>}
                  {hits.map((h, i) => (
                    <Pressable
                      key={`${h.p[0]},${h.p[1]},${i}`}
                      accessibilityRole="button"
                      onPress={() => {
                        setPicked({ p: h.p, name: h.name });
                        setHits(null);
                        setQuery('');
                      }}
                      style={styles.hit}>
                      <AppText variant="title">{h.name}</AppText>
                      {!!h.detail && <AppText variant="caption" muted>{h.detail}</AppText>}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </Section>

          <Section label="Länge">
            <View style={styles.card}>
              <View style={styles.wrap}>
                <Chip label="Kilometer" active={lengthBy === 'km'} onPress={() => setLengthBy('km')} />
                <Chip label="Dauer" active={lengthBy === 'dauer'} onPress={() => setLengthBy('dauer')} />
              </View>
              <View style={styles.stepper}>
                <StepButton
                  kind="minus"
                  disabled={lengthBy === 'km' ? kmIdx === 0 : minIdx === 0}
                  onPress={() => (lengthBy === 'km' ? setKmIdx((i) => Math.max(0, i - 1)) : setMinIdx((i) => Math.max(0, i - 1)))}
                />
                <View style={styles.stepValue}>
                  <AppText style={styles.bigNumber}>
                    {lengthBy === 'km' ? KM_STEPS[kmIdx] : formatMinutes(MIN_STEPS[minIdx])}
                  </AppText>
                  <AppText variant="caption" muted>
                    {lengthBy === 'km' ? 'km' : `etwa ${roundKm} km`}
                  </AppText>
                </View>
                <StepButton
                  kind="plus"
                  disabled={lengthBy === 'km' ? kmIdx === KM_STEPS.length - 1 : minIdx === MIN_STEPS.length - 1}
                  onPress={() =>
                    lengthBy === 'km'
                      ? setKmIdx((i) => Math.min(KM_STEPS.length - 1, i + 1))
                      : setMinIdx((i) => Math.min(MIN_STEPS.length - 1, i + 1))
                  }
                />
              </View>
            </View>
          </Section>

          <Section label="Richtung">
            <View style={styles.grid}>
              {GRID.map((row, r) => (
                <View key={r} style={styles.gridRow}>
                  {row.map((d) => {
                    const active = direction === d;
                    return (
                      <Pressable
                        key={d}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={d === 'zufall' ? 'Zufall' : DIRECTIONS.find((x) => x.id === d)!.label}
                        onPress={() => setDirection(d)}
                        style={[styles.gridCell, active && styles.tileOn]}>
                        <AppText style={[styles.gridText, active && styles.onSignal]}>{d === 'zufall' ? 'Zufall' : d}</AppText>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </Section>

          <Section label="Profil">
            <View style={styles.wrap}>
              {PROFILES.map((p) => (
                <Chip key={p.id} label={p.label} active={profile === p.id} onPress={() => setProfile(p.id)} />
              ))}
            </View>
          </Section>

          <Section label="Vermeiden">
            <View style={styles.card}>
              <Toggle
                label="Gesperrte Straßen"
                note="calimoto warnt nur, wir meiden."
                value={avoid.closures}
                onChange={(v) => setAvoid((a) => ({ ...a, closures: v }))}
              />
              <Toggle label="Fähren" value={avoid.ferries} onChange={(v) => setAvoid((a) => ({ ...a, ferries: v }))} />
              <Toggle label="Maut" value={avoid.tolls} onChange={(v) => setAvoid((a) => ({ ...a, tolls: v }))} />
              <Toggle
                label="Rauer Belag"
                note="Kopfsteinpflaster und schlechter Asphalt."
                value={avoid.rough}
                onChange={(v) => setAvoid((a) => ({ ...a, rough: v }))}
              />
            </View>
          </Section>

          <PrimaryButton label="Tour erstellen" onPress={createRoundTrip} />
        </>
      )}
    </Screen>
  );
}

/* Bausteine */

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.gapM}>
      <AppText variant="label">{label}</AppText>
      {children}
    </View>
  );
}

function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.id)}
            style={[styles.segItem, active && styles.segOn]}>
            <AppText style={[styles.segText, active && styles.segTextOn]}>{o.label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
      <AppText style={styles.primaryText}>{label}</AppText>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
      <AppText style={styles.secondaryText}>{label}</AppText>
    </Pressable>
  );
}

function StepButton({ kind, disabled, onPress }: { kind: 'plus' | 'minus'; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={kind === 'plus' ? 'Länger' : 'Kürzer'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.stepBtn, disabled && styles.disabled]}>
      <View style={styles.barH} />
      {kind === 'plus' && <View style={styles.barV} />}
    </Pressable>
  );
}

function Radio({ on }: { on: boolean }) {
  return <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>;
}

function Toggle({ label, note, value, onChange }: { label: string; note?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <AppText variant="title">{label}</AppText>
        {note && <AppText variant="caption" muted>{note}</AppText>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.line, true: Colors.signal }}
        thumbColor={Colors.text}
        ios_backgroundColor={Colors.line}
        accessibilityLabel={`${label} meiden`}
      />
    </View>
  );
}

function MicIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={Colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1 -6 0V6a3 3 0 0 1 3 -3z" />
      <Path d="M19 11a7 7 0 0 1 -14 0" />
      <Path d="M12 18v3" />
    </Svg>
  );
}

function Progress({ phase, done, onCancel }: { phase: PlanPhase; done: PlanPhase[]; onCancel: () => void }) {
  return (
    <View style={styles.gapL}>
      <View style={styles.card}>
        {PHASES.map((p) => {
          const isDone = done.includes(p.id);
          const isNow = p.id === phase;
          // Umfahren taucht nur auf, wenn der Check gesperrte Stellen gefunden hat
          if (p.id === 'fix' && !isNow && !isDone) return null;
          return (
            <View key={p.id} style={styles.phaseRow}>
              <View style={styles.phaseIcon}>
                {isNow ? <ActivityIndicator color={Colors.signal} /> : <View style={[styles.phaseDot, isDone && styles.phaseDotDone]} />}
              </View>
              <AppText style={isNow ? undefined : isDone ? styles.mutedText : styles.dimText}>{p.label}</AppText>
            </View>
          );
        })}
      </View>
      <AppText variant="caption" muted>
        Wir prüfen jede Straße auf Sperrungen, Feldwege und rauen Belag. Das dauert meist unter einer Minute.
      </AppText>
      <SecondaryButton label="Abbrechen" onPress={onCancel} />
    </View>
  );
}

function ErrorCard({
  error, mode, onRetry, onBack, onUsePlace,
}: {
  error: PlanError; mode: Mode; onRetry: () => void; onBack: () => void; onUsePlace: () => void;
}) {
  const help: Record<PlanError['kind'], string> = {
    permission: mode === 'beschreiben'
      ? 'Gib den Standort in den Einstellungen frei oder schreib den Start dazu, zum Beispiel "ab Bensheim".'
      : 'Gib den Standort in den Einstellungen frei oder such dir unter Start einen Ort aus.',
    services: 'Schalte die Ortung in den Einstellungen ein oder wähle einen Startort von Hand.',
    position: 'Geh kurz ins Freie und versuch es nochmal, oder wähle einen Startort von Hand.',
    notfound: 'Prüf die Schreibweise oder nimm einen größeren Ort in der Nähe.',
    network: 'Prüf deine Internetverbindung. Der Dienst ist manchmal kurz überlastet, ein zweiter Versuch hilft oft.',
    routing: 'Probier eine andere Länge, Richtung oder würfle neu.',
    aborted: '',
  };
  const needsPlace = error.kind === 'permission' || error.kind === 'services' || error.kind === 'position';
  return (
    <View style={styles.gapL}>
      <View style={[styles.card, styles.errorCard]}>
        <AppText variant="label" style={styles.signalText}>Das hat nicht geklappt</AppText>
        <AppText variant="title">{error.message}</AppText>
        <AppText variant="caption" muted>{help[error.kind]}</AppText>
      </View>
      {(error.kind === 'permission' || error.kind === 'services') && (
        <PrimaryButton label="Einstellungen öffnen" onPress={() => void Linking.openSettings()} />
      )}
      {(error.kind === 'network' || error.kind === 'routing' || error.kind === 'position') && (
        <PrimaryButton label={error.kind === 'routing' ? 'Neu würfeln' : 'Nochmal versuchen'} onPress={onRetry} />
      )}
      {needsPlace && <SecondaryButton label="Startort von Hand wählen" onPress={onUsePlace} />}
      <SecondaryButton label="Zurück zum Formular" onPress={onBack} />
    </View>
  );
}

function Result({
  tour, req, stops, group, onReroll, onBack,
}: {
  tour: PlannedTour; req: TourRequest; stops: Stop[]; group: boolean; onReroll: () => void; onBack: () => void;
}) {
  const sauber = tour.km_je_klasse?.ok ?? 0;
  const total = tour.laenge_km;
  const share = total > 0 ? Math.round((sauber / total) * 100) : 0;
  const warnings = tour.warnungen.filter((w) => w.klasse !== 'ok');
  const openMap = () => {
    setActiveTour(tour, req.profile, req.avoid);
    router.push('/karte');
  };
  const drive = () => {
    setActiveTour(tour, req.profile, req.avoid);
    router.push('/navigation');
  };
  return (
    <View style={styles.gapL}>
      <View style={styles.gapS}>
        <AppText variant="label">{tour.name}</AppText>
        <AppText variant="caption" muted>
          {PROFILE_WORD[req.profile]}, {req.towardName ? `Richtung ${req.towardName}` : dirPhrase(req.direction)}
        </AppText>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Karte groß öffnen" onPress={openMap} style={styles.mapBox}>
        <RouteMap tour={tour} interactive={false} style={styles.map} />
        <View style={styles.mapBadge}>
          <AppText style={styles.mapBadgeText}>Karte groß</AppText>
        </View>
      </Pressable>
      <View style={styles.legend}>
        {(['ok', 'pruefen', 'raus'] as CheckClass[]).map((c) => (
          <View key={c} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: CLASS_COLORS[c] }]} />
            <AppText variant="caption" muted>{CLASS_LABEL[c]}</AppText>
          </View>
        ))}
      </View>

      <Pressable accessibilityRole="button" onPress={drive} style={({ pressed }) => [styles.go, pressed && styles.pressed]}>
        <AppText style={styles.goText}>Losfahren</AppText>
      </Pressable>

      <View style={styles.stats}>
        <View style={styles.flex}>
          <AppText style={styles.statBig}>{formatKm(total, 0)}</AppText>
          <AppText variant="caption" muted>km</AppText>
        </View>
        <View style={styles.flex}>
          <AppText style={styles.statBig}>{formatMinutes(Math.round(tour.minutes))}</AppText>
          <AppText variant="caption" muted>Fahrzeit</AppText>
        </View>
      </View>

      <View style={[styles.card, styles.checkCard]}>
        <View style={[styles.dot, warnings.length ? styles.dotWarn : null]} />
        <View style={styles.flex}>
          <AppText variant="title">geprüft: {formatKm(sauber)} km sauber</AppText>
          <AppText variant="caption" muted>
            {share} % der Strecke ohne Auffälligkeiten
            {tour.fixes > 0 ? `, ${tour.fixes} mal um gesperrte Stellen umgeplant` : ''}.
          </AppText>
        </View>
      </View>

      {warnings.length > 0 && (
        <Section label={`Warnungen (${warnings.length})`}>
          <View style={styles.card}>
            {warnings.map((w, i) => (
              <View key={i} style={[styles.warnRow, i > 0 && styles.warnBorder]}>
                <View style={[styles.badge, { borderColor: CLASS_COLORS[w.klasse] }]}>
                  <AppText style={[styles.badgeText, { color: CLASS_COLORS[w.klasse] }]}>{CLASS_LABEL[w.klasse]}</AppText>
                </View>
                <View style={styles.flex}>
                  <AppText variant="title">{w.name || 'Unbenannter Abschnitt'}</AppText>
                  <AppText variant="caption" muted>
                    bei km {formatKm(w.start_km)}, {formatKm(w.laenge_km)} km lang
                  </AppText>
                  {w.gruende.length > 0 && <AppText variant="caption">{w.gruende.join(', ')}</AppText>}
                </View>
              </View>
            ))}
          </View>
        </Section>
      )}

      {stops.length > 0 && (
        <View style={styles.card}>
          <AppText variant="label">Stopps</AppText>
          <AppText>{joinDe(stops.map((id) => STOPS.find((x) => x.id === id)!.label))}</AppText>
          <AppText variant="caption" muted>Werden bald eingeplant, heute nur angezeigt.</AppText>
        </View>
      )}

      {group && <GroupBlock />}

      <View style={styles.gapS}>
        <PrimaryButton label="Neu würfeln" onPress={onReroll} />
        <SecondaryButton label="Zurück zum Formular" onPress={onBack} />
      </View>
    </View>
  );
}

function GroupBlock() {
  const [hint, setHint] = useState(false);
  return (
    <View style={styles.card}>
      <AppText variant="label">Gruppe</AppText>
      <AppText>Fahrt diese Runde zusammen.</AppText>
      <SecondaryButton label="Mitfahrer einladen" onPress={() => setHint(true)} />
      {hint && <AppText variant="caption" muted>Einladen per Link folgt bald.</AppText>}
      <AppText variant="caption" muted>
        Funk und Live Positionen laufen während der Fahrt im Tab Gruppe.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  gapS: { gap: Spacing.s },
  gapM: { gap: Spacing.m },
  gapL: { gap: Spacing.l },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  headerBlock: { gap: Spacing.m },
  mutedText: { color: Colors.muted },
  dimText: { color: Colors.line },
  goodText: { color: Colors.good },
  signalText: { color: Colors.signal },
  onSignal: { color: Colors.onSignal },

  segment: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.pill, padding: 4, borderWidth: 1, borderColor: Colors.line },
  segItem: { flex: 1, height: 38, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: Colors.surface2 },
  segText: { fontFamily: Fonts.medium, fontSize: 15, color: Colors.muted },
  segTextOn: { fontFamily: Fonts.semibold, color: Colors.text },

  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  inputCard: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, flexDirection: 'row', gap: Spacing.m, borderWidth: 1, borderColor: Colors.line },
  freeText: { flex: 1, minHeight: 96, color: Colors.text, fontFamily: Fonts.regular, fontSize: 17, textAlignVertical: 'top', padding: 0 },
  mic: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },

  durRow: { flexDirection: 'row', gap: Spacing.s },
  durTile: { flex: 1, minHeight: 72, borderRadius: Radius.m, borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  tileOn: { backgroundColor: Colors.signal, borderColor: Colors.signal },
  durBig: { fontFamily: Fonts.display, fontSize: 28, lineHeight: 32 },

  understood: { flexDirection: 'row', gap: Spacing.m, backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, borderWidth: 1, borderColor: Colors.line },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.good, marginTop: 5 },
  dotWarn: { backgroundColor: WARN },

  primary: { height: 56, borderRadius: Radius.m, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: Fonts.bold, fontSize: 17, color: Colors.onSignal },
  secondary: { height: 50, borderRadius: Radius.m, borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: 16, color: Colors.text },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.35 },

  startRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: Colors.signal },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.signal },
  searchRow: { flexDirection: 'row', gap: Spacing.s },
  search: { flex: 1, height: 44, borderRadius: Radius.s, backgroundColor: Colors.surface2, color: Colors.text, paddingHorizontal: Spacing.m, fontFamily: Fonts.regular, fontSize: 15 },
  searchBtn: { height: 44, paddingHorizontal: Spacing.l, borderRadius: Radius.s, borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center' },
  searchBtnText: { fontFamily: Fonts.semibold, fontSize: 15 },
  hit: { paddingVertical: Spacing.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },

  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center' },
  barH: { position: 'absolute', width: 18, height: 2, borderRadius: 1, backgroundColor: Colors.text },
  barV: { position: 'absolute', width: 2, height: 18, borderRadius: 1, backgroundColor: Colors.text },
  stepValue: { alignItems: 'center' },
  bigNumber: { fontFamily: Fonts.display, fontSize: 48, lineHeight: 52, fontVariant: ['tabular-nums'] },

  grid: { gap: Spacing.s },
  gridRow: { flexDirection: 'row', gap: Spacing.s },
  gridCell: { flex: 1, height: 56, borderRadius: Radius.m, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  gridText: { fontFamily: Fonts.displayBold, fontSize: 16 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },

  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 32 },
  phaseIcon: { width: 24, alignItems: 'center' },
  phaseDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: Colors.line },
  phaseDotDone: { backgroundColor: Colors.good, borderColor: Colors.good },

  errorCard: { borderWidth: 1, borderColor: Colors.signal },

  mapBox: { height: 320, borderRadius: Radius.l, overflow: 'hidden', borderWidth: 1, borderColor: Colors.line },
  map: { flex: 1 },
  mapBadge: { position: 'absolute', right: Spacing.m, bottom: Spacing.m, height: 36, paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: 'rgba(11,11,12,0.88)', borderWidth: 1, borderColor: Colors.line, justifyContent: 'center' },
  mapBadgeText: { fontFamily: Fonts.semibold, fontSize: 14 },
  go: { height: 60, borderRadius: Radius.m, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  goText: { fontFamily: Fonts.display, fontSize: 20, color: Colors.onSignal, textTransform: 'uppercase', letterSpacing: 1 },

  legend: { flexDirection: 'row', gap: Spacing.l },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  legendSwatch: { width: 14, height: 4, borderRadius: 2 },

  stats: { flexDirection: 'row', gap: Spacing.l },
  statBig: { fontFamily: Fonts.display, fontSize: 44, lineHeight: 48, fontVariant: ['tabular-nums'] },
  checkCard: { flexDirection: 'row', alignItems: 'flex-start' },

  warnRow: { flexDirection: 'row', gap: Spacing.m, paddingTop: Spacing.s },
  warnBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line, paddingTop: Spacing.m },
  badge: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: Spacing.s, height: 24, justifyContent: 'center', alignSelf: 'flex-start' },
  badgeText: { fontFamily: Fonts.semibold, fontSize: 12 },
});
