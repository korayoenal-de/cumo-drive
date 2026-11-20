/**
 * Nachrichten: Unterhaltungen mit anderen Fahrern und die Chats der Ausfahrten in einer Liste (Koray 18.11.),
 * neueste oben, ungelesene mit Plakette.
 *
 * Filter als Chips (Koray 20.11.2026, Konzept „Ausfahrt im Fokus“): Ausfahrten, Privat, Aktivität. Aktivität sammelt
 * die leisen Dinge: offene Kontaktanfragen, neue Kontakte und Zusagen zu deinen Ausfahrten.
 *
 * Wischen von rechts nach links löscht einen Chat (Koray 20.11.), wie bei WhatsApp nur für mich: er verschwindet aus
 * der Liste, bis eine neue Nachricht kommt; für die anderen bleibt alles erhalten.
 */
import { BackLink } from "@/components/ui/back-link";
import { router, useFocusEffect } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { Pressable } from "@/components/ui/tap";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { Avatar } from "@/components/community/ride-bits";
import { ConfirmSheet } from "@/components/ui/action-sheet";
import { SwipeDelete } from "@/components/ui/swipe-delete";
import { haptic } from "@/lib/haptics";
import { showToast } from "@/lib/toast";
import { Chip, ChipRow } from "@/components/ui/chip";
import { AppText } from "@/components/ui/text";
import { Colors, Fonts, Size, Spacing, Type, Radius } from "@/constants/theme";
import {
  clock,
  listRideChats,
  markRideChatSeen,
  shortDate,
  type RideChat,
} from "@/lib/ausfahrten";
import {
  hiddenChats,
  hideChat,
  listActivity,
  listConversations,
  markRead,
  refreshUnread,
  type Activity,
  type Conversation,
} from "@/lib/drivers";
import { answerContact, refreshContacts } from "@/lib/contacts";
import { enablePush } from "@/lib/push";
import { friendlyError } from "@/lib/friendly-error";
import { t, tr } from "@/i18n";

type Row =
  | { kind: "direct"; at: Date; c: Conversation }
  | { kind: "ride"; at: Date; r: RideChat };

type Filter = "ausfahrten" | "privat" | "aktivitaet";

const keyOf = (r: Row) =>
  r.kind === "ride" ? `ride:${r.r.rideId}` : `dm:${r.c.partner}`;
const unreadOf = (r: Row) => (r.kind === "ride" ? r.r.unread : r.c.unread);
function visible(r: Row, f: Filter): boolean {
  if (f === "privat") return r.kind === "direct";
  if (f === "ausfahrten") return r.kind === "ride";
  return false;
}

const when = (d: Date) =>
  d.toDateString() === new Date().toDateString() ? clock(d) : shortDate(d);

