/**
 * Runder Knopf auf der Karte, der die Karteneinstellungen öffnet: Darstellung und Ebenen.
 * Das Blatt kommt als natives Seitenblatt von unten und lässt sich nach unten wegwischen.
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useWeatherStatus, type WeatherStatus } from '@/lib/weather';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Size, Spacing, Type, Shadow } from '@/constants/theme';
import {
  MAP_STYLES,
  setMapSettings,
  useMapSettings,
  type MapSettings,
} from '@/lib/map-settings';

export function MapLayersButton({ style }: { style?: object }) {
  const [open, setOpen] = useState(false);
  const s = useSharedValue(1);
  const press = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Karteneinstellungen"
        onPressIn={() => s.set(withSpring(Motion.pressScale, Motion.press))}
        onPressOut={() => s.set(withSpring(1, Motion.snap))}
        onPress={() => setOpen(true)}
        hitSlop={6}
        style={style}
      >
        <Animated.View style={[styles.fab, press]}>
          <SymbolView
            name="square.3.layers.3d"
            size={22}
            tintColor={Colors.text}
            weight="medium"
          />
        </Animated.View>
      </Pressable>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <MapSettingsBody onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

type LayerKey = Exclude<keyof MapSettings, 'style'>;

/** Hinweis unter Wetter, wenn WeatherKit nicht liefert (Text vom System, gekürzt) */
function weatherNote(note: string, w: WeatherStatus): string {
  if (w.state === 'fehlt') return 'In dieser App Version noch nicht enthalten';
  if (w.state === 'fehler') return `Gerade nicht verfügbar: ${(w.msg ?? '').slice(0, 120)}`;
  return note;
}

const LAYERS: { key: LayerKey; icon: SFSymbol; label: string; note: string }[] =
  [
    {
      key: 'warnings',
      icon: 'exclamationmark.triangle',
      label: 'Gefahrenstellen',
      note: 'Gesperrte und zu prüfende Stellen auf der Route',
    },
    {
      key: 'weather',
      icon: 'cloud.sun',
      label: 'Wetter',
      note: 'An den Pässen der Route, zur Ankunft',
    },
    {
      key: 'passes',
      icon: 'mountain.2',
      label: 'Pässe in der Nähe von Start und Ziel',
      note: 'Bis 50 km um deine Tour, orange die Ikonen',
    },
    {
      key: 'passesAll',
      icon: 'globe.europe.africa',
      label: 'Alle Pässe anzeigen',
      note: 'Auch weit weg von deiner Tour',
    },
    {
      key: 'myTours',
      icon: 'bookmark',
      label: 'Meine Touren',
      note: 'Gespeicherte Touren als feine Linien',
    },
    {
      key: 'drives',
      icon: 'flag.checkered',
      label: 'Gefahrene Strecken',
      note: 'Deine Fahrten in Grün, so siehst du, was noch fehlt',
    },
  ];

function MapSettingsBody({ onClose }: { onClose: () => void }) {
  const st = useMapSettings();
  const weather = useWeatherStatus();
  return (
    <View style={styles.sheet}>
      <View style={styles.head}>
        <AppText style={styles.title}>Karte</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Schließen"
          onPress={onClose}
          hitSlop={8}
          style={styles.close}
        >
          <SymbolView
            name="xmark"
            size={15}
            tintColor={Colors.text}
            weight="bold"
          />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.group}>
          <AppText style={styles.label}>Darstellung</AppText>
          <View style={styles.styles} accessibilityRole="radiogroup">
            {MAP_STYLES.map((m) => {
              const on = st.style === m.id;
              return (
                <Pressable
                  key={m.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setMapSettings({ style: m.id })}
                  style={({ pressed }) => [
                    styles.styleTile,
                    on && styles.styleTileOn,
                    pressed && styles.pressed,
                  ]}
                >
                  <StylePreview id={m.id} />
                  <AppText style={[styles.styleText, on && styles.styleTextOn]}>
                    {m.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.group}>
          <AppText style={styles.label}>Auf der Karte</AppText>
          <View style={styles.card}>
            {LAYERS.filter((l) => l.key !== 'passesAll' || st.passes).map((l, i) => (
              <View key={l.key} style={[styles.row, i > 0 && styles.rowLine]}>
                <View style={styles.rowIcon}>
                  <SymbolView
                    name={l.icon}
                    size={17}
                    tintColor={Colors.text}
                    weight="medium"
                  />
                </View>
                <View style={styles.flex}>
                  <AppText style={styles.rowTitle}>{l.label}</AppText>
                  <AppText style={styles.rowNote}>{l.key === 'weather' ? weatherNote(l.note, weather) : l.note}</AppText>
                </View>
                <Switch
                  value={!!st[l.key]}
                  onValueChange={(v) => setMapSettings({ [l.key]: v })}
                  trackColor={{ false: Colors.line, true: Colors.signal }}
                  thumbColor={Colors.text}
                  ios_backgroundColor={Colors.line}
                  accessibilityLabel={l.label}
                />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/** Kleine Vorschau je Darstellung: dunkle Karte, Satellit grün, 3D mit Relief. */
function StylePreview({ id }: { id: MapSettings['style'] }) {
  const bg =
    id === 'standard' ? Colors.line : id === 'satellit' ? '#2F4A33' : '#3A4F3A';
  return (
    <View style={[styles.preview, { backgroundColor: bg }]}>
      <View
        style={[styles.previewRoad, id !== 'standard' && styles.previewRoadSat]}
      />
      {id === '3d' && <View style={styles.previewHill} />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    // deckend und mit boxShadow wie die Zurück Pille: der alte iOS Schatten auf halb durchsichtiger Fläche
    // sah auf manchen Geräten wie ein heller Rand unten rechts aus (Tester 10.11.)
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: Shadow.float,
  },
  sheet: { flex: 1, backgroundColor: Colors.ground },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.m,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: Type.h2,
    lineHeight: 30,
    textTransform: 'uppercase',
    color: Colors.text,
  },
  close: {
    width: Size.icon,
    height: Size.icon,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.xxl,
  },
  group: { gap: Spacing.m },
  label: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  styles: { flexDirection: 'row', gap: Spacing.s },
  styleTile: {
    flex: 1,
    padding: Spacing.s,
    gap: Spacing.s,
    borderRadius: Radius.l,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  styleTileOn: { backgroundColor: Colors.signalTint },
  styleText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  styleTextOn: { fontFamily: Fonts.bold, color: Colors.text },
  preview: {
    alignSelf: 'stretch',
    height: 64,
    borderRadius: Radius.s,
    overflow: 'hidden',
  },
  previewRoad: {
    position: 'absolute',
    left: -10,
    right: -10,
    top: 30,
    height: 4,
    backgroundColor: Colors.muted,
    transform: [{ rotate: '-14deg' }],
  },
  previewRoadSat: { backgroundColor: '#E8D9A8' },
  previewHill: {
    position: 'absolute',
    right: -14,
    bottom: -26,
    width: 70,
    height: 56,
    borderRadius: 35,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  pressed: { opacity: 0.85, transform: [{ scale: Motion.pressScale }] },
  card: {
    borderRadius: Radius.l,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.m,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.m,
    paddingVertical: Spacing.m,
    minHeight: 64,
  },
  rowLine: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.line,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.l,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  rowNote: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
});
