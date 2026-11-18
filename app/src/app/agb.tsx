/** Nutzungsbedingungen, Inhalt in src/content/legal.ts. */
import { LegalPage } from '@/components/legal/legal-page';
import { legalDoc } from '@/content/legal';
import { t, useLang } from '@/i18n';

export default function Agb() {
  const lang = useLang();
  return (
    <LegalPage
      doc={legalDoc('agb', lang)}
      description={t('Nutzungsbedingungen von Cumo Drive: Leistung, Abos über Apple, Sicherheit, Rechte an Inhalten und Daten.')}
      other={{ href: '/datenschutz', label: t('Datenschutz') }}
    />
  );
}
