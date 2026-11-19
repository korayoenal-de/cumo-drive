/**
 * Traduzione italiana dei testi legali (src/content/legal.ts). Versione di lancio del 18 novembre 2026, redatta secondo scienza e coscienza senza verifica legale.
 * Fa fede la versione tedesca. Tradotto da Claude, non è una consulenza legale.
 */
import type { LegalDoc } from './legal';

const CONTACT = 'kontakt@cumodrive.com';
const IMPRINT = 'https://cumodrive.de/impressum';
const STAND = 'Aggiornato al 19 novembre 2026. Questa è una traduzione; fa fede la versione tedesca.';

export const PRIVACY_IT: LegalDoc = {
  title: 'Privacy',
  lead:
    'Cumo Drive è un’app di navigazione per auto sportive, con app per iPhone, CarPlay e planner web. Questa pagina spiega quali dati nascono, perché ci servono e chi li vede. In breve: non mostriamo pubblicità, non vendiamo dati e non usiamo servizi di tracciamento.',
  stand: STAND,
  blocks: [
    {
      h: '1. Titolare del trattamento',
      p: [
        `Titolare è il gestore di Cumo Drive, il CUMO DRIVERS CLUB, rappresentato da Koray Önal. L’indirizzo completo è nell’impressum su ${IMPRINT}.`,
        `Per domande sulla privacy scrivici a ${CONTACT}. Non abbiamo nominato un responsabile della protezione dei dati perché non siamo obbligati a farlo.`,
      ],
    },
    {
      h: '2. Quali dati trattiamo',
      list: [
        'Account: indirizzo email, password (salvata solo in forma cifrata), nome visualizzato con cui gli altri ti invitano ai giri di gruppo.',
        'Consensi: che in fase di registrazione hai accettato le condizioni d’uso e preso visione dell’informativa privacy, con data e versione, e se desideri ricevere novità via email.',
        'Tour: tour pianificati e salvati con tappe, tracciato, nomi e cartelle, e i tour che pubblichi nella community.',
        'Guide: quando avvii la navigazione, la traccia percorsa con orario, velocità e statistiche (chilometri, curve, accelerazione laterale) e la tua valutazione della guida con motivi e nota.',
        'Uso della pianificazione: quando pianifichi un giro, lo rigeneri, lo salvi, lo adotti, lo pubblichi, lo elimini o parti, salviamo il tracciato del tour, la lunghezza, il profilo e il livello di divertimento calcolato. Prima tagliamo i primi e gli ultimi 2 km del tracciato, così partenza e destinazione, per esempio la porta di casa, non sono incluse.',
        'Veicoli: dati del tuo garage come marca e modello, forma e colore del simbolo del veicolo.',
        'Profilo e community: foto profilo se ne imposti una (ridotta a 512 pixel, accessibile a chi ha il link, rimovibile in ogni momento), località di residenza (mostrata agli altri solo come centro del paese, mai come indirizzo), il testo Su di me, se sei visibile tra i Piloti, se gli altri possono scriverti e se vedono il tuo garage. Inoltre messaggi privati, uscite del club con richieste e chat.',
        'Radio nel giro di gruppo: la tua voce solo mentre tieni premuto il tasto radio. Viene trasmessa in diretta agli altri partecipanti e non viene registrata né salvata.',
        'Notifiche: se le consenti, un token del dispositivo per le notifiche push su messaggi, inviti e richieste.',
        'Feedback: quando tocchi Segnala un problema, la posizione, ciò che l’app mostrava in quel momento, gli ultimi minuti della guida e la versione dell’app; quando valuti male una guida, valutazione, motivi e nota; quando invii un feedback nelle Impostazioni, area, testo e versione dell’app. Esaminiamo ogni segnalazione per correggere errori e migliorare l’app (legittimo interesse, art. 6, par. 1, lett. f GDPR) e ti avvisiamo quando il tuo feedback è stato realizzato.',
        'Segnalazioni di errore: se l’app si blocca o si verifica un errore, inviamo il messaggio di errore con il punto del programma, la versione dell’app, la schermata e il sistema operativo, insieme all’ID del tuo account se hai effettuato l’accesso. Posizioni e contenuti non sono inclusi. Gli errori uguali vengono contati insieme per poterli correggere (legittimo interesse, art. 6, par. 1, lett. f GDPR).',
        'Posizione: durante la pianificazione e la navigazione, per guidarti e per pianificare giri dalla tua posizione. Nel giro di gruppo gli altri partecipanti vedono la tua posizione in diretta finché il giro è in corso.',
        'Fotocamera e microfono: la fotocamera solo per leggere un codice QR dal planner web; non salviamo immagini. Il microfono solo per la radio, mentre tieni premuto il tasto.',
        'Acquisto: se hai un abbonamento e quando scade. I dati di pagamento li vede solo Apple, noi no.',
        'Dati tecnici: quando si accede ai server vengono trattati indirizzo IP, orario e tipo di dispositivo. Non li usiamo per creare profili.',
      ],
    },
    {
      h: '3. Finalità e basi giuridiche',
      list: [
        'Fornire l’app, il tuo account, la pianificazione, la navigazione, i giri di gruppo e la sincronizzazione tra app e planner web: esecuzione del contratto con te (art. 6, par. 1, lett. b GDPR).',
        'Posizione: solo con il tuo permesso sull’iPhone, che puoi revocare in ogni momento nelle Impostazioni. Senza posizione puoi comunque pianificare, ma non navigare.',
        'Migliorare le strade: analizziamo valutazioni, tracce percorse e uso della pianificazione in forma aggregata e senza riferimento alla tua persona, per migliorare il livello di divertimento delle strade e la pianificazione (legittimo interesse, art. 6, par. 1, lett. f GDPR). Un tratto di strada entra solo quando almeno tre piloti diversi lo hanno usato. Nessuno oltre all’analisi vede le tue singole voci, nemmeno gli altri piloti. Puoi opporti in ogni momento all’indirizzo indicato sopra.',
        'Sicurezza e protezione dagli abusi dei server: legittimo interesse (art. 6, par. 1, lett. f GDPR).',
        'Novità via email (nuove funzioni, strade, uscite): solo se acconsenti in fase di registrazione o nelle Impostazioni e hai confermato il tuo indirizzo email (consenso, art. 6, par. 1, lett. a GDPR). Puoi revocarlo in ogni momento nelle Impostazioni o tramite il link presente in ogni email. Conserviamo l’accettazione delle condizioni e dell’informativa come prova finché il tuo account esiste (art. 6, par. 1, lett. c GDPR).',
        'Conservazione prevista dalla legge, per esempio per le licenze club fatturate ai club: obbligo legale (art. 6, par. 1, lett. c GDPR).',
      ],
    },
    {
      h: '4. Chi riceve i dati',
      p: ['Trasmettiamo dati solo ai servizi che servono per la rispettiva funzione. Con i responsabili del trattamento esistono accordi ai sensi dell’art. 28 GDPR.'],
      list: [
        'Supabase (Supabase Pte. Ltd., Singapore, server a Francoforte sul Meno): account, tour, guide, veicoli, messaggi, uscite con chat, feedback, segnalazioni di errore, stato dei passi e connessione in tempo reale dei giri di gruppo. Responsabile del trattamento; i trasferimenti fuori dall’UE si basano sulle clausole contrattuali tipo.',
        'Brevo (Sendinblue SAS, Francia): invia per nostro conto l’email di conferma del tuo indirizzo email. Vengono trasmessi il tuo indirizzo email, il contenuto di questa email e i dati di consegna. Responsabile del trattamento con sede nell’UE.',
        'I nostri server di routing presso Contabo (Contabo GmbH, Germania): calcolano i percorsi dalle tue tappe. Responsabile del trattamento.',
        'Anche la ricerca dei luoghi, il profilo altimetrico, i limiti di velocità e le soste lungo il percorso vengono calcolati dai nostri server presso Contabo. Solo se non sono raggiungibili l’app ripiega su Photon di komoot (komoot GmbH, Germania) con il termine cercato o la coordinata e sul server Valhalla di FOSSGIS e.V. (Germania) con il tracciato del percorso.',
        'Apple (Apple Distribution International, Irlanda, e Apple Inc., USA): App Store, abbonamenti, visualizzazione mappe con Apple Mappe, CarPlay e meteo ai passi tramite WeatherKit. Per il meteo inviamo la posizione del passo, non la tua.',
        'Expo (650 Industries Inc., USA): distribuisce gli aggiornamenti dell’app. Vengono trattati indirizzo IP e dati del dispositivo. Il trasferimento negli USA si basa sull’EU US Data Privacy Framework.',
        'TomTom (TomTom International B.V., Paesi Bassi): fornisce al nostro server le segnalazioni di passi chiusi e chiusure attuali. Il nostro server interroga a questo scopo aree della mappa approssimative, nessun dato su di te.',
        'LiveKit (LiveKit Inc., USA, server a Francoforte sul Meno): trasmette la radio nel giro di gruppo in diretta tra i partecipanti, senza registrazione. Vengono trasmessi il tuo nome visualizzato, un identificativo e la tua voce mentre parli. Responsabile del trattamento; un trasferimento negli USA si basa su clausole contrattuali standard.',
        'Notifiche push tramite Expo (650 Industries Inc., USA) e il servizio push di Apple: titolo, testo breve e token del dispositivo della notifica.',
        "Acquisti dell'abbonamento: Apple gestisce il pagamento, non riceviamo dati di pagamento. RevenueCat (RevenueCat Inc., USA) gestisce per noi gli acquisti e li comunica al nostro server. Vengono trasmessi l'identificativo del tuo account, i prodotti acquistati, gli orari e i dati del dispositivo dall'App Store. Responsabile del trattamento; la base per il trasferimento negli USA è l'EU US Data Privacy Framework.",
        'Nel planner web inoltre: OpenFreeMap per le tessere della mappa. La libreria della mappa e i caratteri li forniamo dal nostro dominio, senza Google Fonts o CDN di terzi.',
        'Altri piloti: nel giro di gruppo il tuo nome visualizzato, il veicolo, la posizione in diretta e, in radio, la tua voce, solo per la durata del giro. Nella community il tuo nome visualizzato, la foto profilo e il tour pubblicato; tra i Piloti (disattivabile) nome, centro del paese, Su di me e, se vuoi, il tuo garage. I messaggi privati li vede solo il destinatario; se qualcuno segnala un messaggio, ne vediamo una copia per la verifica.',
      ],
    },
    {
      h: '5. Per quanto tempo conserviamo i dati',
      list: [
        'Account, tour, guide e veicoli finché li elimini o elimini l’account.',
        'Voci sull’uso della pianificazione per al massimo 24 mesi; poi restano solo i valori aggregati per tratto di strada.',
        'Feedback, segnalazioni di errore e registri di guida da Segnala un problema per al massimo 12 mesi.',
        'Le posizioni in diretta nei giri di gruppo non vengono salvate, ma solo scambiate tra i partecipanti durante il giro.',
        'Log dei server per al massimo 14 giorni.',
        'Dati di fatturazione per le licenze club per il tempo richiesto dal diritto commerciale e fiscale (fino a 10 anni).',
      ],
    },
    {
      h: '6. Eliminare l’account',
      p: [
        'Puoi eliminare il tuo account in ogni momento nell’app in Impostazioni, Account, Elimina account, e anche nel web planner in Impostazioni. Eliminiamo quindi account, tour, guide, veicoli, valutazioni, feedback e le voci sull’uso della pianificazione. Anche i tour pubblicati nella community scompaiono. Restano le analisi aggregate senza riferimento personale. Un abbonamento lo disdici separatamente nelle impostazioni del tuo ID Apple.',
      ],
    },
    {
      h: '7. Sul tuo dispositivo',
      p: [
        'L’app salva sull’iPhone tour, impostazioni (per esempio stile mappa, voce, indicazione della velocità, lingua) e il tuo accesso. Il planner web salva tour e accesso nel browser. Non impostiamo cookie per pubblicità o analisi; ciò che salviamo localmente è necessario per il funzionamento (§ 25, comma 2 TDDDG).',
      ],
    },
    {
      h: '8. I tuoi diritti',
      p: [
        `Hai diritto di accesso, rettifica, cancellazione, limitazione del trattamento, portabilità dei dati e opposizione (art. 15 a 21 GDPR). Puoi revocare un consenso in ogni momento con effetto per il futuro. Scrivici a ${CONTACT}.`,
        'Puoi anche presentare reclamo a un’autorità di controllo per la protezione dei dati, per esempio il Garante per la protezione dei dati dell’Assia (Hessischer Beauftragter für Datenschutz und Informationsfreiheit) o il Garante per la protezione dei dati personali in Italia.',
      ],
    },
    {
      h: '9. Nessuna decisione automatizzata',
      p: ['Non prendiamo decisioni basate unicamente su un trattamento automatizzato che producano effetti giuridici nei tuoi confronti.'],
    },
    {
      h: '10. Modifiche',
      p: ['Quando introduciamo nuove funzioni aggiorniamo questa informativa. La versione attuale è sempre disponibile qui.'],
    },
  ],
};

