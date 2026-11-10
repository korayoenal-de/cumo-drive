import CarPlay
import MapKit
import UIKit

/// CarPlay für CUMO DRIVE: Karte mit der Tour, Vorschau mit "Los", Routenführung mit Manövern,
/// Restweg und Ankunft, Highlights als kurze Hinweise. Die Logik bleibt in der App (JavaScript):
/// Sie schickt Tour und Manöver über das Modul CumoCarPlay, CarPlay meldet Start und Beenden zurück.
/// Alles hier läuft auf dem Main Thread.
final class CarPlayBridge: NSObject {
  static let shared = CarPlayBridge()

  /// Ereignisse an JavaScript (gesetzt vom Modul CumoCarPlay)
  var emit: ((String, [String: Any?]) -> Void)?

  private(set) var connected = false
  private var interfaceController: CPInterfaceController?
  private var mapVC: CarMapViewController?
  private var mapTemplate: CPMapTemplate?
  private var session: CPNavigationSession?
  private var trip: CPTrip?
  private var maneuverKey: String?
  private var maneuver: CPManeuver?
  private var panning = false
  /// Sprachansagen an (Knopf auf dem Autodisplay, Zustand kommt aus der App)
  private var voiceOn = true
  /// Build 14: Karten im Dashboard und im Kombiinstrument, sie folgen der Hauptkarte
  private var extraMaps: [CarMapViewController] = []
  private var allMaps: [CarMapViewController] { [mapVC].compactMap { $0 } + extraMaps }
  /// Übersicht statt Folgen (Kartenknopf in der Führung)
  private var overviewOn = false
  /// Menü Mehr: Zwischenziel überspringen (leer: keins) und Pause, Zustand kommt aus der App
  private var skipLabel = ""
  private var paused = false
  /// Gruppenfahrt: andere Teilnehmer (id, name, lat, lon, detail)
  private var group: [[String: Any]] = []

  private var tourName = ""
  private var tourCoords: [CLLocationCoordinate2D] = []
  private var tourKm: Double = 0
  private var tourMinutes: Double = 0

  /// Build 16: Start im Auto ohne iPhone (Tester 10.11.): Meine Touren und Schnelle Runde.
  /// Die Liste kommt aus der App (setLibrary); erst danach erscheinen die Knöpfe, damit ein älteres
  /// JavaScript ohne diese Ereignisse keine toten Knöpfe zeigt.
  private var pickerReady = false
  /// id, name, detail, fun (Stufe 1 bis 5, 0: keine), neueste zuerst
  private var library: [[String: Any]] = []
  private weak var toursList: CPListTemplate?
  /// Schnelle Runde: Planung läuft in der App, solange steht ein Hinweis mit Abbrechen über der Karte
  private var planning = false
  private var planToken = 0
  private var planningAlert: CPNavigationAlert?
  private static let roundKms = [50, 100, 150]
  private static let maxTours = 24
  static let pickerHint = "Wähle oben eine Tour oder eine Runde."

  var guiding: Bool { session != nil }

  // MARK: Verbindung

  func connect(_ ic: CPInterfaceController, window: CPWindow) {
    interfaceController = ic
    let vc = CarMapViewController()
    window.overrideUserInterfaceStyle = .dark
    window.rootViewController = vc
    mapVC = vc
    vc.setStyle(mapStyle)
    if pickerReady { vc.setHint(CarPlayBridge.pickerHint) }

    let t = CPMapTemplate()
    t.mapDelegate = self
    // CUMO Look: dunkle Flächen statt Apple Rot und Hell (Testfahrt 7.11.)
    t.guidanceBackgroundColor = UIColor(red: 22 / 255, green: 22 / 255, blue: 24 / 255, alpha: 1)
    t.tripEstimateStyle = .dark
    mapTemplate = t
    updateButtons()
    ic.setRootTemplate(t, animated: false, completion: nil)
    connected = true

    vc.setRoute(tourCoords)
    vc.setGroup(group)
    if session == nil { showPreview() }
    emit?("onConnect", [:])
  }

