/**
 * Ausfahrten (C5 bis C10) und Drivers Nachrichten (D1, D2) mit mehreren virtuellen Konten.
 * Die Nummern C5 bis C10 sind hier so belegt: Anlegen, Anfragen, Annehmen und Ablehnen, Einladen,
 * Chat, Absagen und Zurückziehen.
 */
import { clock } from './clock';
import { asAdmin, lit } from './db';
import type { World } from './harness';
import { scenario } from './report';
import { loadSampleTour } from './scenarios-group';

export async function communityScenarios(w: World, opts: { ausfahrten: boolean; nachrichten: boolean }) {
  const tour = loadSampleTour();
  if (opts.ausfahrten) await ausfahrten(w, tour);
  if (opts.nachrichten) await nachrichten(w);
}

async function ausfahrten(w: World, tour: ReturnType<typeof loadSampleTour>) {
  const org = await w.addDriver('Olga Orga', 'Porsche 911 Carrera T');
  const max = await w.addDriver('Moritz Anfrage', 'Toyota GR86');
  const sina = await w.addDriver('Sonja Abgelehnt', 'Mazda MX5');
  const carl = await w.addDriver('Conrad Gast', 'Audi TT RS');
  const paul = await w.addDriver('Pia Voll', 'Porsche 718 Spyder');
  const dora = await w.addDriver('Dana Spaet', 'Alpine A110 S');
  const exp = await w.addDriver('Erik Ohne Abo', 'VW Golf R');
  let id = '';

  await scenario('C5', 'Ausfahrt anlegen und in der Community sehen', async (c) => {
    const saved = org.app.library.saveTour({ ...tour, minutes: 300 }, '');
    const startsAt = new Date(Date.now() + 3 * 86400000);
    id = await org.app.ausfahrten.publishAusfahrt(saved, { startsAt, meeting: { name: 'Tankstelle Cortina', lat: 46.54, lon: 12.13 }, note: 'Ruhig fahren', seats: 3 });
    c.expect(/^[0-9a-f-]{36}$/.test(id), 'publish_ride liefert eine ID');
    c.expect(!!org.app.library.readLibrary()[0]?.cloudId, 'Tour wurde dafür ins Konto gespeichert');
    const seen = (await max.app.ausfahrten.listAusfahrten()).find((a) => a.id === id);
    c.expect(!!seen, 'andere sehen die Ausfahrt');
    c.expect(seen?.ownerName === 'Olga Orga' && seen.taken === 1 && seen.maxMembers === 4, `Belegung 1 von 4 (${seen?.taken} von ${seen?.maxMembers})`);
    c.expect(seen?.km === tour.laenge_km && seen.minutes === 300, `km und Minuten (${seen?.km}, ${seen?.minutes})`);
    c.expect(seen?.meeting?.name === 'Tankstelle Cortina' && seen.note === 'Ruhig fahren', 'Treffpunkt und Notiz');
    c.expect(Math.abs((seen?.startsAt.getTime() ?? 0) - startsAt.getTime()) < 1000, 'Abfahrt stimmt');
    c.expect(seen?.myStatus == null && !seen?.isOwner, 'noch kein eigener Status');
    const t = await max.app.ausfahrten.ausfahrtTour(id);
    c.expect(t?.tour.linie.length === tour.linie.length, 'Tour der Ausfahrt für Nicht Mitglieder ladbar');
    // Ohne Abo (Testphase abgelaufen) kein Veröffentlichen
    const up = await asAdmin(`update public.profiles set trial_ends_at = now() - interval '1 day' where id = ${lit(exp.id)}`);
    c.expect(!up.error, `Testphase beenden (${up.error?.message ?? ''})`);
    let own = '';
    await exp.client.from('profiles').update({ trial_ends_at: new Date(Date.now() + 86400000 * 30).toISOString() }).eq('id', exp.id!).then((r) => (own = r.error?.message ?? ''));
    c.expect(/Mitgliedschaft kann nicht/.test(own), `Abo Spalten aus der App nicht änderbar (${own})`);
    const s2 = exp.app.library.saveTour({ ...tour }, '');
    let e1 = '';
    await exp.app.ausfahrten.publishAusfahrt(s2, { startsAt, meeting: null, note: '', seats: 3 }).catch((e: Error) => (e1 = e.message));
    c.expect(/Mitgliedschaft/.test(e1), `ohne Abo abgewiesen (${e1})`);
    let e2 = '';
    await org.app.ausfahrten.publishAusfahrt(saved, { startsAt: new Date(Date.now() + 5 * 60000), meeting: null, note: '', seats: 3 }).catch((e: Error) => (e2 = e.message));
    c.expect(/Zukunft/.test(e2), `Abfahrt zu früh abgewiesen (${e2})`);
  });

  await scenario('C6', 'Mitfahren anfragen', async (c) => {
    let own = '';
    await org.app.ausfahrten.requestAusfahrt(id, '', null).catch((e: Error) => (own = e.message));
    c.expect(own === 'Das ist deine eigene Ausfahrt', `eigene Ausfahrt nicht anfragbar (${own})`);
    await max.app.ausfahrten.requestAusfahrt(id, 'Hallo, ich bin dabei', null);
    await sina.app.ausfahrten.requestAusfahrt(id, 'Darf ich?', 'Mazda MX5 RF');
    const mine = (await max.app.ausfahrten.listAusfahrten()).find((a) => a.id === id);
    c.expect(mine?.myStatus === 'angefragt', `Max Status angefragt (${mine?.myStatus})`);
    c.expect(mine?.taken === 1, 'Anfragen belegen keinen Platz');
    const o = (await org.app.ausfahrten.listAusfahrten()).find((a) => a.id === id);
    c.expect(o?.openRequests === 2 && o.isOwner, `Organisator sieht 2 offene Anfragen (${o?.openRequests})`);
    const req = await org.app.ausfahrten.listAnfragen(id);
    c.expect(req.length === 2 && req[0].name === 'Moritz Anfrage' && req[0].message === 'Hallo, ich bin dabei', 'Anfragen mit Name und Nachricht');
    c.expect(req[0].vehicle === 'Toyota GR86' && req[1].vehicle === 'Mazda MX5 RF', 'Fahrzeug aus Profil oder Anfrage');
    const other = await max.app.ausfahrten.listAnfragen(id);
    c.expect(other.length === 0, 'nur der Organisator sieht Anfragen');
    const { data } = await max.client.from('rides').select('id').eq('id', id);
    c.expect(Array.isArray(data) && data.length === 0, 'Anfragende sehen die Fahrt selbst noch nicht (RLS)');
    const chat = await max.app.ausfahrten.loadNachrichten(id);
    c.expect(chat.length === 0, 'Anfragende lesen keinen Chat');
  });

  await scenario('C7', 'Anfrage annehmen und ablehnen', async (c) => {
    let bad = '';
    await max.app.ausfahrten.answerAnfrage(id, sina.id!, true).catch((e: Error) => (bad = e.message));
    c.expect(/Nur der Organisator/.test(bad), 'nur Organisator beantwortet');
    await org.app.ausfahrten.answerAnfrage(id, max.id!, true);
    await org.app.ausfahrten.answerAnfrage(id, sina.id!, false);
    const m = (await max.app.ausfahrten.listAusfahrten()).find((a) => a.id === id);
    c.expect(m?.myStatus === 'zugesagt' && m.taken === 2, `Max zugesagt, 2 belegt (${m?.myStatus}, ${m?.taken})`);
    const s = (await sina.app.ausfahrten.listAusfahrten()).find((a) => a.id === id);
    c.expect(s?.myStatus === 'abgelehnt', 'Sina abgelehnt');
    let again = '';
    await sina.app.ausfahrten.requestAusfahrt(id, 'Bitte', null).catch((e: Error) => (again = e.message));
    c.expect(/abgelehnt/.test(again), `erneute Anfrage nach Ablehnung abgewiesen (${again})`);
    const tn = await sina.app.ausfahrten.ausfahrtTeilnehmer(id);
    c.expect(tn.length === 2 && tn[0].isOwner && tn[1].name === 'Moritz Anfrage', `Teilnehmer: ${tn.map((t) => t.name).join(', ')}`);
    const { data } = await max.client.from('rides').select('id').eq('id', id);
    c.expect(Array.isArray(data) && data.length === 1, 'Zugesagte sehen die Fahrt');
  });

  await scenario('C8', 'Organisator lädt ein, Gast sagt zu, Ausfahrt voll', async (c) => {
    await org.app.invites.inviteToRide(id, carl.id!);
    const a = (await carl.app.ausfahrten.listAusfahrten()).find((x) => x.id === id);
    c.expect(a?.myStatus === 'eingeladen', `Carl eingeladen (${a?.myStatus})`);
    c.expect(a?.taken === 3, 'Einladung belegt einen Platz');
    const inv = await carl.app.invites.myInvites();
    c.expect(inv.some((i) => i.rideId === id), 'Einladung auch in den Gruppen Einladungen');
    await carl.app.invites.respondInvite(id, true, carl.car);
    const b = (await carl.app.ausfahrten.listAusfahrten()).find((x) => x.id === id);
    c.expect(b?.myStatus === 'zugesagt', 'Carl zugesagt');
    await paul.app.ausfahrten.requestAusfahrt(id, '', null);
    await org.app.ausfahrten.answerAnfrage(id, paul.id!, true);
    let voll = '';
    await dora.app.ausfahrten.requestAusfahrt(id, '', null).catch((e: Error) => (voll = e.message));
    c.expect(voll === 'Die Ausfahrt ist voll', `volle Ausfahrt nimmt keine Anfrage (${voll})`);
    let inv2 = '';
    await org.app.invites.inviteToRide(id, dora.id!).catch((e: Error) => (inv2 = e.message));
    c.expect(/voll/.test(inv2), `volle Ausfahrt nimmt keine Einladung (${inv2})`);
  });

  await scenario('C9', 'Chat der Ausfahrt live', async (c) => {
    const hOrg = org.app.renderHook(() => org.app.ausfahrten.useNachrichten(id));
    const hMax = max.app.renderHook(() => max.app.ausfahrten.useNachrichten(id));
    const hSina = sina.app.renderHook(() => sina.app.ausfahrten.useNachrichten(id));
    await w.settle();
    c.expect(Array.isArray(hMax.result.current.list) && hMax.result.current.list.length === 0, 'Chat leer geladen');
    await org.app.ausfahrten.sendNachricht(id, 'Treffpunkt 9 Uhr an der Tankstelle');
    await w.settle();
    c.expect(hMax.result.current.list?.some((m) => m.body.startsWith('Treffpunkt')), 'Max bekommt die Nachricht live (ohne Nachladen)');
    c.expect(hOrg.result.current.list?.length === 1, 'Organisator sieht die eigene Nachricht');
    c.expect((hSina.result.current.list ?? []).length === 0, 'Abgelehnte bekommt nichts (RLS auch für Realtime)');
    let e1 = '';
    await sina.app.ausfahrten.sendNachricht(id, 'Hallo?').catch((e: Error) => (e1 = e.message));
    c.expect(!!e1, `Abgelehnte kann nicht schreiben (${e1})`);
    // Funkloch: Realtime verpasst die Nachricht, das Nachladen alle 20 s holt sie
    max.client.setOnline(false);
    await carl.app.ausfahrten.sendNachricht(id, 'Ich komme 5 Minuten später');
    await w.settle();
    c.expect(!hMax.result.current.list?.some((m) => m.body.includes('später')), 'im Funkloch nichts angekommen');
    max.client.setOnline(true);
    await w.settle();
    clock.advance(20000);
    await w.settle();
    c.expect(hMax.result.current.list?.some((m) => m.body.includes('später')), 'nach Rückkehr per Nachladen da');
    c.expect(hMax.result.current.list?.length === 2, `keine Dubletten (${hMax.result.current.list?.length})`);
    hOrg.unmount();
    hMax.unmount();
    hSina.unmount();
    await w.settle();
  });

  await scenario('C10', 'Absagen, Anfrage zurückziehen, Ausfahrt zurückziehen', async (c) => {
    await carl.app.ausfahrten.withdrawAusfahrt(id);
    const a = (await carl.app.ausfahrten.listAusfahrten()).find((x) => x.id === id);
    c.expect(a?.myStatus === 'abgesagt' && a.taken === 3, `Carl abgesagt, Platz frei (${a?.myStatus}, ${a?.taken})`);
    await dora.app.ausfahrten.requestAusfahrt(id, '', null);
    await dora.app.ausfahrten.withdrawAusfahrt(id);
    const d = (await dora.app.ausfahrten.listAusfahrten()).find((x) => x.id === id);
    c.expect(d?.myStatus == null, 'zurückgezogene Anfrage ist weg');
    let e1 = '';
    await org.app.ausfahrten.withdrawAusfahrt(id).catch((e: Error) => (e1 = e.message));
    c.expect(/Organisator/.test(e1), 'Organisator kann nicht absagen');
    let e2 = '';
    await max.app.ausfahrten.cancelAusfahrt(id).catch((e: Error) => (e2 = e.message));
    c.expect(e2 === 'Fahrt nicht gefunden', 'nur der Organisator zieht zurück');
    await org.app.ausfahrten.cancelAusfahrt(id);
    const after = (await max.app.ausfahrten.listAusfahrten()).find((x) => x.id === id);
    c.expect(!after, 'zurückgezogene Ausfahrt verschwindet');
    let e3 = '';
    await dora.app.ausfahrten.requestAusfahrt(id, '', null).catch((e: Error) => (e3 = e.message));
    c.expect(/gibt es nicht mehr/.test(e3), `Anfrage danach abgewiesen (${e3})`);
  });
}

