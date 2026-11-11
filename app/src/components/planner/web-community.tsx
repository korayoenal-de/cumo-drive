/**
 * Web Planer, Community wie in der App (app/(tabs)/community.tsx): drei Bereiche über einen kompakten
 * Umschalter, Routen, Ausfahrten und Drivers, dazu Pins auf der großen Karte. Routen öffnen sich als
 * ungespeicherte Kopie im Planer, das Lesezeichen legt sie in Meine Touren. Ausfahrten zeigen Zeit,
 * Treffpunkt und Plätze, Mitfahren lässt sich anfragen. Chat, Nachrichten und das Verwalten eigener
 * Ausfahrten bleiben in der App, das sagt ein Hinweis statt einer halben Funktion.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { arrival, ausfahrtTour, clock, freeSeats, listAusfahrten, longDate, requestAusfahrt, shortDate, withdrawAusfahrt, type Ausfahrt } from '@/lib/ausfahrten';
import { useSession } from '@/lib/auth';
import { copyCommunityTour, listCommunity, loadCommunityTour, removeKeepPublished, type CommunityTour } from '@/lib/community';
import { deleteTour, saveTour, syncLibrary, useLibrary } from '@/lib/library';
import { useCommunityLine } from '@/lib/community-lines';
import { kmBetween, listDrivers, type Driver } from '@/lib/drivers';
import { TOUR_FUN_NAMES, tourFunLevel } from '@/lib/fun-score';
import { showToast } from '@/lib/toast';
import { formatKm, type LatLon, type Profile, type Tour } from '@/lib/tour';
import { currentVehicle, vehicleName } from '@/lib/vehicle';
import { Radius, Spacing } from '@/constants/theme';

import { bigDuration } from './planner-shared';
import { Chip, Gauge, Metric } from './web-parts';
import { BODY, C } from './web-shared';
import { S } from './web-styles';
import { Badge, Field, FromBadge, pillBtn, RouteThumb, Segmented, ViewTitle } from './web-ui';

export type Seg = 'routen' | 'ausfahrten' | 'drivers';
export type CommunityPin = { id: string; kind: 'route' | 'ausfahrt' | 'driver'; p: LatLon; label: string; ring?: string };

type Sort = 'neu' | 'kurven' | 'kurz' | 'lang';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'neu', label: 'Neueste' },
  { id: 'kurven', label: 'Kurvigste' },
  { id: 'kurz', label: 'Kurz' },
  { id: 'lang', label: 'Lang' },
];

const ringColor = (d: Driver) => d.garage?.find((g) => g.look)?.look?.color ?? C.text;

export function CommunityPanel(props: {
  selected: string | null;
  onSelect: (id: string | null, p?: LatLon) => void;
  onPins: (pins: CommunityPin[]) => void;
  /** Tour als ungespeicherte Kopie im Planer öffnen */
  onOpenTour: (t: Tour & { minutes?: number; author?: string; communityId?: string }, profile: Profile) => void;
  onSettings: () => void;
}) {
  const session = useSession();
  const userId = session?.user.id;
  const [seg, setSeg] = useState<Seg>('routen');
  const [tours, setTours] = useState<CommunityTour[] | null>(null);
  const [rides, setRides] = useState<Ausfahrt[] | null>(null);
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [sort, setSort] = useState<Sort>('neu');

  const load = useCallback(() => {
    listCommunity()
      .then((l) => {
        setTours(l);
        setErr(null);
      })
      .catch((e: Error) => setErr(e.message));
    listAusfahrten()
      .then(setRides)
      .catch(() => setRides((r) => r ?? []));
    listDrivers()
      .then(setDrivers)
      .catch(() => setDrivers((d) => d ?? []));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load, userId]);

  const shownTours = useMemo(() => {
    const n = q.trim().toLowerCase();
    const l = (tours ?? []).filter((t) => !n || t.name.toLowerCase().includes(n) || (t.author ?? '').toLowerCase().includes(n) || (t.description ?? '').toLowerCase().includes(n));
    const density = (t: CommunityTour) => (t.curves ?? 0) / Math.max(1, Number(t.km));
    if (sort === 'kurven') l.sort((a, b) => density(b) - density(a));
    if (sort === 'kurz') l.sort((a, b) => Number(a.km) - Number(b.km));
    if (sort === 'lang') l.sort((a, b) => Number(b.km) - Number(a.km));
    return l;
  }, [tours, q, sort]);

  const me = drivers?.find((d) => d.isMe);
  const shownDrivers = useMemo(() => {
    const n = dq.trim().toLowerCase();
    const l = (drivers ?? []).filter(
      (d) => !n || d.name.toLowerCase().includes(n) || (d.homeName ?? '').toLowerCase().includes(n) || (d.car ?? '').toLowerCase().includes(n) || (d.garage ?? []).some((g) => g.name.toLowerCase().includes(n)),
    );
    const dist = (d: Driver) => (me?.home && d.home ? kmBetween(me.home, d.home) : Number.POSITIVE_INFINITY);
    return l.sort((a, b) => Number(b.isMe) - Number(a.isMe) || dist(a) - dist(b) || a.name.localeCompare(b.name, 'de'));
  }, [drivers, dq, me]);

  const pins: CommunityPin[] = useMemo(() => {
    if (seg === 'drivers')
      return shownDrivers.filter((d): d is Driver & { home: LatLon } => !!d.home).map((d) => ({ id: d.id, kind: 'driver' as const, p: d.home, label: d.name, ring: ringColor(d) }));
    if (seg === 'routen')
      return shownTours
        .filter((t) => t.start_lat != null && t.start_lon != null)
        .map((t) => ({ id: t.id, kind: 'route' as const, p: [t.start_lat as number, t.start_lon as number] as LatLon, label: `${formatKm(Number(t.km), 0)} km` }));
    return (rides ?? [])
      .map((r) => ({ r, p: r.meeting ? ([r.meeting.lat, r.meeting.lon] as LatLon) : r.start }))
      .filter((x): x is { r: Ausfahrt; p: LatLon } => !!x.p)
      .map(({ r, p }) => ({ id: r.id, kind: 'ausfahrt' as const, p, label: shortDate(r.startsAt) }));
  }, [seg, shownTours, rides, shownDrivers]);
  const { onPins } = props;
  useEffect(() => onPins(pins), [pins, onPins]);
  useEffect(() => () => onPins([]), [onPins]);

  const openRequests = (rides ?? []).reduce((n, r) => n + (r.isOwner ? r.openRequests : 0), 0);

  return (
    <div style={S.stack}>
      <ViewTitle>Community</ViewTitle>
      <Segmented
        label="Bereich der Community"
        value={seg}
        onChange={(v) => {
          setSeg(v);
          props.onSelect(null);
        }}
        options={[
          { id: 'routen', label: 'Routen' },
          { id: 'ausfahrten', label: 'Ausfahrten', badge: openRequests || undefined },
          { id: 'drivers', label: 'Drivers' },
        ]}
      />
      {seg === 'routen' ? (
        <>
          <span style={S.metricLabel}>Routen zum Nachfahren{tours ? `, ${tours.length}` : ''}</span>
          <input aria-label="Routen durchsuchen" placeholder="Route, Fahrer oder Beschreibung suchen" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...S.search, height: 52 }} />
          <div style={S.chips}>
            {SORTS.map((s) => (
              <Chip key={s.id} on={sort === s.id} onClick={() => setSort(s.id)}>
                {s.label}
              </Chip>
            ))}
          </div>
          {err ? <p style={S.errorText}>Community konnte nicht geladen werden: {err}</p> : null}
          {tours === null && !err ? <p style={S.muted}>Wird geladen …</p> : null}
          {tours?.length === 0 ? <EmptyCard title="Noch keine Routen veröffentlicht" text="Sei der Erste: Öffne Touren und veröffentliche eine Tour über das Menü ⋯." /> : null}
          {tours && tours.length > 0 && !shownTours.length ? <p style={S.muted}>Keine Route passt zur Suche.</p> : null}
          {shownTours.map((t) => (
            <RouteCard
              key={t.id}
              t={t}
              mine={userId === t.owner}
              selected={props.selected === t.id}
              onSelect={() => props.onSelect(props.selected === t.id ? null : t.id, t.start_lat != null && t.start_lon != null ? [t.start_lat, t.start_lon] : undefined)}
              onOpen={async () => {
                try {
                  const full = await loadCommunityTour(t.id);
                  // Herkunft mitgeben: gespeichert gilt sie als Community Tour (wie in der App)
                  props.onOpenTour({ ...full.tour, name: t.name, author: t.author?.trim() || undefined, communityId: t.id }, full.profile);
                } catch (e) {
                  showToast(e instanceof Error ? e.message : 'Die Route ließ sich nicht laden.', { tone: 'error' });
                }
              }}
            />
          ))}
        </>
      ) : seg === 'ausfahrten' ? (
        <>
          <span style={S.metricLabel}>Gemeinsame Ausfahrten</span>
          {rides === null ? <p style={S.muted}>Wird geladen …</p> : null}
          {rides?.length === 0 ? <EmptyCard title="Noch keine Ausfahrten geplant" text="Eine Ausfahrt mit Zeit, Treffpunkt und freien Plätzen legst du in der App unter Community an." /> : null}
          {(rides ?? []).map((r) => (
            <RideCard
              key={r.id}
              r={r}
              selected={props.selected === r.id}
              onSelect={() => {
                const p = r.meeting ? ([r.meeting.lat, r.meeting.lon] as LatLon) : (r.start ?? undefined);
                props.onSelect(props.selected === r.id ? null : r.id, p);
              }}
              onChanged={load}
              onRoute={async () => {
                const res = await ausfahrtTour(r.id).catch(() => null);
                if (res) props.onOpenTour({ ...res.tour, name: r.name }, res.profile);
                else showToast('Die Route der Ausfahrt ließ sich nicht laden.', { tone: 'error' });
              }}
            />
          ))}
        </>
      ) : (
        <>
          <span style={S.metricLabel}>Drivers{drivers ? `, ${drivers.length}` : ''}</span>
          {drivers === null ? <p style={S.muted}>Wird geladen …</p> : null}
          {me && !me.home ? (
            <div style={{ ...card, gap: Spacing.m }}>
              <b style={{ font: `700 17px ${BODY}` }}>Zeig dich auf der Karte</b>
              <span style={S.muted}>Trag deinen Wohnort in den Einstellungen ein. Andere sehen dich dann dort, nur als Ortsmitte.</span>
              <button style={{ ...S.secondaryOnSurface, flex: 'none', alignSelf: 'flex-start' }} onClick={props.onSettings}>
                Wohnort angeben
              </button>
            </div>
          ) : null}
          <input aria-label="Drivers durchsuchen" placeholder="Name, Ort oder Auto suchen" value={dq} onChange={(e) => setDq(e.target.value)} style={{ ...S.search, height: 52 }} />
          {drivers && !shownDrivers.length ? <p style={S.muted}>Kein Mitglied passt zur Suche.</p> : null}
          {shownDrivers.map((d) => (
            <DriverCard
              key={d.id}
              d={d}
              km={me?.home && d.home && !d.isMe ? kmBetween(me.home, d.home) : null}
              selected={props.selected === d.id}
              onSelect={() => props.onSelect(props.selected === d.id ? null : d.id, d.home ?? undefined)}
            />
          ))}
        </>
      )}
    </div>
  );
}

