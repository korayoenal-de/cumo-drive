/**
 * Warnung an einem Highlight (Konzept 12.11.): gelbes Label mit Zickzack Zeichen und dem Hauptgrund,
 * zum Beispiel "Einspurig" oder "Sehr schmal". Die einzige Warnung dieser Art in der App.
 * Das Zeichen ist eine Passstraße von oben; Gelb ist die Farbe für prüfen, Orange bleibt der Hauptaktion.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Type } from '@/constants/theme';
import { warnLabel, type WarnKey } from '@/lib/passes';

export function ZigzagIcon({ size = 15, color = Colors.warn }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path d="M5 20L19 15.5L5 11L19 6.5L9 3.5" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function WarnLabel({ warn }: { warn?: readonly WarnKey[] | null }) {
  const label = warnLabel(warn);
  if (!label) return null;
  return (
    <View style={styles.pill} accessible accessibilityLabel={`Warnung: ${label}`}>
      <ZigzagIcon />
      <AppText style={styles.text} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 13, backgroundColor: Colors.warnTint },
  text: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.warn },
});