async function nachrichten(w: World) {
  const anna = await w.addDriver('Anna Offen', 'Porsche 964');
  const ben = await w.addDriver('Ben Schreiber', 'Honda S2000');
  const nina = await w.addDriver('Nina Privat', 'Ferrari 308');
  const zoe = await w.addDriver('Zoe Zaungast', 'Fiat 124 Abarth');

  await scenario('D1', 'Nachrichten zwischen zwei Fahrern live', async (c) => {
    await anna.app.drivers.savePrivacy({ homeName: 'Bensheim', home: [49.68123, 8.61789], allowMessages: true, showGarage: false });
    const pv = await anna.app.drivers.loadPrivacy();
    c.expect(pv?.home?.[0] === 49.68 && pv.home[1] === 8.62, `Wohnort auf etwa 1 km gerundet (${pv?.home})`);
    const list = await ben.app.drivers.listDrivers();
    const a = list.find((d) => d.id === anna.id);
    c.expect(a?.homeName === 'Bensheim' && a.garage === null && a.allowMessages, 'Anna auf der Karte, Fuhrpark verborgen');
    // Zaungast lauscht auf alle direct_messages
    let leaked = 0;
    zoe.client
      .channel('spy')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, () => leaked++)
      .subscribe();
    const hBen = ben.app.renderHook(() => ben.app.drivers.useDirectChat(ben.id!, anna.id!));
    await w.settle();
    await ben.app.drivers.sendDirect(anna.id!, 'Hallo Anna, fährst du Samstag mit?');
    await w.settle();
    const conv = await anna.app.drivers.listConversations();
    c.expect(conv[0]?.partner === ben.id && conv[0].unread === 1 && !conv[0].lastFromMe, `Anna hat 1 ungelesene von Ben (${conv[0]?.unread})`);
    const hBadge = anna.app.renderHook(() => anna.app.drivers.useUnreadMessages());
    await anna.app.drivers.refreshUnread();
    await w.settle();
    c.expect(hBadge.result.current === 1, `Plakette zeigt 1 (${hBadge.result.current})`);
    const hAnna = anna.app.renderHook(() => anna.app.drivers.useDirectChat(anna.id!, ben.id!));
    await w.settle();
    c.expect(hAnna.result.current.list?.length === 1, 'Anna sieht die Nachricht im Chat');
    c.expect(hBadge.result.current === 0, `nach dem Öffnen gelesen, Plakette 0 (${hBadge.result.current})`);
    await anna.app.drivers.sendDirect(ben.id!, 'Ja, gern!');
    await w.settle();
    c.expect(hBen.result.current.list?.length === 2 && hBen.result.current.list[1].body === 'Ja, gern!', 'Ben bekommt die Antwort live');
    const { data } = await zoe.client.from('direct_messages').select('id');
    c.expect(Array.isArray(data) && data.length === 0, 'Dritte lesen keine fremden Nachrichten');
    c.expect(leaked === 0, `Dritte bekommen keine Realtime Ereignisse (${leaked})`);
    hBen.unmount();
    hAnna.unmount();
    hBadge.unmount();
  });

  await scenario('D2', 'allow_messages=false: nicht anschreibbar, Antworten gehen', async (c) => {
    await nina.app.drivers.savePrivacy({ allowMessages: false });
    const n = (await ben.app.drivers.listDrivers()).find((d) => d.id === nina.id);
    c.expect(n?.allowMessages === false, 'Nina zeigt sich als nicht anschreibbar');
    let e1 = '';
    await ben.app.drivers.sendDirect(nina.id!, 'Hallo Nina').catch((e: Error) => (e1 = e.message));
    c.expect(e1 === 'Dieser Fahrer möchte gerade keine Nachrichten bekommen.', `Ben kann Nina nicht anschreiben (${e1})`);
    const { data } = await asAdmin(`select count(*) from public.direct_messages where recipient = ${lit(nina.id)}`).then((r) => ({ data: r.out }));
    c.expect(data === '0', 'nichts gespeichert');
    // Nina schreibt selbst, dann darf Ben antworten
    await nina.app.drivers.sendDirect(ben.id!, 'Hi Ben, kurze Frage zur Tour');
    const conv = await ben.app.drivers.listConversations();
    c.expect(conv.find((x) => x.partner === nina.id)?.canReply === true, 'Ben darf Nina antworten');
    let e2 = '';
    await ben.app.drivers.sendDirect(nina.id!, 'Klar, frag!').catch((e: Error) => (e2 = e.message));
    c.expect(!e2, `Antwort an Nina geht (${e2})`);
    let e3 = '';
    await zoe.app.drivers.sendDirect(nina.id!, 'Und ich?').catch((e: Error) => (e3 = e.message));
    c.expect(!!e3, 'Dritte können Nina weiterhin nicht anschreiben');
    let e4 = '';
    await ben.app.drivers.sendDirect(ben.id!, 'an mich').catch((e: Error) => (e4 = e.message));
    c.expect(!!e4, 'sich selbst anschreiben geht nicht');
  });
}
