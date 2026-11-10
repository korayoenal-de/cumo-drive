/**
 * Minimales React für Hooks in Node (useState, useEffect, useSyncExternalStore ...), damit die Hooks
 * der App (useNachrichten, useDirectChat, useMyProfile) ohne Renderer laufen. renderHook rendert
 * eine Hook Funktion, setState rendert neu.
 */
type Slot = { v?: unknown; deps?: unknown[]; cleanup?: (() => void) | void; unsub?: () => void };
type Inst = { slots: Slot[]; i: number; fn: () => unknown; result: { current: unknown }; effects: (() => void)[]; dead: boolean; scheduled: boolean };

let cur: Inst | null = null;

function render(inst: Inst) {
  if (inst.dead) return;
  inst.i = 0;
  inst.effects = [];
  cur = inst;
  try {
    inst.result.current = inst.fn();
  } finally {
    cur = null;
  }
  for (const e of inst.effects) e();
}

function schedule(inst: Inst) {
  if (inst.scheduled || inst.dead) return;
  inst.scheduled = true;
  queueMicrotask(() => {
    inst.scheduled = false;
    render(inst);
  });
}

function slot(): [Slot, Inst] {
  if (!cur) throw new Error('Hook außerhalb von renderHook');
  const s = (cur.slots[cur.i++] ??= {});
  return [s, cur];
}

const same = (a?: unknown[], b?: unknown[]) => !!a && !!b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

export function useState<T>(init: T | (() => T)): [T, (v: T | ((p: T) => T)) => void] {
  const [s, inst] = slot();
  if (!('v' in s)) s.v = typeof init === 'function' ? (init as () => T)() : init;
  const setter = (v: T | ((p: T) => T)) => {
    const next = typeof v === 'function' ? (v as (p: T) => T)(s.v as T) : v;
    if (Object.is(next, s.v)) return;
    s.v = next;
    schedule(inst);
  };
  return [s.v as T, setter];
}

export function useReducer<S, A>(r: (s: S, a: A) => S, init: S): [S, (a: A) => void] {
  const [v, set] = useState(init);
  return [v, (a: A) => set((p) => r(p, a))];
}

export function useEffect(fn: () => void | (() => void), deps?: unknown[]) {
  const [s, inst] = slot();
  if (deps && same(s.deps, deps)) return;
  s.deps = deps;
  inst.effects.push(() => {
    if (typeof s.cleanup === 'function') s.cleanup();
    s.cleanup = fn();
  });
}
export const useLayoutEffect = useEffect;

export function useMemo<T>(fn: () => T, deps: unknown[]): T {
  const [s] = slot();
  if (!same(s.deps, deps)) {
    s.v = fn();
    s.deps = deps;
  }
  return s.v as T;
}
// eslint-disable-next-line react-hooks/exhaustive-deps
export const useCallback = <T,>(fn: T, deps: unknown[]): T => useMemo(() => fn, deps);

export function useRef<T>(v: T): { current: T } {
  const [s] = slot();
  if (!('v' in s)) s.v = { current: v };
  return s.v as { current: T };
}

export function useSyncExternalStore<T>(sub: (l: () => void) => () => void, get: () => T, _server?: () => T): T {
  const [s, inst] = slot();
  if (!s.unsub) s.unsub = sub(() => schedule(inst));
  return get();
}

export function renderHook<T>(fn: () => T) {
  const inst: Inst = { slots: [], i: 0, fn, result: { current: undefined }, effects: [], dead: false, scheduled: false };
  render(inst);
  return {
    result: inst.result as { current: T },
    unmount() {
      inst.dead = true;
      for (const s of inst.slots) {
        if (typeof s.cleanup === 'function') s.cleanup();
        s.unsub?.();
      }
    },
  };
}

export const createContext = <T,>(v: T) => ({ Provider: () => null, Consumer: () => null, _v: v });
export const useContext = <T,>(c: { _v: T }) => c._v;
export const memo = <T,>(c: T) => c;
export const forwardRef = <T,>(c: T) => c;
export const Fragment = 'Fragment';
export const createElement = () => null;
const React = { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, useSyncExternalStore, useReducer, createContext, useContext, memo, forwardRef, Fragment, createElement };
export default React;
