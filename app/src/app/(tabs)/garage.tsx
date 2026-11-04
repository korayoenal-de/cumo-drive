/**
 * Garage: Konto und Meine Touren aus dem Konto (im Web Planer gespeichert oder in der App).
 * Dazu das Fahrzeugprofil: Modell, Breite, Bodenfreiheit, Reichweite und Sprit.
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { setActiveTour } from '@/lib/active-tour';
import { signIn, signOut, signUp, useSession } from '@/lib/auth';
import { listCloudTours, loadCloudTour, type CloudTour } from '@/lib/cloud-tours';
import { listDrives, type Drive } from '@/lib/drives';
import { FUELS, saveVehicle, useVehicle, vehicleSummary, type Vehicle } from '@/lib/vehicle';
import { fmtG } from '@/lib/ride-stats';
import { formatKm } from '@/lib/tour';
import { DEFAULT_AVOID } from '@/lib/valhalla';

export default function Garage() {
  const session = useSession();
  return (
    <Screen>
      <AppText variant="display">Garage</AppText>
      {session ? <Tours email={session.user.email ?? ''} /> : <Login />}
      <VehicleCard />
    </Screen>
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
      <AppText variant="label">Konto</AppText>
      <AppText muted>Melde dich an, dann findest du hier alle Touren aus dem Web Planer.</AppText>
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

function Tours({ email }: { email: string }) {
  const [list, setList] = useState<CloudTour[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listCloudTours()
      .then((l) => {
        setList(l);
        setErr(null);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const open = async (t: CloudTour) => {
    setOpening(t.id);
    try {
      const full = await loadCloudTour(t.id);
      setActiveTour(full.tour, full.profile, full.avoid ?? DEFAULT_AVOID);
      router.push('/karte');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Die Tour konnte nicht geladen werden.');
    } finally {
      setOpening(null);
    }
  };

  return (
    <>
      <View style={styles.accountRow}>
        <AppText variant="caption" muted style={styles.flex}>
          Angemeldet als {email}
        </AppText>
        <Pressable accessibilityRole="button" onPress={() => void signOut()}>
          <AppText variant="caption">Abmelden</AppText>
        </Pressable>
      </View>
      <View style={styles.card}>
        <View style={styles.row}>
          <AppText variant="label" style={styles.flex}>
            Meine Touren
          </AppText>
          <Pressable accessibilityRole="button" onPress={refresh}>
            <AppText variant="caption">Aktualisieren</AppText>
          </Pressable>
        </View>
        {err && <AppText style={styles.error}>{err}</AppText>}
        {list === null && !err && <ActivityIndicator color={Colors.muted} />}
        {list?.length === 0 && <AppText muted>Noch keine Tour im Konto. Im Web Planer anmelden und eine Tour speichern, dann erscheint sie hier.</AppText>}
        {list?.map((t, i) => (
          <Pressable key={t.id} accessibilityRole="button" onPress={() => open(t)} style={styles.tourRow}>
            <View style={styles.flex}>
              <AppText style={styles.tourName} numberOfLines={1}>
                {t.name}
              </AppText>
              <AppText variant="caption" muted>
                {[`${formatKm(t.km, 0)} km`, t.curves ? `${t.curves} Kurven` : null, t.folder || null, new Date(t.updated_at).toLocaleDateString('de-DE')].filter(Boolean).join(', ')}
              </AppText>
            </View>
            {opening === t.id ? <ActivityIndicator color={Colors.signal} /> : <AppText style={styles.arrow}>›</AppText>}
          </Pressable>
        ))}
      </View>
      <Drives />
    </>
  );
}

/** Gefahrene Touren mit den wichtigsten Werten der Fahrtstatistik. */
function Drives() {
  const [list, setList] = useState<Drive[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    listDrives()
      .then(setList)
      .catch((e: Error) => setErr(e.message));
  }, []);
  return (
    <View style={styles.card}>
      <AppText variant="label">Gefahrene Touren</AppText>
      {err && <AppText style={styles.error}>{err}</AppText>}
      {list === null && !err && <ActivityIndicator color={Colors.muted} />}
      {list?.length === 0 && <AppText muted>Noch keine Fahrt gespeichert. Nach jeder Navigation landet die Fahrtstatistik hier.</AppText>}
      {list?.map((d, i) => {
        const h = Math.floor(d.moving_min / 60);
        const m = d.moving_min % 60;
        return (
          <View key={d.id} style={styles.driveRow}>
            <View style={styles.row}>
              <AppText style={[styles.tourName, styles.flex]} numberOfLines={1}>
                {d.name}
              </AppText>
              <AppText variant="caption" muted>
                {new Date(d.started_at).toLocaleDateString('de-DE')}
              </AppText>
            </View>
            <AppText variant="caption" muted>
              {[
                `${formatKm(Number(d.km), 0)} km`,
                h ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`,
                d.curves ? `${d.curves} Kurven` : null,
                d.max_lat_g ? `quer ${fmtG(Number(d.max_lat_g))}` : null,
                d.max_kmh ? `bis ${Math.round(Number(d.max_kmh))} km/h` : null,
              ]
                .filter(Boolean)
                .join(', ')}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  input: { height: 50, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface2, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: 16 },
  primary: { height: 50, borderRadius: 25, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: 16 },
  secondary: { height: 50, borderRadius: 25, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: 16 },
  disabled: { opacity: 0.4 },
  error: { color: Colors.signal, fontFamily: Fonts.semibold },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  tourRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingVertical: Spacing.m },
  tourName: { fontFamily: Fonts.semibold, fontSize: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  driveRow: { gap: 2, paddingVertical: Spacing.m },
  arrow: { fontFamily: Fonts.display, fontSize: 24, color: Colors.muted },
});

/** Fahrzeugprofil: zeigt die Angaben, Tippen öffnet das Formular. */
function VehicleCard() {
  const v = useVehicle();
  const [edit, setEdit] = useState<Vehicle | null>(null);
  const num = (t: string) => {
    const x = parseFloat(t.replace(',', '.'));
    return Number.isFinite(x) && x > 0 ? x : null;
  };
  const str = (x: number | null) => (x == null ? '' : String(x).replace('.', ','));
  if (!edit) {
    const filled = v.model.trim() || v.widthM || v.rangeKm;
    return (
      <View style={styles.card}>
        <AppText variant="label">Fahrzeug</AppText>
        <AppText muted>{filled ? vehicleSummary(v) : 'Trag dein Auto ein. Damit sieht die Gruppe, wer was fährt, und Tankstopps passen zu deiner Reichweite.'}</AppText>
        <Pressable accessibilityRole="button" onPress={() => setEdit(v)} style={styles.secondary}>
          <AppText style={styles.secondaryText}>{filled ? 'Fahrzeug bearbeiten' : 'Fahrzeug eintragen'}</AppText>
        </Pressable>
      </View>
    );
  }
  const set = (patch: Partial<Vehicle>) => setEdit({ ...edit, ...patch });
  return (
    <View style={styles.card}>
      <AppText variant="label">Fahrzeug</AppText>
      <TextInput value={edit.model} onChangeText={(t) => set({ model: t })} placeholder="Modell, zum Beispiel Porsche 911 GT3" placeholderTextColor={Colors.muted} style={styles.input} accessibilityLabel="Modell" />
      <View style={styles.row}>
        <TextInput
          defaultValue={str(edit.widthM)}
          onChangeText={(t) => set({ widthM: num(t) })}
          placeholder="Breite in m"
          placeholderTextColor={Colors.muted}
          keyboardType="decimal-pad"
          style={[styles.input, styles.flex]}
          accessibilityLabel="Breite in Metern"
        />
        <TextInput
          defaultValue={str(edit.clearanceCm)}
          onChangeText={(t) => set({ clearanceCm: num(t) })}
          placeholder="Bodenfreiheit cm"
          placeholderTextColor={Colors.muted}
          keyboardType="number-pad"
          style={[styles.input, styles.flex]}
          accessibilityLabel="Bodenfreiheit in Zentimetern"
        />
      </View>
      <TextInput
        defaultValue={str(edit.rangeKm)}
        onChangeText={(t) => set({ rangeKm: num(t) })}
        placeholder="Reichweite mit vollem Tank in km"
        placeholderTextColor={Colors.muted}
        keyboardType="number-pad"
        style={styles.input}
        accessibilityLabel="Reichweite in Kilometern"
      />
      <View style={styles.wrap}>
        {FUELS.map((f) => (
          <Chip key={f.id} label={f.label} active={edit.fuel === f.id} onSurface onPress={() => set({ fuel: f.id })} />
        ))}
      </View>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void saveVehicle(edit);
            setEdit(null);
          }}
          style={[styles.primary, styles.flex]}>
          <AppText style={styles.primaryText}>Speichern</AppText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setEdit(null)} style={[styles.secondary, styles.flex]}>
          <AppText style={styles.secondaryText}>Abbrechen</AppText>
        </Pressable>
      </View>
    </View>
  );
}
