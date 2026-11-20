/**
 * Landingpage auf cumodrive.de (Deutsch), cumodrive.de/en und cumodrive.de/it (Koray 17.11.). Der Inhalt kommt als HTML
 * aus landing-html.ts, damit er dem freigegebenen Entwurf genau entspricht; Englisch und Italienisch über
 * landing-i18n.ts. Jede Sprache hat ihre eigene Adresse mit hreflang, damit Google sie getrennt findet. Der Web Planer
 * liegt hinter Login.
 */
import { useEffect } from 'react';

import { landingHtml, LANDING_CSS } from './landing-html';
import { LANDING_META, type LandingLang } from './landing-i18n';
import { SeoHead } from '@/components/ui/seo-head';
import { chosenLang, setLang } from '@/i18n';

/** Schriften von der eigenen Domain statt Google Fonts (Datenschutz): die @font-face Regeln stehen in +html.tsx */

const SITE = 'https://cumodrive.de';
const LANGS: LandingLang[] = ['de', 'en', 'it'];

export default function Landing({ lang = 'de' }: { lang?: LandingLang }) {
  const meta = LANDING_META[lang];
  useEffect(() => {
    // richtige Aussprache beim Vorlesen
    document.documentElement.lang = lang;
    // Wer die englische oder italienische Seite öffnet, bekommt Login, Registrieren und Planer in dieser Sprache,
    // solange er selbst noch keine Sprache gewählt hat
    if (lang !== 'de' && !chosenLang()) setLang(lang);
  }, [lang]);
  const url = SITE + (meta.path === '/' ? '/' : meta.path);
  return (
    <>
      <SeoHead>
        <title>{meta.title}</title>
        <meta name="description" content={meta.desc} />
        <meta httpEquiv="content-language" content={lang} />
        <meta property="og:title" content="Cumo Drive" />
        <meta property="og:description" content={meta.desc} />
        <meta property="og:image" content={`${SITE}/landing/rundtour.jpg`} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content={meta.locale} />
        {/* eine Adresse je Sprache (Koray 16.11., SEO Strategie), dazu die anderen Sprachen als hreflang */}
        <link rel="canonical" href={url} />
        {LANGS.map((l) => (
          <link key={l} rel="alternate" hrefLang={l} href={SITE + (LANDING_META[l].path === '/' ? '/' : LANDING_META[l].path)} />
        ))}
        <link rel="alternate" hrefLang="x-default" href={`${SITE}/`} />
        {/* die zwei Schnitte der ersten Bildschirmhöhe sofort, alle anderen lädt der Browser bei Bedarf */}
        <link rel="preload" href="/fonts/Archivo_900Black.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Inter_600SemiBold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </SeoHead>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS + '.cd-scroll{position:fixed;inset:0;overflow-y:auto;scroll-behavior:smooth;background:#0B0B0C;-webkit-overflow-scrolling:touch}' }} />
      {/* eigener Scrollbereich: die App Hülle im Browser ist auf Fensterhöhe festgelegt */}
      <div className="cd-scroll" dangerouslySetInnerHTML={{ __html: landingHtml(lang) }} />
    </>
  );
}
