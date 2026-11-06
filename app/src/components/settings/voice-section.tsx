/**
 * Einstellungen, Abschnitt Ansagen: Stimme wählen. Eine Zeile zeigt die aktuelle Stimme, Antippen öffnet
 * ein Bottom Sheet mit den deutschen Stimmen des iPhones. Antippen einer Stimme wählt sie und spielt
 * eine Hörprobe. Bessere Stimmen lädt man in den iPhone Einstellungen, der Hinweis steht unten im Sheet.
 */
import { SymbolView } from 'expo-symbols';
import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { OptionsSheet } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Spacing, Type } from '@/constants/theme';
import { germanVoices, playSample, setVoiceChoice, useVoiceChoice, type VoiceOption } from '@/lib/voice-settings';

export function VoiceSection() {
  const choice = useVoiceChoice();
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);

  useEffect(() => {
    if (!open || voices) return;
    germanVoices()
      .then(setVoices)
      .catch(() => setVoices([]));
  }, [open, voices]);

  const close = () => {
    Speech.stop().catch(() => {});
    setOpen(false);
  };
  const pick = (v: VoiceOption | null) => {
    setVoiceChoice(v ? { id: v.id, name: v.name } : null);
    playSample(v?.id);
  };

  return (
    <View style={styles.gapM}>
      <AppText variant="label">Ansagen</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Stimme der Ansagen wählen"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.flex}>
          <AppText style={styles.label}>Stimme</AppText>
          <AppText style={styles.value} numberOfLines={1}>
            {choice?.name ?? 'Standardstimme'}
          </AppText>
        </View>
        <SymbolView name="chevron.right" size={14} weight="semibold" tintColor={Colors.muted} />
      </Pressable>

      <OptionsSheet visible={open} title="Stimme der Ansagen" subtitle="Antippen zum Wählen und Probehören." onClose={close}>
        {!voices ? (
          <ActivityIndicator color={Colors.muted} style={styles.loading} />
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={styles.listInner}>
            <Row name="Standardstimme" detail="Wie im iPhone eingestellt" active={!choice} onPress={() => pick(null)} />
            {voices.map((v) => (
              <Row key={v.id} name={v.name} detail={[v.quality, v.region].filter(Boolean).join(' · ')} active={choice?.id === v.id} onPress={() => pick(v)} />
            ))}
            {voices.length === 0 && <AppText style={styles.hint}>Auf diesem Gerät ist keine deutsche Stimme installiert.</AppText>}
          </ScrollView>
        )}
        <AppText style={styles.hint}>
          Natürlicher klingen die Stimmen „Erweitert“ und „Premium“. Du lädst sie im iPhone unter Einstellungen, Bedienungshilfen, Gesprochene Inhalte, Stimmen, Deutsch.
        </AppText>
      </OptionsSheet>
    </View>
  );
}

function Row({ name, detail, active, onPress }: { name: string; detail: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityHint="Wählen und Hörprobe abspielen"
      onPress={onPress}
      style={({ pressed }) => [styles.row, active && styles.rowOn, pressed && styles.pressed]}>
      <View style={styles.flex}>
        <AppText style={styles.name}>{name}</AppText>
        <AppText style={styles.detail}>{detail}</AppText>
      </View>
      <SymbolView name={active ? 'checkmark.circle.fill' : 'play.circle'} size={24} tintColor={active ? Colors.signal : Colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gapM: { gap: Spacing.m },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l },
  label: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  value: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  pressed: { opacity: 0.85, transform: [{ scale: Motion.pressScale }] },
  loading: { paddingVertical: Spacing.xl },
  list: { maxHeight: 380 },
  listInner: { gap: Spacing.xs },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingHorizontal: Spacing.m, borderRadius: Radius.l, backgroundColor: Colors.surface2 },
  rowOn: { backgroundColor: Colors.signalTint },
  name: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  detail: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  hint: { fontFamily: Fonts.regular, fontSize: Type.body, lineHeight: 21, color: Colors.muted, paddingHorizontal: Spacing.s },
});
