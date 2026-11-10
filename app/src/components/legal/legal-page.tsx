/**
 * Textseite für Datenschutz und Nutzungsbedingungen (src/content/legal.ts), im Stil der Landingpage:
 * dunkel, Titel in Archivo Black, Text in Inter, höchstens etwa 70 Zeichen breit. Im Browser mit Kopf
 * und Logo zurück zur Startseite, in der App als normale Seite mit Schließen.
 */
import { router } from 'expo-router';
import Head from 'expo-router/head';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polygon } from 'react-native-svg';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import type { LegalDoc } from '@/content/legal';

const MARK = [
  '12.00,16.20 7.29,22.09 16.71,22.09',
  '8.72,14.62 1.17,14.61 7.05,21.98',
  '7.91,11.07 3.21,5.16 1.11,14.35',
  '10.18,8.22 11.87,0.86 3.37,4.95',
  '13.82,8.22 20.63,4.95 12.13,0.86',
  '16.09,11.07 22.89,14.35 20.79,5.16',
  '15.28,14.62 16.95,21.98 22.83,14.61',
];

export function LegalPage({ doc, description, other }: { doc: LegalDoc; description: string; other: { href: '/agb' | '/datenschutz'; label: string } }) {
  const insets = useSafeAreaInsets();
  const web = Platform.OS === 'web';
  const home = () => (web ? router.navigate('/') : router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View style={styles.root}>
      {/* Head nur im Web: in der App zeigt expo-router sonst einen Hinweis zur Handoff Herkunft (Koray 10.11.) */}
      {web && (
        <Head>
          <title>{`${doc.headTitle ?? doc.title} | Cumo Drive`}</title>
          <meta name="description" content={description} />
        </Head>
      )}
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.l, paddingBottom: insets.bottom + Spacing.xxxl }]}>
        <View style={styles.col}>
          <View style={styles.head}>
            <Pressable accessibilityRole="link" accessibilityLabel={web ? 'Zur Startseite' : 'Schließen'} onPress={home} style={styles.logo}>
              <Svg width={26} height={26} viewBox="0 0 24 24">
                {MARK.map((pts) => (
                  <Polygon key={pts} points={pts} fill={Colors.signal} />
                ))}
              </Svg>
              <AppText style={styles.logoText}>CUMO DRIVE</AppText>
            </Pressable>
            {!web && (
              <Pressable accessibilityRole="button" onPress={home} hitSlop={8}>
                <AppText style={styles.link}>Schließen</AppText>
              </Pressable>
            )}
          </View>

          <AppText accessibilityRole="header" style={styles.title}>
            {doc.title}
          </AppText>
          <AppText style={styles.lead}>{doc.lead}</AppText>

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
  link: { fontFamily: Fonts.bold, fontSize: 16, color: Colors.text, textDecorationLine: 'underline' },
});
