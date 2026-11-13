/**
 * Web Planer, Einstellungen wie in der App (app/(tabs)/einstellungen.tsx): Konto, Community Profil
 * (Wohnort, Nachrichten erlauben, Garage zeigen) und Garage mit den Fahrzeugen des Kontos.
 * Speichern läuft über dieselben lib Funktionen wie in der App (savePrivacy, saveVehicle).
 */
import { useEffect, useState } from 'react';

import { ageOf, birthDigits, loadPrivacy, parseBirthday, savePrivacy, type BirthdayShow, type Privacy } from '@/lib/drivers';
import { searchTowns, type Place } from '@/lib/geocode';
import { deleteVehicle, newVehicle, saveVehicle, selectVehicle, useVehicles, vehicleName, type Vehicle } from '@/lib/vehicle';
import { showToast } from '@/lib/toast';
import { Radius, Spacing } from '@/constants/theme';

import { AccountBox } from './web-account-panels';
import { Section, Toggle } from './web-parts';
import { BODY, C, DISPLAY } from './web-shared';
import { S } from './web-styles';
import { ConfirmSheet, Field, MoreMenu, pillBtn, ViewTitle, WebSheet, XIcon } from './web-ui';

export function SettingsPanel(props: { narrow: boolean }) {
  return (
    <div style={S.stack}>
      <ViewTitle>Einstellungen</ViewTitle>
      <Section title="Konto">
        <AccountBox />
      </Section>
      <Section title="Community Profil">
        <CommunityProfileWeb />
      </Section>
      <Section title="Garage">
        <GarageWeb narrow={props.narrow} />
      </Section>
    </div>
  );
}

const box = { display: 'flex', flexDirection: 'column', gap: Spacing.m, padding: Spacing.l, borderRadius: Radius.l, background: C.surface } as const;

function CommunityProfileWeb() {
  const [p, setP] = useState<Privacy | null>(null);
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    loadPrivacy()
      .then(setP)
      .catch(() => setP({ homeName: null, home: null, allowMessages: true, showGarage: true, bio: null, visible: true, birthDate: null, birthdayShow: 'age', invitesContactsOnly: false }));
  }, []);
  useEffect(() => {
    if (!editing || q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchTowns(q.trim(), undefined, ctrl.signal)
        .then(setFound)
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, editing]);
  const save = async (patch: Partial<Privacy>) => {
    if (!p) return;
    const prev = p;
    setP({ ...p, ...patch });
    setErr(null);
    setBusy(true);
    try {
      await savePrivacy(patch);
    } catch (e) {
      setP(prev);
      setErr(e instanceof Error ? e.message : 'Speichern hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };
  if (!p) return <p style={S.muted}>Wird geladen …</p>;
  return (
    <div style={box}>
      {!editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: Spacing.m }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={S.metricLabel}>Wohnort</span>
            <span style={{ font: `700 17px ${BODY}` }}>{p.homeName ?? 'Noch nicht angegeben'}</span>
          </div>
          <button
            style={{ ...S.secondaryOnSurface, flex: 'none' }}
            onClick={() => {
              setQ('');
              setFound([]);
              setEditing(true);
            }}>
            {p.homeName ? 'Ändern' : 'Anlegen'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: Spacing.s }}>
          <div style={{ display: 'flex', gap: Spacing.s, alignItems: 'center' }}>
            <input autoFocus aria-label="Wohnort suchen" placeholder="Ort, zum Beispiel Bad Dürkheim" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...S.search, height: 52, background: C.surface2 }} />
            <button aria-label="Abbrechen" onClick={() => setEditing(false)} style={{ width: 44, height: 44, flex: 'none', borderRadius: 22, border: 'none', background: C.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <XIcon />
            </button>
          </div>
          {q.trim().length >= 2
            ? found.map((f) => (
                <button
                  key={`${f.name}-${f.p[0]}-${f.p[1]}`}
                  onClick={() => {
                    setEditing(false);
                    void save({ homeName: f.name, home: f.p });
                  }}
                  style={{ ...S.dropItem, minHeight: 44, font: `600 15px ${BODY}` }}>
                  <span>{f.name}</span>
                  {f.detail ? <span style={S.dropDetail}>{f.detail}</span> : null}
                </button>
              ))
            : null}
          {p.homeName ? (
            <button
              style={{ ...S.link, fontSize: 15 }}
              onClick={() => {
                setEditing(false);
                void save({ homeName: null, home: null });
              }}>
              Wohnort entfernen
            </button>
          ) : null}
        </div>
      )}
      <span style={S.muted}>Andere Mitglieder sehen dich unter Drivers an diesem Ort, nur als Ortsmitte, nie mit Adresse oder Live Standort.</span>
      <BirthdayWeb key={`geb${p.birthDate ?? ''}`} p={p} onSave={(patch) => void save(patch)} />
      <Toggle id="pv-msg" on={p.allowMessages} label="Andere dürfen mich anschreiben" onChange={(v) => void save({ allowMessages: v })} />
      <Toggle id="pv-inv" on={p.invitesContactsOnly} label="Einladungen nur von Kontakten" onChange={(v) => void save({ invitesContactsOnly: v })} />
      <Toggle id="pv-garage" on={p.showGarage} label="Andere sehen meinen Fuhrpark" onChange={(v) => void save({ showGarage: v })} />
      {busy ? <span style={S.muted}>Wird gespeichert</span> : null}
      {err ? <span style={S.errorText}>{err}</span> : null}
    </div>
  );
}

