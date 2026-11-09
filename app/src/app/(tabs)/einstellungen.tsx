/**
 * Einstellungen: Garage, Ansagen (Stimme) und Konto. In der Garage legt man seine Fahrzeuge an; pro Fahrzeug
 * stehen die gefahrenen Kilometer und Touren aus dem Konto.
 */
import { SymbolView } from 'expo-symbols';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { MembershipSection } from '@/components/paywall/membership-section';
import { VoiceSection } from '@/components/settings/voice-section';
import { NameField, useNameCheck } from '@/components/auth/name-field';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';
import { deleteAccount, signIn, signOut, signUp, useSession } from '@/lib/auth';
import { clearLocalTours } from '@/lib/library';
import { listDrives, type Drive } from '@/lib/drives';
import { setDisplayName, useMyProfile } from '@/lib/profile';
import { formatKm } from '@/lib/tour';
import { deleteVehicle, FUELS, newVehicle, saveVehicle, selectVehicle, syncVehicles, useVehicles, vehicleName, vehicleSummary, type Vehicle } from '@/lib/vehicle';
import { CAR_COLORS, CarCoverFlow, CarSprite, carLookFor, DEFAULT_LOOK, frameFor } from '@/components/map/car-sprite';
import { ActionSheet, ConfirmSheet } from '@/components/ui/action-sheet';
import { showToast } from '@/lib/toast';

export default function Einstellungen() {
  const session = useSession();
  const [drives, setDrives] = useState<Drive[] | null>(null);

  // nach der Anmeldung Fahrzeuge abgleichen und Fahrten für die Kilometer je Fahrzeug laden
  useEffect(() => {
    if (session) void syncVehicles();
  }, [session]);
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      listDrives()
        .then(setDrives)
        .catch(() => setDrives([]));
    }, [session]),
  );

  return (
    <Screen>
      <AppText variant="display" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        Einstellungen
      </AppText>
      <Garage drives={session ? drives : null} />
      <VoiceSection />
      {session && <MembershipSection />}
      <View style={styles.gapM}>
        <AppText variant="label">Konto</AppText>
        {session ? <Account email={session.user.email ?? ''} /> : <Login />}
      </View>
    </Screen>
  );
}

function Account({ email }: { email: string }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await deleteAccount();
      clearLocalTours();
      showToast('Dein Konto ist gelöscht.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Löschen hat nicht geklappt.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.card}>
      <DisplayName />
      <AppText muted>Angemeldet als {email}. Touren, Fahrten und Fahrzeuge liegen in deinem Konto und im Web Planer.</AppText>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.secondary}>
        <AppText style={styles.secondaryText}>Abmelden</AppText>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => setAsk(true)} hitSlop={8} style={styles.deleteLink}>
        <AppText style={styles.deleteText}>{busy ? 'Konto wird gelöscht' : 'Konto löschen'}</AppText>
      </Pressable>
      <ConfirmSheet
        visible={ask}
        title="Möchtest du dein Konto wirklich löschen?"
        text="Touren, Fahrten, Fahrzeuge, Bewertungen und dein Name werden endgültig gelöscht, auch in der Community. Das lässt sich nicht rückgängig machen. Ein Abo kündigst du separat in den Einstellungen deiner Apple ID."
        confirmLabel="Löschen"
        onConfirm={() => void remove()}
        onClose={() => setAsk(false)}
      />
    </View>
  );
}

