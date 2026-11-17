/**
 * Pflicht Flows (Koray 17.11.), soweit sie noch nicht in den anderen Szenarien stecken:
 * veröffentlichen, Community Touren finden und übernehmen, Ausfahrt Zeit und Treffpunkt ändern, Leute wieder
 * ausladen, blockiert und wieder freigegeben werden, abmelden und wieder anmelden.
 * Schon anderswo geprüft: Tour planen schnell und kurvig (feste Routen, Bedienfolgen), Teilen (QS Korpus),
 * Ausfahrt anlegen (C5), Tour starten (G1, QS Korpus), Touren löschen (T5), Chatten (C9, D1).
 */
import { clock } from './clock';
import type { Driver, World } from './harness';
import { scenario } from './report';
import { loadSampleTour } from './scenarios-group';

export async function pflichtScenarios(w: World) {
  const tour = loadSampleTour();
  const pia = await w.addDriver('Pia Planerin', 'Porsche 911 Targa');
  const leo = await w.addDriver('Leo Leser', 'Lotus Exige');
  const kai = await w.addDriver('Kai Gast', 'BMW M3');
  const sync = async (d: Driver) => {
    clock.advance(2000);
    await d.app.library.syncLibrary();
    await w.settle();
  };
  let communityId = '';

  await scenario('P1', 'Gespeicherte Tour veröffentlichen, andere finden sie in der Community', async (c) => {
    const saved = pia.app.library.saveTour({ ...tour, name: 'Dolomiten Klassiker', minutes: 240 }, '');
    await sync(pia);
    const mine = pia.app.library.readLibrary().find((t) => t.id === saved.id)!;
    communityId = await pia.app.community.publishTour(mine, 'Pia', 'Früh los, wenig Verkehr');
    await w.settle();
    c.expect(pia.app.library.readLibrary().find((t) => t.id === saved.id)?.published === true, 'bei Pia als veröffentlicht markiert');
    const list = await leo.app.community.listCommunity();
    const found = list.find((t) => t.id === communityId);
    c.expect(!!found, 'Leo findet die Tour in der Community');
    c.expect(found?.name === 'Dolomiten Klassiker' && found.author === 'Pia', `Name und Autor stimmen (${found?.name}, ${found?.author})`);
    // Suche wie in der Community: nach Teil des Namens und nach dem Fahrer
    const q = (s: string) => list.filter((t) => `${t.name} ${t.author ?? ''}`.toLowerCase().includes(s.toLowerCase())).map((t) => t.id);
    c.expect(q('dolomiten').includes(communityId) && q('pia').includes(communityId), 'Suche nach Name und Fahrer findet sie');
  });

  await scenario('P2', 'Community Tour übernehmen: Kopie mit Herkunft, Original bleibt', async (c) => {
    const ct = (await leo.app.community.listCommunity()).find((t) => t.id === communityId);
    c.expect(!!ct, 'Tour in der Community');
    if (!ct) return;
    const copy = await leo.app.community.copyCommunityTour(ct);
    await w.settle();
    c.expect(copy.author === 'Pia', `Plakette „Von Pia“ (${copy.author})`);
    c.expect(leo.app.library.readLibrary().some((t) => t.id === copy.id), 'unter Touren bei Leo');
    await sync(leo);
    c.expect((await kai.app.community.listCommunity()).filter((t) => t.name === 'Dolomiten Klassiker').length === 1, 'in der Community weiter genau einmal');
  });

  await scenario('P3', 'Veröffentlichung zurückziehen: verschwindet für andere, bleibt bei Pia', async (c) => {
    await pia.app.community.withdrawCommunityTour(communityId);
    await w.settle();
    c.expect(!(await leo.app.community.listCommunity()).some((t) => t.id === communityId), 'Leo sieht sie nicht mehr');
    await sync(pia);
    c.expect(pia.app.library.readLibrary().some((t) => t.cloudId === communityId), 'Pia hat sie weiter unter Touren');
  });

  let rideId = '';
  await scenario('P4', 'Ausfahrt: Abfahrt und Treffpunkt ändern, Teilnehmer sehen es', async (c) => {
    const saved = pia.app.library.readLibrary().find((t) => t.cloudId === communityId)!;
    const startsAt = new Date(Date.now() + 4 * 86400000);
    rideId = await pia.app.ausfahrten.publishAusfahrt(saved, { startsAt, meeting: { name: 'Parkplatz Arabba', lat: 46.5, lon: 11.87 }, note: '', seats: 4, public: true });
    await leo.app.ausfahrten.requestAusfahrt(rideId, '', null);
    await pia.app.ausfahrten.answerAnfrage(rideId, leo.id!, true);
    const later = new Date(startsAt.getTime() + 30 * 60000);
    await pia.app.rideDay.changeRide(rideId, later, null);
    await pia.app.rideDay.changeRide(rideId, null, { name: 'Passo Pordoi', lat: 46.488, lon: 11.811 });
    const seen = (await leo.app.ausfahrten.listAusfahrten()).find((a) => a.id === rideId);
    c.expect(Math.abs((seen?.startsAt.getTime() ?? 0) - later.getTime()) < 1000, 'Leo sieht die neue Abfahrt');
    c.expect(seen?.meeting?.name === 'Passo Pordoi', `Leo sieht den neuen Treffpunkt (${seen?.meeting?.name})`);
    let e = '';
    await leo.app.rideDay.changeRide(rideId, startsAt, null).catch((x: Error) => (e = x.message));
    c.expect(!!e, `Teilnehmer dürfen die Abfahrt nicht ändern (${e || 'ging durch'})`);
  });

  await scenario('P5', 'Leute wieder ausladen: Eingeladener ist raus und sieht die private Ausfahrt nicht mehr', async (c) => {
    const saved = pia.app.library.readLibrary().find((t) => t.cloudId === communityId)!;
    const priv = await pia.app.ausfahrten.publishAusfahrt(saved, { startsAt: new Date(Date.now() + 6 * 86400000), meeting: null, note: '', seats: 3 });
    await pia.app.invites.inviteToRide(priv, kai.id!);
    const before = (await kai.app.ausfahrten.listAusfahrten()).find((a) => a.id === priv);
    c.expect(before?.myStatus === 'eingeladen', `Kai ist eingeladen (${before?.myStatus})`);
    await pia.app.invites.removeFromRide(priv, kai.id!);
    const after = (await kai.app.ausfahrten.listAusfahrten()).find((a) => a.id === priv);
    c.expect(!after, 'Kai sieht die private Ausfahrt nicht mehr');
    const members = await pia.app.invites.rideOverview(priv);
    c.expect(!members.some((m) => m.userId === kai.id), 'Kai steht nicht mehr bei den Teilnehmern');
    // auch aus einer öffentlichen Ausfahrt ausladen, in der er zugesagt hat
    await kai.app.ausfahrten.requestAusfahrt(rideId, '', null);
    await pia.app.ausfahrten.answerAnfrage(rideId, kai.id!, true);
    await pia.app.invites.removeFromRide(rideId, kai.id!);
    const pub = (await kai.app.ausfahrten.listAusfahrten()).find((a) => a.id === rideId);
    c.expect(pub?.myStatus == null, `Kai ist aus der öffentlichen Ausfahrt raus (${pub?.myStatus})`);
  });

  await scenario('P6', 'Blockiert werden und wieder freigegeben', async (c) => {
    await leo.app.drivers.sendDirect(kai.id!, 'Hallo Kai');
    await kai.app.moderation.blockUser(leo.id!);
    let e = '';
    await leo.app.drivers.sendDirect(kai.id!, 'Noch da?').catch((x: Error) => (e = x.message));
    c.expect(!!e, `Leo kann Kai nicht mehr schreiben (${e || 'ging durch'})`);
    const blocks = await kai.app.moderation.listBlocks();
    c.expect(blocks.some((b) => b.userId === leo.id), 'Leo steht in Kais Liste der Blockierten');
    await kai.app.moderation.unblockUser(leo.id!);
    let e2 = '';
    await leo.app.drivers.sendDirect(kai.id!, 'Jetzt wieder?').catch((x: Error) => (e2 = x.message));
    c.expect(!e2, `nach dem Freigeben geht es wieder (${e2})`);
    c.expect(!(await kai.app.moderation.listBlocks()).some((b) => b.userId === leo.id), 'Liste der Blockierten ist leer');
  });

  await scenario('P7', 'Abmelden und wieder anmelden: Touren kommen zurück, nichts doppelt', async (c) => {
    await sync(pia);
    const n = pia.app.library.readLibrary().length;
    // Abmelden wie in den Einstellungen: Touren nur auf dem Gerät löschen, dann abmelden
    pia.app.library.clearLocalTours();
    c.expect(pia.app.library.readLibrary().length === 0, 'nach dem Abmelden keine Touren auf dem Gerät');
    // Wieder anmelden: frisches Gerät mit demselben Konto, Abgleich
    const again = await w.addDevice(pia, 'nach Anmeldung');
    await sync(again);
    await sync(again);
    c.expect(again.app.library.readLibrary().length === n, `alle ${n} Touren wieder da (${again.app.library.readLibrary().length})`);
  });
}
