/**
 * Übersetzt einen Tourwunsch in Worten in Parameter für die Rundtour.
 *
 * Erste Stufe ohne Sprachmodell: feste Regeln für typische deutsche Formulierungen
 * ("2 Stunden", "50 km", "Richtung Osten", "in den Odenwald", "mit Pässen", "Mittag mit Aussicht").
 * Später ersetzt ein Sprachmodell auf unserem Server diesen Parser; die Ausgabe (TourWish)
 * bleibt gleich, damit das Formular nicht umgebaut werden muss.
 */
import type { Direction } from './roundtrip';
import type { Profile } from './tour';

export type Stop = 'tank' | 'aussicht' | 'mittag' | 'kaffee' | 'foto';

export const STOPS: { id: Stop; label: string }[] = [
  { id: 'tank', label: 'Super Plus tanken' },
  { id: 'aussicht', label: 'Aussicht mit Parkplatz' },
  { id: 'mittag', label: 'Mittagessen' },
  { id: 'kaffee', label: 'Kaffee' },
  { id: 'foto', label: 'Fotospot' },
];

export type TourWish = {
  /** Start als Ortsname; leer heißt aktueller Standort */
  startName?: string;
  /** Ziel Region als Ortsname ("in den Odenwald"); bestimmt die Richtung */
  towardName?: string;
  direction?: Direction;
  km?: number;
  minutes?: number;
  profile?: Profile;
  stops: Stop[];
  /** was erkannt wurde, für die Zeile "Verstanden" */
  understood: string[];
};

const DIRS: [RegExp, Direction, string][] = [
  [/nord\s?ost/i, 'NO', 'Richtung Nordosten'],
  [/nord\s?west/i, 'NW', 'Richtung Nordwesten'],
  [/süd\s?ost|sued\s?ost/i, 'SO', 'Richtung Südosten'],
  [/süd\s?west|sued\s?west/i, 'SW', 'Richtung Südwesten'],
  [/\bnorden\b|\bnördlich|\bnoerdlich|\bnach norden/i, 'N', 'Richtung Norden'],
  [/\bosten\b|\böstlich|\boestlich/i, 'O', 'Richtung Osten'],
  [/\bsüden\b|\bsueden\b|\bsüdlich|\bsuedlich/i, 'S', 'Richtung Süden'],
  [/\bwesten\b|\bwestlich/i, 'W', 'Richtung Westen'],
];

/** Durchschnittstempo auf kurvigen Landstraßen, für Umrechnung Zeit in km */
export const KMH = { kurvig: 55, paesse: 50, entspannt: 65, schnell: 85 } as const;

export function parseWish(text: string): TourWish {
  const t = ` ${text.trim()} `;
  const wish: TourWish = { stops: [], understood: [] };

  const km = t.match(/(\d{1,3})\s?(km|kilometer)/i);
  if (km) {
    wish.km = Math.min(600, parseInt(km[1], 10));
    wish.understood.push(`${wish.km} km`);
  }
  const hours = t.match(/(\d+(?:[.,]\d)?)\s?(h|std|stunden?)\b/i);
  const half = /halbe[nr]? tag/i.test(t);
  const full = /ganze[nr]? tag|tagestour/i.test(t);
  if (hours) wish.minutes = Math.round(parseFloat(hours[1].replace(',', '.')) * 60);
  else if (/eine stunde|1 stunde/i.test(t)) wish.minutes = 60;
  else if (half) wish.minutes = 270;
  else if (full) wish.minutes = 420;
  if (wish.minutes && !wish.km) wish.understood.push(formatMinutes(wish.minutes));

  for (const [re, dir, label] of DIRS) {
    if (re.test(t)) {
      wish.direction = dir;
      wish.understood.push(label);
      break;
    }
  }

  const start = t.match(/\b(?:[Aa]b|[Vv]on|[Ss]tart in|[Ss]tarte in|[Ll]os in)\s+([A-ZÄÖÜ][\wäöüß.\- ]{1,40}?)(?=[,.]|\s(?:in|nach|richtung|mit|und|über|zurück|ca|etwa|\d)|\s*$)/);
  if (start) {
    wish.startName = start[1].trim();
    wish.understood.push(`ab ${wish.startName}`);
  }
  if (!wish.direction) {
    const toward = t.match(/\b(?:in den|in die|ins|nach|richtung|zum|zur)\s+([A-ZÄÖÜ][\wäöüß.\- ]{1,40}?)(?=[,.]|\s(?:mit|und|über|zurück|ab|\d)|\s*$)/i);
    if (toward && !/^(osten|westen|norden|süden)/i.test(toward[1])) {
      // Verben am Ende gehören nicht zum Ziel ("in den Schwarzwald fahren")
      wish.towardName = toward[1].replace(/\s+(fahren|gehen|cruisen|touren|düsen|duesen|rollen|machen|kurven|fliegen|starten)\b.*$/i, '').trim();
      wish.understood.push(`Richtung ${wish.towardName}`);
    }
  }

  if (/pass|pässe|paesse|serpentin|kehre/i.test(t)) wish.profile = 'paesse';
  else if (/entspannt|gemütlich|gemuetlich|cruise|cruisen|ruhig/i.test(t)) wish.profile = 'entspannt';
  else if (/schnell|zügig|zuegig|autobahn/i.test(t)) wish.profile = 'schnell';
  else if (/kurv/i.test(t)) wish.profile = 'kurvig';
  if (wish.profile) wish.understood.push({ kurvig: 'kurvig', paesse: 'mit Pässen', entspannt: 'entspannt', schnell: 'zügig' }[wish.profile]);

  const add = (s: Stop, re: RegExp) => {
    if (re.test(t) && !wish.stops.includes(s)) wish.stops.push(s);
  };
  add('tank', /tank|super ?plus|sprit|98|100 oktan/i);
  add('aussicht', /aussicht|ausblick|panorama|blick/i);
  add('mittag', /mittag|essen|lunch|restaurant/i);
  add('kaffee', /kaffee|café|cafe|kuchen/i);
  add('foto', /foto|bild|insta/i);
  return wish;
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Ziellänge in km aus Wunsch und Profil. */
export function targetKm(wish: Pick<TourWish, 'km' | 'minutes'>, profile: Profile): number {
  if (wish.km) return wish.km;
  if (wish.minutes) return Math.round((wish.minutes / 60) * KMH[profile]);
  return 120;
}
