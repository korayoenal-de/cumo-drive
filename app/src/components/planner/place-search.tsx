/**
 * Suche für einen Punkt der Route als eigene Ebene (nach dem Vorbild calimoto, reduziert):
 * großes Suchfeld oben, darunter Mein Standort und Zuletzt gewählt, beim Tippen Pässe und Orte.
 * Öffnet sich beim Antippen eines Punkts oder des Plus zwischen zwei Punkten.
 * Gewählt wird mit einem Tipp; Schließen lässt die Route unverändert, Punkt entfernen steht unten.
 *
 * Steht schon eine Route, gibt es unter dem Feld Kategorien (Tanken, Café, Essen, Aussicht, Pässe).
 * Eine Kategorie zeigt sofort Treffer im Korridor um die Route, nach Umweg sortiert, mit dem km der
 * Route; ein Suchbegriff filtert innerhalb. Gewählt landet der Stopp an seiner Stelle als Zwischenziel.
 *
 * Routenkopf (Variante B, entschieden am 6.11.2026, Muster aus Apple und Google Karten): Start, das
 * bearbeitete Zwischenziel und Ziel stehen oben untereinander, verbunden wie im Planer. Das aktive Feld
 * ist orange umrandet und ist das Suchfeld; nach dem Start springt der Fokus sichtbar zum Ziel. Ein Tipp
 * auf eine andere Zeile wechselt dorthin. Ohne slots (Start der Runde) bleibt das einzelne Feld.
 */
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Spacing, Type } from '@/constants/theme';
import { type Place } from '@/lib/geocode';
import { passState, usePassLive } from '@/lib/pass-live';
import { PASSES, passPoint, passSummary, searchPasses } from '@/lib/passes';
import { rememberPlace, useRecentPlaces } from '@/lib/recent-places';
import { stopsAlong, type StopKind } from '@/lib/stops-along';
import { formatKm, haversine, type LatLon } from '@/lib/tour';

import { LocationIcon, PointSymbol } from './planner-parts';
import type { PointKind } from './planner-shared';
import { usePlaceSuggest } from './planner-shared';

type Props = {
  visible: boolean;
  /** Start, Ziel, Zwischenziel 2 */
  role: string;
  placeholder: string;
  /** Name des Punkts, der bearbeitet wird (leer bei neuem Punkt) */
  current: string;
  /** Vorschläge in der Nähe dieser Stelle zuerst */
  near?: LatLon;
  /** eigener Standort, für Entfernungen */
  here?: LatLon;
  locating: boolean;
  message: string | null;
  onPick: (p: LatLon, name: string) => void;
  onHere: () => void;
  /** nur bei einem gesetzten Punkt */
  onRemove?: () => void;
  onClose: () => void;
  /** geplante Route: dann gibt es Kategorien mit Treffern im Korridor */
  route?: LatLon[];
  /** Stopp aus einer Kategorie gewählt (km entlang der Route), wird an seiner Stelle eingefügt */
  onPickStop?: (p: LatLon, name: string, km: number) => void;
  /** Routenkopf: Zeilen von oben nach unten, genau eine aktiv */
  slots?: Slot[];
  /** Tipp auf eine andere Zeile im Routenkopf */
  onSwitch?: (slot: Slot) => void;
  /** Nur Stopps einplanen (aus dem Ergebnis, Abschnitt Unterwegs einplanen): Titel, Kategorien ohne Alle */
  stopsOnly?: { title: string; subtitle: string; cat: Exclude<Cat, 'alle'> };
};

export type Slot = { key: string; kind: PointKind; index?: number; insert?: boolean; label: string; value: string | null; active: boolean };

