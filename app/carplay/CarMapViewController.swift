import CarPlay
import MapKit
import UIKit

/// Karte auf dem Autodisplay: dunkle Apple Karte, Tour als orange Linie, eigene Position.
/// In der Führung folgt sie der Fahrtrichtung, in der Vorschau zeigt sie die ganze Tour.
/// Dunkler Rand unter der Linie, damit sie auf jeder Karte ruhig steht
final class CasingPolyline: MKPolyline {}
/// Weg zurück zur Tour nach einer Abweichung: gestrichelt wie in der App
final class RejoinPolyline: MKPolyline {}
final class RejoinCasingPolyline: MKPolyline {}

final class CarMapViewController: UIViewController, MKMapViewDelegate {
  private let map = MKMapView()
  private let hint = UILabel()
  private var line: MKPolyline?
  private var casing: CasingPolyline?
  private var rejoin: RejoinPolyline?
  private var rejoinCasing: RejoinCasingPolyline?
  private var following = false
  /// Kamera wie in der App: schräg von hinten, folgt der Position, die die App schickt
  private var followCenter: CLLocationCoordinate2D?
  private var followHeading: CLLocationDirection = 0
  private var zoomScale: Double = 1
  /// Zeit der letzten Position: die Kamera gleitet über genau diesen Abstand zur nächsten (Testfahrt 8.11.: ruckelte im Takt)
  private var lastFollowAt: CFTimeInterval = 0
  /// Flüssige Kamera wie in der App (Build 13): ein Bildtakt schiebt die Kamera zwischen zwei Positionen,
  /// statt einer MapKit Animation je Position. Von, nach, Start und Dauer der aktuellen Bewegung.
  private var link: CADisplayLink?
  private var shownCenter: CLLocationCoordinate2D?
  private var shownHeading: CLLocationDirection = 0
  private var moveFrom: CLLocationCoordinate2D?
  private var moveTo: CLLocationCoordinate2D?
  private var headFrom: CLLocationDirection = 0
  private var headTo: CLLocationDirection = 0
  private var moveStart: CFTimeInterval = 0
  private var moveDur: CFTimeInterval = 1
  private var parked = false
  /// Gefahrenes Stück der Tour ausblenden, ohne die Linie neu anzulegen: Anteil über strokeStart
  private var lineRenderer: MKPolylineRenderer?
  private var casingRenderer: MKPolylineRenderer?
  private var routeCoords: [CLLocationCoordinate2D] = []
  private var routeCum: [Double] = []
  private var routeIdx = 0

  /// Signal Orange #E2461C
  private static let signal = UIColor(red: 226 / 255, green: 70 / 255, blue: 28 / 255, alpha: 1)
  private static let routeWhite = UIColor(red: 244 / 255, green: 244 / 255, blue: 242 / 255, alpha: 1)
  private static let warn = UIColor(red: 232 / 255, green: 176 / 255, blue: 58 / 255, alpha: 1)

