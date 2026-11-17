/**
 * Landingpage auf Englisch (/en) und Italienisch (/it), Koray 17.11. Schlüssel ist der deutsche Text eines
 * Textknotens oder eines alt und aria-label Attributs in landing-html.ts. Ändert sich dort ein Text, hier mitziehen;
 * der Test landing-i18n.test.ts meldet jeden deutschen Text ohne Übersetzung.
 * Begriffe wie in der App (en.json, it.json), Passnamen wie localPassName und englishPassName. Ohne Gedankenstriche,
 * Du Form (you, tu).
 */
export type LandingLang = 'de' | 'en' | 'it';

/** [Deutsch, Englisch, Italienisch] */
const T: [string, string, string][] = [
  // Kopf
  ['Planen', 'Plan', 'Pianifica'],
  ['Preise', 'Pricing', 'Prezzi'],
  ['Login', 'Log in', 'Accedi'],
  ['Registrieren', 'Sign up', 'Registrati'],
  ['Hauptnavigation', 'Main navigation', 'Navigazione principale'],

  // Bühne
  ['Beta für iPhone und CarPlay, jetzt testen', 'Beta for iPhone and CarPlay, try it now', 'Beta per iPhone e CarPlay, provala ora'],
  ['Kurven statt Kilometer.', 'Curves, not kilometres.', 'Curve, non chilometri.'],
  [
    'Die Navi App für Sportwagen. Cumo Drive plant kurvige Touren für Autos: Breite, Belag und Sperrungen geprüft, Großstädte und Ortsdurchfahrten gemieden, Pässe und Traumstrecken mit Ansage und Fahrspaß Pegel. Allein, mit deiner Gruppe und Funk oder bei einer Ausfahrt aus der Community.',
    'The navigation app for sports cars. Cumo Drive plans curvy routes made for cars: width, surface and closures checked, big cities and village centres avoided, passes and dream roads announced with their driving fun level. On your own, with your group on the radio or on a club drive from the community.',
    'L’app di navigazione per auto sportive. Cumo Drive pianifica giri pieni di curve pensati per le auto: larghezza, fondo e chiusure verificati, grandi città e centri abitati evitati, passi e strade da sogno annunciati con il loro livello di divertimento. Da solo, con il tuo gruppo e la radio oppure in un’uscita della community.',
  ],
  ['Kostenlos starten', 'Start for free', 'Inizia gratis'],
  ['So funktioniert es', 'How it works', 'Come funziona'],
  ['Sellaronda auf der Karte mit Sellajoch, Pordoijoch, Campolongopass und Grödner Joch', 'Sella Ronda on the map with Sella Pass, Pordoi Pass, Campolongo Pass and Gardena Pass', 'Sella Ronda sulla mappa con Passo Sella, Passo Pordoi, Passo Campolongo e Passo Gardena'],
  ['Ansage in der Navigation: in 650 m Sellajoch, Legende, 13 km, 13 Kehren, 2.218 m', 'Announcement during navigation: Sella Pass in 650 m, Legend, 13 km, 13 hairpins, 2,218 m', 'Annuncio in navigazione: Passo Sella tra 650 m, Leggenda, 13 km, 13 tornanti, 2.218 m'],

  // Für Autos gebaut
  ['Für Autos gebaut', 'Built for cars', 'Fatta per le auto'],
  ['Kurven ja. Feldwege nie.', 'Curves yes. Farm tracks never.', 'Curve sì. Sterrati mai.'],
  [
    'Ein Sportwagen braucht seine eigenen Straßen: kurvig, breit genug, mit gutem Belag und ohne Ortsdurchfahrten. Cumo Drive plant genau diese und prüft jede Etappe, bevor du losfährst.',
    'A sports car needs its own roads: curvy, wide enough, well surfaced and without driving through villages. Cumo Drive plans exactly those and checks every stage before you set off.',
    'Un’auto sportiva ha bisogno delle sue strade: piene di curve, abbastanza larghe, con un buon asfalto e senza attraversare paesi. Cumo Drive pianifica proprio queste e controlla ogni tappa prima che tu parta.',
  ],
  ['Zwei Autos passen vorbei', 'Two cars can pass', 'Due auto si incrociano'],
  ['Schmale Straßen gern, aber nur dort, wo zwei Autos aneinander vorbeikommen. Enge Stellen siehst du vor der Fahrt.', 'Narrow roads are welcome, but only where two cars can pass each other. You see tight spots before you drive.', 'Strade strette sì, ma solo dove due auto riescono a incrociarsi. I punti stretti li vedi prima di partire.'],
  ['Guter Belag', 'Good surface', 'Buon asfalto'],
  ['Kein Schotter, kein Feldweg. Kopfsteinpflaster und rauen Asphalt meidest du auf Wunsch.', 'No gravel, no farm tracks. Cobblestones and rough tarmac can be avoided if you like.', 'Niente ghiaia, niente sterrato. Pavé e asfalto rovinato li eviti se vuoi.'],
  ['Sperrungen umfahren', 'Detour around closures', 'Evita le chiusure'],
  ['Ist eine Straße auf deiner Tour gerade gesperrt, warnt dich die App beim Losfahren und zeigt dir die Umfahrung. Wintersperren der Pässe siehst du schon beim Planen.', 'If a road on your tour is closed right now, the app warns you when you set off and shows you the detour. Winter closures of the passes are shown while you plan.', 'Se una strada del tuo giro è chiusa, l’app ti avvisa alla partenza e ti mostra la deviazione. Le chiusure invernali dei passi le vedi già mentre pianifichi.'],
  ['Ohne Ortsdurchfahrten', 'No village centres', 'Senza attraversare paesi'],
  ['Städte und Wohngebiete werden abgewertet, lange kurvige Landstraßen bevorzugt.', 'Towns and residential areas count against a route, long curvy country roads count for it.', 'Città e zone residenziali vengono penalizzate, le lunghe strade di campagna piene di curve preferite.'],
  ['Großstädte gemieden', 'Big cities avoided', 'Grandi città evitate'],
  ['Rund um große Städte gibt es selten gute Kurven. Die kurvige Planung macht einen Bogen darum.', 'There are rarely good curves around big cities. Curvy planning gives them a wide berth.', 'Intorno alle grandi città le belle curve sono rare. La pianificazione curva ci gira alla larga.'],
  ['Traumstrecken zuerst', 'Dream roads first', 'Prima le strade da sogno'],
  ['Hunderte von Fahrern recherchierte Strecken ziehen die Planung an. Liegt eine auf dem Weg, fährst du sie.', 'Hundreds of roads researched by drivers pull the route towards them. If one is on your way, you drive it.', 'Centinaia di strade scelte da piloti attirano la pianificazione. Se una è sulla tua strada, la percorri.'],

  // 01 Planen
  ['01  Planen', '01  Plan', '01  Pianifica'],
  ['Feierabendrunde in drei Tipps. Alpentour Etappe für Etappe.', 'An evening loop in three taps. An Alpine tour stage by stage.', 'Un giro serale in tre tocchi. Un tour alpino tappa per tappa.'],
  ['Rundtour', 'Loop', 'Giro ad anello'],
  [
    'startet an deinem Standort oder einem Ort deiner Wahl: Länge oder Dauer wählen, am Ring die Richtung ziehen oder Zufall, und die Runde wird kurvig geplant, Pässe in der Nähe gleich mit. Gefällt sie nicht, würfelst du neu. Gibt es in der Gegend keine bessere Runde, sagt dir die App das ehrlich, statt dir eine schlechtere zu zeigen.',
    'starts at your location or a place of your choice: pick a length or duration, drag the direction on the ring or go random, and the loop is planned curvy, with nearby passes included. Don’t like it? Reroll. If there is no better loop in the area, the app tells you honestly instead of showing you a worse one.',
    'parte dalla tua posizione o da un luogo a scelta: scegli lunghezza o durata, trascina la direzione sull’anello o lascia fare al caso, e il giro viene pianificato pieno di curve, con i passi vicini già inclusi. Non ti piace? Rigenera. Se in zona non c’è un giro migliore, l’app te lo dice onestamente invece di mostrartene uno peggiore.',
  ],
  ['Tour planen', 'Plan tour', 'Pianifica giro'],
  [
    'ist für die große Fahrt: Start, Zwischenziele und Ziel, jede Etappe mit eigenem Profil, etwa schnell nach München und dann kurvig bis Imst. Oder du planst direkt auf der Karte: Punkte halten und verschieben, die Linie lange drücken für ein neues Zwischenziel. Neu gerechnet wird nur das Stück, das sich ändert, und jede Änderung lässt sich rückgängig machen.',
    'is for the big trip: start, waypoints and destination, each stage with its own profile, say fast to Munich and then curvy to Imst. Or plan right on the map: hold and drag points, press and hold the line for a new waypoint. Only the part that changes is recalculated, and every change can be undone.',
    'è per il grande viaggio: partenza, tappe intermedie e arrivo, ogni tappa con il suo profilo, per esempio veloce fino a Monaco e poi in curva fino a Imst. Oppure pianifichi direttamente sulla mappa: tieni premuti e sposta i punti, tieni premuta la linea per una nuova tappa. Viene ricalcolato solo il tratto che cambia, e ogni modifica si può annullare.',
  ],
  ['Timmelsjoch', 'Timmelsjoch', 'Passo del Rombo'],
  ['Penser Joch', 'Pennes Pass', 'Passo di Pennes'],
  ['Gampenpass', 'Palade Pass', 'Passo delle Palade'],
  [
    'Highlights und Pässe erscheinen je Etappe mit Pegel und Umweg in Minuten, aber nur, wenn sie einen sinnvollen Bogen ergeben. Unterwegs planst du Super Plus, Aussicht, Einkehr und Hotel ein, sortiert nach Kilometer. Zum Essen zeigen wir nur Restaurants, die wir für Sportwagen empfehlen, mit Parkplatz und an guten Strecken. Zum Schluss bekommt jede Tour ihren Fahrspaß Wert von 0 bis 100, von Gemütlich bis Legendär.',
    'Highlights and passes appear for each stage with their level and detour in minutes, but only when they make a sensible arc. Along the way you add Super Plus, viewpoints, food and hotels, sorted by kilometre. For food we only show restaurants we recommend for sports cars, with parking and on good roads. Finally every tour gets its driving fun score from 0 to 100, from Easygoing to Legendary.',
    'Highlight e passi compaiono per ogni tappa con livello e deviazione in minuti, ma solo se formano un arco sensato. Lungo il percorso aggiungi Super Plus, panorami, soste per mangiare e hotel, ordinati per chilometro. Per mangiare mostriamo solo ristoranti che consigliamo per le auto sportive, con parcheggio e su belle strade. Alla fine ogni giro riceve il suo punteggio di divertimento da 0 a 100, da Tranquillo a Leggendario.',
  ],
  ['Rundtour ab Corvara: Länge 100 km, Richtung Süd', 'Loop from Corvara: 100 km, heading south', 'Giro ad anello da Corvara: 100 km, direzione sud'],
  ['Sellaronda als Route: Start Wolkenstein, Sellajoch, Pordoijoch, Campolongopass und Grödner Joch als Wegpunkte', 'Sella Ronda as a route: start in Selva, with Sella Pass, Pordoi Pass, Campolongo Pass and Gardena Pass as waypoints', 'Sella Ronda come percorso: partenza da Selva, con Passo Sella, Passo Pordoi, Passo Campolongo e Passo Gardena come tappe'],

  // 02 Highlights
  ['02  Highlights und Fahrspaß Pegel', '02  Highlights and driving fun level', '02  Highlight e livello di divertimento'],
  ['Jede Strecke hat ihren Pegel. Das Pordoijoch ist Legende.', 'Every road has its level. The Pordoi Pass is a Legend.', 'Ogni strada ha il suo livello. Il Passo Pordoi è Leggenda.'],
  [
    'Pässe, Bergrennstrecken, Rallyeprüfungen und Traumstraßen stehen nach Fahrspaß gerankt in deiner Tour. Antippen zeigt den Abschnitt auf der Karte mit Länge, Kehren, Höhe und Wintersperre. Enge Pässe tragen einen Hinweis wie Einspurig oder Langes Pflaster, ein Tipp auf Auslassen plant ohne sie.',
    'Passes, hill climb courses, rally stages and dream roads are ranked by driving fun in your tour. Tap one to see the section on the map with length, hairpins, altitude and winter closure. Tight passes carry a note such as Single lane or Long cobbled stretch, and one tap on Skip plans without them.',
    'Passi, percorsi di cronoscalate, prove speciali di rally e strade da sogno sono ordinati per divertimento nel tuo giro. Toccandoli vedi il tratto sulla mappa con lunghezza, tornanti, altitudine e chiusura invernale. I passi stretti hanno un avviso come Una corsia o Lungo tratto in pavé, e un tocco su Salta pianifica senza.',
  ],
  [
    'Nach der Fahrt gibst du jedem gefahrenen Highlight Daumen hoch oder runter. So wandert der Pegel mit dem, was Fahrer wirklich erleben. Die ganze Tour bekommt dazu ihren Fahrspaß Wert, gerechnet aus Kurven, Traumstrecken, Pässen und Fluss.',
    'After the drive you give each highlight a thumbs up or down. That way the level follows what drivers really experience. The whole tour also gets its driving fun score, calculated from curves, dream roads, passes and flow.',
    'Dopo la guida dai a ogni highlight percorso un pollice su o giù. Così il livello segue ciò che i piloti vivono davvero. Il giro intero riceve anche il suo punteggio di divertimento, calcolato da curve, strade da sogno, passi e fluidità.',
  ],
  ['Fünf Stufen', 'Five levels', 'Cinque livelli'],
  ['Nett', 'Nice', 'Piacevole'],
  ['Lohnend', 'Worth it', 'Merita'],
  ['Stark', 'Great', 'Notevole'],
  ['Traumstraße', 'Dream road', 'Strada da sogno'],
  ['Legende', 'Legend', 'Leggenda'],
  ['Fahrspaß Pegel Nett', 'Driving fun level Nice', 'Livello di divertimento Piacevole'],
  ['Fahrspaß Pegel Lohnend', 'Driving fun level Worth it', 'Livello di divertimento Merita'],
  ['Fahrspaß Pegel Stark', 'Driving fun level Great', 'Livello di divertimento Notevole'],
  ['Fahrspaß Pegel Traumstraße', 'Driving fun level Dream road', 'Livello di divertimento Strada da sogno'],
  ['Fahrspaß Pegel Legende', 'Driving fun level Legend', 'Livello di divertimento Leggenda'],
  ['Kleine Sellaronda: 62 km, 1:11 h, Fahrspaß 96, Hinweis Pordoijoch gesperrt, vier Highlights mit Pegel, Sellajoch und Pordoijoch als Legende', 'Small Sella Ronda: 62 km, 1:11 h, driving fun 96, note that the Pordoi Pass is closed, four highlights with their level, Sella Pass and Pordoi Pass as Legend', 'Piccola Sella Ronda: 62 km, 1:11 h, divertimento 96, avviso Passo Pordoi chiuso, quattro highlight con livello, Passo Sella e Passo Pordoi come Leggenda'],

  // 03 Navigation
  ['Scharfe Rechtskurve · 120 m', 'Sharp right bend · 120 m', 'Curva stretta a destra · 120 m'],
  ['03  Navigation', '03  Navigation', '03  Navigazione'],
  ['„In 600 Metern beginnt Sellajoch. 13 Kilometer, 13 Kehren. Eine Legende, viel Spaß.“', '“In 600 metres, Sella Pass begins. 13 kilometres, 13 hairpins. A Legend, enjoy.”', '“Tra 600 metri inizia il Passo Sella. 13 chilometri, 13 tornanti. Una Leggenda, buon divertimento.”'],
  [
    'Kurz vor jedem Pass, jeder Bergrennstrecke und jeder Traumstraße kommt die Ansage mit Karte und Pegel. Bei den ganz großen Strecken merkst du schon an der Ansage, was dich erwartet. Im Tunnel läuft die Führung weiter, und fehlt unterwegs das Netz, findest du trotzdem zurück zur Tour.',
    'Shortly before every pass, hill climb course and dream road, the announcement comes with a map and the level. For the really big roads you can hear in the announcement what lies ahead. Guidance keeps going in tunnels, and if you lose signal on the way, you still find your way back to the tour.',
    'Poco prima di ogni passo, percorso di cronoscalata e strada da sogno arriva l’annuncio con mappa e livello. Per le strade davvero grandi capisci già dall’annuncio cosa ti aspetta. In galleria la guida continua, e se per strada manca la rete ritrovi comunque il giro.',
  ],
  ['Kurven mit Ansage', 'Announced bends', 'Curve annunciate'],
  ['Scharfe Kurven und Kehren rechtzeitig vorher, außerorts ab Tempo 60.', 'Sharp bends and hairpins in good time, outside towns from 60 km/h.', 'Curve strette e tornanti con anticipo, fuori dai centri abitati da 60 km/h.'],
  ['Pause mit einem Tipp', 'Break with one tap', 'Pausa con un tocco'],
  ['Für den Kaffee am Pass: Ansagen und Zeit stehen, bis du weiterfährst.', 'For a coffee at the pass: announcements and time pause until you drive on.', 'Per il caffè al passo: annunci e tempo si fermano finché riparti.'],
  ['Auf dem Sperrbildschirm', 'On the lock screen', 'Sulla schermata di blocco'],
  ['Die Live Activity zeigt das nächste Manöver, ohne dass du die App öffnest.', 'The Live Activity shows the next manoeuvre without opening the app.', 'La Live Activity mostra la prossima manovra senza aprire l’app.'],
  ['Abschnitt auslassen', 'Skip a section', 'Salta un tratto'],
  ['Lange auf das Manöver drücken, schon geht es direkt zum nächsten Zwischenziel. Rückgängig inklusive.', 'Press and hold the manoeuvre and you head straight to the next waypoint. Undo included.', 'Tieni premuta la manovra e vai dritto alla prossima tappa. Annulla incluso.'],
  ['Abseits der Tour', 'Off the tour', 'Fuori dal giro'],
  ['Verfahren? Eine gelbe Linie führt ohne Wenden zurück. Fährst du bewusst anders, wählst du Neue Route ab hier, und die Tour wird über die offenen Ziele neu geplant.', 'Took a wrong turn? A yellow line leads you back without turning around. If you deliberately drive another way, choose New route from here and the tour is replanned through the remaining waypoints.', 'Strada sbagliata? Una linea gialla ti riporta indietro senza inversioni. Se cambi strada di proposito, scegli Nuovo percorso da qui e il giro viene ripianificato attraverso le tappe rimaste.'],
  ['Bremshinweis', 'Braking hint', 'Avviso di frenata'],
  ['Vor engen Kurven passend zu deinem Tempo, damit du nicht zu schnell hineinfährst.', 'Before tight bends, matched to your speed, so you don’t go in too fast.', 'Prima delle curve strette, in base alla tua velocità, per non entrarci troppo veloce.'],
  ['Abbiegehinweis in 500 m, darunter das laufende Highlight Sellajoch, noch 12 km', 'Turn in 500 m, below it the current highlight Sella Pass, 12 km to go', 'Svolta tra 500 m, sotto l’highlight in corso Passo Sella, ancora 12 km'],

  // CarPlay
  ['Die Kurven auf dem großen Display.', 'The curves on the big display.', 'Le curve sul grande display.'],
  [
    'Plane auf dem iPhone, fahr mit CarPlay. Die Tour liegt als Linie auf der Karte im Auto, ein Tipp auf Los startet die Führung. Manöver, Restweg und Ankunft stehen im Blick, Pässe und Traumstrecken melden sich kurz vorher. CarPlay ist dabei, vorerst als Beta.',
    'Plan on your iPhone, drive with CarPlay. The tour appears as a line on the map in your car, one tap on Go starts guidance. Manoeuvres, distance left and arrival stay in view, and passes and dream roads announce themselves shortly before. CarPlay is included, for now as a beta.',
    'Pianifica sull’iPhone, guida con CarPlay. Il giro appare come linea sulla mappa in auto, un tocco su Via avvia la guida. Manovre, distanza residua e arrivo restano sempre in vista, passi e strade da sogno si annunciano poco prima. CarPlay è incluso, per ora in beta.',
  ],
  ['Rechts auf die SS 44', 'Right onto the SS 44', 'A destra sulla SS 44'],
  ['Ankunft', 'Arrival', 'Arrivo'],
  ['Rest', 'Left', 'Restano'],
  ['Jaufenpass', 'Monte Giovo Pass', 'Passo di Monte Giovo'],
  ['In 600 m, 20 Kehren', 'In 600 m, 20 hairpins', 'Tra 600 m, 20 tornanti'],
  ['Vorschau mit Los', 'Preview with Go', 'Anteprima con Via'],
  ['Die geplante Tour wartet schon auf dem Display, mit Strecke und Fahrzeit.', 'Your planned tour is already waiting on the display, with distance and driving time.', 'Il giro pianificato ti aspetta già sul display, con distanza e tempo di guida.'],
  ['Highlights im Blick', 'Highlights in view', 'Highlight in vista'],
  ['Pässe und Traumstrecken kommen als kurzer Hinweis, die Ansage hörst du über die Lautsprecher im Auto.', 'Passes and dream roads appear as a short notice, and you hear the announcement through your car speakers.', 'Passi e strade da sogno compaiono come breve avviso, l’annuncio lo senti dagli altoparlanti dell’auto.'],
  ['CUMO DRIVE in CarPlay: Karte mit oranger Tour, Abbiegehinweis rechts auf die SS 44 in 800 m, Hinweis Jaufenpass in 600 m mit 20 Kehren, Ankunft 11:36', 'CUMO DRIVE in CarPlay: map with the orange tour, turn right onto the SS 44 in 800 m, notice Monte Giovo Pass in 600 m with 20 hairpins, arrival 11:36', 'CUMO DRIVE in CarPlay: mappa con il giro arancione, svolta a destra sulla SS 44 tra 800 m, avviso Passo di Monte Giovo tra 600 m con 20 tornanti, arrivo 11:36'],

  // 04 Gruppe
  ['04  Gruppenfahrt', '04  Group drive', '04  Giro di gruppo'],
  ['Solo oder Gruppe. Du entscheidest beim Losfahren.', 'Solo or group. You decide when you set off.', 'Da solo o in gruppo. Decidi alla partenza.'],
  [
    'Tippe auf Losfahren und wähle Als Gruppe fahren. Dann lädst du bis zu fünf Mitfahrer mit ihrem Namen ein. Alle fahren dieselbe Route und sehen sich live auf der Karte. Über Funk sprichst du mit der Gruppe, Knopf halten und reden, immer einer nach dem anderen. Die Lead sagt Tankstopp oder Pause mit einem Tipp an, bei allen erscheint der Halt groß im Bild. Wer zurückfällt, schließt mit einem Tipp zum Halt der Lead auf, und wer eine eigene Route fährt, gibt der Gruppe automatisch Bescheid. Am Tag einer Ausfahrt siehst du, wer schon am Treffpunkt ist und wer noch unterwegs, pingst Nachzügler an und übergibst die Lead mit einem Tipp.',
    'Tap Start driving and choose Drive as a group. Then invite up to five others by name. Everyone drives the same route and sees each other live on the map. Talk to the group over the radio: hold the button and speak, one at a time. The lead announces a fuel stop or break with one tap, and the stop appears big on everyone’s screen. Whoever falls behind catches up to the lead’s stop with one tap, and anyone taking their own route lets the group know automatically. On the day of a club drive you see who is already at the meeting point and who is still on the way, ping latecomers and hand over the lead with one tap.',
    'Tocca Parti e scegli Guida in gruppo. Poi inviti fino a cinque partecipanti con il loro nome. Tutti seguono lo stesso percorso e si vedono in tempo reale sulla mappa. Parli con il gruppo via radio: tieni premuto il tasto e parla, uno alla volta. Il capofila annuncia un rifornimento o una pausa con un tocco, e la sosta compare in grande sullo schermo di tutti. Chi resta indietro raggiunge la sosta del capofila con un tocco, e chi prende una strada diversa lo comunica al gruppo in automatico. Il giorno di un’uscita vedi chi è già al punto d’incontro e chi è ancora per strada, mandi un segnale ai ritardatari e passi il ruolo di capofila con un tocco.',
  ],
  ['Live Positionen', 'Live positions', 'Posizioni live'],
  ['Halt ansagen', 'Announce a stop', 'Annuncia una sosta'],
  ['Kurznachrichten mit Ansage', 'Quick messages read aloud', 'Messaggi rapidi letti ad alta voce'],
  ['Funk', 'Radio', 'Radio'],
  ['Zum Halt aufschließen', 'Catch up to the stop', 'Raggiungi la sosta'],
  ['Wer ist am Treffpunkt', 'Who is at the meeting point', 'Chi è al punto d’incontro'],
  ['Lead übergeben', 'Hand over the lead', 'Passa il ruolo di capofila'],
  ['Wie fährst du?', 'How are you driving?', 'Come guidi?'],
  ['Allein losfahren', 'Drive alone', 'Parti da solo'],
  ['Die Navigation startet sofort', 'Navigation starts right away', 'La navigazione parte subito'],
  ['Als Gruppe fahren', 'Drive as a group', 'Guida in gruppo'],
  ['Bis zu 6 Autos, du lädst sie im nächsten Schritt ein', 'Up to 6 cars, you invite them in the next step', 'Fino a 6 auto, le inviti nel passo successivo'],
  ['Mitfahrer', 'Participants', 'Partecipanti'],
  ['3 von 6', '3 of 6', '3 di 6'],
  ['Lead', 'Lead', 'Capofila'],
  ['dabei', 'in', 'presente'],
  ['eingeladen', 'invited', 'invitato'],
  ['Nach Losfahren fragt die App: Allein losfahren oder Als Gruppe fahren', 'After Start driving the app asks: Drive alone or Drive as a group', 'Dopo Parti l’app chiede: Parti da solo o Guida in gruppo'],

  // 05 Community
  ['05  Community', '05  Community', '05  Community'],
  ['Touren nachfahren. Ausfahrten finden. Fahrer kennenlernen.', 'Ride tours. Find club drives. Meet drivers.', 'Ripercorri giri. Trova uscite. Conosci piloti.'],
  [
    'Die Community hat drei Bereiche. Unter Touren zum Nachfahren liegen veröffentlichte Touren anderer Fahrer, ein Tipp öffnet sie im Planer. Unter Ausfahrten verabredest du dich zu gemeinsamen Touren, Einladungen kommen als Mitteilung. Unter Drivers findest du Fahrer aus deiner Gegend, mit Profilfoto und Fuhrpark, und schreibst ihnen direkt, mit allen Gesprächen an einem Ort. Wer stört, den meldest oder blockierst du mit zwei Tipps.',
    'The community has three areas. Tours to ride holds tours published by other drivers, one tap opens them in the planner. Under Club drives you arrange to drive together, and invitations arrive as notifications. Under Drivers you find drivers near you, with profile photo and garage, and message them directly, with all conversations in one place. Anyone bothering you can be reported or blocked in two taps.',
    'La community ha tre sezioni. In Tour da ripercorrere trovi i giri pubblicati da altri piloti, un tocco li apre nel planner. In Uscite ti organizzi per guidare insieme, e gli inviti arrivano come notifica. In Drivers trovi piloti della tua zona, con foto profilo e garage, e scrivi loro direttamente, con tutte le conversazioni in un unico posto. Chi disturba lo segnali o lo blocchi con due tocchi.',
  ],
  ['Touren zum Nachfahren', 'Tours to ride', 'Tour da ripercorrere'],
  ['Veröffentlichte Touren anderer Fahrer, etwa die Sellaronda groß und klein. Antippen öffnet eine Kopie im Planer, das Lesezeichen legt sie unter Touren ab. Deine abgewandelte Fassung teilst du mit Hinweis auf das Original.', 'Tours published by other drivers, such as the big and small Sella Ronda. Tap to open a copy in the planner, the bookmark saves it under Tours. Your own variant is shared with a reference to the original.', 'Giri pubblicati da altri piloti, come la Sella Ronda grande e piccola. Toccali per aprire una copia nel planner, il segnalibro la salva in Giri. La tua versione modificata la condividi citando l’originale.'],
  ['Ausfahrten', 'Club drives', 'Uscite'],
  ['Gemeinsame Ausfahrten mit Termin, Treffpunkt und Plätzen. Du fragst an oder wirst eingeladen, der Organisator nimmt an, und im Chat klärt ihr den Rest.', 'Club drives with date, meeting point and places. You ask to join or get invited, the organiser accepts, and you sort out the rest in the chat.', 'Uscite insieme con data, punto d’incontro e posti. Chiedi di partecipare o vieni invitato, l’organizzatore accetta e il resto lo chiarite in chat.'],
  ['Mitglieder mit ungefährem Wohnort auf der Karte und private Nachrichten. Was andere von dir sehen, auch deinen Fuhrpark, stellst du selbst ein.', 'Members with their approximate home town on the map, plus private messages. You decide what others see of you, including your garage.', 'Membri con la loro città indicativa sulla mappa e messaggi privati. Decidi tu cosa vedono gli altri di te, anche il tuo garage.'],
  ['Gemeinsame Ausfahrt ab Tegernsee am Freitag, 148 km, 2:57 h, du bist dabei', 'Club drive from Tegernsee on Friday, 148 km, 2:57 h, you are in', 'Uscita da Tegernsee venerdì, 148 km, 2:57 h, partecipi'],

  // 06 Touren
  ['06  Touren', '06  Tours', '06  Giri'],
  ['Jede Tour bleibt. Die besten teilst du.', 'Every tour stays. The best ones you share.', 'Ogni giro resta. I migliori li condividi.'],
  [
    'Geplante Touren liegen in deinem Konto, in der App und im Web Planer. Ein Tipp öffnet sie so, wie du sie gespeichert hast, ohne neu zu planen. Du änderst sie und überschreibst die alte Fassung oder speicherst sie als neue Tour, sortierst sie nach Fahrspaß und teilst sie als kurzen Link, der direkt in Cumo Drive öffnet, oder als GPX und KML für andere Navis. Touren aus anderen Apps importierst du genauso. Unter Gefahren findest du jede Fahrt wieder, mit Rückblick auf der Karte.',
    'Planned tours live in your account, in the app and in the web planner. One tap opens them exactly as you saved them, without replanning. Change them and overwrite the old version or save as a new tour, sort them by driving fun and share them as a short link that opens straight in Cumo Drive, or as GPX and KML for other navigation devices. Tours from other apps import the same way. Under Driven you find every drive again, with a replay on the map.',
    'I giri pianificati restano nel tuo account, nell’app e nel planner web. Un tocco li apre esattamente come li hai salvati, senza ripianificare. Li modifichi e sovrascrivi la vecchia versione o li salvi come nuovo giro, li ordini per divertimento e li condividi con un link breve che si apre direttamente in Cumo Drive, oppure come GPX e KML per altri navigatori. I giri di altre app li importi allo stesso modo. In Guidato ritrovi ogni guida, con il riepilogo sulla mappa.',
  ],
  ['Link teilen', 'Share a link', 'Condividi un link'],
  ['Nach Fahrspaß sortieren', 'Sort by driving fun', 'Ordina per divertimento'],
  ['Überschreiben oder neu speichern', 'Overwrite or save as new', 'Sovrascrivi o salva come nuovo'],
  ['GPX und KML', 'GPX and KML', 'GPX e KML'],
  ['In der Community veröffentlichen', 'Publish to the community', 'Pubblica nella community'],
  ['Nach der Fahrt', 'After the drive', 'Dopo la guida'],
  ['Statistik für Autos', 'Statistics for cars', 'Statistiche per auto'],
  ['Kilometer, Kurven, Querbeschleunigung und Schnitt, je Fahrzeug. Dazu deine Bewertung per Regler von Enttäuschend bis Sensationell und ein Daumen für jedes Highlight unterwegs. Im Rückblick zeigt die Karte, wo Spitze, stärkste Bremsung und größte Querbeschleunigung waren.', 'Kilometres, curves, lateral acceleration and average speed, per car. Plus your rating on a slider from Disappointing to Sensational and a thumb for every highlight along the way. In the replay the map shows where your top speed, hardest braking and highest lateral acceleration were.', 'Chilometri, curve, accelerazione laterale e media, per ogni auto. In più la tua valutazione con un cursore da Deludente a Sensazionale e un pollice per ogni highlight lungo la strada. Nel riepilogo la mappa mostra dove sono stati velocità massima, frenata più forte e accelerazione laterale più alta.'],
  ['Mehrere Fahrzeuge', 'Several cars', 'Più auto'],
  ['Jedes Auto mit Marke, Modell, Form und Lackfarbe, auf Wunsch fährt es als Symbol auf der Karte mit. Vor der Fahrt wählst du, mit welchem du fährst. Jedes Auto sammelt seine eigenen Touren und Kilometer.', 'Each car with make, model, shape and paint colour, and if you like it drives along as a symbol on the map. Before the drive you choose which one you take. Each car collects its own tours and kilometres.', 'Ogni auto con marca, modello, forma e colore, e se vuoi ti accompagna come simbolo sulla mappa. Prima di partire scegli con quale guidi. Ogni auto raccoglie i suoi giri e chilometri.'],
  ['Passo Giau auf der Karte gewählt, 2.236 m, Ikone, mit Als Start und Als Ziel', 'Giau Pass selected on the map, 2,236 m, Icon, with Set as start and Set as destination', 'Passo Giau selezionato sulla mappa, 2.236 m, Icona, con Come partenza e Come arrivo'],
  ['Touren: anstehende Ausfahrt ab Tegernsee, gespeicherte Touren nach Fahrspaß mit Kleiner und Großer Sellaronda', 'Tours: upcoming club drive from Tegernsee, saved tours by driving fun with the small and big Sella Ronda', 'Giri: prossima uscita da Tegernsee, giri salvati per divertimento con Sella Ronda piccola e grande'],

  // Web Planer
  ['Web Planer', 'Web planner', 'Planner web'],
  ['Am Rechner planen. Auf dem Handy fahren.', 'Plan on your computer. Drive with your phone.', 'Pianifica al computer. Guida con il telefono.'],
  ['Die große Tour planst du am besten auf dem großen Bildschirm. Der Web Planer kann, was die App kann: Punkte und Linie mit der Maus ziehen, Highlights und Pässe je Etappe einbauen, Stopps einplanen, Rundtouren würfeln. Jede Änderung landet von selbst unter Touren und steht kurz darauf auf deinem iPhone.', 'The big tour is best planned on a big screen. The web planner does what the app does: drag points and the line with the mouse, add highlights and passes per stage, plan stops, roll loops. Every change lands under Tours by itself and appears on your iPhone moments later.', 'Il grande giro si pianifica meglio su un grande schermo. Il planner web fa ciò che fa l’app: trascini punti e linea con il mouse, aggiungi highlight e passi per tappa, pianifichi soste, generi giri ad anello. Ogni modifica finisce da sola in Giri e poco dopo è sul tuo iPhone.'],
  ['Web Planer öffnen', 'Open web planner', 'Apri il planner web'],
  ['Am Rechner planen', 'Plan on your computer', 'Pianifica al computer'],
  ['Start, Zwischenziele, Highlights und Profil je Etappe, direkt auf der Karte.', 'Start, waypoints, highlights and profile per stage, right on the map.', 'Partenza, tappe, highlight e profilo per tappa, direttamente sulla mappa.'],
  ['QR Code scannen', 'Scan the QR code', 'Scansiona il codice QR'],
  ['Die App übernimmt die Tour mit allen Stützpunkten.', 'The app takes over the tour with every waypoint.', 'L’app riprende il giro con tutti i punti.'],
  ['Losfahren', 'Drive', 'Parti'],
  ['Allein, mit der Gruppe oder über CarPlay.', 'On your own, with the group or through CarPlay.', 'Da solo, con il gruppo o con CarPlay.'],

  // Daten
  ['Datenqualität', 'Data quality', 'Qualità dei dati'],
  ['Von Fahrern recherchiert, nicht vom Algorithmus geraten.', 'Researched by drivers, not guessed by an algorithm.', 'Scelte da piloti, non indovinate da un algoritmo.'],
  ['Pässe, Traumstrecken und Fahrregionen in sechs Ländern, von Fahrern zusammengetragen und geprüft. Passstatus und Wintersperren werden laufend aktualisiert.', 'Passes, dream roads and driving regions in six countries, collected and checked by drivers. Pass status and winter closures are updated continuously.', 'Passi, strade da sogno e regioni di guida in sei paesi, raccolti e verificati da piloti. Stato dei passi e chiusure invernali vengono aggiornati di continuo.'],
  ['Pässe', 'Passes', 'Passi'],
  ['In drei Stufen: Ikone, Bekannt und Geheimtipp. Mit Höhe, Kehren, Maut und Wintersperre.', 'In three tiers: Icon, Well known and Insider tip. With altitude, hairpins, tolls and winter closure.', 'In tre categorie: Icona, Famoso e Chicca. Con altitudine, tornanti, pedaggio e chiusura invernale.'],
  ['Traumstrecken', 'Dream roads', 'Strade da sogno'],
  ['Bergrennen, Rallyeprüfungen und Panoramastraßen in sechs Ländern. Über 100 davon sind Highlights mit eigener Ansage, die übrigen zieht die Planung an.', 'Hill climbs, rally stages and scenic roads in six countries. More than 100 of them are highlights with their own announcement, the rest attract the planning.', 'Cronoscalate, prove speciali di rally e strade panoramiche in sei paesi. Oltre 100 sono highlight con un annuncio proprio, le altre attirano la pianificazione.'],
  ['Fahrregionen', 'Driving regions', 'Regioni di guida'],
  ['Gegenden, die als Ganzes zum Fahren gemacht sind, etwa Schwarzwald, Vogesen oder Dolomiten.', 'Areas made for driving as a whole, such as the Black Forest, the Vosges or the Dolomites.', 'Zone fatte per guidare nel loro insieme, come la Foresta Nera, i Vosgi o le Dolomiti.'],
  ['Stopps an der Strecke', 'Stops along the way', 'Soste lungo il percorso'],
  ['Super Plus, Aussichtspunkte und Hotels, dazu ausgewählte Restaurants mit Parkplatz für Sportwagen, sortiert nach Umweg in Minuten.', 'Super Plus, viewpoints and hotels, plus selected restaurants with parking for sports cars, sorted by detour in minutes.', 'Super Plus, punti panoramici e hotel, più ristoranti selezionati con parcheggio per auto sportive, ordinati per deviazione in minuti.'],
  ['130.000', '130,000', '130.000'],
  ['Kartendaten © OpenStreetMap Mitwirkende', 'Map data © OpenStreetMap contributors', 'Dati cartografici © contributori di OpenStreetMap'],

  // Club
  ['Aus dem CUMO DRIVERS CLUB', 'From the CUMO DRIVERS CLUB', 'Dal CUMO DRIVERS CLUB'],
  ['CUMO steht für atemberaubende Kurven. Der CUMO DRIVERS CLUB führt Sportwagentouren durch die Alpen, die Vogesen und den Schwarzwald. Cumo Drive ist das Werkzeug, das wir dafür selbst gebraucht haben.', 'CUMO stands for breathtaking curves. The CUMO DRIVERS CLUB leads sports car tours through the Alps, the Vosges and the Black Forest. Cumo Drive is the tool we needed for that ourselves.', 'CUMO sta per curve mozzafiato. Il CUMO DRIVERS CLUB organizza tour in auto sportiva attraverso le Alpi, i Vosgi e la Foresta Nera. Cumo Drive è lo strumento che ci serviva per farlo.'],
  ['CUMO DRIVERS CLUB, zur Website', 'CUMO DRIVERS CLUB, to the website', 'CUMO DRIVERS CLUB, al sito'],
  ['Logo des CUMO DRIVERS CLUB', 'Logo of the CUMO DRIVERS CLUB', 'Logo del CUMO DRIVERS CLUB'],

  // Preise
  ['Kostenlos starten. Dann so, wie du fährst.', 'Start for free. Then pay the way you drive.', 'Inizia gratis. Poi paga come guidi.'],
  [
    'Kostenlos planst du überall und fährst in deinem Heimatgebiet, mit Gruppen zu dritt. Unsere Tester fahren 12 Monate mit vollem Umfang. Jeder Plan enthält alle Funktionen, auch Gruppenfahrten bis 6 Fahrzeuge. Deine Touren, Fahrten und Fahrzeuge bleiben in deinem Konto.',
    'For free you plan anywhere and drive in your home area, in groups of three. Our testers get 12 months with everything included. Every plan includes all features, including group drives with up to 6 cars. Your tours, drives and cars stay in your account.',
    'Gratis pianifichi ovunque e guidi nella tua zona, in gruppi di tre. I nostri tester guidano 12 mesi con tutte le funzioni. Ogni piano include tutte le funzioni, anche i giri di gruppo fino a 6 auto. I tuoi giri, le guide e le auto restano nel tuo account.',
  ],
  ['Jahr', 'Year', 'Anno'],
  ['59,99 €', '€59.99', '59,99 €'],
  ['Entspricht 5 € im Monat. Abo, jederzeit kündbar.', 'That’s €5 a month. Subscription, cancel anytime.', 'Pari a 5 € al mese. Abbonamento, disdici quando vuoi.'],
  ['Bester Preis', 'Best price', 'Miglior prezzo'],
  ['Saison Pass', 'Season Pass', 'Pass stagionale'],
  ['49 €', '€49', '49 €'],
  ['Einmalig für 6 Monate, kein Abo. Für die Monate, in denen das Auto aus der Garage darf.', 'One payment for 6 months, no subscription. For the months when the car gets out of the garage.', 'Pagamento unico per 6 mesi, nessun abbonamento. Per i mesi in cui l’auto esce dal garage.'],
  ['Monat', 'Month', 'Mese'],
  ['14,99 €', '€14.99', '14,99 €'],
  ['Abo, jederzeit kündbar.', 'Subscription, cancel anytime.', 'Abbonamento, disdici quando vuoi.'],
  ['Woche', 'Week', 'Settimana'],
  ['7,99 €', '€7.99', '7,99 €'],
  ['Für das Wochenende im Mietwagen oder die eine Tour im Urlaub. Abo, jederzeit kündbar.', 'For a weekend in a rental car or that one tour on holiday. Subscription, cancel anytime.', 'Per un weekend con l’auto a noleggio o quel giro in vacanza. Abbonamento, disdici quando vuoi.'],
  ['Preis auf Anfrage', 'Price on request', 'Prezzo su richiesta'],
  ['Für Clubs, Tourenveranstalter, Hotels und Autohäuser.', 'For clubs, tour operators, hotels and car dealers.', 'Per club, organizzatori di tour, hotel e concessionari.'],
  ['Business Accounts laufen auf Rechnung, schreib uns an', 'Business accounts are invoiced, write to us at', 'I Business Account sono fatturati, scrivici a'],
  ['. Woche, Monat und Jahr verlängern sich automatisch, wenn du nicht spätestens 24 Stunden vor Ablauf in den Einstellungen deiner Apple ID kündigst.', '. Week, month and year renew automatically unless you cancel at least 24 hours before they end in your Apple ID settings.', '. Settimana, mese e anno si rinnovano automaticamente se non disdici almeno 24 ore prima della scadenza nelle impostazioni del tuo ID Apple.'],

  // Abschluss
  ['Lass uns gemeinsam Kurven erleben.', 'Let’s enjoy the curves together.', 'Viviamo insieme le curve.'],
  ['Kostenlos registrieren', 'Sign up for free', 'Registrati gratis'],
  ['Impressum', 'Legal notice', 'Note legali'],
  ['Datenschutz', 'Privacy', 'Privacy'],
  ['AGB', 'Terms', 'Condizioni'],
];

