/**
 * Kuratierte Highlight Strecken unterhalb der Pässe: alte Rallyeprüfungen, Bergrennstrecken, bekannte
 * Kurvenstrecken und Panoramastraßen. Die Navigation kündigt sie wie einen Pass an (In 500 m, Zotzenbach, alte Rallyestrecke, 7 km).
 *
 * Linien: Straßenverlauf aus OpenStreetMap, ermittelt mit dem öffentlichen Valhalla Server
 * (valhalla1.openstreetmap.de) zwischen Orten aus Nominatim und nur auf den Abschnitten mit der
 * genannten Straßennummer. Danach gleichmäßig auf etwa alle 700 m ausgedünnt, damit Richtung und
 * Abgleich mit der Route funktionieren. Stand: November 2026.
 *
 * Ansage: `say` ist der gesprochene Teil (in beiden Fahrtrichtungen passend) nach "beginnt" (In 500 Metern beginnt die alte Rallyestrecke Zotzenbach).
 * Ohne `say` wird "die {note} {name}" gesprochen, deshalb sind alle Notizen weiblich (Strecke, Straße).
 */
import curatedData from '@/data/curated-roads.json';

import type { LatLon } from './tour';

export type HighlightRoadKind = 'rallye' | 'strecke' | 'aussicht' | 'bergrennen';

export type HighlightRoad = {
  id: string;
  name: string;
  kind: HighlightRoadKind;
  /** kurze Unterzeile, zum Beispiel "alte Rallyestrecke", "Bergrennstrecke" oder "Kurvenstrecke" */
  note: string;
  /** gesprochen nach "beginnt", ohne Punkt */
  say?: string;
  /** Verlauf in Fahrtrichtung der Quelle; der Abgleich akzeptiert beide Richtungen */
  line: LatLon[];
  /** Fahrspaß Pegel 1 bis 5 (Nett bis Legende); ohne Angabe gilt der Standard der Art */
  level?: number;
};

/** Pegel ohne eigene Angabe: Rallye und Bergrennen Traumstraße, sonst Stark */
export const defaultLevel = (kind: HighlightRoadKind) => (kind === 'rallye' || kind === 'bergrennen' ? 4 : 3);