  override func viewDidLoad() {
    super.viewDidLoad()
    overrideUserInterfaceStyle = .dark
    view.backgroundColor = UIColor(red: 11 / 255, green: 11 / 255, blue: 12 / 255, alpha: 1)

    map.frame = view.bounds
    map.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    map.delegate = self
    // immer dunkel wie in der App, auch wenn das Auto Tag meldet (Testfahrt 7.11.: helle Karte)
    map.overrideUserInterfaceStyle = .dark
    map.tintColor = CarMapViewController.signal
    map.showsUserLocation = true
    map.showsCompass = false
    map.showsScale = false
    // ruhige Karte wie in der App: 3D Gebäude, gedämpfte Farben, keine Geschäfte und Restaurants
    // (der Filter muss in der Konfiguration stehen, sonst gilt er nicht; Testfahrt 7.11.)
    let cfg = MKStandardMapConfiguration(elevationStyle: .realistic, emphasisStyle: .muted)
    cfg.pointOfInterestFilter = .excludingAll
    map.preferredConfiguration = cfg
    map.showsBuildings = true
    view.addSubview(map)

    hint.text = "Plane eine Tour auf dem iPhone und tippe auf Losfahren."
    hint.textColor = UIColor(red: 244 / 255, green: 244 / 255, blue: 242 / 255, alpha: 1)
    hint.font = .systemFont(ofSize: 17, weight: .semibold)
    hint.numberOfLines = 0
    hint.textAlignment = .center
    hint.backgroundColor = UIColor(red: 22 / 255, green: 22 / 255, blue: 24 / 255, alpha: 0.92)
    hint.layer.cornerRadius = 14
    hint.layer.masksToBounds = true
    hint.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(hint)
    NSLayoutConstraint.activate([
      hint.centerXAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerXAnchor),
      hint.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
      hint.widthAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.widthAnchor, constant: -32),
      hint.heightAnchor.constraint(greaterThanOrEqualToConstant: 48),
    ])
    hint.isHidden = line != nil
  }

  func setRoute(_ coords: [CLLocationCoordinate2D]) {
    loadViewIfNeeded()
    if let l = line { map.removeOverlay(l) }
    if let c = casing { map.removeOverlay(c) }
    line = nil
    casing = nil
    hint.isHidden = coords.count >= 2
    guard coords.count >= 2 else { return }
    routeCoords = coords
    routeIdx = 0
    var cum: [Double] = [0]
    for i in 1..<coords.count {
      let a = CLLocation(latitude: coords[i - 1].latitude, longitude: coords[i - 1].longitude)
      let b = CLLocation(latitude: coords[i].latitude, longitude: coords[i].longitude)
      cum.append(cum[i - 1] + a.distance(from: b))
    }
    routeCum = cum
    lineRenderer = nil
    casingRenderer = nil
    let c = CasingPolyline(coordinates: coords, count: coords.count)
    let l = MKPolyline(coordinates: coords, count: coords.count)
    casing = c
    line = l
    map.addOverlay(c, level: .aboveRoads)
    map.addOverlay(l, level: .aboveRoads)
    if !following { showOverview() }
  }

  /// Rückweg zur Tour (leer: keiner)
  func setRejoin(_ coords: [CLLocationCoordinate2D]) {
    loadViewIfNeeded()
    if let r = rejoin { map.removeOverlay(r) }
    if let c = rejoinCasing { map.removeOverlay(c) }
    rejoin = nil
    rejoinCasing = nil
    guard coords.count >= 2 else { return }
    // Wie in der App: durchgezogen in Gelb mit dunkler Kontur, über der Tour
    let c = RejoinCasingPolyline(coordinates: coords, count: coords.count)
    let r = RejoinPolyline(coordinates: coords, count: coords.count)
    rejoinCasing = c
    rejoin = r
    map.addOverlay(c, level: .aboveRoads)
    map.addOverlay(r, level: .aboveRoads)
  }

  /// Position und Fahrtrichtung aus der App: Kamera schräg von hinten wie auf dem iPhone (pitch 50)
  func followCamera(_ c: CLLocationCoordinate2D, heading: CLLocationDirection) {
    followCenter = c
    followHeading = heading
    trimRoute(at: c)
    guard following else { return }
    map.setUserTrackingMode(.none, animated: false)
    let now = CACurrentMediaTime()
    let gap = lastFollowAt > 0 ? now - lastFollowAt : 0
    lastFollowAt = now
    // Neue Bewegung: von dort, wo die Kamera gerade steht, zur neuen Position, über den Abstand der Positionen
    moveFrom = shownCenter ?? c
    headFrom = shownHeading
    moveTo = c
    headTo = heading
    moveStart = now
    moveDur = min(1.6, max(0.3, gap > 0 ? gap : 1))
    if shownCenter == nil { place(c, heading: heading) }
    startLink()
  }

  private func startLink() {
    guard link == nil else { return }
    let l = CADisplayLink(target: self, selector: #selector(tick))
    l.preferredFrameRateRange = CAFrameRateRange(minimum: 20, maximum: 30, preferred: 30)
    l.add(to: .main, forMode: .common)
    link = l
  }

  private func stopLink() {
    link?.invalidate()
    link = nil
    shownCenter = nil
  }

  @objc private func tick() {
    guard following, let a = moveFrom, let b = moveTo else { return }
    // bis 25 % über die letzte Position hinaus weiter, damit die Karte bis zur nächsten nicht stehen bleibt
    let k = min(1.25, (CACurrentMediaTime() - moveStart) / moveDur)
    // am Ende der Bewegung stehen bleiben, ohne jedes Bild die Kamera neu zu setzen (Akku)
    if k >= 1.25 {
      if parked { return }
      parked = true
    } else {
      parked = false
    }
    let c = CLLocationCoordinate2D(latitude: a.latitude + (b.latitude - a.latitude) * k, longitude: a.longitude + (b.longitude - a.longitude) * k)
    var d = (headTo - headFrom).truncatingRemainder(dividingBy: 360)
    if d > 180 { d -= 360 }
    if d < -180 { d += 360 }
    place(c, heading: headFrom + d * min(1, k))
  }

  private func place(_ c: CLLocationCoordinate2D, heading: CLLocationDirection) {
    shownCenter = c
    shownHeading = heading
    map.camera = MKMapCamera(lookingAtCenter: c, fromDistance: 650 * zoomScale, pitch: 50, heading: heading)
  }

  /// Gefahrenes Stück ausblenden: nächster Punkt der Route ab dem letzten (nur vorwärts, mit etwas Spielraum)
  private func trimRoute(at c: CLLocationCoordinate2D) {
    guard routeCoords.count >= 2, let total = routeCum.last, total > 0 else { return }
    let here = CLLocation(latitude: c.latitude, longitude: c.longitude)
    var best = routeIdx
    var bestD = Double.greatestFiniteMagnitude
    let lo = max(0, routeIdx - 5)
    let hi = min(routeCoords.count - 1, routeIdx + 400)
    for i in lo...hi {
      let d = here.distance(from: CLLocation(latitude: routeCoords[i].latitude, longitude: routeCoords[i].longitude))
      if d < bestD {
        bestD = d
        best = i
      }
    }
    // weit weg von der Linie (Abweichung): nichts ändern
    guard bestD < 80 else { return }
    routeIdx = best
    let f = CGFloat(routeCum[best] / total)
    for r in [lineRenderer, casingRenderer].compactMap({ $0 }) {
      r.strokeStart = f
      r.setNeedsDisplay()
    }
  }

  /// Darstellung wie in der App: standard (dunkel), satellit, 3d
  func setStyle(_ style: String) {
    loadViewIfNeeded()
    switch style {
    case "satellit":
      let cfg = MKHybridMapConfiguration(elevationStyle: .flat)
      cfg.pointOfInterestFilter = .excludingAll
      map.preferredConfiguration = cfg
    case "3d":
      let cfg = MKHybridMapConfiguration(elevationStyle: .realistic)
      cfg.pointOfInterestFilter = .excludingAll
      map.preferredConfiguration = cfg
    default:
      let cfg = MKStandardMapConfiguration(elevationStyle: .realistic, emphasisStyle: .muted)
      cfg.pointOfInterestFilter = .excludingAll
      map.preferredConfiguration = cfg
    }
  }

  func showOverview() {
    loadViewIfNeeded()
    following = false
    map.setUserTrackingMode(.none, animated: false)
    guard let l = line else { return }
    let s = view.safeAreaInsets
    let pad = UIEdgeInsets(top: s.top + 32, left: s.left + 32, bottom: s.bottom + 32, right: s.right + 32)
    map.setVisibleMapRect(l.boundingMapRect, edgePadding: pad, animated: true)
  }

  func follow(_ on: Bool) {
    loadViewIfNeeded()
    following = on
    if !on { stopLink() }
    if on, let c = followCenter {
      followCamera(c, heading: followHeading)
    } else {
      // bis die App die erste Position schickt, folgt die Karte dem GPS
      map.setUserTrackingMode(on ? .followWithHeading : .none, animated: true)
    }
  }

  /// factor < 1 näher heran, > 1 weiter weg; in der Führung bleibt die Karte danach an der Position
  func zoom(_ factor: Double) {
    if following, followCenter != nil {
      zoomScale = min(20, max(0.3, zoomScale * factor))
      if let s = shownCenter { place(s, heading: shownHeading) }
      return
    }
    let cam = map.camera.copy() as! MKMapCamera
    cam.centerCoordinateDistance = min(3_000_000, max(250, cam.centerCoordinateDistance * factor))
    map.setCamera(cam, animated: true)
    if following {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
        guard let self, self.following else { return }
        self.map.setUserTrackingMode(.followWithHeading, animated: true)
      }
    }
  }

  func pan(_ direction: CPMapTemplate.PanDirection) {
    following = false
    stopLink()
    map.setUserTrackingMode(.none, animated: false)
    var c = map.region.center
    let span = map.region.span
    if direction.contains(.up) { c.latitude += span.latitudeDelta * 0.25 }
    if direction.contains(.down) { c.latitude -= span.latitudeDelta * 0.25 }
    if direction.contains(.left) { c.longitude -= span.longitudeDelta * 0.25 }
    if direction.contains(.right) { c.longitude += span.longitudeDelta * 0.25 }
    map.setCenter(c, animated: true)
  }

  // CarPlay schaltet bei Tag auf hell (Testfahrt 7.11., 16:43); die Karte bleibt dunkel wie in der App
  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    map.overrideUserInterfaceStyle = .dark
    view.window?.overrideUserInterfaceStyle = .dark
  }

  override func traitCollectionDidChange(_ previous: UITraitCollection?) {
    super.traitCollectionDidChange(previous)
    if traitCollection.userInterfaceStyle != .dark {
      map.overrideUserInterfaceStyle = .dark
      view.window?.overrideUserInterfaceStyle = .dark
    }
  }

  func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
    guard let p = overlay as? MKPolyline else { return MKOverlayRenderer(overlay: overlay) }
    let r = MKPolylineRenderer(polyline: p)
    if p is RejoinPolyline || p is RejoinCasingPolyline {
      // Rückweg zur Tour: gelb durchgezogen wie in der App (Colors.warn #E8B03A)
      let isCasing = p is RejoinCasingPolyline
      r.strokeColor = isCasing ? UIColor(red: 11 / 255, green: 11 / 255, blue: 12 / 255, alpha: 0.85) : CarMapViewController.warn
      r.lineWidth = isCasing ? 11 : 7
      r.lineCap = .round
      r.lineJoin = .round
      return r
    }
    // Tour weiß mit dunkler Kante wie in der App (Testfahrt 7.11.)
    let isCasing = p is CasingPolyline
    if p === line { lineRenderer = r }
    if p === casing { casingRenderer = r }
    if routeIdx > 0, let total = routeCum.last, total > 0 { r.strokeStart = CGFloat(routeCum[routeIdx] / total) }
    r.strokeColor = isCasing ? UIColor(red: 11 / 255, green: 11 / 255, blue: 12 / 255, alpha: 0.85) : CarMapViewController.routeWhite
    r.lineWidth = isCasing ? 11 : 7
    r.lineCap = .round
    r.lineJoin = .round
    return r
  }
}
