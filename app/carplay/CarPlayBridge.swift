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

  private var tourName = ""
  private var tourCoords: [CLLocationCoordinate2D] = []
  private var tourKm: Double = 0
  private var tourMinutes: Double = 0

  var guiding: Bool { session != nil }

  // MARK: Verbindung

  func connect(_ ic: CPInterfaceController, window: CPWindow) {
    interfaceController = ic
    let vc = CarMapViewController()
    window.overrideUserInterfaceStyle = .dark
    window.rootViewController = vc
    mapVC = vc

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
    if session == nil { showPreview() }
    emit?("onConnect", [:])
  }

  func disconnect() {
    connected = false
    session = nil
    trip = nil
    maneuverKey = nil
    maneuver = nil
    panning = false
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
    mapVC?.setRoute(tourCoords)
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
    t.hideTripPreviews()
    if trip == nil { trip = makeTrip() }
    guard let trip else { return }
    session = t.startNavigationSession(for: trip)
    maneuverKey = nil
    maneuver = nil
    updateButtons()
    mapVC?.follow(true)
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
    updateButtons()
    showPreview()
  }

  /// Kurzer Hinweis über der Karte, etwa für einen Pass
  func alert(title: String, subtitle: String, image: String = "") {
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
        duration: 10
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
    mapVC?.setRejoin(coords.compactMap { $0.count >= 2 ? CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) : nil })
  }

  func camera(lat: Double, lon: Double, heading: Double) {
    mapVC?.followCamera(CLLocationCoordinate2D(latitude: lat, longitude: lon), heading: heading)
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
    t.mapButtons = panning ? [] : (session != nil ? [voice, zoomIn, zoomOut, pan] : [pan, zoomIn, zoomOut])

    if panning {
      t.leadingNavigationBarButtons = [CPBarButton(title: "Fertig") { [weak self] _ in self?.setPanning(false) }]
      t.trailingNavigationBarButtons = []
    } else {
      t.leadingNavigationBarButtons = []
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
