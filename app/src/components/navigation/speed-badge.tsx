/**
 * Tempo Plakette unten links in der Navigation (6.11.2026): dein Tempo und das erlaubte Tempo als Schild.
 * Vor scharfen Kurven und Kehren wird sie für ein paar Sekunden zum Bremshinweis (Variante A, Prototyp
 * "Bremshinweis Prototyp"): Pille wächst und tönt sich gelb, ein Lichtsaum läuft einmal durch, der Pfeil
 * dreht in seine Lage, die Meter rollen herunter. Danach ruhiger Rückweg zum Tempo; ein neues Limit
 * pulsiert kurz am Schild. Alles mit Auslaufkurve, ohne Federn. Reduzierte Bewegung: nur Überblenden.
 *
 * Das Limit kommt aus den Straßendaten (speed-zones.ts); ohne Angabe steht kein Schild, geraten wird nie.
 * Zu schnell färbt nur die Fläche ein (warn getönt), ohne Ton und ohne Wertung.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  Keyframe,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

/** Spielraum, bevor die Fläche einfärbt (Tachoabweichung) */
const OVER_KMH = 4;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const SHEEN_EASE = Easing.bezier(0.33, 0, 0.2, 1);
const REST_BG = 'rgba(11,11,12,0.92)';
const WARN_BG = 'rgba(58,44,15,0.96)';

export type BrakeIcon = 'right' | 'left' | 'hairR' | 'hairL' | 'serp';
export type BrakeHint = { big: string; label: string; icon: BrakeIcon; a11y: string };

/** Symbole aus dem Prototyp, viewBox 24; links ist rechts gespiegelt */
const ICON_PATH: Record<BrakeIcon, string> = {
  right: 'M7 21V11a4 4 0 0 1 4-4h7M14 3l4 4-4 4',
  left: 'M7 21V11a4 4 0 0 1 4-4h7M14 3l4 4-4 4',
  hairL: 'M17 21V10a5 5 0 0 0-10 0v4M4 11l3 3 3-3',
  hairR: 'M7 21V10a5 5 0 0 1 10 0v4M20 11l-3 3-3-3',
  serp: 'M4 21V10a3 3 0 0 1 6 0v4a3 3 0 0 0 6 0V5M13 8l3-3 3 3',
};
/** Startwinkel der Drehung: das Symbol kommt fast geradeaus und dreht in seine Lage */
const TURN: Record<BrakeIcon, number> = { right: -45, left: 45, hairR: -45, hairL: 45, serp: -30 };

const t = (to: number, duration: number, delay = 0, easing = EASE) => withDelay(delay, withTiming(to, { duration, easing }));

// Meter rollen: alte Zahl gleitet 40 % nach oben weg, neue kommt von unten, 140 ms
const rollIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 10 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASE },
}).duration(140);
const rollOut = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: { opacity: 0, transform: [{ translateY: -10 }], easing: EASE },
}).duration(140);

