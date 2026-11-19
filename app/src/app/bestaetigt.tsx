/**
 * Ziel des Links in der Bestätigungsmail (Koray 18.11.2026: die Mail kam vorher von „Supabase Auth“ und führte ins
 * Leere). Sagt nur, dass die Adresse bestätigt ist und wie es weitergeht; angemeldet wird in der App.
 */
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { LegalPage } from '@/components/legal/legal-page';
import { t, useLang } from '@/i18n';

export default function Bestaetigt() {
  useLang();
  return (
    <LegalPage
      doc={{
        title: t('E Mail bestätigt'),
        lead: t('Deine E Mail Adresse ist bestätigt. Öffne jetzt CUMO DRIVE auf deinem iPhone und melde dich mit deiner E Mail und deinem Passwort an.'),
        blocks: [],
        stand: '',
      }}
      description={t('Deine E Mail Adresse für Cumo Drive ist bestätigt.')}
      other={{ href: '/datenschutz', label: t('Datenschutz') }}
      // Am Rechner geht es direkt weiter in den Web Planer (Koray 19.11.); in der App gibt es diese Seite nur als Ziel der Mail
      action={Platform.OS === 'web' ? { label: t('Zum Web Planer'), onPress: () => router.navigate('/planer') } : undefined}
    />
  );
}