export const HIGHLIGHT_ROADS: HighlightRoad[] = [
  {
    // Insider Tipp von Koray (CUMO DRIVERS CLUB): Hirschhorn, L 3119 hoch nach Kortelshütte, durchs
    // Ulfenbachtal über Hainbrunn nach Rothenberg und die Beerfelder Straße (L 3410) Richtung Beerfelden.
    // Lang, kaum Unterbrechungen, kurvig, guter Belag, rund 20 Minuten ohne Verkehr. Linie 19,9 km
    // über den eigenen Routing Server, Stützpunkte auf den Durchgangsstraßen (nicht durch die Ortskerne).
    id: 'hirschhorn-rothenberg',
    name: 'Hirschhorn Rothenberg',
    level: 5,
    kind: 'strecke',
    note: 'Kurvenstrecke',
    say: 'die Kurvenstrecke zwischen Hirschhorn und Rothenberg',
    line: [
      [49.46610, 8.89675], [49.46914, 8.89927], [49.47258, 8.90199], [49.47364, 8.90585], [49.47654, 8.90686], [49.47819, 8.91234], [49.48034, 8.91658], [49.47974, 8.91982], [49.47944, 8.91452], [49.47748, 8.90949], [49.47545, 8.90490], [49.47309, 8.90400], [49.47015, 8.90103], [49.46696, 8.89789], [49.46894, 8.89663], [49.47303, 8.89879], [49.47653, 8.89931], [49.48012, 8.90217], [49.48409, 8.90172], [49.48791, 8.90282], [49.49158, 8.90243], [49.49493, 8.90077], [49.49851, 8.89979], [49.50214, 8.90173], [49.50586, 8.90250], [49.50927, 8.90410], [49.51385, 8.90703], [49.51738, 8.90846], [49.52174, 8.91256], [49.52513, 8.91502], [49.52869, 8.91673], [49.53298, 8.91719], [49.53558, 8.92068], [49.53952, 8.92169], [49.54271, 8.92413], [49.54579, 8.92745], [49.54859, 8.93006], [49.55071, 8.93397], [49.54875, 8.93861], [49.55054, 8.94347], [49.55313, 8.94089], [49.55618, 8.94358], [49.55642, 8.94884], [49.55758, 8.95418], [49.55773, 8.95656], [49.55598, 8.95264],
    ],
  },
  {
    // WP "Zotzenbach" der Nibelungenring Rallye 2009 und 2010 (rally-maps.com: 7,8 km, 214 bis 433 m),
    // auf der Strecke des früheren DMV Bergpreises Zotzenbach (1984: 3,79 km bis Ober Mengelbach).
    // Verlauf: Zotzenbach, K 21 über Unter und Ober Mengelbach, L 3409 bis zur Kreidacher Höhe.
    // Die Höhen der Linie (215 bis 436 m, 7,2 km auf K 21 und L 3409) passen zu den Angaben von rally-maps.com.
    // Start und Ziel der Prüfung sind nicht veröffentlicht, die Enden sind daher auf etwa 300 m genau.
    id: 'zotzenbach',
    name: 'Zotzenbach',
    kind: 'rallye',
    note: 'alte Rallyestrecke',
    line: [
      [49.60103, 8.77352], [49.59722, 8.781], [49.59256, 8.7851], [49.58746, 8.78887], [49.58386, 8.79347], [49.58268, 8.78877],
      [49.58052, 8.79422], [49.57772, 8.80105], [49.57341, 8.80149], [49.57109, 8.80677], [49.5663, 8.80544], [49.563, 8.81222],
    ],
  },
  {
    // Totenkopfstraße, L 514 im Pfälzerwald: St. Martin, Hüttenhohl (477 m), Totenkopf (514 m), Breitenstein.
    // Wikipedia: 13,6 km von St. Martin bis zur L 499; Linie 12,3 km auf der L 514.
    id: 'totenkopfstrasse',
    name: 'Totenkopfstraße',
    kind: 'strecke',
    note: 'Kurvenstrecke',
    line: [
      [49.30071, 8.09479], [49.30351, 8.08441], [49.30535, 8.0741], [49.30844, 8.06408], [49.31565, 8.06427], [49.32002, 8.06186],
      [49.32126, 8.0518], [49.3222, 8.04044], [49.31891, 8.03841], [49.3163, 8.03652], [49.31936, 8.02847], [49.32554, 8.02353],
      [49.33193, 8.02264], [49.33572, 8.01425], [49.33927, 8.00416], [49.34516, 8.00181],
    ],
  },
  {
    // Kalmithöhenstraße, L 515: Maikammer hinauf an der Kalmit (673 m) vorbei bis Hüttenhohl an der Totenkopfstraße.
    // Linie 6,9 km, Höhe laut Valhalla 205 bis 610 m.
    id: 'kalmit',
    name: 'Kalmithöhenstraße',
    kind: 'aussicht',
    note: 'Panoramastraße',
    say: 'die Kalmithöhenstraße',
    line: [
      [49.3091, 8.10916], [49.31144, 8.10155], [49.31136, 8.1076], [49.31352, 8.10212], [49.31404, 8.09403], [49.31595, 8.08737],
      [49.31208, 8.08684], [49.31641, 8.08372], [49.32115, 8.08748], [49.32223, 8.07961], [49.31998, 8.07252], [49.31791, 8.06536],
    ],
  },
  {
    // Schwarzwaldhochstraße, B 500 Nord: Bühlerhöhe, Sand, Hundseck, Unterstmatt bis Mummelsee (Wikipedia Ortsfolge). 11,5 km.
    id: 'b500nord',
    name: 'Schwarzwaldhochstraße',
    kind: 'aussicht',
    note: 'Panoramastraße',
    say: 'die Schwarzwaldhochstraße',
    line: [
      [48.66708, 8.2318], [48.66262, 8.23753], [48.65669, 8.23714], [48.65121, 8.2314], [48.64511, 8.22838], [48.64491, 8.21879],
      [48.64284, 8.20929], [48.63678, 8.20315], [48.63052, 8.2058], [48.62673, 8.20109], [48.62121, 8.19692], [48.61546, 8.19364],
      [48.60918, 8.19352], [48.60236, 8.1926], [48.59601, 8.1922], [48.59626, 8.20176],
    ],
  },
  {
    // Schwarzwaldhochstraße, B 500 Süd: Mummelsee, Seibelseckle, Ruhestein, Schliffkopf bis Alexanderschanze. 19,2 km.
    id: 'b500sued',
    name: 'Schwarzwaldhochstraße',
    kind: 'aussicht',
    note: 'Panoramastraße',
    say: 'die Schwarzwaldhochstraße',
    line: [
      [48.59626, 8.20176], [48.59528, 8.21742], [48.58463, 8.21592], [48.57597, 8.21763], [48.56975, 8.22339], [48.56083, 8.21726],
      [48.55291, 8.21581], [48.54189, 8.21712], [48.53356, 8.21852], [48.52298, 8.21593], [48.51393, 8.22449], [48.50281, 8.22591],
      [48.49775, 8.23973], [48.49525, 8.25474], [48.49065, 8.26905], [48.48051, 8.27543],
    ],
  },
  {
    // Siegfriedstraße, B 460 durch den Tromm Odenwald: Krumbach, Brombach, Leberbach, Weschnitz bis zur Wegscheide (413 m).
    // Wikipedia Bundesstraße 460. Linie 5,6 km.
    id: 'siegfriedstrasse',
    name: 'Siegfriedstraße',
    kind: 'strecke',
    note: 'Kurvenstrecke',
    line: [
      [49.66514, 8.80284], [49.66708, 8.81091], [49.66747, 8.81853], [49.66446, 8.82497], [49.66218, 8.83186], [49.65988, 8.8395],
      [49.65794, 8.84597], [49.66165, 8.85128], [49.65948, 8.85862], [49.65598, 8.86428],
    ],
  },
  {
    // L 3120 von Heppenheim über die Juhöhe (371 m) nach Mörlenbach. Linie 7,0 km.
    id: 'juhoehe',
    name: 'Juhöhe',
    kind: 'strecke',
    note: 'Kurvenstrecke',
    say: 'die Kurvenstrecke über die Juhöhe',
    line: [
      [49.63448, 8.67189], [49.632, 8.67894], [49.62829, 8.6851], [49.62479, 8.68777], [49.62345, 8.69545], [49.62119, 8.70185],
      [49.61825, 8.70455], [49.61758, 8.70935], [49.61487, 8.71593], [49.60935, 8.71916], [49.60473, 8.7227], [49.60021, 8.72574],
    ],
  },
  {
    // B 47 Nibelungenstraße von Gadernheim über Kolmbach nach Lindenfels. Linie 5,3 km.
    id: 'kolmbach',
    name: 'Kolmbach',
    kind: 'strecke',
    note: 'Kurvenstrecke',
    say: 'die Kurvenstrecke über Kolmbach',
    line: [
      [49.71597, 8.74183], [49.71108, 8.74522], [49.70727, 8.74975], [49.70694, 8.75642], [49.70215, 8.7569], [49.70275, 8.76475],
      [49.69966, 8.76949], [49.69482, 8.77022], [49.69213, 8.77714], [49.68921, 8.78157],
    ],
  },
  {
    // Neunkircher Höhe (605 m): L 3099, L 3102 und L 3399 von Gadernheim über Brandau hinauf nach Neunkirchen. Linie 5,5 km.
    id: 'neunkircher-hoehe',
    name: 'Neunkircher Höhe',
    kind: 'aussicht',
    note: 'Aussichtsstrecke',
    say: 'die Aussichtsstrecke an der Neunkircher Höhe',
    line: [
      [49.71864, 8.73743], [49.72178, 8.7298], [49.72507, 8.73166], [49.72932, 8.73661], [49.73394, 8.7396], [49.7375, 8.74158],
      [49.73817, 8.74848], [49.74154, 8.75572], [49.74022, 8.7627], [49.73635, 8.76829],
    ],
  },
  // Weggelassen: Kreidacher Höhe als eigene Strecke, sie deckt sich mit der Zotzenbach Prüfung.
  // Bergrennstrecken: Strecken aktueller und früherer Bergrennen auf öffentlichen Straßen (für das Rennen gesperrt,
  // sonst frei befahrbar). Quelle der Auswahl: Wikipedia Liste der Bergrennen, Länge und Verlauf aus dem Artikel der
  // jeweiligen Strecke. Start und Ziel aus Nominatim, dazwischen mit Valhalla geroutet und nur übernommen, wenn die
  // Länge höchstens etwa 20 % von der veröffentlichten abweicht. "ehemalige" heißt: dort wird kein Rennen mehr
  // gefahren oder nur noch eine historische Gleichmäßigkeitsfahrt. Zotzenbach steht oben als Rallyestrecke.
  // Strecken mit vielen Kehren (Schauinsland, Oberjoch, Klausenpass alle 400 m, Trento Bondone alle 250 m) sind dichter
  // ausgedünnt, sonst ist die Luftlinie der Punkte zu kurz für die Längenprüfung in roadsAlong.
  {
    // Bergrennen Unterfranken (MSC Erftal), St 507 von Eichenbühl nach Umpfenbach. Wikipedia: 3050 m, 171 bis 323 m. Start
    // und Ziel aus der Streckenkarte im Wikipedia Artikel.
    // Linie 3,0 km, Höhe laut Valhalla 168 bis 320 m.
    id: 'berg-eichenbuehl',
    name: 'Eichenbühl',
    kind: 'bergrennen',
    note: 'Bergrennstrecke',
    line: [
      [49.69986, 9.33824], [49.69933, 9.34177], [49.69527, 9.34899], [49.69047, 9.35507], [49.68933, 9.36155],
    ],
  },
  {
    // Bergrennen Mickhausen, Kreisstraße A 16 von Münster Richtung Birkach. Wikipedia: 2200 m, 519 bis 599 m, Start am
    // Ortsausgang von Münster.
    // Linie 2,2 km, Höhe laut Valhalla 525 bis 613 m.
    id: 'berg-mickhausen',
    name: 'Mickhausen',
    kind: 'bergrennen',
    note: 'Bergrennstrecke',
    line: [
      [48.23051, 10.64135], [48.22921, 10.64815], [48.22683, 10.64996], [48.22569, 10.65678], [48.22281, 10.66225],
    ],
  },
  {
    // Osnabrücker Bergrennen am Uphöfer Berg, K 330 Holter Straße von Hilter Uphöfen Richtung Holte. Wikipedia: 2,03 km.
    // Verlauf aus der OSM Relation Bergrennstrecke Uphöfen.
    // Linie 2,0 km, Höhe laut Valhalla 92 bis 167 m.
    id: 'berg-osnabrueck',
    name: 'Uphöfen',
    kind: 'bergrennen',
    note: 'Bergrennstrecke',
    line: [
      [52.19998, 8.20433], [52.20349, 8.20191], [52.20522, 8.19642], [52.20681, 8.19182], [52.20971, 8.18748],
    ],
  },
  {
    // Ibergrennen Heilbad Heiligenstadt, L 2022 hinauf zum Iberg. Wikipedia: 2,05 km, 200 Höhenmeter. Enden aus dem
    // Höhenprofil, auf etwa 200 m genau.
    // Linie 2,0 km, Höhe laut Valhalla 270 bis 402 m.
    id: 'berg-iberg',
    name: 'Iberg',
    kind: 'bergrennen',
    note: 'Bergrennstrecke',
    line: [
      [51.37553, 10.13033], [51.37101, 10.12761], [51.36685, 10.12497], [51.36296, 10.12231], [51.36077, 10.12035],
    ],
  },
  {
    // Glasbachrennen Bad Liebenstein, L 1027 von Steinbach (380 m) bis 215 m vor die Einmündung der L 2119 (630 m).
    // Wikipedia: 5500 m, 35 Kurven.
    // Linie 5,5 km, Höhe laut Valhalla 362 bis 616 m.
    id: 'berg-glasbach',
    name: 'Glasbach',
    kind: 'bergrennen',
    note: 'Bergrennstrecke',
    line: [
      [50.82403, 10.35103], [50.82888, 10.3545], [50.83211, 10.36053], [50.83778, 10.36005], [50.84348, 10.36101], [50.84647, 10.36912],
      [50.85097, 10.37141], [50.85463, 10.37647], [50.85551, 10.38078],
    ],
  },
  {
    // Homburger ADAC Bergrennen, L 120 und L 462 von Homburg hinauf Richtung Käshofen. Ausschreibung 2025: 2,6 km. Enden auf
    // etwa 200 m genau.
    // Linie 2,5 km, Höhe laut Valhalla 272 bis 350 m.
    id: 'berg-homburg',
    name: 'Homburg Käshofen',
    kind: 'bergrennen',
    note: 'Bergrennstrecke',
    line: [
      [49.32069, 7.38054], [49.31994, 7.38889], [49.31871, 7.39499], [49.31802, 7.40097], [49.32215, 7.40183],
    ],
  },
  {
    // Ratisbona Bergrennen, St 2233 von Kelheim hinauf nach Ihrlerstein. Wikipedia: 3,7 km, bis 2026 saniert und entschärft.
    // Linie 3,7 km, Höhe laut Valhalla 348 bis 467 m.
    id: 'berg-ratisbona',
    name: 'Ratisbona',
    kind: 'bergrennen',
    note: 'ehemalige Bergrennstrecke',
    line: [
      [48.92276, 11.88277], [48.929, 11.88331], [48.93532, 11.88177], [48.94051, 11.8806], [48.94087, 11.87009], [48.94036, 11.86173],
    ],
  },
  {
    // Rhön Bergrennen (1963 bis 1983), L 3330 und L 3379 von Schackau zum Parkplatz Danzwiesen unter der Milseburg.
    // Wikipedia: 3,4 km.
    // Linie 3,2 km, Höhe laut Valhalla 422 bis 646 m.
    id: 'berg-rhoen',
    name: 'Milseburg',
    kind: 'bergrennen',
    note: 'ehemalige Bergrennstrecke',
    line: [
      [50.56593, 9.87026], [50.56042, 9.87288], [50.55503, 9.87442], [50.55265, 9.88218], [50.55076, 9.88908], [50.55334, 9.89589],
    ],
  },
  {
    // Trierer Bergrennen (1971 bis 2011), K 82 von Fell nach Thomm, Steinbruchkehre. Wikipedia: 3715 m, 233 Höhenmeter, fünf
    // Serpentinen. Enden aus dem Höhenprofil, auf etwa 300 m genau.
    // Linie 3,7 km, Höhe laut Valhalla 207 bis 431 m.
    id: 'berg-trier',
    name: 'Fell Thomm',
    kind: 'bergrennen',
    note: 'ehemalige Bergrennstrecke',
    line: [
      [49.76669, 6.78527], [49.7614, 6.7902], [49.75544, 6.7931], [49.75669, 6.78985], [49.75202, 6.7927], [49.74734, 6.7918],
    ],
  },
  {
    // Gabelbachrennen Ilmenau, Waldstraße (K 56) vom Lessingpark durch das Gabelbachtal bis zum Berghotel Gabelbach.
    // Wikipedia: zuletzt 4 km.
    // Linie 3,9 km, Höhe laut Valhalla 489 bis 769 m.
    id: 'berg-gabelbach',
    name: 'Gabelbach',
    kind: 'bergrennen',
    note: 'ehemalige Bergrennstrecke',
    line: [
      [50.68086, 10.90893], [50.67586, 10.90476], [50.67092, 10.89982], [50.66534, 10.89835], [50.65998, 10.89576], [50.65751, 10.88863],
      [50.65664, 10.88489],
    ],
  },
  {
    // Lückendorfer Bergrennen, Gabler Straße (S 132) von Eichgraben zum Forsthaus Lückendorf. Wikipedia: 4 km, 209 m Steigung.
    // Linie 4,1 km, Höhe laut Valhalla 294 bis 500 m.
    id: 'berg-lueckendorf',
    name: 'Lückendorf',
    kind: 'bergrennen',
    note: 'ehemalige Bergrennstrecke',
    line: [
      [50.85664, 14.79328], [50.84997, 14.794], [50.8444, 14.79422], [50.83997, 14.79901], [50.8379, 14.79277], [50.83335, 14.78745],
      [50.82851, 14.78462],
    ],
  },
  {
    // ADAC Schauinsland Rennen (1925 bis 1984), L 124 Schauinslandstraße vom Friedrichshof an der Abzweigung nach Horben bis
    // zur Passhöhe. Wikipedia: Strecke 1961 bis 1983 etwa 11 km, 173 Kurven.
    // Linie 10,9 km, Höhe laut Valhalla 451 bis 1177 m.
    id: 'berg-schauinsland',
    name: 'Schauinsland',
    kind: 'bergrennen',
    note: 'ehemalige Bergrennstrecke',
    line: [
      [47.93997, 7.86833], [47.93983, 7.87358], [47.93943, 7.87809], [47.9376, 7.87434], [47.93497, 7.8729], [47.93267, 7.87563],
      [47.93161, 7.88036], [47.92987, 7.88074], [47.92781, 7.8779], [47.92481, 7.87725], [47.92573, 7.87235], [47.92292, 7.87525],
      [47.92111, 7.87952], [47.91819, 7.88122], [47.91915, 7.87671], [47.91757, 7.87126], [47.91595, 7.87588], [47.91475, 7.8814],
      [47.91257, 7.88028], [47.91037, 7.88378], [47.91102, 7.88397], [47.91324, 7.88554], [47.91193, 7.88976], [47.91428, 7.89129],
      [47.91735, 7.89059], [47.91692, 7.89192], [47.91395, 7.89281], [47.91153, 7.89426],
    ],
  },
  {
    // Jochrennen, B 308 Jochstraße vom Ortsausgang Bad Hindelang über Oberjoch bis zur Passhöhe. Wikipedia: heute 7,9 km mit
    // 105 Kurven (Jochpass Memorial), früher 5,72 km bis Oberjoch.
    // Linie 7,9 km, Höhe laut Valhalla 877 bis 1171 m.
    id: 'berg-jochpass',
    name: 'Oberjoch',
    kind: 'bergrennen',
    note: 'ehemalige Bergrennstrecke',
    line: [
      [47.50587, 10.38671], [47.50675, 10.39021], [47.50753, 10.38835], [47.50962, 10.3846], [47.50987, 10.38564], [47.51046, 10.38711],
      [47.51249, 10.38401], [47.51158, 10.38764], [47.5116, 10.38921], [47.5108, 10.39242], [47.51113, 10.39227], [47.51212, 10.39304],
      [47.51362, 10.39756], [47.51488, 10.40238], [47.5165, 10.40707], [47.51548, 10.41083], [47.51599, 10.41564], [47.51754, 10.42051],
      [47.51959, 10.42451], [47.5217, 10.42969], [47.52386, 10.4321],
    ],
  },
  {
    // Gaisbergrennen Salzburg, L 108 Gaisbergstraße von Guggenthal über die Zistelalm zur Gaisbergspitze. Wikipedia: 8,652
    // km, 672 Höhenmeter.
    // Linie 8,6 km, Höhe laut Valhalla 626 bis 1273 m.
    id: 'berg-gaisberg',
    name: 'Gaisberg',
    kind: 'bergrennen',
    note: 'Bergrennstrecke',
    line: [
      [47.81648, 13.10031], [47.81358, 13.09822], [47.80925, 13.09727], [47.80369, 13.09382], [47.79925, 13.10034], [47.79445, 13.10645],
      [47.78972, 13.11168], [47.78715, 13.11238], [47.79285, 13.11404], [47.79884, 13.11498], [47.80262, 13.12258], [47.80309, 13.11613],
      [47.80352, 13.1113],
    ],
  },
  {
    // Rechbergrennen, B 64 von Tulwitz hinauf über den Rechberg (929 m), Ziel nach der Passhöhe. Wikipedia: 5050 m, seit
    // 2024 4440 m.
    // Linie 5,0 km, Höhe laut Valhalla 655 bis 929 m.
    id: 'berg-rechberg',
    name: 'Rechberg',
    kind: 'bergrennen',
    note: 'Bergrennstrecke',
    line: [
      [47.27008, 15.46022], [47.26958, 15.45163], [47.2694, 15.44306], [47.26656, 15.43872], [47.26846, 15.43001], [47.26926, 15.42499],
      [47.26971, 15.42204], [47.26821, 15.41521],
    ],
  },
  {
    // Bergrennen Landshaag St. Martin, L 1507 von Landshaag Richtung St. Martin im Mühlkreis. Wikipedia: 3620 m, 230 Höhenmeter.
    // Linie 3,6 km, Höhe laut Valhalla 277 bis 509 m.
    id: 'berg-landshaag',
    name: 'Landshaag St. Martin',
    kind: 'bergrennen',
    note: 'Bergrennstrecke',
    line: [
      [48.36242, 14.03247], [48.36752, 14.0364], [48.37138, 14.04354], [48.37765, 14.04377], [48.38406, 14.04087], [48.38978, 14.04324],
    ],
  },
  {
    // Bergrennen Esthofen St. Agatha, L 525 Michaelnbach Stauff Straße. Tips.at: 2734 m. Enden auf etwa 300 m genau.
    // Linie 2,7 km, Höhe laut Valhalla 356 bis 517 m.
    id: 'berg-st-agatha',
    name: 'Esthofen St. Agatha',
    kind: 'bergrennen',
    note: 'Bergrennstrecke',
    line: [
      [48.36022, 13.86456], [48.36242, 13.87191], [48.36814, 13.87011], [48.36974, 13.87593], [48.37471, 13.87848],
    ],
  },
  {
    // Bergrennen Gurnigel, Strasse 230.1 von Dürrbach bis Gurnigelbad. Wikipedia: 3734 m, 314 Höhenmeter, Start und Ziel als
    // Koordinaten im Artikel.
    // Linie 3,7 km, Höhe laut Valhalla 838 bis 1137 m.
    id: 'berg-gurnigel',
    name: 'Gurnigel',
    kind: 'bergrennen',
    note: 'Bergrennstrecke',
    line: [
      [46.7787, 7.44413], [46.7777, 7.4392], [46.77244, 7.44094], [46.76989, 7.44541], [46.76595, 7.43966], [46.76204, 7.4429],
    ],
  },
  {
    // Bergrennen Oberhallau, Dorfstrasse und Oberhallauer Bergrennstrecke von Oberhallau zum Vorderen Berghof. Wikipedia:
    // 3,0 km, 157 Höhenmeter.
    // Linie 3,0 km, Höhe laut Valhalla 441 bis 574 m.
    id: 'berg-oberhallau',
    name: 'Oberhallau',
    kind: 'bergrennen',
    note: 'Bergrennstrecke',
    line: [
      [47.70858, 8.47471], [47.71521, 8.47508], [47.71833, 8.4757], [47.71821, 8.4713], [47.71546, 8.46672],
    ],
  },
  {
    // Bergrennen St. Ursanne Les Rangiers, Route des Rangiers und Hauptstrasse 249 unter dem Viadukt Combe Maran hindurch,
    // Ziel 300 m vor der Einmündung in die Hauptstrasse 6. Wikipedia: 5169 m, 430 bis 780 m. Linie beginnt erst an der
    // Hauptstrasse 249, die ersten 600 m im Ort fehlen, damit auch Routen aus Richtung Porrentruy treffen.
    // Linie 4,6 km, Höhe laut Valhalla 443 bis 776 m.
    id: 'berg-st-ursanne',
    name: 'St. Ursanne Les Rangiers',
    kind: 'bergrennen',
    note: 'Bergrennstrecke',
    line: [
      [47.36618, 7.1673], [47.3695, 7.17442], [47.37405, 7.17931], [47.37627, 7.18678], [47.37863, 7.19406], [47.38202, 7.20076],
      [47.38562, 7.19843], [47.38651, 7.1977],
    ],
  },
  {
    // Klausenrennen (1922 bis 1934, heute Memorial), Hauptstrasse 17 von Linthal über den Urnerboden zur Passhöhe.
    // Wikipedia: 21,5 km, 136 Kurven, 57 Kehren.
    // Linie 22,2 km, Höhe laut Valhalla 660 bis 1957 m.
    id: 'berg-klausen',
    name: 'Klausenpass',
    kind: 'bergrennen',
    note: 'ehemalige Bergrennstrecke',
    line: [
      [46.91882, 8.99703], [46.91909, 8.99209], [46.91841, 8.98892], [46.91505, 8.98643], [46.91175, 8.98313], [46.90859, 8.98192],
      [46.91027, 8.98271], [46.91148, 8.98161], [46.90951, 8.97963], [46.91121, 8.97934], [46.91488, 8.98153], [46.9165, 8.98199],
      [46.91356, 8.9781], [46.91092, 8.97403], [46.91423, 8.97693], [46.91404, 8.97539], [46.91251, 8.97124], [46.91051, 8.96679],
      [46.90868, 8.962], [46.90922, 8.95644], [46.9075, 8.95107], [46.9067, 8.94541], [46.90508, 8.94038], [46.90369, 8.93488],
      [46.90158, 8.92945], [46.89835, 8.92455], [46.89603, 8.91861], [46.89482, 8.9147], [46.89341, 8.9101], [46.89169, 8.90331],
      [46.88946, 8.89972], [46.88714, 8.89525], [46.88466, 8.89019], [46.8822, 8.88571], [46.87964, 8.884], [46.87818, 8.88237],
      [46.87507, 8.87891], [46.87568, 8.87769], [46.87656, 8.87717], [46.87606, 8.87591], [46.87178, 8.87377], [46.86857, 8.8752],
      [46.87053, 8.87269], [46.87304, 8.87213], [46.87233, 8.87082], [46.8734, 8.86807], [46.87145, 8.86295], [46.8735, 8.86405],
      [46.87076, 8.85946], [46.8682, 8.85548],
    ],
  },
  {
    // Course de côte Turckheim Trois Épis, Route des Trois Épis (D 10) von Turckheim hinauf Richtung Trois Épis. Autosprint:
    // 5950 m. Ziel auf etwa 300 m genau.
    // Linie 5,9 km, Höhe laut Valhalla 238 bis 513 m.
    id: 'berg-turckheim',
    name: 'Turckheim Trois Épis',
    kind: 'bergrennen',
    note: 'Bergrennstrecke',
    line: [
      [48.08566, 7.27422], [48.08492, 7.26355], [48.08379, 7.25492], [48.08417, 7.2438], [48.08792, 7.23817], [48.09238, 7.2385],
      [48.08877, 7.24064], [48.09425, 7.24069], [48.09428, 7.23671],
    ],
  },
  {
    // Course de côte du Mont Dore, D 36 von Moneaux zum Col de la Croix Saint Robert. Wikipedia (fr): etwas über 5 km, rund
    // 40 Kurven.
    // Linie 5,5 km, Höhe laut Valhalla 1116 bis 1449 m.
    id: 'berg-mont-dore',
    name: 'Mont Dore',
    kind: 'bergrennen',
    note: 'Bergrennstrecke',
    line: [
      [45.55577, 2.86982], [45.56001, 2.87292], [45.56355, 2.86568], [45.56056, 2.86265], [45.56221, 2.85577], [45.55998, 2.85021],
      [45.55736, 2.8487], [45.56055, 2.84078], [45.5641, 2.83597],
    ],
  },
  {
    // Trento Bondone, SP 85 von Montevideo (Trento) über Sardagna, Candriai und Vaneze nach Vason. Wikipedia (it): 17300 m,
    // 308 bis 1658 m, über 40 Kehren.
    // Linie 16,9 km, Höhe laut Valhalla 277 bis 1648 m.
    id: 'berg-bondone',
    name: 'Trento Bondone',
    kind: 'bergrennen',
    note: 'Bergrennstrecke',
    line: [
      [46.08039, 11.09824], [46.07819, 11.0986], [46.07613, 11.09807], [46.07399, 11.09764], [46.07179, 11.09721], [46.06988, 11.09752],
      [46.0717, 11.0953], [46.07302, 11.09367], [46.07157, 11.09396], [46.06963, 11.0952], [46.06816, 11.09666], [46.06622, 11.09832],
      [46.06478, 11.0972], [46.06576, 11.09561], [46.06763, 11.09378], [46.06949, 11.0922], [46.07101, 11.09019], [46.07318, 11.08894],
      [46.07298, 11.08848], [46.07247, 11.08868], [46.07224, 11.08734], [46.07171, 11.08687], [46.06979, 11.08844], [46.06777, 11.08845],
      [46.06602, 11.08968], [46.06424, 11.08891], [46.0621, 11.08812], [46.06289, 11.08765], [46.06518, 11.08745], [46.06667, 11.08613],
      [46.06704, 11.08396], [46.06523, 11.08369], [46.06475, 11.08323], [46.06321, 11.0823], [46.06259, 11.08042], [46.06132, 11.07987],
      [46.05972, 11.08145], [46.05795, 11.08008], [46.05961, 11.07959], [46.05828, 11.07841], [46.05972, 11.07738], [46.05835, 11.07802],
      [46.05676, 11.07622], [46.0544, 11.07566], [46.05255, 11.07562], [46.05432, 11.07438], [46.05518, 11.07268], [46.05312, 11.07318],
      [46.05175, 11.07327], [46.05097, 11.0729], [46.0526, 11.07147], [46.05183, 11.07086], [46.05093, 11.07018], [46.05116, 11.06929],
      [46.05032, 11.06882], [46.05029, 11.06814], [46.04869, 11.0674], [46.04819, 11.06631], [46.04837, 11.06419], [46.04623, 11.0652],
      [46.04637, 11.06417], [46.04526, 11.06443], [46.04304, 11.06415], [46.04426, 11.06311], [46.04433, 11.0609], [46.04246, 11.06163],
      [46.0405, 11.06094], [46.04115, 11.05885], [46.0396, 11.05747],
    ],
  },
  // Weggelassen (unsicher oder doppelt): Wolsfeld, Eckental, Hemberg, Roßfeld, Alpl, Kesselberg und Exelberg
  // (Start oder Ziel nicht belegt), Großglockner (Ikone Hochtor deckt die Nordrampe ab), Mont Ventoux (Ikone).
];

