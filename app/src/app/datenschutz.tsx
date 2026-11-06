/** Datenschutzerklärung (Entwurf, anwaltliche Prüfung ausstehend), Inhalt in src/content/legal.ts. */
import { LegalPage } from '@/components/legal/legal-page';
import { DATENSCHUTZ } from '@/content/legal';

export default function Datenschutz() {
  return (
    <LegalPage
      doc={DATENSCHUTZ}
      description="Welche Daten Cumo Drive verarbeitet, wofür und wer sie bekommt. Keine Werbung, kein Tracking."
      other={{ href: '/agb', label: 'Nutzungsbedingungen' }}
    />
  );
}
