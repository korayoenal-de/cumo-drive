/**
 * Rechtstexte von Cumo Drive: Datenschutzerklärung und Nutzungsbedingungen (AGB).
 *
 * ENTWURF, ANWALTLICHE PRÜFUNG AUSSTEHEND (Stand 10. November 2026). Geschrieben von Claude auf Wunsch von
 * Koray, keine Rechtsberatung. Offene Punkte für den Anwalt stehen im Projekt Doc claude/rechtstexte-entwurf.md.
 * Angezeigt unter /datenschutz und /agb (src/app/datenschutz.tsx, src/app/agb.tsx), verlinkt aus Landingpage und Paywall.
 */

export type LegalBlock = { h: string; p?: string[]; list?: string[] };
export type LegalDoc = { title: string; headTitle?: string; lead: string; blocks: LegalBlock[]; stand: string };

const KONTAKT = 'kontakt@rallycumo.de';
const IMPRESSUM = 'https://rallycumo.de/impressum/';

export const STAND = 'Stand: 10. November 2026. Entwurf, die anwaltliche Prüfung steht noch aus.';

export const DATENSCHUTZ: LegalDoc = {
  title: 'Datenschutz',
  lead:
    'Cumo Drive ist eine Navigations App für Sportwagen, mit App für das iPhone, CarPlay und Web Planer. Hier steht, welche Daten dabei entstehen, wofür wir sie brauchen und wer sie zu sehen bekommt. Kurz gesagt: Wir zeigen keine Werbung, verkaufen keine Daten und setzen keine Tracking Dienste ein.',
  stand: STAND,
  blocks: [
    {
      h: '1. Verantwortlich',
      p: [
        `Verantwortlich für die Verarbeitung ist der Betreiber von Cumo Drive, CUMO DRIVERS CLUB, vertreten durch Koray Önal. Die vollständige Anschrift steht im Impressum unter ${IMPRESSUM}.`,
        `Bei Fragen zum Datenschutz erreichst du uns unter ${KONTAKT}. Einen Datenschutzbeauftragten haben wir nicht bestellt, weil wir dazu nicht verpflichtet sind.`,
      ],
    },
    {
      h: '2. Welche Daten wir verarbeiten',
      list: [
        'Konto: E-Mail-Adresse, Passwort (nur verschlüsselt gespeichert), Anzeigename, unter dem dich andere zur Gruppenfahrt einladen.',
        'Touren: geplante und gespeicherte Touren mit Wegpunkten, Linie, Namen und Ordnern, außerdem Touren, die du in der Community veröffentlichst.',
        'Fahrten: wenn du eine Navigation startest, die gefahrene Spur mit Zeit, Tempo und Statistik (Kilometer, Kurven, Querbeschleunigung) sowie deine Bewertung der Fahrt mit Gründen und Notiz.',
        'Nutzung der Planung: wenn du eine Rundtour planst, neu würfelst, eine Tour speicherst, übernimmst, veröffentlichst, löschst oder losfährst, speichern wir dazu die Linie der Tour, ihre Länge, das Profil und den berechneten Fahrspaß. Die ersten und letzten 2 km der Linie schneiden wir vorher ab, damit Start und Ziel, etwa deine Haustür, nicht enthalten sind.',
        'Fahrzeuge: Angaben aus deiner Garage wie Marke und Modell, Form und Farbe des Fahrzeugsymbols.',
        'Profil und Community: Profilfoto, wenn du eins setzt (auf 512 Pixel verkleinert, für alle mit dem Link abrufbar, jederzeit entfernbar), Wohnort (für andere nur als Ortsmitte, nie als Adresse), der Text Über mich, ob du unter Drivers sichtbar bist, ob andere dich anschreiben dürfen und ob sie deinen Fuhrpark sehen. Dazu private Nachrichten, Ausfahrten mit Anfragen und Chat.',
        'Funk in der Gruppenfahrt: deine Stimme nur, solange du den Funk Knopf gedrückt hältst. Sie wird live an die anderen Teilnehmer übertragen und nicht aufgezeichnet oder gespeichert.',
        'Mitteilungen: wenn du sie erlaubst, ein Gerätekennzeichen für Push Mitteilungen bei Nachrichten, Einladungen und Anfragen.',
        'Standort: während Planung und Navigation, um dich zu führen und Rundtouren ab deinem Standort zu planen. In einer Gruppenfahrt sehen die anderen Teilnehmer deine Position live, solange die Fahrt läuft.',
        'Kamera und Mikrofon: die Kamera nur, um einen QR Code aus dem Web Planer zu lesen; Bilder speichern wir nicht. Das Mikrofon nur für den Funk, solange du den Knopf drückst.',
        'Kauf: ob du ein Abo hast und wann es endet. Bezahldaten sieht nur Apple, wir nicht.',
        'Technische Daten: beim Abruf von Servern fallen IP-Adresse, Zeitpunkt und Gerätetyp an. Wir werten sie nicht zu Profilen aus.',
      ],
    },
    {
      h: '3. Wofür und auf welcher Grundlage',
      list: [
        'Bereitstellen der App, deines Kontos, der Planung, Navigation, Gruppenfahrt und des Abgleichs zwischen App und Web Planer: zur Erfüllung des Vertrags mit dir (Art. 6 Abs. 1 lit. b DSGVO).',
        'Standort: nur mit deiner Erlaubnis im iPhone, die du jederzeit in den Einstellungen widerrufen kannst. Ohne Standort kannst du weiter planen, aber nicht navigieren.',
        'Verbesserung der Strecken: Bewertungen, gefahrene Spuren und die Nutzung der Planung werten wir zusammengefasst und ohne Bezug zu deiner Person aus, um den Fahrspaß Pegel von Straßen zu verbessern und die Planung zu verbessern (berechtigtes Interesse, Art. 6 Abs. 1 lit. f DSGVO). Ein Straßenabschnitt fließt erst ein, wenn mindestens drei verschiedene Fahrer ihn genutzt haben. Niemand außer der Auswertung sieht deine einzelnen Einträge, auch andere Fahrer nicht. Du kannst dem jederzeit unter der oben genannten Adresse widersprechen.',
        'Sicherheit und Missbrauchsschutz der Server: berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO).',
        'Gesetzliche Aufbewahrung, etwa bei Club Lizenzen auf Rechnung: rechtliche Verpflichtung (Art. 6 Abs. 1 lit. c DSGVO).',
      ],
    },
    {
      h: '4. Wer Daten bekommt',
      p: ['Wir geben Daten nur an Dienste weiter, die wir für die jeweilige Funktion brauchen. Mit Auftragsverarbeitern bestehen Verträge nach Art. 28 DSGVO.'],
      list: [
        'Supabase (Supabase Inc., Server in Frankfurt am Main): Konto, Touren, Fahrten, Fahrzeuge, Passstatus und die Echtzeit Verbindung der Gruppenfahrt. Auftragsverarbeiter.',
        'Eigener Routing Server bei Contabo (Contabo GmbH, Deutschland): berechnet Routen aus deinen Wegpunkten. Auftragsverarbeiter.',
        'Apple (Apple Distribution International, Irland, und Apple Inc., USA): App Store, Abos, Kartenanzeige mit Apple Maps, CarPlay und Wetter an den Pässen über WeatherKit. Für das Wetter übermitteln wir die Lage des Passes, nicht deinen Standort.',
        'Expo (650 Industries Inc., USA): liefert Aktualisierungen der App aus. Dabei fallen IP-Adresse und Gerätedaten an. Grundlage für die Übermittlung in die USA ist das EU US Data Privacy Framework.',
        'Photon von komoot (komoot GmbH, Deutschland): Ortssuche und die Namen von Wegpunkten. Übermittelt wird der Suchbegriff oder die Koordinate.',
        'Valhalla Server der FOSSGIS e.V. (Deutschland): Höhenprofil, Tempolimits entlang der Route und Ersatzrouting, wenn unser Server nicht erreichbar ist. Übermittelt wird die Linie der Route.',
        'TomTom (TomTom International B.V., Niederlande): liefert unserem Server Meldungen zu gesperrten Pässen und aktuellen Sperrungen. Unser Server fragt dafür grobe Kartenbereiche ab, keine Daten von dir.',
        'LiveKit (LiveKit Inc., USA, Server in Frankfurt am Main): überträgt den Funk in der Gruppenfahrt live zwischen den Teilnehmern, ohne Aufzeichnung. Übermittelt werden dein Anzeigename, eine Kennung und deine Stimme, solange du sprichst. Auftragsverarbeiter; Grundlage für eine Übermittlung in die USA sind Standardvertragsklauseln.',
        'Push Mitteilungen über Expo (650 Industries Inc., USA) und den Apple Push Dienst: Titel, kurzer Text und Gerätekennzeichen der Mitteilung.',
        'Im Web Planer zusätzlich: OpenFreeMap für die Kartenkacheln. Kartenbibliothek und Schriften liefern wir von unserer eigenen Domain aus, ohne Google Fonts oder fremde CDNs.',
        'Andere Fahrer: in einer Gruppenfahrt Anzeigename, Fahrzeug, Live Position und im Funk deine Stimme, nur für die Dauer der Fahrt. In der Community deinen Anzeigenamen, dein Profilfoto und die veröffentlichte Tour, unter Drivers (abschaltbar) Name, Ortsmitte, Über mich und auf Wunsch deinen Fuhrpark. Private Nachrichten sieht nur der Empfänger; meldet jemand eine Nachricht, sehen wir eine Kopie davon zur Prüfung.',
      ],
    },
    {
      h: '5. Wie lange wir speichern',
      list: [
        'Konto, Touren, Fahrten und Fahrzeuge, bis du sie löschst oder dein Konto löschst.',
        'Einträge zur Nutzung der Planung höchstens 24 Monate, danach bleiben nur die zusammengefassten Werte je Straßenabschnitt.',
        'Live Positionen der Gruppenfahrt werden nicht gespeichert, sondern nur während der Fahrt zwischen den Teilnehmern ausgetauscht.',
        'Server Protokolle höchstens 14 Tage.',
        'Rechnungsdaten von Club Lizenzen so lange, wie Handels und Steuerrecht es verlangen (bis zu 10 Jahre).',
      ],
    },
    {
      h: '6. Konto löschen',
      p: [
        'Du kannst dein Konto jederzeit in der App unter Einstellungen, Konto, Konto löschen entfernen. Dabei löschen wir Konto, Touren, Fahrten, Fahrzeuge, deine Bewertungen und die Einträge zur Nutzung der Planung. Veröffentlichte Community Touren verschwinden ebenfalls. Bereits zusammengefasste Auswertungen ohne Personenbezug bleiben bestehen. Ein Abo kündigst du getrennt davon in den Einstellungen deiner Apple ID.',
      ],
    },
    {
      h: '7. Auf dem Gerät',
      p: [
        'Die App speichert Touren, Einstellungen (zum Beispiel Kartenstil, Stimme, Tempo Anzeige) und deine Anmeldung auf dem iPhone. Der Web Planer speichert Touren und Anmeldung im Browser. Wir setzen keine Cookies zu Werbe oder Analysezwecken; was wir lokal speichern, ist für die Funktion nötig (§ 25 Abs. 2 TDDDG).',
      ],
    },
    {
      h: '8. Deine Rechte',
      p: [
        `Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch (Art. 15 bis 21 DSGVO). Eine Einwilligung kannst du jederzeit für die Zukunft widerrufen. Schreib uns dafür an ${KONTAKT}.`,
        'Du kannst dich außerdem bei einer Datenschutz Aufsichtsbehörde beschweren, zum Beispiel beim Hessischen Beauftragten für Datenschutz und Informationsfreiheit.',
      ],
    },
    {
      h: '9. Keine automatisierten Entscheidungen',
      p: ['Wir treffen keine Entscheidungen, die allein auf automatisierter Verarbeitung beruhen und dir gegenüber rechtliche Wirkung entfalten.'],
    },
    {
      h: '10. Änderungen',
      p: ['Wenn wir neue Funktionen einführen, passen wir diese Erklärung an. Die jeweils aktuelle Fassung steht hier.'],
    },
  ],
};

