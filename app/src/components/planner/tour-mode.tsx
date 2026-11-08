/**
 * Oberfläche der Route im Planer: Punktliste mit Suchfeld und Anfasser, Etappen mit Profil und
 * Pass Vorschlägen, Vermeiden, Ergebnis der Route. Der Zustand kommt aus use-tour-plan.ts.
 */
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { HighlightList } from '@/components/planner/highlight-list';
import { closedHint, usePassLive } from '@/lib/pass-live';
import { PASS_STATUS_URL, PASSES } from '@/lib/passes';
import { countCurves } from '@/lib/stats';
import { FunSheet, routeCheck } from '@/components/ui/fun-pill';
import { tourFun } from '@/lib/fun-score';
import { directNote } from '@/lib/plan';
import { FRESH_MS, locate, toPlanError, type Spot } from '@/components/planner/create-tour';
import { ConfirmSheet } from '@/components/ui/action-sheet';
import { NameDialog } from '@/components/planner/name-dialog';
import { showToast } from '@/lib/toast';
import { deleteTour } from '@/lib/library';
import { ActionBar } from '@/components/ui/action-bar';
import { AppText } from '@/components/ui/text';
import { Colors, Motion, Shadow } from '@/constants/theme';
import { setActiveTour } from '@/lib/active-tour';
import { shareTourLink } from '@/lib/share-link';
import { exportTour } from '@/lib/route-file';
import { useSession } from '@/lib/auth';
import { doubledStretch } from '@/lib/doubled';
import { routePasses } from '@/lib/route-edit';
import { flatten, formatKm, haversine, legs, LEG_PROFILE_CHOICES, type LatLon, type Profile } from '@/lib/tour';
import { type Avoid } from '@/lib/valhalla';

import { PlaceSearch, type Cat, type Slot } from './place-search';
import { OrtPanel, type NearKind } from './ort-panel';
import { PointMenu, type PointAction, type PointMenuState } from './point-menu';
import { nearestOnLine, STOP_SNAP_M } from '@/lib/stop-splice';
import { allowTurnAt } from '@/lib/cumo-routing';
import { Accordion, avoidSummary, DragArea, GroupBlock, Pill, PointSymbol, PrimaryButton, SecondaryButton, Section, SmallButton, Stats, StopsPlanner, Toggle, Warnings } from './planner-parts';
import { keyOf, type PendingPoint, type PointKind, profileWord, samePts, STEP_TEXT } from './planner-shared';
import { styles } from './planner-styles';
import { type TourPlan } from './use-tour-plan';


export type EditTarget = { kind: PointKind; index?: number; insert?: boolean };

