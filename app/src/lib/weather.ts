/**
 * Wetter an den Pässen der Route (Apple WeatherKit über das inline Modul CumoWeather, app/weather/).
 * Für jeden Pass zählt die Vorhersage zur geschätzten Ankunft: "wenn du jetzt losfährst" plus die
 * geplante Fahrzeit bis dorthin. Ohne das Modul (ältere Builds, Web) gibt es einfach kein Wetter.
 * Ergebnisse werden je Pass und Stunde zwischengespeichert, damit das Neuzeichnen nichts kostet.
 */
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { Pass } from './passes';

export type PassWeather = {
  temp: number;
  feels: number;
  /** 0 bis 1 */
  precipChance: number;
  precipMm: number;
  wind: number;
  gust: number;
  /** SF Symbol Name von Apple, etwa cloud.rain */
  symbol: string;
  condition: string;
  snow: boolean;
  /** Zeitpunkt der Vorhersage (ms) */
  at: number;
};

type Raw = Omit<PassWeather, 'at'> & { ok: boolean; time?: number };
type Mod = {
  forecast(points: number[][]): Promise<Raw[]>;
  attribution(): Promise<{ legalUrl: string; markDark?: string; markLight?: string; name: string }>;
};

const native: Mod | null = Platform.OS === 'ios' ? requireOptionalNativeModule<Mod>('CumoWeather') : null;

export const weatherAvailable = !!native;

const cache = new Map<string, PassWeather | null>();
const keyOf = (id: string, at: number) => `${id}@${Math.floor(at / 3600000)}`;

/** Wetter für Pässe zu ihrer Ankunftszeit (ms). Fehlt etwas, steht null. */
export async function passWeather(list: { pass: Pass; at: number }[]): Promise<Map<string, PassWeather | null>> {
  const out = new Map<string, PassWeather | null>();
  if (!native || !list.length) return out;
  const todo = list.filter((x) => !cache.has(keyOf(x.pass.id, x.at)));
  if (todo.length) {
    try {
      const res = await native.forecast(todo.map((x) => [x.pass.lat, x.pass.lon, x.pass.ele, x.at / 1000]));
      todo.forEach((x, i) => {
        const r = res[i];
        cache.set(keyOf(x.pass.id, x.at), r?.ok ? { ...r, at: (r.time ?? x.at / 1000) * 1000 } : null);
      });
    } catch {
      return out;
    }
  }
  for (const x of list) out.set(x.pass.id, cache.get(keyOf(x.pass.id, x.at)) ?? null);
  return out;
}

let attributionCache: { legalUrl: string; markDark?: string; name: string } | null = null;
export async function weatherAttribution() {
  if (attributionCache) return attributionCache;
  if (!native) return null;
  try {
    attributionCache = await native.attribution();
  } catch {
    attributionCache = { legalUrl: 'https://weatherkit.apple.com/legal-attribution.html', name: 'Apple Wetter' };
  }
  return attributionCache;
}

/**
 * Echter Grund für einen auffälligen Hinweis (Schwellen aus dem Konzept vom 6.11.):
 * unter 4 Grad, Regen ab 60 %, Schnee oder Böen ab 60 km/h.
 */
export function weatherReason(w: PassWeather): string | null {
  if (w.snow && w.precipChance >= 0.3) return 'Schnee';
  if (w.temp < 1) return 'Glätte möglich';
  if (w.precipChance >= 0.6) return 'Regen';
  if (w.gust >= 60) return 'Sturmböen';
  if (w.temp < 4) return 'kalt';
  return null;
}

export function fmtTemp(t: number): string {
  return `${Math.round(t)}°`;
}
