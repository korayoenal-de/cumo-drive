/**
 * Anzeige Formate für die Navigation (deutsch, Komma als Dezimalzeichen).
 */
import { fahrzeit } from '@/lib/format';
import { decimal } from '@/i18n';

/** Distanz bis zum Manöver: "40 m", "400 m", ab 1000 m "1,2 km", ab 10 km "12 km". */
export function formatDistance(m: number | null): { value: string; unit: string } {
  if (m == null || !isFinite(m)) return { value: '', unit: '' };
  if (m < 1000) {
    const step = m < 300 ? 10 : 50;
    return { value: String(Math.max(0, Math.round(m / step) * step)), unit: 'm' };
  }
  const km = m / 1000;
  if (km < 10) return { value: decimal(km.toFixed(1)), unit: 'km' };
  return { value: String(Math.round(km)), unit: 'km' };
}

/** Uhrzeit "14:05". */
export function formatClock(d: Date | null): string {
  if (!d) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Restzeit bis zur Ankunft: "35 min", "1:20 h" (Konsistenzprüfung 15.11., K2) */
export function formatRemaining(eta: Date | null, now: number): string {
  if (!eta) return '';
  return fahrzeit((eta.getTime() - now) / 60000);
}
