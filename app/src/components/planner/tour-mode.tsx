/**
 * Oberfläche der Route im Planer: Punktliste mit Suchfeld und Anfasser, Etappen mit Profil und
 * Pass Vorschlägen, Vermeiden, Ergebnis der Route. Der Zustand kommt aus use-tour-plan.ts.
 */
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';

import { HighlightList } from '@/components/planner/highlight-list';
import { closedHint, passState, usePassLive } from '@/lib/pass-live';
import { PASS_STATUS_URL, PASSES, passPoint, passSummary, searchPasses } from '@/lib/passes';
import { countCurves } from '@/lib/stats';
import { locate, toPlanError, type Spot } from '@/components/planner/create-tour';
import { ElevationChart } from '@/components/planner/elevation-chart';
import { ActionBar } from '@/components/ui/action-bar';
import { AppText } from '@/components/ui/text';
import { Colors, Shadow } from '@/constants/theme';
import { setActiveTour } from '@/lib/active-tour';
import { useSession } from '@/lib/auth';
import { type Place } from '@/lib/geocode';
import { doubledStretch } from '@/lib/doubled';
import { passesOnLegs, routePasses, straightLine } from '@/lib/route-edit';
import { flatten, formatKm, legs, LEG_PROFILE_CHOICES, type LatLon, type Profile } from '@/lib/tour';
import { type Avoid } from '@/lib/valhalla';

import { DragHandle, GroupBlock, LocationIcon, Pill, PointSymbol, PrimaryButton, SecondaryButton, Section, SmallButton, Stats, StopsSection, Toggle, TrustLine, Warnings } from './planner-parts';
import { keyOf, type PendingPoint, type PointKind, profileWord, samePts, STEP_TEXT, usePlaceSuggest } from './planner-shared';
import { styles } from './planner-styles';
import { type TourPlan } from './use-tour-plan';


export type EditTarget = { kind: PointKind; index?: number; insert?: boolean };