/**
 * Kuratierte Streckendatenbank (routing/data/roads, DE AT CH IT FR) als fertige Linien in
 * src/data/curated-roads.json: mit Valhalla (valhalla1.openstreetmap.de) vom Start über alle Zwischenorte
 * zum Ziel geroutet, auf Länge, Stichstraßen und Schleifen geprüft, doppelte zusammengeführt und auf etwa
 * alle 400 m ausgedünnt (kehrenreiche Strecken dichter). Stand: November 2026. Nur Daten, kein Netz zur Laufzeit.
 * tier highlight wird angekündigt, tier prefer zieht nur die Routenplanung auf diese Straßen.
 * Pässe mit eigener Strecke stehen dort als prefer, die Ansage übernimmt die Passdatenbank.
 */
type CuratedRoad = {
  id: string;
  name: string;
  kind: HighlightRoadKind;
  tier: 'highlight' | 'prefer';
  note: string;
  country: string;
  line: LatLon[];
  level?: number;
};

const CURATED = curatedData as unknown as CuratedRoad[];

const toRoad = ({ id, name, kind, note, line, level }: CuratedRoad): HighlightRoad => ({ id, name, kind, note, line, level });

/** Abstand eines Punkts zur Strecke a b in Metern (flache Näherung, reicht für 150 m). */
function segmentDistance(p: LatLon, a: LatLon, b: LatLon) {
  const k = Math.cos((p[0] * Math.PI) / 180) * 111320;
  const ax = (a[1] - p[1]) * k;
  const ay = (a[0] - p[0]) * 110540;
  const bx = (b[1] - p[1]) * k;
  const by = (b[0] - p[0]) * 110540;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Liegt mehr als die Hälfte der Punkte von a höchstens 150 m neben der Linie b? */
function mostlyOn(a: LatLon[], b: LatLon[]) {
  let hit = 0;
  for (const p of a) if (b.some((q, i) => i > 0 && segmentDistance(p, b[i - 1], q) <= 150)) hit++;
  return hit > a.length * 0.5;
}

/**
 * Deckt sich die Strecke mit einer handgepflegten? In beide Richtungen geprüft: die handgepflegten Linien
 * sind grob (etwa alle 700 m), in Kehren liegen die Punkte der neuen Linie sonst neben den Sehnen.
 */
function coveredBy(road: CuratedRoad, others: HighlightRoad[]) {
  const near = others.filter((o) =>
    o.line.some(([la, lo]) => road.line.some((q) => Math.abs(q[0] - la) < 0.03 && Math.abs(q[1] - lo) < 0.045)),
  );
  return near.some((o) => mostlyOn(road.line, o.line) || mostlyOn(o.line, road.line));
}

// Handgepflegte Strecken bleiben vorne, kuratierte Highlights nur dort, wo noch keine handgepflegte liegt
const MANUAL_COUNT = HIGHLIGHT_ROADS.length;
for (const r of CURATED) {
  if (r.tier === 'highlight' && r.line.length > 1 && !coveredBy(r, HIGHLIGHT_ROADS.slice(0, MANUAL_COUNT))) {
    HIGHLIGHT_ROADS.push(toRoad(r));
  }
}

/** Strecken, die die Routenplanung bevorzugt, ohne sie anzukündigen (tier prefer). */
export const PREFER_ROADS: HighlightRoad[] = CURATED.filter((r) => r.tier === 'prefer' && r.line.length > 1).map(toRoad);
