/**
 * HTML Rahmen der Webseiten (nur Web, beim Vorrendern). Wie der Standard von Expo, dazu zwei Dinge (17.11.):
 *
 * 1. lang="de": die Seiten werden auf Deutsch vorgerendert (i18n/index.ts, deviceLang ohne window).
 * 2. Sprache vor dem Start: Wer die Seite auf Englisch oder Italienisch sieht (Wahl in den Einstellungen oder
 *    Browsersprache), bekommt sie frisch gezeichnet statt das deutsche HTML zu übernehmen. Sonst meldete React
 *    Fehler 418 und zeigte kurz Deutsch. Expo setzt am Ende der Seite __EXPO_ROUTER_HYDRATE__ = true; das Skript
 *    hier legt den Wert vorher fest, die spätere Zuweisung ändert ihn dann nicht mehr.
 *    Gleiche Regel wie deviceLang und store.web.ts (Schlüssel cumo.sprache.v1). Titel, Beschreibung und Verweise aus dem
 *    vorgerenderten Kopf nimmt das Skript dann heraus, bevor die App startet; React setzt sie neu (sonst doppelt).
 */
import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Schriften im Web (Performance Messung 20.11.2026): vorher lud jede Seite sieben TTF Dateien über expo-font plus drei
 * der Landingpage doppelt, zusammen 3,4 MB, alle per preload. Jetzt eine Datei je Schnitt als WOFF2 (Latin und
 * Latin Extended, je etwa 50 KB, aus scripts/web-fonts.sh), ohne preload: der Browser lädt nur, was die Seite zeigt.
 * Zwei Namen je Datei: die der App (Inter_700Bold, aus Fonts in theme.ts) und die der Landingpage (Inter 700).
 */
const FACES: [string, string, number][] = [
  ['Archivo_800ExtraBold', 'Archivo', 800],
  ['Archivo_900Black', 'Archivo', 900],
  ['Inter_400Regular', 'Inter', 400],
  ['Inter_500Medium', 'Inter', 500],
  ['Inter_600SemiBold', 'Inter', 600],
  ['Inter_700Bold', 'Inter', 700],
  ['Inter_800ExtraBold', 'Inter', 800],
];
const FONT_CSS = FACES.map(([file, family, weight]) => {
  const src = `src:url(/fonts/${file}.woff2) format("woff2");font-display:swap;font-style:normal`;
  return `@font-face{font-family:${file};${src}}@font-face{font-family:${family};font-weight:${weight};${src}}`;
}).join('');

const LANG_SCRIPT = `(function(){try{var c=null;try{c=localStorage.getItem('cumo.sprache.v1')}catch(e){}
var l=c||(navigator.language||'de');var de=String(l).toLowerCase().slice(0,2)==='de';
if(!de){document.documentElement.lang=String(l).slice(0,2);
Object.defineProperty(globalThis,'__EXPO_ROUTER_HYDRATE__',{configurable:true,get:function(){return false},set:function(){}});
document.addEventListener('readystatechange',function(){if(document.readyState!=='interactive')return;
var q='head title,head meta[name=description],head meta[property^="og:"],head meta[http-equiv=content-language],head link[rel=canonical],head link[rel=alternate]';
document.querySelectorAll(q).forEach(function(n){n.remove()});});}}catch(e){}})();`;

export default function Root({ children }: PropsWithChildren) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } = useServerDocumentContext();
  return (
    <html {...htmlAttributes} lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <script dangerouslySetInnerHTML={{ __html: LANG_SCRIPT }} />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: FONT_CSS }} />
        {/* Favicon unter eigenen Namen mit Version (Koray 19.11.): Browser behalten ein altes /favicon.ico sehr lange,
            ein neuer Name wird sofort geladen. Bei einem neuen Logo die Version im Dateinamen erhöhen. */}
        <link rel="icon" type="image/png" sizes="32x32" href="/cumo-icon-32-v2.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/cumo-icon-192-v2.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/cumo-icon-180-v2.png" />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
