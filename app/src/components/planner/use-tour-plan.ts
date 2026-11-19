/**
 * Zustand und Aktionen der Route im Planer: Start, Zwischenziele, Ziel, Profil je Etappe, Namen,
 * Planen mit Prüfung und Speichern. Ohne Oberfläche; die Oberfläche steht in tour-mode.tsx.
 */
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';

import { toPlanError } from '@/components/planner/create-tour';
import { clearEditOrigin } from '@/lib/edit-tour';
import { fromCommunity, readLibrary, saveTour, syncLibrary, type SavedTour } from '@/lib/library';
import { reverseName } from '@/lib/geocode';
import { avoidedKey, clearAvoidedPasses } from '@/lib/avoid-pass';
import { planChanged, planLegs, type PlannedTour, type PlanStep } from '@/lib/plan';
import { expandPoints } from '@/lib/plan-expand';
import { rotateLoop, waypointsOnLine } from '@/lib/plan-window';
import { insertVia, movePoint } from '@/lib/route-edit';
import { flatten, haversine, normProfile, type LatLon, type Profile } from '@/lib/tour';
import { type Avoid } from '@/lib/valhalla';
import { showToast } from '@/lib/toast';

import { fitLegs, keyOf, type LegProfile, type PointKind } from './planner-shared';
import { t, tr } from '@/i18n';


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
  const [name, setName] = useState(tr('Neue Tour'));
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
  /** Stand beim Öffnen einer Tour (auch ungespeicherte Community Kopie) oder beim letzten Speichern */
  const [loaded, setLoaded] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  /**
   * Strecken als Zwischenziel (Koray 8.11.): in der Liste ein Punkt (Einstieg), beim Planen zusätzlich Stützpunkte
   * entlang unserer Linie bis zum Ausstieg, damit der Router die Strecke wirklich fährt. Schlüssel: keyOf(Einstieg).
   */
  const roads = useRef<Record<string, { name: string; line: LatLon[] }>>({});
  /** Hinweis, wenn eine gewählte Strecke nur zum Teil in der Route liegt */
  const [roadWarn, setRoadWarn] = useState<string | null>(null);

  const complete = !!start && !!ziel;
  /** Alle gesetzten Punkte in Reihenfolge; vollständig, sobald Start und Ziel da sind. */
  // stabil, solange sich kein Punkt ändert: Karte und Listen rechnen sonst bei jedem Rendern neu (Prüfung 11.11.)
  const pts: LatLon[] = useMemo(() => [...(start ? [start] : []), ...vias, ...(ziel ? [ziel] : [])], [start, vias, ziel]);
  const sigOf = (p: LatLon[], n: string, lp: LegProfile[]) => JSON.stringify([p, n.trim(), lp]);
  /** Neue Tour oder gespeicherte Tour mit Änderungen */
  const dirty = !cloudId || base !== sigOf(pts, name, legProfiles);
  /** Geöffnete Tour wirklich verändert (für die Rückfrage beim Zurück, Koray 10.11.) */
  const changed = loaded !== null && loaded !== sigOf(pts, name, legProfiles);

  /** Profil der Etappe i (von Feld i zu Feld i+1), ohne eigenes Profil das allgemeine. */
  const legProfile = (i: number, global: Profile): Profile => normProfile(legProfiles[i] ?? global);

  /** Profile passend zu den gesetzten Punkten (fehlt der Start, beginnt es bei der zweiten Etappe). */
  function profilesFor(lp: LegProfile[], s: LatLon | null, count: number, global: Profile): Profile[] {
    const offset = s ? 0 : 1;
    return Array.from({ length: Math.max(1, count - 1) }, (_, i) => lp[i + offset] ?? global);
  }

  /** Aus der Community geöffnet: wer sie veröffentlicht hat und ob sie schon abgewandelt ist (Koray 11.11.) */
  const origin = useRef<{ author?: string; communityId?: string; edited?: boolean } | null>(null);

  /** Laufende Namenssuche einer geladenen Tour; eine neue Tour bricht sie ab */
  const nameSeq = useRef(0);

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

  /** Wie viel jeder gewählten Strecke die Route wirklich fährt; unter 70 % ein Hinweis */
  function roadCoverage(points: LatLon[], t: PlannedTour): string | null {
    const line = flatten(t).map((x) => x.p).filter((_, i, a) => i % Math.max(1, Math.round(a.length / 1500)) === 0);
    for (const p of points) {
      const r = roads.current[keyOf(p)];
      if (!r) continue;
      const probe = r.line.filter((_, i) => i % 2 === 0);
      const hit = probe.filter((q) => line.some((x) => haversine(x, q) < 150)).length;
      if (probe.length && hit / probe.length < 0.7) return tr('{name} liegt nur zum Teil auf deiner Route. Verschieb den Punkt davor oder danach etwas.', { name: r.name });
    }
    return null;
  }

  /**
   * Zu jeder gezeigten Tour, wie sie geplant wurde (Punkte mit Stützpunkten, Profile, Vermeiden). Ändert sich
   * danach nur ein Punkt, werden nur die Etappen daneben neu geplant (Prüfung 11.11.). Hängt an der Tour
   * selbst, damit es auch nach Rückgängig wieder passt.
   */
  const plannedAs = useRef(new WeakMap<PlannedTour, { raw: PlannedTour; profiles: Profile[]; avoid: string }>());

  /** full: alles neu planen, auch wenn sich nichts geändert hat (Taste Neu planen, anderes Vermeiden) */
  /** from: statt der gezeigten Tour diese als Vorlage nehmen (gedrehte Runde); dann darf an der Naht gewendet werden */
  async function plan(points: LatLon[], profiles: Profile[], avoid: Avoid, tourName = name, full = false, from?: { raw: PlannedTour; profiles: Profile[]; avoid: string }) {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setError(null);
    setSaveMsg(null);
    setStep('route');
    try {
      // Strecken auffächern: nach ihrem Einstieg die Stützpunkte, mit dem Profil der folgenden Etappe (plan-expand.ts)
      const { xPts, xProf } = expandPoints(points, profiles, roads.current);
      const nm = tourName.trim() || tr('Neue Tour');
      const onStep = (st: PlanStep) => !ctrl.signal.aborted && setStep(st);
      // herausgenommene Pässe gehören zum Schlüssel: ändert sich die Liste, wird nichts wiederverwendet
      const avoidKey = `${JSON.stringify(avoid)}|${avoidedKey()}`;
      const before = from ?? (!full && planned ? plannedAs.current.get(planned) : undefined);
      let raw: PlannedTour | null = null;
      if (before && before.avoid === avoidKey) {
        try {
          raw = await planChanged(before.raw, before.profiles, nm, xPts, xProf, avoid, onStep, ctrl.signal, !!from);
        } catch (e) {
          // das Teilstück ließ sich nicht planen: unten alles neu, dort kommt auch die Fehlermeldung
          if (ctrl.signal.aborted) throw e;
        }
      }
      raw ??= await planLegs(nm, xPts, xProf, avoid, onStep, ctrl.signal);
      // In der Tour stehen nur die sichtbaren Punkte; die Etappen ordnen sich über die Linie wieder zu
      const t = xPts.length === points.length ? raw : { ...raw, wegpunkte: points, direkt: raw.direkt ? Math.min(raw.direkt, points.length - 1) : raw.direkt };
      if (!ctrl.signal.aborted) {
        plannedAs.current.set(t, { raw: { ...raw, wegpunkte: xPts }, profiles: xProf, avoid: avoidKey });
        setPlanned(t);
        setRoadWarn(roadCoverage(points, t));
        onPlanned?.();
      }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const err = toPlanError(e, ctrl.signal);
      setPlanned(null);
      setError(err.kind === 'network' ? err.message : tr('Für diese Punkte hat der Routenplaner keine Strecke gefunden. Verschieb einen Punkt etwas oder nimm ein anderes Profil.'));
    } finally {
      if (abort.current === ctrl) setStep(null);
    }
  }

  /** Felder übernehmen und, sobald Start und Ziel stehen, sofort neu planen. */
  function apply(s: LatLon | null, v: LatLon[], z: LatLon | null, lp: LegProfile[], profile: Profile, avoid: Avoid) {
    remember();
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

  /**
   * Strecke als Highlight: ein Zwischenziel am Einstieg, die Strecke selbst fährt der Router über Stützpunkte.
   * line ist schon in Fahrtrichtung. Liegt das Zwischenziel davor näher als 2 km am Einstieg, ersetzt sie es
   * (es war nur der Weg dorthin).
   */
  function insertRoad(leg: number, line: LatLon[], profile: Profile, avoid: Avoid, name: string): string | null {
    const entry = line[0];
    roads.current[keyOf(entry)] = { name, line };
    rememberName(entry, name);
    let at = Math.max(0, Math.min(leg, vias.length));
    const v = [...vias];
    const lp = fitLegs(legProfiles, vias.length);
    const next = [...lp];
    let replaced: string | null = null;
    const prev = at > 0 ? v[at - 1] : null;
    if (prev && haversine(prev, entry) < 2000) {
      replaced = names[keyOf(prev)] ?? null;
      v.splice(at - 1, 1);
      next.splice(at - 1, 1);
      at -= 1;
    }
    // ebenso ein Zwischenziel direkt hinter dem Ausstieg: sonst fährt man über die Strecke und wieder zurück
    const exit = line[line.length - 1];
    const after = at < v.length ? v[at] : null;
    if (after && haversine(after, exit) < 2000) {
      replaced = replaced ?? names[keyOf(after)] ?? 'Zwischenziel';
      v.splice(at, 1);
      next.splice(at + 1, 1);
    }
    v.splice(at, 0, entry);
    next.splice(at, 0, lp[at] ?? null);
    apply(start, v, ziel, next, profile, avoid);
    return replaced ?? (prev && haversine(prev, entry) < 2000 ? 'Zwischenziel' : null);
  }

  /** So nah muss der neue Start an einem Zwischenziel der Runde liegen, damit sie dorthin gedreht wird (Meter) */
  const AT_VIA_M = 500;

  /**
   * Neuer Start in einer Rundtour (Koray 19.11.2026). Nur ein Fall bleibt besonders: Der gewählte Ort ist schon
   * ein Zwischenziel der Runde (Gregor: Barr im Vogesen Karussell). Dann dreht sich die Runde dorthin, die Strecke
   * bleibt gleich. In jedem anderen Fall ersetzt der neue Ort den Start wie immer (false).
   * Die erste Fassung vom selben Tag behielt die Runde auch bei einem Ort abseits und fügte Einstieg und alten
   * Start als Zwischenziele ein. Das war beim Ändern von Start und Ziel einer eigenen Tour nicht zu verstehen
   * (Koray, Runde ab Marling) und ist wieder heraus. reanchorLoop und joinLoop bleiben für eine eigene Aktion.
   */
  function restart(p: LatLon, profile: Profile, avoid: Avoid): boolean {
    const all = [start, ...vias, ziel].filter((x): x is LatLon => !!x);
    if (!planned || !planned.linie.length || planned.wegpunkte.length !== all.length) return false;
    let at = -1;
    let bd = AT_VIA_M;
    vias.forEach((v, i) => {
      const d = haversine(p, v);
      if (d <= bd) {
        bd = d;
        at = i + 1;
      }
    });
    if (at < 0) return false;
    const lp = fitLegs(legProfiles, vias.length);
    const rot = rotateLoop(planned, at);
    if (!rot) return false;
    const snap = snapshot();
    remember();
    const next = rot.wegpunkte;
    const nextLp = [...lp.slice(at), ...lp.slice(0, at)];
    abort.current?.abort();
    setStep(null);
    setError(null);
    setSaveMsg(null);
    setStart(next[0]);
    setVias(next.slice(1, -1));
    setZiel(next[next.length - 1]);
    setLegProfiles(nextLp);
    plannedAs.current.set(rot, { raw: rot, profiles: nextLp.map((x) => x ?? profile), avoid: `${JSON.stringify(avoid)}|${avoidedKey()}` });
    setPlanned(rot);
    onPlanned?.();
    showToast(tr('Die Runde startet jetzt hier. Die Strecke bleibt gleich.'), { action: { label: tr('Rückgängig'), onPress: () => restore(snap) } });
    return true;
  }

  /**
   * Neuer Start abseits der Punkte einer Rundtour (Koray 19.11.2026, Große Sellaronda): Der Ort kommt dort in die
   * Runde, wo er den kleinsten Umweg macht, und wird Start und Ziel. Die Punkte sortieren sich von dort aus neu,
   * der alte Start bleibt als ein Zwischenziel stehen. Geplant werden nur die beiden Stücke am neuen Start, der
   * Rest der Strecke bleibt Punkt für Punkt gleich. false: keine geplante Runde, der Aufrufer ersetzt wie bisher.
   */
  function moveLoopStart(p: LatLon, profile: Profile, avoid: Avoid): boolean {
    const all = [start, ...vias, ziel].filter((x): x is LatLon => !!x);
    const n = all.length;
    if (!planned || !planned.linie.length || planned.wegpunkte.length !== n || n < 3) return false;
    // p steht danach vor all[k]
    const k = insertVia(all, p).indexOf(p);
    if (k < 1 || k > n - 1) return false;
    const lp = fitLegs(legProfiles, vias.length);
    const avoidKey = `${JSON.stringify(avoid)}|${avoidedKey()}`;
    const reg = plannedAs.current.get(planned);
    let from: { raw: PlannedTour; profiles: Profile[]; avoid: string } | null = null;
    if (k === n - 1) from = reg ?? { raw: planned, profiles: lp.map((x) => x ?? profile), avoid: avoidKey };
    else {
      // die Vorlage mit Stützpunkten mitdrehen, sonst passt danach keine Etappe mehr
      const kk = reg ? reg.raw.wegpunkte.findIndex((q, i) => i > 0 && i < reg.raw.wegpunkte.length - 1 && keyOf(q) === keyOf(all[k])) : -1;
      const rawRot = reg && kk > 0 ? rotateLoop(reg.raw, kk) : null;
      if (reg && rawRot) from = { raw: rawRot, profiles: [...reg.profiles.slice(kk), ...reg.profiles.slice(0, kk)], avoid: reg.avoid };
      else {
        const rot = rotateLoop(planned, k);
        if (rot) from = { raw: rot, profiles: [...lp.slice(k), ...lp.slice(0, k)].map((x) => x ?? profile), avoid: avoidKey };
      }
    }
    if (!from) return false;
    const order = [...all.slice(k, -1), ...all.slice(0, k)];
    // die geteilte Etappe gibt ihr Profil an die beiden neuen Stücke weiter
    const split = lp[k - 1] ?? null;
    const nextLp: LegProfile[] = [split, ...lp.slice(k), ...lp.slice(0, k - 1), split];
    const snap = snapshot();
    remember();
    setStart(p);
    setVias(order);
    setZiel(p);
    setLegProfiles(nextLp);
    void plan([p, ...order, p], nextLp.map((x) => x ?? profile), avoid, name, false, from);
    showToast(tr('Die Runde startet jetzt hier. Der Rest der Strecke bleibt gleich.'), { action: { label: tr('Rückgängig'), onPress: () => restore(snap) } });
    return true;
  }

  /** Punkt in ein Feld setzen: Start, Ziel oder Zwischenziel an Stelle index (am Ende: neu). */
  function setSlot(kind: PointKind, p: LatLon, profile: Profile, avoid: Avoid, known?: string, index?: number) {
    if (kind === 'via' && (index == null || index >= vias.length)) {
      insertAt(vias.length, p, profile, avoid, known);
      return;
    }
    rememberName(p, known);
    // Rundtour: liegt der neue Start auf einem Zwischenziel, dreht sich die Runde dorthin (restart). Sonst kommt er
    // an der passenden Stelle in die Runde und sie beginnt dort (moveLoopStart)
    if (kind === 'start' && start && ziel && keyOf(start) === keyOf(ziel) && vias.length && (restart(p, profile, avoid) || moveLoopStart(p, profile, avoid))) return;
    if (kind === 'start') apply(p, vias, ziel, legProfiles, profile, avoid);
    else if (kind === 'ziel') apply(start, vias, p, legProfiles, profile, avoid);
    else {
      const v = [...vias];
      v[index!] = p;
      apply(start, v, ziel, legProfiles, profile, avoid);
    }
  }

  /**
   * Gezogenes Zwischenziel (Koray 11.11.): an die neue Stelle, und dorthin in der Reihenfolge, wo es den
   * kleinsten Umweg macht. Zieht man die 2 hinter die 3, wird sie zur 3, statt eine Schleife zu erzwingen.
   */
  function dragVia(i: number, p: LatLon, profile: Profile, avoid: Avoid) {
    if (!start || !ziel || i < 0 || i >= vias.length) return;
    rememberName(p);
    const rest = vias.filter((_, k) => k !== i);
    const full = insertVia([start, ...rest, ziel], p);
    const at = Math.max(0, full.indexOf(p) - 1);
    const v = [...rest];
    v.splice(at, 0, p);
    // Profile je Etappe bleiben an ihrer Stelle; beim Umsortieren passt die Zahl wieder
    apply(start, v, ziel, fitLegs(legProfiles, v.length), profile, avoid);
  }

  /** Von der Karte oder für Stopps: Zwischenziel dort einfügen, wo es den kleinsten Umweg macht. */
  function add(kind: PointKind, p: LatLon, profile: Profile, avoid: Avoid, known?: string) {
    // Neues Ziel von der Karte verlängert die Tour: das bisherige Ziel wird letztes Zwischenziel (Tester Gregor 10.11.).
    // Das Feld Ziel im Blatt ersetzt weiterhin (setSlot).
    if (kind === 'ziel' && start && ziel) {
      rememberName(p, known);
      const lp = fitLegs(legProfiles, vias.length);
      apply(start, [...vias, ziel], p, [...lp, lp[lp.length - 1] ?? null], profile, avoid);
      return;
    }
    if (kind !== 'via' || !start || !ziel) {
      setSlot(kind === 'via' && !start ? 'start' : kind === 'via' && !ziel ? 'ziel' : kind, p, profile, avoid, known);
      return;
    }
    const full = insertVia([start, ...vias, ziel], p);
    insertAt(full.indexOf(p) - 1, p, profile, avoid, known);
  }

  /** Speichert und liefert die ID in Meine Touren, null wenn es nicht geklappt hat */
  /** asName: Name aus dem Dialog beim ersten Speichern, gilt sofort (der Zustand kommt erst danach an) */
  /** quiet: ohne Toast (automatisches Speichern im Web Planer); die App ruft ohne opts auf, dort bleibt alles gleich */
  /** asCopy: als neue Tour neben der geöffneten speichern, die geöffnete bleibt unverändert (Zurück mit Änderungen) */
  async function save(curves: number, profile: Profile, avoid: Avoid, asName?: string, opts?: { quiet?: boolean; asCopy?: boolean }): Promise<string | null> {
    if (!planned) return null;
    const nm = asName ?? name;
    // Aus der Community geöffnet und die Strecke geändert: als abgewandelt merken (erst dann lässt sie sich veröffentlichen)
    // Herkunft aus dem Laden: die neu geplante Tour trägt sie nicht mehr
    const src = origin.current ?? {};
    // nur Punkte und Profile zählen, ein neuer Name ist keine Änderung der Strecke
    const routeChanged = loaded !== null && loaded !== sigOf(pts, (JSON.parse(loaded) as [unknown, string])[1], legProfiles);
    const varied = origin.current ? { author: src.author, communityId: src.communityId, edited: src.edited || routeChanged || undefined } : {};
    if (opts?.asCopy) {
      try {
        const namen = pts.map((p) => names[keyOf(p)] ?? '');
        // Als neue Tour (Koray 16.11.): „Name 2“, „Name 3“ statt „Kopie“
        const base0 = (nm.trim() || planned.name).replace(/\s+(Kopie(\s+\d+)?|\d+)$/, '');
        const taken = new Set(readLibrary().map((t) => t.name));
        let n = 2;
        while (taken.has(`${base0} ${n}`)) n++;
        const copy = saveTour({ ...planned, ...varied, name: `${base0} ${n}`.slice(0, 120), curves, profile, namen, etappen: legProfiles }, folder);
        void syncLibrary();
        if (!opts.quiet) showToast(`${copy.name} gespeichert`);
        return copy.id;
      } catch (e) {
        showToast(tr('Speichern hat nicht geklappt: {v0}', { v0: e instanceof Error ? e.message : String(e) }), { tone: 'error' });
        return null;
      }
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      // auf dem Gerät speichern (Meine Touren), angemeldet auch ins Konto
      // Namen der Punkte und Profile der Etappen mitspeichern, sonst kommen beim Öffnen nur Ortsnamen
      // aus der Rückwärtssuche zurück (aus "Sellajoch" wurde "Kanzenei", 6.11.)
      const namen = pts.map((p) => names[keyOf(p)] ?? '');
      const saved = saveTour({ ...planned, ...varied, name: nm.trim() || planned.name, curves, profile, namen, etappen: legProfiles }, folder, cloudId ?? undefined);
      setCloudId(saved.id);
      setBase(sigOf(pts, nm, legProfiles));
      setLoaded(sigOf(pts, nm, legProfiles));
      if (asName != null) setName(asName);
      void syncLibrary();
      setSaveMsg(null);
      if (!opts?.quiet) showToast(t('Unter Touren gespeichert'), { action: { label: tr('Ansehen'), onPress: () => router.navigate('/touren') } });
      return saved.id;
    } catch (e) {
      setSaveMsg(null);
      if (opts?.quiet) throw e;
      showToast(tr('Speichern hat nicht geklappt: {v0}', { v0: e instanceof Error ? e.message : String(e) }), { tone: 'error' });
      return null;
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    forget();
    abort.current?.abort();
    clearAvoidedPasses();
    origin.current = null;
    setStart(null);
    setVias([]);
    setZiel(null);
    setLegProfiles([null]);
    setPlanned(null);
    setStep(null);
    setError(null);
    setCloudId(null);
    setBase(null);
    setLoaded(null);
    setFolder('');
    setSaveMsg(null);
    setName(tr('Neue Tour'));
    // Tour geschlossen: auch die Herkunft der Zurück Navigation vergessen
    clearEditOrigin();
  }

  /** Stand des Planers, um Zurücksetzen rückgängig zu machen */
  function snapshot() {
    return { start, vias, ziel, legProfiles, names, name, planned, cloudId, folder, base, loaded };
  }
  /**
   * Verlauf für die Taste Rückgängig auf der Karte (Koray 19.11.2026): der Stand vor jeder Änderung an den Punkten,
   * höchstens 30 Schritte. Öffnen und Zurücksetzen einer Tour leeren ihn.
   */
  const history = useRef<ReturnType<typeof snapshot>[]>([]);
  const [undoSteps, setUndoSteps] = useState(0);
  function remember() {
    history.current = [...history.current.slice(-29), snapshot()];
    setUndoSteps(history.current.length);
  }
  function forget() {
    history.current = [];
    setUndoSteps(0);
  }
  function undo() {
    const last = history.current[history.current.length - 1];
    if (last) restore(last);
  }
  function restore(s: ReturnType<typeof snapshot>) {
    abort.current?.abort();
    // alles ab diesem Stand fällt aus dem Verlauf (auch wenn Rückgängig aus einem Hinweis kam)
    const at = history.current.findLastIndex((h) => h.start === s.start && h.vias === s.vias && h.ziel === s.ziel && h.planned === s.planned);
    if (at >= 0) {
      history.current = history.current.slice(0, at);
      setUndoSteps(history.current.length);
    }
    setStart(s.start);
    setVias(s.vias);
    setZiel(s.ziel);
    setLegProfiles(s.legProfiles);
    setNames(s.names);
    setName(s.name);
    setPlanned(s.planned);
    setCloudId(s.cloudId);
    setFolder(s.folder);
    setBase(s.base);
    setLoaded(s.loaded);
    setStep(null);
    setError(null);
  }

  /** Gespeicherte Tour zum Ändern laden: erster Wegpunkt Start, letzter Ziel, dazwischen Zwischenziele. Speichern ersetzt dieselbe Tour. */
  function load(t: SavedTour, profile: Profile, avoid: Avoid) {
    abort.current?.abort();
    forget();
    clearAvoidedPasses();
    origin.current = fromCommunity(t) ? { author: t.author, communityId: t.communityId, edited: t.edited } : null;
    const w = t.wegpunkte;
    const s = w[0] ?? null;
    const z = w.length > 1 ? w[w.length - 1] : null;
    const v = w.slice(1, -1);
    const lp = t.etappen && t.etappen.length === Math.max(1, w.length - 1) ? t.etappen : fitLegs([null], v.length);
    setStart(s);
    setVias(v);
    setZiel(z);
    setLegProfiles(lp);
    // gespeicherte Namen übernehmen; nur fehlende per Rückwärtssuche nachschlagen
    const known: Record<string, string> = {};
    w.forEach((p, i) => {
      const n = t.namen?.[i];
      if (n) known[keyOf(p)] = n;
    });
    setNames(known);
    setName(t.name);
    // Ohne id (Community Tour): als ungespeicherte Kopie öffnen, Speichern legt sie in Meine Touren
    setCloudId(t.id || null);
    setFolder(t.folder);
    setError(null);
    setSaveMsg(null);
    setStep(null);
    setBase(t.id ? sigOf(w, t.name, lp) : null);
    setLoaded(sigOf(w, t.name, lp));
    // Namen für Start und Ziel nachschlagen, bei wenigen Punkten auch für die Zwischenziele
    // Fehlende Namen nachschlagen: Start und Ziel sofort, Zwischenziele nach und nach (etwa einer je Sekunde),
    // damit die Ortssuche bei langen Touren nicht überlastet (Koray 11.11.). Eine neue Tour bricht ab.
    const seq = ++nameSeq.current;
    for (const p of [s, z]) if (p && !known[keyOf(p)]) rememberName(p);
    v.filter((p) => !known[keyOf(p)]).forEach((p, i) => {
      setTimeout(() => {
        if (nameSeq.current === seq) rememberName(p);
      }, (v.length <= 8 ? 150 : 1100) * (i + 1));
    });
    // Gespeicherte Strecke so zeigen, wie sie ist (importierte und Club Touren nicht neu planen).
    // Neu geplant wird erst, wenn ein Punkt verschoben oder hinzugefügt wird.
    if (t.linie.length) {
      const shown: PlannedTour = { ...t, minutes: t.minutes ?? Math.round((t.laenge_km / 55) * 60), fixes: 0 };
      // auch die gespeicherte Strecke bleibt beim Ändern stehen, wo sich nichts ändert (importierte Touren behalten ihre Linie)
      // derselbe Schlüssel wie in plan(): ohne den Teil der gemiedenen Pässe passte er nie, und die erste Änderung
      // an einer geöffneten Tour plante alles neu (gefunden 19.11.2026)
      if (w.length >= 3) {
        // Mit denselben Stützpunkten vermerken, mit denen plan() bei der nächsten Änderung vergleicht (Koray 19.11.,
        // Große Sellaronda): sonst passen an den Pässen die Punkte nicht zusammen, und fast alles wird neu geplant.
        // Liegen die Stützpunkte nicht auf der gespeicherten Linie, bleibt es bei den sichtbaren Punkten.
        const prof = lp.map((x) => x ?? profile);
        const x = expandPoints(w, prof, roads.current);
        const fits = x.xPts.length > w.length && waypointsOnLine({ ...shown, wegpunkte: x.xPts });
        plannedAs.current.set(shown, fits ? { raw: { ...shown, wegpunkte: x.xPts }, profiles: x.xProf, avoid: `${JSON.stringify(avoid)}|${avoidedKey()}` } : { raw: shown, profiles: prof, avoid: `${JSON.stringify(avoid)}|${avoidedKey()}` });
      }
      setPlanned(shown);
      onPlanned?.();
    } else if (s && z) void plan([s, ...v, z], lp.map((x) => x ?? profile), avoid, t.name);
    else setPlanned(null);
  }

  const api = {
    start, vias, ziel, complete, pts, names, name, setName, planned, step, error, cloudId, saving, saveMsg, dirty, changed,
    legProfile, setSlot, add, dragVia, insertAt, insertRoad, roadWarn, save, reset, load, snapshot, restore,
    /** Laufende Planung abbrechen, die Punkte bleiben stehen */
    cancel: () => {
      abort.current?.abort();
      setStep(null);
    },
    /** Mit den gesetzten Punkten und den Profilen je Etappe neu planen. */
    planNow: (profile: Profile, avoid: Avoid) => pts.length >= 2 && void plan(pts, profilesFor(legProfiles, start, pts.length, profile), avoid, name, true),
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
    /**
     * Punkt an Stelle idx (0 = Start, dann Zwischenziele, zuletzt Ziel) entfernen. Fällt der Start
     * weg, wird Zwischenziel 1 zum Start; fällt das Ziel weg, das letzte Zwischenziel zum Ziel.
     */
    removeAt: (idx: number, profile: Profile, avoid: Avoid) => {
      const lp = fitLegs(legProfiles, vias.length);
      if (idx === 0) {
        if (!vias.length) return apply(null, vias, ziel, legProfiles, profile, avoid);
        return apply(vias[0], vias.slice(1), ziel, lp.slice(1), profile, avoid);
      }
      if (idx === vias.length + 1) {
        if (!vias.length) return apply(start, vias, null, legProfiles, profile, avoid);
        return apply(start, vias.slice(0, -1), vias[vias.length - 1], lp.slice(0, -1), profile, avoid);
      }
      const i = idx - 1;
      apply(start, vias.filter((_, k) => k !== i), ziel, lp.filter((_, k) => k !== i + 1), profile, avoid);
    },
    /**
     * Rundtour weiterdrehen (Gregor 19.11.2026): Der Punkt an Stelle idx wird Start und Ziel, die Strecke bleibt
     * dieselbe und wird nicht neu geplant. Ohne geplante Runde: Punkte umstellen und planen wie bisher.
     */
    rotate: (idx: number, profile: Profile, avoid: Avoid) => {
      const all = [start, ...vias, ziel].filter((p): p is LatLon => !!p);
      if (all.length < 3 || idx <= 0 || idx >= all.length - 1) return;
      const lp = fitLegs(legProfiles, vias.length);
      const next = [...all.slice(idx), ...all.slice(1, idx + 1)];
      const nextLp = [...lp.slice(idx), ...lp.slice(0, idx)];
      const rot = planned && planned.wegpunkte.length === all.length ? rotateLoop(planned, idx) : null;
      if (!rot) return apply(next[0], next.slice(1, -1), next[next.length - 1], nextLp, profile, avoid);
      remember();
      abort.current?.abort();
      setStep(null);
      setError(null);
      setStart(next[0]);
      setVias(next.slice(1, -1));
      setZiel(next[next.length - 1]);
      setLegProfiles(nextLp);
      plannedAs.current.set(rot, { raw: rot, profiles: nextLp.map((x) => x ?? profile), avoid: `${JSON.stringify(avoid)}|${avoidedKey()}` });
      setPlanned(rot);
      onPlanned?.();
    },
    swap: (profile: Profile, avoid: Avoid) => apply(ziel, [...vias].reverse(), start, [...fitLegs(legProfiles, vias.length)].reverse(), profile, avoid),
  };
  /**
   * Zwischenziel an Stelle idx (0 = Start) als Start oder Ziel setzen, aus der Liste und aus der Karte.
   * Der bisherige Start oder das bisherige Ziel wird Zwischenziel, nichts geht verloren (Koray 19.11.2026).
   * In einer Rundtour dreht „start“ die Runde, die Strecke bleibt gleich: dann kommt true zurück.
   */
  function viaAs(idx: number, as: 'start' | 'ziel', profile: Profile, avoid: Avoid): boolean {
    const all = [start, ...vias, ziel].filter((p): p is LatLon => !!p);
    if (idx <= 0 || idx >= all.length - 1) return false;
    const loop = !!start && !!ziel && keyOf(start) === keyOf(ziel);
    if (loop && as === 'start') {
      api.rotate(idx, profile, avoid);
      return true;
    }
    const rest = all.map((_, k) => k).filter((k) => k !== idx);
    api.reorder(as === 'start' ? [idx, ...rest] : [...rest, idx], profile, avoid);
    return false;
  }
  return { ...api, viaAs, undo, canUndo: undoSteps > 0 };
}
