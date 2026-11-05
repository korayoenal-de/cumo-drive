/**
 * "Wie fandest du die Tour?" nach der Fahrt: Schieberegler mit drei Stufen (nicht gut, gut, sensationell).
 * Tippen auf eine Stufe oder Ziehen am Regler, beim Loslassen rastet er auf der nächsten Stufe ein.
 * Zusammen mit der gefahrenen Spur zeigt die Bewertung später, welche Straßen wirklich begeistern.
 */
import { useEffect, useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, TextInput, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { BAD_REASONS, rateDrive, type DriveRating } from '@/lib/drives';

/**
 * Bewertung samt Nachfrage bei "nicht gut". Speichert, sobald die Fahrt im Konto liegt (driveId),
 * vorher gewählte Werte werden nachgereicht.
 */
export function DriveRatingCard({ driveId }: { driveId: string | null }) {
  const [value, setValue] = useState<DriveRating | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState('');
  const key = value ? JSON.stringify([value, reasons, value === 1 ? note.trim() : '']) : '';

  // Kurz warten, damit Tippen im Textfeld und schnelles Antippen nicht jedes Mal sendet
  useEffect(() => {
    if (!driveId || !value || key === sent) return;
    const t = setTimeout(() => {
      rateDrive(driveId, value, reasons, note.trim())
        .then(() => setSent(key))
        .catch(() => undefined);
    }, 700);
    return () => clearTimeout(t);
  }, [driveId, value, reasons, note, key, sent]);

  const toggle = (id: string) => setReasons((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));

  return (
    <View style={styles.box}>
      <DriveRatingSlider value={value} onChange={setValue} />
      {value === 1 && (
        <View style={styles.box}>
          <AppText style={styles.title}>Was hat dir nicht gefallen?</AppText>
          <View style={styles.chips}>
            {BAD_REASONS.map((r) => (
              <Chip key={r.id} label={r.label} active={reasons.includes(r.id)} onPress={() => toggle(r.id)} />
            ))}
          </View>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Wo genau? Zum Beispiel: Ortsdurchfahrt nach Mörlenbach"
            placeholderTextColor={Colors.muted}
            maxLength={500}
            multiline
            style={styles.input}
            accessibilityLabel="Was hat dir nicht gefallen, freier Text"
          />
        </View>
      )}
      <AppText variant="caption" muted>
        {value ? 'Danke! Das hilft uns, die besten Strecken für alle zu finden.' : 'Deine Bewertung hilft uns, die besten Strecken für alle zu finden.'}
      </AppText>
    </View>
  );
}

const STOPS: { v: DriveRating; label: string }[] = [
  { v: 1, label: 'Nicht gut' },
  { v: 2, label: 'Gut' },
  { v: 3, label: 'Sensationell' },
];
const THUMB = 28;

export function DriveRatingSlider({ value, onChange }: { value: DriveRating | null; onChange: (v: DriveRating) => void }) {
  const [w, setW] = useState(0);
  /** Position beim Ziehen in px, sonst null */
  const [drag, setDrag] = useState<number | null>(null);

  const pan = useMemo(() => {
    const span = Math.max(0, w - THUMB);
    const xOf = (x: number) => Math.max(0, Math.min(span, x));
    const snap = (x: number) => (Math.round((xOf(x) / Math.max(1, span)) * 2) + 1) as DriveRating;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => setDrag(xOf(e.nativeEvent.locationX - THUMB / 2)),
      onPanResponderMove: (e) => setDrag(xOf(e.nativeEvent.locationX - THUMB / 2)),
      onPanResponderRelease: (e) => {
        setDrag(null);
        onChange(snap(e.nativeEvent.locationX - THUMB / 2));
      },
      onPanResponderTerminate: () => setDrag(null),
    });
  }, [w, onChange]);

  const track = Math.max(0, w - THUMB);
  const x = drag ?? (value ? ((value - 1) / 2) * track : null);

  function onAction(e: AccessibilityActionEvent) {
    const cur = value ?? 2;
    if (e.nativeEvent.actionName === 'increment') onChange(Math.min(3, cur + 1) as DriveRating);
    if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(1, cur - 1) as DriveRating);
  }

  return (
    <View style={styles.box}>
      <AppText style={styles.title}>Wie fandest du die Tour?</AppText>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Wie fandest du die Tour?"
        accessibilityValue={{ text: value ? STOPS[value - 1].label : 'Noch nicht bewertet' }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAction}
        onLayout={(e: LayoutChangeEvent) => {
          setW(e.nativeEvent.layout.width);
        }}
        style={styles.slider}
        {...pan.panHandlers}>
        <View style={styles.rail} />
        {x != null && <View style={[styles.fill, { width: x + THUMB / 2 }]} />}
        {STOPS.map((s, i) => (
          <View key={s.v} pointerEvents="none" style={[styles.tick, { left: THUMB / 2 + (i / 2) * track - 4 }, value != null && s.v <= value && drag == null && styles.tickOn]} />
        ))}
        {x != null && <View pointerEvents="none" style={[styles.thumb, { left: x }]} />}
      </View>
      <View style={styles.labels}>
        {STOPS.map((s) => (
          <Pressable key={s.v} accessibilityElementsHidden importantForAccessibility="no" onPress={() => onChange(s.v)} style={[styles.labelHit, s.v === 2 && styles.center, s.v === 3 && styles.end]}>
            <AppText variant="caption" style={[styles.label, value === s.v && styles.labelOn]}>
              {s.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.s },
  title: { fontFamily: Fonts.semibold, fontSize: Type.title },
  slider: { height: 44, justifyContent: 'center' },
  rail: { position: 'absolute', left: THUMB / 2, right: THUMB / 2, height: 6, borderRadius: 3, backgroundColor: Colors.surface2 },
  fill: { position: 'absolute', left: 0, height: 6, borderRadius: 3, backgroundColor: Colors.signal },
  tick: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.muted },
  tickOn: { backgroundColor: Colors.signal },
  thumb: { position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: Colors.text, boxShadow: '0 2px 6px rgba(0,0,0,0.4)' },
  labels: { flexDirection: 'row' },
  labelHit: { flex: 1, minHeight: 32, justifyContent: 'center' },
  center: { alignItems: 'center' },
  end: { alignItems: 'flex-end' },
  label: { fontFamily: Fonts.medium, color: Colors.muted },
  labelOn: { color: Colors.text, fontFamily: Fonts.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  input: { minHeight: 48, maxHeight: 120, paddingHorizontal: Spacing.l, paddingVertical: Spacing.m, backgroundColor: Colors.surface2, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.body },
});
