/**
 * Ziel des Links aus der Mail „Passwort vergessen" (Koray 19.11.2026): hier setzt man das neue Passwort.
 * Anders als /login leitet die Seite Angemeldete nicht weiter, sonst käme man mit dem Link nie ans Formular.
 */
import { router } from 'expo-router';
import { Platform, View } from 'react-native';

import { AuthScreen } from '@/components/auth/auth-screen';
import { SeoHead } from '@/components/ui/seo-head';
import { Colors } from '@/constants/theme';
import { t } from '@/i18n';

export default function Passwort() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.ground }}>
      {Platform.OS === 'web' && (
        <SeoHead>
          <title>{t('Neues Passwort | Cumo Drive')}</title>
          <meta name="robots" content="noindex" />
        </SeoHead>
      )}
      <AuthScreen initialMode="newpw" onHome={() => router.navigate('/')} />
    </View>
  );
}