/** Hinweis auf die App, ruhig ohne Signalfarbe */
const appHint = { padding: '12px 14px', borderRadius: Radius.m, background: C.ground, color: C.muted, font: `600 15px/21px ${BODY}` } as const;

const card = { display: 'flex', flexDirection: 'column', gap: Spacing.s, padding: Spacing.l, borderRadius: Radius.l, background: C.surface } as const;

function EmptyCard(props: { title: string; text: string }) {
  return (
    <div style={card}>
      <b style={{ font: `700 17px ${BODY}` }}>{props.title}</b>
      <span style={S.muted}>{props.text}</span>
    </div>
  );
}

/**
 * Route wie TourRow in Meine Touren: Mini Streckenbild, Name, Metazeile, Plakette, Fahrspaß mit Zahl und
 * das Lesezeichen rechts. Tippen wählt die Route auf der Karte und klappt Beschreibung und Öffnen auf.
 * Linie und Fahrspaß kommen erst, wenn die Karte ins Bild scrollt (lib/community-lines.ts).
 */
const RouteCard = memo(function RouteCard(props: { t: CommunityTour; mine: boolean; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const { t } = props;
  const [saving, setSaving] = useState(false);
  const [seen, setSeen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) setSeen(true);
    }, { rootMargin: '200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  // ohne IntersectionObserver (sehr alte Browser) gleich laden
  const data = useCommunityLine(t, seen || props.selected || typeof IntersectionObserver === 'undefined');
  const author = t.author?.trim() || null;
  const date = new Date(t.published_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  const meta = [`${formatKm(Number(t.km), 0)} km`, t.curves ? `${t.curves} Kurven` : null, date].filter(Boolean).join('  ·  ');
  const fun = data?.fun;
  // Lesezeichen schaltet um wie in der App: gespeichert heißt wieder entfernen, mit Rückgängig
  const library = useLibrary();
  const kept = useMemo(
    () => library.find((x) => x.communityId === t.id || (x.name === t.name && (x.folder === 'Community' || (props.mine && x.published)))) ?? null,
    [library, t.id, t.name, props.mine],
  );
  const keep = async () => {
    if (saving) return;
    if (kept) {
      // eigene Änderungen nicht über das Lesezeichen löschen
      if (kept.edited || (!kept.published && Math.abs(kept.laenge_km - Number(t.km)) > 0.5)) {
        showToast('Du hast diese Route bearbeitet. Deine Fassung bleibt unter Touren.');
        return;
      }
      try {
        if (kept.published) await removeKeepPublished(kept);
        else deleteTour(kept.id);
        showToast(
          'Aus Touren entfernt',
          kept.published
            ? {}
            : {
                action: {
                  label: 'Rückgängig',
                  onPress: () => {
                    saveTour(kept, kept.folder);
                    void syncLibrary();
                  },
                },
              },
        );
      } catch {
        showToast('Das hat nicht geklappt', { tone: 'error' });
      }
      return;
    }
    setSaving(true);
    copyCommunityTour(t)
      .then(() => showToast('Unter Touren gespeichert'))
      .catch(() => showToast('Speichern hat nicht geklappt', { tone: 'error' }))
      .finally(() => setSaving(false));
  };
  return (
    <div ref={ref} style={{ ...card, padding: Spacing.m, gap: Spacing.m, background: props.selected ? C.surface2 : C.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: Spacing.m }}>
        <button
          aria-expanded={props.selected}
          aria-label={`${t.name}, ${meta}, ${props.mine ? 'von dir' : author ? `von ${author}` : 'aus der Community'}`}
          onClick={props.onSelect}
          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: Spacing.m, textAlign: 'left', background: 'transparent', border: 'none', padding: 0, color: C.text, cursor: 'pointer' }}>
          <RouteThumb shape={data?.thumb ?? null} />
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ font: `700 17px/22px ${BODY}`, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.name}</span>
            <span style={{ font: `600 15px/20px ${BODY}`, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</span>
            {props.mine ? <Badge tone="good">Von dir</Badge> : <FromBadge author={author} />}
          </span>
        </button>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 'none', minWidth: 36 }} aria-label={fun != null && fun >= 0 ? `Fahrspaß ${fun} von 100, ${TOUR_FUN_NAMES[tourFunLevel(fun)]}` : undefined}>
          {fun != null && fun >= 0 ? (
            <>
              <Gauge level={tourFunLevel(fun)} size={20} />
              <span style={{ ...S.metricValue, fontSize: 17 }}>{fun}</span>
            </>
          ) : null}
        </span>
        {/* eigene Routen ohne Lesezeichen, sie liegen schon unter Touren (wie in der App) */}
        {props.mine ? null : <button
          aria-label={kept ? `${t.name} aus Touren entfernen` : `${t.name} unter Touren speichern`}
          aria-pressed={!!kept}
          title={kept ? 'Aus Touren entfernen' : 'Unter Touren speichern'}
          disabled={saving}
          onClick={() => void keep()}
          style={{ width: 44, height: 44, flex: 'none', borderRadius: 22, border: 'none', background: kept ? '#3A1C12' : props.selected ? C.surface : C.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="18" viewBox="0 0 18 20" aria-hidden fill={kept ? C.signal : 'none'} stroke={kept ? C.signal : C.text} strokeWidth="2" strokeLinejoin="round">
            <path d="M2 2h14v16l-7-4.5L2 18z" />
          </svg>
        </button>}
      </div>
      {props.selected ? (
        <>
          <div style={S.metrics}>
            <Metric label="Strecke" value={`${formatKm(Number(t.km), 0)} km`} />
            {t.minutes ? <Metric label="Fahrzeit" value={bigDuration(t.minutes)} /> : null}
            {t.curves ? <Metric label="Kurven" value={String(t.curves)} /> : null}
          </div>
          {t.description ? <p style={{ ...S.muted, color: C.text, margin: 0 }}>{t.description}</p> : null}
          <button style={{ ...S.primary, height: 52 }} onClick={props.onOpen}>
            Im Planer öffnen
          </button>
        </>
      ) : null}
    </div>
  );
});

function RideCard(props: { r: Ausfahrt; selected: boolean; onSelect: () => void; onChanged: () => void; onRoute: () => void }) {
  const { r } = props;
  const arr = arrival(r);
  const free = freeSeats(r);
  const where = r.meeting?.name ? `Treffpunkt ${r.meeting.name}` : r.roundTrip ? 'Rundtour' : null;
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const status = rideStatus(r);
  const canAsk = !r.isOwner && !r.myStatus && free > 0 && r.rideStatus === 'geplant';
  const act = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      showToast(done);
      setAsking(false);
      props.onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ ...card, background: props.selected ? C.surface2 : C.surface }}>
      <button
        aria-expanded={props.selected}
        aria-label={`${r.name}, ${shortDate(r.startsAt)} ${clock(r.startsAt)} Uhr, ${free} Plätze frei`}
        onClick={props.onSelect}
        style={{ display: 'flex', gap: Spacing.m, alignItems: 'center', textAlign: 'left', background: 'transparent', border: 'none', padding: 0, color: C.text, cursor: 'pointer' }}>
        <span style={{ width: 56, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0', borderRadius: Radius.m, background: C.ground }}>
          <span style={{ font: `600 13px ${BODY}`, color: C.muted }}>{shortDate(r.startsAt).split(' ')[0]}</span>
          <span style={{ ...S.metricValue, fontSize: 22 }}>{r.startsAt.getDate()}</span>
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ font: `700 17px/22px ${BODY}` }}>{r.name}</span>
          <span style={{ font: `600 15px/20px ${BODY}`, color: C.muted }}>{[`${clock(r.startsAt)} Uhr`, where].filter(Boolean).join('  ·  ')}</span>
          {status ? <Badge tone={status.tone}>{status.text}</Badge> : null}
        </span>
      </button>
      {props.selected ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: Spacing.l, paddingTop: Spacing.s }}>
          <span style={S.metricLabel}>{longDate(r.startsAt)}, organisiert von {r.isOwner ? 'dir' : r.ownerName}{r.ownerCar ? ` (${r.ownerCar})` : ''}</span>
          <div style={S.metrics}>
            {r.km != null ? <Metric label="Strecke" value={`${formatKm(r.km, 0)} km`} /> : null}
            {arr ? <Metric label={r.roundTrip ? 'Zurück' : 'Ankunft'} value={clock(arr)} /> : null}
            <Metric label="Plätze" value={free > 0 ? `${free} frei` : 'voll'} />
          </div>
          {!r.roundTrip && r.goalName ? <span style={S.muted}>Ziel: {r.goalName}</span> : null}
          {r.note ? <p style={{ ...S.muted, color: C.text }}>{r.note}</p> : null}
          <button style={{ ...S.secondaryOnSurface, flex: 'none', alignSelf: 'flex-start' }} onClick={props.onRoute}>
            Route im Planer ansehen
          </button>
          {canAsk && !asking ? (
            <button style={{ ...S.primary, flex: 'none' }} onClick={() => setAsking(true)}>
              Mitfahren anfragen
            </button>
          ) : null}
          {asking ? (
            <form
              style={{ display: 'flex', flexDirection: 'column', gap: Spacing.m }}
              onSubmit={(e) => {
                e.preventDefault();
                const v = currentVehicle();
                void act(() => requestAusfahrt(r.id, msg, v ? vehicleName(v) : null), 'Anfrage gesendet');
              }}>
              <Field id={`anfrage-${r.id}`} label="Nachricht an den Organisator (optional)" placeholder="Kurz zu dir und deinem Auto" value={msg} onChange={setMsg} area max={300} />
              <div style={{ display: 'flex', gap: Spacing.s }}>
                <button type="button" style={{ ...pillBtn, background: C.ground, color: C.text }} onClick={() => setAsking(false)}>
                  Abbrechen
                </button>
                <button type="submit" style={{ ...pillBtn, background: C.signal, color: '#fff' }} disabled={busy}>
                  Anfrage senden
                </button>
              </div>
            </form>
          ) : null}
          {r.myStatus === 'angefragt' ? (
            <button style={{ ...S.link, fontSize: 15 }} disabled={busy} onClick={() => void act(() => withdrawAusfahrt(r.id), 'Anfrage zurückgezogen')}>
              Anfrage zurückziehen
            </button>
          ) : null}
          {err ? <span style={S.errorText}>{err}</span> : null}
          <span style={appHint}>
            {r.isOwner ? 'Anfragen beantworten, Teilnehmer und Chat findest du in der App unter Community.' : 'Den Chat der Ausfahrt und die Teilnehmer findest du in der App unter Community.'}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function rideStatus(r: Ausfahrt): { text: string; tone: 'good' | 'signal' | 'muted' } | null {
  if (r.isOwner) return { text: r.openRequests ? `${r.openRequests} ${r.openRequests === 1 ? 'Anfrage' : 'Anfragen'}` : 'Deine Ausfahrt', tone: r.openRequests ? 'signal' : 'muted' };
  if (r.myStatus === 'zugesagt') return { text: 'Du bist dabei', tone: 'good' };
  if (r.myStatus === 'eingeladen') return { text: 'Eingeladen', tone: 'signal' };
  if (r.myStatus === 'angefragt') return { text: 'Angefragt', tone: 'muted' };
  if (r.myStatus === 'abgelehnt') return { text: 'Abgelehnt', tone: 'muted' };
  if (freeSeats(r) === 0) return { text: 'Ausgebucht', tone: 'muted' };
  return null;
}

