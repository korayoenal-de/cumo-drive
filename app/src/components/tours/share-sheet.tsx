/**
 * Teilen einer Tour als Auswahl (Konsistenzprüfung 15.11., O3): Link, GPX oder KML. Statt drei Zeilen im
 * Optionsblatt steht dort eine Zeile „Teilen“; die Wege mit Hinweis, weil sie sich im Ergebnis unterscheiden.
 */
import { ActionSheet } from '@/components/ui/action-sheet';
import { t } from '@/i18n';

export function ShareSheet({ visible, title, onLink, onGpx, onKml, onClose }: { visible: boolean; title: string; onLink: () => void; onGpx: () => void; onKml?: () => void; onClose: () => void }) {
  return (
    <ActionSheet
      visible={visible}
      title={title}
      items={[
        { key: 'link', icon: 'link', label: t('Link teilen'), hint: t('Andere öffnen die Tour direkt in CUMO DRIVE'), onPress: onLink },
        { key: 'gpx', icon: 'square.and.arrow.up', label: t('Als GPX teilen'), hint: t('Für Garmin, TomTom und andere Navis'), onPress: onGpx },
        ...(onKml ? [{ key: 'kml', icon: 'map' as const, label: t('Als KML teilen'), hint: t('Für Google Earth und My Maps'), onPress: onKml }] : []),
      ]}
      onClose={onClose}
    />
  );
}
