/**
 * Bewegung der Routenlinie im Planer (Koray 19.11.2026, Design Artefakt „Punkte, Zeiten, Richtung“):
 *
 * - Ändern: Was fest ist, bleibt fest. Nur die Etappen, die neu gerechnet werden, stehen blass in ihrer alten
 *   Form da, ein Lichtschimmer läuft darüber, solange gerechnet wird (mode 'dim').
 * - Ergebnis: Nur die neuen Etappen zeichnen sich in Fahrtrichtung auf (mode 'grow'), der Rest steht schon.
 * - Richtung (Koray 19.11.: subtil und durchgängig): Ein leiser Lichtschein läuft ohne Pause in Fahrtrichtung
 *   über die Linie, immer gleich schnell. Dazu stehen kleine Pfeile in der Linie. Nur im Planer, nie in der Fahrt.
 *
 * Die Linie selbst zeichnet route-map.tsx; die Bereiche in spans lässt sie dort aus, damit hier nichts doppelt liegt.
 * Bei reduzierter Bewegung: blass ohne Schimmer, sofort fertig gezeichnet, nur die Pfeile.
 */
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { Marker, Polyline, type LatLng } from "react-native-maps";

import { Colors } from "@/constants/theme";
import { arrowsWithKm, lineBetween } from "@/lib/route-change";
import { flatten, haversine, type LatLon, type Tour } from "@/lib/tour";

const ll = ([latitude, longitude]: LatLon): LatLng => ({ latitude, longitude });

export type LineMotion = {
  /** dim: wird gerechnet, grow: zeichnet sich neu auf */
  mode: "dim" | "grow";
  /** Bereiche auf der Linie in km */
  spans: [number, number][];
  /** wechselt bei jeder neuen Bewegung */
  key: string;
};

/** Dauern (ms): Aufzeichnen wie eine Ebene, Lichtlauf ruhig über die ganze Tour */
const GROW_MS = 520;
/** Lichtschein: etwa 40 km je Sekunde, eine Runde zwischen 5 und 12 s; Takt langsamer, er läuft ja dauernd */
const FLOW_KMS = 14;
const FLOW_TICK_MS = 40;
/**
 * Koray 19.11.: erst nicht zu sehen (halb durchsichtig), dann zu laut und zu schnell (mit Hof, 40 km je s).
 * Jetzt ein schmaler oranger Faden in der Mitte der weißen Linie, ruhig, ohne Hof und ohne Kopfpunkt.
 * Läuft auf der Karte immer, auch während gerechnet wird.
 */
const FLOW_COLOR = "#E2461C";
const SHIMMER_MS = 1100;
const TICK_MS = 40;

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

/** Fortschritt 0 bis 1 über ms, neu ab jedem key; null = läuft nicht */
function useProgress(
  key: string | null,
  ms: number,
  loop = false,
  tick = TICK_MS,
): number {
  const [st, setSt] = useState<{ key: string | null; p: number }>({
    key: null,
    p: 0,
  });
  useEffect(() => {
    if (!key) return;
    const t0 = Date.now();
    const id = setInterval(() => {
      const x = (Date.now() - t0) / ms;
      if (!loop && x >= 1) {
        setSt({ key, p: 1 });
        clearInterval(id);
        return;
      }
      setSt({ key, p: loop ? x % 1 : x });
    }, tick);
    return () => clearInterval(id);
  }, [key, ms, loop, tick]);
  if (!key) return 1;
  // neuer Lauf, aber noch kein Takt: am Anfang, nicht am Ende des vorigen
  return st.key === key ? st.p : 0;
}

/** Stücke des Scheins auf der Linie; bei einer Runde läuft er über Start und Ziel weiter, ohne abzureißen */
function flowPieces(head: number, len: number, total: number, closed: boolean): [number, number][] {
  const out: [number, number][] = [[Math.max(0, head - len), head]];
  if (closed && head < len) out.push([total - (len - head), total]);
  return out.filter(([a, b]) => b - a > 0.05);
}

