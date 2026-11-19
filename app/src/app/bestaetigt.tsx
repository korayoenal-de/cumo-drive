/**
 * Ziel des Links in der Bestätigungsmail (Koray 18.11.2026: die Mail kam vorher von „Supabase Auth“ und führte ins
 * Leere). Sagt, dass die Adresse bestätigt ist und wie es weitergeht.
 *
 * Ist der Link ungültig oder abgelaufen, hängt Supabase den Grund an die Adresse (#error=...). Dann darf die Seite
 * keinen Erfolg melden (Koray 19.11.: Link einer fehlgeschlagenen Registrierung zeigte „bestätigt“, das Konto gab es
 * aber nicht).
 */
import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { LegalPage } from '@/components/legal/legal-page';
import { t, useLang } from '@/i18n';

const noSubscribe = () => () => {};
/** Supabase hängt bei einem ungültigen Link den Grund an die Adresse */
function linkFailed(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return /[#&?]error(_code|_description)?=/.test(`${window.location.hash}&${window.location.search}`);
}

export default function Bestaetigt() {
  useLang();
  const web = Platform.OS === 'web';
  // Erst im Browser bekannt; beim Vorrendern gilt der Normalfall
  const failed = useSyncExternalStore(noSubscribe, linkFailed, () => false);

  if (failed) {
    return (
      <LegalPage
        doc={{
          title: t('Link nicht mehr gültig'),
          lead: t('Dieser Link ist abgelaufen oder wurde schon benutzt. Melde dich an. Klappt das nicht, registriere dich bitte noch einmal, dann bekommst du eine neue Mail.'),
          blocks: [],
          stand: '',
        }}
        description={t('Der Link zur Bestätigung ist nicht mehr gültig.')}
        other={{ href: '/datenschutz', label: t('Datenschutz') }}
        action={web ? { label: t('Zur Anmeldung'), onPress: () => router.navigate('/login') } : undefined}
      />
    );
  }
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
      action={web ? { label: t('Zum Web Planer'), onPress: () => router.navigate('/planer') } : undefined}
    />
  );
}
