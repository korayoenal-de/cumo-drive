/**
 * Landingpage auf cumodrive.de (Deutsch), cumodrive.de/en und cumodrive.de/it (Koray 17.11.). Der Inhalt kommt als HTML
 * aus landing-html.ts, damit er dem freigegebenen Entwurf genau entspricht; Englisch und Italienisch über
 * landing-i18n.ts. Jede Sprache hat ihre eigene Adresse mit hreflang, damit Google sie getrennt findet. Der Web Planer
 * liegt hinter Login.
 */
import Head from 'expo-router/head';
import { useEffect } from 'react';

import { landingHtml, LANDING_CSS } from './landing-html';
import { LANDING_META, type LandingLang } from './landing-i18n';
import { chosenLang, setLang } from '@/i18n';

/** Schriften von der eigenen Domain statt Google Fonts (Datenschutz, keine Übertragung der IP an Dritte) */
const FONT_FACES = [
  ['Archivo', 800, 'Archivo_800ExtraBold'],
  ['Archivo', 900, 'Archivo_900Black'],
  ['Inter', 400, 'Inter_400Regular'],
  ['Inter', 600, 'Inter_600SemiBold'],
  ['Inter', 700, 'Inter_700Bold'],
]
  .map(([f, w, file]) => `@font-face{font-family:${f};font-weight:${w};font-style:normal;font-display:swap;src:url(/fonts/${file}.ttf) format("truetype")}`)
  .join('');

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
      <Head>
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
        <link rel="preload" href="/fonts/Archivo_900Black.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Inter_400Regular.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: FONT_FACES + LANDING_CSS + '.cd-scroll{position:fixed;inset:0;overflow-y:auto;scroll-behavior:smooth;background:#0B0B0C;-webkit-overflow-scrolling:touch}' }} />
      {/* eigener Scrollbereich: die App Hülle im Browser ist auf Fensterhöhe festgelegt */}
      <div className="cd-scroll" dangerouslySetInnerHTML={{ __html: landingHtml(lang) }} />
    </>
  );
}
