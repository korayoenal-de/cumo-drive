/**
 * Pfeil Symbole je Manöver als eigene SVG Zeichnung.
 * Abbiegepfeile werden aus einem Winkel gebaut (0 geradeaus, positiv nach rechts).
 */
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import type { ManeuverKind } from '@/lib/navigation/types';

const TURN: Partial<Record<ManeuverKind, number>> = {
  geradeaus: 0,
  leicht_rechts: 45,
  rechts: 90,
  scharf_rechts: 135,
  leicht_links: -45,
  links: -90,
  scharf_links: -135,
  auffahrt: 35,
  abfahrt: 35,
};

const W = 6;

function turnArrow(angle: number, color: string) {
  const rad = (angle * Math.PI) / 180;
  const knee = { x: 32, y: 34 };
  const len = angle === 0 ? 20 : Math.abs(angle) > 100 ? 13 : 16;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const tip = { x: knee.x + dx * len, y: knee.y + dy * len };
  // Spitze des Pfeils: Dreieck in Laufrichtung
  const h = 11;
  const back = { x: tip.x - dx * h, y: tip.y - dy * h };
  const nx = -dy;
  const ny = dx;
  const head = `M ${tip.x + dx * 4} ${tip.y + dy * 4} L ${back.x + nx * 9} ${back.y + ny * 9} L ${back.x - nx * 9} ${back.y - ny * 9} Z`;
  const shaft = `M 32 56 L ${knee.x} ${knee.y} L ${back.x} ${back.y}`;
  return (
    <G>
      <Path d={shaft} stroke={color} strokeWidth={W} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d={head} fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </G>
  );
}

export function ManeuverIcon({ kind, size = 64, color = Colors.text }: { kind: ManeuverKind; size?: number; color?: string }) {
  let body;
  const angle = TURN[kind];
  if (angle != null) {
    body = (
      <G>
        {(kind === 'auffahrt' || kind === 'abfahrt') && (
          <Path d="M 18 56 L 18 8" stroke={color} strokeOpacity={0.35} strokeWidth={W} strokeLinecap="round" />
        )}
        {turnArrow(angle, color)}
      </G>
    );
  } else if (kind === 'wenden') {
    body = (
      <G>
        <Path d="M 40 56 L 40 26 A 10 10 0 0 0 20 26 L 20 40" stroke={color} strokeWidth={W} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d="M 20 52 L 11 38 L 29 38 Z" fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      </G>
    );
  } else if (kind === 'kreisverkehr') {
    body = (
      <G>
        <Circle cx={32} cy={30} r={11} stroke={color} strokeWidth={W} fill="none" />
        <Path d="M 32 58 L 32 41" stroke={color} strokeWidth={W} strokeLinecap="round" />
        <Path d="M 40 22 L 48 14" stroke={color} strokeWidth={W} strokeLinecap="round" />
        <Path d="M 54 8 L 41 11 L 51 21 Z" fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      </G>
    );
  } else if (kind === 'ziel') {
    body = (
      <G>
        <Path d="M 18 58 L 18 8" stroke={color} strokeWidth={W} strokeLinecap="round" />
        <Rect x={21} y={8} width={28} height={22} fill={Colors.ground} stroke={color} strokeWidth={3} />
        <Rect x={21} y={8} width={7} height={5.5} fill={color} />
        <Rect x={35} y={8} width={7} height={5.5} fill={color} />
        <Rect x={28} y={13.5} width={7} height={5.5} fill={color} />
        <Rect x={42} y={13.5} width={7} height={5.5} fill={color} />
        <Rect x={21} y={19} width={7} height={5.5} fill={color} />
        <Rect x={35} y={19} width={7} height={5.5} fill={color} />
        <Rect x={28} y={24.5} width={7} height={5.5} fill={color} />
        <Rect x={42} y={24.5} width={7} height={5.5} fill={color} />
      </G>
    );
  } else if (kind === 'zwischenziel') {
    body = (
      <G>
        <Path d="M 32 58 C 32 58 14 38 14 26 A 18 18 0 0 1 50 26 C 50 38 32 58 32 58 Z" fill={color} />
        <Circle cx={32} cy={26} r={7} fill={Colors.ground} />
      </G>
    );
  } else {
    // start
    body = (
      <G>
        <Circle cx={32} cy={32} r={22} stroke={color} strokeWidth={W} fill="none" />
        <Path d="M 32 18 L 44 44 L 32 37 L 20 44 Z" fill={Colors.signal} />
      </G>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {body}
    </Svg>
  );
}

/** Lautsprecher, an oder aus. */
export function SpeakerIcon({ on, size = 26, color = Colors.text }: { on: boolean; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path d="M 4 12 L 10 12 L 17 6 L 17 26 L 10 20 L 4 20 Z" fill={color} />
      {on ? (
        <G>
          <Path d="M 21 11 A 7 7 0 0 1 21 21" stroke={color} strokeWidth={2.5} strokeLinecap="round" fill="none" />
          <Path d="M 24 7 A 12 12 0 0 1 24 25" stroke={color} strokeWidth={2.5} strokeLinecap="round" fill="none" />
        </G>
      ) : (
        <Path d="M 21 12 L 29 20 M 29 12 L 21 20" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      )}
    </Svg>
  );
}

/** Funkgerät Mikrofon. */
export function MicIcon({ size = 28, color = Colors.text }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Rect x={11} y={4} width={10} height={16} rx={5} fill={color} />
      <Path d="M 7 15 A 9 9 0 0 0 25 15 M 16 24 L 16 29 M 11 29 L 21 29" stroke={color} strokeWidth={2.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