/** Texte, die in allen Sprachen gleich bleiben (Namen, Marken, Zahlen) */
export const LANDING_SAME = new Set([
  'Cumo Drive', 'Highlights', 'CarPlay', 'Community', 'Deutsch', 'English', 'Italiano', '+12 min', '+9 min', '+18 min', '800 m', '42 km', 'KO', 'JM', 'SK',
  'Drivers', 'Garage', 'Curve Mozzafiato.', 'Koray, CUMO DRIVERS CLUB', 'Business Account', 'kontakt@cumodrive.com', 'Cumo Drive · cumodrive.de',
]);

const MAPS: Record<'en' | 'it', Map<string, string>> = {
  en: new Map(T.map(([de, en]) => [de, en])),
  it: new Map(T.map(([de, , it]) => [de, it])),
};

export function landingText(de: string, lang: LandingLang): string | undefined {
  if (lang === 'de') return de;
  return MAPS[lang].get(de);
}

/** Alle deutschen Texte mit Übersetzung (für den Test) */
export const LANDING_KEYS = new Set(T.map(([de]) => de));

/** Kopf der Seite je Sprache */
export const LANDING_META: Record<LandingLang, { title: string; desc: string; locale: string; path: string; label: string }> = {
  de: {
    title: 'Cumo Drive | Die Navi App für Sportwagen',
    desc: 'Die Navi App für Sportwagen: kurvige Touren, geprüft auf Breite, Belag und Sperrungen, über 360 Pässe und über 450 Traumstrecken, Highlights mit Ansage, allein, in der Gruppe oder bei Ausfahrten der Community.',
    locale: 'de_DE',
    path: '/',
    label: 'Deutsch',
  },
  en: {
    title: 'Cumo Drive | The navigation app for sports cars',
    desc: 'The navigation app for sports cars: curvy routes checked for width, surface and closures, more than 360 passes and 450 dream roads, announced highlights, on your own, as a group or on community club drives.',
    locale: 'en_GB',
    path: '/en',
    label: 'English',
  },
  it: {
    title: 'Cumo Drive | L’app di navigazione per auto sportive',
    desc: 'L’app di navigazione per auto sportive: giri pieni di curve verificati per larghezza, fondo e chiusure, oltre 360 passi e 450 strade da sogno, highlight annunciati, da solo, in gruppo o nelle uscite della community.',
    locale: 'it_IT',
    path: '/it',
    label: 'Italiano',
  },
};
