/* eslint-env node */
/* global __dirname, require */
// Tab Symbole als Bilder für die iOS Tableiste erzeugen: node scripts/tab-icons.js (Playwright nötig)
const { chromium } = require('playwright');
const pt = (r, deg) => { const a = deg * Math.PI / 180; return `${(12 + r * Math.sin(a)).toFixed(2)},${(12 - r * Math.cos(a)).toFixed(2)}`; };
let d = ''; for (let k = 0; k < 8; k++) { const a = k * 45; d += `${k === 0 ? 'M' : 'L'}${pt(7, a - 15)} L${pt(9.3, a - 9)} L${pt(9.3, a + 9)} L${pt(7, a + 15)} `; }
const GEAR = d + 'Z', HOLE = 'M15.3 12 A3.3 3.3 0 1 0 8.7 12 A3.3 3.3 0 1 0 15.3 12 Z';
const icon = (name, on) => {
  const sw = on ? 2 : 1.8, f = on ? '#000' : 'none';
  const c = `stroke="#000" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
  const parts = {
    planen: `<circle cx="5.5" cy="5" r="2.6" fill="${f}" ${c}/><circle cx="18.5" cy="19" r="2.6" fill="${f}" ${c}/><path d="M5.5 10 C5.5 14.6 18.5 9.4 18.5 14" fill="none" ${c}/>`,
    touren: `<path d="M6.5 5.2 Q6.5 3.4 8.3 3.4 H15.7 Q17.5 3.4 17.5 5.2 V20.4 L12 16.6 L6.5 20.4 Z" fill="${f}" ${c}/>`,
    community: `<circle cx="4.5" cy="10" r="1.9" fill="${f}" ${c}/><path d="M1.2 18.6 C1.2 16.2 2.6 14.6 4.6 14.6" fill="none" ${c}/><circle cx="19.5" cy="10" r="1.9" fill="${f}" ${c}/><path d="M22.8 18.6 C22.8 16.2 21.4 14.6 19.4 14.6" fill="none" ${c}/><circle cx="12" cy="7.4" r="2.9" fill="${f}" ${c}/><path d="M6.4 19.6 C6.4 15.9 8.9 13.7 12 13.7 C15.1 13.7 17.6 15.9 17.6 19.6 Z" fill="${f}" ${c}/>`,
    einstellungen: `<path d="${GEAR} ${HOLE}" fill="${f}" fill-rule="evenodd" ${c}/>`,
    // Kalender mit kleiner Strecke (Koray 20.11.2026); aktiv gefüllt, Linie und Strecke als Aussparung (Maske)
    ausfahrten: on
      ? `<defs><mask id="m"><rect x="-1" y="-1" width="26" height="26" fill="#fff"/><path d="M3.5 10 H20.5" stroke="#000" stroke-width="1.6"/><path d="M7.4 16.6 C9.4 13.4 11.8 18.2 14.2 15.2 C15.1 14.1 16 14 16.8 14.6" fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="round"/></mask></defs><rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="#000" ${c} mask="url(#m)"/><path d="M8 3 V6.6 M16 3 V6.6" fill="none" ${c}/>`
      : `<rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="none" ${c}/><path d="M3.5 10 H20.5 M8 3 V6.6 M16 3 V6.6" fill="none" ${c}/><path d="M7.4 16.6 C9.4 13.4 11.8 18.2 14.2 15.2 C15.1 14.1 16 14 16.8 14.6" fill="none" ${c}/>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="-1 -1 26 26">${parts[name]}</svg>`;
};
(async () => {
  const b = await chromium.launch();
  for (const scale of [1, 2, 3]) {
    const p = await b.newPage({ viewport: { width: 26, height: 26 }, deviceScaleFactor: scale });
    for (const n of ['planen', 'touren', 'ausfahrten', 'community', 'einstellungen']) for (const on of [false, true]) {
      await p.setContent(`<html><body style="margin:0;background:transparent">${icon(n, on)}</body></html>`);
      const suf = scale === 1 ? '' : `@${scale}x`;
      await p.screenshot({ path: `${__dirname}/../assets/tabs/${n}${on ? '-on' : ''}${suf}.png`, omitBackground: true, clip: { x: 0, y: 0, width: 26, height: 26 } });
    }
    await p.close();
  }
  await b.close();
})();
