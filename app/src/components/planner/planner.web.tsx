/**
 * Web Planer (Desktop): Karte links, Seitenleiste rechts.
 * Modi: Tour (Wegpunkte, Abschnitte, Etappen Check, GPX), Rundtour, Beschreiben (KI Formular).
 * Expo nimmt diese Datei nur im Browser; auf dem Handy gilt planner.tsx.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import sample from '@/data/sample-e3.json';
import { checkLine } from '@/lib/check';
import { reverseName, searchPlaces, searchTowns, type Place } from '@/lib/geocode';
import { parseWish, STOPS, targetKm, formatMinutes, type Stop } from '@/lib/intent';
import { planChecked, type PlanStep } from '@/lib/plan';
import { bearingTo, DIRECTIONS, type Direction } from '@/lib/roundtrip';
import { smartRoundTrip } from '@/lib/smart-roundtrip';
import { exportTour, type RouteFormat } from '@/lib/route-file';
import { flatten, formatKm, legs, parseRouteFile, PROFILES, PROFILE_CHOICES, LEG_PROFILE_CHOICES, reverseTour, type LatLon, type Profile, type Tour } from '@/lib/tour';
import { countCurves, elevationProfile, resample, type ElevationProfile } from '@/lib/stats';
import { cumoAvailable } from '@/lib/cumo-routing';
import { signIn, signOut, signUp, useSession } from '@/lib/auth';
import { deleteTour, filterTours, folders, saveTour, syncLibrary, useLibrary, useSyncState, type SavedTour, type SortKey } from '@/lib/library';
import { RIDE_MODES, useRideMode } from '@/lib/ride-mode';
import { distToProbe, insertVia, passesNearRoute, probeLine } from '@/lib/route-edit';
import { DEFAULT_AVOID, type Avoid } from '@/lib/valhalla';
import { createHandoff } from '@/lib/handoff';
import { createRide, joinRide, leaveRide, loadProfile, normalizeCode, QUICK_MESSAGES, sendMessage, setRole, useRide } from '@/lib/group/ride';
import { encodeTour, expoGoLink } from '@/lib/share-code';
import { closedHint, passState, usePassLive, type LiveRow } from '@/lib/pass-live';
import { STOP_KINDS, stopsAlong, type StopHit, type StopKind } from '@/lib/stops-along';
import { photoDate, photoGroupsGeoJson, photoUrl, thumbUrl, usePhotoGroups, type PhotoGroup } from '@/lib/photos';
import { PASS_STATUS_URL, PASSES, passesAlong, passesGeoJson, passPoint, passSummary, searchPasses, type Pass } from '@/lib/passes';
import QRCode from 'qrcode';

import { addMemberLayers, addPassLayers, addPhotoLayers, addTourLayers, boundsOf, hoverGeoJson, loadMapLibre, MAP_STYLE, pointsGeoJson, tourGeoJson, type MapInstance } from './map-web';

const C = {
  ground: '#0B0B0C', surface: '#161618', surface2: '#1F1F22', line: '#2A2A2E', text: '#F4F4F2',
  muted: '#9A9A9F', signal: '#E2461C', good: '#4CC38A', warn: '#E8B03A',
};
const DISPLAY = 'Archivo_900Black, Archivo, "Arial Narrow", Inter, system-ui, sans-serif';
const BODY = 'Inter_400Regular, Inter, system-ui, sans-serif';

type Mode = 'tour' | 'rundtour' | 'beschreiben' | 'touren';
type MenuState = { x: number; y: number; p: LatLon; pass?: Pass } | null;
type PlannedTour = Tour & { minutes?: number; fixes?: number };

const STEP_TEXT: Record<PlanStep, string> = {
  route: 'Route wird berechnet',
  check: 'Etappen Check läuft',
  fix: 'Gesperrte Stellen werden umfahren',
};

const SAMPLE: PlannedTour = { ...(sample as unknown as Tour), geprueft: true, minutes: 277 };

export default function Planner() {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapInstance | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>('tour');
  const [rideMode, setRideMode] = useRideMode();
  const [menu, setMenu] = useState<MenuState>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [rtStart, setRtStart] = useState<{ p: LatLon; name: string } | null>(null);
  const [ownServer, setOwnServer] = useState<boolean | null>(null);

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
  const [tour, setTour] = useState<PlannedTour>(SAMPLE);
  const [isSample, setIsSample] = useState(true);
  const [profile, setProfile] = useState<Profile>('kurvig');
  const [avoid, setAvoid] = useState<Avoid>(DEFAULT_AVOID);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const abort = useRef<AbortController | null>(null);
  const line = useMemo(() => flatten(tour).map((x) => x.p), [tour]);
  // Höhenprofil gehört zu genau einer Linie; passt die Linie nicht mehr, gilt es als leer
  const [elevFor, setElevFor] = useState<{ line: LatLon[]; data: ElevationProfile } | null>(null);
  const elev = elevFor && elevFor.line === line ? elevFor.data : null;
  const curves = useMemo(() => (line.length > 1 ? countCurves(line) : 0), [line]);

  // Höhenprofil nachladen, wenn sich die Linie ändert
  useEffect(() => {
    if (line.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      elevationProfile(line, ctrl.signal)
        .then((data) => setElevFor({ line, data }))
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [line]);

  // Karte einmal aufbauen
  useEffect(() => {
    let cancelled = false;
    loadMapLibre()
      .then((ml) => {
        if (cancelled || !mapEl.current) return;
        const m = new ml.Map({ container: mapEl.current, style: MAP_STYLE, center: [13.2, 46.45], zoom: 8, attributionControl: { compact: true } });
        m.addControl(new ml.NavigationControl({ showCompass: false }), 'bottom-right');
        m.on('load', () => {
          addTourLayers(m);
          addPassLayers(m, passesGeoJson(PASSES, new Date().getMonth() + 1));
          addPhotoLayers(m);
          addMemberLayers(m);
          for (const layer of ['pass-circle', 'photo-circle']) {
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

  // Tour auf der Karte zeichnen
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return;
    m.getSource('tour')?.setData(tourGeoJson(tour));
    m.getSource('wp')?.setData(pointsGeoJson(tour.wegpunkte));
  }, [tour, mapReady]);

  const fitTour = useCallback((t: Tour) => {
    const m = map.current;
    const b = boundsOf(flatten(t).map((x) => x.p));
    if (m && b) m.fitBounds(b, { padding: 60, duration: 600 });
  }, []);

  useEffect(() => {
    if (mapReady) fitTour(tour);
    // nur beim ersten Bereitstehen der Karte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  // Ortsnamen der Wegpunkte nachladen
  useEffect(() => {
    tour.wegpunkte.forEach((p) => {
      const key = p.join(',');
      if (names[key]) return;
      reverseName(p).then((n) => setNames((old) => ({ ...old, [key]: n })));
    });
  }, [tour.wegpunkte, names]);

  const run = useCallback(
    async (label: string, job: (signal: AbortSignal, step: (s: PlanStep) => void) => Promise<PlannedTour>, keepSaved = false) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setError(null);
      setBusy(label);
      try {
        const t = await job(ctrl.signal, (s) => setBusy(STEP_TEXT[s]));
        setTour(t);
        setIsSample(false);
        setMode('tour');
        // Rundtouren und Importe sind neue Touren; Umplanen einer gespeicherten Tour behält die Ablage
        if (!keepSaved) setSavedId(null);
        fitTour(t);
      } catch (e) {
        if (!ctrl.signal.aborted) setError((e as Error).message);
      } finally {
        if (abort.current === ctrl) setBusy(null);
      }
    },
    [fitTour],
  );

  const replan = useCallback(
    (points: LatLon[], name = tour.name) =>
      run('Route wird berechnet', (signal, step) => planChecked(name, points, profile, avoid, step, signal), true),
    [run, tour.name, profile, avoid],
  );

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

  const photoGroups = usePhotoGroups();
  const [showPhotos, setShowPhotos] = useState(true);
  const [gallery, setGallery] = useState<{ g: PhotoGroup; i: number | null } | null>(null);

  // Klick auf die Karte setzt einen neuen Zielpunkt
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return;
    const onClick = (e: { lngLat: { lat: number; lng: number }; point: { x: number; y: number } }) => {
      if (menu) {
        setMenu(null);
        return;
      }
      // Klick auf einen Fotoort öffnet die Galerie
      const box = [[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]];
      const ph = m.queryRenderedFeatures(box, { layers: ['photo-circle'] })[0];
      const group = ph ? photoGroups?.find((g) => g.key === ph.properties.key) : undefined;
      if (group) {
        setGallery({ g: group, i: null });
        return;
      }
      // Klick auf einen Pass öffnet seine Karte mit den Aktionen
      const hit = m.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: ['pass-circle'] })[0];
      const pass = hit ? PASSES.find((x) => x.id === hit.properties.id) : undefined;
      if (pass) {
        setMenu({ x: e.point.x, y: e.point.y, p: passPoint(pass), pass });
        return;
      }
      if (mode !== 'tour' || busy) return;
      const p: LatLon = [e.lngLat.lat, e.lngLat.lng];
      const pts = isSample ? [p] : [...tour.wegpunkte, p];
      if (pts.length < 2) {
        setTour({ name: 'Neue Tour', laenge_km: 0, wegpunkte: pts, linie: [], warnungen: [] });
        setIsSample(false);
        return;
      }
      replan(pts, isSample ? 'Neue Tour' : tour.name);
    };
    const onContext = (e: { lngLat: { lat: number; lng: number }; point: { x: number; y: number }; preventDefault?: () => void }) => {
      e.preventDefault?.();
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
  }, [mapReady, mode, busy, isSample, tour, replan, menu, photoGroups]);

  // Escape schließt das Kontextmenü
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  const menuAction = async (kind: 'start' | 'via' | 'ziel' | 'rundtour') => {
    if (!menu) return;
    const p = menu.p;
    setMenu(null);
    await addPoint(kind, p);
  };

  const addPoint = async (kind: 'start' | 'via' | 'ziel' | 'rundtour', p: LatLon) => {
    if (kind === 'rundtour') {
      setRtStart({ p, name: await reverseName(p) });
      setMode('rundtour');
      return;
    }
    setMode('tour');
    const base = isSample ? [] : tour.wegpunkte;
    let pts: LatLon[];
    if (kind === 'start') pts = base.length ? [p, ...base.slice(1)] : [p];
    else if (kind === 'ziel') pts = [...base, p];
    else pts = insertVia(base, p);
    if (pts.length < 2) {
      setTour({ name: 'Neue Tour', laenge_km: 0, wegpunkte: pts, linie: [], warnungen: [] });
      setIsSample(false);
      setSavedId(null);
      return;
    }
    replan(pts, isSample ? 'Neue Tour' : tour.name);
  };

  const live = usePassLive();
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m || !live) return;
    m.getSource('passes')?.setData(passesGeoJson(PASSES, new Date().getMonth() + 1, (p) => passState(p, live).closed));
  }, [mapReady, live]);


  const passesOnRoute = useMemo(() => passesAlong(PASSES, line), [line]);
  // Stützpunkte der Route für Abstandsrechnungen (höchstens etwa 400)
  const probe = useMemo(() => probeLine(line), [line]);
  const distToRoute = useCallback((p: LatLon) => distToProbe(probe, p), [probe]);
  // Fotospots nur dort, wo die Route vorbeiführt (bis 1,5 km)
  const photosOnRoute = useMemo(
    () => (photoGroups && probe.length > 1 ? photoGroups.filter((g) => distToRoute(g.p) <= 1500) : []),
    [photoGroups, probe, distToRoute],
  );
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return;
    m.getSource('photos')?.setData(photoGroupsGeoJson(showPhotos ? photosOnRoute : []));
  }, [mapReady, photosOnRoute, showPhotos]);
  // Bekannte Pässe in der Nähe, die die Route noch nicht fährt: zum Einbauen
  const passesNear = useMemo(() => passesNearRoute(PASSES, probe, passesOnRoute), [probe, passesOnRoute]);

  const hoverLine = useMemo(() => resample(line, 100), [line]);
  const onHoverKm = useCallback(
    (km: number | null) => {
      const m = map.current;
      if (!mapReady || !m) return;
      const p = km === null ? null : hoverLine[Math.min(hoverLine.length - 1, Math.round((km * 1000) / 100))] ?? null;
      m.getSource('hover')?.setData(hoverGeoJson(p));
    },
    [mapReady, hoverLine],
  );

  const flyTo = (p: LatLon) => map.current?.flyTo({ center: [p[1], p[0]], zoom: 13, duration: 800 });

  const importGpx = async (file: File) => {
    const text = await file.text();
    let parsed: Tour;
    try {
      parsed = parseRouteFile(text, file.name);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setTour(parsed);
    setIsSample(false);
    fitTour(parsed);
    await run('Etappen Check läuft', async (signal) => {
      const line = flatten(parsed).map((x) => x.p);
      const c = await checkLine(line, (d, n) => setBusy(`Etappen Check läuft (${d} von ${n})`), signal, true);
      return { ...parsed, ...c, geprueft: true };
    });
  };

  const exportFile = (f: RouteFormat) => void exportTour(tour, f);

  return (
    <div style={S.root}>
      <div style={S.mapWrap}>
        <div ref={mapEl} style={S.map} aria-label="Karte" />
        {mapError ? <div style={S.mapError}>{mapError}</div> : null}
        {photosOnRoute.length ? (
          <button style={showPhotos ? S.photoToggleOn : S.photoToggle} onClick={() => setShowPhotos(!showPhotos)} aria-pressed={showPhotos}>
            Fotospots an der Strecke ({photosOnRoute.length})
          </button>
        ) : null}
        {gallery ? (
          <Gallery
            gallery={gallery}
            onChange={setGallery}
            canAdd={!busy}
            onAddVia={(p) => {
              setGallery(null);
              void addPoint('via', p);
            }}
          />
        ) : null}
        {mode === 'tour' && !busy ? <div style={S.hint}>Klick setzt ein Ziel, Rechtsklick öffnet weitere Optionen</div> : null}
        {menu ? (
          <div style={{ ...S.menu, left: menu.x, top: menu.y }} role="menu" onContextMenu={(e) => e.preventDefault()}>
            {menu.pass ? (
              <div style={S.menuHead}>
                <b>{menu.pass.name}</b>
                <span style={S.dropDetail}>{passSummary(menu.pass, undefined, passState(menu.pass, live).note)}</span>
                {menu.pass.car_note ? <span style={S.dropDetail}>{menu.pass.car_note}</span> : null}
              </div>
            ) : null}
            {menu.pass && photoGroups?.some((g) => g.pass?.id === menu.pass!.id) ? (
              <button
                role="menuitem"
                style={S.menuItem}
                onClick={() => {
                  const gs = photoGroups.filter((g) => g.pass?.id === menu.pass!.id);
                  setGallery({ g: { ...gs[0], photos: gs.flatMap((g) => g.photos) }, i: null });
                  setMenu(null);
                }}>
                Fotos ansehen ({photoGroups.filter((g) => g.pass?.id === menu.pass!.id).reduce((n, g) => n + g.photos.length, 0)})
              </button>
            ) : null}
            <button role="menuitem" style={S.menuItem} onClick={() => menuAction('start')}>Als Start setzen</button>
            <button role="menuitem" style={S.menuItem} onClick={() => menuAction('via')}>{menu.pass ? 'Pass in die Tour einbauen' : 'Als Via Punkt einfügen'}</button>
            <button role="menuitem" style={S.menuItem} onClick={() => menuAction('ziel')}>Als Ziel setzen</button>
            <button role="menuitem" style={S.menuItem} onClick={() => menuAction('rundtour')}>Rundtour von hier</button>
          </div>
        ) : null}
      </div>
      <aside style={S.side}>
        <div style={S.brandRow}>
          <a href="/" style={{ ...S.brand, color: C.text, textDecoration: 'none' }}>
            CUMO DRIVE
          </a>
          <div style={S.ride} role="radiogroup" aria-label="Fahrmodus">
            {RIDE_MODES.map((r) => (
              <button key={r.id} role="radio" aria-checked={rideMode === r.id} title={r.hint} onClick={() => setRideMode(r.id)} style={rideMode === r.id ? S.rideOn : S.rideOff}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div style={S.tabs} role="tablist">
          {(['tour', 'rundtour', 'beschreiben', 'touren'] as Mode[]).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} style={mode === m ? S.tabOn : S.tab}>
              {{ tour: 'Tour', rundtour: 'Rundtour', beschreiben: 'Beschreiben', touren: 'Meine Touren' }[m]}
            </button>
          ))}
        </div>

        <div style={S.engine} title="Der eigene Server läuft auf deinem Mac (routing/server, bash start.sh)">
          <span style={{ ...S.dot, background: ownServer ? C.good : C.muted }} />
          {ownServer === null ? 'Routing wird gesucht' : ownServer ? 'Eigener Routing Server mit Sportwagen Profil' : 'Öffentliche Routing Dienste (eigener Server aus)'}
        </div>
        {busy ? <Status text={busy} onCancel={() => abort.current?.abort()} /> : null}
        {error ? <div style={S.error}>{error}</div> : null}

        <div style={S.scroll}>
          {mode === 'tour' ? (
            <TourPanel
              tour={tour}
              group={rideMode === 'gruppe'}
              curves={curves}
              elev={elev}
              onHoverKm={onHoverKm}
              isSample={isSample}
              names={names}
              passes={passesOnRoute}
              passesNear={passesNear}
              onAddPass={(pass) => void addPoint('via', passPoint(pass))}
              onAddVia={(p) => void addPoint('via', p)}
              live={live}
              profile={profile}
              setProfile={setProfile}
              avoid={avoid}
              setAvoid={setAvoid}
              onFly={flyTo}
              onReplan={() => replan(tour.wegpunkte)}
              onReverse={() => {
                const r = reverseTour(tour);
                setTour({ ...r, minutes: tour.minutes });
              }}
              onRemove={(i) => {
                const pts = tour.wegpunkte.filter((_, k) => k !== i);
                if (pts.length >= 2) replan(pts);
                else setTour({ ...tour, wegpunkte: pts, linie: [], warnungen: [], laenge_km: 0 });
              }}
              onAddPlace={(p) => {
                const pts = isSample ? [p] : [...tour.wegpunkte, p];
                if (pts.length >= 2) replan(pts, isSample ? 'Neue Tour' : tour.name);
                else {
                  setTour({ name: 'Neue Tour', laenge_km: 0, wegpunkte: pts, linie: [], warnungen: [] });
                  setIsSample(false);
                  flyTo(p);
                }
              }}
              onImport={importGpx}
              onExport={exportFile}
              onSample={() => {
                setTour(SAMPLE);
                setIsSample(true);
                fitTour(SAMPLE);
              }}
              onRename={(n) => setTour({ ...tour, name: n })}
              savedId={isSample ? null : savedId}
              onSave={(folder) => {
                try {
                  const saved = saveTour({ ...tour, curves, profile }, folder, savedId ?? undefined);
                  setSavedId(saved.id);
                  setError(null);
                  void syncLibrary();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
              busy={!!busy}
            />
          ) : null}
          {mode === 'touren' ? (
            <LibraryPanel
              currentId={savedId}
              onOpen={(t) => {
                setTour(t);
                setIsSample(false);
                setSavedId(t.id);
                setMode('tour');
                fitTour(t);
              }}
            />
          ) : null}
          {mode === 'rundtour' ? (
            <RoundTripPanel
              key={rtStart ? rtStart.p.join(',') : 'leer'}
              initialStart={rtStart}
              center={() => {
                const c = map.current?.getCenter();
                return c ? ([c.lat, c.lng] as LatLon) : null;
              }}
              profile={profile}
              setProfile={setProfile}
              busy={!!busy}
              onCreate={(start, km, dir, name) =>
                run('Rundtour wird gebaut', (signal, step) => smartRoundTrip({ name, start, km, direction: dir, profile, avoid }, step, signal))
              }
            />
          ) : null}
          {mode === 'beschreiben' ? (
            <DescribePanel
              center={() => {
                const c = map.current?.getCenter();
                return c ? ([c.lat, c.lng] as LatLon) : null;
              }}
              busy={!!busy}
              onCreate={(job) => run('Tour wird gebaut', job)}
              avoid={avoid}
            />
          ) : null}
        </div>
      </aside>
    </div>
  );
}

/* ---------- Tour ---------- */

