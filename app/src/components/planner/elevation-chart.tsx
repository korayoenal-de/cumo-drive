/**
 * Höhenprofil für die App: Fläche mit Linie, Antippen oder Ziehen zeigt Kilometer und Höhe.
 * Die Daten kommen wie im Web Planer von Valhalla (/height).
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { elevationProfile, type ElevationProfile } from '@/lib/stats';
import { formatKm, type LatLon } from '@/lib/tour';

/** Lädt das Höhenprofil zur Linie, null solange es lädt oder fehlt. */
export function useElevation(line: LatLon[]): { data: ElevationProfile | null; error: boolean } {
  const [state, setState] = useState<{ for: LatLon[]; data: ElevationProfile | null; error: boolean } | null>(null);
  useEffect(() => {
    if (line.length < 2) return;
    const ctrl = new AbortController();
    elevationProfile(line, ctrl.signal)
      .then((data) => setState({ for: line, data, error: false }))
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ for: line, data: null, error: true });
      });
    return () => ctrl.abort();
  }, [line]);
  if (!state || state.for !== line) return { data: null, error: false };
  return { data: state.data, error: state.error };
}

const H = 96;

export function ElevationChart({ line, onKm, onSurface }: { line: LatLon[]; onKm?: (km: number | null) => void; onSurface?: boolean }) {
  const { data: e, error } = useElevation(line);
  const [w, setW] = useState(0);
  const [touchKm, setTouchKm] = useState<number | null>(null);

  if (error) return null;
  const ready = !!e && e.km.length > 2;
  const maxKm = ready ? e.km[e.km.length - 1] || 1 : 1;
  const lo = ready ? Math.floor(e.min / 100) * 100 : 0;
  const hi = ready ? Math.ceil(e.max / 100) * 100 || lo + 100 : 100;
  const x = (km: number) => (km / maxKm) * w;
  const y = (m: number) => H - 4 - ((m - lo) / Math.max(1, hi - lo)) * (H - 12);
  const d = ready && w > 0 ? e.km.map((k, i) => `${i ? 'L' : 'M'}${x(k).toFixed(1)},${y(e.m[i]).toFixed(1)}`).join(' ') : '';
  const idx = ready && touchKm !== null ? Math.max(0, e.km.findIndex((k) => k >= touchKm)) : -1;

  const track = (px: number) => {
    if (!ready || w <= 0) return;
    const km = Math.min(maxKm, Math.max(0, (px / w) * maxKm));
    setTouchKm(km);
    onKm?.(km);
  };
  const release = () => {
    setTouchKm(null);
    onKm?.(null);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <AppText variant="label">Höhenprofil</AppText>
        <AppText variant="caption" muted style={styles.num}>
          {!ready
            ? 'wird geladen'
            : idx >= 0
              ? `km ${formatKm(e.km[idx], 0)}, ${Math.round(e.m[idx])} m`
              : `${e.up} m hoch, ${e.down} m runter`}
        </AppText>
      </View>
      <View
        style={[styles.chart, onSurface && styles.chartOnSurface]}
        onLayout={(ev: LayoutChangeEvent) => setW(ev.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => ready}
        onMoveShouldSetResponder={() => ready}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(ev) => track(ev.nativeEvent.locationX)}
        onResponderMove={(ev) => track(ev.nativeEvent.locationX)}
        onResponderRelease={release}
        onResponderTerminate={release}
        accessible
        accessibilityRole="image"
        accessibilityLabel={ready ? `Höhenprofil von ${Math.round(e.min)} bis ${Math.round(e.max)} Meter, ${e.up} Meter Anstieg` : 'Höhenprofil wird geladen'}>
        {w > 0 && d ? (
          <Svg width={w} height={H}>
            <Path d={`${d} L${w},${H} L0,${H} Z`} fill={onSurface ? Colors.line : Colors.surface2} />
            <Path d={d} fill="none" stroke={Colors.text} strokeWidth={1.5} />
            {idx >= 0 && <Line x1={x(e!.km[idx])} x2={x(e!.km[idx])} y1={0} y2={H} stroke={Colors.signal} strokeWidth={2} />}
          </Svg>
        ) : null}
      </View>
      {ready && (
        <View style={styles.head}>
          <AppText variant="caption" muted style={styles.num}>{`${Math.round(e.min)} m`}</AppText>
          <AppText variant="caption" muted style={styles.num}>{`höchster Punkt ${Math.round(e.max)} m`}</AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.s },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.s },
  num: { fontFamily: Fonts.medium, fontVariant: ['tabular-nums'] },
  chart: { height: H, backgroundColor: Colors.surface, borderRadius: Radius.m, overflow: 'hidden' },
  chartOnSurface: { backgroundColor: Colors.surface2 },
});
