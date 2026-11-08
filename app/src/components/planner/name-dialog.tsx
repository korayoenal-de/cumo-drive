/**
 * Name vergeben beim ersten Speichern einer Route (Koray 8.11.): statt eines festen Felds im Planer
 * fragt ein kleiner Dialog, sobald man auf Speichern tippt. Der Vorschlag ist markiert, Tippen ersetzt ihn.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';

export function NameDialog({ visible, initial, onCancel, onSave }: { visible: boolean; initial: string; onCancel: () => void; onSave: (name: string) => void }) {
  // beim Öffnen neu eingehängt (key), daher reicht der Startwert
  const [name, setName] = useState(initial);
  const save = () => onSave(name.trim() || initial);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Schließen" />
        <View style={styles.card} accessibilityViewIsModal>
          <AppText variant="title">Tour speichern</AppText>
          <AppText variant="caption" muted>
            Gib deiner Tour einen Namen, unter dem du sie in Meine Touren findest.
          </AppText>
          <TextInput
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
          <View style={styles.row}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={({ pressed }) => [styles.btn, styles.secondary, pressed && styles.pressed]}>
              <AppText style={styles.btnText}>Abbrechen</AppText>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={save} style={({ pressed }) => [styles.btn, styles.primary, pressed && styles.pressed]}>
              <AppText style={styles.btnText}>Speichern</AppText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' },
  card: { gap: Spacing.m, padding: Spacing.xl, borderRadius: Radius.l, backgroundColor: Colors.surface },
  input: { height: 48, borderRadius: Radius.s, backgroundColor: Colors.surface2, color: Colors.text, paddingHorizontal: Spacing.m, fontFamily: Fonts.semibold, fontSize: Type.body },
  row: { flexDirection: 'row', gap: Spacing.s, marginTop: Spacing.s },
  btn: { flex: 1, height: 52, borderRadius: Radius.m, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: Colors.surface2 },
  primary: { backgroundColor: Colors.signal },
  btnText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
});
