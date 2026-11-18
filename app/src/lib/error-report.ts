/**
 * Absturzberichte (Koray 17.11., Nutzerstimmen der Wettbewerber: Abstürze und Hänger kosten die meisten Sterne).
 * Fehler im JavaScript der App gehen an Supabase (report_app_error, Tabelle app_errors), gleiche Fehler je Version
 * zusammengezählt. Ein Absturz beendet die App oft, bevor das Netz antwortet: darum wird er zuerst in eine kleine
 * Datei geschrieben und beim nächsten Start gesendet.
 *
 * Bewusst ohne Fremdanbieter (kein Konto, kein neuer Build nötig). Native Abstürze meldet Apple in App Store Connect.
 * Gesendet werden nur Meldung, Stapel, Version, Bildschirm und Betriebssystem, keine Standorte oder Inhalte.
 */
import { Platform } from 'react-native';

import { errorFingerprint } from './error-fingerprint';
import { appVersion } from './feedback';
import { isOffline } from './friendly-error';
import { supabase } from './supabase';

type Report = { fingerprint: string; message: string; stack: string | null; fatal: boolean; version: string; context: Record<string, unknown> };

type FileApi = { File: new (...a: unknown[]) => { exists: boolean; textSync(): string; create(): void; write(s: string): void; delete(): void }; Paths: { document: unknown } };
let fs: FileApi | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  fs = require('expo-file-system') as FileApi;
} catch {
  fs = null;
}
const PENDING = 'cumo-absturz.json';

/** schon in dieser Sitzung gemeldet: nicht noch einmal */
const sent = new Set<string>();
let screen: string | null = null;

/** aktueller Bildschirm für den Bericht (aus dem Layout gesetzt) */
export function setErrorScreen(path: string | null) {
  screen = path;
}

function build(error: unknown, fatal: boolean, extra?: Record<string, unknown>): Report {
  const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
  const message = `${e.name && e.name !== 'Error' ? e.name + ': ' : ''}${e.message || 'Unbekannter Fehler'}`;
  return {
    fingerprint: errorFingerprint(message, e.stack),
    message: message.slice(0, 500),
    stack: e.stack ? e.stack.slice(0, 4000) : null,
    fatal,
    version: appVersion(),
    context: { screen, os: `${Platform.OS} ${Platform.Version}`, ...extra },
  };
}

async function send(r: Report): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('report_app_error', {
      p_fingerprint: r.fingerprint,
      p_message: r.message,
      p_stack: r.stack,
      p_fatal: r.fatal,
      p_version: r.version,
      p_context: r.context,
    });
    return !error;
  } catch {
    return false;
  }
}

function keep(r: Report) {
  try {
    if (!fs) return;
    const f = new fs.File(fs.Paths.document, PENDING);
    if (f.exists) f.delete();
    f.create();
    f.write(JSON.stringify(r));
  } catch {
    // ohne Datei geht nur dieser eine Bericht verloren
  }
}

/** Fehler melden, etwa aus einer Fehlergrenze; nie werfend */
export function reportError(error: unknown, opts?: { fatal?: boolean; extra?: Record<string, unknown> }): void {
  try {
    const r = build(error, !!opts?.fatal, opts?.extra);
    if (sent.has(r.fingerprint)) return;
    sent.add(r.fingerprint);
    if (r.fatal) keep(r);
    void send(r).then((ok) => {
      if (ok && r.fatal) dropPending();
    });
  } catch {
    // Melden darf selbst nie stören
  }
}

function dropPending() {
  try {
    if (!fs) return;
    const f = new fs.File(fs.Paths.document, PENDING);
    if (f.exists) f.delete();
  } catch {
    // egal
  }
}

let installed = false;

/** Einmal beim Start: globale Fehler abfangen und einen Absturz vom letzten Mal nachsenden */
export function installErrorReporting(): void {
  if (installed || Platform.OS === 'web') return;
  installed = true;
  try {
    if (fs) {
      const f = new fs.File(fs.Paths.document, PENDING);
      if (f.exists) {
        const r = JSON.parse(f.textSync()) as Report;
        void send(r).then((ok) => ok && dropPending());
      }
    }
  } catch {
    dropPending();
  }
  const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void } };
  const eu = g.ErrorUtils;
  if (!eu) return;
  const prev = eu.getGlobalHandler();
  eu.setGlobalHandler((e, fatal) => {
    reportError(e, { fatal: !!fatal });
    prev(e, fatal);
  });
  trackRejections();
}

/**
 * Abgelehnte Promises, die niemand abfängt (Prüfung 18.11.): React Native meldet sie nur in der Entwicklung.
 * Im fertigen Build hängen wir uns an Hermes, sonst bleibt ein Fehler in einem `void laden()` unsichtbar.
 * Fehlendes Netz und abgebrochene Anfragen sind kein Fehler der App und werden nicht gemeldet.
 */
function trackRejections() {
  if (__DEV__) return;
  const h = (globalThis as unknown as { HermesInternal?: { enablePromiseRejectionTracker?: (o: { allRejections: boolean; onUnhandled: (id: number, rejection: unknown) => void; onHandled: (id: number) => void }) => void } }).HermesInternal;
  try {
    h?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id, rejection) => {
        if (rejection == null || isOffline(rejection)) return;
        if (rejection instanceof Error && rejection.name === 'AbortError') return;
        reportError(rejection, { extra: { promise: true } });
      },
      onHandled: () => undefined,
    });
  } catch {
    // ohne Hermes bleibt es beim bisherigen Stand
  }
}
