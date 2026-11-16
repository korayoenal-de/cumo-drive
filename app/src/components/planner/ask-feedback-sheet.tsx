/**
 * Nachfrage nach dem Verwerfen (Koray 16.11., Leinwand „Nachfrage nach dem Verwerfen“): ein Tipp auf einen Grund sendet
 * sofort, nur „Etwas anderes“ öffnet ein Textfeld mit Senden als Hauptaktion. Danach kurz Danke, das Blatt geht von
 * selbst. Wegschieben, Tipp daneben oder Ausblenden zählen als weggeschoben (lib/ask-feedback.ts).
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Chip } from '@/components/ui/chip';
import { OptionsSheet } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';
import { ASK_REASONS, askDismissed, sendAsk, type AskRound } from '@/lib/ask-feedback';
import { showToast } from '@/lib/toast';
import { t } from '@/i18n';

export function AskFeedbackSheet({ rounds, onDone }: { rounds: AskRound[] | null; onDone: () => void }) {
  const [reason, setReason] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Danke kurz zeigen, dann geht das Blatt von selbst
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [done, onDone]);

  const reset = () => {
    setReason(null);
    setText('');
    setBusy(false);
    setDone(false);
  };
  const close = () => {
    if (!done && !busy) void askDismissed();
    reset();
    onDone();
  };
  const send = async (id: string, note: string) => {
    if (!rounds) return;
    setBusy(true);
    try {
      await sendAsk(id, note, rounds);
      setDone(true);
    } catch (e) {
      setBusy(false);
      showToast(e instanceof Error ? e.message: t('Senden hat nicht geklappt.'), { tone: 'error' });
    }
  };
  const pick = (id: string) => {
    if (busy) return;
    if (id === 'anderes') setReason(reason === id ? null : id);
    else {
      setReason(id);
      void send(id, '');
    }
  };

  return (
    <OptionsSheet
      visible={!!rounds}
      title={done ? undefined : 'Nichts Passendes dabei?'}
      subtitle={done ? undefined : 'Sag uns kurz, woran es lag. Wir schauen uns deine Runden an.'}
      onClose={close}>
      {done ? (
        <View style={styles.thanks} accessibilityLiveRegion="polite">
          <View style={styles.check}>
            <SymbolView name="checkmark" size={20} weight="bold" tintColor={Colors.good} />
          </View>
          <View style={styles.thanksText}>
            <AppText style={styles.thanksTitle}>{t('Danke, ist angekommen')}</AppText>
            <AppText muted>{t('Wir sagen dir Bescheid, wenn es besser ist.')}</AppText>
          </View>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.chips}>
            {ASK_REASONS.map((r) => (
              <Chip key={r.id} label={r.label} active={reason === r.id} onPress={() => pick(r.id)} onSurface />
            ))}
          </View>
          {reason === 'anderes' ? (
            <>
              <TextInput
                maxFontSizeMultiplier={1.2}
                value={text}
                onChangeText={setText}
                placeholder={t('Was hat dir gefehlt?')}
                placeholderTextColor={Colors.muted}
                maxLength={500}
                multiline
                autoFocus
                style={styles.input}
                accessibilityLabel={t('Was dir gefehlt hat, freier Text')}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy || text.trim().length < 3 }}
                disabled={busy || text.trim().length < 3}
                onPress={() => void send('anderes', text)}
                style={[styles.primary, (busy || text.trim().length < 3) && styles.disabled]}>
                {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>{t('Senden')}</AppText>}
              </Pressable>
            </>
          ) : busy ? (
            <ActivityIndicator color={Colors.muted} />
          ) : (
            <Pressable accessibilityRole="button" onPress={close} style={styles.hide}>
              <AppText style={styles.hideText}>{t('Ausblenden')}</AppText>
            </Pressable>
          )}
        </View>
      )}
    </OptionsSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.l },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  input: { minHeight: 72, maxHeight: 140, paddingHorizontal: Spacing.l, paddingVertical: Spacing.m, backgroundColor: Colors.surface2, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.body, textAlignVertical: 'top' },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.input },
  disabled: { opacity: 0.4 },
  hide: { height: 44, alignItems: 'center', justifyContent: 'center' },
  hideText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  thanks: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingVertical: Spacing.s },
  check: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.goodTint, alignItems: 'center', justifyContent: 'center' },
  thanksText: { flex: 1, gap: 2 },
  thanksTitle: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
});
