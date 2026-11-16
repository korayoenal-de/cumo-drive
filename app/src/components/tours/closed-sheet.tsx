/**
 * Gerade gesperrt (Koray 16.11.): Vor dem Losfahren prüfen, ob die Tour über eine gesperrte Straße führt.
 * Wenn ja, ausdrücklich warnen und die Umfahrung zeigen: Umfahren (mit km und wegfallenden Zwischenzielen)
 * oder wie geplant fahren. Die Tour selbst bleibt, wie sie ist (Wintersperren informieren nur).
 *
 * Ein Baustein für alle Starts: allein im Planer, als Lead einer Gruppenfahrt, als Lead einer Ausfahrt.
 * Im Auto (CarPlay) gibt es kein Blatt: dort fährt die App die Umfahrung mit Hinweis (live/carplay-start.ts).
 */
import { useState, type ReactNode } from 'react';

import { ActionSheet, SHEET_GONE_MS } from '@/components/ui/action-sheet';
import { closedOnTour, closureLabels, planAround, type PlannedTour } from '@/lib/plan';
import type { ClosureHit } from '@/lib/road-closures';
import { showToast } from '@/lib/toast';
import { formatKm, type Profile, type Tour } from '@/lib/tour';
import { DEFAULT_AVOID, type Avoid } from '@/lib/valhalla';

type Alt = { tour: PlannedTour; dropped: number };
type State = { tour: Tour; hits: ClosureHit[]; alt: Alt | null | false; go: (t: Tour, around: boolean) => void };

/** Kurzer Hinweis zur Umfahrung, für Blatt und Autodisplay */
export function aroundHint(alt: Alt, planned: number): string {
  const skip = alt.dropped ? `, ohne ${alt.dropped === 1 ? 'das Zwischenziel' : `${alt.dropped} Zwischenziele`} an der Sperrung` : '';
  return `${formatKm(alt.tour.laenge_km, 0)} km statt ${formatKm(planned, 0)} km${skip}`;
}

/**
 * check(tour, profile, avoid, go): ist nichts gesperrt, gleich go(tour, false). Sonst erscheint das Blatt;
 * go(umfahrung, true) oder go(tour, false), je nach Wahl. sheet gehört einmal in die Ansicht.
 */
export function useClosedCheck(): { check: (tour: Tour, profile: Profile, avoid: Avoid | undefined, go: State['go']) => Promise<void>; sheet: ReactNode } {
  const [s, setS] = useState<State | null>(null);

  const check = async (tour: Tour, profile: Profile, avoid: Avoid | undefined, go: State['go']) => {
    const hits = await closedOnTour(tour).catch(() => [] as ClosureHit[]);
    if (!hits.length) return go(tour, false);
    // kam der Start aus einem anderen Blatt (Ohne alle losfahren?), erst wenn das weg ist (iOS zeigt sonst nichts)
    await new Promise((r) => setTimeout(r, SHEET_GONE_MS));
    setS({ tour, hits, alt: null, go });
    planAround(tour, hits, profile, avoid ?? DEFAULT_AVOID)
      .then((a) => setS((c) => (c && c.tour === tour ? { ...c, alt: a } : c)))
      .catch(() => setS((c) => (c && c.tour === tour ? { ...c, alt: false } : c)));
  };

  const sheet = s ? (
    <ActionSheet
      visible
      title="Gerade gesperrt"
      subtitle={`${closureLabels(s.hits).join('. ')}. Wie möchtest du fahren?`}
      onClose={() => setS(null)}
      items={[
        {
          key: 'um',
          icon: 'arrow.triangle.branch',
          label: 'Umfahren',
          primary: !!s.alt,
          busy: s.alt === null,
          hint: s.alt === null ? 'Die Umfahrung wird geplant' : s.alt === false ? 'Keine Umfahrung gefunden' : aroundHint(s.alt, s.tour.laenge_km),
          onPress: () => {
            const a = s.alt;
            if (a) s.go({ ...a.tour, name: s.tour.name }, true);
            else if (a === null) showToast('Die Umfahrung wird noch geplant, gleich nochmal tippen.');
          },
        },
        { key: 'wie', icon: 'car.fill', label: 'Wie geplant fahren', hint: 'Nur wenn die Straße doch offen ist', onPress: () => s.go(s.tour, false) },
      ]}
    />
  ) : null;

  return { check, sheet };
}
