/**
 * Web Planer, Bausteine der Route: Stopps an der Strecke, Pässe einbauen, Fotogalerie.
 */
import { useEffect, useMemo, useState } from 'react';

import { reverseName } from '@/lib/geocode';
import { flatten, type LatLon } from '@/lib/tour';

import { passState, type LiveRow } from '@/lib/pass-live';
import { STOP_KINDS, stopsAlong, type StopHit, type StopKind } from '@/lib/stops-along';
import { photoDate, photoUrl, thumbUrl, type PhotoGroup } from '@/lib/photos';
import { PASSES, passSummary, searchPasses, type Pass } from '@/lib/passes';
import { highlightsForLeg, passLevel, type HighlightCandidate } from '@/lib/highlight-candidates';

import { Spacing } from '@/constants/theme';

import { BODY, C, type PlannedTour } from './web-shared';
import { Chip, Gauge, Section } from './web-parts';
import { S } from './web-styles';
import { t } from '@/i18n';

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
    <Section title={t('Unterwegs einplanen')}>
      <div style={S.chips}>
        {STOP_KINDS.map((k) => (
          <Chip key={k.id} on={kind === k.id} onClick={() => setKind(kind === k.id ? null : k.id)}>
            {k.label}
          </Chip>
        ))}
      </div>
      {kind && <p style={S.muted}>{STOP_KINDS.find((k) => k.id === kind)?.hint}</p>}
      {kind && !cur && <p style={S.muted}>{t('Wird gesucht …')}</p>}
      {cur?.error && <p style={S.muted}>{t('Gerade nicht erreichbar (')}{cur.error}{t('). Versuch es gleich noch mal.')}</p>}
      {cur?.hits && cur.hits.length === 0 && (
        <p style={S.muted}>{kind === 'mittag' || kind === 'kaffee' ? t('Hier haben wir noch keine Empfehlung. Jedes andere Lokal findest du über die Suche bei den Punkten.') : t('Nichts direkt an der Strecke gefunden.')}</p>
      )}
      {cur?.hits && cur.hits.length > 0 && (
        <ol style={S.passList}>
          {cur.hits.map((h) => (
            <li key={h.id} style={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: Spacing.s }}>
              <span style={S.legKm}>km {Math.round(h.km)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={S.passName}>{h.name}</span>
                <span style={S.dropDetail}>{h.detail || t('direkt an der Route')}</span>
              </span>
              {h.offM >= 150 ? <span style={detourTag} aria-label={t('Umweg {v0} Minuten', { v0: detourMin(h.offM) })}>+{detourMin(h.offM)} min</span> : null}
              <button style={{ ...S.secondary, flex: 'none', padding: '0 12px' }} disabled={props.busy} onClick={() => props.onAdd(h.p)}>
                {t('Einplanen')}
              </button>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

/**
 * Highlights und Pässe einbauen (wie in der App seit 10.11.): je Etappe die Pässe und Traumstrecken, die dort einen
 * Bogen ergeben, mit Fahrspaß Pegel und Umweg in Minuten, nach Etappe geordnet. Dazu die Suche nach einem Pass.
 * Eine Strecke wird ganz durchfahren (insertRoad), ein Pass als Zwischenziel eingefügt.
 */
export function AddHighlight(props: {
  pts: LatLon[];
  taken: Set<string>;
  live: Map<string, LiveRow> | null;
  busy: boolean;
  onAdd: (leg: number, c: HighlightCandidate) => void;
  onAddPass: (p: Pass) => void;
}) {
  const [q, setQ] = useState('');
  const searching = q.trim().length >= 2;
  const rows = useMemo(() => {
    if (searching) return [];
    const seen = new Set<string>();
    const out: { leg: number; c: HighlightCandidate }[] = [];
    for (let i = 0; i < props.pts.length - 1; i++) {
      for (const c of highlightsForLeg({ a: props.pts[i], b: props.pts[i + 1] }, 8000)) {
        if (seen.has(c.key) || props.taken.has(c.name)) continue;
        seen.add(c.key);
        out.push({ leg: i, c });
      }
    }
    // je Etappe die kleinsten Umwege zuerst, insgesamt höchstens 12
    return out.sort((x, y) => x.leg - y.leg || x.c.extraMin - y.c.extraMin).slice(0, 12);
  }, [props.pts, props.taken, searching]);
  const hits = searching ? searchPasses(PASSES, q, 6) : [];
  return (
    <Section title={t('Highlights/Pässe')} aside={!searching && rows.length ? t('auf deinen Etappen') : undefined}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Pass suchen, zum Beispiel Stelvio')} style={S.search} aria-label={t('Pass suchen')} />
      {searching ? (
        hits.length ? (
          <ol style={S.passList}>
            {hits.map((pass) => (
              <li key={pass.id} style={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: Spacing.s }}>
                <Gauge level={passLevel(pass)} size={22} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={S.passName}>{pass.name}</span>
                  <span style={S.dropDetail}>{passSummary(pass, undefined, passState(pass, props.live).note)}</span>
                </span>
                <button
                  style={{ ...S.secondary, flex: 'none', padding: '0 12px' }}
                  disabled={props.busy}
                  onClick={() => {
                    props.onAddPass(pass);
                    setQ('');
                  }}>
                  {t('Einbauen')}
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p style={S.muted}>{t('Kein Pass gefunden.')}</p>
        )
      ) : rows.length ? (
        <ol style={S.passList}>
          {rows.map(({ leg, c }) => (
            <li key={c.key} style={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: Spacing.s }}>
              <Gauge level={c.level} size={22} label={t('Fahrspaß {v0}', { v0: FUN_NAMES[c.level] ?? '' })} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={S.passName}>{c.name}</span>
                <span style={S.dropDetail}>{[FUN_NAMES[c.level], c.detail, props.pts.length > 2 ? t('Etappe {v0}', { v0: leg + 1 }) : null].filter(Boolean).join(', ')}</span>
              </span>
              {c.extraMin > 2 ? <span style={detourTag}>+{c.extraMin} min</span> : null}
              <button style={{ ...S.secondary, flex: 'none', padding: '0 12px' }} disabled={props.busy} onClick={() => props.onAdd(leg, c)}>
                {t('Einbauen')}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p style={S.muted}>{t('Auf deinen Etappen liegt kein Highlight mit gutem Bogen. Such einen Pass über das Feld.')}</p>
      )}
    </Section>
  );
}

/** grober Umweg hin und zurück bei 35 km/h, wie in der App */
const detourMin = (offM: number) => Math.max(1, Math.round(((2 * offM) / 1000 / 35) * 60));
const FUN_NAMES: Record<number, string> = { get 1() { return t('Nett'); }, get 2() { return t('Lohnend'); }, get 3() { return t('Stark'); }, get 4() { return t('Traumstraße'); }, get 5() { return t('Legende'); } };
/** Umweg wie in der App: gelbe Plakette */
const detourTag: React.CSSProperties = { flex: 'none', padding: '3px 8px', borderRadius: 10, background: 'rgba(232,176,58,0.16)', color: C.warn, font: `700 13px ${BODY}`, fontVariantNumeric: 'tabular-nums' };

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
  const title = g.pass ? g.pass.name : place?.key === g.key ? t('Fotospot bei {name}', { name: place.name }) : 'Fotospot';
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
      <div style={S.lightbox} role="dialog" aria-label={t('Foto {v0} von {length}', { v0: i + 1, length: g.photos.length })} onClick={() => props.onChange({ g, i: null })}>
        <img src={photoUrl(ph)} alt={`${title}, ${photoDate(ph)}`} style={S.lightboxImg} onClick={(e) => e.stopPropagation()} />
        <div style={S.lightboxBar} onClick={(e) => e.stopPropagation()}>
          <button style={S.lbBtn} onClick={() => props.onChange({ g, i: (i - 1 + g.photos.length) % g.photos.length })} aria-label={t('Vorheriges Foto')}>‹</button>
          <span>
            {title}, {photoDate(ph)} · {i + 1} / {g.photos.length}
          </span>
          <button style={S.lbBtn} onClick={() => props.onChange({ g, i: (i + 1) % g.photos.length })} aria-label={t('Nächstes Foto')}>›</button>
          <button style={S.lbBtn} onClick={() => props.onChange({ g, i: null })} aria-label={t('Schließen')}>×</button>
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
            {g.photos.length} {g.photos.length === 1 ? t('Foto') : t('Fotos')}, CUMO DRIVERS CLUB, {photoDate(g.photos[0])}
          </span>
        </div>
        <div style={{ display: 'flex', gap: Spacing.s, alignItems: 'center', flexShrink: 0 }}>
          <button style={{ ...S.secondaryOnSurface, flex: 'none', padding: '0 14px' }} disabled={!props.canAdd} onClick={() => props.onAddVia(g.p)}>
            {t('Als Zwischenziel einfügen')}
          </button>
          <button aria-label={t('Galerie schließen')} style={S.iconBtn} onClick={() => props.onChange(null)}>
            ×
          </button>
        </div>
      </div>
      <div style={S.thumbs}>
        {g.photos.map((ph, k) => (
          <button key={ph.id} style={S.thumbBtn} onClick={() => props.onChange({ g, i: k })} aria-label={t('Foto {v0} öffnen', { v0: k + 1 })}>
            <img src={thumbUrl(ph)} alt="" style={S.thumb} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}
