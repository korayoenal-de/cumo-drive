/**
 * Kleine Bausteine des Planers: Abschnitt, Tasten, Schalter, Fortschritt, Fehler, Stopps, Kennzahlen,
 * Warnungen, Anfasser zum Verschieben und Gruppenfahrt Hinweis.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, PanResponder, Pressable, Switch, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { SOFT_LAYOUT } from '@/components/ui/action-bar';
import Svg, { Path } from 'react-native-svg';

import { PHASES, type PlanError, type PlanPhase } from '@/components/planner/create-tour';
import { CAT_ICON, type Cat } from '@/components/planner/place-search';
import { Chip } from '@/components/ui/chip';
import { FunGauge } from '@/components/ui/fun-gauge';
import { AppText } from '@/components/ui/text';
import { TOUR_FUN_NAMES, type TourFun } from '@/lib/fun-score';
import { Colors, Motion } from '@/constants/theme';
import { formatKm, trimDecimals, type Warning } from '@/lib/tour';
import { selectVehicle, useVehicles, vehicleName } from '@/lib/vehicle';

import { bigDuration, type Mode, type PointKind } from './planner-shared';
import { styles } from './planner-styles';


/** Fahrzeug für diese Tour (optional): die gefahrenen km landen bei diesem Auto. */
export function VehiclePick() {
  const { list, current } = useVehicles();
  return (
    <View style={styles.card}>
      <AppText variant="label">Fahrzeug</AppText>
      {list.length === 0 ? (
        <>
          <AppText variant="caption" muted>
            Noch kein Fahrzeug in der Garage. Leg es unter Einstellungen an, dann landen Kilometer und Touren beim richtigen Auto.
          </AppText>
          <SecondaryButton label="Zur Garage" onSurface onPress={() => router.navigate('/einstellungen')} />
        </>
      ) : (
        <View style={styles.wrap}>
          {list.map((v) => (
            <Chip key={v.id} label={vehicleName(v) || 'Fahrzeug'} active={current?.id === v.id} onSurface onPress={() => void selectVehicle(v.id)} />
          ))}
        </View>
      )}
    </View>
  );
}

/** Standort Pfeil wie in Apple Karten */
export function LocationIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M21 3 L3 10.6 L11.2 12.8 L13.4 21 Z" fill={Colors.signal} stroke={Colors.signal} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}

export function SmallButton({ label, onPress, strong }: { label: string; onPress: () => void; strong?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.small, strong && styles.smallStrong, pressed && styles.pressed]}>
      <AppText style={[styles.smallText, strong && styles.onSignal]}>{label}</AppText>
    </Pressable>
  );
}

/** Kleines Zeichen vor einem Punkt: Ring für den Start, Nummer für Zwischenziele, Fahne für das Ziel. */
export function PointSymbol({ kind, label }: { kind: PointKind; label: string }) {
  if (kind === 'start') {
    return (
      <View style={styles.symbol}>
        <View style={styles.startRing}>
          <View style={styles.startCore} />
        </View>
      </View>
    );
  }
  if (kind === 'ziel') {
    return (
      <View style={styles.symbol}>
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.signal} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M5 21V4" />
          <Path d="M5 4h11l-2 4l2 4H5" fill={Colors.signal} />
        </Svg>
      </View>
    );
  }
  return (
    <View style={styles.symbol}>
      <View style={styles.viaBadge}>
        <AppText style={styles.viaBadgeText}>{label}</AppText>
      </View>
    </View>
  );
}

/** Kompakte Taste in Pillenform mit 44 pt Höhe; active hebt sie in Signalfarbe hervor. */
export function Pill({ label, onPress, active }: { label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={active !== undefined ? { selected: active } : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, active && styles.pillOn, pressed && styles.pressed]}>
      <AppText style={[styles.pillText, active && styles.pillTextOn]}>{label}</AppText>
    </Pressable>
  );
}

/* Bausteine */

