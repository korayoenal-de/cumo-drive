import CarPlay
import MapKit
import UIKit

/// Karte auf dem Autodisplay: dunkle Apple Karte, Tour als orange Linie, eigene Position.
/// In der Führung folgt sie der Fahrtrichtung, in der Vorschau zeigt sie die ganze Tour.
/// Dunkler Rand unter der Linie, damit sie auf jeder Karte ruhig steht
final class CasingPolyline: MKPolyline {}

final class CarMapViewController: UIViewController, MKMapViewDelegate {
  private let map = MKMapView()
  private let hint = UILabel()
  private var line: MKPolyline?
  private var casing: CasingPolyline?
  private var following = false

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
    map.pointOfInterestFilter = .excludingAll
    map.preferredConfiguration = MKStandardMapConfiguration(elevationStyle: .flat, emphasisStyle: .muted)
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
    map.setUserTrackingMode(on ? .followWithHeading : .none, animated: true)
  }

  /// factor < 1 näher heran, > 1 weiter weg; in der Führung bleibt die Karte danach an der Position
  func zoom(_ factor: Double) {
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
    let isCasing = p is CasingPolyline
    r.strokeColor = isCasing ? UIColor(red: 11 / 255, green: 11 / 255, blue: 12 / 255, alpha: 0.85) : CarMapViewController.signal
    r.lineWidth = isCasing ? 11 : 7
    r.lineCap = .round
    r.lineJoin = .round
    return r
  }
}
