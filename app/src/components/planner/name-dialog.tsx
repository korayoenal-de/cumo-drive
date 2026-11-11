/**
 * Name vergeben beim ersten Speichern einer Route (Koray 8.11.). Seit 9.11. als Bottom Sheet statt
 * zentriertem Dialog (UI Konsistenz Check): sitzt auf der Tastatur, Vorschlag markiert, eine Hauptaktion.
 * Abbrechen durch Tippen daneben oder Wegziehen.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { OptionsSheet } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';

export function NameDialog({ visible, initial, onCancel, onSave, title = 'Tour speichern', subtitle = 'Unter diesem Namen findest du sie im Tab Touren.' }: { visible: boolean; initial: string; onCancel: () => void; onSave: (name: string) => void; title?: string; subtitle?: string }) {
  // beim Öffnen neu eingehängt (key), daher reicht der Startwert
  const [name, setName] = useState(initial);
  const save = () => onSave(name.trim() || initial);
  return (
    <OptionsSheet visible={visible} title={title} subtitle={subtitle} onClose={onCancel}>
      <View style={styles.body}>
        <TextInput maxFontSizeMultiplier={1.2}
          value={name}
          onChangeText={setName}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={save}
          placeholder="Name der Tour"
          placeholderTextColor={Colors.muted}
          style={styles.input}
          accessibilityLabel="Name der Tour"
        />
        <Pressable accessibilityRole="button" onPress={save} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <AppText style={styles.primaryText}>Speichern</AppText>
        </Pressable>
      </View>
    </OptionsSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.m, paddingHorizontal: Spacing.s, paddingTop: Spacing.m },
  input: { height: Size.input, borderRadius: Radius.m, backgroundColor: Colors.surface2, color: Colors.text, paddingHorizontal: Spacing.l, fontFamily: Fonts.semibold, fontSize: Type.input },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.onSignal },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
});
