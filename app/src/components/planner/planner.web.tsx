/**
 * Web Planer (Desktop und schmale Fenster): Karte und Seitenleiste mit denselben Bereichen wie die App:
 * Planen (Tour planen und Rundtour), Meine Touren, Community und Einstellungen.
 * Expo nimmt diese Datei nur im Browser; auf dem Handy gilt planner.tsx.
 *
 * Aufteilung: Route in web-route-panel (Zustand aus use-tour-plan.ts wie in der App), Rundtour in
 * web-create-panels, Ergebnis in web-result, Meine Touren in web-library, Community in web-community,
 * Einstellungen in web-settings, Karteneinstellungen in web-map-settings, Ebenen und Bausteine in web-ui,
 * Kartenebenen in map-web, Styles in web-styles.
 * Breiter als 760 px: Karte links, Seitenleiste rechts. Schmaler: Karte oben, Seitenleiste darunter.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { checkLine } from '@/lib/check';
import { type PlannedTour as LibPlannedTour } from '@/lib/plan';
import { tourFun } from '@/lib/fun-score';
import { reverseName } from '@/lib/geocode';
import { flatten, haversine, normProfile, parseRouteFile, type LatLon, type Profile, type Tour } from '@/lib/tour';
import { countCurves, resample } from '@/lib/stats';
import { cumoAvailable } from '@/lib/cumo-routing';
import { listDriveTracks } from '@/lib/drives';
import { saveTour, syncLibrary, useLibrary, type SavedTour } from '@/lib/library';
import { useMapSettings } from '@/lib/map-settings';
import { routeCheck } from '@/components/ui/fun-pill';
import { distToProbe, passesNearRoute, probeLine } from '@/lib/route-edit';
import { DEFAULT_AVOID, type Avoid } from '@/lib/valhalla';
import { useRide } from '@/lib/group/ride';
import { passState, usePassLive } from '@/lib/pass-live';
import { photoGroupsGeoJson, usePhotoGroups, type PhotoGroup } from '@/lib/photos';
import { PASSES, passesAlong, passesGeoJson, passPoint, passSummary, type Pass } from '@/lib/passes';
import { encodeTour, shareUrl } from '@/lib/share-code';
import { exportTour } from '@/lib/route-file';
import { deleteTour, duplicateTour } from '@/lib/library';
import { showToast } from '@/lib/toast';
import { Colors } from '@/constants/theme';

import {
  addBackgroundLines,
  addCommunityLayers,
  addMemberLayers,
  addPassLayers,
  addPhotoLayers,
  addSatelliteLayer,
  addTourLayers,
  addWarningLayer,
  applyMapStyle,
  boundsOf,
  communityGeoJson,
  hoverGeoJson,
  linesGeoJson,
  loadMapLibre,
  MAP_STYLE,
  pointsGeoJson,
  tourGeoJson,
  warningsGeoJson,
  type MapInstance,
} from './map-web';

import { EMPTY_TOUR, keyOf, passIndex, samePts, STEP_TEXT } from './planner-shared';
import { useTourPlan } from './use-tour-plan';
import { C, type PlannedTour } from './web-shared';
import { Gallery } from './web-tour-panels';
import { GroupPanel } from './web-account-panels';
import { RoundResult, RoundTripPanel, useRoundTrip } from './web-create-panels';
import { RoutePanel } from './web-route-panel';
import { StatusLine, useElevation } from './web-result';
import { LibraryPanel } from './web-library';
import { CommunityPanel, type CommunityPin } from './web-community';
import { SettingsPanel } from './web-settings';
import { MapSettingsButton } from './web-map-settings';
import { Accordion, Brand, Status, TypoTabs } from './web-parts';
import { FunDialog } from './web-fun';
import { ConfirmSheet, MoreMenu, useNarrow } from './web-ui';
import { S } from './web-styles';

type Area = 'planen' | 'touren' | 'community' | 'einstellungen';
type PlanMode = 'tour' | 'rundtour';
type MapMenu = { x: number; y: number; p: LatLon; pass?: Pass } | null;

const AREAS: { id: Area; label: string }[] = [
  { id: 'planen', label: 'Planen' },
  { id: 'touren', label: 'Touren' },
  { id: 'community', label: 'Community' },
];

export default function Planner() {
  const narrow = useNarrow();
  const mapEl = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapInstance | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const settings = useMapSettings();

  const [area, setArea] = useState<Area>('planen');
  const [mode, setMode] = useState<PlanMode>('tour');
  const [menu, setMenu] = useState<MapMenu>(null);
  const [rtStart, setRtStart] = useState<{ p: LatLon; name: string } | null>(null);
  const [ownServer, setOwnServer] = useState<boolean | null>(null);
  const profile: Profile = 'kurvig';
  const [avoid, setAvoid] = useState<Avoid>(DEFAULT_AVOID);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [funOpen, setFunOpen] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const sideEl = useRef<HTMLElement | null>(null);
  const shownRef = useRef<Tour | null>(null);
  const scrollEl = useRef<HTMLDivElement | null>(null);

  // Eigenen Routing Server suchen (alle 30 Sekunden erneut)
  useEffect(() => {
    let alive = true;
    const probe = () => cumoAvailable().then((ok) => alive && setOwnServer(ok));
    probe();
    const t = setInterval(probe, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const fitLine = useCallback((pts: LatLon[]) => {
    const m = map.current;
    const b = boundsOf(pts);
    if (m && b) m.fitBounds(b, { padding: 60, duration: 600, maxZoom: 13 });
  }, []);
  const fitTour = useCallback((t: Tour) => fitLine(flatten(t).map((x) => x.p)), [fitLine]);

  /* ---------- Route (wie in der App: use-tour-plan) ---------- */
  const plan = useTourPlan();
  /** Letzte Änderung kam über einen Klick auf die Karte: Ausschnitt bleibt stehen */
  const mapEdit = useRef(false);
  /** Erst nach einer eigenen Änderung speichern wir automatisch (geöffnete Community Touren nicht) */
  const [edited, setEdited] = useState(false);
  const touch = useCallback(() => {
    setEdited(true);
    mapEdit.current = false;
  }, []);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const routeTour: LibPlannedTour | null = plan.planned && samePts(plan.planned.wegpunkte, plan.pts) ? plan.planned : null;

  /* ---------- Rundtour ---------- */
  const round = useRoundTrip({ setBusy, setError, onShow: fitTour });
  const roundTour = round.current?.tour ?? null;

  // Was die Karte gerade zeigt
  const shownTour: PlannedTour | null = area === 'community' ? null : mode === 'rundtour' && area === 'planen' ? roundTour : routeTour;
  const line = useMemo(() => (shownTour ? flatten(shownTour).map((x) => x.p) : []), [shownTour]);
  useEffect(() => {
    shownRef.current = shownTour;
  });
  const curves = useMemo(() => (line.length > 1 ? countCurves(line) : 0), [line]);
  const routeLine = useMemo(() => (routeTour ? flatten(routeTour).map((x) => x.p) : []), [routeTour]);
  const routeFun = useMemo(() => (routeLine.length > 1 ? tourFun(routeLine) : null), [routeLine]);
  const fun = mode === 'rundtour' && area === 'planen' ? (round.current?.fun ?? null) : routeFun;
  const elev = useElevation(line);

  // Neue Route geplant: Ausschnitt anpassen, außer der Punkt kam gerade von der Karte
  useEffect(() => {
    if (!plan.planned) return;
    if (!mapEdit.current) fitTour(plan.planned);
    // nur bei neuer Planung
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.planned]);

  // Automatisch speichern (Koray 8.11.): jede eigene Änderung landet ohne Knopf in Meine Touren und in der App
  const curvesRoute = useMemo(() => (routeLine.length > 1 ? countCurves(routeLine) : 0), [routeLine]);
  useEffect(() => {
    if (!edited || !routeTour || plan.step || !plan.dirty) return;
    const t = setTimeout(() => {
      setSaveState('saving');
      plan
        .save(curvesRoute, profile, avoid, autoName(plan), { quiet: true })
        .then((id) => setSaveState(id ? 'idle' : 'error'))
        .catch(() => setSaveState('error'));
    }, 900);
    return () => clearTimeout(t);
    // plan.save liest den aktuellen Stand selbst
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edited, routeTour, plan.dirty, plan.step, plan.name]);

  /* ---------- Karte ---------- */
  useEffect(() => {
    let cancelled = false;
    loadMapLibre()
      .then((ml) => {
        if (cancelled || !mapEl.current) return;
        const m = new ml.Map({ container: mapEl.current, style: MAP_STYLE, center: [8.9, 49.4], zoom: 7, attributionControl: { compact: true } });
        m.addControl(new ml.NavigationControl({ showCompass: false }), 'bottom-right');
        m.on('load', () => {
          addSatelliteLayer(m);
          addTourLayers(m);
          addBackgroundLines(m);
          addPassLayers(m, passesGeoJson([], new Date().getMonth() + 1));
          addPhotoLayers(m);
          addWarningLayer(m);
          addMemberLayers(m);
          addCommunityLayers(m);
          for (const layer of ['pass-circle', 'photo-circle', 'community-circle']) {
            m.on('mouseenter', layer, () => (m.getCanvas().style.cursor = 'pointer'));
            m.on('mouseleave', layer, () => (m.getCanvas().style.cursor = ''));
          }
          setMapReady(true);
        });
        map.current = m;
      })
      .catch((e: Error) => setMapError(e.message));
    return () => {
      cancelled = true;
      map.current?.remove();
    };
  }, []);

  // Neuer Bereich beginnt oben; zurück im Planen zeigt die Karte die Tour wieder ganz
  useEffect(() => {
    if (sideEl.current) sideEl.current.scrollTop = 0;
    if (scrollEl.current) scrollEl.current.scrollTop = 0;
  }, [area, mode]);
  useEffect(() => {
    if (area === 'planen' && shownRef.current) fitTour(shownRef.current);
    // nur beim Wechsel des Bereichs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area]);

  // Größe der Karte folgt dem Layout (schmal und breit)
  useEffect(() => {
    map.current?.resize();
  }, [narrow, mapReady]);

  useEffect(() => {
    if (mapReady && map.current) applyMapStyle(map.current, settings.style);
  }, [mapReady, settings.style]);

  // Tour und Punkte zeichnen
  const ptsKey = plan.pts.map(keyOf).join('|');
  const shownPts = useMemo(
    () => (area === 'community' ? [] : mode === 'tour' || area !== 'planen' ? plan.pts : roundTour ? [roundTour.wegpunkte[0]] : rtStart ? [rtStart.p] : []),
    // plan.pts ist bei jedem Rendern neu, ptsKey ändert sich nur mit den Punkten
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [area, mode, ptsKey, roundTour, rtStart],
  );
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return;
    m.getSource('tour')?.setData(tourGeoJson(shownTour ?? EMPTY_TOUR));
    m.getSource('wp')?.setData(pointsGeoJson(shownPts));
    m.getSource('warn')?.setData(warningsGeoJson(settings.warnings && shownTour ? shownTour : EMPTY_TOUR));
  }, [shownTour, mapReady, settings.warnings, shownPts]);

  // Pässe nach den Karteneinstellungen: aus, um die Tour (50 km) oder alle
  const live = usePassLive();
  const passRef = useMemo(() => [...shownPts, ...(line.length ? resample(line, 4000) : [])], [shownPts, line]);
  const shownPasses = useMemo(() => {
    if (!settings.passes) return [];
    if (settings.passesAll) return PASSES;
    if (!passRef.length) return [];
    return PASSES.filter((ps) => {
      const p = passPoint(ps);
      return passRef.some((q) => Math.abs(q[0] - p[0]) < 0.5 && haversine(q, p) <= 50000);
    });
  }, [settings.passes, settings.passesAll, passRef]);
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return;
    m.getSource('passes')?.setData(passesGeoJson(shownPasses, new Date().getMonth() + 1, live ? (p) => passState(p, live).closed : undefined));
  }, [mapReady, shownPasses, live]);

  // Meine Touren und gefahrene Strecken als feine Linien
  const library = useLibrary();
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return;
    const lines = settings.myTours ? library.map((t) => resample(flatten(t).map((x) => x.p), 300)) : [];
    m.getSource('mine')?.setData(linesGeoJson(lines));
  }, [mapReady, settings.myTours, library]);
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return;
    if (!settings.drives) {
      m.getSource('drives')?.setData(linesGeoJson([]));
      return;
    }
    let alive = true;
    listDriveTracks()
      .then((list) => alive && m.getSource('drives')?.setData(linesGeoJson(list.map((d) => d.p))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [mapReady, settings.drives]);

  // Gruppenfahrt: Mitfahrer live
  const ride = useRide();
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return;
    const now = Date.now();
    m.getSource('members')?.setData({
      type: 'FeatureCollection',
      features: ride.members
        .filter((x) => x.p)
        .map((x) => ({
          type: 'Feature',
          properties: { initial: x.name.slice(0, 1).toUpperCase(), name: x.id === ride.me?.id ? 'Du' : x.name, role: x.role, stale: !x.seenAt || now - x.seenAt > 60000 },
          geometry: { type: 'Point', coordinates: [x.p![1], x.p![0]] },
        })),
    });
  }, [mapReady, ride.members, ride.me?.id]);

  // Community Pins
  const [pins, setPins] = useState<CommunityPin[]>([]);
  const [selPin, setSelPin] = useState<string | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return;
    m.getSource('community')?.setData(communityGeoJson(area === 'community' ? pins : [], selPin));
  }, [mapReady, pins, selPin, area]);
  const pinsKey = pins.map((p) => p.id).join();
  useEffect(() => {
    if (area === 'community' && pins.length) fitLine(pins.map((p) => p.p));
    // nur wenn sich die Auswahl der Pins ändert
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, pinsKey]);

  // Fotospots an der Strecke
  const photoGroups = usePhotoGroups();
  const [showPhotos, setShowPhotos] = useState(true);
  const [gallery, setGallery] = useState<{ g: PhotoGroup; i: number | null } | null>(null);
  const probe = useMemo(() => probeLine(line), [line]);
  const photosOnRoute = useMemo(() => (photoGroups && probe.length > 1 ? photoGroups.filter((g) => distToProbe(probe, g.p) <= 1500) : []), [photoGroups, probe]);
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return;
    m.getSource('photos')?.setData(photoGroupsGeoJson(showPhotos ? photosOnRoute : []));
  }, [mapReady, photosOnRoute, showPhotos]);

  const passesOnRoute = useMemo(() => passesAlong(PASSES, routeLine), [routeLine]);
  const routeProbe = useMemo(() => probeLine(routeLine), [routeLine]);
  const passesNear = useMemo(() => passesNearRoute(PASSES, routeProbe, passesOnRoute), [routeProbe, passesOnRoute]);

  const hoverLine = useMemo(() => resample(line, 100), [line]);
  const onHoverKm = useCallback(
    (km: number | null) => {
      const m = map.current;
      if (!mapReady || !m) return;
      const p = km === null ? null : (hoverLine[Math.min(hoverLine.length - 1, Math.round((km * 1000) / 100))] ?? null);
      m.getSource('hover')?.setData(hoverGeoJson(p));
    },
    [mapReady, hoverLine],
  );
  const flyTo = useCallback((p: LatLon) => map.current?.flyTo({ center: [p[1], p[0]], zoom: 12, duration: 800 }), []);

  /** Punkt in die Route: Start, Zwischenziel (kleinster Umweg) oder Ziel */
  const addPoint = useCallback(
    async (kind: 'start' | 'via' | 'ziel' | 'rundtour', p: LatLon, name?: string) => {
      if (kind === 'rundtour') {
        setRtStart({ p, name: name ?? (await reverseName(p)) });
        round.discard();
        setArea('planen');
        setMode('rundtour');
        return;
      }
      setArea('planen');
      setMode('tour');
      setEdited(true);
      mapEdit.current = true;
      plan.add(kind, p, profile, avoid, name);
    },
    [plan, avoid, round],
  );

  // Klick auf die Karte
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return;
    const box = (pt: { x: number; y: number }, r: number) => [[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]];
    const onClick = (e: { lngLat: { lat: number; lng: number }; point: { x: number; y: number } }) => {
      if (menu) {
        setMenu(null);
        return;
      }
      if (area === 'community') {
        const hit = m.queryRenderedFeatures(box(e.point, 10), { layers: ['community-circle'] })[0];
        if (hit) setSelPin(hit.properties.id);
        return;
      }
      const ph = m.queryRenderedFeatures(box(e.point, 8), { layers: ['photo-circle'] })[0];
      const group = ph ? photoGroups?.find((g) => g.key === ph.properties.key) : undefined;
      if (group) {
        setGallery({ g: group, i: null });
        return;
      }
      const hit = m.queryRenderedFeatures(box(e.point, 6), { layers: ['pass-circle'] })[0];
      const pass = hit ? PASSES.find((x) => x.id === hit.properties.id) : undefined;
      if (pass) {
        setMenu({ x: e.point.x, y: e.point.y, p: passPoint(pass), pass });
        return;
      }
      if (area !== 'planen' || plan.step || busy) return;
      const p: LatLon = [e.lngLat.lat, e.lngLat.lng];
      if (mode === 'rundtour') {
        setMenu({ x: e.point.x, y: e.point.y, p });
        return;
      }
      // Wie in der App: erster Punkt Start, zweiter Ziel, danach fragt die schwebende Karte nach der Rolle
      if (!plan.start) void addPoint('start', p);
      else if (!plan.ziel) void addPoint('ziel', p);
      else setMenu({ x: e.point.x, y: e.point.y, p });
    };
    const onContext = (e: { lngLat: { lat: number; lng: number }; point: { x: number; y: number }; preventDefault?: () => void }) => {
      e.preventDefault?.();
      if (area === 'community') return;
      setMenu({ x: e.point.x, y: e.point.y, p: [e.lngLat.lat, e.lngLat.lng] });
    };
    const onMove = () => setMenu(null);
    m.on('click', onClick);
    m.on('contextmenu', onContext);
    m.on('movestart', onMove);
    return () => {
      m.off('click', onClick);
      m.off('contextmenu', onContext);
      m.off('movestart', onMove);
    };
  }, [mapReady, mode, area, busy, plan, menu, photoGroups, addPoint]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  /** Tour aus Meine Touren oder der Community im Planer öffnen, so wie sie gespeichert ist */
  const openTour = useCallback(
    (t: SavedTour) => {
      setEdited(false);
      mapEdit.current = false;
      setArea('planen');
      setMode('tour');
      plan.load(t, normProfile(t.profile ?? 'kurvig'), avoid);
      fitTour(t);
    },
    [plan, avoid, fitTour],
  );
  const openCopy = useCallback(
    (t: Tour & { minutes?: number; author?: string; communityId?: string }, p: Profile) => {
      const now = new Date().toISOString();
      openTour({ ...t, id: '', folder: t.communityId ? 'Community' : '', createdAt: now, updatedAt: now, profile: p });
    },
    [openTour],
  );

  /** Runde anpassen: als Route mit Start, drei Zwischenzielen auf der Strecke und Ziel öffnen (wie adjustRound) */
  const adjustRound = (t: PlannedTour, p: Profile) => {
    const l = flatten(t).map((x) => x.p);
    const w = t.wegpunkte;
    const s = w[0] ?? l[0];
    const inner = w.slice(1, -1);
    const vias = inner.length ? inner : l.length > 8 ? [0.25, 0.5, 0.75].map((f) => l[Math.round((l.length - 1) * f)]) : [];
    const now = new Date().toISOString();
    openTour({ ...t, wegpunkte: [s, ...vias, s], id: '', folder: '', createdAt: now, updatedAt: now, profile: p });
    setEdited(true);
  };

  const importFile = async (file: File) => {
    let parsed: Tour;
    try {
      parsed = parseRouteFile(await file.text(), file.name);
    } catch (e) {
      showToast((e as Error).message, { tone: 'error' });
      return;
    }
    setBusy('Etappen Check läuft');
    try {
      const l = flatten(parsed).map((x) => x.p);
      const c = await checkLine(l, (d, n) => setBusy(`Etappen Check läuft (${d} von ${n})`), undefined, true);
      const saved = saveTour({ ...parsed, ...c, geprueft: true, curves: countCurves(l) }, '');
      void syncLibrary();
      showToast(`${saved.name} importiert`);
      openTour(saved);
    } catch (e) {
      showToast(`Import hat nicht geklappt: ${(e as Error).message}`, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };
  const fileRef = useRef<HTMLInputElement | null>(null);

  const step = plan.step ? STEP_TEXT[plan.step] : busy;
  const savedTour = library.find((t) => t.id === plan.cloudId) ?? null;
  const routeName = plan.name.trim() || routeTour?.name || 'Neue Tour';

  /* ---------- Darstellung ---------- */
  const mapPane = (
    <div style={narrow ? { position: 'relative', height: '40vh', minHeight: 240, flex: 'none' } : S.mapWrap}>
      <div ref={mapEl} style={S.map} aria-label="Karte" />
      {mapError ? <div style={S.mapError}>{mapError}</div> : null}
      <MapSettingsButton top={12} right={12} />
      {photosOnRoute.length && area === 'planen' ? (
        <button style={showPhotos ? S.photoToggleOn : S.photoToggle} onClick={() => setShowPhotos(!showPhotos)} aria-pressed={showPhotos}>
          Fotospots an der Strecke ({photosOnRoute.length})
        </button>
      ) : null}
      {gallery ? (
        <Gallery
          gallery={gallery}
          onChange={setGallery}
          canAdd={!plan.step}
          onAddVia={(p) => {
            setGallery(null);
            void addPoint('via', p);
          }}
        />
      ) : null}
      {area === 'planen' && mode === 'tour' && !plan.step && !narrow ? (
        <div style={S.hint}>{plan.complete ? 'Klick fragt nach der Rolle des Punkts, Rechtsklick öffnet alle Optionen' : 'Klick setzt einen Punkt, Rechtsklick öffnet alle Optionen'}</div>
      ) : null}
      {menu ? <MapMenuCard menu={menu} plan={plan} live={live} photoGroups={photoGroups} onGallery={(g) => setGallery({ g, i: null })} onClose={() => setMenu(null)} onAdd={(k, p, n) => void addPoint(k, p, n)} onRemovePass={(pass) => {
        const i = passIndex(plan.pts, pass);
        if (i >= 0) {
          setEdited(true);
          mapEdit.current = true;
          plan.removeAt(plan.start ? i : i + 1, profile, avoid);
        }
      }} /> : null}
    </div>
  );

  const nav = (
    <div style={{ ...S.nav, maxWidth: '100%' }} role="tablist" aria-label="Bereich">
      {AREAS.map((a) => (
        <button key={a.id} role="tab" aria-selected={area === a.id} style={{ ...(area === a.id ? S.navOn : S.navOff), whiteSpace: 'nowrap', flex: 1, padding: '0 10px' }} onClick={() => setArea(a.id)}>
          {a.label}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ ...S.root, flexDirection: narrow ? 'column' : 'row', height: '100vh' }}>
      {mapPane}
      {/* Schmal scrollt die ganze Seitenleiste, damit Kopf und Inhalt unter der Karte Platz haben */}
      <aside ref={sideEl} style={{ ...S.side, width: narrow ? '100%' : 440, flex: narrow ? 1 : 'none', minHeight: 0, overflowY: narrow ? 'auto' : undefined }}>
        <div style={{ ...S.brandRow, flexDirection: 'column', alignItems: 'stretch', gap: 12, padding: narrow ? '14px 16px 4px' : S.brandRow.padding }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Brand />
            {/* Einstellungen als Symbol neben der Marke, damit die Bereiche in eine Zeile passen */}
            <button
              aria-pressed={area === 'einstellungen'}
              aria-label="Einstellungen"
              title="Einstellungen"
              onClick={() => setArea('einstellungen')}
              style={{ width: 44, height: 44, borderRadius: 22, border: 'none', background: area === 'einstellungen' ? C.surface2 : C.surface, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke={area === 'einstellungen' ? C.text : C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
            </button>
          </div>
          {nav}
        </div>
        {area === 'planen' ? (
          <TypoTabs
            value={mode}
            options={[
              { id: 'tour', label: 'Tour planen' },
              { id: 'rundtour', label: 'Rundtour' },
            ]}
            onChange={(v) => setMode(v)}
          />
        ) : null}
        {area === 'planen' && step ? <Status text={step} onCancel={() => (plan.step ? plan.cancel() : round.cancel())} /> : null}
        {area === 'planen' && error && mode === 'rundtour' ? <div style={S.error}>{error}</div> : null}

        <div ref={scrollEl} style={narrow ? { ...S.scroll, flex: 'none', overflowY: 'visible', padding: '16px 16px 32px' } : S.scroll}>
          {area === 'planen' && mode === 'tour' ? (
            <>
              <RoutePanel
                plan={plan}
                profile={profile}
                avoid={avoid}
                setAvoid={setAvoid}
                touch={touch}
                routeTour={routeTour}
                line={routeLine}
                curves={curves}
                fun={routeFun}
                onFun={() => setFunOpen(true)}
                elev={elev}
                onFly={flyTo}
                onHoverKm={onHoverKm}
                passes={passesOnRoute}
                passesNear={passesNear}
                live={live}
                near={plan.pts[plan.pts.length - 1]}
              />
              {routeTour ? (
                <div style={{ marginTop: 18 }}>
                  <Accordion label="Gruppenfahrt" summary="Code für die Gruppe, Live Positionen">
                    <GroupPanel tour={routeTour} profile={profile} avoid={avoid} isSample={false} />
                  </Accordion>
                </div>
              ) : null}
            </>
          ) : null}
          {area === 'planen' && mode === 'rundtour' ? (
            round.current ? (
              <RoundResult round={round} line={line} busy={!!busy} narrow={narrow} onFun={() => setFunOpen(true)} onFly={flyTo} onHoverKm={onHoverKm} elev={elev} onAdjust={adjustRound} />
            ) : (
              <RoundTripPanel
                key={rtStart ? rtStart.p.join(',') : 'leer'}
                initialStart={rtStart}
                center={() => {
                  const c = map.current?.getCenter();
                  return c ? ([c.lat, c.lng] as LatLon) : null;
                }}
                profile={profile}
                setProfile={() => undefined}
                avoid={avoid}
                setAvoid={setAvoid}
                busy={!!busy}
                onCreate={(req) => {
                  setRtStart(req.start);
                  round.create(req);
                }}
              />
            )
          ) : null}
          {area === 'touren' ? (
            <>
              <LibraryPanel currentId={plan.cloudId} onOpen={openTour} onPlan={() => setArea('planen')} narrow={narrow} />
              <div style={{ marginTop: 18 }}>
                <button style={{ ...S.link, color: C.muted }} disabled={!!busy} onClick={() => fileRef.current?.click()}>
                  GPX oder KML importieren
                </button>
                {busy ? <p style={S.muted}>{busy}</p> : null}
              </div>
              <input
                ref={fileRef}
                id="gpx-file"
                type="file"
                accept=".gpx,.kml,application/gpx+xml,application/vnd.google-earth.kml+xml"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                  e.target.value = '';
                }}
              />
            </>
          ) : null}
          {area === 'community' ? (
            <CommunityPanel
              selected={selPin}
              onSelect={(id, p) => {
                setSelPin(id);
                if (p) flyTo(p);
              }}
              onPins={setPins}
              onOpenTour={openCopy}
              onSettings={() => setArea('einstellungen')}
            />
          ) : null}
          {area === 'einstellungen' ? <SettingsPanel narrow={narrow} /> : null}
        </div>

        {/* Route: eine Zeile mit dem Stand des Speicherns, Seltenes im Menü ⋯ */}
        {area === 'planen' && mode === 'tour' && routeTour ? (
          <div style={{ ...S.actionBar, alignItems: 'center', ...(narrow ? { padding: '12px 16px 16px', position: 'sticky', bottom: 0, zIndex: 5 } : {}) }}>
            {plan.cloudId || edited ? (
              <span style={{ flex: 1, minWidth: 0 }}>
                {saveState === 'error' ? (
                  <StatusLine tone="warn" text="Speichern hat nicht geklappt, wir versuchen es bei der nächsten Änderung erneut." />
                ) : plan.dirty || saveState === 'saving' ? (
                  <StatusLine tone="muted" text="Wird gespeichert …" />
                ) : (
                  <StatusLine tone="good" text="Gespeichert, in der App unter Touren." />
                )}
              </span>
            ) : (
              <button
                style={S.primary}
                onClick={() => {
                  setEdited(true);
                  void plan.save(curvesRoute, profile, avoid, autoName(plan), { quiet: true }).then(() => showToast('Unter Touren gespeichert, auch in der App'));
                }}>
                Unter Touren speichern
              </button>
            )}
            <MoreMenu
              label="Weitere Aktionen"
              up
              items={[
                {
                  key: 'link',
                  label: 'Link kopieren',
                  onPress: () =>
                    void navigator.clipboard
                      ?.writeText(`${routeName}\n${shareUrl(encodeTour({ ...routeTour, name: routeName, namen: routeTour.wegpunkte.map((p) => plan.names[keyOf(p)] ?? "") }, profile, { full: true }))}`)
                      .then(() => showToast('Link kopiert'))
                      .catch(() => showToast('Kopieren hat nicht geklappt', { tone: 'error' })),
                },
                { key: 'gpx', label: 'Als GPX herunterladen', onPress: () => void exportTour({ ...routeTour, name: routeName }, 'gpx') },
                { key: 'kml', label: 'Als KML herunterladen', onPress: () => void exportTour({ ...routeTour, name: routeName }, 'kml') },
                ...(plan.cloudId
                  ? [
                      {
                        key: 'dup',
                        label: 'Duplizieren',
                        onPress: () => {
                          const c = plan.cloudId ? duplicateTour(plan.cloudId) : null;
                          if (!c) return;
                          openTour(c);
                          showToast(`${c.name} angelegt, du bearbeitest jetzt die Kopie`);
                        },
                      },
                      { key: 'close', label: 'Tour schließen', onPress: () => plan.reset() },
                      { key: 'del', label: 'Route löschen', danger: true, onPress: () => setAskDelete(true) },
                    ]
                  : [{ key: 'reset', label: 'Planung verwerfen', danger: true, onPress: () => plan.reset() }]),
              ]}
            />
          </div>
        ) : null}
        <div style={{ ...S.engine, padding: narrow ? '0 16px 12px' : S.engine.padding }}>
          <span style={{ ...S.dot, background: ownServer ? C.good : C.muted }} />
          {ownServer === null ? 'Routing wird gesucht' : ownServer ? 'Eigener Routing Server' : 'Öffentliches Routing, eigener Server gerade nicht erreichbar'}
        </div>
      </aside>
      {funOpen && fun ? (
        <FunDialog
          fun={fun}
          name={mode === 'rundtour' ? (roundTour?.name ?? '') : routeName}
          elev={elev}
          onHoverKm={onHoverKm}
          check={shownTour ? routeCheck(shownTour.warnungen.filter((w) => w.klasse !== 'ok').length, shownTour.geprueft !== false) : null}
          onClose={() => setFunOpen(false)}
        />
      ) : null}
      {askDelete && savedTour ? (
        savedTour.published ? (
          <ConfirmSheet
            narrow={narrow}
            title="Auch die veröffentlichte Route löschen?"
            text={`${savedTour.name} steht in der Community. Löschen nimmt sie auch dort heraus. Nur bei dir entfernen geht unter Touren.`}
            confirmLabel="Überall löschen"
            onClose={() => setAskDelete(false)}
            onConfirm={() => deleteSaved(savedTour, plan.reset, () => setAskDelete(false))}
          />
        ) : (
          <ConfirmSheet
            narrow={narrow}
            title="Möchtest du diese Tour wirklich löschen?"
            text={`${savedTour.name} verschwindet aus dem Web Planer, der App und deinem Konto.`}
            confirmLabel="Löschen"
            onClose={() => setAskDelete(false)}
            onConfirm={() => deleteSaved(savedTour, plan.reset, () => setAskDelete(false))}
          />
        )
      ) : null}
    </div>
  );
}

/**
 * Name beim ersten automatischen Speichern: ohne eigenen Namen aus Start und Ziel (in der App fragt ein Dialog),
 * zum Beispiel "Heppenheim nach Hirschhorn" oder "Rundtour ab Bensheim". Danach bleibt der Name, wie er ist.
 */
function autoName(plan: ReturnType<typeof useTourPlan>): string | undefined {
  const n = plan.name.trim();
  if (n && n !== 'Neue Tour') return undefined;
  const s = plan.start ? plan.names[keyOf(plan.start)] : null;
  const z = plan.ziel ? plan.names[keyOf(plan.ziel)] : null;
  if (!s || !z) return undefined;
  const short = (x: string) => x.split(',')[0].trim();
  return plan.start && plan.ziel && haversine(plan.start, plan.ziel) < 1500 ? `Rundtour ab ${short(s)}` : `${short(s)} nach ${short(z)}`;
}

function deleteSaved(t: SavedTour, reset: () => void, close: () => void) {
  deleteTour(t.id);
  close();
  reset();
  showToast(t.published ? 'Tour gelöscht, auch in der Community' : 'Tour gelöscht');
}

/** Schwebende Karte über der Karte: angetippter Pass oder neuer Punkt, Aktionen direkt auf die Route */
function MapMenuCard(props: {
  menu: NonNullable<MapMenu>;
  plan: ReturnType<typeof useTourPlan>;
  live: ReturnType<typeof usePassLive>;
  photoGroups: PhotoGroup[] | null;
  onGallery: (g: PhotoGroup) => void;
  onClose: () => void;
  onAdd: (k: 'start' | 'via' | 'ziel' | 'rundtour', p: LatLon, name?: string) => void;
  onRemovePass: (pass: Pass) => void;
}) {
  const { menu, plan } = props;
  const pass = menu.pass;
  const inRoute = pass ? passIndex(plan.pts, pass) >= 0 : false;
  const photos = pass ? (props.photoGroups ?? []).filter((g) => g.pass?.id === pass.id) : [];
  const [name, setName] = useState<string | null>(pass?.name ?? null);
  useEffect(() => {
    if (pass) return;
    let alive = true;
    reverseName(menu.p)
      .then((n) => alive && setName(n))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [menu.p, pass]);
  const act = (k: 'start' | 'via' | 'ziel' | 'rundtour') => {
    props.onClose();
    props.onAdd(k, menu.p, name ?? undefined);
  };
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const left = Math.max(8, Math.min(menu.x, vw - 260));
  return (
    <div style={{ ...S.menu, left, top: menu.y + 8 }} role="menu" onContextMenu={(e) => e.preventDefault()}>
      <div style={S.menuHead}>
        <b>{pass ? pass.name : (name ?? 'Neuer Punkt')}</b>
        {pass ? <span style={S.dropDetail}>{passSummary(pass, undefined, passState(pass, props.live).note)}</span> : <span style={S.dropDetail}>{`${menu.p[0].toFixed(4)}, ${menu.p[1].toFixed(4)}`}</span>}
        {pass?.car_note ? <span style={S.dropDetail}>{pass.car_note}</span> : null}
      </div>
      {photos.length ? (
        <button
          role="menuitem"
          style={S.menuItem}
          onClick={() => {
            props.onGallery({ ...photos[0], photos: photos.flatMap((g) => g.photos) });
            props.onClose();
          }}>
          Fotos ansehen ({photos.reduce((n, g) => n + g.photos.length, 0)})
        </button>
      ) : null}
      {inRoute && pass ? (
        <button
          role="menuitem"
          style={{ ...S.menuItem, color: Colors.stopText }}
          onClick={() => {
            props.onClose();
            props.onRemovePass(pass);
          }}>
          Aus der Route entfernen
        </button>
      ) : (
        <>
          {plan.complete ? (
            <button role="menuitem" style={S.menuItem} onClick={() => act('via')}>
              {pass ? 'Zur Route hinzufügen' : 'Als Zwischenziel'}
            </button>
          ) : null}
          <button role="menuitem" style={S.menuItem} onClick={() => act('start')}>
            Als Start
          </button>
          <button role="menuitem" style={S.menuItem} onClick={() => act('ziel')}>
            {plan.complete ? 'Als neues Ziel' : 'Als Ziel'}
          </button>
        </>
      )}
      <button role="menuitem" style={S.menuItem} onClick={() => act('rundtour')}>
        Rundtour von hier
      </button>
    </div>
  );
}

