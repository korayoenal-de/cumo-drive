/**
 * Ebene "Wetter" auf der Karte (Konzept Board 4, 6.11.2026): kleine Plaketten an den Pässen der Route
 * mit Temperatur und Symbol zur Ankunft. Gelb nur bei echtem Grund (weatherReason). Antippen öffnet ein
 * Bottom Sheet mit Regen, Wind und Böen, dazu Apples Pflichthinweis zu den Datenquellen.
 * Ankunft = jetzt plus geplante Fahrzeit bis zum Pass, weil die Tour noch kein Datum hat.
 */
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';

import { OptionsSheet } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { passesAlong, PASSES, type Pass } from '@/lib/passes';
import { flatten, type Tour } from '@/lib/tour';
import { fmtTemp, passWeather, weatherAttribution, weatherAvailable, weatherReason, type PassWeather } from '@/lib/weather';

type Item = { pass: Pass; km: number; at: number; w: PassWeather | null };

/** Pässe der Route mit Ankunftszeit und Wetter; leer ohne WeatherKit */
export function useRouteWeather(tour: Tour & { minutes?: number }, on: boolean): Item[] {
  // Pässe der Route mit der Fahrzeit bis dorthin in Minuten; die Uhrzeit kommt erst beim Abruf dazu
  const along = useMemo(() => {
    if (!on || !weatherAvailable) return [];
    const line = flatten(tour).map((x) => x.p);
    const total = Math.max(1, tour.laenge_km);
    const minutes = tour.minutes ?? (total / 55) * 60;
    return passesAlong(PASSES, line)
      .slice(0, 12)
      .map((x) => ({ pass: x.pass, km: x.km, inMin: minutes * (x.km / total) }));
  }, [tour, on]);
  const [state, setState] = useState<{ along: typeof along; items: Item[] } | null>(null);
  useEffect(() => {
    if (!along.length) return;
    let alive = true;
    const now = Date.now();
    const list = along.map((x) => ({ pass: x.pass, km: x.km, at: now + x.inMin * 60000 }));
    passWeather(list)
      .then((m) => alive && setState({ along, items: list.map((x) => ({ ...x, w: m.get(x.pass.id) ?? null })) }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [along]);
  return state && state.along === along ? state.items : [];
}

export function WeatherMarkers({ items, onPress }: { items: Item[]; onPress: (it: Item) => void }) {
  return (
    <>
      {items
        .filter((it) => it.w)
        .map((it) => {
          const w = it.w!;
          const reason = weatherReason(w);
          return (
            <Marker
              key={`wetter-${it.pass.id}-${Math.round(w.temp)}-${reason ?? ''}`}
              coordinate={{ latitude: it.pass.lat, longitude: it.pass.lon }}
              anchor={{ x: 0.5, y: 1.25 }}
              zIndex={14}
              onPress={() => onPress(it)}
              tracksViewChanges={false}>
              <View style={[styles.plaque, reason && styles.plaqueWarn]} accessibilityLabel={`${it.pass.name}: ${Math.round(w.temp)} Grad${reason ? `, ${reason}` : ''}`}>
                <SymbolView name={w.symbol as never} size={14} weight="semibold" type="monochrome" tintColor={reason ? Colors.ground : Colors.text} />
                <AppText style={[styles.plaqueText, reason && styles.plaqueTextWarn]}>
                  {fmtTemp(w.temp)}
                  {reason && reason !== 'kalt' ? ` ${reason === 'Glätte möglich' ? 'Glätte' : reason}` : ''}
                </AppText>
              </View>
            </Marker>
          );
        })}
    </>
  );
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

export function WeatherSheet({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const [attr, setAttr] = useState<{ legalUrl: string; markDark?: string; name: string } | null>(null);
  useEffect(() => {
    if (item) void weatherAttribution().then(setAttr);
  }, [item]);
  const w = item?.w ?? null;
  const reason = w ? weatherReason(w) : null;
  return (
    <OptionsSheet
      visible={!!item}
      title={item?.pass.name}
      subtitle={item ? `${item.pass.ele.toLocaleString('de-DE')} m, wenn du jetzt losfährst gegen ${clock(item.at)}` : undefined}
      onClose={onClose}>
      {w && (
        <View style={styles.sheet}>
          <View style={styles.big}>
            <SymbolView name={w.symbol as never} size={40} type="multicolor" tintColor={Colors.text} />
            <AppText style={styles.temp}>{fmtTemp(w.temp)}</AppText>
            <AppText style={styles.cond} numberOfLines={2}>
              gefühlt {fmtTemp(w.feels)}
            </AppText>
          </View>
          {reason && (
            <View style={styles.reason}>
              <SymbolView name="exclamationmark.triangle.fill" size={16} tintColor={Colors.warn} />
              <AppText style={styles.reasonText}>
                {reason === 'kalt' ? `Oben nur ${Math.round(w.temp)} Grad.` : reason === 'Regen' ? 'Regen wahrscheinlich, nasse Kehren.' : reason === 'Schnee' ? 'Schnee möglich.' : reason === 'Sturmböen' ? `Böen bis ${Math.round(w.gust)} km/h.` : 'Glätte möglich.'}
              </AppText>
            </View>
          )}
          <View style={styles.grid}>
            <Cell label="Regen" value={`${Math.round(w.precipChance * 100)} %`} />
            <Cell label="Wind" value={`${Math.round(w.wind)} km/h`} />
            <Cell label="Böen" value={w.gust ? `${Math.round(w.gust)} km/h` : 'keine'} />
          </View>
          {attr && (
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(attr.legalUrl)} style={styles.attr}>
              {attr.markDark ? <Image source={{ uri: attr.markDark }} style={styles.mark} resizeMode="contain" accessibilityLabel={attr.name} /> : <AppText style={styles.attrText}>{attr.name}</AppText>}
              <AppText style={styles.attrText}>Datenquellen</AppText>
            </Pressable>
          )}
        </View>
      )}
    </OptionsSheet>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <AppText style={styles.cellLabel}>{label}</AppText>
      <AppText style={styles.cellValue}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  plaque: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 28,
    paddingLeft: 8,
    paddingRight: 10,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  },
  plaqueWarn: { backgroundColor: Colors.warn },
  plaqueText: { fontFamily: Fonts.bold, fontSize: 13, color: Colors.text, fontVariant: ['tabular-nums'] },
  plaqueTextWarn: { color: Colors.ground },
  sheet: { gap: Spacing.l },
  big: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  temp: { fontFamily: Fonts.display, fontSize: 40, lineHeight: 44, color: Colors.text, fontVariant: ['tabular-nums'] },
  cond: { flex: 1, fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  reason: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, backgroundColor: Colors.warnTint, borderRadius: Radius.m, padding: Spacing.m },
  reasonText: { flex: 1, fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.warn },
  grid: { flexDirection: 'row', gap: Spacing.s },
  cell: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.m, padding: Spacing.m, gap: 2 },
  cellLabel: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: Colors.muted },
  cellValue: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text, fontVariant: ['tabular-nums'] },
  attr: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 44 },
  mark: { width: 110, height: 18 },
  attrText: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: Colors.muted, textDecorationLine: 'underline' },
});
