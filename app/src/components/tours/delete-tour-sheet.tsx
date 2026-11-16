/**
 * Tour löschen mit Rückfrage. Ist die Tour in der Community veröffentlicht, fragt das Blatt, ob sie
 * auch dort verschwinden soll oder nur aus Meine Touren (Koray 10.11.).
 */
import { useState } from 'react';

import { ActionSheet, ConfirmSheet } from '@/components/ui/action-sheet';
import { removeKeepPublished } from '@/lib/community';
import { deleteTour, fromCommunity, type SavedTour } from '@/lib/library';
import { showToast } from '@/lib/toast';
import { t } from '@/i18n';

export function DeleteTourSheet({ tour, visible, onClose, onDeleted }: { tour: SavedTour | null; visible: boolean; onClose: () => void; onDeleted?: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!tour) return null;

  const everywhere = () => {
    deleteTour(tour.id);
    onClose();
    showToast(tour.published ? 'Tour gelöscht, auch in der Community' : 'Tour gelöscht');
    onDeleted?.();
  };
  const onlyMine = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await removeKeepPublished(tour);
      onClose();
      showToast(t('Aus Touren entfernt, in der Community bleibt sie'));
      onDeleted?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message: t('Das hat nicht geklappt.'), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (tour.published) {
    return (
      <ActionSheet
        visible={visible}
        title={t('Auch die veröffentlichte Tour löschen?')}
        subtitle={`${tour.name} steht in der Community. Du entscheidest, ob sie dort bleibt.`}
        onClose={onClose}
        items={[
          { key: 'mine', icon: 'bookmark.slash', label: t('Nur bei mir löschen'), hint: t('In der Community bleibt sie für andere sichtbar'), busy, onPress: () => void onlyMine() },
          { key: 'all', icon: 'trash', label: t('Überall löschen'), hint: t('Auch aus der Community und aus deinem Konto'), danger: true, onPress: everywhere },
        ]}
      />
    );
  }
  if (fromCommunity(tour)) {
    // aus der Community gespeichert: es verschwindet nur das Lesezeichen, die Route dort bleibt
    return (
      <ConfirmSheet
        visible={visible}
        title={t('Möchtest du diese Tour wirklich aus Touren entfernen?')}
        text={tour.edited ? `${tour.name} mit deinen Änderungen verschwindet. Das Original bleibt in der Community.` : `${tour.name} bleibt in der Community erhalten.`}
        confirmLabel={t('Entfernen')}
        onConfirm={() => {
          deleteTour(tour.id);
          showToast(t('Aus Touren entfernt'));
          onDeleted?.();
        }}
        onClose={onClose}
      />
    );
  }
  return (
    <ConfirmSheet
      visible={visible}
      title={t('Möchtest du diese Tour wirklich löschen?')}
      text={`${tour.name} verschwindet vom Gerät und aus deinem Konto.`}
      confirmLabel={t('Löschen')}
      onConfirm={() => {
        deleteTour(tour.id);
        showToast(t('Tour gelöscht'));
        onDeleted?.();
      }}
      onClose={onClose}
    />
  );
}
