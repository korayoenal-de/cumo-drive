/**
 * Startscreen (Konzept "Startscreen Animation", Variante 5 Berge, entschieden am 7.11.2026):
 * Acht graue Berge liegen nach Korays Skizze verteilt, mit Anschnitt an den Rändern. Nacheinander heben sie
 * gegen den Uhrzeigersinn ab 6 Uhr ab, färben sich orange, bekommen ihre Rundungen und schließen das Logo.
 * Kurz vor dem Schluss rollt das Logo wie ein Rad eine Vierteldrehung nach vorne (im Uhrzeigersinn) und rastet mit einer Spitze auf 12 Uhr ein,
 * danach erscheint CUMO DRIVE. Ein Tipp überspringt. Währenddessen lädt die App im Hintergrund (lib/preload).
 *
 * Alles läuft auf dem UI Thread: ein Zeitwert treibt Pfade, Farben und Schrift.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { Colors, Fonts } from '@/constants/theme';

/* Bühne wie im Konzept: 390 × 844, auf den Bildschirm gezogen (füllt, schneidet notfalls an) */
const VW = 390;
const VH = 844;
const N = 8;
const RO = 11.4;
const RI = 4.2;
const HW = 21;
const S = 4.5;
const CX = 195;
const CY = 360;
const TEXT_TOP = 436;
const TEXT_SIZE = 40;

const RISE = 0.7;
const F0 = 1.5;
const STAG = 0.08;
const D = 1.25;
const LAND = F0 + 7 * STAG + D;
/** Ende der Schrift, danach kurz stehen lassen */
const DONE = LAND + 0.45 + 0.7 + 0.3;
const FADE_MS = 350;

const rad = (d: number) => (d * Math.PI) / 180;
const pt = (r: number, a: number): [number, number] => [r * Math.sin(rad(a)), -r * Math.cos(rad(a))];
const lerp2 = (a: [number, number], b: [number, number], f: number): [number, number] => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
const normDeg = (a: number) => ((((a % 360) + 540) % 360) - 180);

/* Segmente gegen den Uhrzeigersinn ab 6 Uhr */
const ORDER = Array.from({ length: N }, (_, k) => (157.5 - k * 45 + 360) % 360);
const SEG_W = 2 * RO * Math.sin(rad(HW)) * S;
const SEG_H = (RO * Math.cos(rad(HW)) - RI) * S;

/** Komposition nach Korays Skizze: Spitze x, Spitze y, Breite, Höhe */
const MTS: [number, number, number, number][] = [
  [304, 30, 112, 100],
  [176, 105, 225, 201],
  [129, 361, 136, 122],
  [389, 281, 226, 202],
  [198, 546, 225, 201],
  [-14, 640, 280, 250],
  [52, 58, 84, 75],
  [345, 600, 104, 93],
];

type Seg = {
  /** Punkte relativ zum Schwerpunkt in px: a2, R, q, L, a1, A; spitz (m = 0) und rund (m = 1) */
  p0: number[];
  p1: number[];
  gx: number;
  gy: number;
  rT: number;
  c: number;
  rM: number;
  ax: number;
  ay: number;
  ms: number;
  sy: number;
  h: number;
  tk: number;
  c2x: number;
  c2y: number;
};

