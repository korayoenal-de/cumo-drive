/**
 * Fahrtstatistik für Autos, berechnet aus den GPS Punkten der Navigation:
 * Strecke, Fahrzeit in Bewegung, Schnitt, Höchstgeschwindigkeit, größte Querbeschleunigung
 * (statt Schräglage beim Motorrad), stärkste Bremsung und Beschleunigung, Kurven.
 *
 * Querbeschleunigung a = v · ω (Tempo mal Drehrate der Fahrtrichtung). Bei einem GPS Punkt pro
 * Sekunde ist das geglättet und eher etwas zu niedrig; Ausreißer über 1,6 g gelten als Messfehler.
 */
import { countCurves } from './stats';
import { haversine, type LatLon } from './tour';

export type Sample = { t: number; p: LatLon; v: number | null; h: number | null };
export type Peak = { value: number; p: LatLon };
export type RideStats = {
  km: number;
  movingMin: number;
  avgKmh: number;
  maxKmh: Peak | null;
  maxLatG: (Peak & { side: 'links' | 'rechts' }) | null;
  maxBrakeG: Peak | null;
  maxAccelG: Peak | null;
  curves: number;
};

const G = 9.81;

function bearing(a: LatLon, b: LatLon): number {
  const φ1 = (a[0] * Math.PI) / 180;
  const φ2 = (b[0] * Math.PI) / 180;
  const Δλ = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const wrap = (d: number) => ((d + 540) % 360) - 180;

export function rideStats(samples: Sample[]): RideStats | null {
  if (samples.length < 5) return null;
  let km = 0;
  let movingS = 0;
  // Tempo in m/s je Punkt: GPS Wert, sonst aus Abstand und Zeit
  const v: number[] = samples.map((s, i) => {
    if (s.v != null) return s.v / 3.6;
    if (i === 0) return 0;
    const dt = (s.t - samples[i - 1].t) / 1000;
    return dt > 0 ? haversine(samples[i - 1].p, s.p) / dt : 0;
  });
  // Richtung je Punkt aus der Bewegung über drei Punkte (stabiler als der GPS Kurs bei wenig Tempo)
  const h: number[] = samples.map((s, i) => {
    const a = samples[Math.max(0, i - 1)].p;
    const b = samples[Math.min(samples.length - 1, i + 1)].p;
    return haversine(a, b) > 3 ? bearing(a, b) : (s.h ?? 0);
  });

  let maxKmh: Peak | null = null;
  let maxLatG: RideStats['maxLatG'] = null;
  let maxBrakeG: Peak | null = null;
  let maxAccelG: Peak | null = null;

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dt = (b.t - a.t) / 1000;
    const d = haversine(a.p, b.p);
    km += d / 1000;
    if (v[i] > 1.5 && dt > 0 && dt < 30) movingS += dt;
    const kmh = v[i] * 3.6;
    if (kmh < 330 && (!maxKmh || kmh > maxKmh.value)) maxKmh = { value: kmh, p: b.p };
    if (dt < 0.5 || dt > 5) continue;
    // längs: Bremsen und Beschleunigen
    const along = (v[i] - v[i - 1]) / dt / G;
    if (Math.abs(along) < 1.6) {
      if (along < 0 && (!maxBrakeG || -along > maxBrakeG.value)) maxBrakeG = { value: -along, p: b.p };
      if (along > 0 && (!maxAccelG || along > maxAccelG.value)) maxAccelG = { value: along, p: b.p };
    }
    // quer: Tempo mal Drehrate
    const vm = (v[i] + v[i - 1]) / 2;
    if (vm < 4) continue;
    const omega = (wrap(h[i] - h[i - 1]) * Math.PI) / 180 / dt;
    const lat = (vm * omega) / G;
    if (Math.abs(lat) < 1.6 && (!maxLatG || Math.abs(lat) > maxLatG.value)) {
      maxLatG = { value: Math.abs(lat), p: b.p, side: lat < 0 ? 'links' : 'rechts' };
    }
  }

  const movingMin = movingS / 60;
  return {
    km,
    movingMin,
    avgKmh: movingS > 0 ? km / (movingS / 3600) : 0,
    maxKmh,
    maxLatG,
    maxBrakeG,
    maxAccelG,
    curves: countCurves(samples.map((s) => s.p)),
  };
}

export const fmtG = (g: number) => `${g.toFixed(2).replace('.', ',')} g`;