export function TourMode({
  plan, here, onHere, profile, avoid, setAvoid, group, pending, setPending, onSearchFocus, onDragChange,
}: {
  plan: TourPlan;
  here: Spot | null;
  onHere: (s: Spot) => void;
  /** Allgemeines Profil: gilt für jede Etappe ohne eigenes Profil */
  profile: Profile;
  avoid: Avoid;
  setAvoid: (a: Avoid) => void;
  group: boolean;
  /** Punkt aus dem langen Druck auf die große Karte, wartet auf die Rolle */
  pending: PendingPoint | null;
  setPending: (p: PendingPoint | null) => void;
  /** Suchfeld bekommt den Fokus: das Blatt geht auf volle Höhe */
  onSearchFocus: () => void;
  /** Ziehen am Anfasser läuft: das Blatt darf solange nicht scrollen */
  onDragChange: (on: boolean) => void;
}) {
  const session = useSession();
  const live = usePassLive();
  const { pts, planned } = plan;
  const busy = plan.step !== null;
  // Die geplante Route passt nur, solange die Punkte dieselben sind
  const fits = !!planned && samePts(planned.wegpunkte, pts);
  const routeTour = fits ? planned : null;

  const [query, setQuery] = useState('');
  const [planChanged, setPlanChanged] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  /** Punkt, dessen Aktionen (Ändern, Verschieben, Entfernen) gerade offen sind */
  const [, setMenu] = useState<string | null>(null);
  /** Drag and Drop am Anfasser: welcher Punkt gezogen wird und wohin er fallen würde */
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dragY = useSharedValue(0);
  /** Mitte jeder Punktzeile in der Liste, für das Ziel beim Ziehen */
  const centers = useRef<number[]>([]);
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.get() }, { scale: 1.03 }],
    boxShadow: Shadow.lift,
    backgroundColor: Colors.surface2,
  }));
  /** Etappe, deren Profilauswahl gerade offen ist */
  const [legMenu, setLegMenu] = useState<number | null>(null);

  const flat = useMemo(() => (routeTour ? flatten(routeTour) : []), [routeTour]);
  const line = useMemo(() => flat.map((x) => x.p), [flat]);
  const along = useMemo(() => (line.length > 1 ? routePasses(PASSES, line).along : []), [line]);
  const curves = useMemo(() => (line.length > 1 ? countCurves(line) : 0), [line]);
  const twiceKm = useMemo(() => (line.length > 1 ? doubledStretch(line).km : 0), [line]);
  const parts = useMemo(() => (routeTour ? legs(routeTour) : []), [routeTour]);
  const hint = closedHint(along.map((x) => x.pass), live);

  // Pässe je Etappe, nur wenn sie auf dem Weg liegen (Umweg und Fortschritt), jeder nur einmal
  const { start: pStart, vias: pVias, ziel: pZiel, complete } = plan;
  const legSuggest = useMemo(() => {
    const slots = [pStart, ...pVias, pZiel];
    const skip = new Set(along.map((x) => x.pass.id));
    const lines = slots.slice(0, -1).map((a, i) => {
      const b = slots[i + 1];
      if (!a || !b) return [];
      const part = complete ? parts[i] : undefined;
      const routed = part ? flat.filter((x) => x.km >= part.startKm && x.km <= part.endKm).map((x) => x.p) : [];
      return routed.length > 1 ? routed : straightLine(a, b);
    });
    return passesOnLegs(PASSES, slots, lines, skip);
  }, [pStart, pVias, pZiel, complete, parts, flat, along]);

  const add = (kind: PointKind, p: LatLon, known?: string) => {
    setPlanChanged(false);
    plan.add(kind, p, profile, avoid, known);
  };

  /** Feld, das gerade bearbeitet wird; dort öffnet sich die Suche. Ohne Start beginnt es mit dem Start. */
  const [edit, setEdit] = useState<EditTarget | null>(() => (plan.start ? null : { kind: 'start' }));
  /** Punkt, der gerade bearbeitet wird (null bei neuem Punkt oder leerem Feld) */
  const pointOf = (e: EditTarget | null): LatLon | null =>
    !e || e.insert ? null : e.kind === 'start' ? plan.start : e.kind === 'ziel' ? plan.ziel : (plan.vias[e.index ?? -1] ?? null);
  function openEdit(e: EditTarget) {
    setEdit(e);
    setMenu(null);
    setLegMenu(null);
    // Gesetzter Punkt: sein Name steht im Feld (markiert, Tippen ersetzt ihn), das X entfernt den Punkt
    const cur = pointOf(e);
    const name = cur ? nameOf(cur) : '';
    setQuery(name);
    setEditName(name);
    setLocMsg(null);
  }
  const [editName, setEditName] = useState('');
  const editPoint = pointOf(edit);
  function removeEdited() {
    if (!edit) return;
    if (edit.kind === 'start') plan.removeStart(profile, avoid);
    else if (edit.kind === 'ziel') plan.removeZiel(profile, avoid);
    else plan.removeVia(edit.index!, profile, avoid);
  }

  // Vorschläge schon beim Tippen: passende Pässe zuerst, dann Orte in der Nähe des letzten Punkts
  const lastPt = pts[pts.length - 1] ?? here?.p;
  const nearLat = lastPt?.[0];
  const nearLon = lastPt?.[1];
  const near = useMemo<LatLon | undefined>(() => (nearLat != null && nearLon != null ? [nearLat, nearLon] : undefined), [nearLat, nearLon]);
  // Solange der Name des Punkts unverändert im Feld steht, keine Vorschläge
  const suggest = usePlaceSuggest(query === editName ? '' : query, near);
  const passHits = useMemo<Place[]>(
    () =>
      query.trim().length >= 2
        ? searchPasses(PASSES, query.trim(), 3).map((x) => ({
            name: x.name,
            detail: `Pass, ${passSummary(x, undefined, passState(x, live).note)}, ${x.region}`,
            p: passPoint(x),
          }))
        : [],
    [query, live],
  );
  const hits: Place[] | null =
    query.trim().length < 2 ? null : [...passHits, ...(suggest.hits ?? []).filter((x) => !passHits.some((y) => y.name === x.name)).slice(0, 7)];
  const searching = suggest.searching;

  function pick(p: LatLon, name: string | undefined) {
    if (!edit) return;
    setPlanChanged(false);
    if (edit.insert) plan.insertAt(edit.index ?? plan.vias.length, p, profile, avoid, name);
    else plan.setSlot(edit.kind, p, profile, avoid, name, edit.index);
    setQuery('');
    // Nach dem Start gleich das Ziel abfragen
    setEdit(edit.kind === 'start' && !plan.ziel ? { kind: 'ziel' } : null);
  }

  async function takeHere() {
    if (!edit) return;
    setLocMsg(null);
    setLocating(true);
    try {
      const spot = here ?? (await locate());
      if (!here) onHere(spot);
      pick(spot.p, spot.name ?? 'Mein Standort');
    } catch (e) {
      setLocMsg(toPlanError(e).message);
    } finally {
      setLocating(false);
    }
  }

  const editor = (
    <View style={styles.editor}>
      <View style={styles.field}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={edit?.kind === 'start' ? 'Wo geht es los?' : edit?.kind === 'ziel' ? 'Wohin soll es gehen?' : 'Ort oder Pass für das Zwischenziel'}
          placeholderTextColor={Colors.muted}
          returnKeyType="search"
          autoFocus
          selectTextOnFocus
          onSubmitEditing={() => query === editName && setEdit(null)}
          onFocus={onSearchFocus}
          style={styles.fieldInput}
          accessibilityLabel="Ort oder Pass suchen"
        />
        {searching && <ActivityIndicator color={Colors.muted} />}
        {edit?.kind !== 'via' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={locating ? 'Standort wird bestimmt' : 'Mein Standort'}
            onPress={() => !locating && void takeHere()}
            hitSlop={6}
            style={({ pressed }) => [styles.fieldIcon, pressed && styles.pressed]}>
            {locating ? <ActivityIndicator color={Colors.signal} /> : <LocationIcon />}
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={editPoint ? 'Punkt entfernen' : 'Suche schließen'}
          onPress={() => {
            if (editPoint) removeEdited();
            setQuery('');
            setEdit(null);
          }}
          hitSlop={6}
          style={({ pressed }) => [styles.fieldIcon, pressed && styles.pressed]}>
          <SymbolView name="xmark.circle.fill" size={20} tintColor={Colors.muted} />
        </Pressable>
      </View>
      {locMsg && <AppText variant="caption" style={[styles.signalText, styles.hitPad]}>{locMsg}</AppText>}
      {hits && hits.length === 0 && <AppText variant="caption" muted style={styles.hitPad}>Nichts gefunden. Versuch es mit dem Ortsnamen.</AppText>}
      {hits?.map((h, i) => (
        <Pressable
          key={`${h.p[0]},${h.p[1]},${i}`}
          accessibilityRole="button"
          onPress={() => pick(h.p, h.name)}
          style={({ pressed }) => [styles.hitRow, styles.hitPad, styles.hitLine, pressed && styles.hitPressed]}>
          <View style={styles.hitMain}>
            <AppText variant="title">{h.name}</AppText>
            {!!h.detail && <AppText variant="caption" muted>{h.detail}</AppText>}
          </View>
        </Pressable>
      ))}
    </View>
  );

  function addPending(kind: PointKind) {
    if (!pending) return;
    add(kind, pending.p, pending.name ?? undefined);
    setPending(null);
  }

  const total = routeTour?.laenge_km ?? 0;
  const warnings = routeTour ? routeTour.warnungen.filter((w) => w.klasse !== 'ok') : [];
  // Für Navigation und Speichern: Profil der ersten Etappe (sonst das allgemeine)
  const firstProfile = plan.legProfile(plan.start ? 0 : 1, profile);

  const drive = () => {
    if (!routeTour) return;
    setActiveTour({ ...routeTour, name: plan.name.trim() || routeTour.name }, firstProfile, avoid);
    router.push('/navigation');
  };

  const nameOf = (p: LatLon) => plan.names[keyOf(p)] ?? `${p[0].toFixed(4)}, ${p[1].toFixed(4)}`;

  /** Eine Zeile der Punktliste mit Aktionen und, falls offen, dem Suchfeld darunter. */
  function pointRow(id: string, kind: PointKind, p: LatLon | null, index: number | undefined, slot: number) {
    const viaNo = (index ?? 0) + 1;
    const role = kind === 'start' ? 'Start' : kind === 'ziel' ? 'Ziel' : `Zwischenziel ${viaNo}`;
    const isEditing = !!edit && !edit.insert && edit.kind === kind && (kind !== 'via' || edit.index === index);
    return (
      <View key={id} style={styles.gapS}>
        {/* Beim Bearbeiten ersetzt das Suchfeld die Zeile, sonst stünden Platzhalter und Feld doppelt da */}
        {!isEditing && (
        <Animated.View style={[styles.pointRow, drag?.from === slot && dragStyle]}>
          <PointSymbol kind={kind} label={String(viaNo)} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${role} ${p ? `ändern, jetzt ${nameOf(p)}` : 'wählen'}`}
            onPress={() => openEdit({ kind, index })}
            style={styles.pointMain}>
            <AppText variant="title" numberOfLines={1} style={!p && styles.slotPlaceholder}>
              {p ? nameOf(p) : kind === 'start' ? 'Start wählen' : 'Ziel wählen'}
            </AppText>
          </Pressable>
          {p && plan.complete && (
            <DragHandle
              label={`${role} verschieben`}
              onStart={() => {
                setMenu(null);
                setLegMenu(null);
                onDragChange(true);
                setDrag({ from: slot, to: slot });
              }}
              onMove={(dy) => {
                dragY.set(dy);
                const c = centers.current;
                const y = (c[slot] ?? 0) + dy;
                let best = slot;
                for (let k = 0; k < c.length; k++) if (Math.abs(c[k] - y) < Math.abs(c[best] - y)) best = k;
                setDrag((d) => (d && d.to !== best ? { ...d, to: best } : d));
              }}
              onEnd={() => {
                setDrag((d) => {
                  if (d && d.to !== d.from) {
                    const order = centers.current.map((_, k) => k);
                    order.splice(d.from, 1);
                    order.splice(d.to, 0, d.from);
                    plan.reorder(order, profile, avoid);
                  }
                  return null;
                });
                dragY.set(0);
                onDragChange(false);
              }}
            />
          )}
        </Animated.View>
        )}
        {isEditing && editor}
      </View>
    );
  }

  /** Etappe zwischen Feld i und Feld i+1: Zwischenziel einfügen, Profil der Etappe, Vorschläge. */
  function legRow(i: number, a: LatLon | null, b: LatLon | null) {
    const ready = !!a && !!b;
    const lp = plan.legProfile(i, profile);
    const part = plan.complete && routeTour ? parts[i] : undefined;
    const suggestions = legSuggest[i] ?? [];
    const inserting = !!edit?.insert && edit.index === i;
    const choosing = legMenu === i;
    return (
      <View key={`leg${i}`} style={[styles.legBlock, !!drag && styles.dimmed]}>
        <View style={styles.connector}>
          {Array.from({ length: 5 }, (_, d) => (
            <View key={d} style={styles.connectorDot} />
          ))}
        </View>
        {ready ? (
          <View style={styles.legBody}>
            <View style={styles.legControls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Zwischenziel auf Etappe ${i + 1} einfügen`}
                onPress={() => openEdit({ kind: 'via', index: i, insert: true })}
                style={({ pressed }) => [styles.plusBtn, inserting && styles.plusBtnOn, pressed && styles.pressed]}>
                <View style={styles.plusH} />
                <View style={styles.plusV} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Profil der Etappe ${i + 1}: ${profileWord(lp)}, ändern`}
                accessibilityState={{ expanded: choosing }}
                onPress={() => {
                  setLegMenu(choosing ? null : i);
                  setMenu(null);
                }}
                style={({ pressed }) => [styles.profilePill, choosing && styles.profilePillOn, pressed && styles.pressed]}>
                <AppText style={styles.profileText}>{profileWord(lp)} ⌄</AppText>
              </Pressable>
              {part && (
                <AppText variant="caption" muted style={styles.legKm} numberOfLines={1}>
                  {formatKm(part.endKm - part.startKm)} km
                </AppText>
              )}
            </View>
            {choosing && (
              <View style={styles.wrap}>
                {LEG_PROFILE_CHOICES.map((c) => (
                  <Pill
                    key={c.id}
                    label={c.label}
                    active={lp === c.id}
                    onPress={() => {
                      setLegMenu(null);
                      setPlanChanged(false);
                      if (c.id !== lp) plan.setLegProfile(i, c.id, profile, avoid);
                    }}
                  />
                ))}
              </View>
            )}
            {suggestions.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestRow}>
                {suggestions.map(({ pass, detourKm }) => (
                  <Pressable
                    key={pass.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${pass.name} einbauen, etwa ${Math.max(1, Math.round(detourKm))} km Umweg`}
                    onPress={() => {
                      setPlanChanged(false);
                      plan.insertAt(i, passPoint(pass), profile, avoid, pass.name);
                    }}
                    style={({ pressed }) => [styles.suggestChip, pressed && styles.pressed]}>
                    {pass.tier === 'ikone' && <View style={styles.suggestDot} />}
                    <AppText style={styles.suggestText} numberOfLines={1}>
                      {pass.name}
                    </AppText>
                    <AppText style={styles.suggestDetour}>+{Math.max(1, Math.round(detourKm))} km</AppText>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {inserting && editor}
          </View>
        ) : (
          <View style={styles.legGap} />
        )}
      </View>
    );
  }

  const slots: (LatLon | null)[] = [plan.start, ...plan.vias, plan.ziel];

  return (
    <>

      {pending && !pending.pass && (
        <View style={[styles.card, styles.pendingCard]}>
          <View style={styles.flex}>
            <AppText variant="label">Neuer Punkt</AppText>
            <AppText variant="title">{pending.name ?? `${pending.p[0].toFixed(4)}, ${pending.p[1].toFixed(4)}`}</AppText>
          </View>
          <View style={styles.wrap}>
            <SmallButton label="Als Start" onPress={() => addPending('start')} />
            {plan.complete && <SmallButton label="Als Zwischenziel" onPress={() => addPending('via')} />}
            <SmallButton label="Als Ziel" onPress={() => addPending('ziel')} strong />
            <SmallButton label="Abbrechen" onPress={() => setPending(null)} />
          </View>
        </View>
      )}

      <View style={styles.gapS}>
        <AppText variant="label">Name</AppText>
        <TextInput
          value={plan.name}
          onChangeText={plan.setName}
          placeholder="Name der Tour"
          placeholderTextColor={Colors.muted}
          style={[styles.search, styles.searchOnGround]}
          accessibilityLabel="Name der Tour"
        />
      </View>

      <Section label="Route">
        <View>
          {slots.map((p, i) => {
            const kind: PointKind = i === 0 ? 'start' : i === slots.length - 1 ? 'ziel' : 'via';
            return (
              <View
                key={kind === 'via' ? `via${i - 1}-${p ? keyOf(p) : ''}` : kind}
                style={drag?.from === i && styles.dragging}
                onLayout={(e) => {
                  // Mitte der Punktzeile (oben in diesem Block, 52 hoch)
                  centers.current[i] = e.nativeEvent.layout.y + 26;
                  centers.current.length = slots.length;
                }}>
                {pointRow(kind === 'via' ? `via${i - 1}` : kind, kind, p, kind === 'via' ? i - 1 : undefined, i)}
                {i < slots.length - 1 && legRow(i, p, slots[i + 1])}
                {/* Beim Ziehen: Linie zeigt, wo der Punkt landet (über oder unter dieser Zeile) */}
                {drag && drag.from !== i && drag.to === i && (
                  <View pointerEvents="none" style={[styles.dropLine, drag.to < drag.from ? styles.dropLineTop : styles.dropLineBottom]}>
                    <View style={styles.dropDot} />
                    <View style={styles.dropBar} />
                  </View>
                )}
              </View>
            );
          })}
          {plan.complete && (
            <Pressable accessibilityRole="button" onPress={() => plan.swap(profile, avoid)} style={styles.linkBtn}>
              <AppText style={styles.linkText}>Start und Ziel tauschen</AppText>
            </Pressable>
          )}
        </View>
      </Section>

      {plan.step && (
        <View style={[styles.card, styles.statusRow]}>
          <ActivityIndicator color={Colors.signal} />
          <AppText style={styles.flex}>{STEP_TEXT[plan.step]}</AppText>
        </View>
      )}
      {plan.error && (
        <View style={[styles.card, styles.errorCard]}>
          <AppText variant="label" style={styles.signalText}>Das hat nicht geklappt</AppText>
          <AppText>{plan.error}</AppText>
          {pts.length >= 2 && <SecondaryButton label="Nochmal versuchen" onSurface onPress={() => plan.planNow(profile, avoid)} />}
        </View>
      )}

      {routeTour && (
        <>
          <Stats km={total} minutes={routeTour.minutes} curves={curves} />
          {warnings.length === 0 && routeTour.geprueft !== false && <TrustLine />}

          {twiceKm >= 1 && (
            <View style={[styles.card, styles.checkCard]}>
              <View style={[styles.dot, styles.dotWarn]} />
              <View style={styles.flex}>
                <AppText variant="title">{formatKm(twiceKm, 0)} km fährst du zweimal</AppText>
                <AppText variant="caption" muted>
                  Ein Stück geht auf derselben Straße zurück. Ein anderes Zwischenziel oder eine andere Reihenfolge ändert das oft.
                </AppText>
              </View>
            </View>
          )}

          {hint && (
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(PASS_STATUS_URL)} style={styles.winter}>
              <AppText style={styles.winterTitle}>{hint.title}</AppText>
              <AppText variant="caption" style={styles.winterText}>
                {hint.text} Tippen für den aktuellen Passstatus.
              </AppText>
            </Pressable>
          )}

          <HighlightList line={line} />

          {warnings.length > 0 && <Warnings warnings={warnings} checked={routeTour.geprueft !== false} />}

          <ElevationChart line={line} />

          <StopsSection line={line} busy={busy} onAdd={(p) => add('via', p)} />
        </>
      )}

      <Section label="Vermeiden">
        <View style={styles.card}>
          {(
            [
              ['closures', 'Gesperrte Straßen', 'calimoto warnt nur, wir meiden.'],
              ['ferries', 'Fähren', undefined],
              ['tolls', 'Maut', undefined],
              ['rough', 'Rauer Belag', 'Kopfsteinpflaster und schlechter Asphalt.'],
            ] as const
          ).map(([key, label, note]) => (
            <Toggle
              key={key}
              label={label}
              note={note}
              value={avoid[key]}
              onChange={(v) => {
                setAvoid({ ...avoid, [key]: v });
                if (pts.length >= 2) setPlanChanged(true);
              }}
            />
          ))}
        </View>
      </Section>

      {pts.length >= 2 && (planChanged || !routeTour) && !busy && (
        <PrimaryButton
          label={planChanged ? 'Mit neuen Einstellungen planen' : 'Route planen'}
          onPress={() => {
            setPlanChanged(false);
            plan.planNow(profile, avoid);
          }}
        />
      )}

      {group && routeTour && <GroupBlock savedId={plan.cloudId} />}

      {/* Aktionen am Ende: Losfahren als Hauptaktion, darunter die übrigen */}
      {(routeTour || pts.length > 0) && (
      <View style={styles.actions}>
        {routeTour ? (
          <ActionBar
            primary={{ label: 'Losfahren', onPress: drive }}
            save={{ saved: !plan.dirty, busy: plan.saving, onPress: () => !plan.saving && void plan.save(curves, firstProfile, avoid) }}
            more={[
              ...(plan.cloudId && !plan.dirty
                ? [{ key: 'group', icon: 'person.2' as const, label: 'Als Gruppe fahren', hint: 'Mitfahrer mit ihrem Namen einladen', onPress: () => router.push({ pathname: '/gruppe/neu', params: { tour: plan.cloudId! } }) }]
                : []),
              { key: 'new', icon: 'trash', label: plan.cloudId ? 'Schließen' : 'Tour verwerfen', hint: plan.cloudId ? 'Gespeicherte Tour bleibt in Meine Touren' : 'Alle Punkte entfernen', danger: !plan.cloudId, onPress: plan.reset },
            ]}>
            {plan.cloudId && plan.dirty && !plan.saving && (
              <AppText variant="caption" style={styles.changed}>
                Geändert. Tippe auf das Lesezeichen, um die Änderungen zu speichern.
              </AppText>
            )}
            {plan.saveMsg && !plan.dirty && <AppText variant="caption" muted>{plan.saveMsg}</AppText>}
            {!session && !plan.saveMsg && <AppText variant="caption" muted>Wird auf dem Gerät gespeichert. Angemeldet landet die Tour auch im Web Planer.</AppText>}
          </ActionBar>
        ) : (
          pts.length > 0 && <SecondaryButton label="Neue Tour beginnen" onPress={plan.reset} />
        )}
      </View>
      )}
    </>
  );
}
