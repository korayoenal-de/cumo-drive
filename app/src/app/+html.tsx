/**
 * HTML Rahmen der Webseiten (nur Web, beim Vorrendern). Wie der Standard von Expo, dazu zwei Dinge (17.11.):
 *
 * 1. lang="de": die Seiten werden auf Deutsch vorgerendert (i18n/index.ts, deviceLang ohne window).
 * 2. Sprache vor dem Start: Wer die Seite auf Englisch oder Italienisch sieht (Wahl in den Einstellungen oder
 *    Browsersprache), bekommt sie frisch gezeichnet statt das deutsche HTML zu übernehmen. Sonst meldete React
 *    Fehler 418 und zeigte kurz Deutsch. Expo setzt am Ende der Seite __EXPO_ROUTER_HYDRATE__ = true; das Skript
 *    hier legt den Wert vorher fest, die spätere Zuweisung ändert ihn dann nicht mehr.
 *    Gleiche Regel wie deviceLang und store.web.ts (Schlüssel cumo.sprache.v1).
 */
import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const LANG_SCRIPT = `(function(){try{var c=null;try{c=localStorage.getItem('cumo.sprache.v1')}catch(e){}
var l=c||(navigator.language||'de');var de=String(l).toLowerCase().slice(0,2)==='de';
if(!de){document.documentElement.lang=String(l).slice(0,2);
Object.defineProperty(globalThis,'__EXPO_ROUTER_HYDRATE__',{configurable:true,get:function(){return false},set:function(){}});}}catch(e){}})();`;

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
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
