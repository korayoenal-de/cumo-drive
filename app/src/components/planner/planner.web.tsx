/**
 * Web Planer (Desktop): Karte links, Seitenleiste rechts.
 * Modi: Tour (Wegpunkte, Abschnitte, Etappen Check, GPX), Rundtour, Beschreiben (KI Formular).
 * Expo nimmt diese Datei nur im Browser; auf dem Handy gilt planner.tsx.
 * Aufgeteilt: Seitenleisten in web-tour-panels, web-account-panels, web-create-panels; Bausteine in
 * web-parts; Konstanten in web-shared; Styles in web-styles.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { checkLine } from '@/lib/check';
import { reverseName } from '@/lib/geocode';
import { planChecked, type PlanStep } from '@/lib/plan';
import { smartRoundTrip } from '@/lib/smart-roundtrip';
import { exportTour, type RouteFormat } from '@/lib/route-file';
import { flatten, parseRouteFile, reverseTour, type LatLon, type Profile, type Tour } from '@/lib/tour';
import { countCurves, elevationProfile, resample, type ElevationProfile } from '@/lib/stats';
import { cumoAvailable } from '@/lib/cumo-routing';
import { saveTour, syncLibrary } from '@/lib/library';
import { RIDE_MODES, useRideMode } from '@/lib/ride-mode';
import { distToProbe, insertVia, passesNearRoute, probeLine } from '@/lib/route-edit';
import { DEFAULT_AVOID, type Avoid } from '@/lib/valhalla';
import { useRide } from '@/lib/group/ride';
import { passState, usePassLive } from '@/lib/pass-live';
import { photoGroupsGeoJson, usePhotoGroups, type PhotoGroup } from '@/lib/photos';
import { PASSES, passesAlong, passesGeoJson, passPoint, passSummary } from '@/lib/passes';

import { addMemberLayers, addPassLayers, addPhotoLayers, addTourLayers, boundsOf, hoverGeoJson, loadMapLibre, MAP_STYLE, pointsGeoJson, tourGeoJson, type MapInstance } from './map-web';

import { C, type MenuState, type Mode, type PlannedTour, SAMPLE, STEP_TEXT } from './web-shared';
import { Gallery, TourPanel } from './web-tour-panels';
import { LibraryPanel } from './web-account-panels';
import { DescribePanel, RoundTripPanel } from './web-create-panels';
import { Status } from './web-parts';
import { S } from './web-styles';


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