function DriverCard(props: { d: Driver; km: number | null; selected: boolean; onSelect: () => void }) {
  const { d } = props;
  const sub = [d.homeName, props.km != null ? `${Math.round(props.km)} km entfernt` : null].filter(Boolean).join(', ');
  return (
    <div style={{ ...card, background: props.selected ? C.surface2 : C.surface }}>
      <button
        aria-expanded={props.selected}
        onClick={props.onSelect}
        style={{ display: 'flex', gap: Spacing.m, alignItems: 'center', textAlign: 'left', background: 'transparent', border: 'none', padding: 0, color: C.text, cursor: 'pointer' }}>
        <span style={{ width: 44, height: 44, flex: 'none', borderRadius: 22, border: `3px solid ${ringColor(d)}`, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 17px ${BODY}` }}>
          {d.name.slice(0, 1).toUpperCase()}
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ font: `700 17px/22px ${BODY}` }}>
            {d.name}
            {d.isMe ? ' (du)' : ''}
          </span>
          <span style={{ font: `600 15px/20px ${BODY}`, color: C.muted }}>{[d.car, sub].filter(Boolean).join('  ·  ') || 'Ohne Wohnort'}</span>
        </span>
      </button>
      {props.selected ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: Spacing.m, paddingTop: Spacing.s }}>
          {d.garage && d.garage.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={S.metricLabel}>Garage</span>
              {d.garage.map((g, i) => (
                <span key={i} style={{ font: `600 15px ${BODY}` }}>
                  {g.name}
                </span>
              ))}
            </div>
          ) : null}
          {d.memberSince ? <span style={S.metricLabel}>Dabei seit {d.memberSince.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</span> : null}
          {!d.isMe ? (
            <span style={appHint}>{d.allowMessages ? 'Nachrichten an Drivers schreibst du in der App unter Community.' : 'Dieser Driver möchte gerade keine Nachrichten bekommen.'}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
