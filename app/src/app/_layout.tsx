/**
 * Wurzel der App (Expo Router): lädt Schriften, startet Abgleich und Konto, legt die Stapel Navigation mit allen Vollbild Seiten fest.
 */
// Schnitte einzeln importieren: der Sammelimport zieht alle 36 Inter und Archivo Dateien (etwa 8 MB) ins Paket
import { Archivo_800ExtraBold } from '@expo-google-fonts/archivo/800ExtraBold';
import { Archivo_900Black } from '@expo-google-fonts/archivo/900Black';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { useFonts } from 'expo-font';

import { loadHighlightFeedback } from '@/lib/highlight-feedback';
import { DarkTheme, Stack, ThemeProvider, usePathname, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/ui/tap';

import { AuthScreen } from '@/components/auth/auth-screen';
import { EntitlementGate } from '@/components/paywall/entitlement-gate';
import { NameScreen } from '@/components/auth/name-screen';
import { RideBanner } from '@/components/group/ride-banner';
import { useAuthReady, useSession } from '@/lib/auth';
import { syncLibrary } from '@/lib/library';
import { useMyProfile } from '@/lib/profile';
import { syncVehicles } from '@/lib/vehicle';
import { CarPlaySync } from '@/live/carplay-sync';
import { AppIntentHandler } from '@/live/intents';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';
import { FlyHost } from '@/components/ui/fly-host';
import { ToastHost } from '@/components/ui/toast';
import { PaywallHost } from '@/components/paywall/paywall-sheet';
import { endAllNavActivities } from '@/live/nav-live';
import { StartScreen } from '@/components/ui/start-screen';
import { preloadOnStart } from '@/lib/preload';
import { PushHandler } from '@/lib/push';
import { startRoutingAuth } from '@/lib/routing-auth';
import { installErrorReporting, reportError, setErrorScreen } from '@/lib/error-report';
import { AppText } from '@/components/ui/text';
import { loadLang , t } from '@/i18n';

SplashScreen.preventAutoHideAsync();
// Absturzberichte so früh wie möglich (lib/error-report)
installErrorReporting();

/** So lange bleibt der Start ruhig, bis die grauen Berge gewachsen sind (der letzte steht nach etwa 1 s) */
const START_QUIET_MS = 1100;

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.ground,
    card: Colors.ground,
    text: Colors.text,
    // Keine Trennlinien unter Headern und Leisten
    border: Colors.ground,
    primary: Colors.signal,
  },
};

