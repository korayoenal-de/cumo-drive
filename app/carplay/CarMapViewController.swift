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
/// Andere Teilnehmer der Gruppenfahrt (Build 14)
final class GroupAnnotation: MKPointAnnotation {
  var initial = ""
}

final class CarMapViewController: UIViewController, MKMapViewDelegate {
  private let map = MKMapView()
  private let hint = UILabel()
  private var line: MKPolyline?
  private var casing: CasingPolyline?
  private var rejoin: RejoinPolyline?
  private var rejoinCasing: RejoinCasingPolyline?
  private var following = false
  /** letzter Bildtakt, um einen angehaltenen Display Link zu bemerken */
  private var lastTick: CFTimeInterval = 0
  /** letzte Position aus der App; bleibt sie aus, folgt die Kamera dem Standort der Karte */
  private var lastAppAt: CFTimeInterval = 0
  /// Kamera wie in der App: schräg von hinten, folgt der Position, die die App schickt
  private var followCenter: CLLocationCoordinate2D?
  private var followHeading: CLLocationDirection = 0
  private var zoomScale: Double = 1
  /// Herauszoomen bei Tempo wie in der App: ab 50 km/h langsam, ab 100 km/h ganz (Koray 10.11.)
  private var speedZoom: Double = 0
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
  /// Geschwindigkeit in Grad je Sekunde und Abweichung beim letzten Punkt (Fortschreiben statt Pausen, 9.11.)
  private var vLat = 0.0
  private var vLon = 0.0
  private var errLat = 0.0
  private var errLon = 0.0
  /// Gefahrenes Stück der Tour ausblenden, ohne die Linie neu anzulegen: Anteil über strokeStart
  private var lineRenderer: MKPolylineRenderer?
  private var casingRenderer: MKPolylineRenderer?
  private var routeCoords: [CLLocationCoordinate2D] = []
  private var routeCum: [Double] = []
  private var routeIdx = 0
  /// Hinweis "Plane eine Tour" nur auf der Hauptkarte, nicht im Dashboard oder Kombiinstrument
  var showsHint = true
  private var groupPins: [String: GroupAnnotation] = [:]
  /// Tempo und Tempolimit oben links neben der Anweisung (Koray 15.11., vorher unten), nur auf der Hauptkarte
  var showsSpeed = false
  private let speedView = CarSpeedView()

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
    hint.isHidden = line != nil || !showsHint

