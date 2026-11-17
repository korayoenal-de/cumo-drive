/**
 * Symbole in Tasten (Joy of Use, Koray 17.11.): SF Symbols, unsere Tab Symbole oder eigene Zeichnungen, alle
 * gleich groß (20) und gleich kräftig. Ein Symbol steht für ein Ziel: das Touren Symbol heißt „landet in Touren“.
 * Übersicht: Canvas „Joy of Use“, Board Symbole in Tasten.
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { TabIcon, type TabIconName } from '@/components/ui/tab-icons';
import { Colors } from '@/constants/theme';

export type BtnIcon = { tab: TabIconName } | { sf: SFSymbol; color?: string } | { draw: 'radar' };

export function BtnIconView({ icon, color, size = 20 }: { icon: BtnIcon; color: string; size?: number }) {
  if ('tab' in icon) return <TabIcon name={icon.tab} on={false} color={color} size={size + 2} />;
  if ('draw' in icon) return <RadarIcon color={color} size={size} />;
  return <SymbolView name={icon.sf} size={size} weight="semibold" tintColor={icon.color ?? color} />;
}

/** Radar für Nochmal scannen (Koray 17.11.), wie das Radar der Rundtour im Planer */
export function RadarIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={12} cy={12} r={9} fill="none" stroke={color} strokeWidth={2} />
      <Circle cx={12} cy={12} r={5} fill="none" stroke={color} strokeWidth={2} opacity={0.55} />
      <Path d="M12 12 L12 3 A9 9 0 0 1 20.2 8.3 Z" fill={color} opacity={0.35} />
      <Path d="M12 12 L20.2 8.3" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={12} cy={12} r={1.6} fill={color} />
      <Circle cx={8.2} cy={15.6} r={1.3} fill={Colors.signal} />
    </Svg>
  );
}

/** Symbol vor der Schrift in bestehenden Tasten: gleicher Abstand wie in MorphAction */
export function IconLabel({ icon, color, children }: { icon: BtnIcon; color: string; children: ReactNode }) {
  return (
    <View style={iconLabel.row}>
      <BtnIconView icon={icon} color={color} />
      {children}
    </View>
  );
}

const iconLabel = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 8 } });
