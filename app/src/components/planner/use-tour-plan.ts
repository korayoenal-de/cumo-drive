/**
 * Zustand und Aktionen der Route im Planer: Start, Zwischenziele, Ziel, Profil je Etappe, Namen,
 * Planen mit Prüfung und Speichern. Ohne Oberfläche; die Oberfläche steht in tour-mode.tsx.
 */
import { useRef, useState } from 'react';

import { toPlanError } from '@/components/planner/create-tour';
import { saveTour, syncLibrary, type SavedTour } from '@/lib/library';
import { reverseName } from '@/lib/geocode';
import { planLegs, type PlannedTour, type PlanStep } from '@/lib/plan';
import { insertVia, movePoint } from '@/lib/route-edit';
import { type LatLon, type Profile } from '@/lib/tour';
import { type Avoid } from '@/lib/valhalla';
import { showToast } from '@/lib/toast';

import { fitLegs, keyOf, type LegProfile, type PointKind } from './planner-shared';


export type TourPlan = ReturnType<typeof useTourPlan>;

/**
 * Zustand und Aktionen der Route: feste Felder Start, Zwischenziele, Ziel (wie im Web Planer).
 * Jede Etappe (Punkt zu Punkt) hat ihr eigenes Profil, gespeichert neben der Liste der Zwischenziele.
 * Geplant wird, sobald Start und Ziel gesetzt sind.
 */