export function SpeedBadge({ speedKmh, limit, hint, showSpeed = true }: { speedKmh: number | null; limit: number | null; hint: BrakeHint | null; showSpeed?: boolean }) {
  const reduced = useReducedMotion();
  const v = speedKmh != null && speedKmh >= 3 ? Math.round(speedKmh) : 0;
  const over = limit != null && limit < 130 && v > limit + OVER_KMH;

  // Breiten der beiden Ebenen, gemessen im Layout
  const [restW, setRestW] = useState(0);
  const [warnW, setWarnW] = useState(0);
  const width = useSharedValue(0);
  const warnT = useSharedValue(0); // 0 Tempo, 1 Bremshinweis (Tönung)
  const overT = useSharedValue(over ? 1 : 0);
  const sheen = useSharedValue(0);
  const spd = useSharedValue(1);
  const sign = useSharedValue(1);
  const signPulse = useSharedValue(1);
  const ico = useSharedValue(0);
  const rot = useSharedValue(0);
  const big = useSharedValue(0);
  const lab = useSharedValue(0);

  // zuletzt gezeigter Hinweis, damit der Rückweg noch den alten Inhalt ausblenden kann
  const [last, setLast] = useState<BrakeHint | null>(hint);
  if (hint && (hint.big !== last?.big || hint.label !== last?.label || hint.icon !== last?.icon)) setLast(hint);
  const shown = hint ?? last;
  const active = !!hint;
  // Effekte hängen am Inhalt, nicht an der Objektidentität (die Navigation baut den Hinweis je Bild neu)
  const prevLimit = useRef(limit);
  const limitChangedDuringHint = useRef(false);

  useEffect(() => {
    overT.set(withTiming(over && !active ? 1 : 0, { duration: 300, easing: EASE }));
  }, [over, active, overT]);

  useEffect(() => {
    if (limit !== prevLimit.current) {
      if (active) limitChangedDuringHint.current = true;
      else if (prevLimit.current != null && limit != null && !reduced) signPulse.set(withSequence(t(1.14, 144), t(1, 216)));
      prevLimit.current = limit;
    }
  }, [limit, active, reduced, signPulse]);

  // Nach dem Rückweg den alten Inhalt vergessen
  useEffect(() => {
    if (active) return;
    const id = setTimeout(() => setLast(null), 600);
    return () => clearTimeout(id);
  }, [active]);

  // Erscheinen und Rückweg (Choreografie aus dem Prototyp, Zeiten in ms)
  useEffect(() => {
    if (!restW || !warnW) return;
    if (reduced) {
      const d = 200;
      width.set(withTiming(active ? warnW : restW, { duration: d }));
      warnT.set(withTiming(active ? 1 : 0, { duration: d }));
      for (const s of [spd, sign]) s.set(withTiming(active ? 0 : 1, { duration: d }));
      for (const s of [ico, big, lab]) s.set(withTiming(active ? 1 : 0, { duration: d }));
      rot.set(1);
      return;
    }
    if (active) {
      width.set(t(warnW, 300));
      warnT.set(t(1, 300));
      sheen.set(0);
      sheen.set(t(1, 600, 60, SHEEN_EASE));
      spd.set(t(0, 160));
      sign.set(t(0, 160, 40));
      ico.set(t(1, 220, 80));
      rot.set(0);
      rot.set(t(1, 360, 120));
      big.set(t(1, 240, 120));
      lab.set(t(1, 240, 170));
    } else {
      lab.set(t(0, 160));
      big.set(t(0, 160, 30));
      ico.set(t(0, 160, 60));
      width.set(t(restW, 320, 120));
      warnT.set(t(0, 320, 120));
      spd.set(t(1, 260, 220));
      sign.set(t(1, 260, 270));
      if (limitChangedDuringHint.current) {
        limitChangedDuringHint.current = false;
        signPulse.set(withDelay(560, withSequence(t(1.14, 144), t(1, 216))));
      }
    }
    // nur beim Wechsel zwischen Tempo und Hinweis neu starten
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, restW > 0 && warnW > 0, reduced]);

  // Breite an den Inhalt anpassen (Kettenwechsel, andere Zahl), ohne neu zu choreografieren
  useEffect(() => {
    if (!restW || !warnW) return;
    width.set(withTiming(active ? warnW : restW, { duration: width.get() === 0 ? 0 : 200, easing: EASE }));
  }, [restW, warnW, active, width]);

  const pillStyle = useAnimatedStyle(() => ({
    width: width.get() || undefined,
    backgroundColor: interpolateColor(Math.max(warnT.get(), overT.get()), [0, 1], [REST_BG, WARN_BG]),
  }));
  const spdStyle = useAnimatedStyle(() => ({ opacity: spd.get(), transform: [{ translateX: (1 - spd.get()) * (active ? -8 : -6) }] }));
  const signStyle = useAnimatedStyle(() => ({ opacity: sign.get(), transform: [{ translateX: (1 - sign.get()) * -8 }, { scale: signPulse.get() }] }));
  const icoStyle = useAnimatedStyle(() => ({ opacity: ico.get(), transform: [{ scale: active ? 0.86 + 0.14 * ico.get() : 0.92 + 0.08 * ico.get() }] }));
  const turn = shown ? TURN[shown.icon] : 0;
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, rot.get() * 3),
    transform: [{ rotate: `${turn * (1 - rot.get())}deg` }],
  }));
  const bigStyle = useAnimatedStyle(() => ({ opacity: big.get(), transform: [{ translateX: (1 - big.get()) * (active ? 12 : -6) }] }));
  const labStyle = useAnimatedStyle(() => ({ opacity: lab.get(), transform: [{ translateX: (1 - lab.get()) * (active ? 12 : -6) }] }));
  const sheenStyle = useAnimatedStyle(() => ({
    opacity: sheen.get() <= 0 || sheen.get() >= 1 ? 0 : sheen.get() < 0.35 ? sheen.get() / 0.35 : (1 - sheen.get()) / 0.65,
    transform: [{ translateX: (sheen.get() * 2 - 1) * (width.get() || 200) }],
  }));

  const onRest = (e: LayoutChangeEvent) => setRestW(Math.ceil(e.nativeEvent.layout.width));
  const onWarn = (e: LayoutChangeEvent) => setWarnW(Math.ceil(e.nativeEvent.layout.width));

  // Ohne Tempoanzeige gibt es die Plakette nur während eines Hinweises
  if (!showSpeed && !hint && !shown) return null;

  const label = hint ? hint.a11y : `Tempo ${v} km/h${limit != null ? `, erlaubt ${limit >= 130 ? 'unbegrenzt' : `${limit} km/h`}` : ''}${over ? ', zu schnell' : ''}`;
  const s = shown;
  return (
    <Animated.View style={[styles.pill, pillStyle]} accessible accessibilityRole={hint ? 'alert' : undefined} accessibilityLabel={label} accessibilityLiveRegion="polite">
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, sheenStyle]}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="saum" x1="0" y1="0" x2="1" y2="0.2">
              <Stop offset="0.2" stopColor={Colors.warn} stopOpacity={0} />
              <Stop offset="0.5" stopColor={Colors.warn} stopOpacity={0.38} />
              <Stop offset="0.8" stopColor={Colors.warn} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#saum)" />
        </Svg>
      </Animated.View>

      {/* Ebene Tempo */}
      <View style={styles.rest} onLayout={onRest} pointerEvents="none">
        {showSpeed ? (
          <>
            <Animated.View style={[styles.speed, spdStyle]}>
              <AppText style={[styles.value, over && !hint && styles.valueOver]}>{v}</AppText>
              <AppText style={styles.unit}>km/h</AppText>
            </Animated.View>
            {limit != null && (
              <Animated.View style={[styles.sign, limit >= 130 && styles.signFree, signStyle]}>
                {limit >= 130 ? <View style={styles.freeBar} /> : <AppText style={styles.signText}>{limit}</AppText>}
              </Animated.View>
            )}
          </>
        ) : (
          <View style={styles.minRest} />
        )}
      </View>

      {/* Ebene Bremshinweis */}
      <View style={styles.warn} onLayout={onWarn} pointerEvents="none">
        <Animated.View style={[styles.ico, icoStyle]}>
          <Animated.View style={arrowStyle}>
            <Svg width={26} height={26} viewBox="0 0 24 24" style={s?.icon === 'left' ? styles.mirror : undefined}>
              <Path d={ICON_PATH[s?.icon ?? 'right']} stroke={Colors.warn} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Animated.View>
        </Animated.View>
        <View style={styles.txt}>
          <Animated.View style={[styles.roll, bigStyle]}>
            <Animated.Text key={s?.big ?? '-'} entering={reduced ? undefined : rollIn} exiting={reduced ? undefined : rollOut} style={styles.big} numberOfLines={1}>
              {s?.big ?? ''}
            </Animated.Text>
          </Animated.View>
          <Animated.View style={labStyle}>
            <AppText style={styles.lab} numberOfLines={1}>
              {s?.label ?? ''}
            </AppText>
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    height: 56,
    minWidth: 56,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
  },
  rest: { position: 'absolute', left: 0, top: 0, height: 56, flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingLeft: 18, paddingRight: 7 },
  minRest: { width: 42 },
  warn: { position: 'absolute', left: 0, top: 0, height: 56, flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingLeft: 7, paddingRight: 20 },
  speed: { alignItems: 'center', minWidth: 38 },
  value: { fontFamily: Fonts.display, fontSize: 24, lineHeight: 26, color: Colors.text, fontVariant: ['tabular-nums'] },
  valueOver: { color: Colors.warn },
  unit: { fontFamily: Fonts.semibold, fontSize: 11, color: Colors.muted },
  // Verkehrszeichen: weiß mit rotem Ring, schwarze Zahl
  sign: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', borderWidth: 4, borderColor: '#D7261E', alignItems: 'center', justifyContent: 'center' },
  signFree: { borderColor: '#FFFFFF', borderWidth: 0 },
  freeBar: { width: 34, height: 4, backgroundColor: '#1C1C1F', transform: [{ rotate: '-45deg' }] },
  signText: { fontFamily: Fonts.bold, fontSize: 16, color: '#0B0B0C', fontVariant: ['tabular-nums'] },
  ico: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(232,176,58,0.16)', alignItems: 'center', justifyContent: 'center' },
  mirror: { transform: [{ scaleX: -1 }] },
  txt: { gap: 1 },
  roll: { height: 24, overflow: 'hidden' },
  big: { fontFamily: Fonts.display, fontSize: 22, lineHeight: 24, color: Colors.warn, fontVariant: ['tabular-nums'], textTransform: 'uppercase' },
  lab: { fontFamily: Fonts.semibold, fontSize: 13, color: Colors.warn },
});
