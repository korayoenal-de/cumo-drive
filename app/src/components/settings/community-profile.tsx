/**
 * Bausteine für das eigene Profil (Koray 10.11.): Wohnort (steht auf der Drivers Karte, auf etwa 1 km
 * gerundet), Über mich und die Schalter, ob andere einen anschreiben dürfen und den Fuhrpark sehen.
 */
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ConfirmSheet } from '@/components/ui/action-sheet';
import { Chip } from '@/components/ui/chip';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import { ageOf, birthDigits, loadPrivacy, parseBirthday, savePrivacy, type BirthdayShow, type Privacy } from '@/lib/drivers';
import { haptic } from '@/lib/haptics';
import { searchTowns, type Place } from '@/lib/geocode';

/**
 * Eigene Privatsphäre, für alle Ansichten geteilt (Profilkarte, Schalter, Profil Seite): ein Wechsel
 * erscheint überall sofort (Koray 10.11.). Sofortige Anzeige, Rücknahme bei Fehler.
 */
const FALLBACK: Privacy = { homeName: null, home: null, allowMessages: true, showGarage: true, bio: null, visible: true, birthDate: null, birthdayShow: 'age', invitesContactsOnly: false };
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
            <AppText style={styles.secondaryText}>{p.homeName ? 'Ändern' : 'Anlegen'}</AppText>
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
/**
 * Gemeinsames Muster aller Profilfelder (Koray 11.11., E2): zugeklappt Label, Wert und rechts Ändern oder Anlegen;
 * offen am Ort mit X zum Verwerfen, Speichern als Hauptaktion und Papierkorb, wenn es schon etwas gibt.
 * Nach Speichern klappt das Feld wieder zu.
 */