export const TERMS_IT: LegalDoc = {
  title: 'Condizioni',
  headTitle: 'Condizioni d’uso',
  lead:
    'Condizioni generali e condizioni d’uso. Queste condizioni valgono per l’app Cumo Drive su iPhone e in CarPlay e per il planner web. Per gli acquisti tramite App Store vale inoltre il contratto di licenza standard di Apple. Questa è una traduzione; fa fede la versione tedesca.',
  stand: STAND,
  blocks: [
    {
      h: '1. Fornitore e ambito',
      p: [
        `Il fornitore è il CUMO DRIVERS CLUB, rappresentato da Koray Önal (indirizzo nell’impressum su ${IMPRINT}, contatto ${CONTACT}). Queste condizioni valgono per tutti gli utenti. Condizioni diverse degli utenti non si applicano.`,
      ],
    },
    {
      h: '2. Servizio',
      p: [
        'Cumo Drive pianifica tour per auto sportive, li verifica con i dati stradali (larghezza, fondo, chiusure), annuncia passi e strade da sogno, ti guida con la navigazione e collega i piloti nei giri di gruppo. Si basa su dati di OpenStreetMap, Apple e altri servizi e sulla nostra banca dati di strade e passi.',
        'Sviluppiamo Cumo Drive di continuo. Le funzioni possono cambiare finché il nucleo del servizio resta. L’app può essere limitata temporaneamente, per esempio durante la manutenzione o se servizi di terzi non funzionano; in quel caso pianifica tramite servizi alternativi con meno funzioni.',
      ],
    },
    {
      h: '3. Prima la sicurezza',
      list: [
        'Il codice della strada e la segnaletica prevalgono sempre sulle indicazioni dell’app, anche per velocità, chiusure e svolte.',
        'Non usare l’app durante la guida, salvo tramite CarPlay o gli annunci vocali. Pianifica prima della partenza o fai pianificare a un passeggero.',
        'Strade, larghezze, fondo, stato dei passi, meteo, limiti di velocità e avvisi di curva si basano su dati di terzi e stime. Possono essere errati, superati o incompleti. Verifica tu stesso chiusure e meteo prima di partire.',
        'Cumo Drive non è uno strumento per gare o competizioni. Guida in modo adeguato e nel rispetto della legge.',
      ],
    },
    {
      h: '4. Account',
      p: [
        'L’app richiede un account con indirizzo email e password. Devi avere almeno 16 anni. Tieni segreta la password. Puoi eliminare l’account in ogni momento nell’app. Possiamo sospendere un account che viola queste condizioni, se possibile solo dopo un avviso.',
      ],
    },
    {
      h: '5. Abbonamenti e prezzi',
      list: [
        'Le offerte a pagamento le acquisti nell’app tramite Apple. Valgono i prezzi mostrati nell’app prima dell’acquisto, IVA inclusa. La fatturazione avviene tramite il tuo ID Apple.',
        'Gli abbonamenti settimanali, mensili e annuali si rinnovano automaticamente per la stessa durata, a meno che tu non li disdica nelle impostazioni del tuo ID Apple almeno 24 ore prima della scadenza. Il pass stagionale vale per il periodo indicato e termina da solo.',
        'Se l’app offre una prova gratuita, alla sua scadenza parte l’abbonamento scelto, a meno che tu non lo disdica prima.',
        'L’acquisto lo concludi con Apple; Apple è il venditore degli abbonamenti e del pass stagionale. Un eventuale diritto di recesso lo eserciti quindi nei confronti di Apple, secondo le condizioni di Apple per gli acquisti sull’App Store. Recesso e rimborsi li chiedi ad Apple su reportaproblem.apple.com.',
        'Le licenze club e i pass evento per club e organizzatori vengono stipulati separatamente e fatturati. I membri di un club con licenza valida possono usare le funzioni senza un proprio abbonamento finché la licenza è attiva.',
      ],
    },
    {
      h: '6. I nostri contenuti e dati',
      list: [
        'L’app, il planner web e i nostri contenuti, in particolare le banche dati da noi create su passi, strade, highlight e tour con valutazioni, descrizioni e annunci, e i profili di routing, sono protetti dal diritto d’autore e come banca dati ai sensi dei §§ 87a e seguenti della legge tedesca sul diritto d’autore (UrhG).',
        'Puoi usarli per i tuoi scopi privati nell’app e nel planner web. Le licenze club danno diritto all’uso per i giri del club.',
        'Non sono consentiti: lettura e salvataggio sistematici o automatizzati (scraping, bot, interfacce non pubbliche), copia o diffusione di parti sostanziali delle banche dati, il loro uso per creare o addestrare un servizio concorrente o un modello di IA e l’elusione di misure tecniche di protezione, salvo quanto consentito dalla legge.',
        'L’esportazione GPX e KML serve all’uso personale, per esempio in un navigatore. La diffusione commerciale di tour esportati richiede il nostro consenso.',
        'I dati cartografici provengono in parte da OpenStreetMap (© collaboratori di OpenStreetMap, licenza ODbL). Per questi dati valgono le condizioni della ODbL; queste condizioni non limitano i diritti concessi da essa.',
      ],
    },
    {
      h: '7. I tuoi contenuti',
      list: [
        'Tour, testi e valutazioni che crei restano tuoi.',
        'Quando pubblichi un tour nella community, ci consenti gratuitamente di mostrarlo in Cumo Drive, di renderlo disponibile ad altri utenti e di usarlo per migliorare la pianificazione dei percorsi. La visualizzazione termina quando ritiri o elimini il tour.',
        'Analizziamo valutazioni e tracce percorse in forma aggregata e senza riferimento alla tua persona per valutare le strade. L’analisi entra a far parte della nostra banca dati.',
        'Pubblica solo ciò che puoi pubblicare: nessun contenuto di terzi senza diritti, nessun contenuto offensivo o illecito, nessun percorso che inviti a comportamenti vietati. Possiamo rimuovere tali contenuti.',
      ],
    },
    {
      h: '7a. Messaggi, segnalazioni e blocco',
      list: [
        'Messaggi, chat e radio servono per i giri e lo scambio tra piloti. Sono vietati contenuti illeciti e affari di ogni tipo (per esempio droghe, armi o merce rubata), pubblicità e spam, truffe e molestie.',
        'Puoi segnalare qualsiasi contenuto e qualsiasi profilo e bloccare altri piloti. Esaminiamo i contenuti segnalati; a questo scopo salviamo con ogni segnalazione una copia del contenuto segnalato.',
        'Se un contenuto viola queste condizioni o la legge, lo rimuoviamo o sospendiamo l’account. Ricevi allora nell’app una comunicazione con la motivazione e puoi opporti scrivendo a ' + CONTACT + '.',
        'I nuovi account possono scrivere ad altri solo dopo 24 ore, a meno che non guidino insieme. Le nuove conversazioni sono limitate al giorno.',
        'Comunichiamo dati alle autorità solo su richiesta formale. Se ci sono indizi di pericolo per la vita o la sicurezza di persone, informiamo le autorità competenti.',
      ],
    },
    {
      h: '8. Responsabilità',
      p: [
        'Rispondiamo senza limiti per dolo e colpa grave, per danni derivanti da lesioni alla vita, al corpo o alla salute e ai sensi della legge sulla responsabilità per danno da prodotti. In caso di colpa lieve rispondiamo solo per la violazione di obblighi contrattuali essenziali e limitatamente al danno tipico e prevedibile. Per il resto la responsabilità è esclusa.',
        'Non garantiamo contenuti e disponibilità di servizi di terzi (mappe, meteo, stato dei passi, ricerca dei luoghi).',
      ],
    },
    {
      h: '9. Modifiche alle condizioni',
      p: [
        'Possiamo modificare queste condizioni quando cambiano leggi, funzioni o servizi. Le modifiche che riguardano solo nuove funzioni, non ti penalizzano o sono richieste dalla legge valgono dalla pubblicazione della nuova versione. Sulle modifiche rilevanti ti informiamo in anticipo nell’app o via e-mail; valgono per te solo quando le accetti. Se non le accetti, puoi continuare a usare l’app alle condizioni precedenti fino alla fine di un periodo pagato ed eliminare il tuo account in qualsiasi momento.',
      ],
    },
    {
      h: '10. Disposizioni finali',
      list: [
        'Si applica il diritto tedesco. Se sei un consumatore con residenza abituale in un altro paese, restano salve le norme imperative a tutela dei consumatori di quel paese.',
        'Non partecipiamo a procedure di risoluzione delle controversie davanti a un organismo di conciliazione per i consumatori e non siamo obbligati a farlo.',
        'Se una disposizione è invalida, le altre restano valide.',
        'In caso di dubbio fa fede la versione tedesca di queste condizioni.',
      ],
    },
  ],
};

