/**
 * Web Planer, Seitenleiste Tour: Etappen, Speichern, an die App senden, Stopps, Pässe einbauen, Fotos.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { reverseName } from '@/lib/geocode';
import { formatMinutes } from '@/lib/intent';
import { type RouteFormat } from '@/lib/route-file';
import { flatten, formatKm, legs, PROFILE_CHOICES, type LatLon, type Profile, type Tour } from '@/lib/tour';
import { type TourFun } from '@/lib/fun-score';
import { folders, useLibrary } from '@/lib/library';
import { type Avoid } from '@/lib/valhalla';
import { createHandoff } from '@/lib/handoff';
import { encodeTour, shareUrl } from '@/lib/share-code';
import { closedHint, passState, type LiveRow } from '@/lib/pass-live';
import { STOP_KINDS, stopsAlong, type StopHit, type StopKind } from '@/lib/stops-along';
import { photoDate, photoUrl, thumbUrl, type PhotoGroup } from '@/lib/photos';
import { PASS_STATUS_URL, PASSES, passPoint, passSummary, searchPasses, type Pass } from '@/lib/passes';

import QRCode from 'qrcode';

import { Colors, Spacing } from '@/constants/theme';

import { type PlannedTour } from './web-shared';
import { GroupPanel } from './web-account-panels';
import { Accordion, Chip, Metric, PlaceSearch, Section, Toggle } from './web-parts';
import { FunPillWeb } from './web-fun';
import { S } from './web-styles';

/* ---------- Tour ---------- */

