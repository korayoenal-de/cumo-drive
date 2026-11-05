/**
 * Kuratierte Highlight Strecken unterhalb der Pässe: alte Rallyeprüfungen, bekannte Kurvenstrecken
 * und Panoramastraßen. Die Navigation kündigt sie wie einen Pass an (In 500 m, Zotzenbach, alte Rallyestrecke, 7 km).
 *
 * Linien: Straßenverlauf aus OpenStreetMap, ermittelt mit dem öffentlichen Valhalla Server
 * (valhalla1.openstreetmap.de) zwischen Orten aus Nominatim und nur auf den Abschnitten mit der
 * genannten Straßennummer. Danach gleichmäßig auf etwa alle 700 m ausgedünnt, damit Richtung und
 * Abgleich mit der Route funktionieren. Stand: November 2026.
 *
 * Ansage: `say` ist der gesprochene Teil (in beiden Fahrtrichtungen passend) nach "beginnt" (In 500 Metern beginnt die alte Rallyestrecke Zotzenbach).
 * Ohne `say` wird "die {note} {name}" gesprochen, deshalb sind alle Notizen weiblich (Strecke, Straße).
 */
import type { LatLon } from './tour';

export type HighlightRoadKind = 'rallye' | 'strecke' | 'aussicht';

export type HighlightRoad = {
  id: string;
  name: string;
  kind: HighlightRoadKind;
  /** kurze Unterzeile, zum Beispiel "alte Rallyestrecke" oder "Kurvenstrecke" */
  note: string;
  /** gesprochen nach "beginnt", ohne Punkt */
  say?: string;
  /** Verlauf in Fahrtrichtung der Quelle; der Abgleich akzeptiert beide Richtungen */
  line: LatLon[];
};

export const HIGHLIGHT_ROADS: HighlightRoad[] = [
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
];
