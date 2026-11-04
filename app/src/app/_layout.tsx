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

import { RideBanner } from '@/components/group/ride-banner';
import { Colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.ground,
    card: Colors.ground,
    text: Colors.text,
    border: Colors.surface2,
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

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

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
    </ThemeProvider>
  );
}