export type Cat = 'alle' | StopKind | 'pass';
const CATS: { id: Cat; label: string; placeholder: string }[] = [
  { id: 'alle', label: 'Alle', placeholder: '' },
  { id: 'tank', label: 'Tanken', placeholder: 'Marke, etwa Shell' },
  { id: 'kaffee', label: 'Café', placeholder: 'Café suchen' },
  { id: 'mittag', label: 'Essen', placeholder: 'Restaurant suchen' },
  { id: 'aussicht', label: 'Aussicht', placeholder: 'Aussichtspunkt suchen' },
  { id: 'pass', label: 'Pässe', placeholder: 'Pass suchen, etwa Stilfser Joch' },
];
export const CAT_ICON: Record<Exclude<Cat, 'alle'>, 'fuelpump.fill' | 'cup.and.saucer.fill' | 'fork.knife' | 'binoculars.fill' | 'mountain.2.fill'> = {
  tank: 'fuelpump.fill',
  kaffee: 'cup.and.saucer.fill',
  mittag: 'fork.knife',
  aussicht: 'binoculars.fill',
  pass: 'mountain.2.fill',
};
type StopRow = { key: string; name: string; detail: string; p: LatLon; km: number; offM: number };

/** Umweg hin und zurück zur Route, grob mit 35 km/h auf kleinen Straßen */
const detourMin = (offM: number) => Math.max(1, Math.round(((2 * offM) / 1000 / 35) * 60));

/** Pässe im Korridor um die Route: Abstand zur Linie und km der nächsten Stelle */
function passesNear(line: LatLon[], cum: number[], maxM: number): StopRow[] {
  let s = 90, w = 180, n = -90, e = -180;
  for (const [la, lo] of line) {
    s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo);
  }
  const pad = maxM / 111000 + 0.01;
  const step = Math.max(1, Math.floor(line.length / 800));
  const out: StopRow[] = [];
  for (const ps of PASSES) {
    if (ps.lat < s - pad || ps.lat > n + pad || ps.lon < w - pad * 1.5 || ps.lon > e + pad * 1.5) continue;
    const pp = passPoint(ps);
    let best = Infinity;
    let km = 0;
    for (let i = 0; i < line.length; i += step) {
      const d = haversine(line[i], pp);
      if (d < best) {
        best = d;
        km = cum[i];
      }
    }
    if (best <= maxM) out.push({ key: ps.id, name: ps.name, detail: `${ps.ele.toLocaleString('de-DE')} m, ${ps.region}`, p: pp, km, offM: best });
  }
  return out;
}

export function PlaceSearch(props: Props) {
  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      {/* Neuer Schlüssel je Punkt: das Feld startet mit dessen Namen (etwa Ziel nach dem Start) */}
      <SearchBody key={`${props.role}|${props.current}|${props.stopsOnly?.cat ?? ''}`} {...props} />
    </Modal>
  );
}