export default function Nachrichten() {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Vorauswahl (Koray 20.11.2026): dort, wo Neues wartet, zuerst Privat; ohne Neues Privat, weil der Weg aus der Community kommt
  const [filter, setFilter] = useState<Filter>("privat");
  const picked = useRef(false);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [busyAsk, setBusyAsk] = useState<string | null>(null);
  const [del, setDel] = useState<Row | null>(null);

  useFocusEffect(
    useCallback(() => {
      const load = () =>
        // Die Chats der Ausfahrten dürfen fehlen (ältere Datenbank, kurzer Fehler), die Unterhaltungen nicht
        Promise.all([
          listConversations(),
          listRideChats().catch(() => [] as RideChat[]),
          hiddenChats(),
        ])
          .then(([direct, rides, hidden]) => {
            const rows: Row[] = [
              ...direct.map((c) => ({
                kind: "direct" as const,
                at: c.lastAt,
                c,
              })),
              ...rides.map((r) => ({ kind: "ride" as const, at: r.lastAt, r })),
            ];
            // gelöschte Chats bleiben weg, bis eine neuere Nachricht kommt
            const shown = rows.filter((r) => {
              const h = hidden.get(keyOf(r));
              return !h || r.at.getTime() > h.getTime();
            });
            setList(shown.sort((x, y) => y.at.getTime() - x.at.getTime()));
            if (!picked.current) {
              picked.current = true;
              const unreadIn = (k: Row["kind"]) => shown.some((r) => r.kind === k && unreadOf(r) > 0);
              if (!unreadIn("direct") && unreadIn("ride")) setFilter("ausfahrten");
            }
            setErr(null);
          })
          // Nachladen im Hintergrund (Netz kurz weg, App im Hintergrund): die geladene Liste bleibt, keine Meldung
          // (Koray 20.11.2026: „Error: fetch failed: Abgebrochen“). Nur ohne jede Liste eine verständliche Meldung.
          .catch((e: unknown) => setList((l) => {
            if (!l) setErr(friendlyError(e));
            return l;
          }));
      void load();
      void listActivity().then(setActivity);
      void refreshUnread();
      // Beim ersten Öffnen der Nachrichten nach der Erlaubnis für Mitteilungen fragen (iOS fragt nur einmal)
      void enablePush(true);
      const t = setInterval(() => void load(), 20000);
      return () => clearInterval(t);
    }, []),
  );

  const remove = (row: Row) => {
    setList((l) => l?.filter((r) => keyOf(r) !== keyOf(row)) ?? l);
    const read =
      row.kind === "ride"
        ? markRideChatSeen(row.r.rideId)
        : markRead(row.c.partner);
    hideChat(keyOf(row))
      .then(() => read)
      .then(() => refreshUnread())
      .then(() => showToast(t("Chat gelöscht")))
      .catch((e: Error) => showToast(e.message, { tone: "error" }));
  };
  const swipe = (row: Row, name: string, child: ReactNode) => (
    <Swipeable
      key={keyOf(row)}
      friction={1.6}
      rightThreshold={36}
      overshootRight={false}
      onSwipeableWillOpen={() => haptic("rastung")}
      renderRightActions={(prog, _tr, m) => (
        <SwipeDelete
          progress={prog}
          radius={Radius.m}
          label={tr("Chat {name} löschen", { name })}
          onPress={() => {
            m.close();
            setDel(row);
          }}
        />
      )}
    >
      {child}
    </Swipeable>
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + Spacing.s,
          paddingBottom: insets.bottom + Spacing.xxxl,
        },
      ]}
    >
      <View style={styles.head}>
        <BackLink label={t("Community")} fallback="/community" />
      </View>
      <AppText variant="display">{t("Nachrichten")}</AppText>
      <ChipRow>
        {(
          [
            ["ausfahrten", t("Ausfahrten")],
            ["privat", t("Privat")],
            ["aktivitaet", t("Aktivität")],
          ] as const
        ).map(([key, label]) => {
          const n =
            key === "aktivitaet"
              ? activity.filter((x) => x.kind === "kontaktanfrage").length
              : (list ?? []).filter((r) => visible(r, key)).reduce((sum, r) => sum + unreadOf(r), 0);
          return (
            <Chip
              key={key}
              label={label}
              badge={n}
              active={filter === key}
              onPress={() => {
                picked.current = true;
                setFilter(key);
              }}
            />
          );
        })}
      </ChipRow>
      {list === null && !err && <ActivityIndicator color={Colors.muted} />}
      {err && <AppText style={styles.error}>{err}</AppText>}
      {filter === "aktivitaet" && (
        <View style={styles.activity}>
          {activity.length === 0 && <AppText muted>{t("Noch keine Aktivität. Hier stehen Kontaktanfragen, neue Kontakte und Zusagen zu deinen Ausfahrten.")}</AppText>}
          {activity.map((x) => (
            <Pressable
              key={`${x.kind}-${x.actor}-${x.ride ?? ""}`}
              accessibilityRole="button"
              disabled={x.kind === "kontaktanfrage"}
              onPress={() =>
                x.kind === "zusage" && x.ride
                  ? router.push({ pathname: "/ausfahrt/[id]", params: { id: x.ride } })
                  : router.push({ pathname: "/nachrichten/[id]", params: { id: x.actor, name: x.name } })
              }
              style={styles.row}
            >
              <Avatar name={x.name} userId={x.actor} />
              <View style={styles.flex}>
                <AppText style={styles.activityText}>
                  {x.kind === "kontaktanfrage"
                    ? tr("{name} möchte dich als Kontakt hinzufügen", { name: x.name })
                    : x.kind === "kontakt"
                      ? tr("{name} ist jetzt dein Kontakt", { name: x.name })
                      : tr("{name} fährt bei {ride} mit", { name: x.name, ride: x.rideName ?? tr("deiner Ausfahrt") })}
                </AppText>
                <AppText style={styles.time}>{when(x.at)}</AppText>
                {x.kind === "kontaktanfrage" && (
                  <View style={styles.askRow}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!!busyAsk}
                      onPress={() => {
                        setBusyAsk(x.actor);
                        answerContact(x.actor, false)
                          .then(() => setActivity((l) => l.filter((y) => !(y.kind === "kontaktanfrage" && y.actor === x.actor))))
                          .catch((e: Error) => showToast(e.message, { tone: "error" }))
                          .finally(() => setBusyAsk(null));
                      }}
                      style={styles.askBtn}
                    >
                      <AppText style={styles.askText}>{t("Ablehnen")}</AppText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!!busyAsk}
                      onPress={() => {
                        setBusyAsk(x.actor);
                        answerContact(x.actor, true)
                          .then(() => {
                            haptic("ziel");
                            void refreshContacts();
                            return listActivity().then(setActivity);
                          })
                          .catch((e: Error) => showToast(e.message, { tone: "error" }))
                          .finally(() => setBusyAsk(null));
                      }}
                      style={styles.askBtn}
                    >
                      <AppText style={styles.askText}>{t("Annehmen")}</AppText>
                    </Pressable>
                  </View>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      )}
      {filter !== "aktivitaet" && list?.length === 0 && (
        <View style={styles.card}>
          <AppText variant="title">{t("Noch keine Nachrichten")}</AppText>
          <AppText muted>
            {t(
              "Unter Community, Drivers findest du andere Mitglieder und kannst ihnen eine Nachricht schreiben.",
            )}
          </AppText>
        </View>
      )}
      {filter !== "aktivitaet" && !!list?.length && !list.some((r) => visible(r, filter)) && (
        <AppText muted>
          {filter === "privat"
            ? t("Noch keine Unterhaltungen mit anderen Fahrern.")
            : t("Keine aktuellen Chats von Ausfahrten.")}
        </AppText>
      )}
      {list
        ?.filter((r) => visible(r, filter))
        .map((row) => {
          if (row.kind === "ride") {
            const r = row.r;
            return swipe(
              row,
              r.name,
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${tr("Ausfahrt")} ${r.name}${r.unread ? `, ${r.unread} ungelesen` : ""}, ${r.lastBody}`}
                onPress={() =>
                  router.push({
                    pathname: "/ausfahrt/chat",
                    params: { id: r.rideId, name: r.name, from: "nachrichten" },
                  })
                }
                style={styles.row}
              >
                {/* Gruppe statt Person: das Symbol der Ausfahrt im Kreis, gleiche Größe wie ein Profilbild */}
                <View style={styles.group}>
                  <SymbolView
                    name="car.2"
                    size={20}
                    weight="semibold"
                    tintColor={Colors.text}
                  />
                </View>
                <View style={styles.flex}>
                  <View style={styles.line}>
                    <AppText
                      style={[styles.name, styles.flex]}
                      numberOfLines={1}
                    >
                      {r.name}
                      {filter === "ausfahrten" && r.startsAt ? (
                        <AppText
                          muted
                          style={styles.rideDay}
                        >{`  ${shortDate(r.startsAt)}`}</AppText>
                      ) : null}
                    </AppText>
                    <AppText
                      style={[styles.time, r.unread ? styles.timeUnread : null]}
                    >
                      {when(r.lastAt)}
                    </AppText>
                  </View>
                  <View style={styles.line}>
                    <AppText
                      muted={!r.unread}
                      style={[
                        styles.flex,
                        styles.preview,
                        r.unread ? styles.unreadText : null,
                      ]}
                      numberOfLines={1}
                    >
                      {r.lastFromMe ? tr("Du") : r.lastName}: {r.lastBody}
                    </AppText>
                    {r.unread > 0 && (
                      <View style={styles.badge}>
                        <AppText style={styles.badgeText}>{r.unread}</AppText>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>,
            );
          }
          const c = row.c;
          return swipe(
            row,
            c.name,
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${c.name}${c.unread ? `, ${c.unread} ungelesen` : ""}, ${c.lastBody}`}
              onPress={() =>
                router.push({
                  pathname: "/nachrichten/[id]",
                  params: { id: c.partner, name: c.name },
                })
              }
              style={styles.row}
            >
              <Avatar name={c.name} userId={c.partner} />
              <View style={styles.flex}>
                <View style={styles.line}>
                  <AppText style={[styles.name, styles.flex]} numberOfLines={1}>
                    {c.name}
                  </AppText>
                  <AppText
                    style={[styles.time, c.unread ? styles.timeUnread : null]}
                  >
                    {when(c.lastAt)}
                  </AppText>
                </View>
                <View style={styles.line}>
                  <AppText
                    muted={!c.unread}
                    style={[
                      styles.flex,
                      styles.preview,
                      c.unread ? styles.unreadText : null,
                    ]}
                    numberOfLines={1}
                  >
                    {c.lastFromMe ? "Du: " : ""}
                    {c.lastBody}
                  </AppText>
                  {c.unread > 0 && (
                    <View style={styles.badge}>
                      <AppText style={styles.badgeText}>{c.unread}</AppText>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>,
          );
        })}
      <ConfirmSheet
        visible={!!del}
        title={t("Chat löschen?")}
        text={t(
          "Der Chat verschwindet aus deiner Liste, bis jemand etwas Neues schreibt. Für die anderen bleibt alles erhalten.",
        )}
        confirmLabel={t("Löschen")}
        onConfirm={() => del && remove(del)}
        onClose={() => setDel(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  activity: { gap: Spacing.m },
  activityText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.text },
  askRow: { flexDirection: "row", gap: Spacing.s, marginTop: Spacing.s },
  askBtn: { height: Size.chip, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: "center", justifyContent: "center" },
  askText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  root: { flex: 1, backgroundColor: Colors.ground },
  content: { paddingHorizontal: Spacing.xl, gap: Spacing.m },
  head: { flexDirection: "row" },
  flex: { flex: 1 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.l,
    padding: Spacing.l,
    gap: Spacing.s,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.m,
    minHeight: 64,
    backgroundColor: Colors.ground,
  },
  group: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  line: { flexDirection: "row", alignItems: "center", gap: Spacing.s },
  name: { fontFamily: Fonts.bold, fontSize: Type.title },
  rideDay: { fontFamily: Fonts.semibold, fontSize: Type.caption },
  // Vorschau wie bei WhatsApp: letzte Nachricht in 15 pt, Zeit rechts, ungelesen orange (Koray 10.11.)
  preview: { fontFamily: Fonts.medium, fontSize: Type.body },
  unreadText: { fontFamily: Fonts.bold, color: Colors.text },
  time: {
    fontFamily: Fonts.semibold,
    fontSize: Type.caption,
    color: Colors.muted,
    fontVariant: ["tabular-nums"],
  },
  timeUnread: { color: Colors.signal },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: Colors.signal,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: Colors.onSignal,
    fontFamily: Fonts.extrabold,
    fontSize: Type.micro,
    lineHeight: 13,
  },
  error: { color: Colors.danger, fontFamily: Fonts.semibold },
});
