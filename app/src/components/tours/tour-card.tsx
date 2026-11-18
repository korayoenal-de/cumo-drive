/**
 * Karte einer gespeicherten Tour in Meine Touren.
 *
 * Bewusst reduziert: Die ganze Karte öffnet die Tour im Planer (dort Losfahren, als Gruppe fahren,
 * auf der Karte ändern und speichern). Rechts nur ein Symbol für die Optionen. Es öffnet ein
 * Bottom Sheet (Teilen als GPX oder KML, Community, Löschen). Veröffentlichen öffnet das Formular
 * im selben Sheet, Löschen fragt in einem ConfirmSheet nach, Erfolg meldet ein Toast.
 * Muster: docs/design-prinzipien.md, Abschnitt Ebenen und Rückmeldungen.
 */
import { ShareSheet } from '@/components/tours/share-sheet';
import { datum, fahrzeit, meta as fmtMeta, strecke } from '@/lib/format';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/ui/tap';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { SOFT_LAYOUT } from '@/components/ui/action-bar';
import { SwipeDelete } from '@/components/ui/swipe-delete';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { DeleteTourSheet } from '@/components/tours/delete-tour-sheet';
import { ActionSheet, OptionsSheet, SHEET_GONE_MS, type SheetItem } from '@/components/ui/action-sheet';
import { IconLabel } from '@/components/ui/btn-icon';
import { FromBadge, FunMark, GoodBadge, RouteThumb } from '@/components/tours/tour-bits';
import { TextField } from '@/components/ui/text-field';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Spacing, Type, Size, Pressed } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { creditLine, publishTour, unpublishTour } from '@/lib/community';
import { loadProfile } from '@/lib/group/ride';
import { NameDialog } from '@/components/planner/name-dialog';
import { fromCommunity, renameTour, type SavedTour } from '@/lib/library';
import { useMyProfile } from '@/lib/profile';
import { ensureTourFun } from '@/lib/tour-fun-queue';
import { exportTour, type RouteFormat } from '@/lib/route-file';
import { thumbShape } from '@/lib/route-thumb';
import { shareTourLink } from '@/lib/share-link';
import { showToast } from '@/lib/toast';
import { flyTo } from '@/lib/fly';
import { flatten } from '@/lib/tour';
import { tr } from '@/i18n';

const SPRING = Motion.press;
const LAYOUT = SOFT_LAYOUT;

