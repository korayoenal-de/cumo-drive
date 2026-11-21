/**
 * Tastensystem (Konsistenz Audit, Koray 20.11.2026): fünf Bausteine für die ganze App statt eigener Tasten je Datei.
 *
 * - Button primary: Signal, 56 hoch, eine je Ansicht, nie in Listen. Haptik nach Wirkung (haptic).
 * - Button secondary: gleiche Form, Fläche eine Stufe heller als der Untergrund (onSurface: auf einer Karte).
 * - Button quiet: nur Text, 44 hoch, für Abbrechen, Später, Überspringen.
 * - IconButton: 44 rund, Fläche nach Untergrund (ground, surface, map), immer mit VoiceOver Text.
 * - HeadPill: Symbol und Wort im Kopf eines Tabs oder einer Liste (Anlegen, Teilen), höchstens eine je Kopf.
 *
 * size compact (44 hoch) nur für Tasten in einer Zeile mit Text, etwa Annehmen und Ablehnen in der Aktivität.
 * Die Morph Taste (morph-action.tsx) bleibt die Hauptaktion mit Flug und Morph; sie folgt denselben Maßen.
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { IconLabel, type BtnIcon } from '@/components/ui/btn-icon';
import { Zaehler } from '@/components/ui/plakette';
import { Pressable } from '@/components/ui/tap';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';
import { haptic as feel, type HapticKind } from '@/lib/haptics';

type Variant = 'primary' | 'secondary' | 'quiet';

export function Button({
  label,
  onPress,
  variant = 'primary',
  onSurface,
  size = 'regular',
  icon,
  busy,
  disabled,
  haptic,
  accessibilityHint,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  /** liegt auf einer Karte: Sekundär nimmt die hellere Fläche */
  onSurface?: boolean;
  size?: 'regular' | 'compact';
  icon?: BtnIcon;
  busy?: boolean;
  disabled?: boolean;
  /** Haptik beim Tippen, nur für Aktionen mit Wirkung (losfahren, ziel, warnung) */
  haptic?: HapticKind;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = variant === 'primary' ? Colors.onSignal : Colors.text;
  const bg = variant === 'primary' ? Colors.signal : variant === 'secondary' ? (onSurface ? Colors.surface2 : Colors.surface) : 'transparent';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={() => {
        if (haptic) feel(haptic);
        onPress();
      }}
      style={[styles.btn, size === 'compact' || variant === 'quiet' ? styles.compact : null, { backgroundColor: bg }, disabled && styles.disabled, style]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : icon ? (
        <IconLabel icon={icon} color={fg}>
          <AppText style={[styles.text, { color: fg }]}>{label}</AppText>
        </IconLabel>
      ) : (
        <AppText style={[styles.text, size === 'compact' && styles.textCompact, { color: fg }]}>{label}</AppText>
      )}
    </Pressable>
  );
}

const ICON_BG = { ground: Colors.surface, surface: Colors.surface2, map: Colors.overlay } as const;

export function IconButton({
  icon,
  label,
  onPress,
  on = 'ground',
  badge,
}: {
  icon: SFSymbol;
  /** Text für VoiceOver */
  label: string;
  onPress: () => void;
  /** Untergrund: auf dem Grund, auf einer Karte oder über der Karte */
  on?: keyof typeof ICON_BG;
  badge?: number;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge}` : label} hitSlop={4} onPress={onPress} style={[styles.icon, { backgroundColor: ICON_BG[on] }]}>
      <SymbolView name={icon} size={18} weight="semibold" tintColor={Colors.text} />
      {!!badge && <Zaehler n={badge} style={styles.badge} />}
    </Pressable>
  );
}

export function HeadPill({ icon, label, onPress, accessibilityLabel }: { icon: SFSymbol; label: string; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} hitSlop={4} onPress={onPress} style={styles.pill}>
      <SymbolView name={icon} size={16} weight="semibold" tintColor={Colors.text} />
      <AppText style={styles.pillText}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { height: Size.button, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  compact: { height: Size.chip, paddingHorizontal: Spacing.l },
  disabled: { opacity: 0.4 },
  text: { fontFamily: Fonts.bold, fontSize: Type.button },
  textCompact: { fontSize: Type.body },
  icon: { width: Size.icon, height: Size.icon, borderRadius: Size.icon / 2, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -Spacing.hair, right: -Spacing.hair },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: Size.icon, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, backgroundColor: Colors.surface2 },
  pillText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
});
