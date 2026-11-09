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
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

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
import { Colors } from '@/constants/theme';
import { ToastHost } from '@/components/ui/toast';
import { endAllNavActivities } from '@/live/nav-live';
import { StartScreen } from '@/components/ui/start-screen';
import { preloadOnStart } from '@/lib/preload';

SplashScreen.preventAutoHideAsync();

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
  const [loaded, error] = useFonts({
    Archivo_800ExtraBold,
    Archivo_900Black,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // In der App nur mit Konto: Touren, Fahrten und Fahrzeuge liegen im Konto (der Web Planer bleibt offen)
  const session = useSession();
  const authReady = useAuthReady();
  const needAuth = Platform.OS !== 'web';
  // Im Browser nicht auf die Schriften warten: so steht die Landingpage schon im statischen HTML (Suchmaschinen)
  const fontsDone = loaded || !!error || Platform.OS === 'web';

  // Startanimation (nur in der App): sobald die Schriften da sind, löst sie den nativen Splash ab
  const [intro, setIntro] = useState(Platform.OS !== 'web');
  const introDone = useCallback(() => setIntro(false), []);
  const appReady = fontsDone && (!needAuth || authReady);
  useEffect(() => {
    if (intro ? fontsDone : appReady) SplashScreen.hideAsync();
  }, [intro, fontsDone, appReady]);
  useEffect(() => {
    preloadOnStart();
  }, []);

  // Verwaiste Live Activity aus einem früheren Start aufräumen (läuft eine Navigation, startet sie neu)
  useEffect(() => {
    endAllNavActivities();
    // Summen der Highlight Bewertungen für den lernenden Pegel
    void loadHighlightFeedback();
  }, []);

  // nach der Anmeldung Touren und Fahrzeuge mit dem Konto abgleichen
  const userId = session?.user.id;
  const profile = useMyProfile(userId);
  useEffect(() => {
    if (!userId) return;
    void syncLibrary();
    void syncVehicles();
  }, [userId]);

  if (!fontsDone) return null;
  const withIntro = (content: ReactNode) => (
    <>
      {content}
      {intro && <StartScreen ready={appReady} onDone={introDone} />}
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
        <Stack.Screen name="planer" options={{ title: 'CUMO DRIVE Planer' }} />
        <Stack.Screen name="login" options={{ title: 'Login' }} />
        <Stack.Screen name="registrieren" options={{ title: 'Registrieren' }} />
        <Stack.Screen name="t" options={{ title: 'CUMO DRIVE Tour' }} />
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', title: 'Tour holen' }} />
        <Stack.Screen name="karte" options={{ presentation: 'fullScreenModal', title: 'Karte' }} />
        <Stack.Screen
          name="navigation"
          options={{ presentation: 'fullScreenModal', title: 'Navigation', gestureEnabled: false }}
        />
        <Stack.Screen name="mitgliedschaft" options={{ presentation: 'fullScreenModal', title: 'Mitgliedschaft' }} />
      </Stack>
      </EntitlementGate>
      <RideBanner />
      <ToastHost />
      <AppIntentHandler />
      <CarPlaySync />
    </ThemeProvider>
  );
}
