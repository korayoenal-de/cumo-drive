/**
 * Web Planer, Seitenleiste Meine Touren, Gruppenfahrt und Konto.
 */
import { useEffect, useState } from 'react';

import { formatKm, type Profile, type Tour } from '@/lib/tour';
import { signIn, signOut, signUp, useSession } from '@/lib/auth';
import { deleteTour, filterTours, folders, syncLibrary, useLibrary, useSyncState, type SavedTour, type SortKey } from '@/lib/library';
import { type Avoid } from '@/lib/valhalla';
import { createHandoff } from '@/lib/handoff';
import { createRide, joinRide, leaveRide, loadProfile, normalizeCode, QUICK_MESSAGES, sendMessage, setRole, useRide } from '@/lib/group/ride';
import { Spacing } from '@/constants/theme';

import { C } from './web-shared';
import { Chip } from './web-parts';
import { S } from './web-styles';

/* ---------- Meine Touren ---------- */

export function LibraryPanel(props: { currentId: string | null; onOpen: (t: SavedTour) => void }) {
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
                {{ neu: 'Zuletzt geändert', name: 'Name', laenge: 'Länge', spass: 'Fahrspaß' }[k]}
              </Chip>
            ))}
          </div>
          <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: Spacing.xs }}>
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
export function GroupPanel(props: { tour: Tour; profile: Profile; avoid: Avoid; isSample: boolean }) {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.s }}>
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
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: Spacing.xs }}>
        {ride.members.map((mb) => (
          <li key={mb.id} style={{ display: 'flex', alignItems: 'center', gap: Spacing.s }}>
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
export function AccountBox() {
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
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: Spacing.s, alignItems: 'center' }}>
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
