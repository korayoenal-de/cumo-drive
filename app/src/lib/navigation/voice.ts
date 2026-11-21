/**
 * Sprachansagen für die Routenführung (expo-speech, Deutsch).
 *
 * Jedes Manöver wird höchstens dreimal angesagt, jede Stufe höchstens einmal:
 *   weit   bei etwa 1000 m (Tempo über 60 km/h) oder 400 m
 *   nah    bei etwa 300 m (Tempo über 60 km/h) oder 100 m
 *   jetzt  direkt am Manöver, zum Beispiel "Jetzt links abbiegen"
 * Kommt man erst spät in den Bereich (zum Beispiel nach einer Neuberechnung), wird nur die
 * passende Stufe angesagt und die übersprungenen entfallen.
 */
import { voiceVolume } from '../drive-settings';
import * as Speech from 'expo-speech';

import { bbLog } from './blackbox';
import type { Maneuver, NavRoute } from './types';
import { chosenVoiceId } from '../voice-settings';
import { getLang, SPEECH_LANG, t, type Lang } from '@/i18n';

type Stage = 'weit' | 'nah' | 'jetzt';

export type VoiceGuide = {
  /** Mit jeder neuen Position aufrufen */
  update: (route: NavRoute, next: number, distToNextM: number | null, speedKmh: number | null) => void;
  /** Freie Ansage, zum Beispiel beim Start oder bei einer Neuberechnung; rank 0 für Hinweise (Highlights) */
  say: (text: string, interrupt?: boolean, rank?: SpeechRank) => void;
  setEnabled: (on: boolean) => void;
  /** Vergisst, was schon angesagt wurde (nach einer neuen Route) */
  reset: () => void;
  /** Bricht laufende Ansagen ab */
  stop: () => void;
};

const ORDINALS: Record<Lang, string[]> = {
  de: ['', 'erste', 'zweite', 'dritte', 'vierte', 'fünfte', 'sechste', 'siebte', 'achte'],
  en: ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'],
  it: ['', 'prima', 'seconda', 'terza', 'quarta', 'quinta', 'sesta', 'settima', 'ottava'],
};

/**
 * Abstände der drei Stufen nach dem Tempo statt nur zwei Bänder (Klassiker: bei 100 km/h kam die Ansage zu
 * spät, im Ort zu früh). Gerechnet in Sekunden bis zum Manöver: weit etwa 30 s, nah etwa 11 s, jetzt etwa 3,5 s
 * (so lange dauert der Satz), jeweils mit Unter und Obergrenze. 30 km/h: 400, 100, 30 m; 50 km/h: 417, 153,
 * 49 m; 100 km/h: 833, 306, 97 m; 130 km/h: 1083, 397, 120 m.
 */
export function thresholds(speedKmh: number | null): Record<Stage, number> {
  const v = Math.max(0, speedKmh ?? 0) / 3.6;
  const clamp = (x: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(hi, x)));
  return { weit: clamp(v * 30, 400, 1500), nah: clamp(v * 11, 100, 500), jetzt: clamp(v * 3.5, 30, 120) };
}

/** Abstand zum folgenden Manöver, ab dem es gleich mit angesagt wird */
const THEN_SOON_M = 120;
const THEN_M = 350;

/** Folgemanöver kurz danach: "Dann sofort links abbiegen." (Klassiker: das zweite Manöver kam zu spät) */
export function thenPhrase(m: Maneuver, after: Maneuver | undefined): string {
  // geradeaus weiter ist kein eigenes Manöver, das man vorbereiten muss
  if (!after || after.kind === 'start' || after.kind === 'zwischenziel' || after.kind === 'geradeaus') return '';
  const gap = (after.km - m.km) * 1000;
  if (gap > THEN_M) return '';
  if (after.kind.startsWith('ziel')) return ` ${t('Dann bist du am Ziel.')}`;
  const now = t('Jetzt');
  const n = nowPhrase(after);
  const short = n.startsWith(`${now} `) ? n.slice(now.length + 1) : n;
  return ` ${gap <= THEN_SOON_M ? t('Dann sofort') : t('Danach')} ${short}`;
}

/** Spur Hinweis aus den Kartendaten: links, rechts oder in der Mitte einordnen */
export function lanePhrase(m: Maneuver): string {
  const l = m.lanes;
  if (!l || l.length < 2) return '';
  const use = l.map((x) => x.use);
  const first = use.indexOf(true);
  const last = use.lastIndexOf(true);
  if (first < 0) return '';
  if (first === 0 && last < l.length - 1) return last === 0 ? ` ${t('Benutze die linke Spur.')}` : ` ${t('Bitte links einordnen.')}`;
  if (last === l.length - 1 && first > 0) return first === l.length - 1 ? ` ${t('Benutze die rechte Spur.')}` : ` ${t('Bitte rechts einordnen.')}`;
  if (first > 0 && last < l.length - 1) return ` ${t('Benutze die mittlere Spur.')}`;
  return '';
}