function TourPanel(props: {
  tour: PlannedTour;
  group: boolean;
  curves: number;
  elev: ElevationProfile | null;
  onHoverKm: (km: number | null) => void;
  isSample: boolean;
  names: Record<string, string>;
  passes: { pass: Pass; km: number }[];
  passesNear: { pass: Pass; dKm: number }[];
  onAddPass: (p: Pass) => void;
  onAddVia: (p: LatLon) => void;
  live: Map<string, LiveRow> | null;
  profile: Profile;
  setProfile: (p: Profile) => void;
  avoid: Avoid;
  setAvoid: (a: Avoid) => void;
  onFly: (p: LatLon) => void;
  onReplan: () => void;
  onReverse: () => void;
  onRemove: (i: number) => void;
  onAddPlace: (p: LatLon) => void;
  onImport: (f: File) => void;
  onExport: (f: RouteFormat) => void;
  onSample: () => void;
  onRename: (n: string) => void;
  savedId: string | null;
  onSave: (folder: string) => void;
  busy: boolean;
}) {
  const { tour } = props;
  const parts = useMemo(() => legs(tour), [tour]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const k = tour.km_je_klasse;
  const pts = tour.wegpunkte;
  const hint = closedHint(props.passes.map((x) => x.pass), props.live);

  return (
    <div style={S.stack}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {props.isSample ? <span style={S.sampleTag}>Beispiel: deine RCO Etappe mit Etappen Check</span> : null}
        <input
          id="tour-name"
          aria-label="Tourname"
          value={tour.name}
          onChange={(e) => props.onRename(e.target.value)}
          style={S.nameInput}
        />
        <div style={S.statsRow}>
          <Stat big={formatKm(tour.laenge_km, 0)} unit="km" label="Strecke" />
          {tour.minutes ? <Stat big={formatMinutes(Math.round(tour.minutes))} label="Fahrzeit" /> : null}
          {k ? <Stat big={formatKm(k.raus)} unit="km" label="raus" tone={k.raus > 0 ? 'stop' : 'good'} /> : null}
        </div>
        <div style={S.statsRow}>
          <Stat big={String(props.curves)} label={tour.laenge_km > 0 ? `Kurven, ${Math.round((props.curves / tour.laenge_km) * 100)} je 100 km` : 'Kurven'} small />
          <Stat big={props.elev ? props.elev.up.toLocaleString('de-DE') : '…'} unit="m" label="bergauf" small />
          <Stat big={props.elev ? props.elev.max.toLocaleString('de-DE') : '…'} unit="m" label="höchster Punkt" small />
        </div>
        {props.elev && props.elev.km.length > 2 ? <ElevationChart e={props.elev} onHoverKm={props.onHoverKm} /> : null}
        {tour.geprueft ? (
          <div style={k && k.raus > 0 ? S.checkBad : S.checkGood}>
            {k && k.raus > 0
              ? `Etappen Check: ${formatKm(k.raus)} km sind für Sportwagen ungeeignet.${tour.fixes ? '' : ' Neu planen umfährt sie.'}`
              : `Etappen Check bestanden${tour.fixes ? `, ${tour.fixes} Mal umgeplant` : ''}.`}
          </div>
        ) : null}
      </div>

      {!props.isSample && tour.linie.length ? <SaveBox savedId={props.savedId} onSave={props.onSave} busy={props.busy} /> : null}

      {tour.linie.length ? <SendToApp tour={tour} profile={props.profile} avoid={props.avoid} /> : null}

      <PlaceSearch near={pts[pts.length - 1]} placeholder={pts.length ? 'Ziel oder Via Punkt hinzufügen' : 'Wo geht es los?'} onPick={(p) => props.onAddPlace(p.p)} />

      {pts.length ? (
        <ol style={S.wpList}>
          {pts.map((p, i) => {
            const leg = parts[i];
            const label = i === 0 ? 'S' : i === pts.length - 1 ? 'Z' : String(i);
            return (
              <li key={`${p[0]},${p[1]},${i}`} style={{ listStyle: 'none' }}>
                <div style={S.wpRow}>
                  <span style={i === 0 || i === pts.length - 1 ? S.wpDotEnd : S.wpDot}>{label}</span>
                  <button style={S.wpName} onClick={() => props.onFly(p)}>
                    {props.names[p.join(',')] ?? `${p[0].toFixed(4)}, ${p[1].toFixed(4)}`}
                  </button>
                  {!props.isSample ? (
                    <button aria-label="Wegpunkt entfernen" style={S.iconBtn} onClick={() => props.onRemove(i)} disabled={props.busy}>
                      ×
                    </button>
                  ) : null}
                </div>
                {leg ? (
                  <div style={S.leg}>
                    <span style={S.legKm}>{formatKm(leg.endKm - leg.startKm)} km</span>
                    {leg.warnings.map((w, j) => (
                      <button key={j} style={w.klasse === 'raus' ? S.warnStop : S.warnSoft} onClick={() => props.onFly(w.mitte)}>
                        <b>{w.klasse === 'raus' ? 'Raus' : 'Prüfen'}</b> km {Math.round(w.start_km)}, {formatKm(w.laenge_km)} km{w.name ? `, ${w.name}` : ''}
                        <span style={S.warnWhy}>{w.gruende.slice(0, 2).join('; ')}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p style={S.muted}>Setze den Start per Suche oder Klick auf die Karte, dann das Ziel.</p>
      )}

      {hint ? (
        <div style={S.winterNote}>
          <b>{hint.title}</b>
          <span>{hint.text}</span>
          <a href={PASS_STATUS_URL} target="_blank" rel="noreferrer" style={S.winterLink}>
            Aktuellen Passstatus ansehen
          </a>
        </div>
      ) : null}

      {props.passes.length ? (
        <Section title="Highlights auf der Strecke" aside={String(props.passes.length)}>
          <ol style={S.passList}>
            {props.passes.map(({ pass, km }) => (
              <li key={pass.id} style={{ listStyle: 'none' }}>
                <button style={S.passRow} onClick={() => props.onFly(passPoint(pass))}>
                  <span style={pass.tier === 'ikone' ? S.passDotIcon : S.passDot} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={S.passName}>{pass.name}</span>
                    <span style={S.dropDetail}>{passSummary(pass, undefined, passState(pass, props.live).note)}</span>
                  </span>
                  <span style={S.legKm}>km {Math.round(km)}</span>
                </button>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {pts.length >= 2 && !props.isSample ? <AddPass near={props.passesNear} live={props.live} busy={props.busy} onAdd={props.onAddPass} /> : null}
      {pts.length >= 2 && !props.isSample ? <StopsPanel tour={props.tour} busy={props.busy} onAdd={props.onAddVia} /> : null}

      <Section title="Profil">
        <div style={S.chips}>
          {LEG_PROFILE_CHOICES.map((p) => (
            <Chip key={p.id} on={props.profile === p.id} onClick={() => props.setProfile(p.id)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </Section>

      {props.group ? (
        <Section title="Gruppenfahrt">
          <GroupPanel tour={tour} profile={props.profile} avoid={props.avoid} isSample={props.isSample} />
        </Section>
      ) : null}

      <Section title="Vermeiden">
        <Toggle id="av-closures" on={props.avoid.closures} label="Gesperrte Straßen" note="calimoto warnt nur, wir umfahren" onChange={(v) => props.setAvoid({ ...props.avoid, closures: v })} />
        <Toggle id="av-rough" on={props.avoid.rough} label="Rauer Belag und Kopfsteinpflaster" onChange={(v) => props.setAvoid({ ...props.avoid, rough: v })} />
        <Toggle id="av-ferries" on={props.avoid.ferries} label="Fähren" onChange={(v) => props.setAvoid({ ...props.avoid, ferries: v })} />
        <Toggle id="av-tolls" on={props.avoid.tolls} label="Mautstraßen" onChange={(v) => props.setAvoid({ ...props.avoid, tolls: v })} />
      </Section>

      <div style={S.btnRow}>
        <button style={S.primary} disabled={props.busy || pts.length < 2} onClick={props.onReplan}>
          {props.isSample ? 'Mit Sportwagen Profil neu planen' : 'Neu planen'}
        </button>
        <button style={S.secondary} disabled={props.busy || pts.length < 2} onClick={props.onReverse}>
          Umkehren
        </button>
      </div>
      <div style={S.btnRow}>
        <button style={S.secondary} onClick={() => fileRef.current?.click()} disabled={props.busy}>
          GPX oder KML importieren
        </button>
      </div>
      <div style={S.btnRow}>
        <button style={S.secondary} onClick={() => props.onExport('gpx')} disabled={tour.linie.length === 0}>
          GPX exportieren
        </button>
        <button style={S.secondary} onClick={() => props.onExport('kml')} disabled={tour.linie.length === 0}>
          KML exportieren
        </button>
        <input
          ref={fileRef}
          id="gpx-file"
          type="file"
          accept=".gpx,.kml,application/gpx+xml,application/vnd.google-earth.kml+xml"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onImport(f);
            e.target.value = '';
          }}
        />
      </div>
      {!props.isSample ? (
        <button style={S.link} onClick={props.onSample}>
          Beispiel RCO EAST 26 E3 laden
        </button>
      ) : null}
    </div>
  );
}

function SaveBox(props: { savedId: string | null; onSave: (folder: string) => void; busy: boolean }) {
  const list = useLibrary();
  const current = list.find((t) => t.id === props.savedId);
  const [folder, setFolder] = useState(current?.folder ?? '');
  return (
    <div style={S.saveBox}>
      <input id="save-folder" list="save-folders" aria-label="Ordner" placeholder="Ordner, zum Beispiel RCO 26" value={folder} onChange={(e) => setFolder(e.target.value)} style={{ ...S.search, height: 38, flex: 1 }} />
      <datalist id="save-folders">
        {folders(list).map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <button style={{ ...S.secondary, flex: 'none' }} disabled={props.busy} onClick={() => props.onSave(folder)}>
        {current ? 'Aktualisieren' : 'Speichern'}
      </button>
    </div>
  );
}

/**
 * QR Code für die App. Bevorzugt ein kurzer Übergabe Code über Supabase (die App bekommt die
 * exakt geplante Tour); ohne Verbindung fällt er auf Stützpunkte im Code zurück (App plant neu).
 */
function SendToApp(props: { tour: Tour; profile: Profile; avoid: Avoid }) {
  const { tour, profile, avoid } = props;
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<{ tour: Tour; url: string; short: boolean } | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      let code: string;
      let short = true;
      try {
        code = await createHandoff(tour, profile, avoid);
      } catch {
        code = encodeTour(tour, profile);
        short = false;
      }
      const url = await QRCode.toDataURL(expoGoLink(code), { errorCorrectionLevel: 'M', margin: 3, width: 720, color: { dark: '#0B0B0C', light: '#FFFFFF' } });
      if (alive) setQr({ tour, url, short });
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, tour, profile, avoid]);
  const current = qr && qr.tour === tour ? qr : null;
  if (!open)
    return (
      <button style={{ ...S.secondary, flex: 'none', minHeight: 42 }} onClick={() => setOpen(true)}>
        An die App senden
      </button>
    );
  return (
    <div style={S.qrBox}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b>An die App senden</b>
        <button aria-label="Schließen" style={S.iconBtn} onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
      {current ? <img src={current.url} alt="QR Code der Tour" style={S.qrImg} /> : <div style={{ ...S.qrImg, background: '#fff' }} />}
      <p style={S.small}>
        Mit der iPhone Kamera scannen und auf „In Expo Go öffnen“ tippen.{' '}
        {current && !current.short
          ? 'Ohne Verbindung zum Server enthält der Code nur Stützpunkte, die App plant die Strecke neu.'
          : 'Die App übernimmt die Tour genau so, wie sie hier geplant ist.'}{' '}
        Alternativ in der App unter Entdecken „Tour vom Planer holen“ wählen.
      </p>
    </div>
  );
}

/* ---------- Fotos ---------- */

/** Stopps an der Strecke aus OpenStreetMap: Super Plus, Aussicht mit Parkplatz, Mittag, Kaffee. */
function StopsPanel(props: { tour: PlannedTour; busy: boolean; onAdd: (p: LatLon) => void }) {
  const [kind, setKind] = useState<StopKind | null>(null);
  const [res, setRes] = useState<{ key: string; hits: StopHit[] | null; error: string | null } | null>(null);
  const line = useMemo(() => flatten(props.tour).map((x) => x.p), [props.tour]);
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
    <Section title="Stopps an der Strecke">
      <div style={S.chips}>
        {STOP_KINDS.map((k) => (
          <Chip key={k.id} on={kind === k.id} onClick={() => setKind(kind === k.id ? null : k.id)}>
            {k.label}
          </Chip>
        ))}
      </div>
      {kind && <p style={S.muted}>{STOP_KINDS.find((k) => k.id === kind)?.hint}</p>}
      {kind && !cur && <p style={S.muted}>Wird gesucht …</p>}
      {cur?.error && <p style={S.muted}>Gerade nicht erreichbar ({cur.error}). Versuch es gleich noch mal.</p>}
      {cur?.hits && cur.hits.length === 0 && <p style={S.muted}>Nichts direkt an der Strecke gefunden.</p>}
      {cur?.hits && cur.hits.length > 0 && (
        <ol style={S.passList}>
          {cur.hits.map((h) => (
            <li key={h.id} style={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={S.legKm}>km {Math.round(h.km)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={S.passName}>{h.name}</span>
                <span style={S.dropDetail}>{[h.detail, h.offM > 150 ? `${formatKm(h.offM / 1000, 1)} km neben der Route` : 'direkt an der Route'].filter(Boolean).join(', ')}</span>
              </span>
              <button style={{ ...S.secondary, flex: 'none', padding: '0 12px' }} disabled={props.busy} onClick={() => props.onAdd(h.p)}>
                Einplanen
              </button>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

/** Bekannte Pässe in die Tour einbauen: Suche nach Name plus Vorschläge in der Nähe der Route. */
function AddPass(props: { near: { pass: Pass; dKm: number }[]; live: Map<string, LiveRow> | null; busy: boolean; onAdd: (p: Pass) => void }) {
  const [q, setQ] = useState('');
  const searching = q.trim().length >= 2;
  const hits: { pass: Pass; dKm: number | null }[] = searching ? searchPasses(PASSES, q, 5).map((pass) => ({ pass, dKm: null })) : props.near;
  return (
    <Section title="Pässe einbauen" aside={!searching && props.near.length ? 'in der Nähe' : undefined}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pass suchen, zum Beispiel Stelvio" style={S.search} aria-label="Pass suchen" />
      {hits.length ? (
        <ol style={S.passList}>
          {hits.map(({ pass, dKm }) => (
            <li key={pass.id} style={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={pass.tier === 'ikone' ? S.passDotIcon : S.passDot} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={S.passName}>{pass.name}</span>
                <span style={S.dropDetail}>
                  {[passSummary(pass, undefined, passState(pass, props.live).note), dKm != null ? `${formatKm(dKm, dKm < 10 ? 1 : 0)} km neben der Route` : null].filter(Boolean).join(', ')}
                </span>
              </span>
              <button
                style={{ ...S.secondary, flex: 'none', padding: '0 12px' }}
                disabled={props.busy}
                onClick={() => {
                  props.onAdd(pass);
                  setQ('');
                }}>
                Einbauen
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p style={S.muted}>{searching ? 'Kein Pass gefunden.' : 'Keine bekannten Pässe in der Nähe der Route.'}</p>
      )}
    </Section>
  );
}

function Gallery(props: {
  gallery: { g: PhotoGroup; i: number | null };
  onChange: (g: { g: PhotoGroup; i: number | null } | null) => void;
  onAddVia: (p: LatLon) => void;
  canAdd: boolean;
}) {
  const { g, i } = props.gallery;
  const [place, setPlace] = useState<{ key: string; name: string } | null>(null);
  useEffect(() => {
    if (g.pass) return;
    let alive = true;
    reverseName(g.p)
      .then((n) => alive && n && setPlace({ key: g.key, name: n }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [g]);
  const title = g.pass ? g.pass.name : place?.key === g.key ? `Fotospot bei ${place.name}` : 'Fotospot';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onChange(i === null ? null : { g, i: null });
      if (i !== null && e.key === 'ArrowRight') props.onChange({ g, i: (i + 1) % g.photos.length });
      if (i !== null && e.key === 'ArrowLeft') props.onChange({ g, i: (i - 1 + g.photos.length) % g.photos.length });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [g, i, props]);
  if (i !== null) {
    const ph = g.photos[i];
    return (
      <div style={S.lightbox} role="dialog" aria-label={`Foto ${i + 1} von ${g.photos.length}`} onClick={() => props.onChange({ g, i: null })}>
        <img src={photoUrl(ph)} alt={`${title}, ${photoDate(ph)}`} style={S.lightboxImg} onClick={(e) => e.stopPropagation()} />
        <div style={S.lightboxBar} onClick={(e) => e.stopPropagation()}>
          <button style={S.lbBtn} onClick={() => props.onChange({ g, i: (i - 1 + g.photos.length) % g.photos.length })} aria-label="Vorheriges Foto">‹</button>
          <span>
            {title}, {photoDate(ph)} · {i + 1} / {g.photos.length}
          </span>
          <button style={S.lbBtn} onClick={() => props.onChange({ g, i: (i + 1) % g.photos.length })} aria-label="Nächstes Foto">›</button>
          <button style={S.lbBtn} onClick={() => props.onChange({ g, i: null })} aria-label="Schließen">×</button>
        </div>
      </div>
    );
  }
  return (
    <div style={S.gallery}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div>
          <b>{title}</b>
          <span style={{ ...S.dropDetail, marginLeft: 8 }}>
            {g.photos.length} {g.photos.length === 1 ? 'Foto' : 'Fotos'}, CUMO DRIVERS CLUB, {photoDate(g.photos[0])}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button style={{ ...S.secondaryOnSurface, flex: 'none', padding: '0 14px' }} disabled={!props.canAdd} onClick={() => props.onAddVia(g.p)}>
            Als Zwischenziel einfügen
          </button>
          <button aria-label="Galerie schließen" style={S.iconBtn} onClick={() => props.onChange(null)}>
            ×
          </button>
        </div>
      </div>
      <div style={S.thumbs}>
        {g.photos.map((ph, k) => (
          <button key={ph.id} style={S.thumbBtn} onClick={() => props.onChange({ g, i: k })} aria-label={`Foto ${k + 1} öffnen`}>
            <img src={thumbUrl(ph)} alt="" style={S.thumb} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Meine Touren ---------- */

function LibraryPanel(props: { currentId: string | null; onOpen: (t: SavedTour) => void }) {
  const list = useLibrary();
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('neu');
  const [confirm, setConfirm] = useState<string | null>(null);
  const shown = filterTours(list, q, folder, sort);
  const fs = folders(list);
  return (
    <div style={S.stack}>
      <div>
        <h2 style={S.h2}>Meine Touren</h2>
        <p style={S.muted}>{list.length ? `${list.length} gespeicherte Touren.` : 'Noch keine Tour gespeichert. Plane oder importiere eine Tour und speichere sie im Tab Tour.'}</p>
      </div>
      <AccountBox />
      {list.length ? (
        <>
          <input id="lib-search" aria-label="Touren durchsuchen" placeholder="Touren durchsuchen" value={q} onChange={(e) => setQ(e.target.value)} style={S.search} />
          {fs.length ? (
            <div style={S.chips}>
              <Chip on={folder === null} onClick={() => setFolder(null)}>Alle</Chip>
              {fs.map((f) => (
                <Chip key={f} on={folder === f} onClick={() => setFolder(f)}>
                  {f}
                </Chip>
              ))}
            </div>
          ) : null}
          <div style={S.chips}>
            {(['neu', 'name', 'laenge'] as SortKey[]).map((k) => (
              <Chip key={k} on={sort === k} onClick={() => setSort(k)}>
                {{ neu: 'Zuletzt geändert', name: 'Name', laenge: 'Länge' }[k]}
              </Chip>
            ))}
          </div>
          <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {shown.map((t) => (
              <li key={t.id} style={{ ...S.libRow, ...(t.id === props.currentId ? { background: C.surface } : {}) }}>
                <button style={S.libOpen} onClick={() => props.onOpen(t)}>
                  <span style={{ fontWeight: 600 }}>{t.name}</span>
                  <span style={S.small}>
                    {formatKm(t.laenge_km, 0)} km{t.curves ? `, ${t.curves} Kurven` : ''}
                    {t.folder ? `, ${t.folder}` : ''}, {new Date(t.updatedAt).toLocaleDateString('de-DE')}
                  </span>
                </button>
                {t.km_je_klasse ? (
                  <span style={t.km_je_klasse.raus > 0 ? S.badgeStop : S.badgeGood}>{t.km_je_klasse.raus > 0 ? `${formatKm(t.km_je_klasse.raus)} km raus` : 'geprüft'}</span>
                ) : null}
                {confirm === t.id ? (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button style={S.dangerSmall} onClick={() => deleteTour(t.id)}>Löschen</button>
                    <button style={S.link} onClick={() => setConfirm(null)}>Nein</button>
                  </span>
                ) : (
                  <button aria-label={`${t.name} löschen`} style={S.iconBtn} onClick={() => setConfirm(t.id)}>
                    ×
                  </button>
                )}
              </li>
            ))}
            {!shown.length ? <p style={S.muted}>Keine Tour passt zur Suche.</p> : null}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/** Gruppenfahrt im Web: starten oder beitreten, Mitfahrer live auf der Karte, Kurznachrichten. */
function GroupPanel(props: { tour: Tour; profile: Profile; avoid: Avoid; isSample: boolean }) {
  const ride = useRide();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    loadProfile().then((p) => p && setName((n) => n || p.name));
  }, []);

  if (ride.status === 'aus' || ride.status === 'fehler') {
    const canShare = !props.isSample && props.tour.linie.length > 0;
    return (
      <div style={S.groupBox}>
        <p style={{ margin: 0 }}>Alle Mitfahrer sehen sich live auf der Karte, in der App und hier im Planer. Sprechfunk folgt.</p>
        <input id="grp-name" aria-label="Dein Name" placeholder="Dein Name" value={name} onChange={(e) => setName(e.target.value)} style={{ ...S.search, height: 40, background: C.surface2 }} />
        <button
          style={S.primary}
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            const tc = canShare ? await createHandoff(props.tour, props.profile, props.avoid).catch(() => null) : null;
            await createRide(name, 'Planer', tc);
            setBusy(false);
          }}>
          {canShare ? 'Fahrt mit dieser Tour starten' : 'Fahrt starten'}
        </button>
        <div style={S.btnRow}>
          <input id="grp-code" aria-label="Fahrtcode" placeholder="Fahrtcode" value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} style={{ ...S.search, height: 40, flex: 1, background: C.surface2, letterSpacing: 4, textTransform: 'uppercase' }} />
          <button style={{ ...S.secondaryOnSurface, flex: 'none' }} disabled={busy || !name.trim() || code.length !== 6} onClick={() => void joinRide(code, name, 'Planer')}>
            Beitreten
          </button>
        </div>
        {ride.error ? <span style={{ ...S.small, color: C.signal }}>{ride.error}</span> : null}
      </div>
    );
  }
  const link = `exp://u.expo.dev/44e0d073-6f59-455d-8a50-0f11f6fef4b7/--/gruppe?runtime-version=exposdk%3A58.0.0&channel-name=preview&code=${ride.code}`;
  return (
    <div style={S.groupBox}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={S.rideCode}>
          {ride.code!.slice(0, 3).toUpperCase()} {ride.code!.slice(3).toUpperCase()}
        </span>
        <button
          style={S.link}
          onClick={() => {
            navigator.clipboard
              ?.writeText(`Fahr mit bei CUMO DRIVE. Code ${ride.code!.toUpperCase()} in der App unter Planen, Gruppe, eingeben oder öffnen: ${link}`)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}>
          {copied ? 'Einladung kopiert' : 'Einladung kopieren'}
        </button>
      </div>
      <span style={S.small}>
        {ride.status === 'verbinde' ? 'Verbinde …' : `${ride.members.length} in der Gruppe, du bist ${{ lead: 'Lead', schluss: 'Schlusslicht', mitfahrer: 'Mitfahrer' }[ride.myRole]}`}
        {ride.tourCode ? ', Tour geteilt' : ''}
      </span>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {ride.members.map((mb) => (
          <li key={mb.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: mb.role === 'lead' ? C.signal : mb.role === 'schluss' ? C.warn : C.text }} />
            <span style={{ flex: 1 }}>
              {mb.name}
              {mb.id === ride.me?.id ? ' (du)' : ''}
              <span style={S.small}> {mb.car}{mb.p ? '' : ', noch keine Position'}</span>
            </span>
            {ride.myRole === 'lead' && mb.id !== ride.me?.id ? (
              <button style={S.link} onClick={() => setRole(mb.id, mb.role === 'schluss' ? 'mitfahrer' : 'schluss')}>
                {mb.role === 'schluss' ? 'Kein Schluss' : 'Schlusslicht'}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <div style={S.chips}>
        {QUICK_MESSAGES.map((m) => (
          <Chip key={m} on={false} onSurface onClick={() => sendMessage(m)}>
            {m}
          </Chip>
        ))}
      </div>
      {ride.messages.slice(0, 5).map((m) => (
        <span key={m.id} style={S.small}>
          {new Date(m.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} {m.from === ride.me?.id ? 'Du' : m.name}: {m.text}
        </span>
      ))}
      <button style={S.link} onClick={() => void leaveRide()}>
        Fahrt verlassen
      </button>
    </div>
  );
}

/** Anmelden, damit Touren im Konto liegen und in der App erscheinen. */
function AccountBox() {
  const session = useSession();
  const sync = useSyncState();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const userId = session?.user.id;
  useEffect(() => {
    if (userId) void syncLibrary();
  }, [userId]);

  if (session) {
    return (
      <div style={S.accountBox}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <span>
            Angemeldet als <b>{session.user.email}</b>
          </span>
          <button style={S.link} onClick={() => void signOut()}>
            Abmelden
          </button>
        </div>
        <span style={sync.error ? { ...S.small, color: C.signal } : S.small}>
          {sync.running
            ? 'Touren werden abgeglichen …'
            : sync.error
              ? `Abgleich fehlgeschlagen: ${sync.error}`
              : 'Deine Touren liegen im Konto und erscheinen in der App unter Meine Touren.'}
        </span>
      </div>
    );
  }
  const run = async (fn: (e: string, p: string) => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn(email, pw);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      style={S.accountBox}
      onSubmit={(e) => {
        e.preventDefault();
        void run(signIn);
      }}>
      <b>Konto</b>
      <span style={S.small}>Ohne Konto bleiben Touren nur in diesem Browser. Mit Konto stehen sie auch in der App.</span>
      <input id="acc-email" type="email" autoComplete="email" aria-label="E-Mail" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...S.search, height: 40, background: C.surface2 }} />
      <input id="acc-pw" type="password" autoComplete="current-password" aria-label="Passwort" placeholder="Passwort, mindestens 8 Zeichen" value={pw} onChange={(e) => setPw(e.target.value)} style={{ ...S.search, height: 40, background: C.surface2 }} />
      {err ? <span style={{ ...S.small, color: C.signal }}>{err}</span> : null}
      <div style={S.btnRow}>
        <button type="submit" style={S.primary} disabled={busy || !email || !pw}>
          Anmelden
        </button>
        <button type="button" style={S.secondaryOnSurface} disabled={busy || !email || !pw} onClick={() => void run(signUp)}>
          Registrieren
        </button>
      </div>
    </form>
  );
}

/* ---------- Rundtour ---------- */

const KM_STEPS = [25, 50, 75, 100, 150, 200, 300];

function RoundTripPanel(props: {
  initialStart: { p: LatLon; name: string } | null;
  center: () => LatLon | null;
  profile: Profile;
  setProfile: (p: Profile) => void;
  busy: boolean;
  onCreate: (start: LatLon, km: number, dir: Direction, name: string) => void;
}) {
  const [start, setStart] = useState<{ p: LatLon; name: string } | null>(props.initialStart);
  const [km, setKm] = useState(50);
  const [dir, setDir] = useState<Direction>('O');
  const [locError, setLocError] = useState<string | null>(null);

  const useLocation = () => {
    setLocError(null);
    if (!navigator.geolocation) {
      setLocError('Dein Browser gibt keinen Standort heraus. Wähle den Start über die Suche.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const p: LatLon = [pos.coords.latitude, pos.coords.longitude];
        setStart({ p, name: await reverseName(p) });
      },
      () => setLocError('Standort nicht freigegeben. Erlaube ihn im Browser oder wähle den Start über die Suche.'),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  const grid: (Direction | 'mitte')[] = ['NW', 'N', 'NO', 'W', 'mitte', 'O', 'SW', 'S', 'SO'];
  const arrow: Record<string, string> = { NW: '↖', N: '↑', NO: '↗', W: '←', O: '→', SW: '↙', S: '↓', SO: '↘' };

  return (
    <div style={S.stack}>
      <div>
        <h2 style={S.h2}>Rundtour</h2>
        <p style={S.muted}>Start wählen, Länge und Richtung festlegen. Die Route wird gleich mit dem Etappen Check geprüft.</p>
      </div>
      <Section title="Start">
        {start ? (
          <div style={S.startRow}>
            <span>{start.name}</span>
            <button style={S.link} onClick={() => setStart(null)}>
              ändern
            </button>
          </div>
        ) : (
          <div style={S.stackTight}>
            <div style={S.btnRow}>
              <button style={S.secondary} onClick={useLocation}>
                Mein Standort
              </button>
              <button
                style={S.secondary}
                onClick={async () => {
                  const c = props.center();
                  if (c) setStart({ p: c, name: `Kartenmitte (${await reverseName(c)})` });
                }}>
                Kartenmitte
              </button>
            </div>
            <PlaceSearch placeholder="Startort suchen" onPick={(p) => setStart({ p: p.p, name: p.name })} />
            {locError ? <p style={S.errorText}>{locError}</p> : null}
          </div>
        )}
      </Section>
      <Section title="Länge" aside={`${km} km, etwa ${formatMinutes(Math.round((km / 55) * 60))}`}>
        <div style={S.chips}>
          {KM_STEPS.map((v) => (
            <Chip key={v} on={km === v} onClick={() => setKm(v)}>
              {v} km
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Richtung" aside={dir === 'zufall' ? 'Zufall' : DIRECTIONS.find((d) => d.id === dir)?.label}>
        <div style={S.compass}>
          {grid.map((g) =>
            g === 'mitte' ? (
              <button key={g} style={dir === 'zufall' ? S.compassOn : S.compassBtn} onClick={() => setDir('zufall')} aria-label="Zufällige Richtung">
                ?
              </button>
            ) : (
              <button key={g} style={dir === g ? S.compassOn : S.compassBtn} onClick={() => setDir(g)} aria-label={DIRECTIONS.find((d) => d.id === g)?.label}>
                {arrow[g]}
              </button>
            ),
          )}
        </div>
      </Section>
      <Section title="Profil">
        <div style={S.chips}>
          {PROFILE_CHOICES.map((p) => (
            <Chip key={p.id} on={props.profile === p.id} onClick={() => props.setProfile(p.id)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </Section>
      <button
        style={S.primary}
        disabled={props.busy || !start}
        onClick={() => start && props.onCreate(start.p, km, dir, `Rundtour ${km} km ab ${start.name.replace(/^Kartenmitte \((.*)\)$/, '$1')}`)}>
        {start ? 'Rundtour erstellen' : 'Erst Start wählen'}
      </button>
      {start ? (
        <button style={S.link} disabled={props.busy} onClick={() => props.onCreate(start.p, km, dir, `Rundtour ${km} km ab ${start.name}`)}>
          Andere Variante würfeln
        </button>
      ) : null}
    </div>
  );
}

/* ---------- Beschreiben (KI Formular) ---------- */

const DURATIONS: { label: string; min: number }[] = [
  { label: '1 h', min: 60 },
  { label: '2 h', min: 120 },
  { label: '3 h', min: 180 },
  { label: 'Halber Tag', min: 270 },
  { label: 'Tag', min: 420 },
];

function DescribePanel(props: {
  center: () => LatLon | null;
  busy: boolean;
  avoid: Avoid;
  onCreate: (job: (signal: AbortSignal, step: (s: PlanStep) => void) => Promise<PlannedTour>) => void;
}) {
  const [text, setText] = useState('Ab Heppenheim in den Odenwald, Mittag mit Aussicht');
  const wish = useMemo(() => parseWish(text), [text]);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [style, setStyle] = useState<Profile | null>(null);
  const [stops, setStops] = useState<Stop[] | null>(null);

  // Chips folgen dem Text, bis man sie selbst antippt
  const effMinutes = minutes ?? wish.minutes ?? (wish.km ? null : 180);
  const effProfile = style ?? wish.profile ?? 'kurvig';
  const effStops = stops ?? wish.stops;
  const km = targetKm({ km: minutes === null ? wish.km : undefined, minutes: effMinutes ?? undefined }, effProfile);

  const summary = [
    `Rundtour ${wish.startName ? `ab ${wish.startName}` : 'ab Kartenmitte'}`,
    wish.towardName ? `Richtung ${wish.towardName}` : wish.direction ? DIRECTIONS.find((d) => d.id === wish.direction)?.label.replace(/^/, 'Richtung ') : null,
    effMinutes && (minutes !== null || !wish.km) ? `etwa ${formatMinutes(effMinutes)}` : `${km} km`,
    PROFILES.find((p) => p.id === effProfile)?.label.toLowerCase(),
    effStops.length ? `mit ${effStops.map((s) => STOPS.find((x) => x.id === s)?.label).join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const create = () =>
    props.onCreate(async (signal, step) => {
      step('route');
      let start = props.center();
      let startName = 'Kartenmitte';
      if (wish.startName) {
        const hits = await searchTowns(wish.startName, start ?? undefined, signal);
        if (!hits.length) throw new Error(`Startort "${wish.startName}" nicht gefunden. Schreib ihn genauer oder wähle die Kartenmitte.`);
        start = hits[0].p;
        startName = hits[0].name;
      }
      if (!start) throw new Error('Kein Start gefunden. Nenne einen Ort im Text.');
      let bearing: number | undefined;
      if (wish.towardName) {
        const hits = await searchTowns(wish.towardName, start, signal);
        if (hits.length) bearing = bearingTo(start, hits[0].p);
      }
      return smartRoundTrip(
        { name: `${wish.towardName ?? 'Rundtour'} ab ${startName}`, start, km, direction: wish.direction ?? 'zufall', bearing, profile: effProfile, avoid: props.avoid },
        step,
        signal,
      );
    });

  return (
    <div style={S.stack}>
      <div>
        <h2 style={S.h2}>Tour beschreiben</h2>
        <p style={S.muted}>Schreib, was du erleben willst. Die Chips übernehmen, was erkannt wurde, und lassen sich anpassen.</p>
      </div>
      <textarea id="wish" aria-label="Was willst du erleben?" value={text} onChange={(e) => setText(e.target.value)} rows={3} style={S.textarea} placeholder="Was willst du erleben?" />
      <Section title="Dauer" aside={effMinutes ? formatMinutes(effMinutes) : `${km} km`}>
        <div style={S.chips}>
          {DURATIONS.map((d) => (
            <Chip key={d.label} on={effMinutes === d.min} onClick={() => setMinutes(d.min)}>
              {d.label}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Fahrstil">
        <div style={S.chips}>
          {PROFILES.filter((p) => p.id !== 'schnell').map((p) => (
            <Chip key={p.id} on={effProfile === p.id} onClick={() => setStyle(p.id)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Stopps unterwegs">
        <div style={S.chips}>
          {STOPS.map((s) => {
            const on = effStops.includes(s.id);
            return (
              <Chip key={s.id} on={on} onClick={() => setStops(on ? effStops.filter((x) => x !== s.id) : [...effStops, s.id])}>
                {s.label}
              </Chip>
            );
          })}
        </div>
        <p style={S.small}>Stopps werden bald direkt eingeplant, heute fließen sie noch nicht in die Route ein.</p>
      </Section>
      <div style={S.understood}>
        <span style={S.label}>Verstanden</span>
        <span>{summary}. Nur Straßen, die der Etappen Check freigibt.</span>
      </div>
      <button style={S.primary} disabled={props.busy} onClick={create}>
        Tour erstellen
      </button>
    </div>
  );
}

/* ---------- Bausteine ---------- */

function PlaceSearch(props: { near?: LatLon; placeholder: string; onPick: (p: Place) => void }) {
  const live = usePassLive();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const enough = q.trim().length >= 3;
  useEffect(() => {
    if (q.trim().length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const passHits: Place[] = searchPasses(PASSES, q, 3).map((p) => ({
        name: p.name,
        detail: `Pass, ${passSummary(p, undefined, passState(p, live).note)}, ${p.region}`,
        p: passPoint(p),
      }));
      // Städte und Gemeinden zuerst, damit "Heppenheim" die Stadt ist und nicht der Ortsteil von Worms
      Promise.all([searchTowns(q, props.near, ctrl.signal).catch(() => [] as Place[]), searchPlaces(q, props.near, ctrl.signal)])
        .then(([towns, places]) => {
          const near = (a: Place, b: Place) => Math.abs(a.p[0] - b.p[0]) + Math.abs(a.p[1] - b.p[1]) < 0.02;
          const merged: Place[] = [];
          for (const x of [...towns.slice(0, 3), ...places]) if (!merged.some((y) => y.name === x.name && near(x, y))) merged.push(x);
          const h = merged.slice(0, 7);
          setHits([...passHits, ...h.filter((x) => !passHits.some((y) => y.name === x.name))]);
          setOpen(true);
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, props.near, live]);
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={`search-${props.placeholder.replace(/\W+/g, '-')}`}
        aria-label={props.placeholder}
        placeholder={props.placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        style={S.search}
      />
      {open && enough && hits.length ? (
        <ul style={S.dropdown} role="listbox">
          {hits.map((h, i) => (
            <li key={i} style={{ listStyle: 'none' }}>
              <button
                style={S.dropItem}
                onClick={() => {
                  props.onPick(h);
                  setQ('');
                  setHits([]);
                  setOpen(false);
                }}>
                <span>{h.name}</span>
                <span style={S.dropDetail}>{h.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Section(props: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section style={S.section}>
      <div style={S.sectionHead}>
        <span style={S.label}>{props.title}</span>
        {props.aside ? <span style={S.aside}>{props.aside}</span> : null}
      </div>
      {props.children}
    </section>
  );
}

/** onSurface: Chip liegt in einer Surface Box und bekommt die hellere Füllung. */
function Chip(props: { on: boolean; onClick: () => void; onSurface?: boolean; children: ReactNode }) {
  return (
    <button aria-pressed={props.on} onClick={props.onClick} style={props.on ? S.chipOn : props.onSurface ? S.chipOnSurface : S.chip}>
      {props.children}
    </button>
  );
}

function Toggle(props: { id: string; on: boolean; label: string; note?: string; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={props.id} style={S.toggleRow}>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span>{props.label}</span>
        {props.note ? <span style={S.small}>{props.note}</span> : null}
      </span>
      <input id={props.id} type="checkbox" checked={props.on} onChange={(e) => props.onChange(e.target.checked)} style={{ display: 'none' }} />
      <span style={{ ...S.switch, background: props.on ? C.signal : C.line }}>
        <span style={{ ...S.knob, transform: props.on ? 'translateX(18px)' : 'translateX(0)' }} />
      </span>
    </label>
  );
}

function ElevationChart(props: { e: ElevationProfile; onHoverKm: (km: number | null) => void }) {
  const { e } = props;
  const W = 360;
  const H = 86;
  const maxKm = e.km[e.km.length - 1] || 1;
  const lo = Math.floor(e.min / 100) * 100;
  const hi = Math.ceil(e.max / 100) * 100 || lo + 100;
  const x = (km: number) => (km / maxKm) * W;
  const y = (m: number) => H - 4 - ((m - lo) / (hi - lo)) * (H - 12);
  const d = e.km.map((k, i) => `${i ? 'L' : 'M'}${x(k).toFixed(1)},${y(e.m[i]).toFixed(1)}`).join(' ');
  const [hover, setHover] = useState<number | null>(null);
  const idx = hover === null ? -1 : e.km.findIndex((k) => k >= hover);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={S.sectionHead}>
        <span style={S.label}>Höhenprofil</span>
        <span style={S.small}>{idx >= 0 ? `km ${Math.round(e.km[idx])}: ${Math.round(e.m[idx])} m` : `${lo} bis ${hi} m`}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', background: C.surface, borderRadius: 10, cursor: 'crosshair' }}
        role="img"
        aria-label={`Höhenprofil von ${e.min} bis ${e.max} Meter`}
        onMouseMove={(ev) => {
          const r = (ev.currentTarget as SVGSVGElement).getBoundingClientRect();
          const km = ((ev.clientX - r.left) / r.width) * maxKm;
          setHover(km);
          props.onHoverKm(km);
        }}
        onMouseLeave={() => {
          setHover(null);
          props.onHoverKm(null);
        }}>
        <path d={`${d} L${W},${H} L0,${H} Z`} fill={C.surface2} />
        <path d={d} fill="none" stroke={C.text} strokeWidth={1.4} />
        {idx >= 0 ? <line x1={x(e.km[idx])} x2={x(e.km[idx])} y1={0} y2={H} stroke={C.signal} strokeWidth={1.5} /> : null}
      </svg>
    </div>
  );
}

function Stat(props: { big: string; unit?: string; label: string; tone?: 'stop' | 'good'; small?: boolean }) {
  const color = props.tone === 'stop' ? C.signal : props.tone === 'good' ? C.good : C.text;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: DISPLAY, fontSize: props.small ? 20 : 30, lineHeight: 1, color, fontVariantNumeric: 'tabular-nums' }}>
        {props.big}
        {props.unit ? <span style={{ fontSize: 15 }}> {props.unit}</span> : null}
      </span>
      <span style={S.small}>{props.label}</span>
    </div>
  );
}

function Status(props: { text: string; onCancel: () => void }) {
  return (
    <div style={S.status} role="status">
      <span style={S.spinner} />
      <span style={{ flex: 1 }}>{props.text}</span>
      <button style={S.link} onClick={props.onCancel}>
        Abbrechen
      </button>
    </div>
  );
}

/* ---------- Stile ---------- */

const btnBase: CSSProperties = { font: `600 14px ${BODY}`, borderRadius: 999, cursor: 'pointer', padding: '0 16px', height: 40 };
const chipBase: CSSProperties = { font: `500 13px ${BODY}`, borderRadius: 999, cursor: 'pointer', padding: '0 12px', height: 32 };

const S: Record<string, CSSProperties> = {
  root: { display: 'flex', height: '100vh', width: '100%', background: C.ground, color: C.text, fontFamily: BODY, fontSize: 14, overflow: 'hidden' },
  mapWrap: { position: 'relative', flex: 1, minWidth: 0 },
  map: { position: 'absolute', inset: 0 },
  mapError: { position: 'absolute', top: 16, left: 16, right: 16, padding: 14, background: C.surface, borderRadius: 12, color: C.text },
  hint: { position: 'absolute', left: 16, bottom: 16, padding: '8px 12px', background: 'rgba(11,11,12,0.85)', borderRadius: 999, color: C.muted, fontSize: 12 },
  side: { width: 400, maxWidth: '100%', display: 'flex', flexDirection: 'column', background: C.ground },
  brandRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px' },
  brand: { fontFamily: DISPLAY, fontSize: 15, letterSpacing: 2 },
  ride: { display: 'flex', background: C.surface, borderRadius: 999, padding: 3 },
  rideOn: { ...chipBase, height: 28, background: C.text, color: C.ground, border: 'none', fontWeight: 700 },
  rideOff: { ...chipBase, height: 28, background: 'transparent', color: C.muted, border: 'none' },
  groupBox: { display: 'flex', flexDirection: 'column', gap: 10, background: C.surface, borderRadius: 12, padding: 14, lineHeight: 1.45 },
  tabs: { display: 'flex', gap: 2, padding: '0 14px 12px', overflowX: 'auto' },
  tab: { ...btnBase, height: 34, padding: '0 11px', background: 'transparent', color: C.muted, border: 'none', whiteSpace: 'nowrap' },
  tabOn: { ...btnBase, height: 34, padding: '0 11px', background: C.surface2, color: C.text, border: 'none', whiteSpace: 'nowrap' },
  scroll: { flex: 1, overflowY: 'auto', padding: '16px 20px 32px' },
  stack: { display: 'flex', flexDirection: 'column', gap: 18 },
  stackTight: { display: 'flex', flexDirection: 'column', gap: 8 },
  h2: { fontFamily: DISPLAY, fontSize: 24, textTransform: 'uppercase', margin: '0 0 6px', lineHeight: 1 },
  muted: { color: C.muted, margin: 0, lineHeight: 1.45 },
  small: { color: C.muted, fontSize: 12, margin: 0 },
  sampleTag: { alignSelf: 'flex-start', fontSize: 11, fontWeight: 700, color: C.warn, background: 'rgba(232,176,58,0.14)', padding: '2px 8px', borderRadius: 9 },
  nameInput: { background: 'transparent', border: 'none', color: C.text, font: `700 20px ${BODY}`, padding: 0, outline: 'none' },
  statsRow: { display: 'flex', gap: 26, paddingTop: 6 },
  checkGood: { background: 'rgba(76,195,138,0.12)', color: C.good, padding: '10px 12px', borderRadius: 12, fontWeight: 600 },
  checkBad: { background: 'rgba(226,70,28,0.14)', color: '#FF8A66', padding: '10px 12px', borderRadius: 12, fontWeight: 600 },
  search: { width: '100%', boxSizing: 'border-box', height: 44, padding: '0 14px', background: C.surface, color: C.text, border: 'none', borderRadius: 12, font: `500 14px ${BODY}`, outline: 'none' },
  dropdown: { position: 'absolute', zIndex: 5, top: 48, left: 0, right: 0, margin: 0, padding: 4, background: C.surface, border: 'none', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' },
  dropItem: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', color: C.text, cursor: 'pointer', borderRadius: 8, textAlign: 'left', font: `500 14px ${BODY}` },
  dropDetail: { color: C.muted, fontSize: 12 },
  wpList: { margin: 0, padding: 0, display: 'flex', flexDirection: 'column' },
  wpRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' },
  wpDot: { width: 24, height: 24, borderRadius: 12, background: C.text, color: C.ground, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  wpDotEnd: { width: 24, height: 24, borderRadius: 12, background: C.signal, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  wpName: { flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', color: C.text, font: `600 14px ${BODY}`, cursor: 'pointer', padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  iconBtn: { background: 'transparent', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', padding: '0 4px' },
  leg: { marginLeft: 11, paddingLeft: 21, borderLeft: `2px dotted ${C.line}`, display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 6 },
  legKm: { color: C.muted, fontSize: 12, fontVariantNumeric: 'tabular-nums' },
  warnStop: { display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left', background: 'rgba(226,70,28,0.14)', color: '#FF8A66', border: 'none', borderRadius: 10, padding: '8px 10px', cursor: 'pointer', font: `500 13px ${BODY}` },
  warnSoft: { display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left', background: 'rgba(232,176,58,0.12)', color: C.warn, border: 'none', borderRadius: 10, padding: '8px 10px', cursor: 'pointer', font: `500 13px ${BODY}` },
  warnWhy: { color: C.muted, fontSize: 12 },
  section: { display: 'flex', flexDirection: 'column', gap: 10 },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: C.muted },
  aside: { fontSize: 13, fontWeight: 600 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: { ...chipBase, background: C.surface, color: C.text, border: 'none' },
  chipOnSurface: { ...chipBase, background: C.surface2, color: C.text, border: 'none' },
  chipOn: { ...chipBase, background: C.text, color: C.ground, border: 'none', fontWeight: 700 },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer', padding: '4px 0' },
  switch: { width: 40, height: 22, borderRadius: 11, position: 'relative', flexShrink: 0, transition: 'background 150ms' },
  knob: { position: 'absolute', top: 2, left: 2, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'transform 150ms' },
  btnRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  primary: { ...btnBase, height: 46, background: C.signal, color: '#fff', border: 'none', fontWeight: 700, flex: 1 },
  secondary: { ...btnBase, background: C.surface, color: C.text, border: 'none', flex: 1 },
  secondaryOnSurface: { ...btnBase, background: C.surface2, color: C.text, border: 'none', flex: 1 },
  link: { background: 'transparent', border: 'none', color: C.text, textDecoration: 'underline', cursor: 'pointer', font: `600 13px ${BODY}`, padding: 0, alignSelf: 'flex-start' },
  startRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.surface, padding: '10px 12px', borderRadius: 12, fontWeight: 600 },
  compass: { display: 'grid', gridTemplateColumns: 'repeat(3, 44px)', gap: 6 },
  compassBtn: { width: 44, height: 44, borderRadius: 12, background: C.surface, color: C.text, border: 'none', fontSize: 18, cursor: 'pointer' },
  compassOn: { width: 44, height: 44, borderRadius: 12, background: C.signal, color: '#fff', border: 'none', fontSize: 18, cursor: 'pointer' },
  textarea: { width: '100%', boxSizing: 'border-box', background: C.surface, color: C.text, border: 'none', borderRadius: 14, padding: 14, font: `500 15px/1.4 ${BODY}`, resize: 'vertical', outline: 'none' },
  understood: { display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.45 },
  status: { display: 'flex', alignItems: 'center', gap: 10, margin: '12px 20px 0', padding: '10px 12px', background: C.surface, borderRadius: 12 },
  spinner: { width: 14, height: 14, borderRadius: 7, border: `2px solid ${C.line}`, borderTopColor: C.signal, animation: 'cdspin 0.8s linear infinite' },
  error: { margin: '12px 20px 0', padding: '10px 12px', background: 'rgba(226,70,28,0.14)', color: '#FF8A66', borderRadius: 12 },
  errorText: { color: '#FF8A66', margin: 0, fontSize: 13 },
  engine: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', color: C.muted, fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  menu: { position: 'absolute', zIndex: 10, display: 'flex', flexDirection: 'column', minWidth: 200, padding: 4, background: C.surface, border: 'none', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' },
  photoToggle: { position: 'absolute', top: 12, left: 12, zIndex: 5, height: 32, padding: '0 12px', borderRadius: 16, border: 'none', background: 'rgba(11,11,12,0.85)', color: C.muted, font: `600 13px ${BODY}`, cursor: 'pointer' },
  photoToggleOn: { position: 'absolute', top: 12, left: 12, zIndex: 5, height: 32, padding: '0 12px', borderRadius: 16, border: `1px solid ${C.signal}`, background: 'rgba(11,11,12,0.85)', color: C.text, font: `600 13px ${BODY}`, cursor: 'pointer' },
  gallery: { position: 'absolute', left: 12, right: 12, bottom: 40, zIndex: 6, display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 14, background: 'rgba(22,22,24,0.96)', border: 'none', color: C.text, font: `500 14px ${BODY}` },
  thumbs: { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 },
  thumbBtn: { flex: 'none', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 8, overflow: 'hidden' },
  thumb: { display: 'block', height: 110, width: 'auto', borderRadius: 8 },
  lightbox: { position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 },
  lightboxImg: { maxWidth: '100%', maxHeight: 'calc(100% - 60px)', objectFit: 'contain', borderRadius: 6 },
  lightboxBar: { display: 'flex', alignItems: 'center', gap: 12, color: C.text, font: `500 14px ${BODY}` },
  lbBtn: { width: 36, height: 36, borderRadius: 18, border: 'none', background: C.surface, color: C.text, fontSize: 20, cursor: 'pointer' },
  rideCode: { font: `900 28px ${DISPLAY}`, letterSpacing: 4, color: C.text },
  accountBox: { display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 14, background: C.surface, border: 'none', color: C.text, font: `500 14px ${BODY}` },
  menuHead: { display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 12px 12px', marginBottom: 4, color: C.text, font: `500 14px ${BODY}`, maxWidth: 260 },
  winterNote: { display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 12, background: 'rgba(232,176,58,0.12)', color: C.warn, font: `500 13px ${BODY}`, lineHeight: 1.4 },
  winterLink: { color: C.text, fontWeight: 600 },
  passList: { margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  passRow: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 4px', background: 'transparent', border: 'none', color: C.text, cursor: 'pointer', textAlign: 'left', font: `500 14px ${BODY}` },
  passName: { display: 'block', fontWeight: 600 },
  passDot: { width: 10, height: 10, borderRadius: 5, background: C.text, flexShrink: 0 },
  passDotIcon: { width: 12, height: 12, borderRadius: 6, background: C.warn, flexShrink: 0 },
  menuItem: { textAlign: 'left', background: 'transparent', border: 'none', color: C.text, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', font: `500 14px ${BODY}` },
  saveBox: { display: 'flex', gap: 8, alignItems: 'center' },
  qrBox: { display: 'flex', flexDirection: 'column', gap: 10, padding: 14, background: C.surface2, border: 'none', borderRadius: 14, color: C.text, font: `500 14px ${BODY}` },
  qrImg: { width: '100%', maxWidth: 340, aspectRatio: '1', alignSelf: 'center', borderRadius: 10, imageRendering: 'pixelated' },
  libRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 10px', borderRadius: 12, listStyle: 'none' },
  libOpen: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start', textAlign: 'left', background: 'transparent', border: 'none', color: C.text, cursor: 'pointer', font: `500 14px ${BODY}`, padding: 0 },
  badgeStop: { fontSize: 11, fontWeight: 700, color: '#FF8A66', background: 'rgba(226,70,28,0.16)', padding: '2px 8px', borderRadius: 9, whiteSpace: 'nowrap' },
  badgeGood: { fontSize: 11, fontWeight: 700, color: C.good, background: 'rgba(76,195,138,0.14)', padding: '2px 8px', borderRadius: 9, whiteSpace: 'nowrap' },
  dangerSmall: { background: C.signal, color: '#fff', border: 'none', borderRadius: 999, padding: '4px 10px', cursor: 'pointer', font: `600 12px ${BODY}` },
};

// Drehanimation für den Ladekreis einmalig registrieren
if (typeof document !== 'undefined' && !document.getElementById('cd-spin')) {
  const st = document.createElement('style');
  st.id = 'cd-spin';
  st.textContent = '@keyframes cdspin{to{transform:rotate(360deg)}} button:disabled{opacity:.45;cursor:default} [role=menuitem]:hover{background:#1F1F22} button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid #E2461C;outline-offset:2px}';
  document.head.appendChild(st);
}
