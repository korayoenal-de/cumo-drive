/**
 * Melden als Blatt (Koray 12.11.): Grund als Chip, freiwillige Notiz, Melden als Hauptaktion.
 * Danach ein Toast, auf Wunsch gleich Blockieren. Server kopiert den Inhalt zum Zeitpunkt der Meldung.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ConfirmSheet, OptionsSheet, SHEET_GONE_MS } from '@/components/ui/action-sheet';
import { Chip } from '@/components/ui/chip';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import { blockUser, REASONS, reportContent, type ReportKind, type ReportReason } from '@/lib/moderation';
import { showToast } from '@/lib/toast';

export function ReportSheet(props: {
  visible: boolean;
  kind: ReportKind;
  refId: string;
  /** Wer dahintersteht, für Blockieren danach */
  userId?: string | null;
  name?: string | null;
  onClose: () => void;
}) {
  const { visible, kind, refId, userId, name, onClose } = props;
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const close = () => {
    setReason(null);
    setNote('');
    setErr(null);
    onClose();
  };
  const send = async () => {
    if (!reason || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await reportContent(kind, refId, reason, note);
      close();
      setTimeout(
        () =>
          showToast(
            'Danke, wir schauen es uns an.',
            userId ? { action: { label: `${name ?? 'Fahrer'} blockieren`, onPress: () => void blockUser(userId).then(() => showToast(`${name ?? 'Fahrer'} ist blockiert`)) } } : {},
          ),
        SHEET_GONE_MS,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <OptionsSheet visible={visible} title="Was stimmt hier nicht?" subtitle="Deine Meldung bleibt anonym. Wir sehen uns den Inhalt an und entfernen ihn, wenn er gegen die Regeln verstößt." onClose={close}>
      <View style={styles.wrap}>
        <View style={styles.chips}>
          {REASONS.map((r) => (
            <Chip key={r.v} label={r.label} active={reason === r.v} onSurface onPress={() => setReason(r.v)} />
          ))}
        </View>
        <TextInput
          maxFontSizeMultiplier={1.2}
          value={note}
          onChangeText={(t) => setNote(t.slice(0, 500))}
          placeholder="Was sollen wir wissen? (optional)"
          placeholderTextColor={Colors.muted}
          multiline
          style={styles.input}
          accessibilityLabel="Notiz zur Meldung"
        />
        {err && <AppText style={styles.err}>{err}</AppText>}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !reason }}
          disabled={!reason || busy}
          onPress={() => void send()}
          style={({ pressed }) => [styles.primary, !reason && styles.primaryOff, pressed && styles.pressed]}>
          {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Melden</AppText>}
        </Pressable>
      </View>
    </OptionsSheet>
  );
}

/** Rückfrage vor dem Blockieren */
export function BlockSheet({ visible, userId, name, onClose, onDone }: { visible: boolean; userId: string; name: string; onClose: () => void; onDone?: () => void }) {
  return (
    <ConfirmSheet
      visible={visible}
      title={`Möchtest du ${name} blockieren?`}
      text={`${name} kann dir dann nicht mehr schreiben und ihr seht euch nicht mehr unter Drivers. ${name} erfährt davon nichts. Aufheben kannst du das in den Einstellungen.`}
      confirmLabel="Blockieren"
      onClose={onClose}
      onConfirm={() => {
        blockUser(userId)
          .then(() => {
            setTimeout(() => showToast(`${name} ist blockiert`), SHEET_GONE_MS);
            onDone?.();
          })
          .catch((e: Error) => showToast(e.message, { tone: 'error' }));
      }}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.m },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  input: { minHeight: 88, paddingHorizontal: Spacing.l, paddingTop: Spacing.m, paddingBottom: Spacing.m, backgroundColor: Colors.surface2, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input, textAlignVertical: 'top' },
  err: { color: Colors.stopText, fontFamily: Fonts.semibold },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryOff: { backgroundColor: Colors.signalDeep },
  primaryText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.onSignal },
  pressed: { transform: [{ scale: Motion.pressScale }], opacity: 0.85 },
});
