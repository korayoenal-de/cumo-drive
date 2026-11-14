/**
 * Darf ich diese Tour fahren? Prüfung vor jedem eigenen Losfahren (kostenlose Version, Koray 14.11.).
 * Mitglieder und alle, solange die Grenzen stumm sind (LIMITS_LIVE), fahren sofort.
 * Kostenlos: die ganze Strecke muss im Heimatgebiet liegen. Sonst kommt das Blatt „Fahr die ganze Runde“
 * mit den Auswegen „Bis zur Grenze fahren“ (die Tour wird am Rand neu geplant) und „Erst mal speichern“.
 * Wer mitfährt (Gruppe oder Ausfahrt eines anderen), wird hier nicht geprüft.
 */
import { canDrive, getEntitlement, setHomeArea } from './entitlement';
import { reverseName } from './geocode';
import { here } from '@/components/group/meeting-route';
import { askMembership, LIMITS_LIVE } from './paywall';
import { planChecked } from './plan';
import { showToast } from './toast';
import { flatten, haversine, type LatLon, type Profile, type Tour } from './tour';
import type { Avoid } from './valhalla';

/** save: der Nutzer hat „Erst mal speichern“ gewählt */
export type DriveDecision = { go: true; tour: Tour } | { go: false; save?: boolean };

export async function guardDrive(tour: Tour, profile: Profile, avoid: Avoid, onceKey: string): Promise<DriveDecision> {
  if (!LIMITS_LIVE) return { go: true, tour };
  const line = flatten(tour).map((x) => x.p);
  let check = canDrive(line);
  if (check === 'kein_gebiet') {
    // Beim ersten Mal wird das Heimatgebiet dort festgelegt, wo man gerade ist (einmal änderbar, Einstellungen)
    try {
      const p = await here();
      const name = await reverseName(p).catch(() => null);
      await setHomeArea(p[0], p[1], name);
      showToast(`Dein Heimatgebiet: ${name ?? 'dein Standort'}. Ändern in den Einstellungen.`);
      check = canDrive(line);
    } catch {
      return { go: true, tour };
    }
  }
  if (check === 'ok') return { go: true, tour };

  const home = getEntitlement().home!;
  const center: LatLon = [home.lat, home.lon];
  const pts = flatten(tour);
  const firstOut = pts.findIndex((x) => haversine(x.p, center) / 1000 > home.radiusKm);
  const insideKm = firstOut > 0 ? pts[firstOut - 1].km : 0;
  const r = await askMembership('ausserhalb', { tourName: tour.name, insideKm, outsideKm: Math.max(0, tour.laenge_km - insideKm) }, onceKey);
  if (r === 'member' || (r === 'closed' && getEntitlement().active)) return { go: true, tour };
  if (r === 'escape2') return { go: false, save: true };
  if (r === 'repeat') showToast('Diese Tour verlässt dein Heimatgebiet. Überall fahren mit Mitgliedschaft.');
  if (r !== 'escape' || firstOut <= 0) return { go: false };

  // Bis zur Grenze: Wegpunkte im Gebiet und der letzte Punkt vor dem Rand, neu geplant
  const border = pts[firstOut - 1].p;
  // nur Wegpunkte, die vor dem Verlassen des Gebiets liegen (bei Rundtouren liegt das Ziel wieder drinnen)
  const nearestIdx = (w: LatLon) => {
    let best = 0;
    let d = Infinity;
    for (let i = 0; i < pts.length; i += 1) {
      const x = haversine(w, pts[i].p);
      if (x < d) {
        d = x;
        best = i;
      }
    }
    return best;
  };
  let last = -1;
  const vias = tour.wegpunkte.filter((w) => {
    const i = nearestIdx(w);
    if (i >= firstOut || i < last) return false;
    last = i;
    return true;
  });
  const route = [...vias, border].filter((p, i, a) => i === 0 || haversine(p, a[i - 1]) > 300);
  if (route.length < 2) return { go: false };
  try {
    const t = await planChecked(`${tour.name} bis zur Grenze`, route, profile, avoid);
    return { go: true, tour: t };
  } catch {
    showToast('Bis zur Grenze ließ sich gerade nicht planen.', { tone: 'error' });
    return { go: false };
  }
}
