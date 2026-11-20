/**
 * „Wann bist du da?“ (Koray 20.11.2026, Rückmeldung von Timo): dasselbe Blatt auf der Ausfahrt (Hinweis oben) und im
 * Chat (die Frage antippen). Teilen gibt es nur mit unserer Navigation (Koray: wir gehen davon aus, dass unsere App
 * genutzt wird). Dazu Schnellantworten, die in den Chat gehen, damit die Lead die Antwort sofort sieht.
 */
import { ActionSheet, type SheetItem } from "@/components/ui/action-sheet";
import { navigateToMeeting } from "@/components/group/meeting-route";
import { clock, sendNachricht } from "@/lib/ausfahrten";
import { startSharing } from "@/lib/ride-day";
import { showToast } from "@/lib/toast";
import type { LatLon } from "@/lib/tour";
import { t, tr } from "@/i18n";

export function WhenSheet({
  visible,
  rideId,
  meetAt,
  meetingName,
  startsAt,
  onClose,
  onChat,
  onSent,
}: {
  visible: boolean;
  rideId: string;
  meetAt: LatLon | null;
  meetingName: string;
  startsAt: Date;
  onClose: () => void;
  /** nur auf der Ausfahrt: den Chat öffnen */
  onChat?: () => void;
  /** nach einer Antwort im Chat, etwa zum Nachladen */
  onSent?: () => void;
}) {
  const fail = (e: unknown) =>
    showToast(
      e instanceof Error && e.message.length < 120
        ? e.message
        : tr("Das hat nicht geklappt. Bitte nochmal versuchen."),
      { tone: "error" },
    );
  const say = (body: string, toast?: string) =>
    sendNachricht(rideId, body)
      .then(() => {
        onSent?.();
        showToast(toast ?? t("Antwort steht im Chat"));
      })
      .catch(fail);

  const items: SheetItem[] = [];
  if (meetAt) {
    items.push({
      key: "teilen",
      icon: "location.fill",
      primary: true,
      label: t("Teilen und hinfahren"),
      hint: t("Die Gruppe sieht, wann du ankommst"),
      onPress: () => {
        startSharing(rideId, meetAt);
        void say(
          tr("Bin unterwegs, mein Standort ist geteilt."),
          t("Standort geteilt"),
        );
        navigateToMeeting(meetAt, meetingName, "schnell").catch(fail);
      },
    });
  }
  items.push(
    {
      key: "10",
      icon: "clock",
      label: t("In 10 min da"),
      onPress: () => void say(tr("Bin in 10 min da.")),
    },
    {
      key: "30",
      icon: "clock",
      label: t("In 30 min da"),
      onPress: () => void say(tr("Bin in 30 min da.")),
    },
    {
      key: "da",
      icon: "checkmark.circle",
      label: t("Bin schon da"),
      onPress: () => void say(tr("Bin schon da.")),
    },
    {
      key: "ohne",
      icon: "figure.wave",
      label: t("Fahrt ohne mich los"),
      hint: t("Schickt eine Nachricht an die Gruppe"),
      onPress: () =>
        void say(tr("Fahrt ohne mich los, ich komme nicht rechtzeitig.")),
    },
  );
  if (onChat)
    items.push({
      key: "chat",
      icon: "bubble.left",
      label: t("Nachricht schreiben"),
      onPress: onChat,
    });

  return (
    <ActionSheet
      visible={visible}
      scroll
      title={t("Wann bist du da?")}
      subtitle={tr("{meetingName}, Abfahrt {v1}", {
        meetingName,
        v1: clock(startsAt),
      })}
      items={items}
      onClose={onClose}
    />
  );
}