/** "300 Metern", "1 Kilometer", "1,5 Kilometern" */
function distanceWords(m: number): string {
  const lang = getLang();
  if (m >= 950) {
    const km = Math.round(m / 500) / 2;
    const n = lang === 'en' ? String(km) : String(km).replace('.', ',');
    if (lang === 'en') return km === 1 ? '1 kilometre' : `${n} kilometres`;
    if (lang === 'it') return km === 1 ? '1 chilometro' : `${n} chilometri`;
    return km === 1 ? '1 Kilometer' : `${n} Kilometern`;
  }
  const r = m >= 200 ? Math.round(m / 100) * 100 : Math.max(10, Math.round(m / 10) * 10);
  return lang === 'en' ? `${r} metres` : lang === 'it' ? `${r} metri` : `${r} Metern`;
}

/** Erstes Wort klein schreiben, damit "In 300 Metern rechts abbiegen" flüssig klingt. */
function lowerFirst(s: string): string {
  // Englisch und Italienisch: Valhalla beginnt mit dem Verb ("Turn right", "Svolta a destra")
  if (getLang() !== 'de') return s.charAt(0).toLowerCase() + s.slice(1);
  const first = s.split(' ')[0];
  const lower = ['Rechts', 'Links', 'In', 'Auf', 'Scharf', 'Leicht', 'Nach', 'Geradeaus', 'Weiter', 'Aus', 'Bleiben', 'Halten', 'Den', 'Die', 'Der', 'Das', 'Zum', 'Zur', 'Wenden', 'Ziel'];
  return lower.includes(first) ? first.toLowerCase() + s.slice(first.length) : s;
}

/** Kurze Ansage direkt am Manöver. */
export function nowPhrase(m: Maneuver): string {
  if (m.back) return t('Du bist wieder auf der Tour.');
  switch (m.kind) {
    case 'links':
      return t('Jetzt links abbiegen.');
    case 'rechts':
      return t('Jetzt rechts abbiegen.');
    case 'leicht_links':
      return t('Jetzt leicht links halten.');
    case 'leicht_rechts':
      return t('Jetzt leicht rechts halten.');
    case 'scharf_links':
      return t('Jetzt scharf links abbiegen.');
    case 'scharf_rechts':
      return t('Jetzt scharf rechts abbiegen.');
    case 'wenden':
    case 'wenden_rechts':
      return t('Jetzt wenden.');
    case 'rechts_halten':
      return t('Jetzt rechts halten.');
    case 'links_halten':
      return t('Jetzt links halten.');
    case 'einfaedeln_rechts':
    case 'einfaedeln_links':
      return t('Jetzt einfädeln.');
    case 'kreisverkehr_verlassen':
      return t('Jetzt den Kreisverkehr verlassen.');
    case 'faehre_an_bord':
      return t('Jetzt auf die Fähre.');
    case 'faehre_verlassen':
      return t('Jetzt die Fähre verlassen.');
    case 'kreisverkehr':
      return m.exit && m.exit < ORDINALS.de.length
        ? t('Jetzt in den Kreisverkehr, {n} Ausfahrt nehmen.', { n: ORDINALS[getLang()][m.exit] })
        : t('Jetzt in den Kreisverkehr fahren.');
    case 'auffahrt':
    case 'auffahrt_rechts':
    case 'auffahrt_links':
      return t('Jetzt auffahren.');
    case 'abfahrt':
    case 'abfahrt_rechts':
    case 'abfahrt_links':
      return t('Jetzt abfahren.');
    case 'ziel':
    case 'ziel_links':
    case 'ziel_rechts':
      return t('Du bist am Ziel.');
    case 'zwischenziel':
      return t('Du bist jetzt auf der Tour.');
    default:
      return t('Jetzt geradeaus weiter.');
  }
}

/** Vorankündigung mit Entfernung. */
export function aheadPhrase(m: Maneuver, distM: number): string {
  const base = m.kind === 'ziel' || m.kind === 'ziel_links' || m.kind === 'ziel_rechts' ? t('bist du am Ziel.') : lowerFirst(m.speech);
  return t('In {dist} {base}', { dist: distanceWords(distM), base });
}

/**
 * Rang einer Ansage (Koray 14.11.: Folgeansagen wurden abgeschnitten). 0: Hinweise wie Highlights, Gruppe,
 * Kurven; 1: Navigation. Eine neue Ansage stellt sich hinten an. Nur eine dringende Navigationsansage
 * ("jetzt abbiegen") darf laufende Hinweise abbrechen, nie eine andere Navigationsansage.
 */
