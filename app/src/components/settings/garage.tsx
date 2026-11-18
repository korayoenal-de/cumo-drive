/**
 * Garage: alle Fahrzeuge, das aktuelle ist markiert; pro Fahrzeug die gefahrenen Kilometer und Touren aus dem Konto.
 */
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { IconLabel } from '@/components/ui/btn-icon';
import { TextField } from '@/components/ui/text-field';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import { type Drive } from '@/lib/drives';
import { formatKm } from '@/lib/tour';
import { deleteVehicle, newVehicle, saveVehicle, selectVehicle, useVehicles, vehicleName, type Vehicle } from '@/lib/vehicle';
import { CustomColorButton } from '@/components/garage/custom-color';
import { CAR_COLORS, CarStagePicker, CarSprite, carLookFor, DEFAULT_LOOK, frameFor } from '@/components/map/car-sprite';
import { ActionSheet, ConfirmSheet } from '@/components/ui/action-sheet';
import { showToast } from '@/lib/toast';
import { t, tr } from '@/i18n';

/** Garage: alle Fahrzeuge, das aktuelle ist markiert; Tippen öffnet das Formular. */
export function Garage({ drives }: { drives: Drive[] | null }) {
  const { list, current } = useVehicles();
  const [edit, setEdit] = useState<Vehicle | null>(null);
  // Optionen im Bottom Sheet, Löschen mit Rückfrage (Muster: docs/design-prinzipien.md)
  const [menu, setMenu] = useState<Vehicle | null>(null);
  const [ask, setAsk] = useState<Vehicle | null>(null);

  const statsFor = (v: Vehicle) => {
    const mine = (drives ?? []).filter((d) => d.vehicle_id === v.id);
    return { n: mine.length, km: mine.reduce((s, d) => s + Number(d.km), 0) };
  };
  const unassigned = (drives ?? []).filter((d) => !d.vehicle_id);

  return (
    <View style={styles.gapM}>
      {list.length === 0 && !edit && (
        <View style={styles.card}>
          <AppText muted>{t('Leg deine Fahrzeuge an. Vor jeder Fahrt wählst du, womit du fährst, dann landen Kilometer und Touren beim richtigen Auto.')}</AppText>
        </View>
      )}
      {list.map((v) =>
        edit?.id === v.id ? (
          <VehicleForm key={v.id} value={edit} onChange={setEdit} onDone={() => setEdit(null)} />
        ) : (
          <View key={v.id} style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityHint={t('Fahrzeug bearbeiten')} onPress={() => setEdit(v)} style={styles.gapS}>
              <View style={styles.row}>
                {carLookFor(v) && (
                  <View accessibilityLabel={t('Fährt als eigenes Symbol auf der Karte')}>
                    <CarSprite look={carLookFor(v)!} frame={frameFor(215)} size={48} />
                  </View>
                )}
                <AppText style={[styles.name, styles.flex]} numberOfLines={1}>
                  {vehicleName(v) || tr('Fahrzeug ohne Namen')}
                </AppText>
                {current?.id === v.id && (
                  <View style={styles.badge}>
                    <AppText variant="caption" style={styles.badgeText}>
                      {tr('Aktuell')}
                    </AppText>
                  </View>
                )}
                <Pressable accessibilityRole="button" accessibilityLabel={tr('Optionen für {v0}', { v0: vehicleName(v) || tr('Fahrzeug') })} onPress={() => setMenu(v)} hitSlop={6} style={styles.more}>
                  <SymbolView name="ellipsis" size={20} tintColor={Colors.text} weight="semibold" />
                </Pressable>
              </View>
              {drives && (
                <AppText style={styles.stat}>
                  {(() => {
                    const s = statsFor(v);
                    return s.n ? (s.n === 1 ? tr('{km} km in 1 Tour', { km: formatKm(s.km, 0) }) : tr('{km} km in {n} Touren', { km: formatKm(s.km, 0), n: s.n })) : tr('Noch keine Fahrt mit diesem Auto');
                  })()}
                </AppText>
              )}
            </Pressable>
          </View>
        ),
      )}
      <ActionSheet
        visible={!!menu}
        title={menu?.model.trim() || tr('Fahrzeug')}
        subtitle={undefined}
        items={
          menu
            ? [
                ...(current?.id !== menu.id ? [{ key: 'cur', icon: 'checkmark.circle' as const, label: t('Als aktuell wählen'), onPress: () => void selectVehicle(menu.id) }] : []),
                { key: 'edit', icon: 'pencil' as const, label: t('Bearbeiten'), onPress: () => setEdit(menu) },
                carLookFor(menu)
                  ? { key: 'sym', icon: 'location.north.fill' as const, label: t('Pfeil auf der Karte'), hint: t('Statt deines Autos wieder den Pfeil zeigen'), onPress: () => void saveVehicle({ ...menu, mapSymbol: 'pfeil' }) }
                  : { key: 'sym', icon: 'car.fill' as const, label: t('Auto auf der Karte'), hint: t('Form und Farbe wählst du beim Bearbeiten'), onPress: () => void saveVehicle({ ...menu, mapSymbol: 'auto' }).then(() => showToast(t('Dein Auto fährt jetzt auf der Karte mit'))) },
                { key: 'del', icon: 'trash' as const, label: t('Fahrzeug löschen'), hint: t('Gefahrene Touren bleiben erhalten'), danger: true, onPress: () => setAsk(menu) },
              ]
            : []
        }
        onClose={() => setMenu(null)}
      />
      <ConfirmSheet
        visible={!!ask}
        title={t('Möchtest du dieses Fahrzeug wirklich löschen?')}
        text={tr('Gefahrene Touren bleiben erhalten.')}
        confirmLabel={t('Löschen')}
        onConfirm={() => {
          if (ask) void deleteVehicle(ask.id);
          showToast(t('Fahrzeug gelöscht'));
        }}
        onClose={() => setAsk(null)}
      />
      {edit && !list.some((v) => v.id === edit.id) && <VehicleForm value={edit} onChange={setEdit} onDone={() => setEdit(null)} />}
      {!edit && (
        // Hauptaktion der Garage, daher in Signal Orange (Koray 18.11., löst den Konsistenz Check vom 9.11. ab)
        <Pressable accessibilityRole="button" onPress={() => setEdit(newVehicle())} style={({ pressed }) => [styles.primary, pressed && styles.pressedMain]}>
          <IconLabel icon={{ sf: 'plus' }} color={Colors.onSignal}>
<AppText style={styles.primaryText}>{t('Fahrzeug hinzufügen')}</AppText>
</IconLabel>
        </Pressable>
      )}
      {drives && unassigned.length > 0 && (
        <AppText variant="caption" muted>
          {formatKm(
            unassigned.reduce((s, d) => s + Number(d.km), 0),
            0,
          )}{' '}
          {tr('km aus ')}{unassigned.length}{tr(' früheren ')}{unassigned.length === 1 ? tr('Fahrt') : tr('Fahrten')}{tr(' ohne Fahrzeug.')}
        </AppText>
      )}
    </View>
  );
}

