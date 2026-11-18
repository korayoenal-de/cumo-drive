/**
 * Wechsel zwischen Typo Tabs (Koray 18.11.2026, Regel Typo Tabs in docs/design-prinzipien.md): der Inhalt des alten
 * Tabs schiebt sich gestaffelt in Laufrichtung hinaus, der neue fährt gestaffelt aus derselben Richtung ein. Sehr
 * subtil: wenige Punkte Weg, kurze Zeiten, EASE_OUT, ohne Feder. Nach rechts (zweiter Tab) läuft alles von rechts
 * nach links, zurück spiegelbildlich.
 *
 * TabSwap legt keine eigene Fläche an: jedes Kind bekommt eine schlichte Hülle, Abstände des Elternteils (gap)
 * bleiben. Die Schlüssel der Hüllen folgen der Position wie bei React selbst, deshalb bleibt innerhalb eines Tabs
 * alles gemountet und nichts bewegt sich, wenn dort etwas erscheint oder verschwindet.
 */
import { Fragment, createContext, isValidElement, useContext, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { EASE_OUT } from '@/components/ui/motion';
import { Motion } from '@/constants/theme';

const OUT_MS = 150;
const OUT_STAGGER = 30;
const OUT_DX = 16;
const IN_MS = Motion.enter;
const IN_STAGGER = 45;
const IN_DX = 24;
/** Ab dem fünften Kind kommt alles gemeinsam, sonst wartet man auf den Rest */
const MAX_STAGGER = 4;

type Phase = { p: SharedValue<number>; out: SharedValue<number>; dir: SharedValue<number>; n: SharedValue<number> };
const Ctx = createContext<Phase | null>(null);

/** Kinder flach wie React sie abgleicht: Fragmente aufgelöst, leere Plätze behalten ihre Position */
function flat(children: ReactNode, path = ''): { key: string; el: ReactNode }[] {
  const out: { key: string; el: ReactNode }[] = [];
  const list = Array.isArray(children) ? children : [children];
  list.forEach((c, i) => {
    if (c == null || typeof c === 'boolean') return;
    const own = isValidElement(c) && c.key != null ? `k${String(c.key)}` : `i${i}`;
    const key = path ? `${path}.${own}` : own;
    if (Array.isArray(c)) out.push(...flat(c, key));
    else if (isValidElement(c) && c.type === Fragment) out.push(...flat((c as ReactElement<{ children?: ReactNode }>).props.children, key));
    else out.push({ key, el: c });
  });
  return out;
}

export function TabSwap({ index, children }: { index: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(1);
  const out = useSharedValue(0);
  const dir = useSharedValue(1);
  const n = useSharedValue(0);
  // Steuerung in einem festen Objekt, damit die Effekte die Werte nur über Methoden setzen
  const [ctl] = useState(() => ({
    phase: { p, out, dir, n } as Phase,
    count: (c: number) => {
      n.value = c;
    },
    leave: (d: number) => {
      const ms = OUT_MS + Math.min(n.value, MAX_STAGGER) * OUT_STAGGER;
      dir.value = d;
      out.value = 1;
      p.value = 0;
      p.value = withTiming(1, { duration: ms, easing: Easing.in(Easing.quad) });
      return ms;
    },
    enter: () => {
      out.value = 0;
      p.value = 0;
      p.value = withTiming(1, { duration: IN_MS + Math.min(n.value, MAX_STAGGER) * IN_STAGGER, easing: EASE_OUT });
    },
  }));
  // Abgeleiteter Zustand: der zuletzt gezeigte Inhalt bleibt sichtbar, solange er hinausläuft
  const [cur, setCur] = useState({ index, kids: children });
  const [old, setOld] = useState<{ index: number; kids: ReactNode; dir: number } | null>(null);
  if (index !== cur.index) {
    if (!reduced) setOld({ index: cur.index, kids: cur.kids, dir: index > cur.index ? 1 : -1 });
    setCur({ index, kids: children });
  } else if (children !== cur.kids) setCur({ index, kids: children });

  const items = flat(old ? old.kids : children);
  const count = items.length;
  useEffect(() => {
    ctl.count(count);
  }, [count, ctl]);

  useEffect(() => {
    if (!old) return;
    const t = setTimeout(() => {
      // neuer Inhalt: gestaffelt einfahren
      ctl.enter();
      setOld(null);
    }, ctl.leave(old.dir));
    return () => clearTimeout(t);
  }, [old, ctl]);

  const shownIndex = old ? old.index : cur.index;
  return (
    <Ctx.Provider value={ctl.phase}>
      {items.map((it, i) => (
        <Stagger key={`${shownIndex}:${it.key}`} i={i}>
          {it.el}
        </Stagger>
      ))}
    </Ctx.Provider>
  );
}

function Stagger({ i, children }: { i: number; children: ReactNode }) {
  const ph = useContext(Ctx)!;
  const s = Math.min(i, MAX_STAGGER);
  const st = useAnimatedStyle(() => {
    const steps = Math.min(ph.n.value, MAX_STAGGER);
    if (ph.out.value) {
      const total = OUT_MS + steps * OUT_STAGGER;
      const local = Math.min(1, Math.max(0, (ph.p.value * total - s * OUT_STAGGER) / OUT_MS));
      return { opacity: 1 - local, transform: [{ translateX: -ph.dir.value * OUT_DX * local }] };
    }
    const total = IN_MS + steps * IN_STAGGER;
    const local = Math.min(1, Math.max(0, (ph.p.value * total - s * IN_STAGGER) / IN_MS));
    return { opacity: local, transform: [{ translateX: ph.dir.value * IN_DX * (1 - local) }] };
  });
  return <Animated.View style={st}>{children}</Animated.View>;
}
