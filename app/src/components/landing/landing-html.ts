/**
 * Inhalt der Landingpage als HTML für den Web Build (statisch, damit Suchmaschinen alles lesen).
 * Gestaltung nach dem Entwurf vom 6.11. (Design Artefakt URTXEm5yCFeJkmvkhZbTWz), Inhalt auf dem Stand vom 10.11.2026.
 * Bilder liegen unter public/landing. Drei Bildschirmfotos (schnelle-runde, route-paesse, meine-touren) stammen aus einem
 * älteren Stand und werden per CSS beschnitten: oben die alte Reiterleiste, unten Profil "Sehr kurvig" und ein Hinweistext.
 * Login und Registrieren führen auf /login und /registrieren, der Web Planer auf /planer.
 *
 * Zahlen kommen aus den Daten im Repo (src/data/curated-roads.json, passes.json, regions.json), Preise aus
 * src/lib/entitlement.ts. Ändern sich die Daten, hier mitziehen. Texte in Du Form, ohne Gedankenstriche.
 */

const SIGNAL = '#E2461C';
const EMPTY = '#2C2C30';

/** Sieben Dreiecke des Fahrspaß Pegels (Variante E), Reihenfolge wie im Logo */
const TRIANGLES = [
  '12.00,16.20 7.29,22.09 16.71,22.09',
  '8.72,14.62 1.17,14.61 7.05,21.98',
  '7.91,11.07 3.21,5.16 1.11,14.35',
  '10.18,8.22 11.87,0.86 3.37,4.95',
  '13.82,8.22 20.63,4.95 12.13,0.86',
  '16.09,11.07 22.89,14.35 20.79,5.16',
  '15.28,14.62 16.95,21.98 22.83,14.61',
];
/** Füllreihenfolge im Uhrzeigersinn ab unten links */
const FILL_ORDER = [1, 2, 3, 4, 5, 6, 0];

function mark(filled: number, attrs: string): string {
  const on = new Set(FILL_ORDER.slice(0, filled));
  const polys = TRIANGLES.map((p, i) => `<polygon points="${p}" fill="${on.has(i) ? SIGNAL : EMPTY}"></polygon>`).join('');
  return `<svg viewBox="0 0 24 24" ${attrs}>${polys}</svg>`;
}

const LOGO = (size: number, extra = '') => mark(7, `width="${size}" height="${size}" aria-hidden="true"${extra}`);

const LEVELS: [string, number][] = [
  ['Nett', 1],
  ['Lohnend', 3],
  ['Stark', 4],
  ['Traumstraße', 6],
  ['Legende', 7],
];

const GAUGES = LEVELS.map(
  ([name, n]) => `
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 76px;">
            ${mark(n, `width="44" height="44" role="img" aria-label="Fahrspaß Pegel ${name}"`)}
            <span style="font: 600 15px Inter, sans-serif; color: #9A9A9F;">${name}</span>
          </div>`,
).join('');

/** Symbole der Karten, Strich in Signal Orange */
const ICON = {
  width: '<path d="M4 3v18M20 3v18M8.5 12h7M8.5 12l2.5-2.5M8.5 12l2.5 2.5M15.5 12L13 9.5M15.5 12L13 14.5" stroke="#E2461C" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>',
  surface: '<path d="M3 17c3-3 6 3 9 0s6 3 9 0M3 11c3-3 6 3 9 0s6 3 9 0" stroke="#E2461C" stroke-width="2" fill="none" stroke-linecap="round"></path>',
  closed: '<circle cx="12" cy="12" r="8.5" stroke="#E2461C" stroke-width="2" fill="none"></circle><path d="M7.5 12h9" stroke="#E2461C" stroke-width="2.4" stroke-linecap="round"></path>',
  curve: '<path d="M4 20c2-6 6-3 8-8s6-5 8-8" stroke="#E2461C" stroke-width="2.2" fill="none" stroke-linecap="round"></path><circle cx="4" cy="20" r="1.6" fill="#E2461C"></circle><circle cx="20" cy="4" r="1.6" fill="#E2461C"></circle>',
  city: '<path d="M3 21h18M5 21V10l4-3v14M9 21V4h6v17M15 21V9h4v12" stroke="#E2461C" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M3 3l18 18" stroke="#E2461C" stroke-width="2" stroke-linecap="round"></path>',
  loop: '<path d="M6 18a6 6 0 1 1 6-6v8" stroke="#E2461C" stroke-width="2.2" fill="none" stroke-linecap="round"></path><path d="M9 17l3 3 3-3" stroke="#E2461C" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>',
  route: '<path d="M6 20c0-5 12-3 12-9S9 6 9 4" stroke="#E2461C" stroke-width="2.2" fill="none" stroke-linecap="round"></path><circle cx="6" cy="20" r="2" fill="#E2461C"></circle><circle cx="9" cy="4" r="2" fill="#E2461C"></circle>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3" stroke="#E2461C" stroke-width="2" fill="none"></rect><path d="M3.5 10h17M8 3v4M16 3v4" stroke="#E2461C" stroke-width="2" stroke-linecap="round"></path>',
  people: '<circle cx="9" cy="8" r="3.5" stroke="#E2461C" stroke-width="2" fill="none"></circle><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" stroke="#E2461C" stroke-width="2" fill="none" stroke-linecap="round"></path><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.4c2.1.7 3.5 2.6 3.5 5.6" stroke="#E2461C" stroke-width="2" fill="none" stroke-linecap="round"></path>',
};

const icon = (k: keyof typeof ICON) => `<div class="cd-icon"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg></div>`;

/** Karte mit Symbol, Titel und Text */
const featureCard = (k: keyof typeof ICON, title: string, text: string) => `
      <div class="cd-card">
        ${icon(k)}
        <div class="cd-title">${title}</div>
        <p class="cd-body" style="font-size: 16px;">${text}</p>
      </div>`;

/** kleine Karte nur mit Titel und Text */
const smallCard = (title: string, text: string) => `
        <div class="cd-card" style="padding: 20px; gap: 6px; border-radius: 22px;">
          <div class="cd-title" style="font-size: 17px;">${title}</div>
          <p class="cd-body" style="font-size: 15px;">${text}</p>
        </div>`;