export function Section({ label, action, children }: { label: string; action?: { label: string; onPress: () => void }; children: ReactNode }) {
  return (
    <View style={styles.gapM}>
      <View style={styles.sectionHead}>
        <AppText variant="label">{label}</AppText>
        {action && (
          <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={10}>
            <AppText style={styles.sectionAction}>{action.label}</AppText>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

/**
 * Aufklappbarer Abschnitt (Koray 7.11.: Vermeiden und Unterwegs einplanen sparen so Platz).
 * Zu zeigt die Kopfzeile, was eingestellt ist; der Pfeil dreht sich beim Aufklappen.
 */
export function Accordion({ label, summary, defaultOpen = false, children }: { label: string; summary?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const turn = useSharedValue(defaultOpen ? 1 : 0);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * 180}deg` }] }));
  const toggle = () => {
    turn.set(withSpring(open ? 0 : 1, Motion.snap));
    setOpen(!open);
  };
  return (
    <Animated.View layout={SOFT_LAYOUT} style={styles.gapM}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={summary ? `${label}, ${summary}` : label}
        onPress={toggle}
        style={styles.accHead}>
        <View style={styles.accText}>
          <AppText variant="label">{label}</AppText>
          {/* Kurzfassung unter dem Titel, nicht rechtsbündig (Koray 7.11.) */}
          {!!summary && !open && (
            <AppText variant="caption" muted numberOfLines={1}>
              {summary}
            </AppText>
          )}
        </View>
        <Animated.View style={[styles.accChevron, chevron]}>
          <SymbolView name="chevron.down" size={15} weight="semibold" tintColor={Colors.muted} />
        </Animated.View>
      </Pressable>
      {open && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
          {children}
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** Kurzfassung der Vermeiden Schalter für die zugeklappte Kopfzeile */
export function avoidSummary(a: { closures: boolean; ferries: boolean; tolls: boolean; rough: boolean }): string {
  const on = [a.closures && 'Sperrungen', a.ferries && 'Fähren', a.tolls && 'Maut', a.rough && 'rauer Belag'].filter(Boolean) as string[];
  return on.length ? on.join(', ') : 'nichts';
}

/** Tabs als große Schrift im Stil von Trade Republic: aktiv in text, inaktiv in faint, ohne Fläche. */
export function TypoTabs<T extends string>({
  value, options, onChange,
}: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.typoTabs} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            onPress={() => onChange(o.id)}>
            <AppText style={[styles.typoTab, active && styles.typoTabOn]}>{o.label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
      <AppText style={styles.primaryText}>{label}</AppText>
    </Pressable>
  );
}

/** onSurface: liegt in einer Surface Karte, dann mit hellerer Füllung. */
export function SecondaryButton({ label, onPress, onSurface }: { label: string; onPress: () => void; onSurface?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.secondary, onSurface && styles.secondaryOnSurface, pressed && styles.pressed]}>
      <AppText style={styles.secondaryText}>{label}</AppText>
    </Pressable>
  );
}

export function StepButton({ kind, disabled, onPress }: { kind: 'plus' | 'minus'; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={kind === 'plus' ? 'Länger' : 'Kürzer'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.stepBtn, disabled && styles.disabled]}>
      <View style={styles.barH} />
      {kind === 'plus' && <View style={styles.barV} />}
    </Pressable>
  );
}

export function Radio({ on }: { on: boolean }) {
  return <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>;
}

export function Toggle({ label, note, value, onChange }: { label: string; note?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <AppText variant="title">{label}</AppText>
        {note && <AppText variant="caption" muted>{note}</AppText>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.line, true: Colors.signal }}
        thumbColor={Colors.text}
        ios_backgroundColor={Colors.line}
        accessibilityLabel={`${label} meiden`}
      />
    </View>
  );
}

export function MicIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={Colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1 -6 0V6a3 3 0 0 1 3 -3z" />
      <Path d="M19 11a7 7 0 0 1 -14 0" />
      <Path d="M12 18v3" />
    </Svg>
  );
}

export function Progress({ phase, done, onCancel }: { phase: PlanPhase; done: PlanPhase[]; onCancel: () => void }) {
  return (
    <View style={styles.gapL}>
      <View style={styles.card}>
        {PHASES.map((p) => {
          const isDone = done.includes(p.id);
          const isNow = p.id === phase;
          // Umfahren taucht nur auf, wenn der Check gesperrte Stellen gefunden hat
          if (p.id === 'fix' && !isNow && !isDone) return null;
          return (
            <View key={p.id} style={styles.phaseRow}>
              <View style={styles.phaseIcon}>
                {isNow ? <ActivityIndicator color={Colors.signal} /> : <View style={[styles.phaseDot, isDone && styles.phaseDotDone]} />}
              </View>
              <AppText style={isNow ? undefined : isDone ? styles.mutedText : styles.dimText}>{p.label}</AppText>
            </View>
          );
        })}
      </View>
      <AppText variant="caption" muted>
        Wir prüfen jede Straße auf Sperrungen, Feldwege und rauen Belag. Das dauert meist unter einer Minute.
      </AppText>
      <SecondaryButton label="Abbrechen" onPress={onCancel} />
    </View>
  );
}

export function ErrorCard({
  error, mode, onRetry, onBack, onUsePlace,
}: {
  error: PlanError; mode: Mode; onRetry: () => void; onBack: () => void; onUsePlace: () => void;
}) {
  const help: Record<PlanError['kind'], string> = {
    permission: mode === 'beschreiben'
      ? 'Gib den Standort in den Einstellungen frei oder schreib den Start dazu, zum Beispiel "ab Bensheim".'
      : 'Gib den Standort in den Einstellungen frei oder such dir unter Start einen Ort aus.',
    services: 'Schalte die Ortung in den Einstellungen ein oder wähle einen Startort von Hand.',
    position: 'Geh kurz ins Freie und versuch es nochmal, oder wähle einen Startort von Hand.',
    notfound: 'Prüf die Schreibweise oder nimm einen größeren Ort in der Nähe.',
    network: 'Prüf deine Internetverbindung. Der Dienst ist manchmal kurz überlastet, ein zweiter Versuch hilft oft.',
    routing: 'Probier eine andere Länge, Richtung oder würfle neu.',
    aborted: '',
  };
  const needsPlace = error.kind === 'permission' || error.kind === 'services' || error.kind === 'position';
  return (
    <View style={styles.gapL}>
      <View style={[styles.card, styles.errorCard]}>
        <AppText variant="label" style={styles.signalText}>Das hat nicht geklappt</AppText>
        <AppText variant="title">{error.message}</AppText>
        <AppText variant="caption" muted>{help[error.kind]}</AppText>
      </View>
      {(error.kind === 'permission' || error.kind === 'services') && (
        <PrimaryButton label="Einstellungen öffnen" onPress={() => void Linking.openSettings()} />
      )}
      {(error.kind === 'network' || error.kind === 'routing' || error.kind === 'position') && (
        <PrimaryButton label={error.kind === 'routing' ? 'Neu würfeln' : 'Nochmal versuchen'} onPress={onRetry} />
      )}
      {needsPlace && <SecondaryButton label="Startort von Hand wählen" onPress={onUsePlace} />}
      <SecondaryButton label="Tour verwerfen" onPress={onBack} />
    </View>
  );
}

/** Stopps an der Strecke (OpenStreetMap): Super Plus, Aussicht mit Parkplatz, Mittag, Kaffee, mit Einplanen. */
export type PlannedStop = { key: string; name: string; detail: string; cat: Exclude<Cat, 'alle'> };

const STOP_CHIPS: { id: Exclude<Cat, 'alle'>; label: string }[] = [
  { id: 'tank', label: 'Tanken' },
  { id: 'mittag', label: 'Essen' },
  { id: 'aussicht', label: 'Aussicht' },
  // gleiche Namen wie die Reiter der Ortssuche (CATS in place-search.tsx), Koray 10.11.
  { id: 'pass', label: 'Highlights/Pässe' },
];

/**
 * Unterwegs einplanen (6.11.): Chips als Einstieg in die Ebene der Ortssuche, dort nach Umweg sortiert.
 * Eingeplante Stopps stehen darüber als Zeile mit X.
 */
export function StopsPlanner({ planned = [], busy, onOpen, onRemove }: { planned?: PlannedStop[]; busy?: boolean; onOpen: (cat: Exclude<Cat, 'alle'>) => void; onRemove?: (key: string) => void }) {
  return (
    <Accordion
      label="Unterwegs einplanen"
      summary={planned.length ? (planned.length === 1 ? '1 Stopp' : `${planned.length} Stopps`) : 'Tanken, Essen, Aussicht'}
      defaultOpen={planned.length > 0}>
      {planned.length > 0 && (
        <View style={styles.card}>
          {planned.map((st) => (
            <View key={st.key} style={styles.stopRow}>
              <View style={styles.stopIcon}>
                <SymbolView name={CAT_ICON[st.cat]} size={16} tintColor={Colors.signal} />
              </View>
              <View style={styles.flex}>
                <AppText variant="title" numberOfLines={1}>{st.name}</AppText>
                <AppText variant="caption" muted numberOfLines={1}>{st.detail}</AppText>
              </View>
              {onRemove && (
                <Pressable accessibilityRole="button" accessibilityLabel={`${st.name} entfernen`} onPress={() => !busy && onRemove(st.key)} hitSlop={6} style={styles.stopRemove}>
                  <SymbolView name="xmark" size={13} weight="bold" tintColor={Colors.muted} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}
      <View style={styles.wrap}>
        {STOP_CHIPS.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityLabel={`${c.label} unterwegs einplanen`}
            onPress={() => onOpen(c.id)}
            style={({ pressed }) => [styles.stopChip, pressed && styles.pressedSoft]}>
            <SymbolView name={CAT_ICON[c.id]} size={15} tintColor={Colors.signal} />
            <AppText style={styles.stopChipText}>{c.label}</AppText>
          </Pressable>
        ))}
      </View>
      {busy ? <ActivityIndicator color={Colors.muted} /> : planned.length === 0 && <AppText variant="caption" muted>Sortiert nach Umweg, ein Tipp plant den Stopp an der richtigen Stelle ein.</AppText>}
    </Accordion>
  );
}

/**
 * Kennzahlen der Tour. Alle großen Werte haben dieselbe Größe, nichts wird automatisch verkleinert.
 * Statt der Kurvenzahl steht dort der Fahrspaß mit Logo (Koray 7.11.); ein Tipp darauf erklärt den Wert.
 */
export function Stats({ km, minutes, curves, fun, onFun, delta }: { km: number; minutes: number; curves: number; fun?: TourFun | null; onFun?: () => void; delta?: number | null }) {
  const items = [
    { id: 'km', value: `${formatKm(km, 0)} km`, label: 'Strecke' },
    { id: 'zeit', value: bigDuration(minutes), label: 'Fahrzeit' },
  ];
  return (
    <View style={styles.stats}>
      {items.map((x) => (
        <View key={x.id} style={styles.flex}>
          <AppText style={styles.statLabel}>{x.label}</AppText>
          <AppText style={styles.statBig} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{x.value}</AppText>
        </View>
      ))}
      {fun ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Fahrspaß ${fun.score} von 100, ${TOUR_FUN_NAMES[fun.level]}${delta != null ? `, ${delta >= 0 ? 'besser' : 'schlechter'} als die vorige Runde um ${Math.abs(delta)}` : ''}`}
          accessibilityHint="Zeigt, wie der Wert entsteht"
          onPress={onFun}
          style={({ pressed }) => [styles.flex, pressed && styles.pressedDim]}>
          <View style={styles.funLabelRow}>
            <AppText style={styles.statLabel}>Fahrspaß</AppText>
            {delta != null && (
              <AppText style={[styles.funDelta, { color: delta >= 0 ? Colors.good : Colors.muted }]}>{delta >= 0 ? `+${delta}` : `−${Math.abs(delta)}`}</AppText>
            )}
          </View>
          <View style={styles.funValueRow}>
            <FunGauge level={fun.level} size={22} />
            <AppText style={styles.statBig} numberOfLines={1}>{fun.score}</AppText>
            {/* zeigt, dass der Wert antippbar ist (Koray 7.11.) */}
            <SymbolView name="info.circle" size={16} weight="semibold" tintColor={Colors.muted} />
          </View>
        </Pressable>
      ) : (
        <View style={styles.flex}>
          <AppText style={styles.statLabel}>Kurven</AppText>
          <AppText style={styles.statBig} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{String(curves)}</AppText>
        </View>
      )}
    </View>
  );
}

