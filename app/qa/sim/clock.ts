/**
 * Virtuelle Uhr für die Simulation: Date.now, setTimeout und setInterval der App laufen auf
 * Simulationszeit, damit zwei Minuten Netzausfall oder 20 s Nachladen keine echte Zeit kosten.
 * Die Infrastruktur der Simulation (Latenz im Bus, psql) nutzt die echten Timer aus `real`.
 */
export const real = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  setImmediate: globalThis.setImmediate.bind(globalThis),
  now: Date.now.bind(Date),
};

type Timer = { id: number; at: number; fn: () => void; every: number | null };

let t = real.now();
let nextId = 1;
const timers = new Map<number, Timer>();

export const clock = {
  now: () => t,
  /** Simulationszeit vorstellen und fällige Timer der App ausführen. */
  advance(ms: number) {
    const end = t + ms;
    for (;;) {
      let due: Timer | null = null;
      for (const x of timers.values()) if (x.at <= end && (!due || x.at < due.at)) due = x;
      if (!due) break;
      t = Math.max(t, due.at);
      if (due.every != null) due.at = t + due.every;
      else timers.delete(due.id);
      try {
        due.fn();
      } catch (e) {
        console.error('Timer Fehler', e);
      }
    }
    t = end;
  },
  pendingTimers: () => timers.size,
};

/** Globale Uhr und Timer ersetzen (vor dem Laden der App Module aufrufen). */
export function installVirtualClock() {
  const RealDate = Date;
  Date.now = () => t;
  // new Date() ohne Argument folgt ebenfalls der Simulationszeit
  class SimDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(t);
      else super(...(args as [string]));
    }
    static now() {
      return t;
    }
  }
  (globalThis as { Date: DateConstructor }).Date = SimDate as unknown as DateConstructor;
  const g = globalThis as unknown as Record<string, unknown>;
  g.setTimeout = (fn: () => void, ms?: number) => {
    const id = nextId++;
    timers.set(id, { id, at: t + Math.max(0, ms ?? 0), fn, every: null });
    return id;
  };
  g.setInterval = (fn: () => void, ms?: number) => {
    const id = nextId++;
    const every = Math.max(1, ms ?? 0);
    timers.set(id, { id, at: t + every, fn, every });
    return id;
  };
  g.clearTimeout = (id: number) => void timers.delete(id);
  g.clearInterval = (id: number) => void timers.delete(id);
}
