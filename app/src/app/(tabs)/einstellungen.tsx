/**
 * Einstellungen: Konto und Garage. In der Garage legt man seine Fahrzeuge an; pro Fahrzeug
 * stehen die gefahrenen Kilometer und Touren aus dem Konto.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { MembershipSection } from '@/components/paywall/membership-section';
import { NameField, useNameCheck } from '@/components/auth/name-field';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { signIn, signOut, signUp, useSession } from '@/lib/auth';
import { listDrives, type Drive } from '@/lib/drives';
import { setDisplayName, useMyProfile } from '@/lib/profile';
import { formatKm } from '@/lib/tour';
import { deleteVehicle, FUELS, newVehicle, saveVehicle, selectVehicle, syncVehicles, useVehicles, vehicleSummary, type Vehicle } from '@/lib/vehicle';

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
      {session && <MembershipSection />}
      <View style={styles.gapM}>
        <AppText variant="label">Konto</AppText>
        {session ? <Account email={session.user.email ?? ''} /> : <Login />}
      </View>
    </Screen>
  );
}

function Account({ email }: { email: string }) {
  return (
    <View style={styles.card}>
      <DisplayName />
      <AppText muted>Angemeldet als {email}. Touren, Fahrten und Fahrzeuge liegen in deinem Konto und im Web Planer.</AppText>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.secondary}>
        <AppText style={styles.secondaryText}>Abmelden</AppText>
      </Pressable>
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
  const [confirm, setConfirm] = useState<string | null>(null);

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
          <AppText muted>Leg deine Fahrzeuge an. Vor jeder Fahrt wählst du, womit du fährst, dann landen Kilometer und Touren beim richtigen Auto. Tankstopps passen zur Reichweite.</AppText>
        </View>
      )}
      {list.map((v) =>
        edit?.id === v.id ? (
          <VehicleForm key={v.id} value={edit} onChange={setEdit} onDone={() => setEdit(null)} />
        ) : (
          <View key={v.id} style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityHint="Fahrzeug bearbeiten" onPress={() => setEdit(v)} style={styles.gapS}>
              <View style={styles.row}>
                <AppText style={[styles.name, styles.flex]} numberOfLines={1}>
                  {v.model.trim() || 'Fahrzeug ohne Namen'}
                </AppText>
                {current?.id === v.id && (
                  <View style={styles.badge}>
                    <AppText variant="caption" style={styles.badgeText}>
                      Aktuell
                    </AppText>
                  </View>
                )}
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
            <View style={styles.row}>
              {current?.id !== v.id && (
                <Pressable accessibilityRole="button" onPress={() => void selectVehicle(v.id)} style={[styles.secondary, styles.flex]}>
                  <AppText style={styles.secondaryText}>Als aktuell wählen</AppText>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (confirm === v.id) {
                    void deleteVehicle(v.id);
                    setConfirm(null);
                  } else setConfirm(v.id);
                }}
                style={[styles.secondary, styles.flex, confirm === v.id && styles.danger]}>
                <AppText style={[styles.secondaryText, confirm === v.id && styles.dangerText]}>{confirm === v.id ? 'Wirklich löschen' : 'Löschen'}</AppText>
              </Pressable>
            </View>
          </View>
        ),
      )}
      {edit && !list.some((v) => v.id === edit.id) && <VehicleForm value={edit} onChange={setEdit} onDone={() => setEdit(null)} />}
      {!edit && (
        <Pressable accessibilityRole="button" onPress={() => setEdit(newVehicle())} style={styles.primary}>
          <AppText style={styles.primaryText}>Fahrzeug hinzufügen</AppText>
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
  const num = (t: string) => {
    const x = parseFloat(t.replace(',', '.'));
    return Number.isFinite(x) && x > 0 ? x : null;
  };
  const str = (x: number | null) => (x == null ? '' : String(x).replace('.', ','));
  const set = (patch: Partial<Vehicle>) => onChange({ ...value, ...patch });
  return (
    <View style={styles.card}>
      <TextInput value={value.model} onChangeText={(t) => set({ model: t })} placeholder="Modell, zum Beispiel Porsche 911 GT3" placeholderTextColor={Colors.muted} style={styles.input} accessibilityLabel="Modell" />
      <View style={styles.row}>
        <TextInput defaultValue={str(value.widthM)} onChangeText={(t) => set({ widthM: num(t) })} placeholder="Breite in m" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" style={[styles.input, styles.flex]} accessibilityLabel="Breite in Metern" />
        <TextInput defaultValue={str(value.clearanceCm)} onChangeText={(t) => set({ clearanceCm: num(t) })} placeholder="Bodenfreiheit cm" placeholderTextColor={Colors.muted} keyboardType="number-pad" style={[styles.input, styles.flex]} accessibilityLabel="Bodenfreiheit in Zentimetern" />
      </View>
      <TextInput defaultValue={str(value.rangeKm)} onChangeText={(t) => set({ rangeKm: num(t) })} placeholder="Reichweite mit vollem Tank in km" placeholderTextColor={Colors.muted} keyboardType="number-pad" style={styles.input} accessibilityLabel="Reichweite in Kilometern" />
      <View style={styles.wrap}>
        {FUELS.map((f) => (
          <Chip key={f.id} label={f.label} active={value.fuel === f.id} onSurface onPress={() => set({ fuel: f.id })} />
        ))}
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
  flex: { flex: 1 },
  gapS: { gap: Spacing.xs },
  gapM: { gap: Spacing.m },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  name: { fontFamily: Fonts.semibold, fontSize: 17 },
  stat: { fontFamily: Fonts.semibold, fontSize: 15, fontVariant: ['tabular-nums'] },
  badge: { backgroundColor: Colors.goodTint, borderRadius: 999, paddingHorizontal: Spacing.s, paddingVertical: 2 },
  badgeText: { color: Colors.good, fontFamily: Fonts.semibold },
  input: { height: 50, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface2, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: 16 },
  primary: { height: 50, borderRadius: 25, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: 16 },
  secondary: { height: 48, borderRadius: 24, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: 15 },
  disabled: { opacity: 0.4 },
  padH: { paddingHorizontal: Spacing.l },
  error: { color: Colors.signal, fontFamily: Fonts.semibold },
  danger: { backgroundColor: Colors.signalTint },
  dangerText: { color: Colors.signal },
});