function SearchBody({
  role,
  placeholder,
  current,
  near,
  here,
  locating,
  message,
  onPick,
  onHere,
  onRemove,
  onClose,
  route,
  onPickStop,
  slots,
  onSwitch,
  stopsOnly,
}: Props) {
  const [query, setQuery] = useState(current);
  const live = usePassLive();
  const recent = useRecentPlaces();
  const hasRoute = !!route && route.length > 1;
  const [cat, setCat] = useState<Cat>(stopsOnly?.cat ?? 'alle');
  const [scale, setScale] = useState(1);
  // Solange der Name des Punkts unverändert im Feld steht, keine Suche
  const q = query === current ? '' : query.trim();
  // In einer Kategorie filtert der Begriff nur, Orte werden nicht gesucht
  const suggest = usePlaceSuggest(cat === 'alle' ? q : '', near);

  // Treffer je Kategorie und Korridorbreite, einmal geladen
  const cum = useMemo(() => {
    const c = [0];
    if (route) for (let i = 1; i < route.length; i++) c.push(c[i - 1] + haversine(route[i - 1], route[i]) / 1000);
    return c;
  }, [route]);
  const [found, setFound] = useState<Record<string, StopRow[] | 'fehler'>>({});
  const catKey = `${cat}|${scale}`;
  useEffect(() => {
    if (!hasRoute || cat === 'alle' || cat === 'pass' || found[catKey]) return;
    const ctrl = new AbortController();
    stopsAlong(cat, route!, ctrl.signal, 40, scale)
      .then((list) => setFound((f) => ({ ...f, [catKey]: list.map((h) => ({ key: h.id, name: h.name, detail: h.detail, p: h.p, km: h.km, offM: h.offM })) })))
      .catch(() => !ctrl.signal.aborted && setFound((f) => ({ ...f, [catKey]: 'fehler' })));
    return () => ctrl.abort();
  }, [hasRoute, cat, scale, catKey, found, route]);
  const catRows: StopRow[] | 'fehler' | null = useMemo(() => {
    if (cat === 'alle' || !hasRoute) return null;
    const raw = cat === 'pass' ? passesNear(route!, cum, 8000 * scale) : found[catKey];
    if (!raw || raw === 'fehler') return raw ?? null;
    const f = q.toLowerCase();
    return raw.filter((r) => !f || `${r.name} ${r.detail}`.toLowerCase().includes(f)).sort((a, b) => a.offM - b.offM);
  }, [cat, hasRoute, route, cum, scale, found, catKey, q]);
  const catLoading = cat !== 'alle' && catRows === null && hasRoute;
  const passHits = useMemo<Place[]>(
    () =>
      q.length >= 2
        ? searchPasses(PASSES, q, 3).map((x) => ({
            name: x.name,
            detail: `Pass, ${passSummary(x, undefined, passState(x, live).note)}, ${x.region}`,
            p: passPoint(x),
          }))
        : [],
    [q, live],
  );
  const hits: Place[] | null =
    cat !== 'alle' || q.length < 2 ? null : [...passHits, ...(suggest.hits ?? []).filter((x) => !passHits.some((y) => y.name === x.name)).slice(0, 8)];

  function pick(place: Place) {
    rememberPlace(place);
    onPick(place.p, place.name);
  }

  const dist = (p: LatLon) => {
    if (!here) return null;
    const km = haversine(here, p) / 1000;
    return `${km < 10 ? formatKm(km) : Math.round(km).toLocaleString('de-DE')} km`;
  };

  function row(place: Place, i: number, icon: 'pass' | 'place' | 'recent') {
    const d = dist(place.p);
    const sub = [d, place.detail].filter(Boolean).join(' · ');
    return (
      <Pressable
        key={`${icon}${place.p[0]},${place.p[1]},${i}`}
        accessibilityRole="button"
        accessibilityLabel={`${place.name}${sub ? `, ${sub}` : ''}`}
        onPress={() => pick(place)}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        <View style={styles.icon}>
          <SymbolView
            name={icon === 'pass' ? 'mountain.2.fill' : icon === 'recent' ? 'clock' : 'mappin'}
            size={16}
            tintColor={icon === 'pass' ? Colors.signal : Colors.text}
          />
        </View>
        <View style={styles.rowMain}>
          <AppText style={styles.name} numberOfLines={1}>
            {place.name}
          </AppText>
          {!!sub && (
            <AppText style={styles.sub} numberOfLines={1}>
              {sub}
            </AppText>
          )}
        </View>
      </Pressable>
    );
  }

  return (
      <View style={styles.screen}>
        <View style={styles.head}>
          {stopsOnly ? (
            <>
              <View style={styles.titleRow}>
                <View style={styles.rowMain}>
                  <AppText style={styles.title}>{stopsOnly.title}</AppText>
                  <AppText style={styles.role} numberOfLines={1}>{stopsOnly.subtitle}</AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Schließen"
                  onPress={onClose}
                  style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
                  <SymbolView name="xmark" size={18} weight="semibold" tintColor={Colors.text} />
                </Pressable>
              </View>
              <View style={styles.field}>
                <SymbolView name="magnifyingglass" size={18} tintColor={Colors.muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={CATS.find((c) => c.id === cat)?.placeholder}
                  placeholderTextColor={Colors.muted}
                  returnKeyType="search"
                  autoCorrect={false}
                  style={styles.input}
                  accessibilityLabel="In dieser Kategorie suchen"
                />
                {query.length > 0 && (
                  <Pressable accessibilityRole="button" accessibilityLabel="Eingabe löschen" onPress={() => setQuery('')} hitSlop={8}>
                    <SymbolView name="xmark.circle.fill" size={20} tintColor={Colors.muted} />
                  </Pressable>
                )}
              </View>
            </>
          ) : slots && slots.length > 1 ? (
            <View style={styles.routeHead}>
              <View style={styles.slots}>
                {slots.map((sl, i) => (
                  <View key={sl.key}>
                    {i > 0 && <View style={styles.slotLine} />}
                    <View style={styles.slotRow}>
                      <PointSymbol kind={sl.kind} label={String((sl.index ?? 0) + 1)} />
                      {sl.active ? (
                        <Animated.View entering={FadeIn.duration(180)} style={[styles.field, styles.fieldOn]}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={CATS.find((c) => c.id === cat)?.placeholder || placeholder}
                placeholderTextColor={Colors.muted}
                returnKeyType="search"
                autoFocus
                selectTextOnFocus
                autoCorrect={false}
                onSubmitEditing={() => (hits?.[0] ? pick(hits[0]) : cat === 'alle' && query === current && onClose())}
                style={styles.input}
                accessibilityLabel={`${role}: Ort oder Pass suchen`}
              />
              {suggest.searching && <ActivityIndicator color={Colors.muted} />}
              {query.length > 0 && (
                <Pressable accessibilityRole="button" accessibilityLabel="Eingabe löschen" onPress={() => setQuery('')} hitSlop={8}>
                  <SymbolView name="xmark.circle.fill" size={20} tintColor={Colors.muted} />
                </Pressable>
              )}
                        </Animated.View>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${sl.label} ${sl.value ? `ändern, jetzt ${sl.value}` : 'wählen'}`}
                          onPress={() => onSwitch?.(sl)}
                          style={({ pressed }) => [styles.field, pressed && styles.pressed]}>
                          <AppText style={[styles.slotText, !sl.value && styles.slotEmpty]} numberOfLines={1}>
                            {sl.value ?? (sl.kind === 'ziel' ? 'Ziel wählen' : sl.kind === 'start' ? 'Start wählen' : sl.label)}
                          </AppText>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Suche schließen"
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
              <SymbolView name="xmark" size={18} weight="semibold" tintColor={Colors.text} />
            </Pressable>
            </View>
          ) : (
            <>
              <AppText style={styles.role}>{role}</AppText>
              <View style={styles.searchRow}>
                <View style={styles.field}>
                  <SymbolView name="magnifyingglass" size={18} tintColor={Colors.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={CATS.find((c) => c.id === cat)?.placeholder || placeholder}
                placeholderTextColor={Colors.muted}
                returnKeyType="search"
                autoFocus
                selectTextOnFocus
                autoCorrect={false}
                onSubmitEditing={() => (hits?.[0] ? pick(hits[0]) : cat === 'alle' && query === current && onClose())}
                style={styles.input}
                accessibilityLabel={`${role}: Ort oder Pass suchen`}
              />
              {suggest.searching && <ActivityIndicator color={Colors.muted} />}
              {query.length > 0 && (
                <Pressable accessibilityRole="button" accessibilityLabel="Eingabe löschen" onPress={() => setQuery('')} hitSlop={8}>
                  <SymbolView name="xmark.circle.fill" size={20} tintColor={Colors.muted} />
                </Pressable>
              )}
                </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Suche schließen"
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
              <SymbolView name="xmark" size={18} weight="semibold" tintColor={Colors.text} />
            </Pressable>
              </View>
            </>
          )}
          {hasRoute && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.tabs} style={styles.tabsBox}>
              {CATS.filter((c) => !stopsOnly || c.id !== 'alle').map((c) => {
                const on = c.id === cat;
                return (
                  <Pressable
                    key={c.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      setCat(c.id);
                      setScale(1);
                      if (query === current) setQuery('');
                      // Liste braucht Platz: Tastatur einklappen
                      if (c.id !== 'alle') Keyboard.dismiss();
                    }}
                    style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && styles.pressed]}>
                    <AppText style={[styles.tabText, on && styles.tabTextOn]}>{c.label}</AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets>
          {cat !== 'alle' ? (
            catLoading ? (
              <ActivityIndicator color={Colors.muted} style={styles.loading} />
            ) : catRows === 'fehler' ? (
              <AppText style={styles.empty}>Die Stopps lassen sich gerade nicht laden. Versuch es gleich noch einmal.</AppText>
            ) : catRows && catRows.length === 0 ? (
              <View style={styles.section}>
                <AppText style={styles.empty}>{q ? `Nichts zu „${q}“ nah an der Route.` : 'Nah an der Route gibt es hier nichts.'}</AppText>
                {scale < 3 && (
                  <Pressable accessibilityRole="button" onPress={() => setScale(3)} style={({ pressed }) => [styles.widen, pressed && styles.pressed]}>
                    <AppText style={styles.widenText}>Korridor erweitern</AppText>
                  </Pressable>
                )}
              </View>
            ) : (
              <>
                {[
                  { label: 'Direkt an der Strecke', rows: (catRows ?? []).filter((r) => r.offM < 150) },
                  { label: 'Mit kleinem Umweg', rows: (catRows ?? []).filter((r) => r.offM >= 150) },
                ]
                  .filter((g) => g.rows.length)
                  .map((g) => (
                    <View key={g.label} style={styles.section}>
                      <AppText style={styles.groupLabel}>{g.label}</AppText>
                      <View style={styles.group}>
                        {g.rows.slice(0, 20).map((r) => {
                          const near0 = r.offM < 150;
                          const min = near0 ? 0 : detourMin(r.offM);
                          return (
                            <Pressable
                              key={r.key}
                              accessibilityRole="button"
                              accessibilityLabel={`${r.name}, ${near0 ? 'kein Umweg' : `${min} Minuten Umweg`}, bei km ${Math.round(r.km)}`}
                              onPress={() => {
                                rememberPlace({ name: r.name, detail: r.detail, p: r.p });
                                if (onPickStop) onPickStop(r.p, r.name, r.km);
                                else onPick(r.p, r.name);
                              }}
                              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                              <View style={[styles.icon, styles.iconTint]}>
                                <SymbolView name={CAT_ICON[cat as Exclude<Cat, 'alle'>]} size={16} tintColor={Colors.signal} />
                              </View>
                              <View style={styles.rowMain}>
                                <AppText style={styles.name} numberOfLines={1}>
                                  {r.name}
                                </AppText>
                                <AppText style={styles.sub} numberOfLines={1}>
                                  {`bei km ${Math.round(r.km)}${r.detail ? ` · ${r.detail}` : ''}`}
                                </AppText>
                              </View>
                              <AppText style={[styles.detour, near0 && styles.detourZero]}>{near0 ? '0 min' : `+${min} min`}</AppText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                {scale < 3 && (
                  <Pressable accessibilityRole="button" onPress={() => setScale(3)} style={({ pressed }) => [styles.widenLink, pressed && styles.pressed]}>
                    <AppText style={styles.widenLinkText}>Korridor erweitern</AppText>
                  </Pressable>
                )}
              </>
            )
          ) : hits ? (
            hits.length === 0 && !suggest.searching ? (
              <AppText style={styles.empty}>Nichts gefunden. Versuch es mit dem Ortsnamen.</AppText>
            ) : (
              <View style={styles.group}>{hits.map((h, i) => row(h, i, h.detail.startsWith('Pass,') ? 'pass' : 'place'))}</View>
            )
          ) : (
            <>
              {/* Beim Ziel will man selten zum eigenen Standort: dort stehen die zuletzt gewählten Orte oben */}
              {role === 'Ziel' ? (
                <>
              {recent.length > 0 && (
                <View style={styles.section}>
                  <AppText style={styles.label}>Zuletzt gewählt</AppText>
                  <View style={styles.group}>{recent.map((r, i) => row(r, i, 'recent'))}</View>
                </View>
              )}
              <View style={styles.group}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={locating ? 'Standort wird bestimmt' : 'Mein Standort'}
                  onPress={() => !locating && onHere()}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                  <View style={styles.icon}>{locating ? <ActivityIndicator color={Colors.signal} /> : <LocationIcon />}</View>
                  <AppText style={[styles.name, styles.rowMain]}>Mein Standort</AppText>
                </Pressable>
              </View>
              {!!message && <AppText style={styles.message}>{message}</AppText>}
                </>
              ) : (
                <>
              <View style={styles.group}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={locating ? 'Standort wird bestimmt' : 'Mein Standort'}
                  onPress={() => !locating && onHere()}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                  <View style={styles.icon}>{locating ? <ActivityIndicator color={Colors.signal} /> : <LocationIcon />}</View>
                  <AppText style={[styles.name, styles.rowMain]}>Mein Standort</AppText>
                </Pressable>
              </View>
              {!!message && <AppText style={styles.message}>{message}</AppText>}
              {recent.length > 0 && (
                <View style={styles.section}>
                  <AppText style={styles.label}>Zuletzt gewählt</AppText>
                  <View style={styles.group}>{recent.map((r, i) => row(r, i, 'recent'))}</View>
                </View>
              )}
                </>
              )}
              {onRemove && (
                <Pressable
                  accessibilityRole="button"
                  onPress={onRemove}
                  style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
                  <AppText style={styles.removeText}>{`${role} entfernen`}</AppText>
                </Pressable>
              )}
            </>
          )}
        </ScrollView>
      </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: Colors.ground },
  head: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.l, gap: Spacing.m },
  role: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s,
    height: 52,
    paddingHorizontal: Spacing.l,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface2,
  },
  input: { flex: 1, height: '100%', fontFamily: Fonts.semibold, fontSize: Type.title, color: Colors.text },
  close: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface2 },
  content: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xxxl, gap: Spacing.xxl },
  section: { gap: Spacing.m },
  label: { fontFamily: Fonts.bold, fontSize: Type.h3, color: Colors.text },
  group: { borderRadius: Radius.l, backgroundColor: Colors.surface, paddingVertical: Spacing.xs, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 64, paddingHorizontal: Spacing.l, paddingVertical: Spacing.s },
  rowPressed: { backgroundColor: Colors.pressTint },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface2 },
  rowMain: { flex: 1, minWidth: 0 },
  name: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  sub: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted, fontVariant: ['tabular-nums'] },
  empty: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted, paddingHorizontal: Spacing.xs },
  message: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.signal, paddingHorizontal: Spacing.xs },
  tabsBox: { marginHorizontal: -Spacing.xl },
  tabs: { gap: Spacing.s, paddingHorizontal: Spacing.xl },
  tab: { height: 40, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface2 },
  tabOn: { backgroundColor: Colors.text },
  tabText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  tabTextOn: { color: Colors.ground },
  detour: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text, fontVariant: ['tabular-nums'] },
  detourZero: { color: Colors.good },
  groupLabel: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted, paddingHorizontal: Spacing.xs },
  iconTint: { backgroundColor: Colors.signalTint },
  widenLink: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.l },
  widenLinkText: { fontFamily: Fonts.bold, fontSize: Type.input, color: Colors.signal },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.m },
  title: { fontFamily: Fonts.display, fontSize: Type.h2, lineHeight: 28, color: Colors.text, textTransform: 'uppercase' },
  loading: { marginTop: Spacing.xl },
  widen: { alignSelf: 'flex-start', height: 48, paddingHorizontal: Spacing.xl, borderRadius: Radius.pill, justifyContent: 'center', backgroundColor: Colors.surface2 },
  widenText: { fontFamily: Fonts.bold, fontSize: Type.input, color: Colors.text },
  routeHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.s },
  slots: { flex: 1, minWidth: 0 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  slotLine: { marginLeft: 13, width: 2, height: 10, borderLeftWidth: 2, borderColor: Colors.empty, borderStyle: 'dotted' },
  fieldOn: { borderWidth: 2, borderColor: Colors.signal },
  slotText: { fontFamily: Fonts.semibold, fontSize: Type.title, color: Colors.text },
  slotEmpty: { color: Colors.muted },
  remove: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.l },
  removeText: { fontFamily: Fonts.bold, fontSize: Type.input, color: Colors.signal },
  pressed: { opacity: 0.85, transform: [{ scale: Motion.pressScale }] },
});
