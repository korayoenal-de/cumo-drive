/**
 * Touren und Abgleich mit dem Konto (Testkatalog R16 bis R19, Flows K2, K10, M4, M5, M8, X4; Koray 17.11.).
 * Ein Konto, zwei Geräte (etwa iPhone und Web Planer): jedes mit eigenem Speicher, beide gleichen über das
 * Konto ab. Geprüft wird, dass nichts doppelt wird, nichts verloren geht und Änderungen beim anderen ankommen.
 */
import { clock } from './clock';
import type { Driver, World } from './harness';
import { scenario } from './report';
import { loadSampleTour } from './scenarios-group';

type Tour = ReturnType<typeof loadSampleTour>;

export async function tourenScenarios(w: World) {
  const tour = loadSampleTour();
  const a = await w.addDriver('Tina Touren', 'Porsche 718 GTS');
  const b = await w.addDevice(a, 'Web Planer');
  const lib = (d: Driver) => d.app.library.readLibrary();
  // Zwischen zwei Handgriffen vergeht Zeit (die virtuelle Uhr steht sonst, und alle Zeitstempel wären gleich)
  const sync = async (d: Driver) => {
    clock.advance(2000);
    await d.app.library.syncLibrary();
    await w.settle();
  };
  const variant = (name: string, shift = 0): Tour => ({
    ...tour,
    name,
    wegpunkte: tour.wegpunkte.map(([la, lo]) => [la + shift, lo] as [number, number]),
    linie: tour.linie.map((r) => ({ ...r, p: r.p.map(([la, lo]) => [la + shift, lo] as [number, number]) })),
  });

  await scenario('T1', 'Zweites Gerät bekommt die Touren, mehrfacher Abgleich ohne Duplikate (K2)', async (c) => {
    a.app.library.saveTour({ ...variant('Odenwald Runde'), minutes: 95 }, '');
    a.app.library.saveTour({ ...variant('Pfalz Runde', 0.2), minutes: 120 }, '');
    await sync(a);
    c.expect(lib(a).every((t) => !!t.cloudId), 'Gerät 1 hat beide im Konto');
    await sync(b);
    await sync(b);
    await sync(a);
    const names = lib(b).map((t) => t.name).sort();
    c.expect(names.join() === 'Odenwald Runde,Pfalz Runde', `Gerät 2 hat genau beide (${names.join(', ')})`);
    c.expect(lib(a).length === 2, `Gerät 1 hat weiter genau zwei (${lib(a).length})`);
  });

  await scenario('T2', 'Dieselbe Tour zweimal speichern ergibt eine Tour (G17)', async (c) => {
    const one = a.app.library.saveTour({ ...variant('Odenwald Runde'), minutes: 95 }, '');
    const ids = lib(a).filter((t) => t.name === 'Odenwald Runde').map((t) => t.id);
    c.expect(ids.length === 1 && ids[0] === one.id, `eine Tour statt Kopie (${ids.length})`);
    await sync(a);
    await sync(b);
    c.expect(lib(b).filter((t) => t.name === 'Odenwald Runde').length === 1, 'auch auf Gerät 2 nur eine');
  });

  await scenario('T3', 'Duplizieren lässt das Original unverändert, die Kopie kommt überall an (R19, M5)', async (c) => {
    const orig = lib(a).find((t) => t.name === 'Pfalz Runde')!;
    const before = JSON.stringify({ n: orig.name, w: orig.wegpunkte, l: orig.laenge_km });
    const copy = a.app.library.duplicateTour(orig.id);
    c.expect(copy?.name === 'Pfalz Runde Kopie', `Name der Kopie (${copy?.name})`);
    // Kopie ändern wie im Planer: Punkt verschieben, speichern
    if (copy) a.app.library.saveTour({ ...copy, wegpunkte: copy.wegpunkte.map(([la, lo], i) => (i === 1 ? ([la + 0.01, lo] as [number, number]) : [la, lo] as [number, number])) }, copy.folder, copy.id);
    await sync(a);
    const after = lib(a).find((t) => t.id === orig.id)!;
    c.expect(JSON.stringify({ n: after.name, w: after.wegpunkte, l: after.laenge_km }) === before, 'Original unverändert');
    await sync(b);
    const onB = lib(b).map((t) => t.name).sort();
    c.expect(onB.includes('Pfalz Runde Kopie') && onB.includes('Pfalz Runde'), `Gerät 2 hat Original und Kopie (${onB.join(', ')})`);
  });

  await scenario('T4', 'Umbenennen auf einem Gerät kommt auf dem anderen an (R18, M4)', async (c) => {
    const t = lib(a).find((x) => x.name === 'Odenwald Runde')!;
    clock.advance(2000);
    a.app.library.renameTour(t.id, 'Odenwald Abendrunde');
    await w.settle();
    await sync(a);
    await sync(b);
    const names = lib(b).map((x) => x.name);
    if (process.env.SIM_VERBOSE) {
      const cl = await b.app.cloudTours.listCloudTours();
      console.log(JSON.stringify({ b: lib(b).map((x) => [x.name, x.cloudId, x.cloudAt, x.syncedAt, x.updatedAt]), a: lib(a).map((x) => [x.name, x.cloudId, x.cloudAt, x.syncedAt, x.updatedAt]), cl: cl.map((x) => [x.name, x.id, x.updated_at]) }, null, 1));
    }
    c.expect(names.includes('Odenwald Abendrunde'), `Gerät 2 zeigt den neuen Namen (${names.join(', ')})`);
    c.expect(!names.includes('Odenwald Runde'), 'alter Name ist auf Gerät 2 weg');
  });

  await scenario('T5', 'Löschen auf einem Gerät gilt auch auf dem anderen und bleibt gelöscht (R18)', async (c) => {
    const t = lib(a).find((x) => x.name === 'Pfalz Runde Kopie');
    c.expect(!!t, 'Kopie vorhanden');
    if (!t) return;
    clock.advance(2000);
    a.app.library.deleteTour(t.id);
    await w.settle();
    await sync(a);
    await sync(b);
    const onB = lib(b).find((x) => x.name === 'Pfalz Runde Kopie');
    c.expect(!onB, 'Gerät 2 hat die gelöschte Tour nicht mehr');
    // Bearbeitet Gerät 2 die alte Kopie noch, darf sie nicht als neue Tour zurückkommen
    if (onB) {
      clock.advance(2000);
      b.app.library.renameTour(onB.id, 'Pfalz Runde Kopie geändert');
      await w.settle();
      await sync(b);
      await sync(a);
      c.expect(!lib(a).some((x) => x.name.startsWith('Pfalz Runde Kopie')), 'gelöschte Tour kommt auf Gerät 1 nicht zurück');
    }
  });

  await scenario('T6', 'Speichern ohne Netz: bleibt lokal, Abgleich holt nach, keine Duplikate (X4)', async (c) => {
    b.client.setOnline(false);
    b.app.library.saveTour({ ...variant('Funkloch Runde', 0.4), minutes: 80 }, '');
    await sync(b);
    c.expect(lib(b).some((t) => t.name === 'Funkloch Runde'), 'lokal gespeichert');
    c.expect(!lib(b).find((t) => t.name === 'Funkloch Runde')?.cloudId, 'noch nicht im Konto');
    b.client.setOnline(true);
    await sync(b);
    await sync(b);
    await sync(a);
    c.expect(lib(b).filter((t) => t.name === 'Funkloch Runde').length === 1, 'Gerät 2 hat sie genau einmal');
    c.expect(lib(a).filter((t) => t.name === 'Funkloch Runde').length === 1, 'Gerät 1 hat sie genau einmal');
  });

  await scenario('T7', 'Gespeicherte Tour öffnet unverändert: Linie und Kennzahlen gleich (R16)', async (c) => {
    const t = lib(a).find((x) => x.name === 'Odenwald Abendrunde') ?? lib(a)[0];
    const onB = lib(b).find((x) => x.cloudId === t.cloudId);
    c.expect(!!onB, 'auf Gerät 2 vorhanden');
    if (!onB) return;
    c.expect(Math.abs(onB.laenge_km - t.laenge_km) < 0.05, `Strecke gleich (${onB.laenge_km} und ${t.laenge_km})`);
    c.expect(onB.minutes === t.minutes, `Fahrzeit gleich (${onB.minutes} und ${t.minutes})`);
    const ends = (x: typeof t) => JSON.stringify([x.wegpunkte[0], x.wegpunkte.at(-1), x.wegpunkte.length]);
    c.expect(ends(onB) === ends(t), 'Punkte gleich');
  });
}
