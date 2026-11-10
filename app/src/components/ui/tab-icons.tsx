/**
 * Eigene Symbole der Tableiste (Koray 10.11.): ein Raster (24), eine Strichstärke, gleiche optische Größe.
 * Die SF Symbole wichen in Größe und Strich voneinander ab, und beim Routen Symbol lag die Kurve zu nah an
 * den Kreisen. Aktiv: gefüllt und etwas kräftiger, wie bei den SF .fill Varianten.
 */
import Svg, { Circle, Path } from 'react-native-svg';

export type TabIconName = 'planen' | 'touren' | 'community' | 'einstellungen';

const STROKE = 1.8;
const STROKE_ON = 2;

/** Zahnrad mit acht Zähnen und Loch in der Mitte, einmal berechnet */
const GEAR = (() => {
  const pt = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(12 + r * Math.sin(a)).toFixed(2)},${(12 - r * Math.cos(a)).toFixed(2)}`;
  };
  let d = '';
  for (let k = 0; k < 8; k++) {
    const a = k * 45;
    d += `${k === 0 ? 'M' : 'L'}${pt(7, a - 15)} L${pt(9.3, a - 9)} L${pt(9.3, a + 9)} L${pt(7, a + 15)} `;
  }
  return `${d}Z`;
})();
/** Kreis mit Radius 3,3 als Pfad */
const HOLE = 'M15.3 12 A3.3 3.3 0 1 0 8.7 12 A3.3 3.3 0 1 0 15.3 12 Z';

export function TabIcon({ name, on, color, size = 24 }: { name: TabIconName; on: boolean; color: string; size?: number }) {
  const sw = on ? STROKE_ON : STROKE;
  const common = { stroke: color, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const fill = on ? color : 'none';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {name === 'planen' && (
        <>
          {/* Start oben links, Ziel unten rechts, die Strecke hält Abstand zu beiden Kreisen */}
          <Circle cx={5.5} cy={5} r={2.6} fill={fill} {...common} />
          <Circle cx={18.5} cy={19} r={2.6} fill={fill} {...common} />
          <Path d="M5.5 10 C5.5 14.6 18.5 9.4 18.5 14" fill="none" {...common} />
        </>
      )}
      {name === 'touren' && <Path d="M6.5 5.2 Q6.5 3.4 8.3 3.4 H15.7 Q17.5 3.4 17.5 5.2 V20.4 L12 16.6 L6.5 20.4 Z" fill={fill} {...common} />}
      {name === 'community' && (
        <>
          {/* zweite Person mit Abstand zur ersten, damit sie auch gefüllt getrennt bleibt */}
          <Circle cx={17.3} cy={7.2} r={2.5} fill={fill} {...common} />
          <Path d="M17.4 12.6 C19.9 12.6 21.4 14.6 21.4 18" fill="none" {...common} />
          <Circle cx={9.2} cy={8} r={3.3} fill={fill} {...common} />
          <Path d="M3 19.6 C3 15.9 5.7 13.6 9.2 13.6 C12.7 13.6 15.4 15.9 15.4 19.6 Z" fill={fill} {...common} />
        </>
      )}
      {name === 'einstellungen' && (
        <>
          {/* Loch als zweiter Teilpfad (evenodd): durchsichtig, egal auf welchem Grund die Leiste liegt */}
          <Path d={`${GEAR} ${HOLE}`} fill={fill} fillRule="evenodd" {...common} />
        </>
      )}
    </Svg>
  );
}
