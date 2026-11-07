/**
 * Ergebnis einer Rundtour im Planer: Kennzahlen, Prüfhinweis, Highlights, Höhenprofil, Stopps
 * und Aktionsleiste mit Losfahren als Hauptaktion.
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { HighlightList } from '@/components/planner/highlight-list';
import { closedHint, usePassLive } from '@/lib/pass-live';
import { shareTourLink } from '@/lib/share-link';
import { PASS_STATUS_URL, PASSES, passesAlong } from '@/lib/passes';
import { countCurves } from '@/lib/stats';
import { type TourRequest } from '@/components/planner/create-tour';
import { ElevationChart } from '@/components/planner/elevation-chart';
import { GroupOptions } from '@/components/planner/group-options';
import { ActionBar } from '@/components/ui/action-bar';
import { AppText } from '@/components/ui/text';
import { setActiveTour } from '@/lib/active-tour';
import { saveTour, syncLibrary } from '@/lib/library';
import { type Stop } from '@/lib/intent';
import { type PlannedTour } from '@/lib/plan';
import { flatten, type LatLon } from '@/lib/tour';
import { showToast } from '@/lib/toast';

import { GroupBlock, Stats, StopsPlanner, TrustLine, Warnings, type PlannedStop } from './planner-parts';
import { PlaceSearch, type Cat } from './place-search';
import { styles } from './planner-styles';


export function Result({
  tour, req, group, onReroll, onBack, onAdjust, onAddStop, onRemoveStop, planned, adding,
}: {
  tour: PlannedTour; req: TourRequest; stops: Stop[]; group: boolean; onReroll: () => void; onBack: () => void;
  /** Runde als Route mit Start, Zwischenzielen und Ziel öffnen */
  onAdjust: () => void;
  onAddStop: (p: LatLon, name: string, km: number, cat: Exclude<Cat, 'alle'>) => void;
  onRemoveStop: (key: string) => void;
  planned: PlannedStop[];
  adding: boolean;
}) {
  const total = tour.laenge_km;
  const warnings = tour.warnungen.filter((w) => w.klasse !== 'ok');
  const line = useMemo(() => flatten(tour).map((x) => x.p), [tour]);
  // nur neu rechnen, wenn sich die Linie ändert (das Ergebnis rendert bei jeder Bewegung des Blatts)
  const passes = useMemo(() => passesAlong(PASSES, line), [line]);
  const curves = useMemo(() => countCurves(line), [line]);
  const live = usePassLive();
  const hint = closedHint(passes.map((x) => x.pass), live);
  // fertige Runde unter Meine Touren speichern (bei neuer Runde wieder frei)
  const [saved, setSaved] = useState<{ tour: PlannedTour; id: string } | null>(null);
  const savedId = saved?.tour === tour ? saved.id : null;
  const saveResult = () => {
    const t = saveTour({ ...tour, curves, profile: req.profile }, '', savedId ?? undefined);
    setSaved({ tour, id: t.id });
    void syncLibrary();
    showToast('In Meine Touren gespeichert', { action: { label: 'Ansehen', onPress: () => router.navigate('/touren') } });
    return t.id;
  };
  // Solo oder Gruppe im Schalter der Hauptaktion; als Gruppe erst speichern, dann Mitfahrer einladen
  const [asGroup, setAsGroup] = useState(false);
  const [stopCat, setStopCat] = useState<Exclude<Cat, 'alle'> | null>(null);
  const drive = () => {
    if (asGroup) {
      router.push({ pathname: '/gruppe/neu', params: { tour: savedId ?? saveResult() } });
      return;
    }
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

      <StopsPlanner planned={planned} busy={adding} onOpen={setStopCat} onRemove={onRemoveStop} />
      <PlaceSearch
        visible={!!stopCat}
        role="Stopp"
        placeholder=""
        current=""
        locating={false}
        message={null}
        onPick={() => undefined}
        onHere={() => undefined}
        onClose={() => setStopCat(null)}
        route={line}
        stopsOnly={stopCat ? { title: 'Unterwegs einplanen', subtitle: `${tour.name} · ${Math.round(total)} km`, cat: stopCat } : undefined}
        onPickStop={(p, name, km) => {
          const c = stopCat!;
          setStopCat(null);
          onAddStop(p, name, km, c);
        }}
      />

      {group && <GroupBlock savedId={savedId} />}

      {/* Aktionen am Ende: Losfahren, Speichern als Symbol, Seltenes im Menü */}
      <ActionBar
        sheetTitle={tour.name}
        primary={{ label: 'Losfahren', onPress: drive }}
        mode={{ group: asGroup, onChange: setAsGroup }}
        float={asGroup ? <GroupOptions onInvite={drive} /> : undefined}
        save={{ saved: !!savedId, onPress: () => void saveResult() }}
        more={[
          { key: 'link', icon: 'square.and.arrow.up', label: 'Link teilen', hint: 'Andere öffnen die Route direkt in CUMO DRIVE', onPress: () => void shareTourLink({ ...tour, name: tour.name }, req.profile).catch(() => undefined) },
          { key: 'adjust', icon: 'pencil', label: 'Anpassen', hint: 'Start, Zwischenziele und Ziel ändern', onPress: onAdjust },
          { key: 'reroll', icon: 'dice', label: 'Neu würfeln', hint: 'Gleiche Länge und Richtung, andere Strecke', onPress: onReroll },
          { key: 'back', icon: 'trash', label: 'Tour verwerfen', hint: 'Zurück zur Auswahl', danger: true, confirm: 'Möchtest du diese Runde wirklich verwerfen?', onPress: onBack },
        ]}>
      </ActionBar>
    </View>
  );
}