export const TRUST_CLEAN = 'Für Sportwagen geprüft, keine Engstellen oder Sperrungen.';
export const TRUST_WITH_WARNINGS = 'Für Sportwagen geprüft. Diese Stellen solltest du kennen.';

/** Eine kurze Zeile, dass die Strecke geprüft ist, statt der internen Check Darstellung. */
export function TrustLine({ text = TRUST_CLEAN }: { text?: string }) {
  return (
    <View style={styles.trust}>
      <View style={styles.trustDot} />
      <AppText variant="caption" muted style={styles.flex}>{text}</AppText>
    </View>
  );
}

/** Grund aus dem Check in Alltagssprache, passend hinter "Engstelle bei km …". */
export function reasonText(raw: string): string {
  // ältere gespeicherte Touren: lange Kommazahlen aus der Karte auf höchstens zwei Stellen kürzen
  const r = trimDecimals(raw);
  const narrow = /^Engstelle (.+) m$/.exec(r);
  if (narrow) return `${narrow[1]} m breit`;
  const slim = /^schmal, (.+) m, (.+)$/.exec(r);
  if (slim) return `${slim[1]} m breit, ${slim[2]}`;
  return r;
}

/** Warnung als eigenständiger Satz: Art, Kilometer, Straße und Grund. */
export function warningText(w: Warning): string {
  const narrow = w.gruende.some((r) => r.startsWith('Engstelle') || r.startsWith('schmal') || /m breit$/.test(r));
  const kind = w.klasse === 'raus' ? 'Gesperrt' : narrow ? 'Engstelle' : 'Achtung';
  const parts = [`${kind} bei km ${Math.round(w.start_km)}`];
  if (w.name) parts.push(w.name);
  parts.push(...w.gruende.map(reasonText));
  return parts.join(', ');
}

