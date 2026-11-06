internal import ExpoModulesCore
import CoreLocation
import WeatherKit

/// Inline Expo Modul: Wetter an Pässen über Apple WeatherKit (Entitlement com.apple.developer.weatherkit).
/// forecast bekommt je Punkt Breite, Länge, Höhe und Zeitpunkt (Sekunden seit 1970) und liefert die
/// Stundenvorhersage, die diesem Zeitpunkt am nächsten liegt. Der Klassenname muss dem Dateinamen entsprechen.
final class CumoWeather: Module {
  public func definition() -> ExpoModulesCore.ModuleDefinition {
    Name("CumoWeather")

    // points: [[lat, lon, höhe in m, zeitpunkt in s]]
    AsyncFunction("forecast") { (points: [[Double]]) async -> [[String: Any]] in
      var out: [[String: Any]] = []
      for p in points where p.count >= 4 {
        let loc = CLLocation(
          coordinate: CLLocationCoordinate2D(latitude: p[0], longitude: p[1]),
          altitude: p[2], horizontalAccuracy: 50, verticalAccuracy: 50, timestamp: Date()
        )
        let at = Date(timeIntervalSince1970: p[3])
        do {
          let hours = try await WeatherService.shared.weather(
            for: loc, including: .hourly(startDate: at.addingTimeInterval(-3600), endDate: at.addingTimeInterval(3 * 3600))
          )
          guard let h = hours.forecast.min(by: { abs($0.date.timeIntervalSince(at)) < abs($1.date.timeIntervalSince(at)) }) else {
            out.append(["ok": false])
            continue
          }
          out.append([
            "ok": true,
            "time": h.date.timeIntervalSince1970,
            "temp": h.temperature.converted(to: .celsius).value,
            "feels": h.apparentTemperature.converted(to: .celsius).value,
            "precipChance": h.precipitationChance,
            "precipMm": h.precipitationAmount.converted(to: .millimeters).value,
            "wind": h.wind.speed.converted(to: .kilometersPerHour).value,
            "gust": h.wind.gust?.converted(to: .kilometersPerHour).value ?? 0,
            "symbol": h.symbolName,
            "condition": h.condition.description,
            "snow": h.precipitation == .snow || h.precipitation == .sleet || h.precipitation == .mixed,
          ])
        } catch {
          out.append(["ok": false, "error": error.localizedDescription])
        }
      }
      return out
    }

    // Pflichtangabe von Apple: Logo und Link zu den Datenquellen
    AsyncFunction("attribution") { () async -> [String: Any] in
      do {
        let a = try await WeatherService.shared.attribution
        return [
          "legalUrl": a.legalPageURL.absoluteString,
          "markDark": a.combinedMarkDarkURL.absoluteString,
          "markLight": a.combinedMarkLightURL.absoluteString,
          "name": a.serviceName,
        ]
      } catch {
        return ["legalUrl": "https://weatherkit.apple.com/legal-attribution.html", "name": "Apple Wetter"]
      }
    }
  }
}
