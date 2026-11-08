internal import ExpoModulesCore

/// Inline Expo Modul: verbindet die Navigation in JavaScript mit CarPlay (CarPlayBridge).
/// Der Klassenname muss dem Dateinamen entsprechen.
final class CumoCarPlay: Module {
  public func definition() -> ExpoModulesCore.ModuleDefinition {
    Name("CumoCarPlay")

    Events("onConnect", "onDisconnect", "onStart", "onEnd", "onVoice")

    OnCreate {
      CarPlayBridge.shared.emit = { [weak self] name, body in
        self?.sendEvent(name, body)
      }
    }

    // ab Build 13: die Karte im Auto blendet das gefahrene Stück selbst aus und gleitet im Bildtakt
    Constant("trimsRoute") { true }

    AsyncFunction("isConnected") { () -> Bool in
      CarPlayBridge.shared.connected
    }.runOnQueue(.main)

    AsyncFunction("setTour") { (name: String, coords: [[Double]], km: Double, minutes: Double) in
      CarPlayBridge.shared.setTour(name: name, coords: coords, km: km, minutes: minutes)
    }.runOnQueue(.main)

    AsyncFunction("clearTour") {
      CarPlayBridge.shared.clearTour()
    }.runOnQueue(.main)

    AsyncFunction("startGuidance") {
      CarPlayBridge.shared.startGuidance()
    }.runOnQueue(.main)

    // ein Objekt statt vieler Argumente: key, text, symbol, distM, secs, restKm, restSecs
    AsyncFunction("update") { (p: [String: Any]) in
      let num = { (k: String) -> Double in (p[k] as? NSNumber)?.doubleValue ?? 0 }
      CarPlayBridge.shared.update(
        key: p["key"] as? String ?? "",
        text: p["text"] as? String ?? "",
        symbol: p["symbol"] as? String ?? "arrow.up",
        icon: p["icon"] as? String ?? "",
        distM: num("distM"),
        secs: num("secs"),
        restKm: num("restKm"),
        restSecs: num("restSecs"),
        thenText: p["thenText"] as? String ?? "",
        thenSymbol: p["thenSymbol"] as? String ?? "",
        thenIcon: p["thenIcon"] as? String ?? ""
      )
    }.runOnQueue(.main)

    AsyncFunction("stopGuidance") { (arrived: Bool) in
      CarPlayBridge.shared.stopGuidance(arrived: arrived)
    }.runOnQueue(.main)

    AsyncFunction("alert") { (title: String, subtitle: String) in
      CarPlayBridge.shared.alert(title: title, subtitle: subtitle)
    }.runOnQueue(.main)

    // ab Build 10: Hinweis mit Bild (Logo als Pegel), Rückweg gestrichelt, Kamera wie in der App, Ton Knopf
    AsyncFunction("alertImage") { (title: String, subtitle: String, image: String) in
      CarPlayBridge.shared.alert(title: title, subtitle: subtitle, image: image)
    }.runOnQueue(.main)

    AsyncFunction("setRejoin") { (coords: [[Double]]) in
      CarPlayBridge.shared.setRejoin(coords)
    }.runOnQueue(.main)

    AsyncFunction("camera") { (lat: Double, lon: Double, heading: Double) in
      CarPlayBridge.shared.camera(lat: lat, lon: lon, heading: heading)
    }.runOnQueue(.main)

    // ab Build 11: Kartendarstellung aus den Karteneinstellungen der App
    AsyncFunction("setMapStyle") { (style: String) in
      CarPlayBridge.shared.setMapStyle(style)
    }.runOnQueue(.main)

    AsyncFunction("setVoice") { (on: Bool) in
      CarPlayBridge.shared.setVoice(on)
    }.runOnQueue(.main)
  }
}