/** Name, unter dem einen andere finden und einladen; ändern mit Prüfung, ob der neue Name frei ist. */
function DisplayName() {
  const session = useSession();
  const profile = useMyProfile(session?.user.id);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const current = profile?.displayName ?? null;
  const check = useNameCheck(draft ?? '', current);

  const save = async () => {
    if (draft == null || check.state !== 'frei') return;
    setBusy(true);
    setErr(null);
    try {
      await setDisplayName(draft);
      setDraft(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };

  if (draft == null) {
    return (
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText variant="caption" muted>
            Dein Name
          </AppText>
          <AppText style={styles.name} numberOfLines={1}>
            {current ?? 'Noch kein Name'}
          </AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Namen ändern" onPress={() => setDraft(current ?? '')} style={[styles.secondary, styles.padH]}>
          <AppText style={styles.secondaryText}>Ändern</AppText>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.gapS}>
      <NameField value={draft} onChange={setDraft} check={check} onSurface />
      {err && <AppText style={styles.error}>{err}</AppText>}
      <View style={styles.row}>
        <Pressable accessibilityRole="button" disabled={busy || check.state !== 'frei'} onPress={() => void save()} style={[styles.primary, styles.flex, (busy || check.state !== 'frei') && styles.disabled]}>
          {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Speichern</AppText>}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setDraft(null)} style={[styles.secondary, styles.flex]}>
          <AppText style={styles.secondaryText}>Abbrechen</AppText>
        </Pressable>
      </View>
    </View>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: (e: string, p: string) => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn(email, pw);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };
  const ready = !!email.trim() && pw.length > 0 && !busy;
  return (
    <View style={styles.card}>
      <AppText muted>Mit Konto findest du deine Touren auch im Web Planer, kannst Touren veröffentlichen und deine Fahrten werden gespeichert.</AppText>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="E-Mail"
        placeholderTextColor={Colors.muted}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        style={styles.input}
        accessibilityLabel="E-Mail"
      />
      <TextInput
        value={pw}
        onChangeText={setPw}
        placeholder="Passwort, mindestens 8 Zeichen"
        placeholderTextColor={Colors.muted}
        secureTextEntry
        autoComplete="password"
        style={styles.input}
        accessibilityLabel="Passwort"
      />
      {err && <AppText style={styles.error}>{err}</AppText>}
      <View style={styles.row}>
        <Pressable accessibilityRole="button" disabled={!ready} onPress={() => run(signIn)} style={[styles.primary, styles.flex, !ready && styles.disabled]}>
          {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Anmelden</AppText>}
        </Pressable>
        <Pressable accessibilityRole="button" disabled={!ready} onPress={() => run(signUp)} style={[styles.secondary, styles.flex, !ready && styles.disabled]}>
          <AppText style={styles.secondaryText}>Registrieren</AppText>
        </Pressable>
      </View>
    </View>
  );
}

/** Garage: alle Fahrzeuge, das aktuelle ist markiert; Tippen öffnet das Formular. */
function Garage({ drives }: { drives: Drive[] | null }) {
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
      <AppText variant="label">Garage</AppText>
      {list.length === 0 && !edit && (
        <View style={styles.card}>
          <AppText muted>Leg deine Fahrzeuge an. Vor jeder Fahrt wählst du, womit du fährst, dann landen Kilometer und Touren beim richtigen Auto.</AppText>
        </View>
      )}
      {list.map((v) =>
        edit?.id === v.id ? (
          <VehicleForm key={v.id} value={edit} onChange={setEdit} onDone={() => setEdit(null)} />
        ) : (
          <View key={v.id} style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityHint="Fahrzeug bearbeiten" onPress={() => setEdit(v)} style={styles.gapS}>
              <View style={styles.row}>
                {carLookFor(v) && (
                  <View accessibilityLabel="Fährt als eigenes Symbol auf der Karte">
                    <CarSprite look={carLookFor(v)!} frame={frameFor(215)} size={48} />
                  </View>
                )}
                <AppText style={[styles.name, styles.flex]} numberOfLines={1}>
                  {vehicleName(v) || 'Fahrzeug ohne Namen'}
                </AppText>
                {current?.id === v.id && (
                  <View style={styles.badge}>
                    <AppText variant="caption" style={styles.badgeText}>
                      Aktuell
                    </AppText>
                  </View>
                )}
                <Pressable accessibilityRole="button" accessibilityLabel={`Optionen für ${vehicleName(v) || 'Fahrzeug'}`} onPress={() => setMenu(v)} hitSlop={6} style={styles.more}>
                  <SymbolView name="ellipsis" size={18} tintColor={Colors.text} weight="medium" />
                </Pressable>
              </View>
              <AppText variant="caption" muted>
                {vehicleSummary(v, false)}
              </AppText>
              {drives && (
                <AppText style={styles.stat}>
                  {(() => {
                    const s = statsFor(v);
                    return s.n ? `${formatKm(s.km, 0)} km in ${s.n} ${s.n === 1 ? 'Tour' : 'Touren'}` : 'Noch keine Fahrt mit diesem Auto';
                  })()}
                </AppText>
              )}
            </Pressable>
          </View>
        ),
      )}
      <ActionSheet
        visible={!!menu}
        title={menu?.model.trim() || 'Fahrzeug'}
        subtitle={menu ? vehicleSummary(menu, false) : undefined}
        items={
          menu
            ? [
                ...(current?.id !== menu.id ? [{ key: 'cur', icon: 'checkmark.circle' as const, label: 'Als aktuell wählen', hint: 'Damit fährst du ab jetzt', onPress: () => void selectVehicle(menu.id) }] : []),
                { key: 'edit', icon: 'pencil' as const, label: 'Bearbeiten', hint: 'Marke, Modell und Kraftstoff', onPress: () => setEdit(menu) },
                carLookFor(menu)
                  ? { key: 'sym', icon: 'location.north.fill' as const, label: 'Pfeil auf der Karte', hint: 'Statt deines Autos wieder den Pfeil zeigen', onPress: () => void saveVehicle({ ...menu, mapSymbol: 'pfeil' }) }
                  : { key: 'sym', icon: 'car.fill' as const, label: 'Auto auf der Karte', hint: 'Form und Farbe wählst du beim Bearbeiten', onPress: () => void saveVehicle({ ...menu, mapSymbol: 'auto' }).then(() => showToast('Dein Auto fährt jetzt auf der Karte mit')) },
                { key: 'del', icon: 'trash' as const, label: 'Fahrzeug löschen', danger: true, onPress: () => setAsk(menu) },
              ]
            : []
        }
        onClose={() => setMenu(null)}
      />
      <ConfirmSheet
        visible={!!ask}
        title="Möchtest du dieses Fahrzeug wirklich löschen?"
        text="Gefahrene Touren bleiben erhalten."
        confirmLabel="Löschen"
        onConfirm={() => {
          if (ask) void deleteVehicle(ask.id);
          showToast('Fahrzeug gelöscht');
        }}
        onClose={() => setAsk(null)}
      />
      {edit && !list.some((v) => v.id === edit.id) && <VehicleForm value={edit} onChange={setEdit} onDone={() => setEdit(null)} />}
      {!edit && (
        // kein Hauptweg der Seite, daher Zweittaste (UI Konsistenz Check 9.11.)
        <Pressable accessibilityRole="button" onPress={() => setEdit(newVehicle())} style={styles.secondary}>
          <AppText style={styles.secondaryText}>Fahrzeug hinzufügen</AppText>
        </Pressable>
      )}
      {drives && unassigned.length > 0 && (
        <AppText variant="caption" muted>
          {formatKm(
            unassigned.reduce((s, d) => s + Number(d.km), 0),
            0,
          )}{' '}
          km aus {unassigned.length} früheren {unassigned.length === 1 ? 'Fahrt' : 'Fahrten'} ohne Fahrzeug.
        </AppText>
      )}
    </View>
  );
}