export type SpeechRank = 0 | 1;

export function createVoiceGuide(
  speak: (text: string, rank: SpeechRank) => void = defaultSpeak,
  stopSpeech: () => void = defaultStop,
  navPlaying: () => boolean = navigationSpeaking,
): VoiceGuide {
  let enabled = true;
  const done = new Set<string>();

  const say = (text: string, interrupt = false, rank: SpeechRank = 1) => {
    if (!enabled) return;
    if (interrupt && !navPlaying()) stopSpeech();
    speak(text, rank);
  };

  return {
    update(route, next, distToNextM, speedKmh) {
      if (distToNextM == null) return;
      const m = route.maneuvers[next];
      if (!m || m.kind === 'start') return;
      const th = thresholds(speedKmh);
      let stage: Stage | null = null;
      if (distToNextM <= th.jetzt) stage = 'jetzt';
      else if (distToNextM <= th.nah) stage = 'nah';
      else if (distToNextM <= th.weit) stage = 'weit';
      if (!stage) return;
      // Schlüssel nach der Lage des Manövers, nicht nach seiner Nummer: ergänzte Manöver (Gabelungen) verschieben
      // die Nummern, sonst käme eine Ansage doppelt
      const id = `${m.km.toFixed(3)}|${m.kind}`;
      const key = `${id}:${stage}`;
      if (done.has(key)) return;
      // übersprungene größere Stufen gelten als erledigt
      done.add(key);
      if (stage !== 'weit') done.add(`${id}:weit`);
      if (stage === 'jetzt') done.add(`${id}:nah`);
      // Ankunft sagt die Navigation selbst an, sobald der Status wechselt
      if (m.kind.startsWith('ziel') && stage === 'jetzt') return;
      // Ziel kurz nach dem letzten Abbiegen: "Dann bist du am Ziel" kam schon, die frühe Vorankündigung entfällt
      const prev = route.maneuvers[next - 1];
      if (m.kind.startsWith('ziel') && stage === 'weit' && prev && (m.km - prev.km) * 1000 <= THEN_M) return;
      // Bei sehr kurzem Abstand zur Vorankündigung lohnt "weit" nicht
      if (stage === 'weit' && distToNextM < th.nah * 1.5) return;
      const after = route.maneuvers[next + 1];
      const text =
        stage === 'jetzt'
          ? nowPhrase(m) + thenPhrase(m, after)
          : aheadPhrase(m, distToNextM) + (stage === 'nah' ? lanePhrase(m) : '') + thenPhrase(m, after);
      say(text, stage === 'jetzt');
    },
    say,
    setEnabled(on) {
      enabled = on;
      if (!on) stopSpeech();
    },
    reset() {
      done.clear();
    },
    stop() {
      stopSpeech();
    },
  };
}

type AudioModule = typeof import('expo-audio');
let audio: AudioModule | null | undefined;
function getAudio(): AudioModule | null {
  if (audio !== undefined) return audio;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional, ältere Builds ohne das Paket
    audio = require('expo-audio') as AudioModule;
  } catch {
    audio = null; // ältere Builds ohne expo-audio
  }
  return audio;
}

/**
 * Musik (Spotify, Apple Music) während der Ansage nur leiser stellen und danach wieder freigeben.
 * Ohne das hält iOS die Audiositzung der App aktiv und andere Apps pausieren dauerhaft.
 *
 * Warteschlange wie die von iOS: der erste Eintrag läuft gerade, die anderen warten in dieser Reihenfolge.
 * Abgebrochene Einträge melden sich über onStopped noch einmal und werden dann ignoriert.
 */
type Spoken = { text: string; rank: SpeechRank; dead: boolean };
let queue: Spoken[] = [];
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * Funk an: die Tonsitzung gehört dem Funk (Aufnehmen und Abspielen). Die Ansagen dürfen sie dann weder auf
 * "nur abspielen" umstellen noch abschalten, sonst ist das Mikrofon tot und der Funk stumm (Koray 15.11.:
 * beide verbunden, aber keine Tonspur kam beim Server an).
 */
