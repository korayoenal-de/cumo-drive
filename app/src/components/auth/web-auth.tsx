/**
 * Login und Registrieren im Browser (/login, /registrieren). Wer angemeldet ist, landet im Web Planer.
 */
import { Redirect, router } from 'expo-router';
import Head from 'expo-router/head';
import { View } from 'react-native';

import { AuthScreen } from '@/components/auth/auth-screen';
import { Colors } from '@/constants/theme';
import { useAuthReady, useSession } from '@/lib/auth';

export function WebAuth({ mode }: { mode: 'login' | 'register' }) {
  const session = useSession();
  const ready = useAuthReady();
  if (ready && session) return <Redirect href="/planer" />;
  return (
    <View style={{ flex: 1, backgroundColor: Colors.ground }}>
      <Head>
        <title>{mode === 'login' ? 'Login | Cumo Drive' : 'Registrieren | Cumo Drive'}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <AuthScreen initialMode={mode} onHome={() => router.navigate('/')} />
    </View>
  );
}