const SEGS: Seg[] = (() => {
  // jedem Segment den Berg in seiner Richtung geben, damit sich die Flugbahnen nicht kreuzen
  const ang = MTS.map(([x, y, , h]) => ((Math.atan2(x - CX, -(y + (h * 2) / 3 - CY)) * 180) / Math.PI + 360) % 360);
  const mIdx = MTS.map((_, i) => i).sort((a, b) => ang[a] - ang[b]);
  const kIdx = ORDER.map((_, k) => k).sort((a, b) => ORDER[a] - ORDER[b]);
  let best = 0;
  let bestCost = Infinity;
  for (let off = 0; off < N; off++) {
    let cost = 0;
    for (let i = 0; i < N; i++) cost += Math.abs(normDeg(ang[mIdx[(i + off) % N]] - ORDER[kIdx[i]]));
    if (cost < bestCost) {
      bestCost = cost;
      best = off;
    }
  }
  const hero: [number, number, number, number][] = [];
  for (let i = 0; i < N; i++) hero[kIdx[i]] = MTS[mIdx[(i + best) % N]];

  return ORDER.map((c, k) => {
    const L = pt(RO, c - HW);
    const R = pt(RO, c + HW);
    const A = pt(RI, c);
    const M = pt(RO, c);
    const g: [number, number] = [(L[0] + R[0] + A[0]) / 3, (L[1] + R[1] + A[1]) / 3];
    const mid = lerp2(L, R, 0.5);
    const qRound: [number, number] = [2 * M[0] - mid[0], 2 * M[1] - mid[1]];
    const local = (m: number) => {
      const a1 = lerp2(A, L, 0.22 * m);
      const a2 = lerp2(A, R, 0.22 * m);
      const q = lerp2(mid, qRound, m);
      return [a2, R, q, L, a1, A].flatMap((p) => [(p[0] - g[0]) * S, (p[1] - g[1]) * S]);
    };
    const [ax, ay, w, h] = hero[k];
    const ms = w / SEG_W;
    const gx = CX + g[0] * S;
    const gy = CY + g[1] * S;
    const rT = Math.hypot(gx - CX, gy - CY);
    const out = pt(rT * 2.4, c + 32);
    return {
      p0: local(0),
      p1: local(1),
      gx,
      gy,
      rT,
      c,
      rM: normDeg(-(c + 180)),
      ax,
      ay,
      ms,
      sy: h / SEG_H / ms,
      h,
      tk: F0 + k * STAG,
      c2x: CX + out[0],
      c2y: CY + out[1],
    };
  });
})();

const GREY = [46, 46, 49];
const SIGNAL = [226, 70, 28];

function segFrame(s: Seg, t: number, rot: number, gs: number) {
  'worklet';
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const smooth = (x: number) => x * x * (3 - 2 * x);
  const outCubic = (x: number) => 1 - Math.pow(1 - x, 3);
  const inOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const bez = (a: number, b: number, c: number, d: number, u: number) => {
    const v = 1 - u;
    return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d;
  };

  const rise = outCubic(clamp((t - (s.ay / VH) * 0.3) / RISE));
  const x0 = s.ax;
  const y0 = s.ay + (s.h * 2) / 3 + (1 - rise) * 18;
  const p = clamp((t - s.tk) / D);
  let x = x0;
  let y = y0;
  let r = s.rM;
  let sc = s.ms;
  let sy = s.sy;
  let col = 0;
  let op = rise;
  if (p > 0) {
    const e = inOutCubic(p);
    x = bez(x0, x0, s.c2x, s.gx, e);
    y = bez(y0, y0 - 120, s.c2y, s.gy, e);
    r = s.rM * (1 - smooth(e));
    sc = s.ms + (1 - s.ms) * e;
    sy = s.sy + (1 - s.sy) * smooth(e);
    col = smooth(clamp(p * 1.4));
    op = 1;
  }
  const m = smooth(clamp((p - 0.55) / 0.45));
  const cr = Math.cos((r * Math.PI) / 180);
  const sr = Math.sin((r * Math.PI) / 180);
  const cg = Math.cos((rot * Math.PI) / 180) * gs;
  const sg = Math.sin((rot * Math.PI) / 180) * gs;
  const P: string[] = [];
  for (let i = 0; i < 12; i += 2) {
    const lx = (s.p0[i] + (s.p1[i] - s.p0[i]) * m) * sc;
    const ly = (s.p0[i + 1] + (s.p1[i + 1] - s.p0[i + 1]) * m) * sc;
    const u = lx * cr - ly * sr;
    const v = (lx * sr + ly * cr) * sy;
    const dx = x + u - CX;
    const dy = y + v - CY;
    P.push(`${(CX + dx * cg - dy * sg).toFixed(2)} ${(CY + dx * sg + dy * cg).toFixed(2)}`);
  }
  const d = `M${P[0]}L${P[1]}Q${P[2]} ${P[3]}L${P[4]}Q${P[5]} ${P[0]}Z`;
  const fill = `rgb(${Math.round(GREY[0] + (SIGNAL[0] - GREY[0]) * col)},${Math.round(GREY[1] + (SIGNAL[1] - GREY[1]) * col)},${Math.round(GREY[2] + (SIGNAL[2] - GREY[2]) * col)})`;
  return { d, fill, opacity: op };
}

