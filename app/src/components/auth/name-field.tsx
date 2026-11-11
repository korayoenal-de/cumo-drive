/**
 * Eingabe für den Namen, unter dem einen andere finden und einladen, mit Live Prüfung,
 * ob der Name frei ist (kurz nach dem Tippen, nicht bei jedem Buchstaben).
 */
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type, Size } from '@/constants/theme';
import { cleanName, NAME_MAX, nameAvailable, nameProblem } from '@/lib/profile';

export type NameCheck = { state: 'leer' | 'ungueltig' | 'pruefe' | 'frei' | 'vergeben' | 'fehler' | 'gleich'; message: string | null };

/** Prüft den Namen; `current` ist der bisherige eigene Name (gilt als unverändert). */
export function useNameCheck(raw: string, current?: string | null): NameCheck {
  const name = cleanName(raw);
  const problem = name ? nameProblem(name) : null;
  const same = !!current && name === current;
  const [result, setResult] = useState<{ name: string; available: boolean | null } | null>(null);

  useEffect(() => {
    if (!name || problem || same) return;
    let alive = true;
    const t = setTimeout(() => {
      nameAvailable(name)
        .then((available) => alive && setResult({ name, available }))
        .catch(() => alive && setResult({ name, available: null }));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [name, problem, same]);

  if (!name) return { state: 'leer', message: null };
  if (problem) return { state: 'ungueltig', message: problem };
  if (same) return { state: 'gleich', message: null };
  if (result?.name !== name) return { state: 'pruefe', message: 'Prüfe, ob der Name frei ist …' };
  if (result.available === null) return { state: 'fehler', message: 'Konnte nicht prüfen, ob der Name frei ist. Netz prüfen.' };
  return result.available ? { state: 'frei', message: 'Der Name ist frei.' } : { state: 'vergeben', message: 'Diesen Namen hat schon jemand.' };
}

export function NameField({ value, onChange, check, onSurface }: { value: string; onChange: (v: string) => void; check: NameCheck; onSurface?: boolean }) {
  const tone = check.state === 'frei' ? styles.good : check.state === 'vergeben' || check.state === 'ungueltig' || check.state === 'fehler' ? styles.bad : styles.muted;
  return (
    <View style={styles.gap}>
      <TextInput maxFontSizeMultiplier={1.2}
        value={value}
        onChangeText={onChange}
        placeholder="Name, so sehen dich die anderen"
        placeholderTextColor={Colors.muted}
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        maxLength={NAME_MAX + 5}
        style={[styles.input, onSurface && styles.inputOnSurface]}
        accessibilityLabel="Name"
        accessibilityHint="Andere finden dich unter diesem Namen und laden dich zu Gruppenfahrten ein. Mindestens 3 Zeichen."
      />
      {check.message && check.state !== 'leer' ? (
        <AppText variant="caption" style={tone} accessibilityLiveRegion="polite">
          {check.message}
        </AppText>
      ) : (
        <AppText variant="caption" muted>
          Andere finden dich unter diesem Namen. Mindestens 3 Zeichen, einmalig.
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.xs },
  input: { height: Size.input, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  inputOnSurface: { backgroundColor: Colors.surface2, height: 50 },
  good: { color: Colors.good },
  bad: { color: Colors.signal },
  muted: { color: Colors.muted },
});