export const AGB: LegalDoc = {
  title: 'AGB',
  headTitle: 'Nutzungsbedingungen (AGB)',
  lead:
    'Allgemeine Geschäftsbedingungen und Nutzungsbedingungen. Diese Bedingungen gelten für die App Cumo Drive auf dem iPhone und in CarPlay sowie für den Web Planer. Ergänzend gilt für Käufe über den App Store die Standard Lizenzvereinbarung von Apple.',
  stand: STAND,
  blocks: [
    {
      h: '1. Anbieter und Geltung',
      p: [
        `Anbieter ist der CUMO DRIVERS CLUB, vertreten durch Koray Önal (Anschrift im Impressum unter ${IMPRESSUM}, Kontakt ${KONTAKT}). Diese Bedingungen gelten für alle Nutzer. Abweichende Bedingungen von Nutzern gelten nicht.`,
      ],
    },
    {
      h: '2. Leistung',
      p: [
        'Cumo Drive plant Touren für Sportwagen, prüft sie gegen Straßendaten (Breite, Belag, Sperrungen), kündigt Pässe und Traumstrecken an, führt per Navigation und verbindet Fahrer in Gruppenfahrten. Grundlage sind Daten von OpenStreetMap, Apple und weiteren Diensten sowie unsere eigene Strecken und Pass Datenbank.',
        'Wir entwickeln Cumo Drive laufend weiter. Funktionen können sich ändern, solange der Kern der Leistung erhalten bleibt. Die App kann zeitweise eingeschränkt sein, etwa bei Wartung oder wenn Dienste Dritter ausfallen; dann plant sie über Ersatzdienste mit weniger Funktionen.',
      ],
    },
    {
      h: '3. Sicherheit geht vor',
      list: [
        'Die Straßenverkehrsordnung und Verkehrszeichen haben immer Vorrang vor den Hinweisen der App, auch bei Tempo, Sperrungen und Abbiegehinweisen.',
        'Bediene die App nicht während der Fahrt, außer über CarPlay oder die Sprachansagen. Plane vor der Fahrt oder lass Beifahrer planen.',
        'Strecken, Breiten, Belag, Passstatus, Wetter, Tempolimits und Kurvenhinweise beruhen auf Daten Dritter und Schätzungen. Sie können falsch, veraltet oder unvollständig sein. Prüfe Sperrungen und Wetter vor der Fahrt selbst.',
        'Cumo Drive ist kein Wettbewerbs oder Rennwerkzeug. Fahre angepasst und im Rahmen der Gesetze.',
      ],
    },
    {
      h: '4. Konto',
      p: [
        'Für die App brauchst du ein Konto mit E-Mail-Adresse und Passwort. Halte dein Passwort geheim. Du kannst dein Konto jederzeit in der App löschen. Wir dürfen ein Konto sperren, wenn es gegen diese Bedingungen verstößt, nach Möglichkeit erst nach einer Warnung.',
      ],
    },
    {
      h: '5. Abos und Preise',
      list: [
        'Kostenpflichtige Pläne kaufst du in der App über Apple. Es gelten die Preise, die die App vor dem Kauf anzeigt, inklusive Umsatzsteuer. Abgerechnet wird über deine Apple ID.',
        'Wochen, Monats und Jahresabo verlängern sich automatisch um dieselbe Laufzeit, wenn du nicht spätestens 24 Stunden vor Ablauf in den Einstellungen deiner Apple ID kündigst. Der Saison Pass gilt für die angegebene Zeit und endet von selbst.',
        'Bietet die App eine kostenlose Probezeit an, beginnt das gewählte Abo nach deren Ende, wenn du nicht vorher kündigst.',
        'Erstattungen beantragst du bei Apple. Dein gesetzliches Widerrufsrecht richtet sich nach den Bedingungen von Apple; mit dem sofortigen Freischalten der Inhalte nach dem Kauf kann es vorzeitig erlöschen.',
        'Club Lizenzen und Event Pässe für Clubs und Veranstalter schließen wir gesondert ab und rechnen per Rechnung ab. Mitglieder eines Clubs mit gültiger Lizenz können die Funktionen ohne eigenes Abo nutzen, solange die Lizenz läuft.',
      ],
    },
    {
      h: '6. Unsere Inhalte und Daten',
      list: [
        'App, Web Planer und unsere Inhalte, insbesondere die von uns zusammengestellten Datenbanken zu Pässen, Strecken, Highlights und Touren mit Bewertungen, Beschreibungen und Ansagen sowie die Routing Profile, sind urheberrechtlich und als Datenbank nach §§ 87a ff. UrhG geschützt.',
        'Du darfst sie für eigene, private Zwecke in App und Web Planer nutzen. Club Lizenzen berechtigen zur Nutzung für Ausfahrten des Clubs.',
        'Nicht erlaubt sind: systematisches oder automatisiertes Auslesen und Speichern (Scraping, Bots, nicht öffentliche Schnittstellen), das Vervielfältigen oder Verbreiten wesentlicher Teile der Datenbanken, die Nutzung zum Aufbau oder Training eines konkurrierenden Dienstes oder KI Modells sowie das Umgehen technischer Schutzmaßnahmen, soweit das Gesetz es nicht erlaubt.',
        'GPX und KML Export dienen der persönlichen Nutzung, etwa in einem Navigationsgerät. Gewerbliche Weitergabe exportierter Touren ist nur mit unserer Zustimmung erlaubt.',
        'Kartendaten stammen teilweise von OpenStreetMap (© OpenStreetMap Mitwirkende, Lizenz ODbL). Für diese Daten gelten die Bedingungen der ODbL; diese Bedingungen schränken die dort gewährten Rechte nicht ein.',
      ],
    },
    {
      h: '7. Deine Inhalte',
      list: [
        'Touren, Texte und Bewertungen, die du erstellst, bleiben deine.',
        'Wenn du eine Tour in der Community veröffentlichst, erlaubst du uns unentgeltlich, sie in Cumo Drive anzuzeigen, anderen Nutzern bereitzustellen und zur Verbesserung der Routenplanung zu nutzen. Die Anzeige endet, wenn du die Tour zurückziehst oder löschst.',
        'Bewertungen und gefahrene Spuren werten wir zusammengefasst und ohne Bezug zu deiner Person aus, um Straßen zu bewerten. Die Auswertung wird Teil unserer Datenbank.',
        'Veröffentliche nur, was du darfst: keine fremden Inhalte ohne Rechte, keine beleidigenden oder rechtswidrigen Inhalte, keine Strecken, die zu verbotenem Verhalten auffordern. Wir dürfen solche Inhalte entfernen.',
      ],
    },
    {
      h: '7a. Nachrichten, Melden und Sperren',
      list: [
        'Nachrichten, Chats und der Funk sind für Fahrten und Austausch unter Fahrern gedacht. Verboten sind rechtswidrige Inhalte und Geschäfte aller Art (zum Beispiel mit Drogen, Waffen oder gestohlener Ware), Werbung und Spam, Betrug sowie Belästigung.',
        'Jeden Inhalt und jedes Profil kannst du melden und andere Fahrer blockieren. Gemeldete Inhalte sehen wir uns an; dafür speichern wir zu jeder Meldung eine Kopie des gemeldeten Inhalts.',
        'Verstößt ein Inhalt gegen diese Bedingungen oder gegen Gesetze, entfernen wir ihn oder sperren das Konto. Du bekommst dann in der App eine Mitteilung mit Begründung und kannst uns unter ' + KONTAKT + ' widersprechen.',
        'Neue Konten können andere erst nach 24 Stunden anschreiben, außer man fährt gemeinsam. Neue Gespräche sind pro Tag begrenzt.',
        'Behörden geben wir Daten nur auf förmliche Anfrage heraus. Bei Hinweisen auf eine Gefahr für Leben oder Sicherheit von Menschen informieren wir die zuständigen Behörden.',
      ],
    },
    {
      h: '8. Haftung',
      p: [
        'Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, für Schäden aus der Verletzung von Leben, Körper oder Gesundheit und nach dem Produkthaftungsgesetz. Bei leichter Fahrlässigkeit haften wir nur für die Verletzung wesentlicher Vertragspflichten und begrenzt auf den typischen, vorhersehbaren Schaden. Im Übrigen ist die Haftung ausgeschlossen.',
        'Für Inhalte und Verfügbarkeit von Diensten Dritter (Karten, Wetter, Passstatus, Ortssuche) übernehmen wir keine Gewähr.',
      ],
    },
    {
      h: '9. Änderungen dieser Bedingungen',
      p: [
        'Wir können diese Bedingungen ändern, wenn sich Gesetze, Funktionen oder Dienste ändern. Über wesentliche Änderungen informieren wir dich vorher in der App. Widersprichst du nicht innerhalb von sechs Wochen, gelten die neuen Bedingungen; auf diese Folge weisen wir in der Mitteilung hin.',
      ],
    },
    {
      h: '10. Schluss',
      list: [
        'Es gilt deutsches Recht. Bist du Verbraucher mit gewöhnlichem Aufenthalt in einem anderen Staat, bleiben die zwingenden Schutzvorschriften dieses Staates unberührt.',
        'Wir nehmen nicht an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teil und sind dazu nicht verpflichtet.',
        'Ist eine Bestimmung unwirksam, bleiben die übrigen wirksam.',
      ],
    },
  ],
};
