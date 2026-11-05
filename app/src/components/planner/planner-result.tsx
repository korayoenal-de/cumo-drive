/**
 * Ergebnis einer Rundtour im Planer: Kennzahlen, Prüfhinweis, Highlights, Höhenprofil, Stopps
 * und Aktionsleiste mit Losfahren als Hauptaktion.
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { HighlightList } from '@/components/planner/highlight-list';
import { closedHint, usePassLive } from '@/lib/pass-live';
import { PASS_STATUS_URL, PASSES, passesAlong } from '@/lib/passes';
import { countCurves } from '@/lib/stats';
import { type TourRequest } from '@/components/planner/create-tour';
import { ElevationChart } from '@/components/planner/elevation-chart';
import { ActionBar } from '@/components/ui/action-bar';
import { AppText } from '@/components/ui/text';
import { setActiveTour } from '@/lib/active-tour';
import { saveTour, syncLibrary } from '@/lib/library';
import { type Stop } from '@/lib/intent';
import { type PlannedTour } from '@/lib/plan';
import { type StopKind } from '@/lib/stops-along';
import { flatten, type LatLon } from '@/lib/tour';

import { GroupBlock, Stats, StopsSection, TrustLine, Warnings } from './planner-parts';
import { styles } from './planner-styles';


export function Result({
  tour, req, stops, group, onReroll, onBack, onAddStop, adding,
}: {
  tour: PlannedTour; req: TourRequest; stops: Stop[]; group: boolean; onReroll: () => void; onBack: () => void;
  onAddStop: (p: LatLon) => void; adding: boolean;
}) {
  const total = tour.laenge_km;
  const warnings = tour.warnungen.filter((w) => w.klasse !== 'ok');
  const line = useMemo(() => flatten(tour).map((x) => x.p), [tour]);
  const passes = passesAlong(PASSES, line);
  const curves = countCurves(line);
  const live = usePassLive();
  const hint = closedHint(passes.map((x) => x.pass), live);
  // fertige Runde unter Meine Touren speichern (bei neuer Runde wieder frei)
  const [saved, setSaved] = useState<{ tour: PlannedTour; id: string } | null>(null);
  const savedId = saved?.tour === tour ? saved.id : null;
  const saveResult = () => {
    const t = saveTour({ ...tour, curves, profile: req.profile }, '', savedId ?? undefined);
    setSaved({ tour, id: t.id });
    void syncLibrary();
  };
  const drive = () => {
    setActiveTour(tour, req.profile, req.avoid);
    router.push('/navigation');
  };
  return (
    <View style={styles.sections}>
      {/* Überschrift steht im Kopf des Blatts, hier zuerst die Kennzahlen und Details */}
      <View style={styles.gapL}>
        <Stats km={total} minutes={tour.minutes} curves={curves} />
        {warnings.length === 0 && tour.geprueft !== false && <TrustLine />}
        {req.note && <AppText variant="caption" style={styles.winterText}>{req.note}</AppText>}
      </View>

      {hint && (
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(PASS_STATUS_URL)} style={styles.winter}>
          <AppText style={styles.winterTitle}>{hint.title}</AppText>
          <AppText variant="caption" style={styles.winterText}>
            {hint.text} Tippen für den aktuellen Passstatus.
          </AppText>
        </Pressable>
      )}

      <HighlightList line={line} />

      {warnings.length > 0 && <Warnings warnings={warnings} checked={tour.geprueft !== false} />}

      <ElevationChart line={line} />

      <StopsSection line={line} initial={(stops.find((x) => x !== 'foto') as StopKind | undefined) ?? null} busy={adding} onAdd={onAddStop} />

      {group && <GroupBlock savedId={savedId} />}

      {/* Aktionen am Ende: Losfahren, Speichern als Symbol, Seltenes im Menü */}
      <ActionBar
        primary={{ label: 'Losfahren', onPress: drive }}
        save={{ saved: !!savedId, onPress: saveResult }}
        more={[
          { key: 'reroll', icon: 'dice', label: 'Neu würfeln', hint: 'Gleiche Länge und Richtung, andere Strecke', onPress: onReroll },
          ...(savedId
            ? [{ key: 'group', icon: 'person.2' as const, label: 'Als Gruppe fahren', hint: 'Mitfahrer mit ihrem Namen einladen', onPress: () => router.push({ pathname: '/gruppe/neu', params: { tour: savedId } }) }]
            : []),
          { key: 'back', icon: 'trash', label: 'Tour verwerfen', hint: 'Zurück zur Auswahl', danger: true, onPress: onBack },
        ]}>
        {savedId && (
          <AppText variant="caption" muted>
            Gespeichert unter Meine Touren.
          </AppText>
        )}
      </ActionBar>
    </View>
  );
}
