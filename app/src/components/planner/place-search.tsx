/**
 * Suche für einen Punkt der Route als eigene Ebene (nach dem Vorbild calimoto, reduziert):
 * großes Suchfeld oben, darunter Mein Standort und Zuletzt gewählt, beim Tippen Pässe und Orte.
 * Öffnet sich beim Antippen eines Punkts oder des Plus zwischen zwei Punkten.
 * Gewählt wird mit einem Tipp; Schließen lässt die Route unverändert, Punkt entfernen steht unten.
 */
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Spacing, Type } from '@/constants/theme';
import { type Place } from '@/lib/geocode';
import { passState, usePassLive } from '@/lib/pass-live';
import { PASSES, passPoint, passSummary, searchPasses } from '@/lib/passes';
import { rememberPlace, useRecentPlaces } from '@/lib/recent-places';
import { formatKm, haversine, type LatLon } from '@/lib/tour';

import { LocationIcon } from './planner-parts';
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
};

export function PlaceSearch(props: Props) {
  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      {/* Neuer Schlüssel je Punkt: das Feld startet mit dessen Namen (etwa Ziel nach dem Start) */}
      <SearchBody key={`${props.role}|${props.current}`} {...props} />
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
}: Props) {
  const [query, setQuery] = useState(current);
  const live = usePassLive();
  const recent = useRecentPlaces();
  // Solange der Name des Punkts unverändert im Feld steht, keine Suche
  const q = query === current ? '' : query.trim();
  const suggest = usePlaceSuggest(q, near);
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
    q.length < 2 ? null : [...passHits, ...(suggest.hits ?? []).filter((x) => !passHits.some((y) => y.name === x.name)).slice(0, 8)];

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
          <AppText style={styles.role}>{role}</AppText>
          <View style={styles.searchRow}>
            <View style={styles.field}>
              <SymbolView name="magnifyingglass" size={18} tintColor={Colors.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={placeholder}
                placeholderTextColor={Colors.muted}
                returnKeyType="search"
                autoFocus
                selectTextOnFocus
                autoCorrect={false}
                onSubmitEditing={() => (hits?.[0] ? pick(hits[0]) : query === current && onClose())}
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
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets>
          {hits ? (
            hits.length === 0 && !suggest.searching ? (
              <AppText style={styles.empty}>Nichts gefunden. Versuch es mit dem Ortsnamen.</AppText>
            ) : (
              <View style={styles.group}>{hits.map((h, i) => row(h, i, h.detail.startsWith('Pass,') ? 'pass' : 'place'))}</View>
            )
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
  remove: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.l },
  removeText: { fontFamily: Fonts.bold, fontSize: Type.input, color: Colors.signal },
  pressed: { opacity: 0.85, transform: [{ scale: Motion.pressScale }] },
});