/** Warnungen der Strecke: Punkt in Warn oder Signalfarbe, daneben ein Satz, der für sich steht. */
export function Warnings({ warnings, checked }: { warnings: Warning[]; checked: boolean }) {
  return (
    <Section label={`Warnungen (${warnings.length})`}>
      {checked && <TrustLine text={TRUST_WITH_WARNINGS} />}
      <View style={styles.card}>
        {warnings.map((w, i) => (
          <View key={i} style={[styles.warnRow, i > 0 && styles.rowSpaced]}>
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel={w.klasse === 'raus' ? 'Sperrung' : 'Warnung'}
              style={[styles.warnDot, w.klasse === 'raus' && styles.dotStop]}
            />
            <AppText style={styles.flex}>{warningText(w)}</AppText>
          </View>
        ))}
      </View>
    </Section>
  );
}

/**
 * Anfasser zum Verschieben eines Punkts: drei Striche rechts in der Zeile. Ziehen beginnt sofort
 * beim Berühren des Anfassers, ohne Bibliothek (PanResponder), die Zeile folgt dem Finger.
 */
/** Erst nach kurzem Halten wird gezogen, damit ein Wisch über den Anfasser nicht gleich verschiebt. */
export const HOLD_MS = 280;
/** Bewegt sich der Finger vorher weiter als das, war es kein Halten. */
export const HOLD_SLOP = 10;