/** Drehung und kurzes Atmen der ganzen Marke beim Einrasten */
function groupFrame(t: number) {
  'worklet';
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const smooth = (x: number) => x * x * (3 - 2 * x);
  const ru = clamp((t - (LAND - 0.75)) / 1.35);
  const su = smooth(ru);
  const back = 1.3;
  // im Uhrzeigersinn: das Rad rollt nach vorne (Koray 7.11.)
  const rot = ru > 0 ? 90 * (1 + (back + 1) * Math.pow(su - 1, 3) + back * Math.pow(su - 1, 2)) : 0;
  const b = t > LAND && t < LAND + 0.5 ? Math.sin((Math.PI * (t - LAND)) / 0.5) : 0;
  return { rot, gs: 1 + 0.03 * b };
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function Mountain({ seg, t }: { seg: Seg; t: SharedValue<number> }) {
  const props = useAnimatedProps(() => {
    const g = groupFrame(t.value);
    return segFrame(seg, t.value, g.rot, g.gs);
  });
  return <AnimatedPath animatedProps={props} />;
}

function Word({ text, color, at, t, size }: { text: string; color: string; at: number; t: SharedValue<number>; size: number }) {
  const style = useAnimatedStyle(() => {
    const q = 1 - Math.pow(1 - Math.max(0, Math.min(1, (t.value - at) / 0.7)), 3);
    return { opacity: q, transform: [{ translateY: (1 - q) * 12 }], letterSpacing: (0.01 + (1 - q) * 0.2) * size };
  });
  return <Animated.Text style={[styles.word, { color, fontSize: size, lineHeight: size }, style]}>{text}</Animated.Text>;
}

/**
 * Liegt über der ganzen App, bis die Animation durch ist und die App bereit (Konto geprüft).
 * Danach blendet er aus und meldet sich mit onDone ab.
 */
export function StartScreen({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  const fade = useSharedValue(1);
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    if (reduced) {
      t.set(DONE);
      const id = setTimeout(() => setPlayed(true), 600);
      return () => clearTimeout(id);
    }
    t.set(
      withTiming(DONE, { duration: DONE * 1000, easing: Easing.linear }, (fin) => {
        if (fin) scheduleOnRN(setPlayed, true);
      }),
    );
    return () => cancelAnimation(t);
  }, [reduced, t]);

  useEffect(() => {
    if (!played || !ready) return;
    fade.set(
      withTiming(0, { duration: FADE_MS, easing: Easing.out(Easing.quad) }, (fin) => {
        if (fin) scheduleOnRN(onDone);
      }),
    );
  }, [played, ready, fade, onDone]);

  const skip = () => {
    cancelAnimation(t);
    t.set(
      withTiming(DONE, { duration: 250 }, (fin) => {
        if (fin) scheduleOnRN(setPlayed, true);
      }),
    );
  };

  const glow = useAnimatedProps(() => {
    const x = Math.max(0, Math.min(1, (t.value - LAND + 0.4) / 1.0));
    return { opacity: x * x * (3 - 2 * x) };
  });
  const rootStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  // Bühne füllt den Bildschirm wie preserveAspectRatio slice
  const scale = Math.max(width / VW, height / VH);
  const offY = (height - VH * scale) / 2;
  const textSize = TEXT_SIZE * scale;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]} accessibilityLabel="CUMO DRIVE wird geladen" accessibilityRole="image">
      <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessibilityRole="button" accessibilityLabel="Startanimation überspringen">
        <Svg width={width} height={height} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice">
          <Defs>
            <RadialGradient id="sky" cx="50%" cy="42%" r="85%">
              <Stop offset="0" stopColor="#202022" />
              <Stop offset="0.6" stopColor="#151517" />
              <Stop offset="1" stopColor={Colors.ground} />
            </RadialGradient>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={Colors.signal} stopOpacity={0.16} />
              <Stop offset="1" stopColor={Colors.signal} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={-200} y={-200} width={VW + 400} height={VH + 400} fill="url(#sky)" />
          <AnimatedCircle cx={CX} cy={CY} r={160} fill="url(#glow)" animatedProps={glow} />
          {SEGS.map((s, i) => (
            <Mountain key={i} seg={s} t={t} />
          ))}
        </Svg>
        <Animated.View style={[styles.wordmark, { top: offY + TEXT_TOP * scale, gap: textSize * 0.26 }]} pointerEvents="none">
          <Word text="CUMO" color={Colors.text} at={LAND + 0.3} t={t} size={textSize} />
          <Word text="DRIVE" color={Colors.signal} at={LAND + 0.45} t={t} size={textSize} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: Colors.ground, zIndex: 1000 },
  wordmark: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center' },
  word: { fontFamily: Fonts.display, textTransform: 'uppercase', includeFontPadding: false },
});
