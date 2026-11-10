/**
 * Kartendarstellung als Auswahlzeilen für die Einstellungen; dieselbe Wahl wie im runden Kartenknopf.
 */
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Spacing, Type } from '@/constants/theme';
import { MAP_STYLES, setMapSettings, useMapSettings } from '@/lib/map-settings';

export function MapStylePicker() {
  const st = useMapSettings();
  return (
    <View accessibilityRole="radiogroup">
      {MAP_STYLES.map((m, i) => {
        const on = st.style === m.id;
        return (
          <Pressable
            key={m.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => setMapSettings({ style: m.id })}
            style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && styles.pressed]}>
            <AppText style={styles.title}>{m.label}</AppText>
            {on && <SymbolView name="checkmark" size={15} weight="bold" tintColor={Colors.signal} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingHorizontal: Spacing.l },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  pressed: { backgroundColor: Colors.surface2 },
  title: { flex: 1, fontFamily: Fonts.semibold, fontSize: Type.body },
});
