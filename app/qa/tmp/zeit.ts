import { smartRoundTrip, spurKm } from '../../src/lib/smart-roundtrip';
import { DEFAULT_AVOID } from '../../src/lib/valhalla';
import { buildCases } from '../daily/cases';
(async () => {
  const want = (process.argv[2] ?? 'Linthal 220,Bonneval 270,Bonneval 240,Sölden 110').split(',');
  const cases = buildCases(20261119).filter((c: any) => c.kind === 'runde' && want.some((w) => c.name.includes(w)));
  for (const c of cases as any[]) {
    const t0 = Date.now();
    try {
      const t = await smartRoundTrip({ name: c.name, start: c.start, km: c.km, direction: c.direction, profile: c.profile, avoid: DEFAULT_AVOID, seed: c.seed });
      console.log('==', c.name, c.direction, 'seed', c.seed, '->', t.laenge_km.toFixed(0), 'km, spur', spurKm(t).toFixed(1), 'km,', ((Date.now() - t0) / 1000).toFixed(1), 's');
    } catch (e) {
      console.log('==', c.name, 'Fehler', (e as Error).message, ((Date.now() - t0) / 1000).toFixed(1), 's');
    }
  }
})();
