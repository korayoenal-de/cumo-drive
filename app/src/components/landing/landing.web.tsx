/**
 * Landingpage auf cumodrive.de und drive.rallycumo.de. Der Inhalt kommt als HTML aus landing-html.ts,
 * damit er dem freigegebenen Entwurf genau entspricht. Der Web Planer liegt hinter Login.
 */
import Head from 'expo-router/head';
import { useEffect } from 'react';

import { LANDING_CSS, LANDING_HTML } from './landing-html';

const DESC =
  'Die Navi App für Sportwagen: kurvige Touren, geprüft auf Breite, Belag und Sperrungen, 370 Pässe und 486 Traumstrecken mit Ansage, allein, in der Gruppe oder bei Ausfahrten der Community.';

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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@800;900&family=Inter:wght@400;600;700&display=swap" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS + '.cd-scroll{position:fixed;inset:0;overflow-y:auto;scroll-behavior:smooth;background:#0B0B0C;-webkit-overflow-scrolling:touch}' }} />
      {/* eigener Scrollbereich: die App Hülle im Browser ist auf Fensterhöhe festgelegt */}
      <div className="cd-scroll" dangerouslySetInnerHTML={{ __html: LANDING_HTML }} />
    </>
  );
}
