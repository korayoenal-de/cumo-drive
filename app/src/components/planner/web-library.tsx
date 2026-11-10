/**
 * Web Planer, Meine Touren wie in der App (app/(tabs)/touren.tsx, components/tours/*): Karten mit Mini
 * Streckenbild und Fahrspaß, Suche, Ordner, Sortierung (Neueste, Fahrspaß, Name, Länge). Die Karte selbst
 * öffnet die Tour im Planer ohne Neuplanung, alles andere steht im Menü ⋯: umbenennen, duplizieren,
 * Link kopieren, GPX und KML, veröffentlichen mit vorausgefülltem Formular, löschen mit Rückfrage.
 */
import { useEffect, useState } from 'react';

import { useSession } from '@/lib/auth';
import { publishTour, removeKeepPublished, unpublishTour } from '@/lib/community';
import { TOUR_FUN_NAMES, tourFunLevel } from '@/lib/fun-score';
import { loadProfile } from '@/lib/group/ride';
import { deleteTour, duplicateTour, filterTours, folders, renameTour, useLibrary, useSyncState, type SavedTour, type SortKey } from '@/lib/library';
import { useMyProfile } from '@/lib/profile';
import { exportTour, type RouteFormat } from '@/lib/route-file';
import { encodeTour, shareUrl } from '@/lib/share-code';
import { showToast } from '@/lib/toast';
import { ensureTourFun } from '@/lib/tour-fun-queue';
import { formatKm } from '@/lib/tour';
import { Radius, Spacing } from '@/constants/theme';

import { Chip, Gauge } from './web-parts';
import { BODY, C } from './web-shared';
import { S } from './web-styles';
import { Badge, ConfirmSheet, Field, FromBadge, MoreMenu, pillBtn, RouteThumb, ViewTitle, WebSheet } from './web-ui';

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'neu', label: 'Neueste' },
  { id: 'spass', label: 'Fahrspaß' },
  { id: 'name', label: 'Name' },
  { id: 'laenge', label: 'Länge' },
];

export function LibraryPanel(props: { currentId: string | null; onOpen: (t: SavedTour) => void; onPlan: () => void; narrow: boolean }) {
  const list = useLibrary();
  const sync = useSyncState();
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('neu');
  const shown = filterTours(list, q, folder, sort);
  const fs = folders(list).filter((d) => d !== 'Community');
  return (
    <div style={S.stack}>
      <ViewTitle>Meine Touren</ViewTitle>
      {sync.error ? <p style={{ ...S.muted, color: C.warn }}>Abgleich mit dem Konto hat nicht geklappt. Wir versuchen es gleich erneut.</p> : null}
      {!list.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: Spacing.m, background: C.surface, borderRadius: Radius.l, padding: Spacing.xl }}>
          <b style={{ font: `700 17px ${BODY}` }}>Noch keine Tour gespeichert</b>
          <span style={S.muted}>Plan eine Tour oder eine Rundtour. Geplante Routen landen automatisch hier und in der App.</span>
          <button style={{ ...S.primary, flex: 'none' }} onClick={props.onPlan}>
            Tour planen
          </button>
        </div>
      ) : (
        <>
          <input id="lib-search" aria-label="Touren durchsuchen" placeholder="Touren durchsuchen" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...S.search, height: 52 }} />
          {fs.length ? (
            <div style={S.chips}>
              <Chip on={folder === null} onClick={() => setFolder(null)}>
                Alle
              </Chip>
              {fs.map((f) => (
                <Chip key={f} on={folder === f} onClick={() => setFolder(folder === f ? null : f)}>
                  {f}
                </Chip>
              ))}
            </div>
          ) : null}
          <div style={S.chips} role="radiogroup" aria-label="Sortierung">
            {SORTS.map((s) => (
              <Chip key={s.id} on={sort === s.id} onClick={() => setSort(s.id)}>
                {s.label}
              </Chip>
            ))}
          </div>
          <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: Spacing.s }}>
            {shown.map((t) => (
              <TourRow key={t.id} tour={t} current={t.id === props.currentId} onOpen={props.onOpen} narrow={props.narrow} />
            ))}
            {!shown.length ? <p style={S.muted}>Keine Tour passt zur Suche.</p> : null}
          </ul>
        </>
      )}
    </div>
  );
}

