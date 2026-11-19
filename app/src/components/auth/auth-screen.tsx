/**
 * Anmeldung beim Start: Die App ist nur mit Konto nutzbar. So liegen Touren, Fahrten und Fahrzeuge
 * von Anfang an im Konto und sind in App und Web Planer dieselben.
 */
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/ui/tap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '@/components/ui/text-field';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type, Size } from '@/constants/theme';
import { ConsentRow, LegalLinks } from '@/components/auth/consent-row';
import { NameField, useNameCheck } from '@/components/auth/name-field';
import { router } from 'expo-router';
import { requestPasswordReset, ResetLinkInvalid, setNewPassword, signIn, SignUpPending } from '@/lib/auth';
import { signUpWithName } from '@/lib/profile';
import { t } from '@/i18n';

/** Im Browser (/login, /registrieren) schmal und mittig, mit Logo zurück zur Startseite. */
const WEB = Platform.OS === 'web';

/**
 * login und register wie bisher. reset: Passwort vergessen, nur die Adresse, schickt den Link. newpw: Ziel des Links
 * (Seite /passwort), nur das neue Passwort (Koray 19.11.2026).
 */
type Mode = 'login' | 'register' | 'reset' | 'newpw';

/** Code aus dem Link der Mail, nur im Browser */
function resetToken(): string | null {
  if (!WEB || typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('token_hash');
}

export function AuthScreen({ initialMode = 'login', onHome }: { initialMode?: Mode; onHome?: () => void } = {}) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Erfolg nach dem Registrieren: grün, und das Formular steht schon auf Anmelden
  const [done, setDone] = useState<string | null>(null);
  const [name, setName] = useState('');
  const check = useNameCheck(mode === 'register' ? name : '');
  // Opt in (Koray 17.11.): Nutzungsbedingungen und Datenschutz sind Pflicht, Neuigkeiten freiwillig und aus
  const [terms, setTerms] = useState(false);
  const [news, setNews] = useState(false);
  const needEmail = mode !== 'newpw';
  const needPw = mode !== 'reset';
  const ready = (!needEmail || !!email.trim()) && (!needPw || pw.length > 0) && !busy && (mode !== 'register' || (check.state === 'frei' && terms));

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setErr(null);
    setDone(null);
    try {
      if (mode === 'login') {
        await signIn(email, pw);
        // Die Seite /passwort leitet Angemeldete nicht selbst weiter, anders als /login
        if (WEB && initialMode === 'newpw') router.replace('/planer');
      } else if (mode === 'reset') {
        await requestPasswordReset(email);
        setDone(t('Wenn es zu dieser Adresse ein Konto gibt, ist eine Mail mit dem Link unterwegs. Schau auch im Spam Ordner nach.'));
        setMode('login');
      } else if (mode === 'newpw') {
        await setNewPassword(resetToken(), pw);
        setDone(t('Dein Passwort ist geändert. Melde dich jetzt damit an, hier oder in der App.'));
        setMode('login');
        setPw('');
      } else await signUpWithName(email, pw, name, { terms: true, news });
    } catch (e) {
      if (e instanceof ResetLinkInvalid) {
        setErr(t('Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere bitte einen neuen an.'));
        setMode('reset');
        setPw('');
        return;
      }
      if (e instanceof SignUpPending) {
        setDone(t('Geschafft. Öffne die Bestätigungsmail und melde dich danach hier an.'));
        setMode('login');
        setPw('');
      } else setErr(e instanceof Error ? e.message : t('Das hat nicht geklappt.'));
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
          <AppText variant="display">
            {mode === 'login' ? t('Willkommen\nzurück') : mode === 'register' ? t('Konto\nanlegen') : mode === 'reset' ? t('Passwort\nvergessen') : t('Neues\nPasswort')}
          </AppText>
          <AppText muted>
            {mode === 'reset'
              ? t('Gib deine E Mail Adresse ein. Wir schicken dir einen Link, mit dem du ein neues Passwort setzt.')
              : mode === 'newpw'
                ? t('Wähle ein neues Passwort für dein Konto. Danach meldest du dich damit an.')
                : t('Kurvige Touren planen, in der Gruppe fahren und jede Fahrt festhalten. Deine Touren liegen in deinem Konto, in der App und im Web Planer.')}
          </AppText>
        </View>

        <View style={styles.gapM}>
          {mode === 'register' && <NameField value={name} onChange={setName} check={check} />}
          {needEmail && <TextField maxFontSizeMultiplier={1.2}
            value={email}
            onChangeText={setEmail}
            placeholder={t('E-Mail')}
            placeholderTextColor={Colors.muted}
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            returnKeyType={needPw ? 'next' : 'go'}
            onSubmitEditing={needPw ? undefined : () => void submit()}
            style={styles.input}
            accessibilityLabel={t('E-Mail')}
          />}
          {needPw && <TextField maxFontSizeMultiplier={1.2}
            value={pw}
            onChangeText={setPw}
            placeholder={mode === 'register' ? t('Passwort, mindestens 8 Zeichen') : mode === 'newpw' ? t('Neues Passwort, mindestens 8 Zeichen') : t('Passwort')}
            placeholderTextColor={Colors.muted}
            secureTextEntry
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            style={styles.input}
            accessibilityLabel={mode === 'newpw' ? t('Neues Passwort') : t('Passwort')}
          />}
          {mode === 'login' && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMode('reset');
                setErr(null);
                setDone(null);
              }}
              style={styles.forgot}>
              <AppText style={styles.link}>{t('Passwort vergessen?')}</AppText>
            </Pressable>
          )}
          {mode === 'register' && (
            <View style={styles.consent}>
              <ConsentRow checked={terms} onChange={setTerms} title={t('Ich stimme den Nutzungsbedingungen zu und habe den Datenschutz gelesen.')} />
              <LegalLinks />
              <ConsentRow
                checked={news}
                onChange={setNews}
                title={t('Neuigkeiten per E Mail')}
                hint={t('Neue Funktionen, Strecken und Ausfahrten. Freiwillig, abbestellen geht jederzeit in den Einstellungen.')}
              />
            </View>
          )}
          {err && <AppText style={styles.error}>{err}</AppText>}
          {done && (
            <AppText accessibilityLiveRegion="polite" style={styles.done}>
              {done}
            </AppText>
          )}
          <Pressable accessibilityRole="button" disabled={!ready} onPress={() => void submit()} style={[styles.primary, !ready && styles.disabled]}>
            {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>{mode === 'login' ? t('Anmelden') : mode === 'register' ? t('Registrieren') : mode === 'reset' ? t('Link senden') : t('Passwort speichern')}</AppText>}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setErr(null);
            }}
            style={styles.switch}>
            <AppText muted>
              {mode === 'login' ? t('Noch kein Konto? ') : mode === 'register' ? t('Schon ein Konto? ') : ''}
              <AppText style={styles.link}>{mode === 'login' ? t('Registrieren') : mode === 'register' ? t('Anmelden') : t('Zurück zur Anmeldung')}</AppText>
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
  consent: { gap: Spacing.xs, paddingVertical: Spacing.xs },
  brand: { color: Colors.signal, fontFamily: Fonts.bold, letterSpacing: 2 },
  input: { height: Size.input, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.title },
  // inaktiv grau statt blassem Orange (UI Konsistenz Check 9.11.)
  disabled: { backgroundColor: Colors.surface2 },
  error: { color: Colors.danger, fontFamily: Fonts.semibold },
  done: { color: Colors.good, fontFamily: Fonts.semibold },
  forgot: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  switch: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  link: { color: Colors.text, fontFamily: Fonts.semibold },
});
