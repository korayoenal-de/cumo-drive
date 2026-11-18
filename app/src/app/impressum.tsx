/** Impressum von CUMO DRIVE (Koray 18.11.2026: eigenes Impressum statt Verweis auf den Club), Inhalt in src/content/legal.ts. */
import { LegalPage } from '@/components/legal/legal-page';
import { legalDoc } from '@/content/legal';
import { t, useLang } from '@/i18n';

export default function Impressum() {
  const lang = useLang();
  return (
    <LegalPage
      doc={legalDoc('impressum', lang)}
      description={t('Impressum von Cumo Drive: Anbieter, Anschrift und Kontakt.')}
      other={{ href: '/datenschutz', label: t('Datenschutz') }}
    />
  );
}