function TourRow(props: { tour: SavedTour; current: boolean; onOpen: (t: SavedTour) => void; narrow: boolean }) {
  const t = props.tour;
  const [sheet, setSheet] = useState<'publish' | 'delete' | 'rename' | null>(null);
  useEffect(() => ensureTourFun(t), [t]);
  const date = new Date(t.updatedAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  const meta = [`${formatKm(t.laenge_km, 0)} km`, t.curves ? `${t.curves} Kurven` : null, date].filter(Boolean).join('  ·  ');
  const exp = async (f: RouteFormat) => {
    try {
      await exportTour(t, f);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Export hat nicht geklappt.', { tone: 'error' });
    }
  };
  const copyLink = () => {
    const url = shareUrl(encodeTour(t, t.profile ?? 'kurvig'));
    navigator.clipboard
      ?.writeText(`${t.name}, ${formatKm(t.laenge_km, 0)} km mit CUMO DRIVE\n${url}`)
      .then(() => showToast('Link kopiert'))
      .catch(() => showToast('Kopieren hat nicht geklappt', { tone: 'error' }));
  };
  return (
    <li style={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: Spacing.m, padding: Spacing.m, borderRadius: Radius.l, background: props.current ? C.surface2 : C.surface }}>
      <button
        onClick={() => props.onOpen(t)}
        aria-label={`${t.name}, ${meta}. Öffnet die Tour im Planer`}
        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: Spacing.m, background: 'transparent', border: 'none', padding: 0, color: C.text, cursor: 'pointer', textAlign: 'left' }}>
        <RouteThumb tour={t} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ font: `700 17px/22px ${BODY}`, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.name}</span>
          <span style={{ font: `600 15px/20px ${BODY}`, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</span>
          {t.published ? <Badge tone="good">In der Community</Badge> : t.author || t.folder === 'Community' ? <FromBadge author={t.author} /> : null}
        </span>
      </button>
      {t.fun != null && t.fun >= 0 ? (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 'none' }} aria-label={`Fahrspaß ${t.fun} von 100, ${TOUR_FUN_NAMES[tourFunLevel(t.fun)]}`}>
          <Gauge level={tourFunLevel(t.fun)} size={20} />
          <span style={{ ...S.metricValue, fontSize: 17 }}>{t.fun}</span>
        </span>
      ) : null}
      <MoreMenu
        label={`Optionen für ${t.name}`}
        onSurface
        items={[
          { key: 'rename', label: 'Umbenennen', onPress: () => setSheet('rename') },
          {
            key: 'dup',
            label: 'Duplizieren',
            onPress: () => {
              const c = duplicateTour(t.id);
              if (c) showToast(`${c.name} angelegt`, { action: { label: 'Öffnen', onPress: () => props.onOpen(c) } });
            },
          },
          { key: 'link', label: 'Link kopieren', onPress: copyLink },
          { key: 'gpx', label: 'Als GPX herunterladen', onPress: () => void exp('gpx') },
          { key: 'kml', label: 'Als KML herunterladen', onPress: () => void exp('kml') },
          { key: 'pub', label: t.published ? 'Aus der Community nehmen' : 'In der Community veröffentlichen', onPress: () => setSheet('publish') },
          { key: 'del', label: 'Tour löschen', danger: true, onPress: () => setSheet('delete') },
        ]}
      />
      {sheet === 'rename' ? <RenameSheet tour={t} narrow={props.narrow} onClose={() => setSheet(null)} /> : null}
      {sheet === 'publish' ? (
        <WebSheet
          narrow={props.narrow}
          title={t.published ? 'Aus der Community nehmen?' : 'In der Community veröffentlichen'}
          subtitle={t.published ? 'Die Tour verschwindet aus der Community. Gespeichert bleibt sie bei dir.' : 'Alle sehen Strecke, Tourname und deinen Namen. Zurückziehen geht jederzeit.'}
          onClose={() => setSheet(null)}>
          <PublishForm
            tour={t}
            onDone={(text) => {
              setSheet(null);
              showToast(text);
            }}
          />
        </WebSheet>
      ) : null}
      {sheet === 'delete' ? <DeleteSheet tour={t} narrow={props.narrow} onClose={() => setSheet(null)} /> : null}
    </li>
  );
}

function RenameSheet(props: { tour: SavedTour; narrow: boolean; onClose: () => void }) {
  const [name, setName] = useState(props.tour.name);
  const save = () => {
    const n = name.trim();
    props.onClose();
    if (n && n !== props.tour.name) {
      renameTour(props.tour.id, n);
      showToast('Umbenannt');
    }
  };
  return (
    <WebSheet narrow={props.narrow} title="Tour umbenennen" subtitle="Der neue Name gilt auch im Konto, in der App und in der Community." onClose={props.onClose}>
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: Spacing.l }}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}>
        <Field id="rename-tour" label="Name der Tour" value={name} onChange={setName} max={120} />
        <button type="submit" style={{ ...pillBtn, flex: 'none', background: C.signal, color: '#fff' }} disabled={!name.trim()}>
          Fertig
        </button>
      </form>
    </WebSheet>
  );
}

