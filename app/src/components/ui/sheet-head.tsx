/**
 * Kopf einer Ebene (Audit 18.11.2026): Anfasser, darunter Titel in Inter Bold 26 und rechts Schließen, überall gleich.
 * Abstände: 8 über dem Anfasser, 8 darunter bis zum Titel, 20 bis zum Inhalt (Layout.titleGap), Seitenrand Layout.page.
 * Archivo Versalien bleiben Seitentiteln, Tournamen, Highlight Namen und Kennzahlen vorbehalten.
 * Eigener Inhalt im Kopf (Suchfeld, Reiter) kommt als children unter den Titel.
 */
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Pressable } from '@/components/ui/tap';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Layout, Radius, Size, Spacing, Type } from '@/constants/theme';
import { t } from '@/i18n';

/** Der Anfasser oben an Blättern und Ebenen, eine Form und eine Farbe */
export function Grabber() {
  return <View style={styles.grabber} />;
}

export function SheetHead({ title, onClose, children }: { title: string; onClose?: () => void; children?: ReactNode }) {
  return (
    <View style={styles.head}>
      <Grabber />
      <View style={styles.titleRow}>
        <AppText style={styles.title} accessibilityRole="header">
          {title}
        </AppText>
        {onClose && (
          <Pressable accessibilityRole="button" accessibilityLabel={t('Schließen')} onPress={onClose} hitSlop={8} style={styles.close}>
            <SymbolView name="xmark" size={16} tintColor={Colors.text} weight="semibold" />
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: Colors.empty },
  head: { paddingHorizontal: Layout.page, paddingTop: Spacing.s, paddingBottom: Layout.titleGap, gap: Spacing.l },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, marginTop: Spacing.s },
  title: { flex: 1, fontFamily: Fonts.bold, fontSize: Type.h2, lineHeight: 30, color: Colors.text },
  close: { width: Size.icon, height: Size.icon, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