const priceCard = (label: string, price: string, text: string, recommended = false) =>
  recommended
    ? `
      <div class="cd-card" style="background: #29130E; position: relative;">
        <span class="cd-label" style="color: #F4F4F2;">${label}</span>
        <span class="cd-num">${price}</span>
        <p class="cd-body" style="font-size: 16px; color: #C9B5AE;">${text}</p>
        <span style="position: absolute; top: 22px; right: 22px; height: 28px; padding: 0 12px; border-radius: 14px; background: #E2461C; color: #FFFFFF; font: 700 13px/28px Inter, sans-serif;">Bester Preis</span>
      </div>`
    : `
      <div class="cd-card">
        <span class="cd-label">${label}</span>
        <span class="cd-num">${price}</span>
        <p class="cd-body" style="font-size: 16px;">${text}</p>
      </div>`;

const stat = (label: string, num: string) => `
        <div style="display: flex; flex-direction: column; gap: 6px;"><span class="cd-label">${label}</span><span class="cd-num">${num}</span></div>`;

const dataCard = (label: string, num: string, text: string) => `
      <div class="cd-card">
        <span class="cd-label">${label}</span>
        <span class="cd-num cd-num-big">${num}</span>
        <p class="cd-body" style="font-size: 16px;">${text}</p>
      </div>`;

export const LANDING_CSS = `
body{margin:0;background:#0B0B0C}
a{color:#F4F4F2}a:hover{color:#FFFFFF}
.cd-wrap{max-width:1280px;margin:0 auto;padding-left:max(24px,env(safe-area-inset-left,0px));padding-right:max(24px,env(safe-area-inset-right,0px));box-sizing:border-box}
.cd-label{font:600 15px/1.3 Inter,system-ui,sans-serif;color:#9A9A9F}
.cd-h1{margin:0;font:900 clamp(56px,7.6vw,112px)/0.92 Archivo,'Arial Black',sans-serif;text-transform:uppercase;letter-spacing:-0.01em;text-wrap:balance}
.cd-h2{margin:0;font:900 clamp(34px,4.2vw,56px)/0.98 Archivo,'Arial Black',sans-serif;text-transform:uppercase;text-wrap:balance}
.cd-h3{margin:0;font:900 clamp(26px,2.6vw,36px)/1.02 Archivo,'Arial Black',sans-serif;text-transform:uppercase;text-wrap:balance}
.cd-lead{margin:0;font:400 19px/1.6 Inter,system-ui,sans-serif;color:#9A9A9F;max-width:58ch}
.cd-body{margin:0;font:400 17px/1.6 Inter,system-ui,sans-serif;color:#9A9A9F;max-width:56ch}
.cd-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;height:56px;padding:0 28px;border-radius:28px;font:700 18px Inter,system-ui,sans-serif;text-decoration:none;white-space:nowrap}
.cd-btn-signal{background:#E2461C;color:#FFFFFF}
.cd-btn-signal:hover{background:#EE5527;color:#FFFFFF}
.cd-btn-surface{background:#232326;color:#F4F4F2}
.cd-btn-surface:hover{background:#2C2C30}
.cd-card{background:#161618;border-radius:28px;padding:28px;display:flex;flex-direction:column;gap:12px;box-sizing:border-box}
.cd-num{font:900 40px/1 Archivo,'Arial Black',sans-serif;text-transform:uppercase;font-variant-numeric:tabular-nums}
.cd-num-big{font-size:48px}
.cd-title{font:700 20px/1.25 Inter,system-ui,sans-serif;color:#F4F4F2}
.cd-icon{width:48px;height:48px;border-radius:24px;background:#29130E;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.cd-phone{border-radius:48px;padding:9px;background:#1C1C1F;box-shadow:0 40px 90px rgba(0,0,0,0.7),inset 0 0 0 1px rgba(255,255,255,0.06);box-sizing:border-box}
.cd-phone img{display:block;width:100%;border-radius:40px}
.cd-chip{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:8px 16px;box-sizing:border-box;line-height:1.3;border-radius:20px;background:#232326;font:600 15px Inter,system-ui,sans-serif;color:#F4F4F2}
.cd-two{display:flex;gap:72px;align-items:center}
.cd-grid4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.cd-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.cd-grid6{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.cd-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.cd-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px}
.cd-steps{display:flex;flex-direction:column;gap:12px}
.cd-step{display:flex;gap:18px;align-items:flex-start;background:#161618;border-radius:22px;padding:20px 22px}
.cd-step b{font:900 22px/1.1 Archivo,'Arial Black',sans-serif;color:#E2461C;font-variant-numeric:tabular-nums;min-width:36px}
.cd-ride{background:#161618;border-radius:28px;padding:24px;display:flex;flex-direction:column;gap:18px;box-sizing:border-box}
.cd-ride-row{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.cd-ride-row div{display:flex;flex-direction:column;gap:4px;min-width:0}
.cd-ride-row b{font:700 17px/1.3 Inter,sans-serif;color:#F4F4F2}
@media (max-width:1000px){
  .cd-two{flex-direction:column !important;align-items:stretch !important;gap:48px}
  .cd-grid4{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cd-grid3{grid-template-columns:minmax(0,1fr)}
  .cd-grid6{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cd-hide-sm{display:none !important}
  .cd-phones{justify-content:center !important}
  .cd-side{width:100% !important}
}
@media (max-width:620px){
  .cd-grid4,.cd-grid2,.cd-grid6{grid-template-columns:minmax(0,1fr)}
  .cd-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cd-nav-links{display:none !important}
}

.cd-logo span{white-space:nowrap}
.cd-btn-quiet{background:transparent;color:#F4F4F2}
.cd-btn-quiet:hover{background:#232326;color:#FFFFFF}
html{scroll-behavior:smooth}
@media (max-width:440px){
  .cd-h1{font-size:clamp(38px,12.2vw,52px) !important}
  header.cd-wrap{gap:12px !important}
  .cd-logo{gap:8px !important}
  .cd-logo span{font-size:16px !important}
  .cd-logo svg{width:24px;height:24px}
  .cd-auth .cd-btn{padding:0 12px !important;font-size:15px !important}
  .cd-auth .cd-btn-quiet{padding:0 10px !important}
  .cd-auth{gap:4px !important}
}

.cp-car{border-radius:36px;padding:12px;background:#1C1C1F;box-shadow:0 40px 90px rgba(0,0,0,0.6),inset 0 0 0 1px rgba(255,255,255,0.06);max-width:100%}
.cp-screen{position:relative;aspect-ratio:5/2;border-radius:26px;overflow:hidden;container-type:inline-size;font-family:Inter,system-ui,sans-serif;color:#F4F4F2}
.cp-map{position:absolute;inset:0;width:100%;height:100%}
.cp-dock{position:absolute;left:0;top:0;bottom:0;width:7.5cqw;background:rgba(11,11,12,0.92);display:flex;flex-direction:column;align-items:center;gap:2.2cqw;padding-top:2cqw;box-sizing:border-box}
.cp-dock span{font:700 1.5cqw Inter,sans-serif}
.cp-dock i{width:4.2cqw;height:4.2cqw;border-radius:1.1cqw;background:#232326}
.cp-dock i:first-of-type{background:#E2461C}
.cp-guide{position:absolute;left:9.5cqw;top:2cqw;width:34cqw;display:flex;flex-direction:column;gap:0.8cqw}
.cp-turn{display:flex;align-items:center;gap:1.6cqw;background:rgba(22,22,24,0.95);border-radius:2.2cqw;padding:1.8cqw}
.cp-turn svg{width:6.4cqw;height:6.4cqw;flex-shrink:0}
.cp-turn div,.cp-alert{display:flex;flex-direction:column;gap:0.4cqw;min-width:0}
.cp-turn b{font:900 4cqw/1 Archivo,'Arial Black',sans-serif;text-transform:uppercase}
.cp-turn span{font:700 1.9cqw/1.2 Inter,sans-serif}
.cp-eta{display:grid;grid-template-columns:auto auto;grid-auto-flow:column;grid-template-rows:auto auto;justify-content:space-between;background:rgba(22,22,24,0.95);border-radius:2.2cqw;padding:1.4cqw 1.8cqw}
.cp-eta b{font:900 2.6cqw/1 Archivo,'Arial Black',sans-serif}
.cp-eta span{font:600 1.5cqw Inter,sans-serif;color:#9A9A9F}
.cp-alert{position:absolute;right:2cqw;top:2cqw;background:rgba(22,22,24,0.95);border-radius:2.2cqw;padding:1.4cqw 2cqw}
.cp-alert b{font:900 2.6cqw/1 Archivo,'Arial Black',sans-serif;text-transform:uppercase;color:#E2461C}
.cp-alert span{font:600 1.6cqw Inter,sans-serif;color:#9A9A9F}
@media (max-width:620px){.cp-car{padding:6px;border-radius:20px}.cp-screen{border-radius:15px}}
`;

