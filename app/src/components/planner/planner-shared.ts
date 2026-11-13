/**
 * Gemeinsame Typen und Helfer des Planers: Punkte, Etappenprofile, Ortsvorschläge, Pass Abgleich.
 */
import { useEffect, useMemo, useState } from 'react';

import { passPoint, type Pass } from '@/lib/passes';
import { Colors } from '@/constants/theme';
import { searchPlaces, type Place } from '@/lib/geocode';
import { searchAddress } from '@/lib/address-search';
import { type PlanStep } from '@/lib/plan';
import { resample } from '@/lib/stats';
import { haversine, PROFILES, type LatLon, type Profile, type Tour } from '@/lib/tour';

export const WARN = Colors.warn;

/**
 * Ortsvorschläge beim Tippen: ab zwei Zeichen, 300 ms nach dem letzten Tastendruck,
 * ältere Anfragen werden abgebrochen. Bis neue Treffer da sind, bleiben die letzten stehen.
 *
 * along (13.11.): Gibt es schon eine Route, sucht die Ortssuche zusätzlich an drei Stellen entlang der Strecke
 * und sortiert Treffer bis ALONG_KM neben der Linie nach vorne. So findet "Sankt Leonhard" beim Zwischenziel
 * den Ort an der Strecke im Passeiertal und nicht den gleichnamigen am Standort.
 */
const ALONG_KM = 20;

export function usePlaceSuggest(query: string, near?: LatLon, along?: LatLon[]) {
  const q = query.trim();
  const enough = q.length >= 2;
  const [res, setRes] = useState<{ q: string; hits: Place[] } | null>(null);
  // drei Stützpunkte bei einem, zwei und drei Vierteln der Strecke (nur neu, wenn sich die Route ändert)
  const probes = useMemo(() => {
    if (!along || along.length < 2) return [] as LatLon[];
    const cum = [0];
    for (let i = 1; i < along.length; i++) cum.push(cum[i - 1] + haversine(along[i - 1], along[i]));
    const total = cum[cum.length - 1];
    if (total < 5000) return [] as LatLon[];
    return [0.25, 0.5, 0.75].map((f) => along[Math.max(0, cum.findIndex((c) => c >= f * total))]);
  }, [along]);
  const line = useMemo(() => (along && along.length > 1 ? resample(along, 1000) : null), [along]);
  useEffect(() => {
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      // Adresse mit Hausnummer: zusätzlich der Geocoder des Geräts, seine Treffer zuerst
      const nearRoute = probes.map((p) => searchPlaces(q, p, ctrl.signal, [], true).catch(() => [] as Place[]));
      Promise.all([searchAddress(q, near, ctrl.signal).catch(() => [] as Place[]), searchPlaces(q, near, ctrl.signal).catch(() => [] as Place[]), ...nearRoute])
        .then(([addr, places, ...onRoute]) => {
          const near0 = (a: Place, b: Place) => Math.abs(a.p[0] - b.p[0]) + Math.abs(a.p[1] - b.p[1]) < 0.0005;
          const merged: Place[] = [];
          for (const x of [...addr, ...places, ...onRoute.flat()]) if (!merged.some((y) => near0(x, y) || (y.name === x.name && haversine(x.p, y.p) < 5000))) merged.push(x);
          let hits = merged;
          if (line) {
            // Treffer an der Strecke zuerst, sonst bleibt die Reihenfolge der Suche (genaue Namen vorne)
            const off = (p: LatLon) => Math.min(...line.map((l) => haversine(l, p)));
            const ranked = merged.map((x, i) => ({ x, i, on: off(x.p) <= ALONG_KM * 1000 }));
            hits = ranked.sort((a, b) => Number(b.on) - Number(a.on) || a.i - b.i).map((r) => r.x);
          }
          if (!ctrl.signal.aborted) setRes({ q, hits: hits.slice(0, 10) });
        })
        .catch(() => !ctrl.signal.aborted && setRes({ q, hits: [] }));
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, near, probes, line]);
  return { hits: enough && res ? res.hits : null, searching: enough && res?.q !== q };
}

/** Leere Tour für die Karte, solange nichts geplant ist */
export const EMPTY_TOUR: Tour = { name: '', laenge_km: 0, wegpunkte: [], linie: [], warnungen: [] };

/** Punkt, der auf seine Rolle wartet: aus dem langen Druck auf die Karte oder ein angetippter Pass. */
export type PendingPoint = { p: LatLon; name: string | null; pass?: Pass };

/** Ab diesem Abstand gilt ein Punkt der Planung als der Pass selbst (Meter). */
export const PASS_MATCH_M = 1000;

/** Stelle des Passes in der Punktliste oder -1. */
export function passIndex(pts: LatLon[], pass: Pass): number {
  const pp = passPoint(pass);
  return pts.findIndex((p) => haversine(p, pp) < PASS_MATCH_M);
}

/**
 * Grober Umweg in km, wenn der Punkt mit kleinstem Umweg eingefügt wird.
 * Luftlinie mal 1,4 als Schätzung für Straßen im Gebirge, auf 5 km gerundet.
 */
export function roughDetourKm(pts: LatLon[], p: LatLon): number | null {
  if (pts.length < 2) return null;
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    best = Math.min(best, haversine(pts[i - 1], p) + haversine(p, pts[i]) - haversine(pts[i - 1], pts[i]));
  }
  return Math.max(5, Math.round(((best / 1000) * 1.4) / 5) * 5);
}

/* Tour von Hand */

export const STEP_TEXT: Record<PlanStep, string> = {
  route: 'Route wird berechnet',
  traffic: 'Verkehrsmeldungen werden geprüft',
  compare: 'Beste Variante wird gewählt',
  check: 'Etappen Check läuft',
  fix: 'Gesperrte Stellen werden umfahren',
};

export const keyOf = (p: LatLon) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
export const samePts = (a: LatLon[], b: LatLon[]) => a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);

export type PointKind = 'start' | 'via' | 'ziel';

/** Profil einer Etappe; null heißt: das allgemeine Profil gilt. */
export type LegProfile = Profile | null;

/** Etappenprofile auf die Zahl der Etappen bringen (Zwischenziele plus eins). */
export function fitLegs(lp: LegProfile[], vias: number): LegProfile[] {
  const n = vias + 1;
  if (lp.length === n) return lp;
  if (lp.length > n) return lp.slice(0, n);
  return [...lp, ...Array<LegProfile>(n - lp.length).fill(lp[lp.length - 1] ?? null)];
}

export const profileWord = (p: Profile) => (PROFILES.find((x) => x.id === p)?.label ?? p).toLowerCase();

export type Mode = 'beschreiben' | 'rundtour' | 'tour';

/** Fahrzeit kompakt für große Zahlen, damit sie in eine Zeile passt: 2:11 h oder 45 min. */
export function bigDuration(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
}