function VehicleForm({ value, onChange, onDone }: { value: Vehicle; onChange: (v: Vehicle) => void; onDone: () => void }) {
  const set = (patch: Partial<Vehicle>) => onChange({ ...value, ...patch });
  return (
    <View style={styles.card}>
      {/* Ein Feld für Marke und Modell, keine Spritwahl mehr (Koray 9.11.) */}
      <TextField maxFontSizeMultiplier={1.2}
        // roh anzeigen: vehicleName schneidet Leerzeichen am Ende ab, dann ließ sich kein Leerzeichen tippen (Tester Joe 10.11.)
        value={value.brand ? vehicleName(value) : value.model}
        onChangeText={(t) => set({ brand: '', model: t })}
        placeholder={t('Marke und Modell, etwa Porsche 911 GT3')}
        placeholderTextColor={Colors.muted}
        style={styles.input}
        accessibilityLabel={t('Marke und Modell')}
      />
      {/* Kartensymbol: Form und Lack, Vorschau zum Drehen (Koray 9.11., Platzhalter Modelle) */}
      <AppText variant="title">{t('Auf der Karte')}</AppText>
      <CarStagePicker look={value.look ?? DEFAULT_LOOK} onForm={(form) => set({ look: { ...(value.look ?? DEFAULT_LOOK), form }, mapSymbol: 'auto' })} />
      <View style={styles.dots}>
        {CAR_COLORS.map((c) => {
          const on = (value.look ?? DEFAULT_LOOK).color === c.id;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityLabel={c.label}
              accessibilityState={{ selected: on }}
              onPress={() => set({ look: { ...(value.look ?? DEFAULT_LOOK), color: c.id }, mapSymbol: 'auto' })}
              style={[styles.dotRing, on && styles.dotRingOn]}>
              <View style={[styles.dot, { backgroundColor: c.id }]} />
            </Pressable>
          );
        })}
        <CustomColorButton
          value={(value.look ?? DEFAULT_LOOK).color}
          custom={!CAR_COLORS.some((c) => c.id === (value.look ?? DEFAULT_LOOK).color)}
          onPick={(hex) => set({ look: { ...(value.look ?? DEFAULT_LOOK), color: hex }, mapSymbol: 'auto' })}
        />
      </View>
      {/* mehr Luft zwischen Farbwahl und Knöpfen (Koray 9.11.) */}
      <View style={[styles.row, { marginTop: Spacing.l }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void saveVehicle(value);
            onDone();
          }}
          style={[styles.primary, styles.flex]}>
          <AppText style={styles.primaryText}>{t('Speichern')}</AppText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onDone} style={[styles.secondary, styles.flex]}>
          <AppText style={styles.secondaryText}>{t('Abbrechen')}</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  deleteLink: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.m },
  deleteText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  dotRing: { width: Size.icon, height: Size.icon, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  dotRingOn: { borderColor: Colors.text },
  dot: { width: 32, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)' },
  more: { width: Size.icon, height: Size.icon, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface2 },
  flex: { flex: 1 },
  gapS: { gap: Spacing.xs },
  gapM: { gap: Spacing.m },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  name: { fontFamily: Fonts.semibold, fontSize: Type.title },
  stat: { fontFamily: Fonts.semibold, fontSize: Type.body, fontVariant: ['tabular-nums'] },
  badge: { backgroundColor: Colors.goodTint, borderRadius: Radius.pill, paddingHorizontal: Spacing.s, paddingVertical: 2 },
  badgeText: { color: Colors.good, fontFamily: Fonts.semibold },
  input: { height: Size.input, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface2, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  pressedMain: { transform: [{ scale: Motion.pressScale }], opacity: 0.9 },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.input },
  secondary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  disabled: { opacity: 0.4 },
  padH: { paddingHorizontal: Spacing.l },
  error: { color: Colors.signal, fontFamily: Fonts.semibold },
  danger: { backgroundColor: Colors.dangerTint },
  dangerText: { color: Colors.signal },
});