let heldByFunk = false;
export function holdAudioSession(on: boolean) {
  heldByFunk = on;
  // Der Funk stellt die Sitzung auf seine Art ein: danach muss die nächste Ansage sie wieder selbst einstellen
  sessionOn = false;
  if (on && releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
}
/**
 * Läuft die Tonsitzung schon? Dann nicht neu einstellen (Koray 21.11., Testfahrt mit CarPlay: „… in Richtung
 * Lampertheim nehmen“ brach vor „Lampertheim“ ab). Jede neue Ansage in der Warteschlange stellte die Sitzung neu ein,
 * während die vorige noch lief; im Auto baut das den Tonweg kurz um und schneidet das Ende der laufenden Ansage ab.
 */
let sessionOn = false;
/**
 * Wohin der Ton geht (gesetzt von lib/carplay.ts). carPlay: Das Autodisplay ist verbunden. session: Tonsitzung für
 * Ansagen aus dem eigenen Modul (ab Build 43: Kategorie playback, Modus voicePrompt, wie Apple es für
 * Navigations Apps in CarPlay verlangt); ohne sie die allgemeine Tonsitzung von expo-audio.
 */
const output: { carPlay: boolean; session: ((on: boolean) => void) | null } = { carPlay: false, session: null };
export function setVoiceOutput(o: { carPlay?: boolean; session?: (on: boolean) => void }) {
  if (o.carPlay != null) output.carPlay = o.carPlay;
  if (o.session) output.session = o.session;
}
/**
 * So lange nach dem Ende der letzten Ansage bleibt der Ton belegt. Im Auto 3,5 Sekunden (Koray 21.11., Testfahrten mit
 * CarPlay: „nach links ab“ statt „abbiegen“, „Richtung Lampertheim nehmen“ ohne Ende): iOS meldet das Ende, sobald
 * es die Ansage abgegeben hat; über CarPlay ist sie dann noch unterwegs zum Lautsprecher, und mit 1,5 Sekunden wurde
 * ihr Schluss mit der Freigabe abgeschnitten. Die Musik bleibt dafür im Auto zwei Sekunden länger leise.
 */
export const releaseDelayMs = (carPlay: boolean) => (carPlay ? 3500 : 1500);
function audioOn() {
  if (heldByFunk) return;
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = null;
  if (output.session) {
    if (!sessionOn) output.session(true);
    sessionOn = true;
    return;
  }
  const a = getAudio();
  if (!a) return;
  if (sessionOn) return;
  sessionOn = true;
  void a.setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers', shouldPlayInBackground: true }).catch(() => {});
  void a.setIsAudioActiveAsync(true).catch(() => {});
}
function audioOff() {
  if (heldByFunk) return;
  const a = output.session ? null : getAudio();
  if (!a && !output.session) return;
  // warten, bis die Ansage ganz zu hören war und falls gleich die nächste kommt
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    if (queue.length > 0 || heldByFunk) return;
    sessionOn = false;
    if (output.session) output.session(false);
    else void a?.setIsAudioActiveAsync(false).catch(() => {});
  }, releaseDelayMs(output.carPlay));
}

/** Läuft gerade eine Navigationsansage oder wartet eine? Dann wird nichts abgebrochen. */
export function navigationSpeaking(): boolean {
  return queue.some((x) => x.rank === 1);
}

function enqueue(item: Spoken) {
  queue.push(item);
  audioOn();
  const done = (how: 'ende' | 'abbruch' | 'fehler') => () => {
    if (item.dead) return;
    item.dead = true;
    queue = queue.filter((x) => x !== item);
    // Ende jeder Ansage ins Fahrtprotokoll (Koray 21.11.: abgeschnittene Ansagen ließen sich nicht nachvollziehen)
    bbLog('say', [how, item.text.slice(-24)]);
    if (!queue.length) audioOff();
  };
  Speech.speak(item.text, { language: SPEECH_LANG[getLang()], voice: chosenVoiceId(), rate: 1.0, volume: voiceVolume(), onDone: done('ende'), onStopped: done('abbruch'), onError: done('fehler') });
}

function defaultSpeak(text: string, rank: SpeechRank = 0) {
  try {
    // Navigationsansagen haben Vorrang (Koray 15.11.): läuft gerade ein Hinweis (Kurve, Bremsen, Highlight),
    // wird er abgebrochen, statt die Abbiegeansage hinter sich warten zu lassen. Läuft gerade eine
    // Navigationsansage, darf nichts sie abschneiden (Koray 15.11.: "abbiegen" endete nach "ab"): dann nur
    // anhängen. Wartende Navigationsansagen überleben den Abbruch und kommen danach wieder dran.
    if (rank === 1 && queue.length && queue[0].rank !== 1) {
      const keep = queue.filter((x) => x.rank === 1).map((x) => x.text);
      defaultStop();
      for (const t of keep) enqueue({ text: t, rank: 1, dead: false });
    }
    enqueue({ text, rank, dead: false });
  } catch {
    // Sprachausgabe ist nicht wichtig genug, um die Navigation zu stören
  }
}

function defaultStop() {
  for (const x of queue) x.dead = true;
  queue = [];
  Speech.stop().catch(() => {});
  audioOff();
}

/** Freie Ansage außerhalb der Navigation (zum Beispiel Gruppennachrichten), mit leiserer Musik. */
export const speakText = (text: string, rank: SpeechRank = 0) => defaultSpeak(text, rank);
