/**
 * Welche Wetter Plaketten auf die Karte kommen (Koray 20.11.2026, Vogesen Karussell: zu viele).
 *
 * 1. Wichtiges zuerst: Schnee, Glätte, Sturm, Regen, kalt; danach Ikonen und bekannte Pässe, dann die Höhe.
 * 2. Abstand: zwischen zwei Plaketten mindestens 25 km entlang der Route (Korays Regel).
 * 3. Nichts Doppeltes: ohne Warnung entfällt eine Plakette, wenn eine gewählte in der Nähe (60 km) dasselbe
 *    Symbol und höchstens 2 Grad Unterschied zeigt.
 * 4. Höchstens fünf. Was nicht auf die Karte kommt, fasst weatherNote als eine Zeile fürs Blatt zusammen.
 * Bildschirmabstand (Zoom, Abstand zu START und ZIEL) prüft die Karte selbst (weather-layer.tsx).
 */
import type { PassTier } from './passes';

export type WeatherCandidate = {
  id: string;
  name: string;
  km: number;
  ele: number;
  tier: PassTier;
  symbol: string;
  temp: number;
  reason: string | null;
};

const REASON_RANK: Record<string, number> = { Schnee: 5, 'Glätte möglich': 4, Sturmböen: 3, Regen: 2, kalt: 1 };
const TIER_RANK: Record<string, number> = { ikone: 3, bekannt: 2, mittel: 1 };

export const WEATHER_MIN_KM = 25;
export const WEATHER_MAX = 5;

/** Reihenfolge nach Wichtigkeit: Grund, dann Stufe, dann Höhe */
export function weatherRank(c: WeatherCandidate): number {
  return (c.reason ? (REASON_RANK[c.reason] ?? 1) : 0) * 100000 + (TIER_RANK[c.tier] ?? 0) * 10000 + c.ele;
}

/** Ausgewählte Plaketten, wichtigste zuerst */
export function pickWeather<T extends WeatherCandidate>(items: T[], minKm = WEATHER_MIN_KM, max = WEATHER_MAX): T[] {
  const chosen: T[] = [];
  for (const c of [...items].sort((a, b) => weatherRank(b) - weatherRank(a))) {
    if (chosen.length >= max) break;
    if (chosen.some((k) => Math.abs(k.km - c.km) < minKm)) continue;
    if (!c.reason && chosen.some((k) => Math.abs(k.km - c.km) < 60 && k.symbol === c.symbol && Math.abs(k.temp - c.temp) <= 2)) continue;
    chosen.push(c);
  }
  return chosen;
}

/** Eine Zeile fürs Blatt: alle Warnungen entlang der Route, je Grund die Pässe, z. B. „Glätte möglich am Grand Ballon“ */
export function weatherNote(items: WeatherCandidate[], tr: (s: string, v?: Record<string, string>) => string): string | null {
  const byReason = new Map<string, string[]>();
  for (const c of [...items].sort((a, b) => a.km - b.km)) {
    if (!c.reason) continue;
    const list = byReason.get(c.reason) ?? [];
    if (!list.includes(c.name)) list.push(c.name);
    byReason.set(c.reason, list);
  }
  if (!byReason.size) return null;
  const parts = [...byReason.entries()]
    .sort((a, b) => (REASON_RANK[b[0]] ?? 0) - (REASON_RANK[a[0]] ?? 0))
    .map(([reason, names]) =>
      names.length > 2
        ? tr('{reason} am {name} und an {n} weiteren Pässen', { reason: tr(reason), name: names[0], n: String(names.length - 1) })
        : tr('{reason} am {name}', { reason: tr(reason), name: names.join(tr(' und am ')) }),
    );
  return parts.join(' · ');
}