export function DragHandle({ label, onStart, onMove, onEnd }: { label: string; onStart: () => void; onMove: (dy: number) => void; onEnd: () => void }) {
  const cb = useRef({ onStart, onMove, onEnd });
  useEffect(() => {
    cb.current = { onStart, onMove, onEnd };
  });
  const [holding, setHolding] = useState(false);
  const st = useRef({ active: false, cancelled: false, base: 0, dy: 0, timer: null as ReturnType<typeof setTimeout> | null });
  useEffect(() => () => {
    if (st.current.timer) clearTimeout(st.current.timer);
  }, []);
  // Die Handler lesen die jeweils neuesten Callbacks aus der Ref, erst beim Ziehen, nie beim Rendern
  /* eslint-disable react-hooks/refs */
  const pan = useMemo(() => {
    const s = st.current;
    const finish = () => {
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
      setHolding(false);
      if (s.active) cb.current.onEnd();
      s.active = false;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Solange nicht gezogen wird, darf das Sheet die Geste übernehmen (scrollen)
      onPanResponderTerminationRequest: () => !s.active,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        s.active = false;
        s.cancelled = false;
        s.dy = 0;
        setHolding(true);
        s.timer = setTimeout(() => {
          s.timer = null;
          if (s.cancelled) return;
          s.active = true;
          s.base = s.dy;
          cb.current.onStart();
        }, HOLD_MS);
      },
      onPanResponderMove: (_, g) => {
        s.dy = g.dy;
        if (s.active) cb.current.onMove(g.dy - s.base);
        else if (!s.cancelled && Math.abs(g.dy) > HOLD_SLOP) {
          s.cancelled = true;
          setHolding(false);
        }
      },
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
    });
  }, []);
  /* eslint-enable react-hooks/refs */
  return (
    <View {...pan.panHandlers} accessible accessibilityLabel={label} accessibilityHint="Kurz halten, dann nach oben oder unten ziehen" style={styles.handle}>
      <SymbolView name="line.3.horizontal" size={17} tintColor={holding ? Colors.signal : Colors.muted} weight="semibold" />
    </View>
  );
}