  func disconnect() {
    connected = false
    // laufende Planung einer Runde abbrechen, ohne Autodisplay braucht sie keiner
    if planning { emit?("onRoundCancel", [:]) }
    planning = false
    planToken += 1
    planningAlert = nil
    toursList = nil
    session = nil
    trip = nil
    maneuverKey = nil
    maneuver = nil
    panning = false
    overviewOn = false
    mapTemplate = nil
    mapVC = nil
    interfaceController = nil
    emit?("onDisconnect", [:])
  }

  // MARK: Tour

  func setTour(name: String, coords: [[Double]], km: Double, minutes: Double) {
    tourName = name
    tourCoords = coords.compactMap { $0.count >= 2 ? CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) : nil }
    tourKm = km
    tourMinutes = minutes
    // während der Führung gehört der Trip zur laufenden Sitzung
    if session == nil { trip = nil }
    for m in allMaps { m.setRoute(tourCoords) }
    if session == nil { showPreview() }
  }

  func clearTour() {
    setTour(name: "", coords: [], km: 0, minutes: 0)
  }

  private func makeTrip() -> CPTrip? {
    guard let first = tourCoords.first, let last = tourCoords.last, tourCoords.count >= 2 else { return nil }
    let origin = MKMapItem(placemark: MKPlacemark(coordinate: first))
    origin.name = "Start"
    let destination = MKMapItem(placemark: MKPlacemark(coordinate: last))
    destination.name = tourName.isEmpty ? "Ziel" : tourName
    let info = CarPlayBridge.summary(km: tourKm, minutes: tourMinutes)
    let choice = CPRouteChoice(
      summaryVariants: [tourName.isEmpty ? "Tour" : tourName],
      additionalInformationVariants: [info],
      selectionSummaryVariants: [info]
    )
    return CPTrip(origin: origin, destination: destination, routeChoices: [choice])
  }

  static func summary(km: Double, minutes: Double) -> String {
    let h = Int(minutes) / 60
    let m = Int(minutes) % 60
    let time = h > 0 ? String(format: "%d:%02d h", h, m) : "\(m) min"
    return "\(Int(km.rounded())) km, \(time)"
  }

  /// Vorschau der Tour mit "Los": nur ohne laufende Führung
  private func showPreview() {
    guard let t = mapTemplate, session == nil else { return }
    t.hideTripPreviews()
    guard let trip = trip ?? makeTrip() else {
      mapVC?.follow(true)
      return
    }
    self.trip = trip
    let text = CPTripPreviewTextConfiguration(startButtonTitle: "Los", additionalRoutesButtonTitle: nil, overviewButtonTitle: nil)
    t.showTripPreviews([trip], textConfiguration: text)
    mapVC?.showOverview()
  }

  // MARK: Führung

  func startGuidance() {
    guard let t = mapTemplate, session == nil else { return }
    // offene Listen schließen, die Führung gehört auf die Karte
    if planning { cancelPlanning() }
    if let ic = interfaceController, ic.topTemplate !== t { ic.popToRootTemplate(animated: false, completion: nil) }
    t.hideTripPreviews()
    if trip == nil { trip = makeTrip() }
    guard let trip else { return }
    session = t.startNavigationSession(for: trip)
    maneuverKey = nil
    maneuver = nil
    overviewOn = false
    updateButtons()
    for m in allMaps { m.follow(true) }
  }

  /// key wechselt mit dem nächsten Manöver; distM und secs gelten bis dorthin, restKm und restSecs bis zum Ziel
  private static func maneuverImage(icon: String, symbol: String, size: CGFloat) -> UIImage? {
    // eigene CUMO Symbole (Images.xcassets, aus maneuver-geometry.ts), sonst SF Symbol
    if !icon.isEmpty, let own = UIImage(named: icon) {
      // Originalfarben behalten, sonst färbt CarPlay das orange Symbol vor dem Manöver weiß
      return own.withRenderingMode(.alwaysOriginal)
    }
    let cfg = UIImage.SymbolConfiguration(pointSize: size, weight: .bold)
    return UIImage(systemName: symbol, withConfiguration: cfg) ?? UIImage(systemName: "arrow.up", withConfiguration: cfg)
  }

  /// then: das Manöver danach ("Dann" wie in der App), CarPlay zeigt es unter dem ersten, wenn Platz ist
  func update(key: String, text: String, symbol: String, icon: String, distM: Double, secs: Double, restKm: Double, restSecs: Double,
              thenText: String = "", thenSymbol: String = "", thenIcon: String = "") {
    guard let s = session else { return }
    if key != maneuverKey {
      let m = CPManeuver()
      m.instructionVariants = [text]
      m.symbolImage = CarPlayBridge.maneuverImage(icon: icon, symbol: symbol, size: 44)
      m.initialTravelEstimates = CPTravelEstimates(distanceRemaining: CarPlayBridge.distance(distM), timeRemaining: secs)
      var list = [m]
      if !thenText.isEmpty {
        let n = CPManeuver()
        n.instructionVariants = [thenText]
        n.symbolImage = CarPlayBridge.maneuverImage(icon: thenIcon, symbol: thenSymbol, size: 28)
        list.append(n)
      }
      s.upcomingManeuvers = list
      maneuverKey = key
      maneuver = m
    } else if let m = maneuver {
      s.updateEstimates(CPTravelEstimates(distanceRemaining: CarPlayBridge.distance(distM), timeRemaining: secs), for: m)
    }
    if let t = mapTemplate, let trip {
      t.updateEstimates(CPTravelEstimates(distanceRemaining: CarPlayBridge.distance(restKm * 1000), timeRemaining: restSecs), for: trip)
    }
  }

  static func distance(_ m: Double) -> Measurement<UnitLength> {
    if m >= 1000 { return Measurement(value: (m / 100).rounded() / 10, unit: .kilometers) }
    return Measurement(value: max(0, (m / 10).rounded() * 10), unit: .meters)
  }

  func stopGuidance(arrived: Bool) {
    if let s = session {
      if arrived { s.finishTrip() } else { s.cancelTrip() }
    }
    session = nil
    maneuverKey = nil
    maneuver = nil
    overviewOn = false
    updateButtons()
    showPreview()
    for m in extraMaps { m.follow(true) }
  }

  /// Kurzer Hinweis über der Karte, etwa für einen Pass
  func alert(title: String, subtitle: String, image: String = "", duration: TimeInterval = 10) {
    guard let t = mapTemplate else { return }
    let present = {
      let ok = CPAlertAction(title: "OK", style: .default) { [weak t] _ in
        t?.dismissNavigationAlert(animated: true) { _ in }
      }
      let a = CPNavigationAlert(
        titleVariants: [title],
        subtitleVariants: subtitle.isEmpty ? [] : [subtitle],
        // Logo als Fahrspaß Pegel (fun-1 bis fun-5), wie in der Ansage auf dem iPhone
        image: image.isEmpty ? nil : UIImage(named: image)?.withRenderingMode(.alwaysOriginal),
        primaryAction: ok,
        secondaryAction: nil,
        duration: duration
      )
      t.present(navigationAlert: a, animated: true)
    }
    if t.currentNavigationAlert != nil {
      t.dismissNavigationAlert(animated: false) { _ in present() }
    } else {
      present()
    }
  }

  // MARK: Karte und Ton

  func setRejoin(_ coords: [[Double]]) {
    let c = coords.compactMap { $0.count >= 2 ? CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) : nil }
    for m in allMaps { m.setRejoin(c) }
  }

  func camera(lat: Double, lon: Double, heading: Double) {
    let c = CLLocationCoordinate2D(latitude: lat, longitude: lon)
    for m in allMaps { m.followCamera(c, heading: heading) }
  }

  /// zuletzt gewählte Darstellung, auch für eine Karte, die erst nach dem Einstecken entsteht
  private var mapStyle = "standard"
  func setMapStyle(_ style: String) {
    mapStyle = style
    for m in allMaps { m.setStyle(style) }
  }

  // MARK: Build 14: Menü, Gruppe, Bremshinweis, Bewertung, Dashboard und Kombiinstrument

  /// Zustand für das Menü Mehr aus der App
  func setMenu(skipLabel: String, paused: Bool) {
    self.skipLabel = skipLabel
    self.paused = paused
  }

  /// Andere Teilnehmer der Gruppenfahrt als Marker auf allen Karten
  func setGroup(_ list: [[String: Any]]) {
    group = list
    for m in allMaps { m.setGroup(list) }
  }

  /// Bremshinweis (Co Pilot light): kurzer Hinweis ohne Bild
  func hint(title: String, subtitle: String) {
    alert(title: title, subtitle: subtitle, image: "", duration: 6)
  }

  /// Nach der Ankunft: drei Stufen wie der Regler in der App (Gründe und Notiz später am iPhone)
  func askRating() {
    guard let ic = interfaceController, ic.presentedTemplate == nil else { return }
    let pick = { [weak self] (score: Int) in
      self?.interfaceController?.dismissTemplate(animated: true, completion: nil)
      self?.emit?("onRate", ["score": score])
    }
    let sheet = CPActionSheetTemplate(
      title: "Wie war die Fahrt?",
      message: "Details kannst du später am iPhone ergänzen.",
      actions: [
        CPAlertAction(title: "Sensationell", style: .default) { _ in pick(98) },
        CPAlertAction(title: "Gut", style: .default) { _ in pick(70) },
        CPAlertAction(title: "Nicht gut", style: .default) { _ in pick(25) },
        CPAlertAction(title: "Später", style: .cancel) { [weak self] _ in self?.interfaceController?.dismissTemplate(animated: true, completion: nil) },
      ]
    )
    ic.presentTemplate(sheet, animated: true, completion: nil)
  }

  /// Weitere Karte (Dashboard, Kombiinstrument): bekommt Tour, Stil, Gruppe und folgt der Position
  func addMap(_ vc: CarMapViewController) {
    extraMaps.append(vc)
    vc.setStyle(mapStyle)
    vc.setRoute(tourCoords)
    vc.setGroup(group)
    vc.follow(true)
  }

  func removeMap(_ vc: CarMapViewController) {
    extraMaps.removeAll { $0 === vc }
  }

  // MARK: Build 16: Meine Touren und Schnelle Runde

  /// Gespeicherte Touren aus der App, neueste zuerst; eine offene Liste wird gleich aufgefrischt
  func setLibrary(_ list: [[String: Any]]) {
    library = list
    if !pickerReady {
      pickerReady = true
      mapVC?.setHint(CarPlayBridge.pickerHint)
      updateButtons()
    }
    toursList?.updateSections(tourSections())
  }

  private func tourSections() -> [CPListSection] {
    let limit = max(1, min(CarPlayBridge.maxTours, CPListTemplate.maximumItemCount))
    let items: [CPListItem] = library.prefix(limit).compactMap { t in
      guard let id = t["id"] as? String else { return nil }
      let level = (t["fun"] as? NSNumber)?.intValue ?? 0
      let image = (1...5).contains(level) ? UIImage(named: "fun-\(level)")?.withRenderingMode(.alwaysOriginal) : nil
      let name = t["name"] as? String ?? ""
      let item = CPListItem(text: name.isEmpty ? "Tour" : name, detailText: t["detail"] as? String, image: image)
      item.handler = { [weak self] _, completion in
        self?.pickTour(id)
        completion()
      }
      return item
    }
    return items.isEmpty ? [] : [CPListSection(items: items)]
  }

  private func showTours() {
    guard let ic = interfaceController, session == nil, !planning else { return }
    let list = CPListTemplate(title: "Meine Touren", sections: tourSections())
    list.emptyViewTitleVariants = ["Noch keine Touren"]
    list.emptyViewSubtitleVariants = ["Gespeicherte Touren aus der App stehen hier."]
    toursList = list
    ic.pushTemplate(list, animated: true, completion: nil)
  }

  private func showRounds() {
    guard let ic = interfaceController, session == nil, !planning else { return }
    let items = CarPlayBridge.roundKms.map { km -> CPListItem in
      let item = CPListItem(text: "\(km) km", detailText: "Kurvig, Richtung zufällig", image: UIImage(systemName: "arrow.triangle.2.circlepath"))
      item.handler = { [weak self] _, completion in
        self?.planRound(km)
        completion()
      }
      return item
    }
    ic.pushTemplate(CPListTemplate(title: "Schnelle Runde", sections: [CPListSection(items: items)]), animated: true, completion: nil)
  }

  /// Tour gewählt: zurück zur Karte, die App setzt die aktive Tour und schickt sie als Vorschau mit Los
  private func pickTour(_ id: String) {
    guard session == nil, !planning else { return }
    interfaceController?.popToRootTemplate(animated: true, completion: nil)
    emit?("onPickTour", ["id": id])
  }

  /// Runde planen: zurück zur Karte, Hinweis mit Abbrechen, die App plant und meldet sich mit endPlanning
  private func planRound(_ km: Int) {
    guard session == nil, !planning else { return }
    planning = true
    planToken += 1
    let token = planToken
    interfaceController?.popToRootTemplate(animated: true) { [weak self] _, _ in
      self?.showPlanning(km, token: token)
    }
    emit?("onRoundTrip", ["km": km])
    // Sicherheitsnetz: antwortet die App nicht, nicht ewig warten
    DispatchQueue.main.asyncAfter(deadline: .now() + 90) { [weak self] in
      guard let self, self.planning, self.planToken == token else { return }
      self.emit?("onRoundCancel", [:])
      self.endPlanning(message: "Das hat zu lange gedauert.")
    }
  }

  private func showPlanning(_ km: Int, token: Int) {
    guard planning, planToken == token, let t = mapTemplate else { return }
    let cancel = CPAlertAction(title: "Abbrechen", style: .default) { [weak self] _ in self?.cancelPlanning() }
    let a = CPNavigationAlert(
      titleVariants: ["Runde wird geplant"],
      subtitleVariants: ["\(km) km ab deinem Standort"],
      image: nil,
      primaryAction: cancel,
      secondaryAction: nil,
      // 0: bleibt stehen, bis die Planung fertig ist oder abgebrochen wird
      duration: 0
    )
    planningAlert = a
    let present = { [weak self, weak t] in
      guard let self, let t, self.planning, self.planToken == token else { return }
      t.present(navigationAlert: a, animated: true)
    }
    if t.currentNavigationAlert != nil {
      t.dismissNavigationAlert(animated: false) { _ in present() }
    } else {
      present()
    }
  }

  private func dismissPlanningAlert() {
    if let t = mapTemplate, let a = planningAlert, t.currentNavigationAlert === a {
      t.dismissNavigationAlert(animated: true) { _ in }
    }
    planningAlert = nil
  }

  private func cancelPlanning() {
    guard planning else { return }
    planning = false
    planToken += 1
    dismissPlanningAlert()
    emit?("onRoundCancel", [:])
  }

  /// Planung fertig (message leer) oder gescheitert (kurzer Grund); die Tour selbst kommt über setTour
  func endPlanning(message: String) {
    guard planning else { return }
    planning = false
    planToken += 1
    if message.isEmpty {
      dismissPlanningAlert()
    } else {
      // alert ersetzt den Hinweis zur Planung
      planningAlert = nil
      alert(title: "Runde nicht geplant", subtitle: message, image: "", duration: 8)
    }
  }

  private static let styleNames = ["standard": "Standard", "satellit": "Satellit", "3d": "3D Satellit"]

  private func showMore() {
    guard let ic = interfaceController, ic.presentedTemplate == nil else { return }
    let close: (@escaping () -> Void) -> Void = { [weak self] then in
      self?.interfaceController?.dismissTemplate(animated: true) { _, _ in then() }
    }
    var actions: [CPAlertAction] = []
    if !skipLabel.isEmpty {
      actions.append(CPAlertAction(title: skipLabel, style: .default) { [weak self] _ in close { self?.emit?("onSkip", [:]) } })
    }
    actions.append(CPAlertAction(title: paused ? "Fortsetzen" : "Pausieren", style: .default) { [weak self] _ in
      let on = !(self?.paused ?? false)
      close { self?.emit?("onPause", ["on": on]) }
    })
    let order = ["standard", "satellit", "3d"]
    let next = order[((order.firstIndex(of: mapStyle) ?? 0) + 1) % order.count]
    actions.append(CPAlertAction(title: "Karte: \(CarPlayBridge.styleNames[next] ?? next)", style: .default) { [weak self] _ in
      close { self?.emit?("onMapStyle", ["style": next]) }
    })
    if !group.isEmpty {
      actions.append(CPAlertAction(title: "Gruppe", style: .default) { [weak self] _ in close { self?.showGroup() } })
    }
    actions.append(CPAlertAction(title: "Abbrechen", style: .cancel) { _ in close {} })
    ic.presentTemplate(CPActionSheetTemplate(title: nil, message: nil, actions: actions), animated: true, completion: nil)
  }

  private func showGroup() {
    guard let ic = interfaceController else { return }
    let items = group.map { m -> CPListItem in
      CPListItem(text: m["name"] as? String ?? "", detailText: m["detail"] as? String)
    }
    let list = CPListTemplate(title: "Gruppe", sections: [CPListSection(items: items)])
    ic.pushTemplate(list, animated: true, completion: nil)
  }

  private func toggleOverview() {
    overviewOn.toggle()
    if overviewOn { mapVC?.showOverview() } else { mapVC?.follow(true) }
    updateButtons()
  }

  func setVoice(_ on: Bool) {
    voiceOn = on
    updateButtons()
  }

  // MARK: Knöpfe

  private func updateButtons() {
    guard let t = mapTemplate else { return }
    let pan = CPMapButton { [weak self] _ in self?.setPanning(true) }
    pan.image = UIImage(systemName: "arrow.up.and.down.and.arrow.left.and.right")
    let zoomIn = CPMapButton { [weak self] _ in self?.mapVC?.zoom(0.5) }
    zoomIn.image = UIImage(systemName: "plus.magnifyingglass")
    let zoomOut = CPMapButton { [weak self] _ in self?.mapVC?.zoom(2) }
    zoomOut.image = UIImage(systemName: "minus.magnifyingglass")
    // Ton an und aus wie auf dem iPhone, nur während der Führung
    let voice = CPMapButton { [weak self] _ in self?.emit?("onVoice", [:]) }
    voice.image = UIImage(systemName: voiceOn ? "speaker.wave.2.fill" : "speaker.slash.fill")
    // Build 14: in der Führung Übersicht statt der Zoomknöpfe und Mehr für Überspringen, Pause, Karte, Gruppe
    let overview = CPMapButton { [weak self] _ in self?.toggleOverview() }
    overview.image = UIImage(systemName: overviewOn ? "location.north.line.fill" : "map")
    let more = CPMapButton { [weak self] _ in self?.showMore() }
    more.image = UIImage(systemName: "ellipsis")
    t.mapButtons = panning ? [] : (session != nil ? [voice, overview, pan, more] : [pan, zoomIn, zoomOut])

    if panning {
      t.leadingNavigationBarButtons = [CPBarButton(title: "Fertig") { [weak self] _ in self?.setPanning(false) }]
      t.trailingNavigationBarButtons = []
    } else {
      // Build 16: ohne Führung oben links Touren und Runde (höchstens zwei Knöpfe je Seite)
      if session == nil && pickerReady {
        let tours = CPBarButton(title: "Touren") { [weak self] _ in self?.showTours() }
        let round = CPBarButton(title: "Runde") { [weak self] _ in self?.showRounds() }
        t.leadingNavigationBarButtons = [tours, round]
      } else {
        t.leadingNavigationBarButtons = []
      }
      t.trailingNavigationBarButtons = session != nil
        ? [CPBarButton(title: "Beenden") { [weak self] _ in self?.emit?("onEnd", [:]) }]
        : []
    }
  }

  private func setPanning(_ on: Bool) {
    guard let t = mapTemplate else { return }
    panning = on
    if on {
      t.showPanningInterface(animated: true)
    } else {
      t.dismissPanningInterface(animated: true)
      overviewOn = false
      if session != nil { mapVC?.follow(true) } else { mapVC?.showOverview() }
    }
    updateButtons()
  }
}

