/**
 * Kopf der Seite (Titel, Beschreibung, canonical, hreflang), der auch im vorgerenderten HTML steht (Koray 17.11., SEO).
 * expo-router/head zeigte seine Tags nur für den Bildschirm im Fokus; beim Vorrendern galt keiner als im Fokus, so
 * fehlten Titel und Beschreibung im HTML und kamen erst mit JavaScript. React 19 hebt title, meta und link von selbst
 * in den Kopf, beim Vorrendern wie im Browser, und nimmt sie beim Verlassen der Seite wieder heraus. Nur im Web nutzen.
 */
import type { ReactNode } from 'react';

export function SeoHead({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