    speedView.translatesAutoresizingMaskIntoConstraints = false
    speedView.isHidden = true
    view.addSubview(speedView)
    NSLayoutConstraint.activate([
      speedView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 10),
      // oben bündig mit der Anweisung von CarPlay (Koray 15.11.: stand 8 pt tiefer)
      speedView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 2),
    ])
  }

  /// Tempo (nil: ausblenden), Limit (nil: ohne Schild), geschätzt: graues Schild ohne roten Ring
  func setSpeed(kmh: Double?, limit: Int?, estimated: Bool, showSpeed: Bool) {
    loadViewIfNeeded()
    guard showsSpeed, let kmh else { speedView.isHidden = true; return }
    speedView.update(kmh: kmh, limit: limit, estimated: estimated, showSpeed: showSpeed)
    speedView.isHidden = !showSpeed && limit == nil
  }

  /// Build 16: Hinweis ohne Tour, wenn das Autodisplay selbst Touren und Runden anbietet
  func setHint(_ text: String) {
    loadViewIfNeeded()
    hint.text = text
  }

  /// Teilnehmer: id, name, lat, lon; vorhandene Marker gleiten an die neue Stelle
  func setGroup(_ list: [[String: Any]]) {
    loadViewIfNeeded()
    var seen = Set<String>()
    for m in list {
      guard let id = m["id"] as? String,
            let lat = (m["lat"] as? NSNumber)?.doubleValue,
            let lon = (m["lon"] as? NSNumber)?.doubleValue else { continue }
      seen.insert(id)
      let c = CLLocationCoordinate2D(latitude: lat, longitude: lon)
      if let a = groupPins[id] {
        // gleichmäßig und aus der laufenden Bewegung heraus, sonst fährt der Punkt in Schüben (12.11.)
        UIView.animate(withDuration: 1.0, delay: 0, options: [.curveLinear, .beginFromCurrentState, .allowUserInteraction], animations: { a.coordinate = c })
      } else {
        let a = GroupAnnotation()
        a.coordinate = c
        let name = m["name"] as? String ?? ""
        a.title = name
        a.initial = String(name.prefix(1)).uppercased()
        groupPins[id] = a
        map.addAnnotation(a)
      }
    }
    for (id, a) in groupPins where !seen.contains(id) {
      map.removeAnnotation(a)
      groupPins[id] = nil
    }
  }

  /// Eigener Standort Pin statt des dunkelroten Systempunkts (Koray 10.11.: wirkte billig): weiße Scheibe mit
  /// hellem orangem Ring und Pfeil in Fahrtrichtung, wie der Fallback ohne Auto in der App (route-map.tsx, styles.me).
  private static let pinOrange = UIColor(red: 255 / 255, green: 122 / 255, blue: 77 / 255, alpha: 1)
  private static let mePin: UIImage = {
    let size: CGFloat = 38
    let r = UIGraphicsImageRenderer(size: CGSize(width: size, height: size))
    return r.image { ctx in
      let c = ctx.cgContext
      let disc = CGRect(x: 3, y: 3, width: size - 6, height: size - 6)
      c.setShadow(offset: CGSize(width: 0, height: 1), blur: 3, color: UIColor(white: 0, alpha: 0.5).cgColor)
      c.setFillColor(UIColor(red: 244 / 255, green: 244 / 255, blue: 242 / 255, alpha: 1).cgColor)
      c.fillEllipse(in: disc)
      c.setShadow(offset: .zero, blur: 0, color: nil)
      c.setStrokeColor(pinOrange.cgColor)
      c.setLineWidth(3)
      c.strokeEllipse(in: disc.insetBy(dx: 1.5, dy: 1.5))
      // Pfeil nach oben, die Drehung kommt über die Fahrtrichtung
      let mid = size / 2
      c.setFillColor(pinOrange.cgColor)
      c.move(to: CGPoint(x: mid, y: mid - 9))
      c.addLine(to: CGPoint(x: mid + 7, y: mid + 7))
      c.addLine(to: CGPoint(x: mid, y: mid + 3))
      c.addLine(to: CGPoint(x: mid - 7, y: mid + 7))
      c.closePath()
      c.fillPath()
    }
  }()
  private var meView: MKAnnotationView?
  private var meImage: UIImage = CarMapViewController.mePin
  /// Auto an der Stelle, die die App meldet (auf der Linie eingerastet), genau in der Mitte der Kamera
  /// (Koray 12.11.: der Standort des iPhones lag neben der Spur und das Auto stand schief)
  private let car = CarAnnotation()
  private var carView: MKAnnotationView?
  private var carShown = false

  /// App Positionen frisch: eigenes Auto zeigen, sonst den Standort des iPhones
  private func showCar(_ on: Bool) {
    guard on != carShown else { return }
    carShown = on
    if on { map.addAnnotation(car) } else { map.removeAnnotation(car) }
    meView?.alpha = on ? 0 : 1
  }

  /// Lack als Hex (#RRGGBB) in eine Farbe
  private static func color(hex: String) -> UIColor? {
    var h = hex.trimmingCharacters(in: .whitespaces)
    if h.hasPrefix("#") { h.removeFirst() }
    guard h.count == 6, let v = UInt32(h, radix: 16) else { return nil }
    return UIColor(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
  }

  /// Eigenes Auto als Standort (Draufsicht aus der Garage, Front oben): Lackmaske gefärbt, Details darüber.
  /// Bilder car-<form>-m und car-<form>-o kommen aus assets/carplay-icons (Ansicht 0 der Bögen in assets/cars).
  func setCar(form: String, color: String) {
    var img = CarMapViewController.mePin
    if !form.isEmpty, let mask = UIImage(named: "car-\(form)-m"), let over = UIImage(named: "car-\(form)-o"),
       let paint = CarMapViewController.color(hex: color) {
      let size = CGSize(width: 48, height: 48)
      img = UIGraphicsImageRenderer(size: size).image { ctx in
        let rect = CGRect(origin: .zero, size: size)
        // wie tintColor in der App: Form der Maske behalten, Farbe ersetzen
        mask.draw(in: rect)
        ctx.cgContext.setBlendMode(.sourceAtop)
        ctx.cgContext.setFillColor(paint.cgColor)
        ctx.cgContext.fill(rect)
        ctx.cgContext.setBlendMode(.normal)
        over.draw(in: rect)
      }
    }
    meImage = img
    meView?.image = img
    carView?.image = img
  }

  func mapView(_ mapView: MKMapView, didUpdate userLocation: MKUserLocation) {
    // Kommen aus der App keine Positionen mehr (iPhone gesperrt, JavaScript schläft), folgt die Kamera dem eigenen
    // Standort der Karte, damit das Auto nicht aus dem Bild fährt (Tester Tom 11.11.)
    if following, let loc = userLocation.location, loc.course >= 0, loc.speed > 2, CACurrentMediaTime() - lastAppAt > 1.5 {
      followCamera(loc.coordinate, heading: loc.course, fromApp: false)
    }
    // App liefert keine Positionen mehr: wieder der Standort des iPhones
    if carShown, CACurrentMediaTime() - lastAppAt > 3 { showCar(false) }
    guard !carShown, let v = meView, let loc = userLocation.location, loc.course >= 0 else { return }
    let angle = (loc.course - mapView.camera.heading) * .pi / 180
    UIView.animate(withDuration: 0.3) { v.transform = CGAffineTransform(rotationAngle: CGFloat(angle)) }
  }

  func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
    if annotation is CarAnnotation {
      let v = mapView.dequeueReusableAnnotationView(withIdentifier: "auto") ?? MKAnnotationView(annotation: annotation, reuseIdentifier: "auto")
      v.annotation = annotation
      v.image = meImage
      v.canShowCallout = false
      v.displayPriority = .required
      v.zPriority = .max
      carView = v
      return v
    }
    if annotation is MKUserLocation {
      let v = mapView.dequeueReusableAnnotationView(withIdentifier: "ich") ?? MKAnnotationView(annotation: annotation, reuseIdentifier: "ich")
      v.annotation = annotation
      v.image = meImage
      v.canShowCallout = false
      v.displayPriority = .required
      v.zPriority = .max
      v.alpha = carShown ? 0 : 1
      meView = v
      return v
    }
    guard let g = annotation as? GroupAnnotation else { return nil }
    let v = (mapView.dequeueReusableAnnotationView(withIdentifier: "gruppe") as? MKMarkerAnnotationView)
      ?? MKMarkerAnnotationView(annotation: g, reuseIdentifier: "gruppe")
    v.annotation = g
    v.markerTintColor = CarMapViewController.signal
    v.glyphText = g.initial
    v.titleVisibility = .visible
    v.displayPriority = .required
    return v
  }

  func setRoute(_ coords: [CLLocationCoordinate2D]) {
    loadViewIfNeeded()
    if let l = line { map.removeOverlay(l) }
    if let c = casing { map.removeOverlay(c) }
    line = nil
    casing = nil
    hint.isHidden = coords.count >= 2 || !showsHint
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
    map.addOverlay(c, level: .aboveLabels)
    map.addOverlay(l, level: .aboveLabels)
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
    map.addOverlay(c, level: .aboveLabels)
    map.addOverlay(r, level: .aboveLabels)
  }

  /// Position und Fahrtrichtung aus der App: Kamera schräg von hinten wie auf dem iPhone (pitch 50)
  func followCamera(_ c: CLLocationCoordinate2D, heading: CLLocationDirection, fromApp: Bool = true) {
    if fromApp { lastAppAt = CACurrentMediaTime() }
    followCenter = c
    followHeading = heading
    trimRoute(at: c)
    guard following else { return }
    map.setUserTrackingMode(.none, animated: false)
    let now = CACurrentMediaTime()
    let gap = lastFollowAt > 0 ? now - lastFollowAt : 0
    // doppelte oder dicht folgende Positionen verfälschen die Geschwindigkeit (Zoom pulsierte, Tester Tom 11.11.)
    if let last = moveTo, gap < 0.3 || (last.latitude == c.latitude && last.longitude == c.longitude) {
      headTo = heading
      return
    }
    lastFollowAt = now
    // Fortschreiben mit Geschwindigkeit: letzte Position plus Geschwindigkeit mal Zeit, der Sprung zur neuen
    // Position klingt in 0,5 s aus. Vorher endete die Bewegung vor der nächsten Position und die Karte stand kurz.
    if let last = moveTo, gap > 0.05, gap < 4 {
      let nLat = (c.latitude - last.latitude) / gap
      let nLon = (c.longitude - last.longitude) / gap
      vLat = vLat * 0.35 + nLat * 0.65
      vLon = vLon * 0.35 + nLon * 0.65
    } else {
      vLat = 0
      vLon = 0
    }
    if let s = shownCenter, gap < 4 {
      errLat = s.latitude - c.latitude
      errLon = s.longitude - c.longitude
    } else {
      errLat = 0
      errLon = 0
    }
    moveFrom = c
    headFrom = shownHeading
    moveTo = c
    headTo = heading
    moveStart = now
    moveDur = 0.6
    parked = false
    // Kommt kein Bildtakt (Display Link angehalten), wenigstens bei jeder Position nachführen
    if shownCenter == nil || (link != nil && now - lastTick > 0.6) { place(c, heading: heading) }
    startLink()
  }

  private func startLink() {
    guard link == nil else { return }
    // Bildtakt des Auto Displays, nicht des iPhones: der iPhone Takt steht still, sobald dessen Bildschirm aus ist,
    // dann blieb die Karte stehen und das Auto fuhr aus dem Bild (Tester Tom 11.11.)
    let l = view.window?.screen.displayLink(withTarget: self, selector: #selector(tick)) ?? CADisplayLink(target: self, selector: #selector(tick))
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
    lastTick = CACurrentMediaTime()
    guard following, let a = moveTo else { return }
    let dt = CACurrentMediaTime() - moveStart
    // höchstens 2,5 s fortschreiben (GPS weg), danach stehen bleiben, ohne die Kamera neu zu setzen (Akku)
    if dt > 3.2 {
      if parked { return }
      parked = true
    }
    let run = min(dt, 2.5)
    let fade = exp(-dt / 0.18)
    let c = CLLocationCoordinate2D(latitude: a.latitude + vLat * run + errLat * fade, longitude: a.longitude + vLon * run + errLon * fade)
    let k = dt / moveDur
    var d = (headTo - headFrom).truncatingRemainder(dividingBy: 360)
    if d > 180 { d -= 360 }
    if d < -180 { d += 360 }
    place(c, heading: headFrom + d * min(1, k))
  }

  private func place(_ c: CLLocationCoordinate2D, heading: CLLocationDirection) {
    shownCenter = c
    shownHeading = heading
    let kmh = hypot(vLat * 111_320, vLon * 111_320 * cos(c.latitude * .pi / 180)) * 3.6
    let t = max(0, min(1, (kmh - 50) / 50))
    // langsam folgen (etwa 8 s), damit schwankendes Tempo nicht pulsiert
    speedZoom += (t - speedZoom) * 0.012
    map.camera = MKMapCamera(lookingAtCenter: c, fromDistance: 650 * zoomScale * (1 + speedZoom * 1.2), pitch: 50, heading: heading)
    // Auto in der Mitte, gedreht in die Richtung der Straße relativ zur Kamera
    if CACurrentMediaTime() - lastAppAt < 3 {
      showCar(true)
      car.coordinate = c
      var d = (headTo - heading).truncatingRemainder(dividingBy: 360)
      if d > 180 { d -= 360 }
      if d < -180 { d += 360 }
      // Winkel der Straße, wie sie auf dem Bildschirm liegt: Die Karte ist geneigt, und das Auto steht wegen der
      // Ränder des Displays nicht genau in der Bildmitte. Eine gerade Straße läuft dort schräg auf den Fluchtpunkt
      // zu, das aufrechte Auto stand deshalb leicht schief zur Spur (Koray 12.11., B 460 bei Lorsch).
      let angle = screenAngle(at: c, heading: headTo) ?? CGFloat(d * .pi / 180)
      carView?.transform = CGAffineTransform(rotationAngle: angle)
    }
  }

  /// Richtung auf dem Bildschirm (0 zeigt nach oben, im Uhrzeigersinn), in die ein Punkt 40 m voraus liegt
  private func screenAngle(at c: CLLocationCoordinate2D, heading: CLLocationDirection) -> CGFloat? {
    let r = heading * .pi / 180
    let m = 40.0
    let ahead = CLLocationCoordinate2D(
      latitude: c.latitude + m * cos(r) / 111_320,
      longitude: c.longitude + m * sin(r) / (111_320 * cos(c.latitude * .pi / 180))
    )
    let a = map.convert(c, toPointTo: map)
    let b = map.convert(ahead, toPointTo: map)
    let dx = b.x - a.x
    let dy = b.y - a.y
    guard dx.isFinite, dy.isFinite, hypot(dx, dy) > 2 else { return nil }
    return atan2(dx, -dy)
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
    // Genau an der Stelle des Autos abschneiden, nicht am nächsten Stützpunkt (Matthias 15.11.: "weiße Linie
    // bleibt"): auf langen geraden Stücken liegen die Punkte weit auseinander, die Linie blieb hinter dem Auto
    // stehen, bis der nächste Punkt erreicht war. Darum auf das Stück davor oder danach projizieren.
    var along = routeCum[best]
    let kLon = 111_320 * cos(c.latitude * .pi / 180)
    func project(_ i: Int) -> (Double, Double)? {
      guard i >= 0, i + 1 < routeCoords.count else { return nil }
      let a = routeCoords[i], b = routeCoords[i + 1]
      let bx = (b.longitude - a.longitude) * kLon, by = (b.latitude - a.latitude) * 111_320
      let px = (c.longitude - a.longitude) * kLon, py = (c.latitude - a.latitude) * 111_320
      let len2 = bx * bx + by * by
      guard len2 > 0 else { return nil }
      let t = max(0, min(1, (px * bx + py * by) / len2))
      let dx = px - t * bx, dy = py - t * by
      return (routeCum[i] + t * (routeCum[i + 1] - routeCum[i]), dx * dx + dy * dy)
    }
    let cands = [project(best), project(best - 1)].compactMap { $0 }
    if let p = cands.min(by: { $0.1 < $1.1 }) { along = p.0 }
    let f = CGFloat(along / total)
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

/// Eigenes Auto auf dem Autodisplay (Position aus der App)
final class CarAnnotation: MKPointAnnotation {}

/// Tempo Plakette wie in der App (speed-badge.tsx): dunkle Pille, Tempo groß mit km/h, rechts das Schild.
/// Zu schnell tönt nur die Fläche (warn), ohne Ton und ohne Wertung. Mindestens 44 pt hoch.
final class CarSpeedView: UIView {
  private let value = UILabel()
  private let unit = UILabel()
  private let sign = UILabel()
  private let stack = UIStackView()
  private let speedCol = UIStackView()
  private static let rest = UIColor(red: 22 / 255, green: 22 / 255, blue: 24 / 255, alpha: 0.94)
  private static let warnBg = UIColor(red: 58 / 255, green: 44 / 255, blue: 15 / 255, alpha: 0.96)
  private static let red = UIColor(red: 200 / 255, green: 30 / 255, blue: 30 / 255, alpha: 1)
  private static let text = UIColor(red: 244 / 255, green: 244 / 255, blue: 242 / 255, alpha: 1)
  private static let muted = UIColor(red: 154 / 255, green: 154 / 255, blue: 159 / 255, alpha: 1)
  private let signSize: CGFloat = 44
  /// rechts so viel Rand wie links, wenn kein Schild da ist (sonst steht das Tempo schief, Koray 15.11.)
  private var trailingPad: NSLayoutConstraint!
  private var leadingPad: NSLayoutConstraint!

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = CarSpeedView.rest
    // gleiche Rundung wie die Flächen von CarPlay (Anweisung, Ankunft), nicht ganz rund (Koray 15.11.)
    layer.cornerRadius = 12
    layer.masksToBounds = true
    value.font = .monospacedDigitSystemFont(ofSize: 24, weight: .heavy)
    value.textColor = CarSpeedView.text
    value.textAlignment = .center
    unit.text = "km/h"
    unit.font = .systemFont(ofSize: 11, weight: .semibold)
    unit.textColor = CarSpeedView.muted
    unit.textAlignment = .center
    speedCol.axis = .vertical
    speedCol.alignment = .center
    speedCol.spacing = -2
    speedCol.addArrangedSubview(value)
    speedCol.addArrangedSubview(unit)
    sign.font = .monospacedDigitSystemFont(ofSize: 17, weight: .heavy)
    sign.textAlignment = .center
    // dreistellig (100, 120) passt sonst nicht in den roten Ring (Koray 15.11.)
    sign.adjustsFontSizeToFitWidth = true
    sign.minimumScaleFactor = 0.6
    sign.layer.cornerRadius = signSize / 2
    sign.layer.masksToBounds = true
    sign.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      sign.widthAnchor.constraint(equalToConstant: signSize),
      sign.heightAnchor.constraint(equalToConstant: signSize),
      speedCol.widthAnchor.constraint(greaterThanOrEqualToConstant: 44),
    ])
    stack.axis = .horizontal
    stack.alignment = .center
    stack.spacing = 8
    stack.addArrangedSubview(speedCol)
    stack.addArrangedSubview(sign)
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    trailingPad = stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -6)
    leadingPad = stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12)
    NSLayoutConstraint.activate([
      leadingPad,
      trailingPad,
      stack.topAnchor.constraint(equalTo: topAnchor, constant: 6),
      stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -6),
    ])
    isAccessibilityElement = true
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  func update(kmh: Double, limit: Int?, estimated: Bool, showSpeed: Bool) {
    let v = Int(max(0, kmh).rounded())
    value.text = "\(v)"
    speedCol.isHidden = !showSpeed
    if let limit {
      sign.isHidden = false
      sign.text = "\(limit)"
      sign.font = .monospacedDigitSystemFont(ofSize: limit >= 100 ? 14 : 17, weight: .heavy)
      if estimated {
        sign.backgroundColor = UIColor(white: 0.32, alpha: 1)
        sign.textColor = CarSpeedView.text
        sign.layer.borderWidth = 0
      } else {
        sign.backgroundColor = .white
        sign.textColor = .black
        sign.layer.borderWidth = 4.5
        sign.layer.borderColor = CarSpeedView.red.cgColor
      }
    } else {
      sign.isHidden = true
    }
    // nur Tempo: rundum 12, nur Schild: rundum 6, beides: links 12 rechts 6
    trailingPad.constant = sign.isHidden ? -12 : -6
    leadingPad.constant = speedCol.isHidden ? 6 : 12
    let over = showSpeed && !estimated && limit != nil && v > (limit ?? 0) + 4
    backgroundColor = over ? CarSpeedView.warnBg : CarSpeedView.rest
    accessibilityLabel = [showSpeed ? "\(v) km/h" : nil, limit.map { "Limit \($0)" }].compactMap { $0 }.joined(separator: ", ")
  }
}
