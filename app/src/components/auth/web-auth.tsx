/**
 * Login und Registrieren im Browser (/login, /registrieren). Wer angemeldet ist, landet im Web Planer.
 */
import { Redirect, router } from 'expo-router';
import { SeoHead } from '@/components/ui/seo-head';
import { Platform, View } from 'react-native';

import { AuthScreen } from '@/components/auth/auth-screen';
import { Colors } from '@/constants/theme';
import { useAuthReady, useSession } from '@/lib/auth';
import { t } from '@/i18n';

export function WebAuth({ mode }: { mode: 'login' | 'register' }) {
  const session = useSession();
  const ready = useAuthReady();
  if (ready && session) return <Redirect href="/planer" />;
  return (
    <View style={{ flex: 1, backgroundColor: Colors.ground }}>
      {Platform.OS === 'web' && (
        <SeoHead>
          <title>{mode === 'login' ? t('Login | Cumo Drive') : t('Registrieren | Cumo Drive')}</title>
          <meta name="robots" content="noindex" />
        </SeoHead>
      )}
      <AuthScreen initialMode={mode} onHome={() => router.navigate('/')} />
    </View>
  );
}
