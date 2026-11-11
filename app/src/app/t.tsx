/**
 * Landeseite für geteilte Touren (drive.rallycumo.de/t#cumo1:...).
 * Die iPhone Kamera öffnet den QR Code als Link; von hier geht es per Knopf in die App.
 * Der Code steht hinter #, er erreicht den Server also nie.
 */
import { Redirect } from "expo-router";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/text";
import { Colors, Fonts, Radius, Spacing, Type } from "@/constants/theme";
import { PROFILES } from "@/lib/tour";
import { appLink, decodeTour, extractCode } from "@/lib/share-code";
import { isShortCode, resolveShareCode } from "@/lib/share-link";

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
  // Kurzer Link (s:...): Tour Code bei uns abholen, die App bekommt trotzdem den kurzen Code
  const [resolved, setResolved] = useState<{ code: string; full: string | null } | null>(null);
  useEffect(() => {
    if (!isShortCode(code)) return;
    let alive = true;
    resolveShareCode(code)
      .then((full) => alive && setResolved({ code, full }))
      .catch(() => alive && setResolved({ code, full: null }));
    return () => {
      alive = false;
    };
  }, [code]);
  const short = isShortCode(code);
  const full = short ? (resolved?.code === code ? resolved.full : undefined) : code;
  const tour = useMemo(() => (full ? decodeTour(full) : null), [full]);

  if (Platform.OS !== "web") return <Redirect href="/" />;

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <AppText style={styles.brand}>CUMO DRIVE</AppText>
        {tour ? (
          <>
            <View style={{ gap: 6 }}>
              <AppText variant="caption" muted>
                Geteilte Tour
              </AppText>
              <AppText variant="display" style={styles.title}>
                {tour.name}
              </AppText>
              <AppText muted>
                Profil{" "}
                {PROFILES.find((p) => p.id === tour.profile)?.label ??
                  tour.profile}
                , {tour.waypoints ? `${tour.waypoints.length} Punkte` : `${tour.points.length} Stützpunkte`}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="link"
              style={styles.primary}
              onPress={() => {
                window.location.href = appLink(code);
              }}
            >
              <AppText style={styles.primaryText}>In CUMO DRIVE öffnen</AppText>
            </Pressable>
            <AppText variant="caption" muted>
              Öffnet die Route in deiner CUMO DRIVE App. Sie plant die Strecke neu, prüft sie mit dem Etappen Check und legt sie in den Planer. Dort speicherst du sie mit dem Lesezeichen.
            </AppText>
          </>
        ) : short && full === undefined ? (
          <AppText muted>Tour wird geladen</AppText>
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