function VehicleForm({ value, onChange, onDone }: { value: Vehicle; onChange: (v: Vehicle) => void; onDone: () => void }) {
  const set = (patch: Partial<Vehicle>) => onChange({ ...value, ...patch });
  return (
    <View style={styles.card}>
      {/* Nur noch Marke und Modell (Koray 9.11.); Breite, Bodenfreiheit und Reichweite entfallen */}
      <View style={styles.row}>
        <TextInput value={value.brand ?? ''} onChangeText={(t) => set({ brand: t })} placeholder="Marke" placeholderTextColor={Colors.muted} style={[styles.input, styles.flex]} accessibilityLabel="Marke" />
        <TextInput value={value.model} onChangeText={(t) => set({ model: t })} placeholder="Modell, etwa 911 GT3" placeholderTextColor={Colors.muted} style={[styles.input, styles.flex]} accessibilityLabel="Modell" />
      </View>
      <View style={styles.wrap}>
        {FUELS.map((f) => (
          <Chip key={f.id} label={f.label} active={value.fuel === f.id} onSurface onPress={() => set({ fuel: f.id })} />
        ))}
      </View>
      {/* Kartensymbol: Form und Lack, Vorschau zum Drehen (Koray 9.11., Platzhalter Modelle) */}
      <AppText variant="title">Auf der Karte</AppText>
      <CarCoverFlow look={value.look ?? DEFAULT_LOOK} onForm={(form) => set({ look: { ...(value.look ?? DEFAULT_LOOK), form }, mapSymbol: 'auto' })} />
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
      </View>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void saveVehicle(value);
            onDone();
          }}
          style={[styles.primary, styles.flex]}>
          <AppText style={styles.primaryText}>Speichern</AppText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onDone} style={[styles.secondary, styles.flex]}>
          <AppText style={styles.secondaryText}>Abbrechen</AppText>
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
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.input },
  secondary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  disabled: { opacity: 0.4 },
  padH: { paddingHorizontal: Spacing.l },
  error: { color: Colors.signal, fontFamily: Fonts.semibold },
  danger: { backgroundColor: Colors.signalTint },
  dangerText: { color: Colors.signal },
});