export const IMPRINT_IT: LegalDoc = {
  title: 'Note legali',
  lead: 'Informazioni ai sensi del § 5 DDG (legge tedesca sui servizi digitali) per l’app Cumo Drive, il planner web e il sito cumodrive.de.',
  stand: STAND,
  blocks: [
    { h: 'Fornitore', p: ['CUMO DRIVERS CLUB', 'rappresentato da Koray Önal', 'Ludwigstraße 62b', '64646 Heppenheim', 'Germania'] },
    { h: 'Contatto', p: [`E-mail: ${CONTACT}`, 'Nell’app ci raggiungi anche in Impostazioni, Feedback. Di solito rispondiamo entro due giorni lavorativi.'] },
    { h: 'Responsabile dei contenuti', p: ['Responsabile ai sensi del § 18, comma 2 MStV: Koray Önal, indirizzo come sopra.'] },
    { h: 'Risoluzione delle controversie dei consumatori', p: ['Non partecipiamo a procedure di risoluzione delle controversie davanti a un organismo di conciliazione per i consumatori e non siamo tenuti a farlo.'] },
    {
      h: 'Contenuti e dati',
      p: [
        'I dati cartografici provengono in parte da OpenStreetMap (© contributori di OpenStreetMap, licenza ODbL). La banca dati di strade e passi, i testi, le valutazioni e il logo di Cumo Drive sono protetti dal diritto d’autore.',
        'Dei contenuti dei siti esterni a cui rimandiamo sono responsabili i rispettivi gestori.',
      ],
    },
  ],
};