export function TourMode({
  plan, here, onHere, profile, avoid, setAvoid, group, pending, setPending, onDragChange, onListEdit, onShowPoint,
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
  /** Ziehen am Anfasser läuft: das Blatt darf solange nicht scrollen */
  onDragChange: (on: boolean) => void;
  /** Punkt über die Liste geändert: die Karte darf den Ausschnitt wieder an die Route anpassen */
  onListEdit: () => void;
  /** Auf der Karte zeigen: Blatt klein, Karte fliegt zum Punkt */
  onShowPoint?: (p: LatLon) => void;
}) {
  const session = useSession();
  const live = usePassLive();
  const { pts, planned } = plan;
  const busy = plan.step !== null;
  // Die geplante Route passt nur, solange die Punkte dieselben sind
  const fits = !!planned && samePts(planned.wegpunkte, pts);
  const routeTour = fits ? planned : null;

  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  /** Schwebendes Menü eines Punkts (Variante A, 7.11.) */
  const [menu, setMenu] = useState<PointMenuState | null>(null);
  /** Aufgeklappter Ort (Konzept B3): Hotel, Café, Essen und Aktionen unter der Zeile */
  // Das Ziel steht anfangs aufgeklappt (Koray 8.11.): dort wird meist übernachtet oder gegessen
  const [ortChoice, setOrtOpen] = useState<string | null | undefined>(undefined);
  const ortOpen = ortChoice === undefined ? 'ziel' : ortChoice;
  /** "Alle Hotels" aus dem aufgeklappten Ort: Suche öffnet mit dieser Art */
  const [nearPreset, setNearPreset] = useState<NearKind | undefined>(undefined);
  /** Drag and Drop am Anfasser: welcher Punkt gezogen wird und wohin er fallen würde */
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dragY = useSharedValue(0);
  /** Mitte jeder Punktzeile in der Liste, für das Ziel beim Ziehen */
  const centers = useRef<number[]>([]);
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.get() }, { scale: 1 + Motion.pop / 2 }],
    boxShadow: Shadow.lift,
    backgroundColor: Colors.surface2,
  }));
  /** Etappe, deren Profilauswahl gerade offen ist */
  const [legMenu, setLegMenu] = useState<number | null>(null);

  const flat = useMemo(() => (routeTour ? flatten(routeTour) : []), [routeTour]);
  const line = useMemo(() => flat.map((x) => x.p), [flat]);
  const along = useMemo(() => (line.length > 1 ? routePasses(PASSES, line).along : []), [line]);
  const curves = useMemo(() => (line.length > 1 ? countCurves(line) : 0), [line]);
  // Fahrspaß der geplanten Route (Konzept Tour Fahrspaß Wert)
  const fun = useMemo(() => (routeTour && line.length > 1 ? tourFun(line) : null), [routeTour, line]);
  const [funOpen, setFunOpen] = useState(false);
  const twiceKm = useMemo(() => (line.length > 1 ? doubledStretch(line).km : 0), [line]);
  const parts = useMemo(() => (routeTour ? legs(routeTour) : []), [routeTour]);
  const hint = closedHint(along.map((x) => x.pass), live);


  const add = (kind: PointKind, p: LatLon, known?: string) => {
    plan.add(kind, p, profile, avoid, known);
  };

  const nameOf = (p: LatLon) => plan.names[keyOf(p)] ?? `${p[0].toFixed(4)}, ${p[1].toFixed(4)}`;

  /** Punkt, für den die Suche (PlaceSearch) offen ist */
  const [edit, setEdit] = useState<EditTarget | null>(null);
  /** Punkt, der gerade bearbeitet wird (null bei neuem Punkt oder leerem Feld) */
  const pointOf = (e: EditTarget | null): LatLon | null =>
    !e || e.insert ? null : e.kind === 'start' ? plan.start : e.kind === 'ziel' ? plan.ziel : (plan.vias[e.index ?? -1] ?? null);
  function openEdit(e: EditTarget) {
    setEdit(e);
    setMenu(null);
    setLegMenu(null);
    // Gesetzter Punkt: sein Name steht im Feld (markiert, Tippen ersetzt ihn)
    const cur = pointOf(e);
    setEditName(cur ? nameOf(cur) : '');
    setLocMsg(null);
  }
  const [editName, setEditName] = useState('');
  /** Dialog Name vergeben beim ersten Speichern (Koray 8.11.) */
  const [naming, setNaming] = useState(false);
  const editPoint = pointOf(edit);
  function removeEdited() {
    if (!edit) return;
    onListEdit();
    if (edit.kind === 'start') plan.removeStart(profile, avoid);
    else if (edit.kind === 'ziel') plan.removeZiel(profile, avoid);
    else plan.removeVia(edit.index!, profile, avoid);
    setEdit(null);
  }

  // Vorschläge schon beim Tippen: passende Pässe zuerst, dann Orte in der Nähe des letzten Punkts
  const lastPt = pts[pts.length - 1] ?? here?.p;
  const nearLat = lastPt?.[0];
  const nearLon = lastPt?.[1];
  const near = useMemo<LatLon | undefined>(() => (nearLat != null && nearLon != null ? [nearLat, nearLon] : undefined), [nearLat, nearLon]);
  function pick(p: LatLon, name: string | undefined) {
    if (!edit) return;
    onListEdit();
    if (edit.insert) plan.insertAt(edit.index ?? plan.vias.length, p, profile, avoid, name);
    else plan.setSlot(edit.kind, p, profile, avoid, name, edit.index);
    // Nach dem Start gleich das Ziel abfragen
    if (edit.kind === 'start' && !plan.ziel) openEdit({ kind: 'ziel' });
    else setEdit(null);
  }

  /** Stopp aus einer Kategorie der Suche: als Zwischenziel an der Stelle der Route, an der er liegt */
  function pickStop(p: LatLon, name: string, km: number) {
    onListEdit();
    // km der vorhandenen Zwischenziele entlang der Route
    const kmOf = (q: LatLon) => {
      let best = Infinity;
      let at = 0;
      for (const x of flat) {
        const d = haversine(x.p, q);
        if (d < best) {
          best = d;
          at = x.km;
        }
      }
      return at;
    };
    const index = plan.vias.filter((v) => kmOf(v) < km).length;
    // Nah an der Route: auf der Linie halten, die Strecke bleibt. Weiter weg: hin und zurück, ohne Schleife.
    const near = flat.length ? nearestOnLine(flat.map((x) => x.p), p) : null;
    const at = near && near.d <= STOP_SNAP_M ? flat[near.i].p : p;
    if (at === p) allowTurnAt(p);
    plan.insertAt(index, at, profile, avoid, name);
    setEdit(null);
  }

  async function takeHere() {
    if (!edit) return;
    setLocMsg(null);
    setLocating(true);
    try {
      // Immer neu orten: der beim Öffnen gemerkte Standort kann nach einer Fahrt veraltet sein
      const spot = await locate(undefined, FRESH_MS).catch((e) => {
        if (here) return here;
        throw e;
      });
      onHere(spot);
      pick(spot.p, spot.name ?? 'Mein Standort');
    } catch (e) {
      setLocMsg(toPlanError(e).message);
    } finally {
      setLocating(false);
    }
  }

  // Strecke nur zum Teil gefahren: einmal Bescheid geben (Koray 8.11.)
  useEffect(() => {
    if (plan.roadWarn) showToast(plan.roadWarn);
  }, [plan.roadWarn]);
  const legSlots = [plan.start, ...plan.vias, plan.ziel];
  const legA = edit?.insert && edit.index != null ? legSlots[edit.index] : null;
  const legB = edit?.insert && edit.index != null ? legSlots[edit.index + 1] : null;
  const editLeg = legA && legB ? { a: legA, b: legB } : undefined;
  const editRole = !edit ? '' : edit.kind === 'start' ? 'Start' : edit.kind === 'ziel' ? 'Ziel' : `Zwischenziel ${(edit.index ?? plan.vias.length) + 1}`;
  // Routenkopf der Suche: Start, das bearbeitete Zwischenziel, Ziel (Variante B)
  const headSlots: Slot[] = !edit
    ? []
    : [
        { key: 'start', kind: 'start', label: 'Start', value: plan.start ? nameOf(plan.start) : null, active: edit.kind === 'start' },
        ...(edit.kind === 'via'
          ? [{ key: 'via', kind: 'via' as const, index: edit.index, insert: edit.insert, label: editRole, value: editPoint ? nameOf(editPoint) : null, active: true }]
          : []),
        { key: 'ziel', kind: 'ziel', label: 'Ziel', value: plan.ziel ? nameOf(plan.ziel) : null, active: edit.kind === 'ziel' },
      ];
  const search = (
    <PlaceSearch
      visible={!!edit}
      role={editRole}
      placeholder={edit?.kind === 'start' ? 'Wo geht es los?' : edit?.kind === 'ziel' ? 'Wohin soll es gehen?' : 'Ort oder Pass für das Zwischenziel'}
      current={editName}
      currentP={editPoint ?? undefined}
      initialNear={nearPreset}
      near={near}
      here={here?.p}
      locating={locating}
      message={locMsg}
      onPick={pick}
      onHere={() => void takeHere()}
      onRemove={editPoint ? removeEdited : undefined}
      onClose={() => setEdit(null)}
      route={line.length > 1 ? line : undefined}
      routeMinutes={routeTour?.minutes}
      onPickStop={pickStop}
      routeLoading={busy}
      // Neues Zwischenziel über das Plus: Highlights nur, wenn sie auf dieser Etappe einen Bogen ergeben
      leg={editLeg}
      onPickRoad={(line, name) => {
        if (!edit) return;
        onListEdit();
        const snap = plan.snapshot();
        const replaced = plan.insertRoad(edit.index ?? plan.vias.length, line, profile, avoid, name);
        setEdit(null);
        if (replaced) showToast(`${name} ersetzt ${replaced}, es lag nur 2 km davor`, { action: { label: 'Rückgängig', onPress: () => plan.restore(snap) } });
      }}
      slots={headSlots}
      onSwitch={(sl) => openEdit({ kind: sl.kind, index: sl.index, insert: sl.insert })}
    />
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

  // Solo oder Gruppe, im Schalter der Hauptaktion. Als Gruppe wird die Tour vorher gespeichert,
  // denn Mitfahrer lädt man zu einer Tour aus Meine Touren ein.
  const [askDelete, setAskDelete] = useState(false);
  const [stopCat, setStopCat] = useState<Exclude<Cat, 'alle'> | null>(null);
  // Zurücksetzen leert nur das Formular; ohne Rückfrage, aber mit Rückgängig im Toast
  const resetForm = () => {
    const snap = plan.snapshot();
    const wasSaved = !!plan.cloudId;
    plan.reset();
    showToast(wasSaved ? 'Planer geleert, die Tour bleibt in Meine Touren' : 'Planung zurückgesetzt', {
      action: { label: 'Rückgängig', onPress: () => plan.restore(snap) },
    });
  };
  // Löschen entfernt die geöffnete, gespeicherte Tour aus Meine Touren (mit Rückfrage)
  const deleteSaved = () => {
    if (plan.cloudId) deleteTour(plan.cloudId);
    plan.reset();
    showToast('Tour gelöscht');
  };
  // Allein oder als Gruppe: Abfrage beim Druck auf Losfahren (Koray 7.11.)
  const drive = async (asGroup = false) => {
    if (!routeTour) return;
    if (asGroup) {
      const id = plan.cloudId && !plan.dirty ? plan.cloudId : await plan.save(curves, firstProfile, avoid);
      if (id) router.push({ pathname: '/gruppe/neu', params: { tour: id } });
      return;
    }
    setActiveTour({ ...routeTour, name: plan.name.trim() || routeTour.name }, firstProfile, avoid);
    router.push('/navigation');
  };


  /** Alle gesetzten Punkte in Reihenfolge: Start, Zwischenziele, Ziel */
  const allPts = [plan.start, ...plan.vias, plan.ziel].filter((x): x is LatLon => !!x);
  const isLoop = !!plan.start && !!plan.ziel && keyOf(plan.start) === keyOf(plan.ziel);

  function actionsFor(kind: PointKind): PointAction[] {
    return kind === 'via' ? ['start', 'ziel', 'karte', 'entfernen'] : kind === 'start' ? [...(isLoop || !plan.ziel ? [] : (['ziel'] as PointAction[])), 'karte', 'entfernen'] : [...(isLoop || !plan.start ? [] : (['start'] as PointAction[])), 'karte', 'entfernen'];
  }

  function onMenu(a: PointAction) {
    const m = menu;
    setMenu(null);
    if (!m) return;
    runAction(m, a);
  }

  /** Aktion für den Punkt an Stelle idx, aus dem Menü oder aus dem aufgeklappten Ort */
  function runAction(m: { idx: number; name: string }, a: PointAction) {
    setOrtOpen(null);
    const p = allPts[m.idx];
    if (!p) return;
    if (a === 'karte') {
      onShowPoint?.(p);
      return;
    }
    onListEdit();
    const snap = plan.snapshot();
    const n = allPts.length;
    const kindAt = m.idx === 0 ? 'start' : m.idx === n - 1 ? 'ziel' : 'via';
    if (a === 'entfernen') {
      plan.removeAt(m.idx, profile, avoid);
      showToast(`${m.name} entfernt`, { action: { label: 'Rückgängig', onPress: () => plan.restore(snap) } });
      return;
    }
    // Start und Ziel tauschen, Zwischenziel an den Anfang oder ans Ende (nichts geht verloren)
    if ((a === 'ziel' && kindAt === 'start') || (a === 'start' && kindAt === 'ziel')) {
      plan.swap(profile, avoid);
      return;
    }
    const rest = allPts.map((_, k) => k).filter((k) => k !== m.idx);
    plan.reorder(a === 'start' ? [m.idx, ...rest] : [...rest, m.idx], profile, avoid);
  }

  /** Eine Zeile der Punktliste: die ganze Fläche tippen (ändern) oder halten und ziehen (verschieben), ⋯ für Aktionen. */
  function pointRow(id: string, kind: PointKind, p: LatLon | null, index: number | undefined, slot: number) {
    const viaNo = (index ?? 0) + 1;
    const role = kind === 'start' ? 'Start' : kind === 'ziel' ? 'Ziel' : `Zwischenziel ${viaNo}`;
    const canDrag = !!p && plan.complete;
    const body = (
      <>
        <PointSymbol kind={kind} label={String(viaNo)} />
        <View style={styles.pointMain}>
          <AppText variant="title" numberOfLines={1} style={!p && styles.slotPlaceholder}>
            {p ? nameOf(p) : kind === 'start' ? 'Start wählen' : 'Ziel wählen'}
          </AppText>
        </View>
      </>
    );
    return (
      <View key={id} style={styles.gapS}>
        {/* Zwischenziele eingerückt, die Steuerung der Etappen bleibt auf der Achse von Start und Ziel (Koray 8.11.) */}
        <Animated.View style={[styles.pointRow, kind === 'via' && styles.pointRowVia, drag?.from === slot && dragStyle]}>
          {canDrag ? (
            <DragArea
              label={`${role} ${nameOf(p)}`}
              style={styles.pointArea}
              onTap={() => {
                setNearPreset(undefined);
                openEdit({ kind, index });
              }}
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
              }}>
              {body}
            </DragArea>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${role} ${p ? `ändern, jetzt ${nameOf(p)}` : 'wählen'}`}
              onPress={() => {
                setNearPreset(undefined);
                openEdit({ kind, index });
              }}
              style={styles.pointArea}>
              {body}
            </Pressable>
          )}
          {p && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: ortOpen === id }}
              accessibilityLabel={`${role} ${nameOf(p)}: Hotel, Café, Essen und Aktionen`}
              hitSlop={4}
              onPress={() => {
                setLegMenu(null);
                setOrtOpen(ortOpen === id ? null : id);
              }}
              style={({ pressed }) => [styles.more, pressed && { backgroundColor: Colors.line }]}>
              <SymbolView name={ortOpen === id ? 'chevron.up' : 'chevron.down'} size={15} tintColor={ortOpen === id ? Colors.text : Colors.muted} weight="bold" />
            </Pressable>
          )}
        </Animated.View>
        {p && ortOpen === id && (
          <View style={[styles.ortBox, kind === 'via' && styles.pointRowVia]}>
            <OrtPanel
              p={p}
              withHotel={kind !== 'start' || isLoop}
              actions={actionsFor(kind)}
              onPick={(q, name) => {
                onListEdit();
                plan.setSlot(kind, q, profile, avoid, name, index);
                setOrtOpen(null);
              }}
              onAll={(k) => {
                setNearPreset(k);
                setOrtOpen(null);
                openEdit({ kind, index });
              }}
              onAction={(a) => {
                if (a === 'karte') {
                  setOrtOpen(null);
                  onShowPoint?.(p);
                  return;
                }
                runAction({ idx: kind === 'start' ? 0 : kind === 'ziel' ? allPts.length - 1 : (index ?? 0) + 1, name: nameOf(p) }, a);
              }}
            />
          </View>
        )}
      </View>
    );
  }

  /** Etappe zwischen Feld i und Feld i+1: Zwischenziel einfügen, Profil der Etappe, Vorschläge. */
  function legRow(i: number, a: LatLon | null, b: LatLon | null) {
    const ready = !!a && !!b;
    const lp = plan.legProfile(i, profile);
    const part = plan.complete && routeTour ? parts[i] : undefined;
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
                      if (c.id !== lp) plan.setLegProfile(i, c.id, profile, avoid);
                    }}
                  />
                ))}
              </View>
            )}
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
      {search}
      <PointMenu menu={menu} onPick={onMenu} onClose={() => setMenu(null)} />
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

      <Section label="Route" action={pts.length ? { label: 'Zurücksetzen', onPress: resetForm } : undefined}>
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
          <Stats km={total} minutes={routeTour.minutes} curves={curves} fun={fun} onFun={() => setFunOpen(true)} />
          {!!directNote(routeTour.direkt, Math.max(1, pts.length - 1)) && (
            <AppText variant="caption" muted>{directNote(routeTour.direkt, Math.max(1, pts.length - 1))}</AppText>
          )}
          <NameDialog
            key={naming ? 'offen' : 'zu'}
            visible={naming}
            initial={plan.name.trim() && plan.name !== 'Neue Tour' ? plan.name.trim() : routeTour.name || 'Neue Tour'}
            onCancel={() => setNaming(false)}
            onSave={(n) => {
              setNaming(false);
              void plan.save(curves, firstProfile, avoid, n);
            }}
          />
          <FunSheet fun={fun} name={routeTour.name || 'Deine Route'} visible={funOpen} onClose={() => setFunOpen(false)} check={routeCheck(warnings.length, routeTour.geprueft !== false)} twiceKm={twiceKm} line={line} />


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


          <StopsPlanner busy={busy} onOpen={setStopCat} />
          <PlaceSearch
            visible={!!stopCat}
            role="Stopp"
            placeholder=""
            current=""
            locating={false}
            message={null}
            onPick={() => undefined}
            onHere={() => undefined}
            onClose={() => setStopCat(null)}
            route={line}
            routeMinutes={routeTour?.minutes}
            stopsOnly={stopCat ? { title: 'Unterwegs einplanen', subtitle: `${plan.name.trim() || 'Neue Tour'} · ${Math.round(total)} km`, cat: stopCat } : undefined}
            onPickStop={(p, name, km) => {
              const snap = plan.snapshot();
              setStopCat(null);
              pickStop(p, name, km);
              showToast(`${name} bei km ${Math.round(km)} eingeplant`, { action: { label: 'Rückgängig', onPress: () => plan.restore(snap) } });
            }}
          />
        </>
      )}

      <Accordion label="Vermeiden" summary={avoidSummary(avoid)}>
        <View style={styles.card}>
          {(
            [
              ['closures', 'Gesperrte Straßen', 'Wir planen um gesperrte Straßen herum.'],
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
                const next = { ...avoid, [key]: v };
                setAvoid(next);
                // gleich neu planen, ohne extra Knopf (Koray, 6.11.)
                if (pts.length >= 2) plan.planNow(profile, next);
              }}
            />
          ))}
        </View>
      </Accordion>

      {pts.length >= 2 && !routeTour && !busy && <PrimaryButton label="Route planen" onPress={() => plan.planNow(profile, avoid)} />}

      {group && routeTour && <GroupBlock savedId={plan.cloudId} />}

      {/* Aktionen am Ende: Losfahren als Hauptaktion, darunter die übrigen */}
      {(routeTour || pts.length > 0) && (
      <View style={styles.actions}>
        {routeTour ? (
          <ActionBar
            sheetTitle={plan.name.trim() || 'Neue Tour'}
            primary={{ label: 'Losfahren', onPress: () => void drive(false) }}
            choose={{
              title: 'Wie fährst du?',
              items: [
                { key: 'solo', icon: 'car.fill', label: 'Allein losfahren', hint: 'Die Navigation startet sofort', onPress: () => void drive(false) },
                { key: 'gruppe', icon: 'person.2.fill', label: 'Als Gruppe fahren', hint: 'Bis zu 6 Autos, du lädst sie im nächsten Schritt ein', onPress: () => void drive(true) },
              ],
            }}
            // Speichern als sekundärer Knopf, solange die Tour neu oder geändert ist (Konzept 7.11.)
            save={!plan.cloudId || plan.dirty ? { saved: false, busy: plan.saving, onPress: () => { if (plan.saving) return; if (!plan.cloudId) setNaming(true); else void plan.save(curves, firstProfile, avoid); } } : undefined}
            more={[
              {
                key: 'link',
                icon: 'square.and.arrow.up',
                label: 'Link teilen',
                hint: 'Andere öffnen die Route direkt in CUMO DRIVE',
                onPress: () => void shareTourLink({ ...routeTour, name: plan.name.trim() || routeTour.name }, firstProfile).catch(() => undefined),
              },
              {
                key: 'gpx',
                icon: 'doc.text',
                label: 'Als GPX teilen',
                onPress: () => void exportTour({ ...routeTour, name: plan.name.trim() || routeTour.name }, 'gpx').catch(() => undefined),
              },
              // Gespeicherte Tour schließen: leert den Planer, die Tour bleibt in Meine Touren (Koray 8.11.)
              ...(plan.cloudId ? [{ key: 'close', icon: 'xmark.circle' as const, label: 'Tour schließen', hint: 'Bleibt in Meine Touren', onPress: resetForm }] : []),
              plan.cloudId
                ? { key: 'delete', icon: 'trash', label: 'Route löschen', danger: true, onPress: () => setAskDelete(true) }
                : { key: 'reset', icon: 'arrow.counterclockwise', label: 'Planung verwerfen', danger: true, onPress: resetForm },
            ]}>
            {!session && <AppText variant="caption" muted>Wird auf dem Gerät gespeichert. Angemeldet landet die Tour auch im Web Planer.</AppText>}
          </ActionBar>
        ) : null}
        {routeTour && (
          <ConfirmSheet
            visible={askDelete}
            title="Möchtest du diese Tour wirklich löschen?"
            text="Sie verschwindet aus Meine Touren, auf dem Gerät und in deinem Konto."
            confirmLabel="Löschen"
            onConfirm={deleteSaved}
            onClose={() => setAskDelete(false)}
          />
        )}
        {!routeTour && pts.length > 0 && <SecondaryButton label="Neue Tour beginnen" onPress={plan.reset} />}
      </View>
      )}
    </>
  );
}

