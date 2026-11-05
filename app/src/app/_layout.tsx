import { Archivo_800ExtraBold, Archivo_900Black } from '@expo-google-fonts/archivo';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { AuthScreen } from '@/components/auth/auth-screen';
import { RideBanner } from '@/components/group/ride-banner';
import { useAuthReady, useSession } from '@/lib/auth';
import { syncLibrary } from '@/lib/library';
import { syncVehicles } from '@/lib/vehicle';
import { AppIntentHandler } from '@/live/intents';
import { Colors } from '@/constants/theme';

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
  });

  // In der App nur mit Konto: Touren, Fahrten und Fahrzeuge liegen im Konto (der Web Planer bleibt offen)
  const session = useSession();
  const authReady = useAuthReady();
  const needAuth = Platform.OS !== 'web';
  const fontsDone = loaded || !!error;

  useEffect(() => {
    if (fontsDone && (!needAuth || authReady)) SplashScreen.hideAsync();
  }, [fontsDone, needAuth, authReady]);

  // nach der Anmeldung Touren und Fahrzeuge mit dem Konto abgleichen
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    void syncLibrary();
    void syncVehicles();
  }, [userId]);

  if (!fontsDone || (needAuth && !authReady)) return null;
  if (needAuth && !session) {
    return (
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <AuthScreen />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.ground } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="planer" options={{ title: 'CUMO DRIVE Planer' }} />
        <Stack.Screen name="t" options={{ title: 'CUMO DRIVE Tour' }} />
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', title: 'Tour holen' }} />
        <Stack.Screen name="karte" options={{ presentation: 'fullScreenModal', title: 'Karte' }} />
        <Stack.Screen
          name="navigation"
          options={{ presentation: 'fullScreenModal', title: 'Navigation', gestureEnabled: false }}
        />
      </Stack>
      <RideBanner />
      <AppIntentHandler />
    </ThemeProvider>
  );
}
