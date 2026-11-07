import CarPlay
import MapKit
import UIKit

/// Karte auf dem Autodisplay: dunkle Apple Karte, Tour als orange Linie, eigene Position.
/// In der Führung folgt sie der Fahrtrichtung, in der Vorschau zeigt sie die ganze Tour.
/// Dunkler Rand unter der Linie, damit sie auf jeder Karte ruhig steht
final class CasingPolyline: MKPolyline {}
/// Weg zurück zur Tour nach einer Abweichung: gestrichelt wie in der App
final class RejoinPolyline: MKPolyline {}

final class CarMapViewController: UIViewController, MKMapViewDelegate {
  private let map = MKMapView()
  private let hint = UILabel()
  private var line: MKPolyline?
  private var casing: CasingPolyline?
  private var rejoin: RejoinPolyline?
  private var following = false
  /// Kamera wie in der App: schräg von hinten, folgt der Position, die die App schickt
  private var followCenter: CLLocationCoordinate2D?
  private var followHeading: CLLocationDirection = 0
  private var zoomScale: Double = 1

  /// Signal Orange #E2461C
  private static let signal = UIColor(red: 226 / 255, green: 70 / 255, blue: 28 / 255, alpha: 1)

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
    rejoin = nil
    guard coords.count >= 2 else { return }
    let r = RejoinPolyline(coordinates: coords, count: coords.count)
    rejoin = r
    map.addOverlay(r, level: .aboveRoads)
  }

  /// Position und Fahrtrichtung aus der App: Kamera schräg von hinten wie auf dem iPhone (pitch 50)
  func followCamera(_ c: CLLocationCoordinate2D, heading: CLLocationDirection) {
    followCenter = c
    followHeading = heading
    guard following else { return }
    map.setUserTrackingMode(.none, animated: false)
    let cam = MKMapCamera(lookingAtCenter: c, fromDistance: 650 * zoomScale, pitch: 50, heading: heading)
    map.setCamera(cam, animated: true)
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
    if on, let c = followCenter {
      followCamera(c, heading: followHeading)
    } else {
      // bis die App die erste Position schickt, folgt die Karte dem GPS
      map.setUserTrackingMode(on ? .followWithHeading : .none, animated: true)
    }
  }

  /// factor < 1 näher heran, > 1 weiter weg; in der Führung bleibt die Karte danach an der Position
  func zoom(_ factor: Double) {
    if following, let c = followCenter {
      zoomScale = min(20, max(0.3, zoomScale * factor))
      followCamera(c, heading: followHeading)
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
    map.setUserTrackingMode(.none, animated: false)
    var c = map.region.center
    let span = map.region.span
    if direction.contains(.up) { c.latitude += span.latitudeDelta * 0.25 }
    if direction.contains(.down) { c.latitude -= span.latitudeDelta * 0.25 }
    if direction.contains(.left) { c.longitude -= span.longitudeDelta * 0.25 }
    if direction.contains(.right) { c.longitude += span.longitudeDelta * 0.25 }
    map.setCenter(c, animated: true)
  }

  func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
    guard let p = overlay as? MKPolyline else { return MKOverlayRenderer(overlay: overlay) }
    let r = MKPolylineRenderer(polyline: p)
    if p is RejoinPolyline {
      r.strokeColor = CarMapViewController.signal
      r.lineWidth = 6
      r.lineDashPattern = [1, 12]
      r.lineCap = .round
      return r
    }
    let isCasing = p is CasingPolyline
    r.strokeColor = isCasing ? UIColor(red: 11 / 255, green: 11 / 255, blue: 12 / 255, alpha: 0.85) : CarMapViewController.signal
    r.lineWidth = isCasing ? 11 : 7
    r.lineCap = .round
    r.lineJoin = .round
    return r
  }
}
