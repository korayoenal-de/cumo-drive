/**
 * "Wie fandest du die Tour?" nach der Fahrt (Koray 8.11.2026): stufenloser Regler von 0 bis 100.
 * Beim Ziehen füllt sich das Logo Segment für Segment, Zahl und Wort laufen mit, der Knopf wächst
 * unter dem Finger (Federn aus Motion). Darunter Daumen hoch oder runter je gefahrenem Highlight:
 * daraus lernt der Fahrspaß Pegel der Strecken (lib/highlight-feedback.ts).
 */
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Chip } from '@/components/ui/chip';
import { LogoFill } from '@/components/ui/fun-gauge';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Spacing, Type, Size } from '@/constants/theme';
import { BAD_REASONS, SCORE_WEAK, rateDriveScore, scoreWord, type HighlightVote } from '@/lib/drives';

export type DrivenHighlight = { key: string; name: string; kind: 'pass' | 'strecke' };

/**
 * Bewertung samt Nachfrage bei schwacher Note. Speichert, sobald die Fahrt im Konto liegt (driveId),
 * vorher gewählte Werte werden nachgereicht.
 */
export function DriveRatingCard({ driveId, highlights = [], preset = null }: { driveId: string | null; highlights?: DrivenHighlight[]; /** Note vom Autodisplay (CarPlay, Build 14) */ preset?: number | null }) {
  const [score, setScore] = useState<number | null>(preset);
  // Bewertung kam im Auto: übernehmen, solange am iPhone noch nichts gewählt ist
  const [lastPreset, setLastPreset] = useState(preset);
  if (preset !== lastPreset) {
    setLastPreset(preset);
    if (preset != null && score == null) setScore(preset);
  }
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [votes, setVotes] = useState<Record<string, 1 | -1>>({});
  const [sent, setSent] = useState('');
  const weak = score != null && score < SCORE_WEAK;
  const list: HighlightVote[] = highlights.map((h) => ({ key: h.key, name: h.name, vote: votes[h.key] ?? null }));
  const key = score != null ? JSON.stringify([score, weak ? reasons : [], weak ? note.trim() : '', list]) : '';

  // Kurz warten, damit Ziehen, Tippen im Textfeld und schnelles Antippen nicht jedes Mal sendet
  useEffect(() => {
    if (!driveId || score == null || key === sent) return;
    const t = setTimeout(() => {
      rateDriveScore(driveId, score, reasons, note.trim(), list)
        .then(() => setSent(key))
        .catch(() => undefined);
    }, 900);
    return () => clearTimeout(t);
  }, [driveId, score, reasons, note, list, key, sent]);

  const toggle = (id: string) => setReasons((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  const vote = (k: string, v: 1 | -1) =>
    setVotes((cur) => {
      const next = { ...cur };
      if (next[k] === v) delete next[k];
      else next[k] = v;
      return next;
    });

  return (
    <View style={styles.box}>
      {/* Sterne statt Regler (Koray 10.11.) */}
      <StarRating value={score} onChange={setScore} />
      {weak && (
        <View style={styles.box}>
          <AppText style={styles.title}>Was hat dir nicht gefallen?</AppText>
          <View style={styles.chips}>
            {BAD_REASONS.map((r) => (
              <Chip key={r.id} label={r.label} active={reasons.includes(r.id)} onPress={() => toggle(r.id)} />
            ))}
          </View>
          <TextInput maxFontSizeMultiplier={1.2}
            value={note}
            onChangeText={setNote}
            placeholder="Wo genau? Zum Beispiel: Ortsdurchfahrt nach dem Pass"
            placeholderTextColor={Colors.muted}
            maxLength={500}
            multiline
            style={styles.input}
            accessibilityLabel="Was hat dir nicht gefallen, freier Text"
          />
        </View>
      )}
      {highlights.length > 0 && (
        <View style={styles.hlBox}>
          <AppText style={styles.title}>Deine Highlights</AppText>
          {highlights.map((h) => (
            <View key={h.key} style={styles.hlRow}>
              <View style={styles.hlText}>
                <AppText style={styles.hlName} numberOfLines={1}>
                  {h.name}
                </AppText>
                <AppText style={styles.hlKind}>{h.kind === 'pass' ? 'Pass' : 'Strecke'}</AppText>
              </View>
              <Thumb up on={votes[h.key] === 1} name={h.name} onPress={() => vote(h.key, 1)} />
              <Thumb up={false} on={votes[h.key] === -1} name={h.name} onPress={() => vote(h.key, -1)} />
            </View>
          ))}
        </View>
      )}
      <AppText style={styles.foot}>
        {score != null ? 'Danke! Damit lernt der Fahrspaß Pegel, welche Strecken wirklich begeistern.' : 'Deine Bewertung hilft, die besten Strecken für alle zu finden.'}
      </AppText>
    </View>
  );
}

/** Daumen mit Feder beim Drücken; gewählt: getönte Fläche in Grün oder Signal */
function Thumb({ up, on, name, onPress }: { up: boolean; on: boolean; name: string; onPress: () => void }) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  const tone = up ? Colors.good : Colors.signal;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${name}: ${up ? 'hat mir gefallen' : 'hat mir nicht gefallen'}`}
      hitSlop={4}
      onPressIn={() => s.set(withSpring(0.88, Motion.press))}
      onPressOut={() => s.set(withSpring(1, Motion.press))}
      onPress={onPress}>
      <Animated.View style={[styles.thumbBtn, on && { backgroundColor: up ? Colors.goodTint : Colors.signalTint }, anim]}>
        <SymbolView name={up ? (on ? 'hand.thumbsup.fill' : 'hand.thumbsup') : on ? 'hand.thumbsdown.fill' : 'hand.thumbsdown'} size={20} tintColor={on ? tone : Colors.muted} />
      </Animated.View>
    </Pressable>
  );
}

const KNOB = 32;

/**
 * Stufenloser Regler 0 bis 100. Vor der ersten Berührung steht der Knopf halb durchsichtig in der Mitte.
 * Tippen springt mit Feder an die Stelle, Ziehen folgt dem Finger. VoiceOver: in Zehnerschritten.
 */
/** Fünf Sterne zum Antippen; intern weiter die Note 0 bis 100 für den lernenden Pegel. */
const STAR_SCORE = [10, 30, 55, 78, 100];
const starsFor = (v: number | null) => (v == null ? 0 : STAR_SCORE.findIndex((x, i) => v <= x || i === STAR_SCORE.length - 1) + 1);

export function StarRating({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const n = starsFor(value);
  return (
    <View style={styles.box}>
      <AppText style={styles.title}>Wie fandest du die Tour?</AppText>
      <View style={styles.stars} accessibilityRole="adjustable" accessibilityValue={{ text: n ? `${n} von 5 Sternen, ${scoreWord(value!)}` : 'Noch nicht bewertet' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Pressable key={i} accessibilityRole="button" accessibilityLabel={`${i} ${i === 1 ? 'Stern' : 'Sterne'}`} hitSlop={4} onPress={() => onChange(STAR_SCORE[i - 1])} style={({ pressed }) => [styles.star, pressed && { transform: [{ scale: Motion.pressScale }] }]}>
            <SymbolView name={i <= n ? 'star.fill' : 'star'} size={40} weight="semibold" tintColor={i <= n ? Colors.signal : Colors.empty} />
          </Pressable>
        ))}
      </View>
      <AppText style={[styles.word, n > 0 && styles.wordOn, styles.starWord]}>{n ? scoreWord(value!) : 'Tippe auf einen Stern'}</AppText>
    </View>
  );
}

export function ScoreSlider({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const [w, setW] = useState(0);
  const [live, setLive] = useState<number | null>(value);
  const span = Math.max(1, w - KNOB);
  /** 0 bis 1 */
  const p = useSharedValue(value != null ? value / 100 : 0.5);
  const touched = useSharedValue(value != null ? 1 : 0);
  const press = useSharedValue(0);
  const spanSv = useSharedValue(span);
  useEffect(() => {
    spanSv.set(span);
  }, [span, spanSv]);

  // Zahl und Wort laufen beim Ziehen mit (nur wenn sich die ganze Zahl ändert)
  useAnimatedReaction(
    () => (touched.get() ? Math.round(p.get() * 100) : -1),
    (n, prev) => {
      if (n !== prev && n >= 0) scheduleOnRN(setLive, n);
    },
  );

  const commit = (n: number) => onChange(n);
  const at = (x: number) => {
    'worklet';
    return Math.max(0, Math.min(1, (x - KNOB / 2) / spanSv.get()));
  };
  // Ziehen nur waagerecht, damit die Seite sich weiter senkrecht scrollen lässt
  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onStart((e) => {
      touched.set(1);
      press.set(withSpring(1, Motion.press));
      p.set(at(e.x));
    })
    .onUpdate((e) => {
      p.set(at(e.x));
    })
    .onEnd(() => {
      scheduleOnRN(commit, Math.round(p.get() * 100));
    })
    .onFinalize(() => {
      press.set(withSpring(0, Motion.press));
    });
  // Tippen springt mit Feder an die Stelle
  const tap = Gesture.Tap().onEnd((e) => {
    touched.set(1);
    const t = at(e.x);
    p.set(withSpring(t, Motion.snap));
    scheduleOnRN(commit, Math.round(t * 100));
  });
  const gesture = Gesture.Race(pan, tap);

  const fill = useAnimatedStyle(() => ({ width: KNOB / 2 + p.get() * spanSv.get(), opacity: touched.get() ? 1 : 0 }));
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: p.get() * spanSv.get() }, { scale: 1 + press.get() * 0.18 }],
    opacity: touched.get() ? 1 : 0.45,
  }));
  const shown = live ?? value;

  function onAction(e: AccessibilityActionEvent) {
    const cur = value ?? 50;
    const next = e.nativeEvent.actionName === 'increment' ? Math.min(100, cur + 10) : Math.max(0, cur - 10);
    touched.set(1);
    p.set(withSpring(next / 100, Motion.snap));
    setLive(next);
    onChange(next);
  }

  return (
    <View style={styles.box}>
      <AppText style={styles.title}>Wie fandest du die Tour?</AppText>
      <View style={styles.head}>
        <LogoFill progress={p} size={44} />
        <View style={styles.headText}>
          <AppText style={[styles.big, shown == null && styles.bigOff]}>{shown != null ? shown : '–'}</AppText>
          <AppText style={[styles.word, shown != null && styles.wordOn]}>{shown != null ? scoreWord(shown) : 'Zieh den Regler'}</AppText>
        </View>
      </View>
      <GestureHandlerRootView>
        <GestureDetector gesture={gesture}>
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Wie fandest du die Tour, 0 bis 100"
            accessibilityValue={{ text: value != null ? `${value}, ${scoreWord(value)}` : 'Noch nicht bewertet' }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={onAction}
            onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
            style={styles.slider}>
            <View style={styles.rail} />
            <Animated.View pointerEvents="none" style={[styles.fill, fill]} />
            <Animated.View pointerEvents="none" style={[styles.knob, knob]} />
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
      <View style={styles.ends}>
        <AppText style={styles.end}>Enttäuschend</AppText>
        <AppText style={styles.end}>Sensationell</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.s },
  star: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  starWord: { textAlign: 'center' },
  box: { gap: Spacing.m },
  title: { fontFamily: Fonts.semibold, fontSize: Type.title },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  headText: { gap: 2 },
  big: { fontFamily: Fonts.display, fontSize: 34, lineHeight: 38, color: Colors.text, fontVariant: ['tabular-nums'] },
  bigOff: { color: Colors.muted },
  word: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.muted },
  wordOn: { color: Colors.signal },
  slider: { height: 48, justifyContent: 'center' },
  rail: { position: 'absolute', left: KNOB / 2, right: KNOB / 2, height: 10, borderRadius: 5, backgroundColor: Colors.surface2 },
  fill: { position: 'absolute', left: 0, height: 10, borderRadius: 5, backgroundColor: Colors.signal },
  knob: {
    position: 'absolute',
    left: 0,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: Colors.text,
    boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
  },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
  end: { fontFamily: Fonts.medium, fontSize: Type.body, color: Colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  input: { minHeight: Size.input, maxHeight: 120, paddingHorizontal: Spacing.l, paddingVertical: Spacing.m, backgroundColor: Colors.surface2, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.body },
  hlBox: { gap: Spacing.s },
  hlRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, minHeight: 52 },
  hlText: { flex: 1, minWidth: 0 },
  hlName: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.text },
  hlKind: { fontSize: Type.body, color: Colors.muted },
  thumbBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface2 },
  foot: { fontSize: Type.body, color: Colors.muted },
});