/**
 * Ganze Punktzeile als Fläche (Koray 7.11.): kurz tippen öffnet den Punkt zum Ändern, kurz halten
 * (0,28 s) und ziehen verschiebt ihn. Wischt der Finger vorher, scrollt das Blatt wie gewohnt.
 */
export function DragArea({
  label,
  hint,
  onTap,
  onStart,
  onMove,
  onEnd,
  style,
  children,
}: {
  label: string;
  hint?: string;
  onTap: () => void;
  onStart: () => void;
  onMove: (dy: number) => void;
  onEnd: () => void;
  style?: object;
  children: ReactNode;
}) {
  const cb = useRef({ onTap, onStart, onMove, onEnd });
  useEffect(() => {
    cb.current = { onTap, onStart, onMove, onEnd };
  });
  const [holding, setHolding] = useState(false);
  const st = useRef({ active: false, cancelled: false, base: 0, dy: 0, timer: null as ReturnType<typeof setTimeout> | null });
  useEffect(() => () => {
    if (st.current.timer) clearTimeout(st.current.timer);
  }, []);
  /* eslint-disable react-hooks/refs */
  const pan = useMemo(() => {
    const s = st.current;
    const finish = (tapAllowed: boolean) => {
      const wasTap = tapAllowed && !s.active && !s.cancelled && s.timer != null;
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
      setHolding(false);
      if (s.active) cb.current.onEnd();
      s.active = false;
      if (wasTap) cb.current.onTap();
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => !s.active,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        s.active = false;
        s.cancelled = false;
        s.dy = 0;
        s.timer = setTimeout(() => {
          s.timer = null;
          if (s.cancelled) return;
          s.active = true;
          s.base = s.dy;
          setHolding(true);
          cb.current.onStart();
        }, HOLD_MS);
      },
      onPanResponderMove: (_, g) => {
        s.dy = g.dy;
        if (s.active) cb.current.onMove(g.dy - s.base);
        else if (!s.cancelled && (Math.abs(g.dy) > HOLD_SLOP || Math.abs(g.dx) > HOLD_SLOP)) s.cancelled = true;
      },
      onPanResponderRelease: () => finish(true),
      onPanResponderTerminate: () => finish(false),
    });
  }, []);
  /* eslint-enable react-hooks/refs */
  return (
    <View
      {...pan.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint ?? 'Tippen zum Ändern, halten und ziehen zum Verschieben'}
      onAccessibilityTap={() => cb.current.onTap()}
      style={[style, holding && { opacity: 0.96 }]}>
      {children}
    </View>
  );
}

/** Gruppe: Mitfahrer lädt man mit Namen zu einer gespeicherten Tour ein (Meine Touren, Als Gruppe fahren). */
export function GroupBlock({ savedId }: { savedId: string | null }) {
  return (
    <View style={styles.card}>
      <AppText variant="label">Gruppe</AppText>
      <AppText>Fahrt diese Runde zusammen, mit bis zu 5 Mitfahrern.</AppText>
      {savedId ? (
        <SecondaryButton label="Mitfahrer einladen" onSurface onPress={() => router.push({ pathname: '/gruppe/neu', params: { tour: savedId } })} />
      ) : (
        <AppText variant="caption" muted>
          Speichere die Tour zuerst. Danach lädst du die Mitfahrer mit ihrem Namen ein.
        </AppText>
      )}
    </View>
  );
}
