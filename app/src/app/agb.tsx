/** Nutzungsbedingungen (Entwurf, anwaltliche Prüfung ausstehend), Inhalt in src/content/legal.ts. */
import { LegalPage } from '@/components/legal/legal-page';
import { AGB } from '@/content/legal';

export default function Agb() {
  return (
    <LegalPage
      doc={AGB}
      description="Nutzungsbedingungen von Cumo Drive: Leistung, Abos über Apple, Sicherheit, Rechte an Inhalten und Daten."
      other={{ href: '/datenschutz', label: 'Datenschutz' }}
    />
  );
}
