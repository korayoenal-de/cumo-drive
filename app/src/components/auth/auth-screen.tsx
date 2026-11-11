/**
 * Anmeldung beim Start: Die App ist nur mit Konto nutzbar. So liegen Touren, Fahrten und Fahrzeuge
 * von Anfang an im Konto und sind in App und Web Planer dieselben.
 */
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type, Size } from '@/constants/theme';
import { NameField, useNameCheck } from '@/components/auth/name-field';
import { signIn } from '@/lib/auth';
import { signUpWithName } from '@/lib/profile';

/** Im Browser (/login, /registrieren) schmal und mittig, mit Logo zurück zur Startseite. */
const WEB = Platform.OS === 'web';

export function AuthScreen({ initialMode = 'login', onHome }: { initialMode?: 'login' | 'register'; onHome?: () => void } = {}) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const check = useNameCheck(mode === 'register' ? name : '');
  const ready = !!email.trim() && pw.length > 0 && !busy && (mode === 'login' || check.state === 'frei');

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setErr(null);
    try {
      if (mode === 'login') await signIn(email, pw);
      else await signUpWithName(email, pw, name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, WEB && styles.contentWeb, { paddingTop: insets.top + Spacing.xxxl, paddingBottom: insets.bottom + Spacing.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.gapS}>
          <Pressable accessibilityRole={onHome ? 'link' : undefined} disabled={!onHome} onPress={onHome} style={styles.brandRow}>
            <AppText variant="caption" style={styles.brand}>
              CUMO DRIVE
            </AppText>
          </Pressable>
          <AppText variant="display">{mode === 'login' ? 'Willkommen\nzurück' : 'Konto\nanlegen'}</AppText>
          <AppText muted>Kurvige Touren planen, in der Gruppe fahren und jede Fahrt festhalten. Deine Touren liegen in deinem Konto, in der App und im Web Planer.</AppText>
        </View>

        <View style={styles.gapM}>
          {mode === 'register' && <NameField value={name} onChange={setName} check={check} />}
          <TextInput maxFontSizeMultiplier={1.2}
            value={email}
            onChangeText={setEmail}
            placeholder="E-Mail"
            placeholderTextColor={Colors.muted}
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            returnKeyType="next"
            style={styles.input}
            accessibilityLabel="E-Mail"
          />
          <TextInput maxFontSizeMultiplier={1.2}
            value={pw}
            onChangeText={setPw}
            placeholder={mode === 'register' ? 'Passwort, mindestens 8 Zeichen' : 'Passwort'}
            placeholderTextColor={Colors.muted}
            secureTextEntry
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            textContentType={mode === 'register' ? 'newPassword' : 'password'}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            style={styles.input}
            accessibilityLabel="Passwort"
          />
          {err && <AppText style={styles.error}>{err}</AppText>}
          <Pressable accessibilityRole="button" disabled={!ready} onPress={() => void submit()} style={[styles.primary, !ready && styles.disabled]}>
            {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>{mode === 'login' ? 'Anmelden' : 'Registrieren'}</AppText>}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setErr(null);
            }}
            style={styles.switch}>
            <AppText muted>
              {mode === 'login' ? 'Noch kein Konto? ' : 'Schon ein Konto? '}
              <AppText style={styles.link}>{mode === 'login' ? 'Registrieren' : 'Anmelden'}</AppText>
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ground },
  content: { flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: Spacing.xl, gap: Spacing.xxl },
  contentWeb: { justifyContent: 'center', alignSelf: 'center', width: '100%', maxWidth: 460 },
  brandRow: { alignSelf: 'flex-start' },
  gapS: { gap: Spacing.m },
  gapM: { gap: Spacing.m },
  brand: { color: Colors.signal, fontFamily: Fonts.bold, letterSpacing: 2 },
  input: { height: Size.input, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.title },
  // inaktiv grau statt blassem Orange (UI Konsistenz Check 9.11.)
  disabled: { backgroundColor: Colors.surface2 },
  error: { color: Colors.signal, fontFamily: Fonts.semibold },
  switch: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  link: { color: Colors.text, fontFamily: Fonts.semibold },
});
