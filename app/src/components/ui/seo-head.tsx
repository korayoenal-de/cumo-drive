/**
 * Kopf der Seite (Titel, Beschreibung, Sprachverweise), der auch im vorgerenderten HTML steht (Koray 17.11., SEO).
 * expo-router/head zeigt seine Tags nur für den Bildschirm im Fokus; beim Vorrendern gilt keiner als im Fokus, so
 * fehlten Titel und Beschreibung im HTML und kamen erst mit JavaScript. Beim Vorrendern deshalb direkt über Helmet
 * (dieselbe Bibliothek, die expo-router mitbringt und deren Provider das Vorrendern einsetzt), im Browser wie bisher.
 */
import Head from 'expo-router/head';
import type { ReactNode } from 'react';

import { Helmet } from '../../../node_modules/expo-router/vendor/react-helmet-async/lib';

export function SeoHead({ children }: { children: ReactNode }) {
  if (typeof window === 'undefined') return <Helmet>{children}</Helmet>;
  return <Head>{children}</Head>;
}
