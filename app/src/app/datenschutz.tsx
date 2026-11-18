/** Datenschutzerklärung, Inhalt in src/content/legal.ts. */
import { LegalPage } from '@/components/legal/legal-page';
import { legalDoc } from '@/content/legal';
import { t, useLang } from '@/i18n';

export default function Datenschutz() {
  const lang = useLang();
  return (
    <LegalPage
      doc={legalDoc('datenschutz', lang)}
      description={t('Welche Daten Cumo Drive verarbeitet, wofür und wer sie bekommt. Keine Werbung, kein Tracking.')}
      other={{ href: '/agb', label: t('Nutzungsbedingungen') }}
    />
  );
}