export const LANDING_HTML = `<div style="background: #0B0B0C; color: #F4F4F2; font-family: Inter, system-ui, sans-serif; font-size: 17px; line-height: 1.55; overflow-x: hidden;">

<!-- Kopfzeile -->
<header class="cd-wrap" style="padding-top: 24px; padding-bottom: 24px; display: flex; align-items: center; justify-content: space-between; gap: 24px;">
  <a href="/" class="cd-logo" style="display: flex; align-items: center; gap: 12px; text-decoration: none;">
    ${LOGO(32)}
    <span style="font: 900 22px/1 Archivo, 'Arial Black', sans-serif; text-transform: uppercase;">Cumo Drive</span>
  </a>
  <nav class="cd-nav-links" aria-label="Hauptnavigation" style="display: flex; gap: 32px; font: 600 16px Inter, sans-serif;">
    <a href="#planen" style="text-decoration: none; color: #9A9A9F;">Planen</a>
    <a href="#highlights" style="text-decoration: none; color: #9A9A9F;">Highlights</a>
    <a href="#carplay" style="text-decoration: none; color: #9A9A9F;">CarPlay</a>
    <a href="#community" style="text-decoration: none; color: #9A9A9F;">Community</a>
    <a href="#preise" style="text-decoration: none; color: #9A9A9F;">Preise</a>
  </nav>
  <div class="cd-auth" style="display: flex; align-items: center; gap: 8px;">
    <a href="/login" class="cd-btn cd-btn-quiet" style="height: 44px; padding: 0 18px; font-size: 16px;">Login</a>
    <a href="/registrieren" class="cd-btn cd-btn-signal" style="height: 44px; padding: 0 20px; font-size: 16px;">Registrieren</a>
  </div>
</header>

<!-- Bühne -->
<section class="cd-wrap" style="padding-top: 48px; padding-bottom: 120px;">
  <div class="cd-two">
    <div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 28px;">
      <span style="align-self: flex-start; display: inline-flex; align-items: center; gap: 10px; min-height: 36px; padding: 6px 16px; box-sizing: border-box; line-height: 1.3; border-radius: 18px; background: rgba(76,195,138,0.14); color: #4CC38A; font: 700 15px Inter, sans-serif;"><span style="width: 8px; height: 8px; border-radius: 4px; background: #4CC38A; flex-shrink: 0;"></span>Beta für iPhone und CarPlay, jetzt testen</span>
      <h1 class="cd-h1" style="font-size: clamp(52px, 5.6vw, 80px);">Kurven statt Kilometer.</h1>
      <p class="cd-lead">Die Navi App für Sportwagen. Cumo Drive plant kurvige Touren für Autos, nicht für Motorräder: Breite, Belag und Sperrungen geprüft, Großstädte und Ortsdurchfahrten gemieden, Pässe und Traumstrecken mit Ansage. Allein, mit deiner Gruppe oder bei einer Ausfahrt aus der Community.</p>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <a href="/registrieren" class="cd-btn cd-btn-signal">14 Tage kostenlos fahren</a>
        <a href="#planen" class="cd-btn cd-btn-surface">So funktioniert es</a>
      </div>
      <div class="cd-stats" style="padding-top: 20px;">${stat('Pässe', '370')}${stat('Traumstrecken', '486')}${stat('Fahrregionen', '94')}${stat('Fahrspaß Stufen', '5')}
      </div>
    </div>
    <div class="cd-phones" style="flex: 0 0 auto; position: relative; display: flex; gap: 28px; align-items: flex-end; justify-content: flex-end;">
      <div class="cd-phone" style="width: 290px; max-width: 70vw;"><img src="/landing/rundtour.jpg" alt="Sellaronda auf der Karte mit Sellajoch, Pordoijoch, Campolongopass und Grödner Joch"></div>
      <div class="cd-phone cd-hide-sm" style="width: 230px; margin-bottom: 88px;"><img src="/landing/navigation.jpg" alt="Navigation am Kreisverkehr mit Abbiegepfeil, Ankunft 11:36 und Fortschrittsbalken"></div>
    </div>
  </div>
</section>

<!-- Für Autos gebaut -->
<section style="background: #111113;">
  <div class="cd-wrap" style="padding-top: 120px; padding-bottom: 120px; display: flex; flex-direction: column; gap: 48px;">
    <div style="display: flex; flex-direction: column; gap: 18px; max-width: 860px;">
      <span class="cd-label">Für Autos gebaut</span>
      <h2 class="cd-h2">Motorrad Apps schicken dich über Feldwege. Wir nicht.</h2>
      <p class="cd-lead">Ein Sportwagen braucht andere Straßen als ein Motorrad. Unser eigener Routing Server gewichtet nach Kurven, Breite, Belag und Ortsdichte, und jede Etappe wird vor dem Losfahren gegen die Straßendaten geprüft.</p>
    </div>
    <div class="cd-grid6">${featureCard('width', 'Zwei Autos passen vorbei', 'Schmale Straßen gern, aber unter 3 Metern Breite raus, bis 4,5 Meter als prüfen markiert.')}${featureCard('surface', 'Guter Belag', 'Kein Schotter, kein Feldweg. Kopfsteinpflaster und rauen Asphalt meidest du auf Wunsch.')}${featureCard('closed', 'Sperrungen umfahren', 'Aktuelle Straßensperrungen werden umfahren, nicht nur gemeldet. Wintersperren der Pässe siehst du vor der Fahrt.')}${featureCard('curve', 'Ohne Ortsdurchfahrten', 'Städte und Wohngebiete werden abgewertet, lange kurvige Landstraßen bevorzugt.')}${featureCard('city', 'Großstädte gemieden', 'Rund um große Städte gibt es selten gute Kurven. Die kurvige Planung macht einen Bogen darum.')}${featureCard('loop', 'Keine Stichstraßen', 'Kein Hin und zurück auf derselben Sackgasse. Stichstraßen werden herausgeplant, der Rückweg meidet den Hinweg.')}
    </div>
  </div>
</section>

<!-- 01 Planen -->
<section id="planen" class="cd-wrap" style="padding-top: 140px; padding-bottom: 70px;">
  <div class="cd-two">
    <div class="cd-phones" style="flex: 0 0 auto; display: flex; gap: 24px; align-items: flex-start;">
      <div class="cd-phone" style="width: 270px; max-width: 70vw;"><img src="/landing/schnelle-runde.jpg" alt="Schnelle Runde: Länge 100 km, Richtung Südost" style="aspect-ratio: 760 / 1110; object-fit: cover; object-position: top;"></div>
      <div class="cd-phone cd-hide-sm" style="width: 270px; margin-top: 96px;"><img src="/landing/route-paesse.jpg" style="aspect-ratio: 760 / 1300; object-fit: cover; object-position: bottom;" alt="Route von Meran über Jaufenpass und Timmelsjoch: 157 km, 2:35 h, 118 Kurven, Höhenprofil und Etappen Check bestanden"></div>
    </div>
    <div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 20px;">
      <span class="cd-label">01  Planen</span>
      <h3 class="cd-h3">Feierabendrunde in drei Tipps. Alpentour Etappe für Etappe.</h3>
      <p class="cd-body">Die schnelle Runde startet an deinem Standort: Länge oder Dauer wählen, eine Richtung oder Zufall, und die Runde wird kurvig geplant. Gefällt sie nicht, würfelst du neu. Gibt es in der Gegend keine bessere Runde, sagt dir die App das ehrlich, statt dir eine schlechtere zu zeigen.</p>
      <p class="cd-body">Für die große Tour setzt du Start, Zwischenziele und Ziel. Jede Etappe bekommt ihr eigenes Profil, etwa schnell nach München und dann kurvig bis Imst. Pässe tippst du direkt auf der Karte an und baust sie mit einem Tipp ein.</p>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <span class="cd-chip">Penser Joch <span style="color: #9A9A9F;">+7 km</span></span>
        <span class="cd-chip">Brennerpass <span style="color: #9A9A9F;">+14 km</span></span>
        <span class="cd-chip">Gampenpass <span style="color: #9A9A9F;">+15 km</span></span>
      </div>
      <p class="cd-body" style="font-size: 15px;">Pässe in der Nähe erscheinen je Etappe als Vorschlag mit Umweg in Kilometern. Rundtouren ziehen sanft in die Fahrregionen, vom Schwarzwald über die Vogesen bis in die Dolomiten.</p>
    </div>
  </div>
</section>

<!-- 02 Highlights -->
<section id="highlights" class="cd-wrap" style="padding-top: 70px; padding-bottom: 70px;">
  <div class="cd-two" style="flex-direction: row-reverse;">
    <div class="cd-phones" style="flex: 0 0 auto; display: flex; justify-content: flex-end;">
      <div class="cd-phone" style="width: 300px; max-width: 70vw;"><img src="/landing/highlights.jpg" alt="Sellaronda mit vier Highlights: Sellajoch und Pordoijoch als Ikonen, Campolongopass und Grödner Joch, dazu Pässe zum Einbauen wie Passo Giau"></div>
    </div>
    <div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 20px;">
      <span class="cd-label">02  Highlights und Fahrspaß Pegel</span>
      <h3 class="cd-h3">Jede Strecke hat ihren Pegel. Das Pordoijoch ist Legende.</h3>
      <p class="cd-body">Pässe, Bergrennstrecken, Rallyeprüfungen und Traumstraßen stehen nach Fahrspaß gerankt in deiner Tour. Antippen zeigt den Abschnitt auf der Karte mit Länge, Kehren, Höhe und Wintersperre.</p>
      <p class="cd-body">Nach der Fahrt gibst du jedem gefahrenen Highlight Daumen hoch oder runter. So wandert der Pegel mit dem, was Fahrer wirklich erleben.</p>
      <div class="cd-card" style="padding: 24px; gap: 18px;">
        <span class="cd-label">Fünf Stufen</span>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: space-between;">${GAUGES}
        </div>
      </div>
    </div>
  </div>
</section>

<!-- 03 Navigation -->
<section class="cd-wrap" style="padding-top: 70px; padding-bottom: 140px;">
  <div class="cd-two">
    <div class="cd-side" style="flex: 0 0 auto; display: flex; flex-direction: column; gap: 16px; width: 440px; max-width: 100%;">
      <div style="border-radius: 32px; overflow: hidden; box-shadow: 0 40px 90px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.06);"><img src="/landing/ansage.jpg" alt="Ansage: In 950 m Jaufenpass, 2.094 m, 20 Kehren" style="display: block; width: 100%;"></div>
      <div style="display: flex; align-items: center; gap: 12px; align-self: flex-start; height: 44px; padding: 0 18px; border-radius: 22px; background: #161618;">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V12a6 6 0 0 1 6-6h8M15 2l4 4-4 4" stroke="#E8B03A" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>
        <span style="font: 600 15px Inter, sans-serif; color: #E8B03A;">Scharfe Rechtskurve · 120 m</span>
      </div>
    </div>
    <div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 20px;">
      <span class="cd-label">03  Navigation</span>
      <h3 class="cd-h3">„In 950 Metern beginnt der Jaufenpass. 20 Kehren.“</h3>
      <p class="cd-body">Kurz vor jedem Highlight kommt die Ansage mit Karte und Pegel. Bei einer Legende läuft die Stern Animation. Dazu 42 eigene Abbiegesymbole, die sich vor dem Manöver aufbauen.</p>
      <div class="cd-grid2" style="padding-top: 8px;">${smallCard('Kurven mit Ansage', 'Scharfe Kurven und Kehren 150 m vorher, nur außerorts ab 70 km/h.')}${smallCard('Ankunft nach deinem Tempo', 'Restzeit und Ankunft lernen laufend mit, wie du wirklich fährst.')}${smallCard('Pause mit einem Tipp', 'Für den Kaffee am Pass: Ansagen und Zeit stehen, bis du weiterfährst.')}${smallCard('Auf dem Sperrbildschirm', 'Die Live Activity zeigt das nächste Manöver, ohne dass du die App öffnest. Die Stimme der Ansagen wählst du mit Hörprobe.')}${smallCard('Tempo im Blick', 'Dein Tempo und das erlaubte Tempo unten links. Zu schnell färbt sich nur die Fläche, ohne Ton.')}${smallCard('Abschnitt auslassen', 'Lange auf das Manöver drücken, schon geht es direkt zum nächsten Zwischenziel. Rückgängig inklusive.')}
      </div>
    </div>
  </div>
</section>

<!-- CarPlay -->
<section id="carplay" class="cd-wrap" style="padding-top: 40px; padding-bottom: 140px; display: flex; flex-direction: column; gap: 48px;">
  <div style="display: flex; flex-direction: column; gap: 20px; max-width: 760px;">
    <span class="cd-label">CarPlay</span>
    <h3 class="cd-h2">Die Kurven auf dem großen Display.</h3>
    <p class="cd-lead">Plane auf dem iPhone, fahr mit CarPlay. Die Tour liegt als Linie auf der Karte im Auto, ein Tipp auf Los startet die Führung. Manöver, Restweg und Ankunft stehen im Blick, Pässe und Traumstrecken melden sich kurz vorher. CarPlay ist noch in Entwicklung und für Tester schon nutzbar.</p>
  </div>
  <div class="cp-car" role="img" aria-label="CUMO DRIVE in CarPlay: Karte mit oranger Tour, Abbiegehinweis rechts auf die SS 44 in 800 m, Hinweis Jaufenpass in 600 m mit 20 Kehren, Ankunft 11:36">
    <div class="cp-screen">
      <svg class="cp-map" viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="1000" height="400" fill="#10181A"></rect>
        <path d="M0 300 C120 280 180 340 300 310 S470 210 560 250 760 330 1000 240" stroke="#1E2A2D" stroke-width="10" fill="none"></path>
        <path d="M120 0 C160 90 260 120 300 200 S330 330 420 400" stroke="#1E2A2D" stroke-width="7" fill="none"></path>
        <path d="M700 0 C680 80 760 140 740 220 S640 330 700 400" stroke="#1A2427" stroke-width="6" fill="none"></path>
        <path d="M430 400 C450 330 520 320 560 280 C600 240 540 200 590 170 C640 140 700 190 740 150 C780 110 730 70 790 50 C850 30 900 80 960 40" stroke="#E2461C" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
        <circle cx="452" cy="352" r="15" fill="#F4F4F2"></circle>
        <path d="M452 340 L462 362 L452 356 L442 362 Z" fill="#E2461C"></path>
      </svg>
      <div class="cp-dock" aria-hidden="true"><span>11:02</span><i></i><i></i><i></i></div>
      <div class="cp-guide" aria-hidden="true">
        <div class="cp-turn">
          <svg viewBox="0 0 24 24"><path d="M6 21V12a5 5 0 0 1 5-5h8M15 3l4 4-4 4" stroke="#F4F4F2" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>
          <div><b>800 m</b><span>Rechts auf die SS 44</span></div>
        </div>
        <div class="cp-eta"><b>11:36</b><span>Ankunft</span><b>42 km</b><span>Rest</span></div>
      </div>
      <div class="cp-alert" aria-hidden="true"><b>Jaufenpass</b><span>In 600 m, 20 Kehren</span></div>
    </div>
  </div>
  <div class="cd-grid3">${smallCard('Vorschau mit Los', 'Die geplante Tour wartet schon auf dem Display, mit Strecke und Fahrzeit.')}${smallCard('Highlights im Blick', 'Pässe und Traumstrecken kommen als kurzer Hinweis, die Ansage hörst du über die Lautsprecher im Auto.')}${smallCard('iPhone und Auto im Gleichtakt', 'Starten, pausieren, beenden: Was du an einer Stelle tust, gilt an beiden.')}
  </div>
</section>

<!-- 04 Gruppe -->
<section id="gruppe" style="background: #111113;">
  <div class="cd-wrap" style="padding-top: 120px; padding-bottom: 120px;">
    <div class="cd-two">
      <div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 20px;">
        <span class="cd-label">04  Gruppenfahrt</span>
        <h3 class="cd-h3">Solo oder Gruppe. Direkt im Losfahren Knopf.</h3>
        <p class="cd-body">Lade bis zu fünf Mitfahrer mit ihrem Namen ein. Alle fahren dieselbe Route und sehen sich live auf der Karte. Die Lead sagt Tankstopp oder Pause mit einem Tipp an, bei allen erscheint der Halt groß im Bild. Wer die Route verlässt, wird ohne Wenden zur nächsten Stelle zurückgeführt.</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <span class="cd-chip">Live Positionen</span>
          <span class="cd-chip">Halt ansagen</span>
          <span class="cd-chip">Kurznachrichten mit Ansage</span>
          <span class="cd-chip">Funk <span style="color: #9A9A9F;">bald</span></span>
        </div>
      </div>
      <div class="cd-side" style="flex: 0 0 auto; width: 420px; max-width: 100%; display: flex; flex-direction: column; gap: 14px;">
        <div class="cd-card" style="gap: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: baseline;"><span class="cd-title" style="font-size: 18px;">Mitfahrer</span><span class="cd-label">3 von 6</span></div>
          <div style="display: flex; gap: 14px; align-items: flex-start;">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; width: 56px;"><div style="width: 52px; height: 52px; border-radius: 26px; background: #E2461C; display: flex; align-items: center; justify-content: center; font: 700 17px Inter, sans-serif; color: #FFFFFF;">KO</div><span style="font: 600 13px Inter, sans-serif; color: #9A9A9F;">Lead</span></div>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; width: 56px;"><div style="width: 52px; height: 52px; border-radius: 26px; background: #2C2C30; display: flex; align-items: center; justify-content: center; font: 700 17px Inter, sans-serif;">JM</div><span style="font: 600 13px Inter, sans-serif; color: #4CC38A;">dabei</span></div>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; width: 56px;"><div style="width: 52px; height: 52px; border-radius: 26px; background: #2C2C30; display: flex; align-items: center; justify-content: center; font: 700 17px Inter, sans-serif;">SK</div><span style="font: 600 13px Inter, sans-serif; color: #E8B03A;">eingeladen</span></div>
            <div style="width: 52px; height: 52px; border-radius: 26px; border: 2px dashed #3A3A3E; box-sizing: border-box; display: flex; align-items: center; justify-content: center;"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2v14M2 9h14" stroke="#F4F4F2" stroke-width="2.2" stroke-linecap="round"></path></svg></div>
          </div>
        </div>
        <div style="height: 56px; border-radius: 28px; background: #E2461C; display: flex; align-items: center; box-sizing: border-box; padding-right: 6px;" role="img" aria-label="Losfahren mit Schalter Solo oder Gruppe, Gruppe gewählt">
          <span style="flex-grow: 1; padding-left: 24px; font: 700 18px Inter, sans-serif; color: #FFFFFF;">Losfahren</span>
          <div style="height: 44px; border-radius: 22px; box-sizing: border-box; padding: 4px; gap: 2px; display: flex; align-items: center; background: rgba(0,0,0,0.22);">
            <div style="width: 40px; height: 36px; display: flex; align-items: center; justify-content: center;"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4.5" fill="#FFFFFF"></circle><path d="M3.5 21c0-4.8 3.8-7.6 8.5-7.6s8.5 2.8 8.5 7.6c0 .8-.6 1.3-1.3 1.3H4.8c-.7 0-1.3-.5-1.3-1.3z" fill="#FFFFFF"></path></svg></div>
            <div style="height: 36px; border-radius: 18px; padding: 0 14px 0 10px; box-sizing: border-box; background: #FFFFFF; display: flex; align-items: center; gap: 6px; font: 700 15px Inter, sans-serif; color: #E2461C;"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.5" cy="8" r="3.9" fill="#E2461C"></circle><path d="M1 20.4c0-4.1 3.3-6.5 7.5-6.5s7.5 2.4 7.5 6.5c0 .7-.5 1.1-1.1 1.1H2.1c-.6 0-1.1-.4-1.1-1.1z" fill="#E2461C"></path><circle cx="16.8" cy="8.6" r="3.2" fill="#E2461C"></circle><path d="M17.6 21.5h4.3c.6 0 1.1-.4 1.1-1 0-3.5-2.7-5.6-6.2-5.6-.6 0-1.2.1-1.7.2 1.6 1.4 2.5 3.4 2.5 5.6v.8z" fill="#E2461C"></path></svg>Gruppe</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- 05 Community -->
<section id="community" class="cd-wrap" style="padding-top: 140px; padding-bottom: 70px; display: flex; flex-direction: column; gap: 48px;">
  <div class="cd-two">
    <div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 20px;">
      <span class="cd-label">05  Community</span>
      <h3 class="cd-h3">Routen nachfahren. Ausfahrten finden. Fahrer kennenlernen.</h3>
      <p class="cd-body">Die Community hat drei Bereiche. Unter Routen liegen veröffentlichte Touren zum Nachfahren, ein Tipp öffnet sie im Planer. Unter Ausfahrten verabredest du dich zu gemeinsamen Touren. Unter Drivers findest du Fahrer aus deiner Gegend und schreibst ihnen direkt.</p>
    </div>
    <div class="cd-side" style="flex: 0 0 auto; width: 420px; max-width: 100%;">
      <div class="cd-ride" role="img" aria-label="Beispiel einer Ausfahrt: Sellaronda am Samstag um 9 Uhr, Treffpunkt Parkplatz am Start, noch 3 Plätze frei, mit Knopf Mitfahren anfragen">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
          <span class="cd-label">Ausfahrt</span>
          <span style="height: 28px; padding: 0 12px; border-radius: 14px; background: rgba(76,195,138,0.14); color: #4CC38A; font: 700 13px/28px Inter, sans-serif;">3 Plätze frei</span>
        </div>
        <span style="font: 900 30px/1 Archivo, 'Arial Black', sans-serif; text-transform: uppercase;">Sellaronda</span>
        <div class="cd-ride-row">
          <div><span class="cd-label">Abfahrt</span><b>Samstag, 9:00</b></div>
          <div><span class="cd-label">Treffpunkt</span><b>Parkplatz am Start</b></div>
          <div><span class="cd-label">Strecke</span><b>54 km</b></div>
        </div>
        <span class="cd-btn cd-btn-signal" style="height: 52px; font-size: 17px;">Mitfahren anfragen</span>
      </div>
    </div>
  </div>
  <div class="cd-grid3">${featureCard('route', 'Routen', 'Veröffentlichte Touren anderer Fahrer, etwa die Sellaronda groß und klein. Antippen öffnet eine Kopie im Planer, das Lesezeichen legt sie unter Touren ab.')}${featureCard('calendar', 'Ausfahrten', 'Gemeinsame Ausfahrten mit Termin, Treffpunkt und Plätzen. Du fragst an oder wirst eingeladen, der Organisator nimmt an, und im Chat klärt ihr den Rest.')}${featureCard('people', 'Drivers', 'Mitglieder mit ungefährem Wohnort auf der Karte und private Nachrichten. Was andere von dir sehen, auch deinen Fuhrpark, stellst du selbst ein.')}
  </div>
</section>

<!-- 06 Meine Touren -->
<section class="cd-wrap" style="padding-top: 70px; padding-bottom: 140px; display: flex; flex-direction: column; gap: 48px;">
  <div class="cd-two" style="flex-direction: row-reverse;">
    <div class="cd-phones" style="flex: 0 0 auto; display: flex; gap: 24px; align-items: flex-start;">
      <div class="cd-phone cd-hide-sm" style="width: 260px; margin-top: 96px;"><img src="/landing/paesse-karte.jpg" alt="Stilfser Joch und Umbrailpass auf der Karte"></div>
      <div class="cd-phone" style="width: 270px; max-width: 70vw;"><img src="/landing/meine-touren.jpg" style="aspect-ratio: 760 / 1300; object-fit: cover; object-position: bottom;" alt="Touren mit Sellaronda, Jaufen und Timmelsjoch, Stilfser Joch, Penser Joch, Würzjoch und Mendelpass"></div>
    </div>
    <div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 20px;">
      <span class="cd-label">06  Touren</span>
      <h3 class="cd-h3">Jede Tour bleibt. Die besten teilst du.</h3>
      <p class="cd-body">Geplante Touren liegen in deinem Konto, in der App und im Web Planer. Ein Tipp öffnet sie so, wie du sie gespeichert hast, ohne neu zu planen. Du benennst sie um, duplizierst sie, sortierst sie in Ordner oder nach Fahrspaß und teilst sie als GPX oder KML. Touren aus anderen Apps und Navis importierst du genauso.</p>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <span class="cd-chip">Ordner</span>
        <span class="cd-chip">Nach Fahrspaß sortieren</span>
        <span class="cd-chip">Duplizieren</span>
        <span class="cd-chip">GPX und KML</span>
        <span class="cd-chip">In der Community veröffentlichen</span>
      </div>
    </div>
  </div>
  <div class="cd-grid2">
    <div class="cd-card">
      <span class="cd-label">Nach der Fahrt</span>
      <div class="cd-title">Statistik für Autos</div>
      <p class="cd-body" style="font-size: 16px;">Kilometer, Kurven, Querbeschleunigung und Schnitt, je Fahrzeug. Dazu deine Bewertung von nicht gut bis sensationell, und bei nicht gut fragt die App kurz nach dem Grund.</p>
    </div>
    <div class="cd-card">
      <span class="cd-label">Garage</span>
      <div class="cd-title">Mehrere Fahrzeuge</div>
      <p class="cd-body" style="font-size: 16px;">Jedes Auto mit Breite, Bodenfreiheit, Reichweite und Sprit. Vor der Fahrt wählst du, mit welchem du fährst, die Kilometer landen beim richtigen Auto.</p>
    </div>
  </div>
</section>

<!-- Web Planer -->
<section id="web" style="background: #111113;">
  <div class="cd-wrap" style="padding-top: 120px; padding-bottom: 120px;">
    <div class="cd-two">
      <div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 20px;">
        <span class="cd-label">Web Planer</span>
        <h3 class="cd-h3">Am Rechner planen. Auf dem Handy fahren.</h3>
        <p class="cd-body">Die große Tour planst du am besten auf dem großen Bildschirm. Im Web Planer setzt du Start, Zwischenziele und Pässe auf der Karte und siehst die Highlights deiner Tour. Fertig geplant, holst du die Tour per QR Code aufs iPhone oder findest sie einfach unter Touren.</p>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; padding-top: 4px;">
          <a href="/planer" class="cd-btn cd-btn-surface">Web Planer öffnen</a>
        </div>
      </div>
      <div class="cd-side cd-steps" style="flex: 0 0 auto; width: 420px; max-width: 100%;">
        <div class="cd-step"><b>01</b><div><div class="cd-title" style="font-size: 17px;">Am Rechner planen</div><p class="cd-body" style="font-size: 15px;">Start, Zwischenziele, Pässe und Profil je Etappe.</p></div></div>
        <div class="cd-step"><b>02</b><div><div class="cd-title" style="font-size: 17px;">QR Code scannen</div><p class="cd-body" style="font-size: 15px;">Die App übernimmt die Tour mit allen Stützpunkten.</p></div></div>
        <div class="cd-step"><b>03</b><div><div class="cd-title" style="font-size: 17px;">Losfahren</div><p class="cd-body" style="font-size: 15px;">Allein, mit der Gruppe oder über CarPlay.</p></div></div>
      </div>
    </div>
  </div>
</section>

<!-- Daten -->
<section class="cd-wrap" style="padding-top: 140px; padding-bottom: 140px; display: flex; flex-direction: column; gap: 48px;">
  <div style="display: flex; flex-direction: column; gap: 18px; max-width: 860px;">
    <span class="cd-label">Datenqualität</span>
    <h2 class="cd-h2">Von Fahrern recherchiert, nicht vom Algorithmus geraten.</h2>
    <p class="cd-lead">Eigener Routing Server mit Sportwagen Gewichtung, jede Woche neu gebaut. Dazu eine kuratierte Datenbank mit Quelle zu jedem Eintrag, auf die Straße gelegt und geprüft. Passstatus und Wintersperren werden laufend aktualisiert.</p>
  </div>
  <div class="cd-grid4">${dataCard('Pässe', '370', 'In drei Stufen: Ikone, Bekannt und Geheimtipp. Mit Höhe, Kehren, Maut und Wintersperre.')}${dataCard('Traumstrecken', '486', 'Bergrennen, Rallyeprüfungen und Panoramastraßen in Deutschland, Österreich, der Schweiz, Italien, Frankreich und Slowenien.')}${dataCard('Fahrregionen', '94', 'Gegenden, die als Ganzes zum Fahren gemacht sind, etwa Schwarzwald, Vogesen oder Dolomiten.')}${dataCard('Stopps an der Strecke', '319.000', 'Super Plus, Aussichtspunkte, Mittag und Kaffee, sortiert nach Umweg in Minuten.')}
  </div>
  <div style="display: flex; gap: 8px; flex-wrap: wrap;">
    <span class="cd-chip" style="color: #9A9A9F;">Kartendaten © OpenStreetMap Mitwirkende</span>
    <span class="cd-chip" style="color: #9A9A9F;">Routing auf eigenem Server</span>
    <span class="cd-chip" style="color: #9A9A9F;">Jede Woche aktualisiert</span>
  </div>
</section>

<!-- Club -->
<section id="club" style="background: #111113;">
  <div class="cd-wrap" style="padding-top: 120px; padding-bottom: 120px;">
    <div class="cd-two">
      <div style="flex: 1 1 0; min-width: 0; aspect-ratio: 4 / 3; max-width: 100%; border-radius: 32px; background: radial-gradient(120% 90% at 50% 40%, #241310 0%, #161618 60%); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 32px; padding: 32px; box-sizing: border-box;">
        ${LOGO(148, ' style="max-width: 40%; height: auto;"')}
        <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;"><span class="cd-chip">Rally Cumo Originale</span><span class="cd-chip">Vosges</span><span class="cd-chip">Black Forest</span></div>
      </div>
      <div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 22px;">
        <span class="cd-label">Aus dem CUMO DRIVERS CLUB</span>
        <h2 class="cd-h2">Curve Mozzafiato.</h2>
        <p class="cd-lead">CUMO steht für atemberaubende Kurven. Der CUMO DRIVERS CLUB führt Sportwagentouren durch die Alpen, die Vogesen und den Schwarzwald. Cumo Drive ist das Werkzeug, das wir dafür selbst gebraucht haben.</p>
        <span style="font: 700 17px Inter, sans-serif;">Koray, CUMO DRIVERS CLUB</span>
      </div>
    </div>
  </div>
</section>

<!-- Preise -->
<section id="preise" class="cd-wrap" style="padding-top: 140px; padding-bottom: 120px; display: flex; flex-direction: column; gap: 48px;">
  <div style="display: flex; flex-direction: column; gap: 18px; max-width: 860px;">
    <span class="cd-label">Preise</span>
    <h2 class="cd-h2">14 Tage kostenlos. Dann so, wie du fährst.</h2>
    <p class="cd-lead">Jeder Plan enthält alle Funktionen, auch Gruppenfahrten bis 6 Fahrzeuge. Deine Touren, Fahrten und Fahrzeuge bleiben in deinem Konto.</p>
  </div>
  <div class="cd-grid4">${priceCard('Jahr', '59,99 €', 'Entspricht 5 € im Monat. Abo, jederzeit kündbar.', true)}${priceCard('Saison Pass', '39 €', 'Einmalig für 6 Monate, kein Abo. Für die Monate, in denen das Auto aus der Garage darf.')}${priceCard('Monat', '14,99 €', 'Abo, jederzeit kündbar.')}${priceCard('Woche', '6,99 €', 'Für das Wochenende im Mietwagen oder die eine Tour im Urlaub. Abo, jederzeit kündbar.')}
  </div>
  <div class="cd-grid2">
    <div class="cd-card" style="background: transparent; box-shadow: inset 0 0 0 1px #232326;">
      <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 16px; flex-wrap: wrap;"><span class="cd-h3" style="font-size: 28px;">Club S</span><span class="cd-title">Preis auf Anfrage</span></div>
      <p class="cd-body" style="font-size: 16px;">Für Markenclubs und Stammtische: 12 Fahrzeuge, alle Mitglieder ohne eigenes Abo, gemeinsame Clubtouren.</p>
    </div>
    <div class="cd-card" style="background: transparent; box-shadow: inset 0 0 0 1px #232326;">
      <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 16px; flex-wrap: wrap;"><span class="cd-h3" style="font-size: 28px;">Club L</span><span class="cd-title">Preis auf Anfrage</span></div>
      <p class="cd-body" style="font-size: 16px;">Für Tourenveranstalter, Hotels und Autohäuser: 20 Fahrzeuge, Teilnehmer ohne eigenes Abo, eigene Touren für alle Mitfahrer.</p>
    </div>
  </div>
  <p class="cd-body" style="font-size: 15px; max-width: 80ch;">Clubs laufen auf Rechnung, schreib uns an <a href="mailto:kontakt@rallycumo.de">kontakt@rallycumo.de</a>. Woche, Monat und Jahr verlängern sich automatisch, wenn du nicht spätestens 24 Stunden vor Ablauf in den Einstellungen deiner Apple ID kündigst.</p>
</section>

<!-- Abschluss -->
<section style="background: #111113;">
  <div class="cd-wrap" style="padding-top: 160px; padding-bottom: 160px; display: flex; flex-direction: column; align-items: flex-start; gap: 36px;">
    ${LOGO(72)}
    <h2 class="cd-h1" style="max-width: 1000px; font-size: clamp(48px, 6vw, 88px);">Lass uns gemeinsam Kurven erleben.</h2>
    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
      <a href="/registrieren" class="cd-btn cd-btn-signal">Kostenlos registrieren</a>
      <a href="/planer" class="cd-btn cd-btn-surface">Web Planer öffnen</a>
    </div>
  </div>
</section>

<footer>
  <div class="cd-wrap" style="padding-top: 40px; padding-bottom: 40px; display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; font: 600 15px Inter, sans-serif; color: #9A9A9F;">
    <span>Cumo Drive · cumodrive.de</span>
    <span style="display: flex; gap: 20px;"><a href="https://rallycumo.de/impressum/" style="color: inherit; text-decoration: none;">Impressum</a><a href="/datenschutz" style="color: inherit; text-decoration: none;">Datenschutz</a><a href="/agb" style="color: inherit; text-decoration: none;">AGB</a></span>
    <span>Kartendaten © OpenStreetMap Mitwirkende</span>
  </div>
</footer>

</div>`;
