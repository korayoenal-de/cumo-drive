/**
 * Feedback geben (Koray 16.11.): auch ohne laufende Fahrt, zum Beispiel zum Planer. Landet im gemeinsamen Eingang der
 * Rückmeldungen, Claude prüft jede Meldung und bereitet eine Lösung vor. Eine Hauptaktion: Senden.
 */
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { SubScreen } from '@/components/settings/settings-ui';
import { Chip, ChipGroup } from '@/components/ui/chip';
import { IconLabel } from '@/components/ui/btn-icon';
import { TextField } from '@/components/ui/text-field';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';
import { FEEDBACK_AREAS, sendFeedback, type FeedbackArea } from '@/lib/feedback';
import { showToast } from '@/lib/toast';
import { t } from '@/i18n';

export default function Feedback() {
  const [area, setArea] = useState<FeedbackArea | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = note.trim().length >= 3 && !busy;
  const scroll = useRef<ScrollViewInstance>(null);
  // Beim Tippen Senden über der Tastatur halten
  const showSend = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 300);

  const send = async () => {
    setBusy(true);
    try {
      await sendFeedback(area ?? 'sonstiges', note);
      showToast(t('Danke! Wir schauen es uns an.'));
      router.back();
    } catch (e) {
      showToast(e instanceof Error ? e.message: t('Senden hat nicht geklappt.'), { tone: 'error' });
      setBusy(false);
    }
  };

  return (
    <SubScreen title={t('Feedback')} scrollRef={scroll}>
      <AppText muted>{t('Was ist dir aufgefallen? Jede Meldung wird geprüft, und du erfährst, wenn es eine Lösung gibt.')}</AppText>
      <View style={styles.block}>
        <AppText style={styles.label}>{t('Worum geht es?')}</AppText>
        <ChipGroup style={styles.chips}>
          {FEEDBACK_AREAS.map((a) => (
            <Chip key={a.id} label={a.label} active={area === a.id} onPress={() => setArea(area === a.id ? null : a.id)} />
          ))}
        </ChipGroup>
      </View>
      <View style={styles.block}>
        <AppText style={styles.label}>{t('Was genau?')}</AppText>
        <TextField
          maxFontSizeMultiplier={1.2}
          value={note}
          onChangeText={setNote}
          onFocus={showSend}
          placeholder={t('Zum Beispiel: Rundtour ab München fährt bei Jugenheim hin und zurück')}
          placeholderTextColor={Colors.muted}
          maxLength={1000}
          multiline
          style={styles.input}
          accessibilityLabel={t('Was dir aufgefallen ist, freier Text')}
        />
      </View>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={() => void send()} style={[styles.primary, !ready && styles.disabled]}>
        {busy ? <ActivityIndicator color={Colors.onSignal} /> : <IconLabel icon={{ sf: 'arrow.up' }} color={Colors.onSignal}>
<AppText style={styles.primaryText}>{t('Senden')}</AppText>
</IconLabel>}
      </Pressable>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.s },
  label: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  input: { minHeight: 104, maxHeight: 200, paddingHorizontal: Spacing.l, paddingVertical: Spacing.m, backgroundColor: Colors.surface, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.body, textAlignVertical: 'top' },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.input },
  disabled: { opacity: 0.4 },
});
