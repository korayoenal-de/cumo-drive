/**
 * Landingpage auf cumodrive.de und drive.rallycumo.de. Der Inhalt kommt als HTML aus landing-html.ts,
 * damit er dem freigegebenen Entwurf genau entspricht. Der Web Planer liegt hinter Login.
 */
import Head from 'expo-router/head';
import { useEffect } from 'react';

import { LANDING_CSS, LANDING_HTML } from './landing-html';

const DESC =
  'Die Navi App für Sportwagen: kurvige Touren, geprüft auf Breite, Belag und Sperrungen, 363 Pässe und 437 Traumstrecken mit Ansage, allein, in der Gruppe oder bei Ausfahrten der Community.';

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

export default function Landing() {
  // deutsche Seite: richtige Aussprache beim Vorlesen
  useEffect(() => {
    document.documentElement.lang = 'de';
  }, []);
  return (
    <>
      <Head>
        <title>Cumo Drive | Die Navi App für Sportwagen</title>
        <meta name="description" content={DESC} />
        <meta property="og:title" content="Cumo Drive" />
        <meta property="og:description" content={DESC} />
        <meta property="og:image" content="https://drive.rallycumo.de/landing/rundtour.jpg" />
        <link rel="preload" href="/fonts/Archivo_900Black.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Inter_400Regular.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: FONT_FACES + LANDING_CSS + '.cd-scroll{position:fixed;inset:0;overflow-y:auto;scroll-behavior:smooth;background:#0B0B0C;-webkit-overflow-scrolling:touch}' }} />
      {/* eigener Scrollbereich: die App Hülle im Browser ist auf Fensterhöhe festgelegt */}
      <div className="cd-scroll" dangerouslySetInnerHTML={{ __html: LANDING_HTML }} />
    </>
  );
}
