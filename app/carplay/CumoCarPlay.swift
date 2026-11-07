internal import ExpoModulesCore

/// Inline Expo Modul: verbindet die Navigation in JavaScript mit CarPlay (CarPlayBridge).
/// Der Klassenname muss dem Dateinamen entsprechen.
final class CumoCarPlay: Module {
  public func definition() -> ExpoModulesCore.ModuleDefinition {
    Name("CumoCarPlay")

    Events("onConnect", "onDisconnect", "onStart", "onEnd")

    OnCreate {
      CarPlayBridge.shared.emit = { [weak self] name, body in
        self?.sendEvent(name, body)
      }
    }

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
        restSecs: num("restSecs")
      )
    }.runOnQueue(.main)

    AsyncFunction("stopGuidance") { (arrived: Bool) in
      CarPlayBridge.shared.stopGuidance(arrived: arrived)
    }.runOnQueue(.main)

    AsyncFunction("alert") { (title: String, subtitle: String) in
      CarPlayBridge.shared.alert(title: title, subtitle: subtitle)
    }.runOnQueue(.main)
  }
}
