/**
 * Bausteine für das eigene Profil (Koray 10.11.): Wohnort (steht auf der Drivers Karte, auf etwa 1 km
 * gerundet), Über mich und die Schalter, ob andere einen anschreiben dürfen und den Fuhrpark sehen.
 */
import { SymbolView } from 'expo-symbols';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import { loadPrivacy, savePrivacy, type Privacy } from '@/lib/drivers';
import { searchTowns, type Place } from '@/lib/geocode';

/**
 * Eigene Privatsphäre, für alle Ansichten geteilt (Profilkarte, Schalter, Profil Seite): ein Wechsel
 * erscheint überall sofort (Koray 10.11.). Sofortige Anzeige, Rücknahme bei Fehler.
 */
const FALLBACK: Privacy = { homeName: null, home: null, allowMessages: true, showGarage: true, bio: null, visible: true };
let shared: Privacy | null = null;
let loading = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const setShared = (v: Privacy | null) => {
  shared = v;
  emit();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => shared;

export function usePrivacy() {
  const p = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (shared || loading) return;
    // null heißt ohne Konto; dann beim nächsten Öffnen erneut laden
    loading = true;
    loadPrivacy()
      .then(setShared)
      .catch(() => setShared(FALLBACK))
      .finally(() => {
        loading = false;
      });
  }, []);

  const save = async (patch: Partial<Privacy>) => {
    const prev = shared;
    if (!prev) return;
    setShared({ ...prev, ...patch });
    setErr(null);
    setBusy(true);
    try {
      await savePrivacy(patch);
    } catch (e) {
      setShared(prev);
      setErr(e instanceof Error ? e.message : 'Speichern hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };
  return { p, save, busy, err };
}

/** Beim Abmelden vergessen, damit ein anderes Konto frisch lädt */
export function resetPrivacy() {
  shared = null;
  emit();
}

/** Wohnort mit Ortssuche; steht unter Drivers nur als Ortsmitte. */
export function HomeField({ p, save }: { p: Privacy; save: (patch: Partial<Privacy>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Place[]>([]);

  useEffect(() => {
    if (!editing || q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchTowns(q.trim(), undefined, ctrl.signal)
        .then(setFound)
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, editing]);

  return (
    <View style={styles.wrap}>
      {!editing ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <AppText variant="caption" muted>Wohnort</AppText>
            <AppText style={styles.value} numberOfLines={1}>{p.homeName ?? 'Noch nicht angegeben'}</AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Wohnort ändern" onPress={() => { setQ(''); setFound([]); setEditing(true); }} style={styles.secondary}>
            <AppText style={styles.secondaryText}>{p.homeName ? 'Ändern' : 'Angeben'}</AppText>
          </Pressable>
        </View>
      ) : (
        <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.edit}>
          <View style={styles.row}>
            <TextInput maxFontSizeMultiplier={1.2}
              value={q}
              onChangeText={setQ}
              placeholder="Ort, zum Beispiel Bad Dürkheim"
              placeholderTextColor={Colors.muted}
              autoFocus
              autoCorrect={false}
              style={[styles.input, styles.flex]}
              accessibilityLabel="Wohnort suchen"
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Abbrechen" hitSlop={4} onPress={() => setEditing(false)} style={styles.round}>
              <SymbolView name="xmark" size={14} weight="bold" tintColor={Colors.text} />
            </Pressable>
          </View>
          {q.trim().length >= 2 &&
            found.map((f) => (
              <Pressable
                key={`${f.name}-${f.p[0]}-${f.p[1]}`}
                accessibilityRole="button"
                onPress={() => {
                  setEditing(false);
                  void save({ homeName: f.name, home: f.p });
                }}
                style={styles.hit}>
                <AppText style={styles.hitName}>{f.name}</AppText>
                {f.detail ? <AppText variant="caption" muted numberOfLines={1}>{f.detail}</AppText> : null}
              </Pressable>
            ))}
          {p.homeName && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setEditing(false);
                void save({ homeName: null, home: null });
              }}
              style={styles.textBtn}>
              <AppText style={styles.textBtnText}>Wohnort entfernen</AppText>
            </Pressable>
          )}
        </Animated.View>
      )}
      <AppText variant="caption" muted>Andere Mitglieder sehen dich unter Drivers an diesem Ort, nur als Ortsmitte, nie mit Adresse oder Live Standort.</AppText>
    </View>
  );
}

/** Kurzer Text über dich, bis 160 Zeichen; gespeichert beim Verlassen des Felds. */
export function BioField({ p, save }: { p: Privacy; save: (patch: Partial<Privacy>) => Promise<void> }) {
  const [draft, setDraft] = useState(p.bio ?? '');
  return (
    <View style={styles.edit}>
      <AppText variant="caption" muted>Über mich</AppText>
      <TextInput maxFontSizeMultiplier={1.2}
        value={draft}
        onChangeText={(t) => setDraft(t.slice(0, 160))}
        onEndEditing={() => {
          if (draft.trim() !== (p.bio ?? '')) void save({ bio: draft.trim() || null });
        }}
        placeholder="Kurz, zum Beispiel deine Lieblingsstrecke"
        placeholderTextColor={Colors.muted}
        multiline
        style={[styles.input, styles.bio]}
        accessibilityLabel="Über mich"
      />
      <AppText variant="caption" muted style={styles.count}>{draft.length} von 160</AppText>
    </View>
  );
}

export function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <AppText style={[styles.flex, styles.toggleText]}>{label}</AppText>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: Colors.signal, false: Colors.surface2 }} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.m },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  value: { fontFamily: Fonts.semibold, fontSize: Type.title },
  edit: { gap: Spacing.s },
  input: { height: Size.input, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface2, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  round: { width: Size.icon, height: Size.icon, borderRadius: Size.icon / 2, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  hit: { minHeight: 52, justifyContent: 'center', paddingHorizontal: Spacing.l, borderRadius: Radius.m, backgroundColor: Colors.surface2, gap: 2 },
  hitName: { fontFamily: Fonts.bold, fontSize: Type.body },
  secondary: { height: Size.button, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  textBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  textBtnText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 44 },
  bio: { height: undefined, minHeight: 88, paddingTop: Spacing.m, paddingBottom: Spacing.m, textAlignVertical: 'top' },
  count: { alignSelf: 'flex-end', fontVariant: ['tabular-nums'] },
  toggleText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  error: { color: Colors.stopText, fontFamily: Fonts.semibold },
});
