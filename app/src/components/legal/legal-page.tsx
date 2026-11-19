/**
 * Textseite für Datenschutz und Nutzungsbedingungen (src/content/legal.ts), im Stil der Landingpage:
 * dunkel, Titel in Archivo Black, Text in Inter, höchstens etwa 70 Zeichen breit. Im Browser mit Kopf
 * und Logo zurück zur Startseite, in der App als normale Seite mit Schließen.
 */
import { router } from 'expo-router';
import { SeoHead } from '@/components/ui/seo-head';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/ui/tap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import type { LegalDoc } from '@/content/legal';
import { t, tr } from '@/i18n';

// Logo S3 (acht Segmente um den achtzackigen Stern), dieselben Pfade wie im App Icon. Bis 18.11. stand hier noch
// das alte Zeichen mit sieben Dreiecken.
const MARK = [
  'M8.97,16.80 L3.94,20.06 A11.4,11.4 0 0 0 12.00,23.40 L10.75,17.53 Q10.39,15.88 8.97,16.80 Z',
  'M6.47,13.25 L0.60,12.00 A11.4,11.4 0 0 0 3.94,20.06 L7.20,15.03 Q8.12,13.61 6.47,13.25 Z',
  'M7.20,8.97 L3.94,3.94 A11.4,11.4 0 0 0 0.60,12.00 L6.47,10.75 Q8.12,10.39 7.20,8.97 Z',
  'M10.75,6.47 L12.00,0.60 A11.4,11.4 0 0 0 3.94,3.94 L8.97,7.20 Q10.39,8.12 10.75,6.47 Z',
  'M15.03,7.20 L20.06,3.94 A11.4,11.4 0 0 0 12.00,0.60 L13.25,6.47 Q13.61,8.12 15.03,7.20 Z',
  'M17.53,10.75 L23.40,12.00 A11.4,11.4 0 0 0 20.06,3.94 L16.80,8.97 Q15.88,10.39 17.53,10.75 Z',
  'M16.80,15.03 L20.06,20.06 A11.4,11.4 0 0 0 23.40,12.00 L17.53,13.25 Q15.88,13.61 16.80,15.03 Z',
  'M13.25,17.53 L12.00,23.40 A11.4,11.4 0 0 0 20.06,20.06 L15.03,16.80 Q13.61,15.88 13.25,17.53 Z',
];

export function LegalPage({
  doc,
  description,
  other,
  action,
}: {
  doc: LegalDoc;
  description: string;
  other: { href: '/agb' | '/datenschutz'; label: string };
  /** Eine Hauptaktion unter dem Einleitungstext, etwa „Zum Web Planer" nach der Bestätigung der Adresse */
  action?: { label: string; onPress: () => void };
}) {
  const insets = useSafeAreaInsets();
  const web = Platform.OS === 'web';
  const home = () => (web ? router.navigate('/') : router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View style={styles.root}>
      {/* Head nur im Web: in der App zeigt expo-router sonst einen Hinweis zur Handoff Herkunft (Koray 10.11.) */}
      {web && (
        <SeoHead>
          <title>{tr('{v0} | Cumo Drive', { v0: doc.headTitle ?? doc.title })}</title>
          <meta name="description" content={description} />
        </SeoHead>
      )}
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.l, paddingBottom: insets.bottom + Spacing.xxxl }]}>
        <View style={styles.col}>
          <View style={styles.head}>
            <Pressable accessibilityRole="link" accessibilityLabel={web ? tr('Zur Startseite') : tr('Schließen')} onPress={home} style={styles.logo}>
              <Svg width={26} height={26} viewBox="0 0 24 24">
                {MARK.map((d) => (
                  <Path key={d} d={d} fill={Colors.signal} />
                ))}
              </Svg>
              <AppText style={styles.logoText}>CUMO DRIVE</AppText>
            </Pressable>
            {!web && (
              <Pressable accessibilityRole="button" accessibilityLabel={t('Schließen')} onPress={home} style={({ pressed }) => [styles.quiet, pressed && styles.pressed]}>
                <AppText style={styles.quietText}>{t('Schließen')}</AppText>
              </Pressable>
            )}
          </View>

          <AppText accessibilityRole="header" style={styles.title}>
            {doc.title}
          </AppText>
          <AppText style={styles.lead}>{doc.lead}</AppText>
          {action && (
            <Pressable accessibilityRole="button" onPress={action.onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
              <AppText style={styles.actionText}>{action.label}</AppText>
            </Pressable>
          )}

          {doc.blocks.map((b) => (
            <View key={b.h} style={styles.block}>
              <AppText accessibilityRole="header" style={styles.h}>
                {b.h}
              </AppText>
              {b.p?.map((t) => (
                <AppText key={t} style={styles.p} selectable>
                  {t}
                </AppText>
              ))}
              {b.list && (
                <View style={styles.list}>
                  {b.list.map((t) => (
                    <View key={t} style={styles.item}>
                      <View style={styles.dot} />
                      <AppText style={[styles.p, styles.flex]} selectable>
                        {t}
                      </AppText>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}

          <View style={styles.foot}>
            <AppText style={styles.stand}>{doc.stand}</AppText>
            <Pressable accessibilityRole="link" onPress={() => router.navigate(other.href)}>
              <AppText style={styles.link}>{other.label}</AppText>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ground },
  scroll: { paddingHorizontal: Spacing.xl },
  col: { width: '100%', maxWidth: 680, alignSelf: 'center', gap: Spacing.l },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: Spacing.xl },
  logo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, minHeight: 44 },
  logoText: { fontFamily: Fonts.display, fontSize: 18, color: Colors.text, textTransform: 'uppercase' },
  title: { fontFamily: Fonts.display, fontSize: 40, lineHeight: 42, color: Colors.text, textTransform: 'uppercase' },
  lead: { fontFamily: Fonts.regular, fontSize: 18, lineHeight: 28, color: Colors.muted },
  block: { gap: Spacing.s, paddingTop: Spacing.l },
  h: { fontFamily: Fonts.bold, fontSize: 20, lineHeight: 26, color: Colors.text },
  p: { fontFamily: Fonts.regular, fontSize: 16, lineHeight: 25, color: Colors.muted },
  list: { gap: Spacing.s },
  item: { flexDirection: 'row', gap: Spacing.m, alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.signal, marginTop: 10 },
  flex: { flex: 1, minWidth: 0 },
  foot: { gap: Spacing.m, paddingTop: Spacing.xxl },
  stand: { fontFamily: Fonts.semibold, fontSize: 14, color: Colors.muted },
  /** Leise Taste wie die Zurück Pille: Fläche surface, rund, 44 hoch (Koray 10.11.) */
  action: { alignSelf: 'flex-start', height: Size.button, paddingHorizontal: Spacing.xxl, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.l },
  actionText: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.onSignal },
  quiet: { height: Size.chip, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  quietText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  pressed: { backgroundColor: Colors.surface2, transform: [{ scale: Motion.pressScale }] },
  link: { fontFamily: Fonts.bold, fontSize: 16, color: Colors.text, textDecorationLine: 'underline' },
});
