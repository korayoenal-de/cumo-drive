/**
 * Einmalige Abfrage nach der Anmeldung, wenn im Konto noch kein Name steht.
 * Ohne Namen kann einen niemand zu einer Gruppenfahrt einladen.
 */
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NameField, useNameCheck } from '@/components/auth/name-field';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';
import { signOut } from '@/lib/auth';
import { setDisplayName } from '@/lib/profile';

export function NameScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const check = useNameCheck(name);
  const ready = check.state === 'frei' && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setErr(null);
    try {
      await setDisplayName(name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xxxl, paddingBottom: insets.bottom + Spacing.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.gapM}>
          <AppText variant="caption" style={styles.brand}>
            CUMO DRIVE
          </AppText>
          <AppText variant="display">{'Wie sollen\ndich andere\nsehen?'}</AppText>
          <AppText muted>Unter diesem Namen laden dich andere zu Gruppenfahrten ein, und er steht bei dir auf der Karte. Du kannst ihn später in den Einstellungen ändern.</AppText>
        </View>
        <View style={styles.gapM}>
          <NameField value={name} onChange={setName} check={check} />
          {err && <AppText style={styles.error}>{err}</AppText>}
          <Pressable accessibilityRole="button" disabled={!ready} onPress={() => void submit()} style={[styles.primary, !ready && styles.disabled]}>
            {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Weiter</AppText>}
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.switch}>
            <AppText muted>Abmelden</AppText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ground },
  content: { flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: Spacing.xl, gap: Spacing.xxl },
  gapM: { gap: Spacing.m },
  brand: { color: Colors.signal, fontFamily: Fonts.bold, letterSpacing: 2 },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.title },
  disabled: { opacity: 0.4 },
  error: { color: Colors.signal, fontFamily: Fonts.semibold },
  switch: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