export function TourCard({ tour: t, onOpen }: { tour: SavedTour; onOpen: (t: SavedTour) => void }) {
  const [sheet, setSheet] = useState<'menu' | 'share' | 'publish' | 'delete' | 'rename' | null>(null);
  const scale = useSharedValue(1);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  useEffect(() => ensureTourFun(t), [t]);
  // Meta Zeile wie überall (Konsistenzprüfung 15.11., K3, K8): Strecke und Fahrzeit, Fahrspaß rechts
  const meta = fmtMeta(strecke(t.laenge_km), t.minutes ? fahrzeit(t.minutes) : null, datum(new Date(t.updatedAt)));

  const exp = async (f: RouteFormat) => {
    try {
      await exportTour(t, f);
    } catch (e) {
      showToast(e instanceof Error ? e.message: tr('Export hat nicht geklappt.'), { tone: 'error' });
    }
  };
  // Aus der Community gespeichert (Koray 11.11.): Umbenennen gilt nur bei dir, Entfernen statt Löschen, und
  // veröffentlichen lässt sie sich erst, wenn du die Strecke geändert hast (dann mit Hinweis auf die Herkunft)
  const taken = fromCommunity(t);
  const items: SheetItem[] = [
    // Ausfahrt aus der Tour planen, privat als Standard (Koray 13.11.)
    // Neutral ohne Hinweis (Konsistenzprüfung 15.11., O1): Orange gibt es nur in Rückfragen
    { key: 'ride', icon: 'calendar.badge.plus', label: tr('Ausfahrt planen'), onPress: () => router.push({ pathname: '/ausfahrt/neu', params: { tour: t.id } }) },
    { key: 'rename', icon: 'pencil', label: tr('Umbenennen'), hint: taken ? tr('Nur bei dir, in der Community bleibt der Name') : undefined, onPress: () => setSheet('rename') },
    // Duplizieren entfällt (Koray 16.11.): Varianten entstehen im Planer über „Als neue Tour speichern“
    // Link, GPX und KML als eine Zeile (O3)
    { key: 'share', icon: 'square.and.arrow.up', label: tr('Teilen'), onPress: () => setSheet('share') },
    ...(taken && !t.edited
      ? []
      : [
          {
            key: 'pub',
            icon: (t.published ? 'eye.slash' : 'globe') as SheetItem['icon'],
            label: t.published ? tr('Aus der Community nehmen') : taken ? tr('Deine Variante veröffentlichen') : tr('In der Community veröffentlichen'),
            hint: t.published ? tr('Andere sehen die Tour dann nicht mehr') : taken ? (creditLine(t) ?? '').replace(/\.$/, '') : tr('Andere können die Tour finden und fahren'),
            onPress: () => setSheet('publish'),
          },
        ]),
    taken
      ? { key: 'del', icon: 'bookmark.slash', label: tr('Aus Touren entfernen'), hint: tr('In der Community bleibt sie erhalten'), danger: true, onPress: () => setSheet('delete') }
      : { key: 'del', icon: 'trash', label: tr('Tour löschen'), hint: tr('Vom Gerät und aus deinem Konto'), danger: true, onPress: () => setSheet('delete') },
  ];

  return (
    <Animated.View layout={LAYOUT} entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={cardStyle}>
      {/* Von rechts nach links wischen zeigt Löschen, mit Rückfrage, wie bei gefahrenen Touren (Koray 18.11.) */}
      <Swipeable
        friction={1.6}
        rightThreshold={36}
        overshootRight={false}
        containerStyle={styles.swipeBox}
        renderRightActions={(prog, _tr, m) => (
          <SwipeDelete
            progress={prog}
            radius={Radius.l + 4}
            label={taken ? tr('{name} aus Touren entfernen', { name: t.name }) : tr('Tour {name} löschen', { name: t.name })}
            onPress={() => {
              m.close();
              setSheet('delete');
            }}
          />
        )}>
      <View style={styles.card}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t.name}, ${meta}`}
          accessibilityHint={tr('Öffnet die Tour auf der Karte, dort startest du die Fahrt')}
          onPress={() => onOpen(t)}
          onPressIn={() => scale.set(withSpring(Motion.pressScale, SPRING))}
          onPressOut={() => scale.set(withSpring(1, SPRING))}
          style={styles.main}>
          <TourThumb tour={t} />
          <View style={styles.text}>
            <AppText style={styles.name} numberOfLines={2}>
              {t.name}
            </AppText>
            <AppText variant="caption" muted numberOfLines={1} style={styles.meta}>
              {meta}
            </AppText>
            {t.published ? (
              <GoodBadge label={tr('In der Community')} />
            ) : t.author || t.folder === 'Community' ? (
              // Aus der Community übernommen (Koray 10.11., Variante A): grau, mit Initiale des Absenders
              <FromBadge author={t.author} />
            ) : null}
          </View>
        </Pressable>
        <FunMark score={t.fun} />
        <Pressable accessibilityRole="button" accessibilityLabel={tr('Optionen für {name}', { name: t.name })} onPress={() => setSheet('menu')} hitSlop={4} style={({ pressed }) => [styles.round, pressed && styles.itemPressed]}>
          <SymbolView name="ellipsis" size={20} tintColor={Colors.text} weight="semibold" />
        </Pressable>
      </View>
      </View>
      </Swipeable>

      <ActionSheet visible={sheet === 'menu'} title={t.name} subtitle={meta} items={items} onClose={() => setSheet((s) => (s === 'menu' ? null : s))} />
      <ShareSheet
        visible={sheet === 'share'}
        title={t.name}
        onLink={() => void shareTourLink(t, t.profile ?? 'kurvig').catch(() => undefined)}
        onGpx={() => void exp('gpx')}
        onKml={() => void exp('kml')}
        onClose={() => setSheet((s) => (s === 'share' ? null : s))}
      />
      <PublishSheet tour={t} visible={sheet === 'publish'} onClose={() => setSheet(null)} />
      <NameDialog
        key={sheet === 'rename' ? 'offen' : 'zu'}
        visible={sheet === 'rename'}
        title={tr('Tour umbenennen')}
        subtitle={tr('Der neue Name gilt auch im Konto, im Web Planer und in der Community.')}
        initial={t.name}
        onCancel={() => setSheet(null)}
        onSave={(n) => {
          setSheet(null);
          if (n !== t.name) {
            renameTour(t.id, n);
            showToast(tr('Umbenannt'));
          }
        }}
      />
      <DeleteTourSheet tour={t} visible={sheet === 'delete'} onClose={() => setSheet(null)} />
    </Animated.View>
  );
}

/** Mini Karte der Strecke (RouteThumb), Form einmal je Tour gerechnet */
function TourThumb({ tour }: { tour: SavedTour }) {
  const shape = useMemo(() => thumbShape(flatten(tour).map((x) => x.p)), [tour]);
  return <RouteThumb shape={shape} />;
}

/**
 * Blatt zum Veröffentlichen oder Zurückziehen einer Tour. Aus der Tourkarte und aus der Community („Teilen“,
 * Koray 15.11.), damit beides gleich aussieht und gleich funktioniert.
 */
export function PublishSheet({ tour: t, visible, onClose, onPublished }: { tour: SavedTour; visible: boolean; onClose: () => void; onPublished?: () => void }) {
  const taken = fromCommunity(t);
  return (
    <OptionsSheet
      visible={visible}
      title={t.published ? tr('Aus der Community nehmen?') : tr('In der Community veröffentlichen')}
      subtitle={t.published ? tr('Die Tour verschwindet aus der Community. Gespeichert bleibt sie bei dir.') : taken ? tr('Alle sehen Strecke, Tourname und deinen Namen. Dabei steht: {v0}', { v0: creditLine(t) }) : tr('Alle sehen Strecke, Tourname und deinen Namen. Zurückziehen geht jederzeit.')}
      onClose={onClose}>
      <PublishForm
        tour={t}
        onDone={(text, flown) => {
          onClose();
          // mit Flug keine Meldung, er zeigt es schon (Koray 17.11.)
          if (!flown) showToast(text);
          onPublished?.();
        }}
      />
    </OptionsSheet>
  );
}

/** Veröffentlichen mit Name und kurzer Beschreibung, oder zurückziehen. */
function PublishForm({ tour, onDone }: { tour: SavedTour; onDone: (toast: string, flown?: boolean) => void }) {
  const session = useSession();
  const profile = useMyProfile(session?.user.id);
  const [title, setTitle] = useState(tour.name);
  const [author, setAuthor] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Fahrername vorbelegen: zuerst der Name aus dem Konto, sonst der aus der Gruppenfahrt (Koray 10.11.)
  const [touched, setTouched] = useState(false);
  const shownAuthor = touched ? author : author || profile?.displayName || '';
  useEffect(() => {
    void loadProfile().then((p) => {
      if (p?.name) setAuthor((a) => a || p.name);
    });
  }, []);
  const pubRef = useRef<ComponentRef<typeof View>>(null);
  // Veröffentlichen (Muster A, Koray 17.11.): das Blatt geht zu, dann fliegt das Community Symbol von der Taste in den Tab
  const run = async (fn: () => Promise<unknown>, done: string, fly = false) => {
    setBusy(true);
    setMsg(null);
    try {
      // Lage der Taste vor dem Senden messen: nach dem Erfolg schließt das Blatt sofort, dann gibt es sie nicht mehr
      // (vorher kam die Messung zu spät, der Flug blieb aus und eine Meldung gab es auch nicht; Koray 18.11.)
      const box = fly
        ? await new Promise<{ x: number; y: number; h: number } | null>((res) => {
            const v = pubRef.current;
            if (!v) return res(null);
            v.measureInWindow((x, y, w, h) => res(w ? { x: x + w / 2, y: y + h / 2, h } : null));
          })
        : null;
      await fn();
      if (box) setTimeout(() => flyTo({ from: { x: box.x, y: box.y, size: box.h }, target: 'community', icon: { tab: 'community' }, bg: Colors.signal, fg: Colors.onSignal }), SHEET_GONE_MS);
      onDone(done, !!box);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  if (!session)
    return (
      <AppText variant="caption" muted style={styles.note}>
        {tr('Zum Veröffentlichen meldest du dich unter Einstellungen an.')}
      </AppText>
    );
  if (tour.published)
    return (
      <View style={styles.form}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run(() => unpublishTour(tour), tr('Aus der Community genommen'))} style={({ pressed }) => [styles.primary, pressed && styles.itemPressed]}>
          {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>{tr('Aus der Community nehmen')}</AppText>}
        </Pressable>
        {msg && <AppText variant="caption" style={styles.danger}>{msg}</AppText>}
      </View>
    );
  const can = !busy && !!shownAuthor.trim() && !!title.trim();
  return (
    <View style={styles.form}>
      <View style={styles.labeled}>
        <AppText style={styles.fieldLabel}>{tr('Name der Tour')}</AppText>
        <TextField maxFontSizeMultiplier={1.2} value={title} onChangeText={setTitle} placeholder={tr('Name der Tour')} placeholderTextColor={Colors.muted} style={styles.field} accessibilityLabel={tr('Name der Tour')} maxLength={120} />
      </View>
      <View style={styles.labeled}>
        <AppText style={styles.fieldLabel}>{tr('Dein Name als Fahrer')}</AppText>
        <TextField maxFontSizeMultiplier={1.2}
          value={shownAuthor}
          onChangeText={(v) => {
            setTouched(true);
            setAuthor(v);
          }}
          placeholder={tr('So erscheinst du in der Community')}
          placeholderTextColor={Colors.muted}
          style={styles.field}
          accessibilityLabel={tr('Dein Name als Fahrer')}
          maxLength={60}
        />
      </View>
      <AppText style={styles.fieldLabel}>{tr('Beschreibung (optional)')}</AppText>
      <TextField maxFontSizeMultiplier={1.2}
        value={desc}
        onChangeText={setDesc}
        placeholder={tr('Was macht die Tour aus? Beste Abschnitte, Stopps, Tageszeit')}
        placeholderTextColor={Colors.muted}
        style={[styles.field, styles.area]}
        multiline
        maxLength={500}
        accessibilityLabel={tr('Beschreibung')}
      />
      <Pressable ref={pubRef} accessibilityRole="button" disabled={!can} onPress={() =>
          void run(async () => {
            // neuer Name gilt auch in Meine Touren und im Konto
            const name = title.replace(/\s+/g, ' ').trim();
            if (name && name !== tour.name) renameTour(tour.id, name);
            await publishTour({ ...tour, name: name || tour.name }, shownAuthor, desc);
          }, tr('In der Community veröffentlicht'), true)
        } style={({ pressed }) => [styles.primary, !can && styles.disabled, pressed && styles.itemPressed]}>
        {busy ? (
          <ActivityIndicator color={Colors.onSignal} />
        ) : (
          <IconLabel icon={{ tab: 'community' }} color={Colors.onSignal}>
            <AppText style={styles.primaryText}>{tr('Veröffentlichen')}</AppText>
          </IconLabel>
        )}
      </Pressable>
      {msg && <AppText variant="caption" style={styles.danger}>{msg}</AppText>}
    </View>
  );
}

const styles = StyleSheet.create({
  labeled: { gap: Spacing.xs },
  fieldLabel: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: Colors.muted, marginLeft: Spacing.xs },
  swipeBox: { borderRadius: Radius.l + 4, overflow: 'hidden' },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l + 4, padding: Spacing.m, gap: Spacing.m, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 56 },
  text: { flex: 1, gap: 3 },
  name: { fontFamily: Fonts.semibold, fontSize: Type.title, lineHeight: 21 },
  meta: { fontVariant: ['tabular-nums'] },
  round: { minWidth: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  item: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingHorizontal: Spacing.m, borderRadius: Radius.m, backgroundColor: Colors.surface2 },
  itemPressed: Pressed,
  form: { gap: Spacing.s },
  field: { minHeight: Size.input, paddingHorizontal: Spacing.l, paddingVertical: Spacing.m, backgroundColor: Colors.surface2, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  area: { minHeight: 88, textAlignVertical: 'top' },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.body },
  disabled: { opacity: 0.4 },
  note: { paddingHorizontal: Spacing.xs },
  danger: { color: Colors.signal },
});