/** Löschen mit Rückfrage; ist die Tour veröffentlicht, fragt das Sheet, ob sie dort bleibt (wie DeleteTourSheet) */
function DeleteSheet(props: { tour: SavedTour; narrow: boolean; onClose: () => void }) {
  const t = props.tour;
  const [busy, setBusy] = useState(false);
  if (t.published) {
    return (
      <WebSheet
        narrow={props.narrow}
        title="Auch die veröffentlichte Route löschen?"
        subtitle={`${t.name} steht in der Community. Du entscheidest, ob sie dort bleibt.`}
        onClose={props.onClose}
        rows={[
          {
            key: 'mine',
            label: 'Nur bei mir löschen',
            hint: 'In der Community bleibt sie für andere sichtbar',
            disabled: busy,
            onPress: () => {
              setBusy(true);
              removeKeepPublished(t)
                .then(() => {
                  props.onClose();
                  showToast('Aus Meine Touren entfernt, in der Community bleibt sie');
                })
                .catch((e: Error) => showToast(e.message || 'Das hat nicht geklappt.', { tone: 'error' }))
                .finally(() => setBusy(false));
            },
          },
          {
            key: 'all',
            label: 'Überall löschen',
            hint: 'Auch aus der Community und aus deinem Konto',
            danger: true,
            onPress: () => {
              deleteTour(t.id);
              props.onClose();
              showToast('Tour gelöscht, auch in der Community');
            },
          },
        ]}
      />
    );
  }
  return (
    <ConfirmSheet
      narrow={props.narrow}
      title="Möchtest du diese Tour wirklich löschen?"
      text={`${t.name} verschwindet aus dem Web Planer, der App und deinem Konto.`}
      confirmLabel="Löschen"
      onClose={props.onClose}
      onConfirm={() => {
        deleteTour(t.id);
        props.onClose();
        showToast('Tour gelöscht');
      }}
    />
  );
}

/** Veröffentlichen mit vorausgefülltem Namen der Tour und des Fahrers (wie PublishForm in der App) */
function PublishForm({ tour, onDone }: { tour: SavedTour; onDone: (toast: string) => void }) {
  const session = useSession();
  const profile = useMyProfile(session?.user.id);
  const [title, setTitle] = useState(tour.name);
  const [author, setAuthor] = useState('');
  const [touched, setTouched] = useState(false);
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const shownAuthor = touched ? author : author || profile?.displayName || '';
  useEffect(() => {
    void loadProfile().then((p) => {
      if (p?.name) setAuthor((a) => a || p.name);
    });
  }, []);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      onDone(done);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  if (tour.published)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: Spacing.m }}>
        <button style={{ ...pillBtn, flex: 'none', background: C.signal, color: '#fff' }} disabled={busy} onClick={() => void run(() => unpublishTour(tour), 'Aus der Community genommen')}>
          Aus der Community nehmen
        </button>
        {msg ? <span style={S.errorText}>{msg}</span> : null}
      </div>
    );
  const can = !busy && !!shownAuthor.trim() && !!title.trim();
  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: Spacing.l }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!can) return;
        void run(async () => {
          const name = title.replace(/\s+/g, ' ').trim();
          if (name && name !== tour.name) renameTour(tour.id, name);
          await publishTour({ ...tour, name: name || tour.name }, shownAuthor, desc);
        }, 'In der Community veröffentlicht');
      }}>
      <Field id="pub-title" label="Name der Tour" value={title} onChange={setTitle} max={120} />
      <Field
        id="pub-author"
        label="Dein Name als Fahrer"
        placeholder="So erscheinst du in der Community"
        value={shownAuthor}
        onChange={(v) => {
          setTouched(true);
          setAuthor(v);
        }}
        max={60}
      />
      <Field id="pub-desc" label="Beschreibung (optional)" placeholder="Was macht die Tour aus? Beste Abschnitte, Stopps, Tageszeit" value={desc} onChange={setDesc} area max={500} />
      <button type="submit" style={{ ...pillBtn, flex: 'none', background: C.signal, color: '#fff' }} disabled={!can}>
        Veröffentlichen
      </button>
      {msg ? <span style={S.errorText}>{msg}</span> : null}
    </form>
  );
}