export function TourPanel(props: {
  tour: PlannedTour;
  group: boolean;
  fun: TourFun | null;
  onFun: () => void;
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
  const pts = tour.wegpunkte;
  const hint = closedHint(props.passes.map((x) => x.pass), props.live);

  const avoidText = [props.avoid.closures && 'Sperrungen', props.avoid.rough && 'rauer Belag', props.avoid.ferries && 'Fähren', props.avoid.tolls && 'Maut'].filter(Boolean).join(', ') || 'Nichts';

  return (
    <div style={S.stack}>
      {/* Kopf wie in der App: Tourname, darunter Strecke, Fahrzeit und Fahrspaß */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {props.isSample ? <span style={S.sampleTag}>Beispiel: deine RCO Etappe mit Etappen Check</span> : null}
        <input id="tour-name" aria-label="Tourname" value={tour.name} onChange={(e) => props.onRename(e.target.value)} style={S.headline} />
        {tour.linie.length ? (
          <div style={S.metrics}>
            <Metric label="Strecke" value={`${formatKm(tour.laenge_km, 0)} km`} />
            <Metric label="Fahrzeit" value={tour.minutes ? `${formatMinutes(Math.round(tour.minutes))} h` : '…'} />
            <Metric label="Fahrspaß" value="">
              {props.fun ? <FunPillWeb fun={props.fun} onOpen={props.onFun} /> : <span style={S.metricValue}>…</span>}
            </Metric>
          </div>
        ) : null}
      </div>

      {/* Etappen */}
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
                    <button aria-label="Punkt entfernen" style={S.iconBtn} onClick={() => props.onRemove(i)} disabled={props.busy}>
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
      ) : null}
      <PlaceSearch near={pts[pts.length - 1]} placeholder={pts.length ? 'Ziel oder Zwischenziel hinzufügen' : 'Wo geht es los?'} onPick={(p) => props.onAddPlace(p.p)} />

      <Section title="Profil">
        <div style={S.chips}>
          {PROFILE_CHOICES.map((p) => (
            <Chip key={p.id} on={props.profile === p.id} onClick={() => props.setProfile(p.id)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </Section>

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
        <Section title="Highlights" aside={String(props.passes.length)}>
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

      <div>
        {pts.length >= 2 && !props.isSample ? (
          <Accordion label="Pässe einbauen" summary={props.passesNear.length ? `${props.passesNear.length} in der Nähe` : 'Keine in der Nähe'}>
            <AddPass near={props.passesNear} live={props.live} busy={props.busy} onAdd={props.onAddPass} />
          </Accordion>
        ) : null}
        {pts.length >= 2 && !props.isSample ? (
          <Accordion label="Unterwegs einplanen" summary="Tanken, Essen, Aussicht">
            <StopsPanel tour={props.tour} busy={props.busy} onAdd={props.onAddVia} />
          </Accordion>
        ) : null}
        <Accordion label="Vermeiden" summary={avoidText}>
          <Toggle id="av-closures" on={props.avoid.closures} label="Gesperrte Straßen" note="calimoto warnt nur, wir umfahren" onChange={(v) => props.setAvoid({ ...props.avoid, closures: v })} />
          <Toggle id="av-rough" on={props.avoid.rough} label="Rauer Belag und Kopfsteinpflaster" onChange={(v) => props.setAvoid({ ...props.avoid, rough: v })} />
          <Toggle id="av-ferries" on={props.avoid.ferries} label="Fähren" onChange={(v) => props.setAvoid({ ...props.avoid, ferries: v })} />
          <Toggle id="av-tolls" on={props.avoid.tolls} label="Mautstraßen" onChange={(v) => props.setAvoid({ ...props.avoid, tolls: v })} />
        </Accordion>
        <Accordion label="Gruppenfahrt" summary="Code für die Gruppe, Live Positionen" defaultOpen={props.group}>
          <GroupPanel tour={tour} profile={props.profile} avoid={props.avoid} isSample={props.isSample} />
        </Accordion>
        {!props.isSample && tour.linie.length ? (
          <Accordion label="Ordner" summary={props.savedId ? 'Gespeichert in Meine Touren' : 'Noch nicht gespeichert'}>
            <SaveBox savedId={props.savedId} onSave={props.onSave} busy={props.busy} />
          </Accordion>
        ) : null}
        <Accordion label="Datei" summary="GPX und KML, Richtung umkehren">
          <div style={S.btnRow}>
            <button style={S.secondary} onClick={() => fileRef.current?.click()} disabled={props.busy}>
              Importieren
            </button>
            <button style={S.secondary} disabled={props.busy || pts.length < 2} onClick={props.onReverse}>
              Umkehren
            </button>
          </div>
          <div style={S.btnRow}>
            <button style={S.secondary} onClick={() => props.onExport('gpx')} disabled={tour.linie.length === 0}>
              GPX exportieren
            </button>
            <button style={S.secondary} onClick={() => props.onExport('kml')} disabled={tour.linie.length === 0}>
              KML exportieren
            </button>
          </div>
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
          {!props.isSample ? (
            <button style={S.link} onClick={props.onSample}>
              Beispiel RCO EAST 26 E3 laden
            </button>
          ) : null}
        </Accordion>
      </div>
    </div>
  );
}

export function SaveBox(props: { savedId: string | null; onSave: (folder: string) => void; busy: boolean }) {
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
export function SendToApp(props: { tour: Tour; profile: Profile; avoid: Avoid; onClose: () => void }) {
  const { tour, profile, avoid } = props;
  const [qr, setQr] = useState<{ tour: Tour; url: string; short: boolean } | null>(null);
  useEffect(() => {
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
      const url = await QRCode.toDataURL(shareUrl(code), { errorCorrectionLevel: 'M', margin: 3, width: 720, color: { dark: Colors.ground, light: '#FFFFFF' } });
      if (alive) setQr({ tour, url, short });
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tour, profile, avoid]);
  const current = qr && qr.tour === tour ? qr : null;
  return (
    <div style={S.overlay} onClick={props.onClose}>
      <div role="dialog" aria-modal="true" aria-label="An die App senden" style={{ ...S.dialog, width: 400 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ ...S.metricValue, fontSize: 22 }}>An die App senden</span>
          <button aria-label="Schließen" style={S.closeBtn} onClick={props.onClose}>
            ×
          </button>
        </div>
        {current ? <img src={current.url} alt="QR Code der Tour" style={S.qrImg} /> : <div style={{ ...S.qrImg, background: '#fff' }} />}
        <p style={{ ...S.muted, fontSize: 15 }}>
          Mit der iPhone Kamera scannen, die Tour öffnet sich in Cumo Drive.{' '}
          {current && !current.short
            ? 'Ohne Verbindung zum Server enthält der Code nur Stützpunkte, die App plant die Strecke neu.'
            : 'Die App übernimmt die Tour genau so, wie sie hier geplant ist.'}
        </p>
      </div>
    </div>
  );
}

/* ---------- Fotos ---------- */

/** Stopps an der Strecke aus OpenStreetMap: Super Plus, Aussicht mit Parkplatz, Mittag, Kaffee. */
export function StopsPanel(props: { tour: PlannedTour; busy: boolean; onAdd: (p: LatLon) => void }) {
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
            <li key={h.id} style={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: Spacing.s }}>
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
export function AddPass(props: { near: { pass: Pass; dKm: number }[]; live: Map<string, LiveRow> | null; busy: boolean; onAdd: (p: Pass) => void }) {
  const [q, setQ] = useState('');
  const searching = q.trim().length >= 2;
  const hits: { pass: Pass; dKm: number | null }[] = searching ? searchPasses(PASSES, q, 5).map((pass) => ({ pass, dKm: null })) : props.near;
  return (
    <Section title="Pässe einbauen" aside={!searching && props.near.length ? 'in der Nähe' : undefined}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pass suchen, zum Beispiel Stelvio" style={S.search} aria-label="Pass suchen" />
      {hits.length ? (
        <ol style={S.passList}>
          {hits.map(({ pass, dKm }) => (
            <li key={pass.id} style={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: Spacing.s }}>
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

export function Gallery(props: {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.s }}>
        <div>
          <b>{title}</b>
          <span style={{ ...S.dropDetail, marginLeft: Spacing.s }}>
            {g.photos.length} {g.photos.length === 1 ? 'Foto' : 'Fotos'}, CUMO DRIVERS CLUB, {photoDate(g.photos[0])}
          </span>
        </div>
        <div style={{ display: 'flex', gap: Spacing.s, alignItems: 'center', flexShrink: 0 }}>
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
