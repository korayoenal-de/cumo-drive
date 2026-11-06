/**
 * Kleine Bausteine des Planers: Abschnitt, Tasten, Schalter, Fortschritt, Fehler, Stopps, Kennzahlen,
 * Warnungen, Anfasser zum Verschieben und Gruppenfahrt Hinweis.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, PanResponder, Pressable, Switch, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Svg, { Path } from 'react-native-svg';

import { PHASES, type PlanError, type PlanPhase } from '@/components/planner/create-tour';
import { Chip } from '@/components/ui/chip';
import { AppText } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { STOP_KINDS, stopsAlong, type StopHit, type StopKind } from '@/lib/stops-along';
import { formatKm, type LatLon, type Warning } from '@/lib/tour';
import { selectVehicle, useVehicles } from '@/lib/vehicle';

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
            <Chip key={v.id} label={v.model.trim() || 'Fahrzeug'} active={current?.id === v.id} onSurface onPress={() => void selectVehicle(v.id)} />
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
export function StopsSection({ line, initial, busy, onAdd }: { line: LatLon[]; initial?: StopKind | null; busy: boolean; onAdd: (p: LatLon) => void }) {
  const [kind, setKind] = useState<StopKind | null>(initial ?? null);
  const [res, setRes] = useState<{ key: string; hits: StopHit[] | null; error: string | null } | null>(null);
  const key = `${kind}|${line.length}|${line[0]?.join()}|${line[line.length - 1]?.join()}`;
  useEffect(() => {
    if (!kind || line.length < 2) return;
    const ctrl = new AbortController();
    stopsAlong(kind, line, ctrl.signal)
      .then((hits) => setRes({ key, hits, error: null }))
      .catch((e: Error) => !ctrl.signal.aborted && setRes({ key, hits: null, error: e.message }));
    return () => ctrl.abort();
  }, [kind, line, key]);
  const cur = res?.key === key ? res : null;
  return (
    <Section label="Stopps an der Strecke">
      <View style={styles.card}>
        <View style={styles.wrap}>
          {STOP_KINDS.map((k) => (
            <Chip key={k.id} label={k.label} active={kind === k.id} onSurface onPress={() => setKind(kind === k.id ? null : k.id)} />
          ))}
        </View>
        {kind && <AppText variant="caption" muted>{STOP_KINDS.find((k) => k.id === kind)?.hint}</AppText>}
        {kind && !cur && <ActivityIndicator color={Colors.muted} />}
        {cur?.error && <AppText variant="caption" muted>Gerade nicht erreichbar. Versuch es gleich noch mal.</AppText>}
        {cur?.hits && cur.hits.length === 0 && <AppText variant="caption" muted>Nichts direkt an der Strecke gefunden.</AppText>}
        {cur?.hits?.map((h) => (
          <View key={h.id} style={styles.stopRow}>
            <AppText variant="caption" muted style={styles.stopKm}>km {Math.round(h.km)}</AppText>
            <View style={styles.flex}>
              <AppText variant="title" numberOfLines={1}>{h.name}</AppText>
              <AppText variant="caption" muted numberOfLines={1}>
                {[h.detail, h.offM > 150 ? `${formatKm(h.offM / 1000, 1)} km neben der Route` : 'direkt an der Route'].filter(Boolean).join(', ')}
              </AppText>
            </View>
            <SmallButton label={busy ? 'Plant' : 'Einplanen'} onPress={() => !busy && onAdd(h.p)} />
          </View>
        ))}
      </View>
    </Section>
  );
}

/** Kennzahlen der Tour. Alle großen Werte haben dieselbe Größe, nichts wird automatisch verkleinert. */
export function Stats({ km, minutes, curves }: { km: number; minutes: number; curves: number }) {
  const items = [
    { id: 'km', value: `${formatKm(km, 0)} km`, label: 'Strecke' },
    { id: 'zeit', value: bigDuration(minutes), label: 'Fahrzeit' },
    { id: 'kurven', value: String(curves), label: 'Kurven' },
  ];
  return (
    <View style={styles.stats}>
      {items.map((x) => (
        <View key={x.id} style={styles.flex}>
          <AppText style={styles.statLabel}>{x.label}</AppText>
          <AppText style={styles.statBig} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{x.value}</AppText>
        </View>
      ))}
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
export function reasonText(r: string): string {
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