function FieldRow(props: { label: string; value: string | null; sub?: string | null; lines?: number; onOpen: () => void }) {
  const { label, value, sub, lines = 1, onOpen } = props;
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <AppText variant="caption" muted>{label}</AppText>
        <AppText style={[styles.value, !value && styles.valueEmpty]} numberOfLines={lines}>{value ?? 'Nicht angegeben'}</AppText>
        {sub ? <AppText variant="caption" muted>{sub}</AppText> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${value ? 'ändern' : 'anlegen'}`} onPress={onOpen} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
        <AppText style={styles.secondaryText}>{value ? 'Ändern' : 'Anlegen'}</AppText>
      </Pressable>
    </View>
  );
}

function FieldHead({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <View style={styles.row}>
      <AppText variant="caption" muted style={styles.flex}>{label}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="Verwerfen" hitSlop={4} onPress={onClose} style={styles.round}>
        <SymbolView name="xmark" size={14} weight="bold" tintColor={Colors.text} />
      </Pressable>
    </View>
  );
}

function FieldFoot(props: { canSave: boolean; onSave: () => void; removeTitle?: string | null; onRemove: () => void }) {
  const { canSave, onSave, removeTitle, onRemove } = props;
  const [ask, setAsk] = useState(false);
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSave }}
        disabled={!canSave}
        onPress={onSave}
        style={({ pressed }) => [styles.primary, styles.flex, !canSave && styles.primaryOff, pressed && styles.pressed]}>
        <AppText style={styles.primaryText}>Speichern</AppText>
      </Pressable>
      {removeTitle ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Entfernen" onPress={() => setAsk(true)} style={({ pressed }) => [styles.trash, pressed && styles.pressed]}>
          <SymbolView name="trash" size={18} weight="semibold" tintColor={Colors.muted} />
        </Pressable>
      ) : null}
      <ConfirmSheet
        visible={ask}
        title={removeTitle ?? ''}
        confirmLabel="Entfernen"
        onConfirm={() => {
          setAsk(false);
          onRemove();
        }}
        onClose={() => setAsk(false)}
      />
    </View>
  );
}

export function BioField({ p, save }: { p: Privacy; save: (patch: Partial<Privacy>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(p.bio ?? '');
  const close = () => {
    setDraft(p.bio ?? '');
    setOpen(false);
  };
  if (!open) return <FieldRow label="Über mich" value={p.bio} lines={4} onOpen={() => setOpen(true)} />;
  return (
    <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.edit}>
      <FieldHead label="Über mich" onClose={close} />
      <TextInput
        maxFontSizeMultiplier={1.2}
        value={draft}
        onChangeText={(t) => setDraft(t.slice(0, 160))}
        placeholder="Kurz, zum Beispiel deine Lieblingsstrecke"
        placeholderTextColor={Colors.muted}
        autoFocus
        multiline
        style={[styles.input, styles.bio]}
        accessibilityLabel="Über mich"
      />
      <AppText variant="caption" muted style={styles.count}>{draft.length} von 160</AppText>
      <FieldFoot
        canSave={draft.trim() !== (p.bio ?? '')}
        onSave={() => {
          setOpen(false);
          void save({ bio: draft.trim() || null });
        }}
        removeTitle={p.bio ? 'Möchtest du deinen Text unter Über mich entfernen?' : null}
        onRemove={() => {
          setDraft('');
          setOpen(false);
          void save({ bio: null });
        }}
      />
    </Animated.View>
  );
}

/**
 * Geburtstag, optional (Koray 11.11., Konzept E): TT.MM.JJJJ über den Ziffernblock, das Feld springt selbst weiter.
 * Das Datum sieht niemand; Drivers zeigt je nach Wahl das Alter, nur am Tag selbst den Geburtstag oder nichts.
 */
const SEGS = [
  { from: 0, len: 2, ph: 'TT' },
  { from: 2, len: 2, ph: 'MM' },
  { from: 4, len: 4, ph: 'JJJJ' },
] as const;
const SHOW: { v: BirthdayShow; label: string }[] = [
  { v: 'age', label: 'Alter' },
  { v: 'birthday', label: 'Nur Geburtstag' },
  { v: 'none', label: 'Nichts' },
];

export function BirthdayField({ p, save }: { p: Privacy; save: (patch: Partial<Privacy>) => Promise<void> }) {
  const saved = birthDigits(p.birthDate);
  const [open, setOpen] = useState(false);
  const [digits, setDigits] = useState(saved);
  const [show, setShow] = useState<BirthdayShow>(p.birthdayShow);
  const [focus, setFocus] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const active = focus ? (digits.length < 2 ? 0 : digits.length < 4 ? 1 : 2) : -1;
  const parsed = digits.length === 8 ? parseBirthday(digits) : null;
  const iso = parsed && 'iso' in parsed ? parsed.iso : null;
  const changed = digits !== saved || show !== p.birthdayShow;

  const openUp = () => {
    setDigits(saved);
    setShow(p.birthdayShow);
    setHint(null);
    setOpen(true);
  };
  const change = (t: string) => {
    const d = t.replace(/[^0-9]/g, '').slice(0, 8);
    // jede fertige Gruppe rastet spürbar ein
    if (d.length > digits.length && (d.length === 2 || d.length === 4)) haptic('rastung');
    setDigits(d);
    setHint(null);
    if (d.length === 8) {
      const r = parseBirthday(d);
      if ('iso' in r) {
        haptic('ablegen');
        input.current?.blur();
      } else setHint(r.hint);
    }
  };

  if (!open) {
    const age = ageOf(p.birthDate);
    const sees = p.birthdayShow === 'age' ? (age != null ? `${age} Jahre` : null) : p.birthdayShow === 'birthday' ? 'nur am Geburtstag' : 'nichts';
    return (
      <FieldRow
        label="Geburtstag"
        value={p.birthDate ? `${saved.slice(0, 2)}.${saved.slice(2, 4)}.${saved.slice(4)}` : null}
        sub={p.birthDate && sees ? `Drivers sieht: ${sees}` : null}
        onOpen={openUp}
      />
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.edit}>
      <FieldHead label="Geburtstag" onClose={() => setOpen(false)} />
      <Pressable
        onPress={() => input.current?.focus()}
        accessibilityRole="button"
        accessibilityLabel="Geburtstag eingeben, Tag, Monat, Jahr"
        style={styles.dateRow}>
        {SEGS.map((sg, i) => {
          const part = digits.slice(sg.from, sg.from + sg.len);
          return (
            <View key={sg.ph} style={styles.dateRow}>
              {i > 0 && <AppText style={styles.dot}>.</AppText>}
              <View style={[styles.seg, i === active && styles.segOn]}>
                <AppText style={styles.segText}>
                  {part}
                  <AppText style={[styles.segText, styles.segPh]}>{sg.ph.slice(part.length)}</AppText>
                </AppText>
              </View>
            </View>
          );
        })}
        <TextInput
          ref={input}
          maxFontSizeMultiplier={1.2}
          value={digits}
          onChangeText={change}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          autoFocus
          keyboardType="number-pad"
          maxLength={8}
          caretHidden
          style={styles.hidden}
          accessibilityLabel="Geburtstag, acht Ziffern"
        />
      </Pressable>
      {hint ? (
        <AppText variant="caption" style={styles.hint}>{hint}</AppText>
      ) : (
        <AppText variant="caption" muted>Das Datum selbst sieht niemand.</AppText>
      )}
      <AppText variant="caption" muted>Sichtbar in Drivers</AppText>
      <View style={styles.chips}>
        {SHOW.map((o) => (
          <Chip key={o.v} label={o.label} active={show === o.v} onSurface onPress={() => setShow(o.v)} />
        ))}
      </View>
      <FieldFoot
        canSave={!!iso && changed}
        onSave={() => {
          if (!iso) return;
          setOpen(false);
          void save({ birthDate: iso, birthdayShow: show });
        }}
        removeTitle={p.birthDate ? 'Möchtest du deinen Geburtstag entfernen?' : null}
        onRemove={() => {
          setDigits('');
          setOpen(false);
          void save({ birthDate: null });
        }}
      />
    </Animated.View>
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
  hint: { color: Colors.stopText },
  valueEmpty: { color: Colors.faint },
  pressed: { transform: [{ scale: Motion.pressScale }], opacity: 0.85 },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryOff: { backgroundColor: Colors.signalDeep },
  primaryText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.onSignal },
  trash: { width: Size.button, height: Size.button, borderRadius: Size.button / 2, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  seg: { minHeight: 52, paddingHorizontal: Spacing.m, borderRadius: Radius.m, backgroundColor: Colors.surface2, justifyContent: 'center' },
  // Zustand als getönte Fläche statt Rahmen (Regel Ruhe)
  segOn: { backgroundColor: Colors.signalTint },
  segText: { fontFamily: Fonts.display, fontSize: 24, fontVariant: ['tabular-nums'], color: Colors.text },
  segPh: { color: Colors.faint },
  dot: { fontFamily: Fonts.display, fontSize: 24, color: Colors.muted },
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
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
