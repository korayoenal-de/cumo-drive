/**
 * Gruppenfahrt mit virtuellen Fahrern (Nummern aus dem Testplan): Lead, Mitfahrer, Schlusslicht,
 * dazu Fahrer für Absage, Beitritt per Code und späteren Beitritt.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { clock } from './clock';
import { asAdmin, lit } from './db';
import { haversine, type Driver, type LatLon, type World } from './harness';
import { scenario } from './report';

type Tour = { name: string; laenge_km: number; wegpunkte: LatLon[]; linie: { c: 'ok' | 'pruefen' | 'raus'; p: LatLon[] }[]; warnungen: never[] };

export function loadSampleTour(): Tour {
  return JSON.parse(readFileSync(path.join(__dirname, '../../src/data/sample-e3.json'), 'utf8')) as Tour;
}

const near = (a: LatLon | null | undefined, b: LatLon | null | undefined, m = 2) => !!a && !!b && haversine(a, b) <= m;

export async function groupScenarios(w: World) {
  const tour = loadSampleTour();
  w.setLine(tour.linie.flatMap((r) => r.p));

  const lead = await w.addDriver('Lea Lead', 'Porsche 911 GT3');
  const max = await w.addDriver('Max Mitte', 'Porsche Cayman GT4');
  const sina = await w.addDriver('Sina Schluss', 'BMW M2');
  const dora = await w.addDriver('Dora Absage', 'Alpine A110');
  const carl = await w.addDriver('Carl Code', 'Lotus Emira');
  const paul = await w.addDriver('Paul Spaet', 'Porsche Boxster');
  const group = [lead, max, sina];

  let rideId = '';
  let cloudId = '';

  /** alle Fahrer in der Liste sehen alle anderen mit ihrer zuletzt gesendeten Position */
  const allSeeAll = (list: Driver[]) => {
    const bad: string[] = [];
    for (const a of list)
      for (const b of list) {
        if (a === b) continue;
        const m = a.member(b);
        if (!m) bad.push(`${a.name} sieht ${b.name} nicht`);
        else if (!near(m.p, b.lastSent)) bad.push(`${a.name} sieht ${b.name} an falscher Position`);
      }
    return bad;
  };

  await scenario('G1', 'Lead startet aus gespeicherter Tour und lädt zwei ein', async (c) => {
    // wie gruppe/neu.tsx: Tour aus Meine Touren, ins Konto, Fahrt anlegen, einladen, starten
    const saved = lead.app.library.saveTour({ ...tour, minutes: 300 }, '');
    cloudId = await lead.app.cloudTours.saveCloudTour(saved, { profile: 'kurvig' });
    lead.app.library.patchTour(saved.id, { cloudId, syncedAt: new Date().toISOString() });
    const withCloud = lead.app.library.readLibrary().find((t) => t.id === saved.id)!;
    const r = await lead.app.invites.createGroupRide(withCloud);
    rideId = r.id;
    c.expect(r.maxMembers === 6, `max_members 6, ist ${r.maxMembers}`);
    await lead.app.invites.respondInvite(r.id, true, 'Porsche 911 GT3');
    const found = await lead.app.profile.findProfiles('Max');
    c.expect(found.some((f) => f.id === max.id), 'find_profiles findet Max');
    for (const d of [max, sina, dora]) await lead.app.invites.inviteToRide(r.id, d.id!);
    let dup = '';
    await lead.app.invites.inviteToRide(r.id, max.id!).catch((e: Error) => (dup = e.message));
    c.expect(dup === 'Schon eingeladen', `doppelte Einladung abgewiesen (${dup})`);
    let foreign = '';
    await max.app.invites.inviteToRide(r.id, carl.id!).catch((e: Error) => (foreign = e.message));
    c.expect(/Nur wer die Fahrt angelegt hat/.test(foreign), `Mitfahrer darf nicht einladen (${foreign})`);
    const ov = await lead.app.invites.rideOverview(r.id);
    c.expect(ov.length === 4, `Übersicht 4 Einträge, ist ${ov.length}`);
    c.expect(ov[0]?.isOwner && ov[0].role === 'lead' && ov[0].status === 'zugesagt', 'Lead steht vorn, zugesagt');
    c.expect(ov.filter((m) => m.status === 'eingeladen').length === 3, 'drei Eingeladene');
    const again = await lead.app.invites.findPlannedRide(cloudId);
    c.expect(again?.id === r.id, 'findPlannedRide findet die Fahrt wieder');
    await lead.app.invites.setRideStatus(r.id, 'laeuft');
    await lead.app.start.startAsLead(r.id, saved.name, withCloud, 'kurvig');
    await w.settle();
    c.expect(lead.ride.status === 'aktiv', `Lead Status aktiv, ist ${lead.ride.status}`);
    c.expect(lead.ride.myRole === 'lead', 'Rolle lead');
    c.expect(lead.member(lead)?.name === 'Lea Lead', `Name aus dem Profil (${lead.member(lead)?.name})`);
    c.expect(lead.app.activeTour.getActiveTour()?.tour.name === tour.name, 'Tour ist aktive Tour der Lead');
    lead.driving = true;
    lead.dist = 400;
    await w.drive(2);
    c.expect(near(lead.member(lead)?.p, lead.lastSent), 'eigene Position in der Gruppe');
  });

  await scenario('G2', 'Mitglied nimmt an, Tour lädt, Positionen bei allen sichtbar', async (c) => {
    for (const d of [max, sina]) {
      const inv = await d.app.invites.myInvites();
      const mine = inv.find((i) => i.rideId === rideId);
      c.expect(mine?.myStatus === 'eingeladen', `${d.name} sieht Einladung`);
      c.expect(mine?.ownerName === 'Lea Lead', `Einladung von Lea Lead (${mine?.ownerName})`);
      c.expect(mine?.km === tour.laenge_km, `km in der Einladung (${mine?.km})`);
      c.expect(mine?.rideStatus === 'laeuft', 'Fahrt läuft');
      await d.app.invites.respondInvite(rideId, true, d.car);
      // wie invites-banner.tsx: Mitfahren
      await d.app.start.rideAlong(rideId);
      const at = d.app.activeTour.getActiveTour();
      c.expect(at?.tour.name === tour.name && at.tour.linie.length === tour.linie.length, `${d.name}: Tour geladen`);
      d.driving = true;
    }
    max.dist = 250;
    sina.dist = 100;
    await w.settle();
    for (const d of group) c.expect(d.ride.status === 'aktiv', `${d.name} aktiv (${d.ride.status})`);
    await w.drive(4);
    for (const b of allSeeAll(group)) c.expect(false, b);
    for (const d of group) c.expect(d.ride.members.length === 3, `${d.name} sieht 3 in der Gruppe (${d.ride.members.length})`);
    const ov = await max.app.invites.rideOverview(rideId);
    c.expect(ov.find((m) => m.userId === max.id)?.vehicle === max.car, 'Fahrzeug aus der Zusage in der Übersicht');
  });

  await scenario('G3', 'Mitglied lehnt ab', async (c) => {
    const inv = await dora.app.invites.myInvites();
    c.expect(inv.some((i) => i.rideId === rideId && i.myStatus === 'eingeladen'), 'Dora sieht Einladung');
    await dora.app.invites.respondInvite(rideId, false);
    const after = await dora.app.invites.myInvites();
    c.expect(!after.some((i) => i.rideId === rideId), 'Einladung verschwindet nach Absage');
    const ov = await lead.app.invites.rideOverview(rideId);
    c.expect(ov.find((m) => m.userId === dora.id)?.status === 'abgesagt', 'Lead sieht abgesagt');
    await w.drive(1);
    for (const d of group) c.expect(!d.member(dora), `${d.name} hat Dora nicht in der Gruppe`);
    // abgesagte Plätze zählen nicht: nochmal einladen geht
    await lead.app.invites.inviteToRide(rideId, dora.id!);
    const again = await dora.app.invites.myInvites();
    c.expect(again.some((i) => i.rideId === rideId && i.myStatus === 'eingeladen'), 'erneute Einladung nach Absage möglich');
    await dora.app.invites.respondInvite(rideId, false);
  });

  await scenario('G4', 'Beitritt per Code', async (c) => {
    // a) Fahrt mit Einladung: Code aus rides.code, join_ride (nur noch für ältere Versionen)
    const { data } = await lead.client.from('rides').select('code').eq('id', rideId).single();
    const code = (data as { code: string }).code;
    const r = await carl.client.rpc('join_ride', { join_code: code.toUpperCase() });
    c.expect(!r.error && r.data === rideId, `join_ride liefert die Fahrt (${r.error?.message ?? ''})`);
    const bad = await carl.client.rpc('join_ride', { join_code: 'zzzzzz' });
    c.expect(bad.error?.message === 'Fahrt nicht gefunden', 'falscher Code abgewiesen');
    await carl.app.start.rideAlong(rideId);
    carl.driving = true;
    carl.dist = 0;
    await w.drive(3);
    for (const b of allSeeAll([...group, carl])) c.expect(false, b);
    c.note('Die App bietet für Fahrten mit Einladung keinen Code an (Kommentar in der Migration), getestet über die RPC join_ride.');
    // b) Web Planer: alter Fahrtcode ohne Konto (createRide und joinRide, Kanal ride-<code>)
    const web1 = await w.addDriver('Web Eins', null, { account: false });
    const web2 = await w.addDriver('Web Zwei', null, { account: false });
    const wc = await web1.app.ride.createRide('Web Eins', 'Planer', null);
    await web2.app.ride.joinRide(wc.toUpperCase(), 'Web Zwei', 'Planer');
    await w.settle();
    c.expect(web1.ride.members.length === 2 && web2.ride.members.length === 2, `Web Planer Fahrt per Code: ${web1.ride.members.length} und ${web2.ride.members.length} Mitglieder`);
    await web2.app.ride.joinRide('abc', 'Web Zwei', 'Planer');
    c.expect(web2.ride.status === 'fehler' && /6 Zeichen/.test(web2.ride.error ?? ''), 'zu kurzer Code wird abgewiesen');
    await web1.app.ride.leaveRide();
    await web2.app.ride.leaveRide();
    web1.dispose();
    web2.dispose();
    w.drivers.splice(w.drivers.indexOf(web1), 1);
    w.drivers.splice(w.drivers.indexOf(web2), 1);
  });

  await scenario('G5', 'Späterer Beitritt während der Fahrt', async (c) => {
    await w.drive(5);
    await lead.app.invites.inviteToRide(rideId, paul.id!);
    const inv = await paul.app.invites.myInvites();
    c.expect(inv.some((i) => i.rideId === rideId && i.rideStatus === 'laeuft'), 'Paul sieht laufende Fahrt');
    await paul.app.invites.respondInvite(rideId, true, paul.car);
    await paul.app.start.rideAlong(rideId);
    await w.settle();
    c.expect(paul.ride.status === 'aktiv', 'Paul aktiv');
    c.expect(paul.app.activeTour.getActiveTour()?.tour.name === tour.name, 'Paul hat die Tour');
    // vor dem ersten neuen Positionspaket kennt Paul die anderen schon (Presence), aber noch ohne Position
    const before = paul.ride.members.filter((m) => m.id !== paul.id);
    c.expect(before.length === 4, `Paul sieht sofort 4 andere (${before.length})`);
    c.note(`Positionen der anderen direkt nach dem Beitritt: ${before.filter((m) => m.p).length} von 4 (kommen mit dem nächsten Paket, höchstens 3 s)`);
    paul.driving = true;
    paul.dist = 0;
    await w.drive(2);
    for (const b of allSeeAll([...group, carl, paul])) c.expect(false, b);
  });

  await scenario('G6', 'Lead setzt Schlusslicht, Reihenfolge stimmt', async (c) => {
    // Nicht Lead darf keine Rollen vergeben
    max.app.ride.setRole(carl.id!, 'schluss');
    await w.settle();
    c.expect(carl.ride.myRole === 'mitfahrer', 'Mitfahrer kann keine Rolle setzen');
    lead.app.ride.setRole(sina.id!, 'schluss');
    await w.settle();
    c.expect(sina.ride.myRole === 'schluss', `Sina hat Rolle schluss (${sina.ride.myRole})`);
    for (const d of [lead, max, sina, carl, paul]) {
      const roles = d.ride.members.map((m) => m.role);
      c.expect(roles[0] === 'lead' && roles[roles.length - 1] === 'schluss', `${d.name}: Reihenfolge ${d.ride.members.map((m) => `${m.name}:${m.role}`).join(', ')}`);
    }
    const ov = await lead.app.invites.rideOverview(rideId);
    c.expect(ov.find((m) => m.userId === sina.id)?.role === 'schluss', 'Rolle in ride_members gespeichert');
    // wer später neu einsteigt, übernimmt die Rolle aus der Fahrt (rideAlong)
    await sina.app.ride.leaveRide();
    await sina.app.start.rideAlong(rideId);
    await w.settle();
    c.expect(sina.ride.myRole === 'schluss', 'Rolle bleibt nach Neueinstieg');
    await w.drive(1);
    // Rolle vergeben, während das Mitglied kein Netz hat
    paul.client.setOnline(false);
    lead.app.ride.setRole(paul.id!, 'schluss');
    await w.settle();
    paul.client.setOnline(true);
    await w.settle();
    await w.drive(1);
    c.expect(lead.member(paul)?.role === 'schluss', `Rolle erreicht ein Mitglied, das beim Setzen offline war (Lead sieht ${lead.member(paul)?.role})`);
    lead.app.ride.setRole(paul.id!, 'mitfahrer');
    await w.settle();
  });

  await scenario('G7', 'Lead meldet Stopp und hebt ihn auf, alle sehen es', async (c) => {
    const others = [max, sina, carl, paul];
    for (const reason of ['parkplatz', 'tanken', 'pause', 'foto'] as const) {
      lead.app.ride.announceStop(reason);
      await w.settle();
      for (const d of others) {
        const s = d.ride.stop;
        c.expect(s?.reason === reason, `${d.name} sieht Stopp ${reason}`);
        c.expect(near(s?.p, lead.lastSent, 5), `${d.name}: Stopp an der Position der Lead`);
      }
      lead.app.ride.clearStop(true);
      await w.settle();
      for (const d of others) c.expect(d.ride.stop == null, `${d.name}: Stopp ${reason} aufgehoben`);
    }
    // nur für sich ausblenden: die anderen sehen den Stopp weiter
    lead.app.ride.announceStop('pause');
    await w.settle();
    max.app.ride.clearStop(false);
    await w.settle();
    c.expect(max.ride.stop == null && sina.ride.stop?.reason === 'pause', 'Ausblenden wirkt nur lokal');
    lead.app.ride.clearStop(true);
    await w.settle();
    c.expect(sina.ride.stop == null, 'Aufheben erreicht auch die anderen');
  });

  await scenario('G8', 'Lead schickt neue Tour, alle bekommen sie', async (c) => {
    const neu = { ...tour, name: 'RCO EAST 26 E3 Variante', wegpunkte: tour.wegpunkte.slice(0, 3) };
    const code = await lead.app.handoff.createHandoff(neu, 'kurvig');
    lead.app.ride.shareTour(code);
    await w.settle();
    for (const d of [max, sina, carl, paul]) {
      c.expect(d.ride.tourCode === code, `${d.name} hat den Tourcode`);
      const h = await d.app.handoff.fetchHandoff(code);
      c.expect(h?.tour.name === neu.name, `${d.name} lädt die neue Tour`);
    }
    c.note('Hinweis UI: gruppe/index.tsx zeigt "Tour mit allen teilen" nur ohne rideId; bei Fahrten mit Einladung kann die Lead in der App keine neue Tour schicken (Logik getestet).');
  });

  await scenario('G9', 'Ein Mitglied ist abseits, die anderen sehen es', async (c) => {
    max.off = true;
    await w.drive(2);
    for (const d of [lead, sina, carl, paul]) c.expect(d.member(max)?.off === true, `${d.name} sieht Max abseits`);
    max.off = false;
    await w.drive(2);
    for (const d of [lead, sina, carl, paul]) c.expect(d.member(max)?.off === false, `${d.name} sieht Max wieder auf der Tour`);
  });

  await scenario('G10', 'Netzausfall eines Mitglieds 2 min, danach wieder live', async (c) => {
    await w.drive(1);
    const lastPos = carl.lastSent;
    const t0 = clock.now();
    carl.client.setOnline(false);
    await w.settle();
    const others = [lead, max, sina, paul];
    await w.drive(10); // 30 s
    for (const d of others) c.expect(near(d.member(carl)?.p, lastPos), `nach 30 s: ${d.name} zeigt Carls letzte Position`);
    await w.drive(20); // 90 s
    const lost = others.filter((d) => !near(d.member(carl)?.p, lastPos));
    c.expect(lost.length === 0, `nach 90 s: letzte Position bleibt sichtbar (fehlt bei ${lost.map((d) => d.name).join(', ') || 'niemand'})`);
    const seen = lead.member(carl)?.seenAt;
    c.expect(seen != null && clock.now() - seen > 60000, 'seenAt ist alt, die App kann Carl als veraltet zeigen');
    c.expect(carl.ride.status === 'fehler', `Carl selbst: Status fehler während Ausfall (${carl.ride.status})`);
    await w.drive(10); // 120 s
    c.note(`Ausfall ${(clock.now() - t0) / 1000} s Simulationszeit`);
    carl.client.setOnline(true);
    await w.settle();
    c.expect(carl.ride.status === 'aktiv', `Carl nach Rückkehr aktiv (${carl.ride.status})`);
    c.expect(carl.ride.error == null, `Fehlertext nach Rückkehr gelöscht (${carl.ride.error})`);
    await w.drive(2);
    for (const d of others) {
      const m = d.member(carl);
      c.expect(near(m?.p, carl.lastSent) && m?.seenAt != null && clock.now() - m.seenAt < 4000, `${d.name} sieht Carl wieder live`);
    }
    for (const b of allSeeAll([carl, lead])) c.expect(false, b);
  });

  await scenario('G10b', 'Schlechtes Netz: 300 ms Latenz und 30 % Paketverlust', async (c) => {
    for (const d of [max, sina]) d.client.net = { latencyMs: 300, loss: 0.3 };
    await w.drive(12);
    // nach 36 s ist bei jedem mindestens ein Paket durchgekommen, Positionen höchstens wenige Pakete alt
    for (const a of [lead, max, sina, carl, paul])
      for (const b of [lead, max, sina, carl, paul]) {
        if (a === b) continue;
        const m = a.member(b);
        c.expect(m?.p && b.lastSent && haversine(m.p, b.lastSent) < 400, `${a.name} sieht ${b.name} höchstens 400 m zurück (${m?.p && b.lastSent ? Math.round(haversine(m.p, b.lastSent)) : 'keine'} m)`);
      }
    const st = w.server.stats;
    c.note(`Bus bisher: ${st.delivered} zugestellt, ${st.dropped} verworfen`);
    lead.app.ride.announceStop('tanken');
    await w.settle(3000);
    const missed = [max, sina].filter((d) => d.ride.stop?.reason !== 'tanken').map((d) => d.name);
    c.note(`Stopp Ansage bei 30 % Verlust nicht angekommen bei: ${missed.join(', ') || 'niemand (diesmal Glück)'}; Broadcasts werden nicht wiederholt, eine verlorene Ansage bleibt verloren`);
    lead.app.ride.clearStop(true);
    await w.settle();
    for (const d of [max, sina]) d.client.net = { latencyMs: 5, loss: 0 };
    for (const d of [max, sina]) d.app.ride.clearStop(false);
    await w.drive(1);
  });

  await scenario('G11', 'Mitglied verlässt vorzeitig', async (c) => {
    await paul.app.ride.leaveRide();
    paul.driving = false;
    await w.drive(1);
    c.expect(paul.ride.status === 'aus' && paul.ride.members.length === 0, 'Paul ist raus');
    for (const d of [lead, max, sina, carl]) c.expect(!d.member(paul), `${d.name} hat Paul nicht mehr in der Gruppe`);
    for (const d of [lead, max, sina, carl]) c.expect(d.ride.members.length === 4, `${d.name} sieht 4 (${d.ride.members.length})`);
    const ov = await lead.app.invites.rideOverview(rideId);
    c.note(`Status von Paul in der Fahrt danach: ${ov.find((m) => m.userId === paul.id)?.status} (Verlassen ändert die Zusage nicht)`);
    // Wieder einsteigen geht
    await paul.app.start.rideAlong(rideId);
    await w.settle();
    c.expect(lead.member(paul) != null, 'Paul kann wieder einsteigen');
    await paul.app.ride.leaveRide();
    await w.settle();
  });

  await scenario('G12', 'Lead beendet für alle', async (c) => {
    // Carl ist beim Beenden im Funkloch
    carl.client.setOnline(false);
    await w.settle();
    // wie gruppe/index.tsx: erst Status beendet, dann Broadcast ende
    await lead.app.invites.setRideStatus(rideId, 'beendet');
    await lead.app.ride.endRideForAll();
    await w.settle();
    c.expect(lead.ride.status === 'aus', 'Lead ist raus');
    for (const d of [max, sina]) {
      c.expect(d.ride.status === 'aus', `${d.name} ist raus (${d.ride.status})`);
      c.expect(d.ride.error === 'Die Lead hat die Gruppenfahrt beendet.', `${d.name} bekommt Hinweis`);
      const inv = await d.app.invites.myInvites();
      c.expect(!inv.some((i) => i.rideId === rideId), `${d.name}: Fahrt nicht mehr in den Einladungen`);
    }
    const { data } = await asAdmin(`select status from public.rides where id = ${lit(rideId)}`).then((r) => ({ data: r.out }));
    c.expect(data === 'beendet', 'Fahrt in der DB beendet');
    await paul.app.start.rideAlong(rideId).catch(() => undefined);
    await w.settle();
    c.expect(paul.ride.status === 'aus' && /beendet/.test(paul.ride.error ?? ''), `Einsteigen in beendete Fahrt endet sofort mit Hinweis (${paul.ride.status})`);
    await paul.app.ride.leaveRide();
    // Carl kommt nach dem Ende zurück
    carl.client.setOnline(true);
    await w.settle();
    await w.drive(2);
    c.expect(carl.ride.status === 'aus', `Carl war beim Beenden offline und ist danach raus (Status ${carl.ride.status}, sieht ${carl.ride.members.length})`);
    for (const d of group) d.driving = false;
    carl.driving = false;
    paul.driving = false;
    await carl.app.ride.leaveRide();
  });

  await scenario('G14', 'Ausfahrt aus der Community wird am Termin zur Gruppenfahrt', async (c) => {
    // ausfahrt/[id].tsx: Owner setRideStatus laeuft + startAsLead, Teilnehmer rideAlong (gleiche ID)
    const saved = lead.app.library.readLibrary()[0];
    const id = await lead.app.ausfahrten.publishAusfahrt(saved, { startsAt: new Date(Date.now() + 40 * 60000), meeting: { name: 'Parkplatz Passo', lat: 46.56, lon: 12.68 }, note: 'Sim', seats: 3 });
    await max.app.ausfahrten.requestAusfahrt(id, 'Bin dabei', max.car);
    await lead.app.ausfahrten.answerAnfrage(id, max.id!, true);
    await lead.app.invites.setRideStatus(id, 'laeuft');
    const list = await lead.app.ausfahrten.listAusfahrten();
    const full = await lead.app.ausfahrten.ausfahrtTour(id);
    c.expect(!!full, 'Tour der Ausfahrt lädt');
    await lead.app.start.startAsLead(id, list.find((a) => a.id === id)!.name, { ...full!.tour }, full!.profile);
    const mine = (await max.app.ausfahrten.listAusfahrten()).find((a) => a.id === id);
    c.expect(mine?.rideStatus === 'laeuft' && mine.myStatus === 'zugesagt', 'Max sieht laufende Ausfahrt, zugesagt (Knopf Jetzt mitfahren)');
    await max.app.start.rideAlong(id);
    lead.driving = true;
    max.driving = true;
    lead.dist = 300;
    max.dist = 100;
    await w.settle();
    await w.drive(3);
    for (const b of allSeeAll([lead, max])) c.expect(false, b);
    c.note('Verbindung im Code: app/src/app/ausfahrt/[id].tsx startGroup (Owner: setRideStatus laeuft und startAsLead, Teilnehmer: rideAlong), Kanal ride-<ausfahrt id>.');
    c.note('Kein automatischer Start am Termin: der Owner muss tippen (Knopf erscheint 2 h vorher), Teilnehmer sehen Jetzt mitfahren erst, wenn rideStatus laeuft ist.');
    await lead.app.ride.endRideForAll();
    await lead.app.invites.setRideStatus(id, 'beendet');
    lead.driving = false;
    max.driving = false;
    await w.settle();
  });
}
