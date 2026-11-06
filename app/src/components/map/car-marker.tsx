/**
 * Eigenes Auto als Positionssymbol (Test vom 6.11.2026, Idee: Draufsicht aus Fotos des eigenen Autos).
 * Bisher gibt es eine von Hand gezeichnete Draufsicht: Koray Önals 997.2 Carrera GTS Coupé, nach den
 * echten Maßen (4.435 x 1.852 mm, Radstand 2.350 mm) und seinen Fotos. Front zeigt nach oben.
 * Eingeschaltet je Fahrzeug in der Garage (Optionen, "Als Symbol auf der Karte"); sonst bleibt der Pfeil.
 */
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { Vehicle } from '@/lib/vehicle';

export type CarSymbol = 'gts997';

/** Draufsicht für ein Fahrzeug der Garage, null für den normalen Pfeil */
export function carSymbolFor(v: Vehicle | null): CarSymbol | null {
  return v?.mapSymbol === 'gts997' ? 'gts997' : null;
}

const BODY =
  'M50 4 C39 4 30 5 23 7 C13 9 8 15 8 27 C8 40 9 52 10 60 C11 72 11 84 11 96 C11 110 5 120 4 140 C3 166 6 190 13 198 C24 207 76 207 87 198 C94 190 97 166 96 140 C95 120 89 110 89 96 C89 84 89 72 90 60 C91 52 92 40 92 27 C92 15 87 9 77 7 C70 5 61 4 50 4 Z';

/** Breite in pt; die Höhe folgt aus dem Verhältnis 100 zu 212 */
export function CarTopView({ width = 26 }: { symbol?: CarSymbol; width?: number }) {
  return (
    <Svg width={width} height={(width * 212) / 100} viewBox="0 0 100 212">
      <Defs>
        <LinearGradient id="body" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#CFCFD3" />
          <Stop offset="0.12" stopColor="#F2F2F0" />
          <Stop offset="0.5" stopColor="#FFFFFF" />
          <Stop offset="0.88" stopColor="#F2F2F0" />
          <Stop offset="1" stopColor="#CFCFD3" />
        </LinearGradient>
        <LinearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#30353B" />
          <Stop offset="1" stopColor="#0F1113" />
        </LinearGradient>
        <RadialGradient id="roof" cx="0.5" cy="0.4" r="0.7">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#E8E8E6" />
        </RadialGradient>
      </Defs>
      {/* Schatten: dunkler Rand statt Weichzeichner, damit es auf heller und dunkler Karte trägt */}
      <Path d={BODY} fill="#000" opacity={0.45} stroke="#000" strokeWidth={6} strokeOpacity={0.25} />
      <Rect x={5} y={38} width={8} height={24} rx={3} fill="#0A0A0A" />
      <Rect x={87} y={38} width={8} height={24} rx={3} fill="#0A0A0A" />
      <Rect x={1} y={146} width={9} height={28} rx={3} fill="#0A0A0A" />
      <Rect x={90} y={146} width={9} height={28} rx={3} fill="#0A0A0A" />
      <Path d={BODY} fill="url(#body)" />
      <Path d="M28 8 C26 26 27 46 29 64" stroke="#C4C4C9" strokeWidth={0.9} fill="none" />
      <Path d="M72 8 C74 26 73 46 71 64" stroke="#C4C4C9" strokeWidth={0.9} fill="none" />
      <Path d="M17 112 C11 128 10 156 13 186" stroke="#D2D2D6" strokeWidth={0.9} fill="none" />
      <Path d="M83 112 C89 128 90 156 87 186" stroke="#D2D2D6" strokeWidth={0.9} fill="none" />
      <G>
        <Ellipse cx={17} cy={20} rx={6.6} ry={7.2} fill="#2E3237" />
        <Ellipse cx={17} cy={20} rx={4} ry={4.5} fill="#A9B1B8" />
        <Circle cx={17} cy={18.6} r={1.5} fill="#E6EBEF" />
        <Ellipse cx={83} cy={20} rx={6.6} ry={7.2} fill="#2E3237" />
        <Ellipse cx={83} cy={20} rx={4} ry={4.5} fill="#A9B1B8" />
        <Circle cx={83} cy={18.6} r={1.5} fill="#E6EBEF" />
      </G>
      <Path d="M21 8 Q50 3.5 79 8" stroke="#151515" strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <Path d="M12 74 L3 70 Q1 74 4 77.5 L12 79 Z" fill="#EAEAE8" />
      <Path d="M88 74 L97 70 Q99 74 96 77.5 L88 79 Z" fill="#EAEAE8" />
      <Path d="M17 86 C31 73 69 73 83 86 L78 104 C64 98 36 98 22 104 Z" fill="url(#glass)" />
      <Path d="M14 88 L21 104 L21 132 L16 128 C13 116 13 100 14 88 Z" fill="url(#glass)" />
      <Path d="M86 88 L79 104 L79 132 L84 128 C87 116 87 100 86 88 Z" fill="url(#glass)" />
      <Path d="M22 104 C36 98 64 98 78 104 L78 132 C64 135 36 135 22 132 Z" fill="url(#roof)" />
      <Path d="M22 132 C36 135 64 135 78 132 C76 144 71 154 65 160 C57 162 43 162 35 160 C29 154 24 144 22 132 Z" fill="url(#glass)" />
      <Path d="M31 163 C43 165 57 165 69 163 L70 188 C57 190 43 190 30 188 Z" fill="#F1F1EF" />
      <G stroke="#9C9CA2" strokeWidth={1} strokeLinecap="round">
        <Path d="M35 167 L65 167" />
        <Path d="M34.5 171 L65.5 171" />
        <Path d="M34 175 L66 175" />
        <Path d="M34 179 L66 179" />
        <Path d="M34.5 183 L65.5 183" />
      </G>
      <Path d="M6 180 C9 192 16 199 27 201.5" stroke="#B91D16" strokeWidth={3.4} fill="none" strokeLinecap="round" />
      <Path d="M94 180 C91 192 84 199 73 201.5" stroke="#B91D16" strokeWidth={3.4} fill="none" strokeLinecap="round" />
      <G fill="#8E8E92">
        <Rect x={31} y={203} width={5} height={3} rx={1.5} />
        <Rect x={37} y={203} width={5} height={3} rx={1.5} />
        <Rect x={58} y={203} width={5} height={3} rx={1.5} />
        <Rect x={64} y={203} width={5} height={3} rx={1.5} />
      </G>
    </Svg>
  );
}
