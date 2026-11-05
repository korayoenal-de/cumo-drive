/**
 * Landeseite für geteilte Touren (drive.rallycumo.de/t#cumo1:...).
 * Die iPhone Kamera öffnet den QR Code als Link; von hier geht es per Knopf in die App.
 * Der Code steht hinter #, er erreicht den Server also nie.
 */
import { Redirect } from "expo-router";
import { useMemo, useSyncExternalStore } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/text";
import { Colors, Fonts, Radius, Spacing, Type } from "@/constants/theme";
import { PROFILES } from "@/lib/tour";
import { decodeTour, expoGoLink, extractCode } from "@/lib/share-code";

const subscribe = (cb: () => void) => {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const getHash = () =>
  typeof window === "undefined" ? "" : window.location.hash;

export default function SharedTour() {
  const hash = useSyncExternalStore(subscribe, getHash, () => "");
  const code = useMemo(() => (hash ? extractCode(hash) : ""), [hash]);
  const tour = useMemo(() => (code ? decodeTour(code) : null), [code]);

  if (Platform.OS !== "web") return <Redirect href="/" />;

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <AppText style={styles.brand}>CUMO DRIVE</AppText>
        {tour ? (
          <>
            <View style={{ gap: 6 }}>
              <AppText variant="caption" muted>
                Tour vom Planer
              </AppText>
              <AppText variant="display" style={styles.title}>
                {tour.name}
              </AppText>
              <AppText muted>
                Profil{" "}
                {PROFILES.find((p) => p.id === tour.profile)?.label ??
                  tour.profile}
                , {tour.points.length} Stützpunkte
              </AppText>
            </View>
            <Pressable
              accessibilityRole="link"
              style={styles.primary}
              onPress={() => {
                window.location.href = expoGoLink(code);
              }}
            >
              <AppText style={styles.primaryText}>In CUMO DRIVE öffnen</AppText>
            </Pressable>
            <AppText variant="caption" muted>
              Öffnet die App in Expo Go. Sie plant die Strecke neu, prüft sie
              mit dem Etappen Check und zeigt sie auf der Karte. Klappt das
              nicht, in der App unter Entdecken „Tour vom Planer holen“ wählen
              und den Code am Rechner scannen.
            </AppText>
          </>
        ) : (
          <>
            <AppText variant="title">Kein gültiger Tour Code.</AppText>
            <AppText muted>
              Im Web Planer bei einer Tour auf „An die App senden“ klicken und
              den neuen QR Code scannen.
            </AppText>
          </>
        )}
        <Pressable
          accessibilityRole="link"
          onPress={() => Linking.openURL("/planer")}
        >
          <AppText style={styles.link}>Zum Web Planer</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: "100%",
    backgroundColor: Colors.ground,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.l,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    gap: Spacing.xl,
    padding: Spacing.xl,
    borderRadius: Radius.l,
    backgroundColor: Colors.surface,
  },
  brand: { fontFamily: Fonts.display, fontSize: Type.body, letterSpacing: 2 },
  title: { fontSize: Type.display, lineHeight: 38 },
  primary: {
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.signal,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.title },
  link: {
    color: Colors.text,
    fontFamily: Fonts.semibold,
    textDecorationLine: "underline",
  },
});