export function RouteMotion({
  tour,
  motion,
  flow,
  mpp,
}: {
  tour: Tour;
  motion: LineMotion | null;
  flow: boolean;
  mpp: number;
}) {
  const reduced = useReducedMotion();
  const pts = useMemo(() => flatten(tour), [tour]);
  const total = pts.length ? pts[pts.length - 1].km : 0;

  const dim = motion?.mode === "dim" ? motion : null;
  const grow = motion?.mode === "grow" ? motion : null;
  const shimmer = useProgress(
    dim && !reduced ? dim.key : null,
    SHIMMER_MS,
    true,
  );
  const grown = useProgress(grow && !reduced ? grow.key : null, GROW_MS);
  const flowMs = Math.min(24000, Math.max(9000, (total / FLOW_KMS) * 1000));
  const flowing = flow && !reduced && total > 0;
  const flowAt = useProgress(
    flowing ? `fluss-${total.toFixed(2)}` : null,
    flowMs,
    true,
    FLOW_TICK_MS,
  );

  // Pfeile etwa alle 160 Bildpunkte, höchstens 24, damit die Karte ruhig bleibt
  const spacingKm = mpp ? (mpp * 160) / 1000 : total / 12;
  const arrows = useMemo(
    () => arrowsWithKm(pts, spacingKm, 24),
    [pts, spacingKm],
  );
  const headKm = total * flowAt;
  const glow = Math.max(0.8, total * 0.05);
  const closed =
    pts.length > 2 && haversine(pts[0].p, pts[pts.length - 1].p) < 400;

  if (!pts.length) return null;
  const casing = (
    k: string,
    coords: LatLon[],
    z: number,
    color: string = Colors.ground,
  ) =>
    coords.length > 1 ? (
      <Polyline
        key={k}
        coordinates={coords.map(ll)}
        strokeColor={color}
        strokeWidth={7}
        lineCap="round"
        lineJoin="round"
        zIndex={z}
      />
    ) : null;
  const stroke = (k: string, coords: LatLon[], z: number, color: string) =>
    coords.length > 1 ? (
      <Polyline
        key={k}
        coordinates={coords.map(ll)}
        strokeColor={color}
        strokeWidth={4}
        lineCap="round"
        lineJoin="round"
        zIndex={z}
      />
    ) : null;

  return (
    <>
      {dim &&
        dim.spans.map(([a, b], i) => {
          const len = b - a;
          // Schimmer: ein Drittel der Etappe wandert in Fahrtrichtung darüber
          const s = a - len * 0.3 + len * 1.3 * shimmer;
          return [
            casing(
              `dim-r-${dim.key}-${i}`,
              lineBetween(pts, a, b),
              2,
              "rgba(11,11,12,0.35)",
            ),
            stroke(
              `dim-l-${dim.key}-${i}`,
              lineBetween(pts, a, b),
              3,
              "rgba(244,244,242,0.3)",
            ),
            !reduced &&
              stroke(
                `dim-s-${dim.key}-${i}-${Math.round(shimmer * 40)}`,
                lineBetween(pts, Math.max(a, s), Math.min(b, s + len * 0.3)),
                4,
                "rgba(255,255,255,0.85)",
              ),
          ];
        })}
      {grow &&
        grow.spans.map(([a, b], i) => {
          const end = a + (b - a) * easeOut(grown);
          const coords = lineBetween(pts, a, end);
          return [
            casing(
              `grow-r-${grow.key}-${i}-${Math.round(grown * 40)}`,
              coords,
              2,
            ),
            stroke(
              `grow-l-${grow.key}-${i}-${Math.round(grown * 40)}`,
              coords,
              3,
              Colors.text,
            ),
          ];
        })}
      {flowing &&
        flowPieces(headKm, glow, total, closed).map(([a, b], i) => [
          <Polyline
            key={`fluss-k-${i}-${Math.round(headKm * 20)}`}
            coordinates={lineBetween(pts, a, b).map(ll)}
            strokeColor={FLOW_COLOR}
            strokeWidth={2}
            lineCap="round"
            lineJoin="round"
            zIndex={6}
          />,
        ])}
      {!dim &&
        arrows.map((a) => (
          <Marker
            key={`richtung-${a.km.toFixed(3)}-${a.p[0].toFixed(5)}`}
            coordinate={ll(a.p)}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={a.deg}
            zIndex={7}
            tracksViewChanges={false}
          >
            <View style={styles.arrow} />
          </Marker>
        ))}
    </>
  );
}

const styles = StyleSheet.create({
  // wie die Pfeile auf doppelt gefahrenen Stücken: dunkles Dreieck in der weißen Linie
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: Colors.ground,
  },
});