export function useTourPlan(onPlanned?: () => void) {
  const [start, setStart] = useState<LatLon | null>(null);
  const [vias, setVias] = useState<LatLon[]>([]);
  const [ziel, setZiel] = useState<LatLon | null>(null);
  const [legProfiles, setLegProfiles] = useState<LegProfile[]>([null]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [name, setName] = useState('Neue Tour');
  const [planned, setPlanned] = useState<PlannedTour | null>(null);
  const [step, setStep] = useState<PlanStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cloudId, setCloudId] = useState<string | null>(null);
  /** Ordner der Tour in Meine Touren, bleibt beim Ändern einer gespeicherten Tour erhalten */
  const [folder, setFolder] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  /** Stand beim Laden oder letzten Speichern: weicht er ab, gibt es Änderungen zu speichern */
  const [base, setBase] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const complete = !!start && !!ziel;
  /** Alle gesetzten Punkte in Reihenfolge; vollständig, sobald Start und Ziel da sind. */
  const pts: LatLon[] = [...(start ? [start] : []), ...vias, ...(ziel ? [ziel] : [])];
  const sigOf = (p: LatLon[], n: string, lp: LegProfile[]) => JSON.stringify([p, n.trim(), lp]);
  /** Neue Tour oder gespeicherte Tour mit Änderungen */
  const dirty = !cloudId || base !== sigOf(pts, name, legProfiles);

  /** Profil der Etappe i (von Feld i zu Feld i+1), ohne eigenes Profil das allgemeine. */
  const legProfile = (i: number, global: Profile): Profile => legProfiles[i] ?? global;

  /** Profile passend zu den gesetzten Punkten (fehlt der Start, beginnt es bei der zweiten Etappe). */
  function profilesFor(lp: LegProfile[], s: LatLon | null, count: number, global: Profile): Profile[] {
    const offset = s ? 0 : 1;
    return Array.from({ length: Math.max(1, count - 1) }, (_, i) => lp[i + offset] ?? global);
  }

  function rememberName(p: LatLon, known?: string) {
    const k = keyOf(p);
    if (known) {
      setNames((old) => ({ ...old, [k]: known }));
      return;
    }
    reverseName(p)
      .then((n) => n && setNames((old) => (old[k] ? old : { ...old, [k]: n })))
      .catch(() => undefined);
  }

  async function plan(points: LatLon[], profiles: Profile[], avoid: Avoid, tourName = name) {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setError(null);
    setSaveMsg(null);
    setStep('route');
    try {
      const t = await planLegs(tourName.trim() || 'Neue Tour', points, profiles, avoid, (st) => !ctrl.signal.aborted && setStep(st), ctrl.signal);
      if (!ctrl.signal.aborted) {
        setPlanned(t);
        onPlanned?.();
      }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const err = toPlanError(e, ctrl.signal);
      setPlanned(null);
      setError(err.kind === 'network' ? err.message : 'Für diese Punkte hat der Routenplaner keine Strecke gefunden. Verschieb einen Punkt etwas oder nimm ein anderes Profil.');
    } finally {
      if (abort.current === ctrl) setStep(null);
    }
  }

  /** Felder übernehmen und, sobald Start und Ziel stehen, sofort neu planen. */
  function apply(s: LatLon | null, v: LatLon[], z: LatLon | null, lp: LegProfile[], profile: Profile, avoid: Avoid) {
    const fitted = fitLegs(lp, v.length);
    setStart(s);
    setVias(v);
    setZiel(z);
    setLegProfiles(fitted);
    if (s && z) {
      void plan([s, ...v, z], fitted.map((p) => p ?? profile), avoid);
      return;
    }
    abort.current?.abort();
    setStep(null);
    setError(null);
    setPlanned(null);
  }

  /** Neues Zwischenziel auf Etappe leg einfügen; beide neuen Etappen erben deren Profil. */
  function insertAt(leg: number, p: LatLon, profile: Profile, avoid: Avoid, known?: string) {
    rememberName(p, known);
    const at = Math.max(0, Math.min(leg, vias.length));
    const v = [...vias];
    v.splice(at, 0, p);
    const lp = fitLegs(legProfiles, vias.length);
    const next = [...lp];
    next.splice(at, 0, lp[at] ?? null);
    apply(start, v, ziel, next, profile, avoid);
  }

  /** Punkt in ein Feld setzen: Start, Ziel oder Zwischenziel an Stelle index (am Ende: neu). */
  function setSlot(kind: PointKind, p: LatLon, profile: Profile, avoid: Avoid, known?: string, index?: number) {
    if (kind === 'via' && (index == null || index >= vias.length)) {
      insertAt(vias.length, p, profile, avoid, known);
      return;
    }
    rememberName(p, known);
    if (kind === 'start') apply(p, vias, ziel, legProfiles, profile, avoid);
    else if (kind === 'ziel') apply(start, vias, p, legProfiles, profile, avoid);
    else {
      const v = [...vias];
      v[index!] = p;
      apply(start, v, ziel, legProfiles, profile, avoid);
    }
  }

  /** Von der Karte oder für Stopps: Zwischenziel dort einfügen, wo es den kleinsten Umweg macht. */
  function add(kind: PointKind, p: LatLon, profile: Profile, avoid: Avoid, known?: string) {
    if (kind !== 'via' || !start || !ziel) {
      setSlot(kind === 'via' && !start ? 'start' : kind === 'via' && !ziel ? 'ziel' : kind, p, profile, avoid, known);
      return;
    }
    const full = insertVia([start, ...vias, ziel], p);
    insertAt(full.indexOf(p) - 1, p, profile, avoid, known);
  }

  /** Speichert und liefert die ID in Meine Touren, null wenn es nicht geklappt hat */
  async function save(curves: number, profile: Profile, avoid: Avoid): Promise<string | null> {
    if (!planned) return null;
    setSaving(true);
    setSaveMsg(null);
    try {
      // auf dem Gerät speichern (Meine Touren), angemeldet auch ins Konto
      const saved = saveTour({ ...planned, name: name.trim() || planned.name, curves, profile }, folder, cloudId ?? undefined);
      setCloudId(saved.id);
      setBase(sigOf(pts, name, legProfiles));
      void syncLibrary();
      setSaveMsg(null);
      showToast('Gespeichert unter Meine Touren');
      return saved.id;
    } catch (e) {
      setSaveMsg(null);
      showToast(`Speichern hat nicht geklappt: ${e instanceof Error ? e.message : String(e)}`, { tone: 'error' });
      return null;
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    abort.current?.abort();
    setStart(null);
    setVias([]);
    setZiel(null);
    setLegProfiles([null]);
    setPlanned(null);
    setStep(null);
    setError(null);
    setCloudId(null);
    setBase(null);
    setFolder('');
    setSaveMsg(null);
    setName('Neue Tour');
  }

  /** Gespeicherte Tour zum Ändern laden: erster Wegpunkt Start, letzter Ziel, dazwischen Zwischenziele. Speichern ersetzt dieselbe Tour. */
  function load(t: SavedTour, profile: Profile, avoid: Avoid) {
    abort.current?.abort();
    const w = t.wegpunkte;
    const s = w[0] ?? null;
    const z = w.length > 1 ? w[w.length - 1] : null;
    const v = w.slice(1, -1);
    const lp = fitLegs([null], v.length);
    setStart(s);
    setVias(v);
    setZiel(z);
    setLegProfiles(lp);
    setNames({});
    setName(t.name);
    // Ohne id (Community Tour): als ungespeicherte Kopie öffnen, Speichern legt sie in Meine Touren
    setCloudId(t.id || null);
    setFolder(t.folder);
    setError(null);
    setSaveMsg(null);
    setStep(null);
    setBase(t.id ? sigOf(w, t.name, lp) : null);
    // Namen für Start und Ziel nachschlagen, bei wenigen Punkten auch für die Zwischenziele
    for (const p of v.length <= 8 ? w : [s, z]) if (p) rememberName(p);
    // Gespeicherte Strecke so zeigen, wie sie ist (importierte und Club Touren nicht neu planen).
    // Neu geplant wird erst, wenn ein Punkt verschoben oder hinzugefügt wird.
    if (t.linie.length) {
      setPlanned({ ...t, minutes: t.minutes ?? Math.round((t.laenge_km / 55) * 60), fixes: 0 });
      onPlanned?.();
    } else if (s && z) void plan([s, ...v, z], lp.map((x) => x ?? profile), avoid, t.name);
    else setPlanned(null);
  }

  return {
    start, vias, ziel, complete, pts, names, name, setName, planned, step, error, cloudId, saving, saveMsg, dirty,
    legProfile, setSlot, add, insertAt, save, reset, load,
    /** Mit den gesetzten Punkten und den Profilen je Etappe neu planen. */
    planNow: (profile: Profile, avoid: Avoid) => pts.length >= 2 && void plan(pts, profilesFor(legProfiles, start, pts.length, profile), avoid),
    setLegProfile: (leg: number, p: Profile, profile: Profile, avoid: Avoid) => {
      const lp = [...fitLegs(legProfiles, vias.length)];
      lp[leg] = p;
      apply(start, vias, ziel, lp, profile, avoid);
    },
    removeStart: (profile: Profile, avoid: Avoid) => apply(null, vias, ziel, legProfiles, profile, avoid),
    removeZiel: (profile: Profile, avoid: Avoid) => apply(start, vias, null, legProfiles, profile, avoid),
    // Fällt ein Zwischenziel weg, verschmelzen die Etappen davor und danach; das Profil davor bleibt
    removeVia: (i: number, profile: Profile, avoid: Avoid) =>
      apply(start, vias.filter((_, k) => k !== i), ziel, fitLegs(legProfiles, vias.length).filter((_, k) => k !== i + 1), profile, avoid),
    moveVia: (i: number, dir: -1 | 1, profile: Profile, avoid: Avoid) => apply(start, movePoint(vias, i, dir), ziel, legProfiles, profile, avoid),
    /** Neue Reihenfolge aller Punkte (Drag and Drop): erster ist der Start, letzter das Ziel */
    reorder: (order: number[], profile: Profile, avoid: Avoid) => {
      const all = [start, ...vias, ziel].filter((p): p is LatLon => !!p);
      if (order.length !== all.length) return;
      const next = order.map((i) => all[i]);
      const mid = next.slice(1, -1);
      apply(next[0], mid, next[next.length - 1], fitLegs([null], mid.length), profile, avoid);
    },
    swap: (profile: Profile, avoid: Avoid) => apply(ziel, [...vias].reverse(), start, [...fitLegs(legProfiles, vias.length)].reverse(), profile, avoid),
  };
}