extension CarPlayBridge: CPMapTemplateDelegate {
  func mapTemplate(_ mapTemplate: CPMapTemplate, startedTrip trip: CPTrip, using routeChoice: CPRouteChoice) {
    mapTemplate.hideTripPreviews()
    emit?("onStart", [:])
  }

  func mapTemplate(_ mapTemplate: CPMapTemplate, panWith direction: CPMapTemplate.PanDirection) {
    mapVC?.pan(direction)
  }
}

/// Die Szene auf dem Autodisplay (Info.plist: CPTemplateApplicationSceneSessionRoleApplication)
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene, didConnect interfaceController: CPInterfaceController, to window: CPWindow) {
    CarPlayBridge.shared.connect(interfaceController, window: window)
  }

  func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene, didDisconnect interfaceController: CPInterfaceController, from window: CPWindow) {
    CarPlayBridge.shared.disconnect()
  }
}

/// Build 14: Karte im CarPlay Dashboard (geteilter Bildschirm), folgt der Fahrt
final class CarPlayDashboardDelegate: UIResponder, CPTemplateApplicationDashboardSceneDelegate {
  private var vc: CarMapViewController?

  func templateApplicationDashboardScene(_ templateApplicationDashboardScene: CPTemplateApplicationDashboardScene, didConnect dashboardController: CPDashboardController, to window: UIWindow) {
    let v = CarMapViewController()
    v.showsHint = false
    window.overrideUserInterfaceStyle = .dark
    window.rootViewController = v
    vc = v
    CarPlayBridge.shared.addMap(v)
  }