function GarageWeb(props: { narrow: boolean }) {
  const { list, current } = useVehicles();
  const [edit, setEdit] = useState<Vehicle | null>(null);
  const [del, setDel] = useState<Vehicle | null>(null);
  return (
    <div style={box}>
      {!list.length ? <span style={S.muted}>Noch kein Fahrzeug. Mit Breite und Bodenfreiheit prüfen wir Engstellen und Schwellen für dein Auto.</span> : null}
      {list.map((v) => {
        const on = current?.id === v.id;
        const facts = [v.widthM ? `${String(v.widthM).replace('.', ',')} m breit` : null, v.clearanceCm ? `${v.clearanceCm} cm Bodenfreiheit` : null, v.rangeKm ? `${v.rangeKm} km Reichweite` : null].filter(Boolean).join(', ');
        return (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: Spacing.m }}>
            <button
              role="radio"
              aria-checked={on}
              onClick={() => void selectVehicle(v.id)}
              style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: Spacing.m, background: 'transparent', border: 'none', padding: '6px 0', color: C.text, cursor: 'pointer', textAlign: 'left' }}>
              <span aria-hidden style={{ width: 22, height: 22, flex: 'none', borderRadius: 11, boxSizing: 'border-box', border: `2px solid ${on ? C.signal : C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {on ? <span style={{ width: 10, height: 10, borderRadius: 5, background: C.signal }} /> : null}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ font: `700 17px ${BODY}` }}>{vehicleName(v) || 'Fahrzeug'}</span>
                {facts ? <span style={{ font: `600 15px ${BODY}`, color: C.muted }}>{facts}</span> : null}
              </span>
            </button>
            <MoreMenu
              label={`Optionen für ${vehicleName(v) || 'Fahrzeug'}`}
              onSurface
              items={[
                { key: 'edit', label: 'Bearbeiten', onPress: () => setEdit(v) },
                { key: 'del', label: 'Fahrzeug löschen', danger: true, onPress: () => setDel(v) },
              ]}
            />
          </div>
        );
      })}
      <button style={{ ...S.secondaryOnSurface, flex: 'none', alignSelf: 'flex-start' }} onClick={() => setEdit(newVehicle())}>
        Fahrzeug hinzufügen
      </button>
      {edit ? <VehicleSheet v={edit} narrow={props.narrow} onClose={() => setEdit(null)} /> : null}
      {del ? (
        <ConfirmSheet
          narrow={props.narrow}
          title="Möchtest du dieses Fahrzeug wirklich löschen?"
          text={`${vehicleName(del) || 'Fahrzeug'} verschwindet aus deiner Garage, auch in der App.`}
          confirmLabel="Löschen"
          onClose={() => setDel(null)}
          onConfirm={() => {
            void deleteVehicle(del.id);
            setDel(null);
            showToast('Fahrzeug gelöscht');
          }}
        />
      ) : null}
    </div>
  );
}

const num = (s: string): number | null => {
  const v = Number(s.replace(',', '.').trim());
  return s.trim() && Number.isFinite(v) && v > 0 ? v : null;
};
const str = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));

function VehicleSheet(props: { v: Vehicle; narrow: boolean; onClose: () => void }) {
  const { v } = props;
  const [brand, setBrand] = useState(v.brand ?? '');
  const [model, setModel] = useState(v.model);
  const [width, setWidth] = useState(str(v.widthM));
  const [clear, setClear] = useState(str(v.clearanceCm));
  const [range, setRange] = useState(str(v.rangeKm));
  const isNew = !v.model && !v.brand;
  return (
    <WebSheet narrow={props.narrow} title={isNew ? 'Fahrzeug hinzufügen' : 'Fahrzeug bearbeiten'} subtitle="Gilt auch in der App, Breite und Bodenfreiheit fließen in den Etappen Check." onClose={props.onClose}>
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: Spacing.l }}
        onSubmit={(e) => {
          e.preventDefault();
          void saveVehicle({ ...v, brand: brand.trim() || undefined, model: model.trim(), widthM: num(width), clearanceCm: num(clear), rangeKm: num(range) });
          props.onClose();
          showToast('Fahrzeug gespeichert');
        }}>
        <Field id="v-brand" label="Marke" placeholder="Zum Beispiel Porsche" value={brand} onChange={setBrand} max={40} />
        <Field id="v-model" label="Modell" placeholder="Zum Beispiel 911 GTS" value={model} onChange={setModel} max={60} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: Spacing.s }}>
          <Field id="v-width" label="Breite in m" placeholder="1,85" value={width} onChange={setWidth} max={5} />
          <Field id="v-clear" label="Boden in cm" placeholder="10" value={clear} onChange={setClear} max={3} />
          <Field id="v-range" label="Reichweite km" placeholder="450" value={range} onChange={setRange} max={4} />
        </div>
        <button type="submit" style={{ ...pillBtn, flex: 'none', background: C.signal, color: '#fff' }} disabled={!model.trim() && !brand.trim()}>
          Fertig
        </button>
      </form>
    </WebSheet>
  );
}

/** Geburtstag wie in der App (E2): zugeklappt mit Ändern oder Anlegen, offen mit Speichern; die Punkte setzt das Feld selbst */
function BirthdayWeb(props: { p: Privacy; onSave: (patch: Partial<Privacy>) => void }) {
  const { p, onSave } = props;
  const saved = birthDigits(p.birthDate);
  const [open, setOpen] = useState(false);
  const [digits, setDigits] = useState(saved);
  const [show, setShow] = useState<BirthdayShow>(p.birthdayShow);
  const [ask, setAsk] = useState(false);
  const fmt = (d: string) => [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('.');
  const parsed = digits.length === 8 ? parseBirthday(digits) : null;
  const iso = parsed && 'iso' in parsed ? parsed.iso : null;
  const hint = parsed && 'hint' in parsed ? parsed.hint : null;
  const canSave = !!iso && (digits !== saved || show !== p.birthdayShow);
  const age = ageOf(p.birthDate);
  const sees = p.birthdayShow === 'age' ? (age != null ? `${age} Jahre` : null) : p.birthdayShow === 'birthday' ? 'nur am Geburtstag' : 'nichts';
  const doSave = () => {
    if (!canSave || !iso) return;
    setOpen(false);
    onSave({ birthDate: iso, birthdayShow: show });
  };

  if (!open)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: Spacing.m }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={S.metricLabel}>Geburtstag</span>
          <span style={{ font: `700 17px ${BODY}`, color: p.birthDate ? C.text : C.muted }}>{p.birthDate ? fmt(saved) : 'Nicht angegeben'}</span>
          {p.birthDate && sees ? <span style={S.muted}>Drivers sieht: {sees}</span> : null}
        </div>
        <button
          style={{ ...S.secondaryOnSurface, flex: 'none' }}
          onClick={() => {
            setDigits(saved);
            setShow(p.birthdayShow);
            setOpen(true);
          }}>
          {p.birthDate ? 'Ändern' : 'Anlegen'}
        </button>
      </div>
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: Spacing.s }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: Spacing.s }}>
        <label htmlFor="pv-geb" style={{ ...S.metricLabel, flex: 1 }}>Geburtstag</label>
        <button aria-label="Verwerfen" onClick={() => setOpen(false)} style={{ width: 44, height: 44, flex: 'none', borderRadius: 22, border: 'none', background: C.surface2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <XIcon />
        </button>
      </div>
      <input
        id="pv-geb"
        autoFocus
        inputMode="numeric"
        autoComplete="bday"
        value={fmt(digits)}
        placeholder="TT.MM.JJJJ"
        onChange={(e) => setDigits(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
        onKeyDown={(e) => e.key === 'Enter' && doSave()}
        style={{ ...S.search, height: 52, background: C.surface2, maxWidth: 220, font: `400 22px ${DISPLAY}`, letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}
      />
      <span style={hint ? S.errorText : S.muted}>{hint ?? 'Das Datum selbst sieht niemand.'}</span>
      <span style={S.metricLabel}>Sichtbar in Drivers</span>
      <div style={S.chips} role="radiogroup" aria-label="Sichtbar in Drivers">
        {SHOW_WEB.map((o) => {
          const on = show === o.v;
          return (
            <button
              key={o.v}
              role="radio"
              aria-checked={on}
              onClick={() => setShow(o.v)}
              style={{ ...S.chip, background: on ? C.text : C.surface2, color: on ? C.ground : C.text, fontWeight: on ? 700 : 600 }}>
              {o.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: Spacing.s, alignItems: 'center' }}>
        <button disabled={!canSave} onClick={doSave} style={{ ...S.primary, opacity: canSave ? 1 : 0.4, cursor: canSave ? 'pointer' : 'default' }}>
          Speichern
        </button>
        {p.birthDate ? (
          <button
            aria-label="Geburtstag entfernen"
            onClick={() => setAsk(true)}
            style={{ width: 52, height: 52, flex: 'none', borderRadius: 26, border: 'none', background: C.surface2, color: C.muted, cursor: 'pointer', font: `600 15px ${BODY}` }}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </div>
      {ask ? (
        <ConfirmSheet
          narrow
          title="Möchtest du deinen Geburtstag entfernen?"
          confirmLabel="Entfernen"
          onClose={() => setAsk(false)}
          onConfirm={() => {
            setAsk(false);
            setOpen(false);
            onSave({ birthDate: null });
          }}
        />
      ) : null}
    </div>
  );
}

const SHOW_WEB: { v: BirthdayShow; label: string }[] = [
  { v: 'age', label: 'Alter' },
  { v: 'birthday', label: 'Nur Geburtstag' },
  { v: 'none', label: 'Nichts' },
];
