/**
 * Tour vom Web Planer holen: QR Code scannen, Stützpunkte dekodieren, Strecke neu planen
 * und prüfen, dann als aktive Tour auf der Karte zeigen.
 */
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type, Size } from '@/constants/theme';
import { setActiveTour } from '@/lib/active-tour';
import { planChecked, type PlanStep } from '@/lib/plan';
import { fetchHandoff, isHandoffCode } from '@/lib/handoff';
import { setEditTour } from '@/lib/edit-tour';
import { decodeTour, extractCode } from '@/lib/share-code';
import { isShortCode, resolveShareCode } from '@/lib/share-link';
import { DEFAULT_AVOID } from '@/lib/valhalla';

const STEP_TEXT: Record<PlanStep, string> = {
  route: 'Strecke wird berechnet',
  traffic: 'Verkehrsmeldungen werden geprüft',
  compare: 'Beste Variante wird gewählt',
  check: 'Etappen Check läuft',
  fix: 'Gesperrte Stücke werden umfahren',
};

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<{ kind: 'scan' } | { kind: 'busy'; text: string; name: string } | { kind: 'error'; text: string }>({ kind: 'scan' });
  const handled = useRef(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const { code } = useLocalSearchParams<{ code?: string }>();

  const onScan = async (r: BarcodeScanningResult) => {
    if (handled.current) return;
    const raw = extractCode(r.data);
    if (isHandoffCode(raw)) {
      handled.current = true;
      setStatus({ kind: 'busy', text: 'Tour wird geladen', name: 'Tour vom Planer' });
      try {
        const h = await fetchHandoff(raw);
        if (!h) throw new Error('Der Code ist abgelaufen. Im Planer einen neuen erzeugen.');
        setActiveTour(h.tour, h.profile, h.avoid ?? DEFAULT_AVOID);
        router.replace('/karte');
      } catch (e) {
        handled.current = false;
        setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Die Tour konnte nicht geladen werden.' });
      }
      return;
    }
    // Kurzer Link (s:...): Tour Code erst bei uns abholen
    let full = raw;
    if (isShortCode(raw)) {
      handled.current = true;
      setStatus({ kind: 'busy', text: 'Link wird geladen', name: 'Geteilte Tour' });
      try {
        full = await resolveShareCode(raw);
      } catch (e) {
        handled.current = false;
        setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Der Link konnte nicht geladen werden.' });
        return;
      }
    }
    const shared = decodeTour(full);
    if (!shared) {
      setStatus({ kind: 'error', text: 'Das ist kein CUMO DRIVE Code. Im Web Planer auf „An die App senden“ klicken.' });
      return;
    }
    handled.current = true;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setStatus({ kind: 'busy', text: STEP_TEXT.route, name: shared.name });
    try {
      const tour = await planChecked(
        shared.name,
        shared.points,
        shared.profile,
        DEFAULT_AVOID,
        (s) => setStatus({ kind: 'busy', text: STEP_TEXT[s] ?? 'Einen Moment', name: shared.name }),
        ctrl.signal,
      );
      // wie bei der Community: ungespeicherte Kopie im Planer, das Lesezeichen legt sie unter Geteilt ab
      const now = new Date().toISOString();
      // Mit echten Punkten (Link ab 10.11.): Start, Zwischenziele und Ziel samt Namen statt der Stützpunkte
      const own = shared.waypoints ? { wegpunkte: shared.waypoints, namen: shared.names, etappen: shared.legs } : {};
      setEditTour({ ...tour, ...own, id: '', folder: 'Geteilt', createdAt: now, updatedAt: now, profile: shared.profile });
      router.dismissTo('/');
    } catch (e) {
      if (ctrl.signal.aborted) return;
      handled.current = false;
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Die Tour konnte nicht geplant werden.' });
    }
  };

  // Über einen Link geöffnet (?code=...): Tour sofort übernehmen, ohne Kamera
  useEffect(() => {
    if (!code) return;
    const t = setTimeout(() => onScan({ data: String(code) } as BarcodeScanningResult), 0);
    return () => clearTimeout(t);
  }, [code]);

  const retry = () => {
    handled.current = false;
    setStatus({ kind: 'scan' });
  };

  return (
    <View style={styles.root}>
      {permission?.granted && status.kind !== 'busy' ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={status.kind === 'scan' ? onScan : undefined}
        />
      ) : null}

      <View style={[styles.top, { paddingTop: insets.top + Spacing.m }]}>
        <AppText variant="title">Tour vom Planer holen</AppText>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.close}>
          <AppText style={styles.closeText}>Schließen</AppText>
        </Pressable>
      </View>

      <View style={styles.center}>
        {!permission ? null : !permission.granted ? (
          <View style={styles.card}>
            <AppText>Zum Scannen braucht die App die Kamera.</AppText>
            <Pressable
              accessibilityRole="button"
              style={styles.primary}
              onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}>
              <AppText style={styles.primaryText}>{permission.canAskAgain ? 'Kamera erlauben' : 'Einstellungen öffnen'}</AppText>
            </Pressable>
          </View>
        ) : status.kind === 'busy' ? (
          <View style={styles.card}>
            <ActivityIndicator color={Colors.signal} />
            <AppText variant="title" numberOfLines={2}>
              {status.name}
            </AppText>
            <AppText muted>{status.text}</AppText>
          </View>
        ) : (
          <View style={styles.frame} />
        )}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.l }]}>
        {status.kind === 'error' ? (
          <View style={styles.card}>
            <AppText>{status.text}</AppText>
            <Pressable accessibilityRole="button" style={styles.primary} onPress={retry}>
              <AppText style={styles.primaryText}>Nochmal scannen</AppText>
            </Pressable>
          </View>
        ) : status.kind === 'scan' && permission?.granted ? (
          <AppText style={styles.hint}>Im Web Planer auf drive.rallycumo.de bei der Tour „An die App senden“ klicken und den Code hier ins Bild halten.</AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ground },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.l, paddingBottom: Spacing.m, backgroundColor: Colors.overlay },
  close: { paddingVertical: Spacing.s, paddingHorizontal: 14, borderRadius: 18, backgroundColor: Colors.surface2 },
  closeText: { fontFamily: Fonts.semibold, fontSize: Type.small },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.l },
  frame: { width: 250, height: 250, borderRadius: Radius.l, borderWidth: 3, borderColor: Colors.signal },
  card: { alignSelf: 'stretch', gap: Spacing.m, padding: Spacing.l, borderRadius: Radius.l, backgroundColor: Colors.overlaySurface },
  bottom: { paddingHorizontal: Spacing.l },
  hint: { textAlign: 'center', fontFamily: Fonts.medium, fontSize: Type.body, lineHeight: 21, backgroundColor: 'rgba(11,11,12,0.8)', padding: Spacing.m, borderRadius: Radius.m, overflow: 'hidden' },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.input },
});