  func templateApplicationDashboardScene(_ templateApplicationDashboardScene: CPTemplateApplicationDashboardScene, didDisconnect dashboardController: CPDashboardController, from window: UIWindow) {
    if let v = vc { CarPlayBridge.shared.removeMap(v) }
    vc = nil
  }
}

/// Build 14: Karte im Kombiinstrument, sofern das Auto es anbietet; Manöver zeigt das System selbst
final class CarPlayClusterDelegate: UIResponder, CPTemplateApplicationInstrumentClusterSceneDelegate, CPInstrumentClusterControllerDelegate {
  private var vc: CarMapViewController?

  func templateApplicationInstrumentClusterScene(_ templateApplicationInstrumentClusterScene: CPTemplateApplicationInstrumentClusterScene, didConnect instrumentClusterController: CPInstrumentClusterController) {
    instrumentClusterController.delegate = self
  }

  func templateApplicationInstrumentClusterScene(_ templateApplicationInstrumentClusterScene: CPTemplateApplicationInstrumentClusterScene, didDisconnectInstrumentClusterController instrumentClusterController: CPInstrumentClusterController) {
    if let v = vc { CarPlayBridge.shared.removeMap(v) }
    vc = nil
  }

  func instrumentClusterControllerDidConnect(_ instrumentClusterWindow: UIWindow) {
    let v = CarMapViewController()
    v.showsHint = false
    instrumentClusterWindow.overrideUserInterfaceStyle = .dark
    instrumentClusterWindow.rootViewController = v
    vc = v
    CarPlayBridge.shared.addMap(v)
  }

  func instrumentClusterControllerDidDisconnectWindow(_ instrumentClusterWindow: UIWindow) {
    if let v = vc { CarPlayBridge.shared.removeMap(v) }
    vc = nil
  }
}
