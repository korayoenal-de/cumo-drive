/**
 * Ziel des Links in der Bestätigungsmail (Koray 18.11.2026: die Mail kam vorher von „Supabase Auth“ und führte ins
 * Leere). Sagt, dass die Adresse bestätigt ist und wie es weitergeht.
 *
 * Seit 19.11. bestätigt die Seite selbst: der Link in der Mail zeigt auf unsere Domain und trägt nur einen kurzen
 * Code (token_hash), die Seite löst ihn bei Supabase ein. Vorher zeigte der Link sichtbar auf supabase.co, und die
 * Mail landete bei iCloud im Spam (SPF, DKIM und DMARC waren bestanden). Mails der alten Vorlage funktionieren weiter:
 * dort hat Supabase schon bestätigt und hängt bei einem ungültigen Link den Grund an die Adresse (#error=...).
 * In beiden Fällen darf die Seite nur dann Erfolg melden, wenn es einer war.
 */
import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { LegalPage } from '@/components/legal/legal-page';
import { t, useLang } from '@/i18n';
import { supabase } from '@/lib/supabase';

type State = 'pending' | 'ok' | 'failed';

const onWeb = () => Platform.OS === 'web' && typeof window !== 'undefined';

/** Code aus der Adresse, nur im Browser */
function tokenFromUrl(): { hash: string; type: 'signup' | 'email' } | null {
  if (!onWeb()) return null;
  const q = new URLSearchParams(window.location.search);
  const hash = q.get('token_hash');
  if (!hash) return null;
  return { hash, type: q.get('type') === 'signup' ? 'signup' : 'email' };
}

/** Alte Vorlage: Supabase hängt bei einem ungültigen Link den Grund an die Adresse */
function linkFailed(): boolean {
  if (!onWeb()) return false;
  return /[#&?]error(_code|_description)?=/.test(`${window.location.hash}&${window.location.search}`);
}

let state: State | null = null;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  for (const l of listeners) l();
}

/** Einmal je Seitenaufruf: den Code einlösen. Danach ist man im Browser auch gleich angemeldet. */
function start() {
  if (state !== null) return;
  const token = tokenFromUrl();
  if (!token) {
    state = linkFailed() ? 'failed' : 'ok';
    return;
  }
  state = 'pending';
  supabase.auth
    .verifyOtp({ token_hash: token.hash, type: token.type })
    .then(({ error }) => {
      // Code aus der Adresse nehmen: er gilt nur einmal, neu laden soll keinen Fehler zeigen
      if (!error) window.history.replaceState(null, '', window.location.pathname);
      set(error ? 'failed' : 'ok');
    })
    .catch(() => set('failed'));
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function snapshot(): State {
  start();
  return state ?? 'ok';
}

export default function Bestaetigt() {
  useLang();
  const web = Platform.OS === 'web';
  // Erst im Browser bekannt. Vorgerendert wird der neutrale Stand, damit nie kurz ein Erfolg aufblitzt, der keiner ist
  const status = useSyncExternalStore(subscribe, snapshot, () => 'pending' as State);
  const other = { href: '/datenschutz' as const, label: t('Datenschutz') };

  if (status === 'pending') {
    return (
      <LegalPage
        doc={{ title: t('Einen Moment'), lead: t('Wir bestätigen gerade deine E Mail Adresse.'), blocks: [], stand: '' }}
        description={t('Deine E Mail Adresse für Cumo Drive wird bestätigt.')}
        other={other}
      />
    );
  }
  if (status === 'failed') {
    return (
      <LegalPage
        doc={{
          title: t('Link nicht mehr gültig'),
          lead: t('Dieser Link ist abgelaufen oder wurde schon benutzt. Melde dich an. Klappt das nicht, registriere dich bitte noch einmal, dann bekommst du eine neue Mail.'),
          blocks: [],
          stand: '',
        }}
        description={t('Der Link zur Bestätigung ist nicht mehr gültig.')}
        other={other}
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
      other={other}
      // Am Rechner geht es direkt weiter in den Web Planer (Koray 19.11.); in der App gibt es diese Seite nur als Ziel der Mail
      action={web ? { label: t('Zum Web Planer'), onPress: () => router.navigate('/planer') } : undefined}
    />
  );
}