export default function RootLayout() {
  // Im Web kommen die Schriften als WOFF2 über +html.tsx (nur was die Seite zeigt); expo-font hängte dort sieben TTF
  // Dateien mit preload in jede Seite (Performance Messung 20.11.2026)
  const [loaded, error] = useFonts(
    Platform.OS === 'web'
      ? {}
      : {
          Archivo_800ExtraBold,
          Archivo_900Black,
          Inter_400Regular,
          Inter_500Medium,
          Inter_600SemiBold,
          Inter_700Bold,
          Inter_800ExtraBold,
        },
  );

  // In der App nur mit Konto: Touren, Fahrten und Fahrzeuge liegen im Konto (der Web Planer bleibt offen)
  const session = useSession();
  const authReady = useAuthReady();
  const needAuth = Platform.OS !== 'web';
  // Im Browser nicht auf die Schriften warten: so steht die Landingpage schon im statischen HTML (Suchmaschinen)
  const fontsDone = loaded || !!error || Platform.OS === 'web';

  // Startanimation (nur in der App): sobald die Schriften da sind, löst sie den nativen Splash ab
  const [intro, setIntro] = useState(Platform.OS !== 'web');
  const introDone = useCallback(() => setIntro(false), []);
  // Die App unter dem Startscreen erst aufbauen, wenn die grauen Berge stehen (Koray 16.11.: das Wachsen hakte,
  // weil Karte, Abgleich und Vorladen genau in der ersten Sekunde Haupt und JS Thread belegten). Danach bleiben
  // gut drei Sekunden, bis die Animation durch ist.
  const [settled, setSettled] = useState(Platform.OS === 'web');
  useEffect(() => {
    if (settled) return;
    const id = setTimeout(() => setSettled(true), START_QUIET_MS);
    return () => clearTimeout(id);
  }, [settled]);
  const appReady = fontsDone && (!needAuth || authReady);
  useEffect(() => {
    if (intro ? fontsDone : appReady) SplashScreen.hideAsync();
  }, [intro, fontsDone, appReady]);
  const pathname = usePathname();
  useEffect(() => setErrorScreen(pathname), [pathname]);
  useEffect(() => {
    startRoutingAuth();
    void loadLang();
  }, []);

  // Vorladen, Live Activity aufräumen und Highlight Bewertungen erst nach dem Wachsen der Berge
  useEffect(() => {
    if (!settled) return;
    preloadOnStart();
    // Verwaiste Live Activity aus einem früheren Start aufräumen (läuft eine Navigation, startet sie neu)
    endAllNavActivities();
    // Summen der Highlight Bewertungen für den lernenden Pegel
    void loadHighlightFeedback();
  }, [settled]);

  // nach der Anmeldung Touren und Fahrzeuge mit dem Konto abgleichen
  const userId = session?.user.id;
  const profile = useMyProfile(userId);
  useEffect(() => {
    if (!userId || !settled) return;
    void syncLibrary();
    void syncVehicles();
  }, [userId, settled]);

  if (!fontsDone) return null;
  const withIntro = (content: ReactNode) => (
    <>
      {settled || !intro ? content : null}
      {intro && <StartScreen ready={appReady && settled} onDone={introDone} />}
    </>
  );
  if (needAuth && !authReady) return withIntro(null);
  if (needAuth && !session) {
    return withIntro(
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <AuthScreen />
      </ThemeProvider>
    );
  }
  // einmalig nach dem Namen fragen, unter dem einen andere einladen
  if (needAuth && profile && !profile.displayName) {
    return withIntro(
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <NameScreen />
      </ThemeProvider>
    );
  }

  return withIntro(
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <EntitlementGate>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.ground } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="planer" options={{ title: t('CUMO DRIVE Planer') }} />
        <Stack.Screen name="en" options={{ title: 'Cumo Drive' }} />
        <Stack.Screen name="it" options={{ title: 'Cumo Drive' }} />
        <Stack.Screen name="login" options={{ title: t('Login') }} />
        <Stack.Screen name="registrieren" options={{ title: t('Registrieren') }} />
        <Stack.Screen name="t" options={{ title: t('CUMO DRIVE Tour') }} />
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', title: t('Tour holen') }} />
        <Stack.Screen name="karte" options={{ presentation: 'fullScreenModal', title: t('Karte') }} />
        <Stack.Screen
          name="navigation"
          options={{ presentation: 'fullScreenModal', title: t('Navigation'), gestureEnabled: false }}
        />
        {/* Einstellungen unterwegs als Blatt über der Navigation, die darunter weiterläuft (Koray 15.11.) */}
        <Stack.Screen name="menu" options={{ presentation: 'modal', title: t('Einstellungen') }} />
        {/* Tour anpassen unterwegs: der Planer über der laufenden Navigation (Koray 15.11.) */}
        <Stack.Screen name="anpassen" options={{ presentation: 'fullScreenModal', title: t('Tour anpassen'), gestureEnabled: false }} />
        <Stack.Screen name="profil" options={{ title: t('Profil') }} />
        <Stack.Screen name="garage" options={{ title: t('Garage') }} />
        <Stack.Screen name="fahrt/[id]" options={{ title: t('Fahrt') }} />
        <Stack.Screen name="ansagen" options={{ title: t('Fahren') }} />
        <Stack.Screen name="mitgliedschaft" options={{ presentation: 'fullScreenModal', title: t('Mitgliedschaft') }} />
        <Stack.Screen name="ausfahrt/[id]" options={{ title: t('Ausfahrt') }} />
        <Stack.Screen name="ausfahrt/chat" options={{ title: t('Chat der Ausfahrt') }} />
        <Stack.Screen name="nachrichten/index" options={{ title: t('Nachrichten') }} />
        <Stack.Screen name="nachrichten/[id]" options={{ title: t('Unterhaltung') }} />
        <Stack.Screen name="ausfahrt/neu" options={{ presentation: 'fullScreenModal', title: t('Ausfahrt anlegen') }} />
      </Stack>
      </EntitlementGate>
      <RideBanner />
      <ToastHost />
      <PaywallHost />
      <FlyHost />
      <AppIntentHandler />
      <CarPlaySync />
      <PushHandler userId={userId} />
    </ThemeProvider>
  );
}

/**
 * Fehlergrenze für alle Bildschirme (Koray 17.11., Absturzberichte): statt eines weißen Bildschirms eine ruhige Seite
 * mit Neu laden. Der Fehler geht an app_errors.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => reportError(error, { extra: { boundary: true } }), [error]);
  return (
    <View style={errStyles.wrap}>
      <AppText variant="display" style={errStyles.title}>{t('Da ist etwas schiefgelaufen')}</AppText>
      <AppText muted style={errStyles.text}>{t('Wir haben den Fehler automatisch erhalten und kümmern uns darum. Deine Touren sind sicher.')}</AppText>
      <Pressable accessibilityRole="button" onPress={() => void retry()} style={errStyles.button}>
        <AppText style={errStyles.buttonText}>{t('Neu laden')}</AppText>
      </Pressable>
    </View>
  );
}

const errStyles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.ground, justifyContent: 'center', padding: Spacing.l, gap: Spacing.m },
  title: { color: Colors.text },
  text: { fontSize: Type.body },
  button: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.s },
  buttonText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.body },
});
