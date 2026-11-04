import AppIntents
internal import ExpoAppIntents

// Siri und Kurzbefehle für CUMO DRIVE. Jede Aktion öffnet die App und gibt den Auftrag an JavaScript
// weiter (src/live/intents.tsx). Neue Sätze brauchen einen neuen Build.

enum QuickMessage: String, AppEnum {
  case warten
  case ok
  case tanken
  case pause
  case polizei
  case panne

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Kurznachricht"
  static let caseDisplayRepresentations: [QuickMessage: DisplayRepresentation] = [
    .warten: "Bitte warten",
    .ok: "Alles ok",
    .tanken: "Tankstopp",
    .pause: "Pause",
    .polizei: "Achtung Polizei",
    .panne: "Panne, bitte halten",
  ]
}

struct StartTourIntent: AppIntent {
  static let title: LocalizedStringResource = "Tour starten"
  static let description = IntentDescription("Startet die Navigation für die zuletzt gewählte Tour.")
  static let openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    await AppIntentDispatcher.shared.dispatch(name: "startTour", params: [:])
    return .result(dialog: "CUMO DRIVE startet deine Tour.")
  }
}

struct PlanRoundIntent: AppIntent {
  static let title: LocalizedStringResource = "Schnelle Runde planen"
  static let description = IntentDescription("Öffnet den Planer für eine Runde ab deinem Standort.")
  static let openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    await AppIntentDispatcher.shared.dispatch(name: "planRound", params: [:])
    return .result(dialog: "Der Planer ist offen.")
  }
}

struct GroupMessageIntent: AppIntent {
  static let title: LocalizedStringResource = "Nachricht an die Gruppe"
  static let description = IntentDescription("Schickt eine Kurznachricht an alle in der Gruppenfahrt.")
  static let openAppWhenRun = true

  @Parameter(title: "Nachricht")
  var message: QuickMessage

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    await AppIntentDispatcher.shared.dispatch(
      name: "groupMessage",
      params: ["message": .string(message.rawValue)]
    )
    return .result(dialog: "Ist an die Gruppe raus.")
  }
}

struct CumoShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: StartTourIntent(),
      phrases: [
        "Starte meine Tour mit \(.applicationName)",
        "Tour starten mit \(.applicationName)",
      ],
      shortTitle: "Tour starten",
      systemImageName: "car"
    )
    AppShortcut(
      intent: PlanRoundIntent(),
      phrases: [
        "Plane eine Runde mit \(.applicationName)",
        "Schnelle Runde mit \(.applicationName)",
      ],
      shortTitle: "Schnelle Runde",
      systemImageName: "point.topleft.down.to.point.bottomright.curvepath"
    )
    AppShortcut(
      intent: GroupMessageIntent(),
      phrases: [
        "Sag der Gruppe \(\.$message) mit \(.applicationName)",
        "Nachricht an die Gruppe mit \(.applicationName)",
      ],
      shortTitle: "Gruppe informieren",
      systemImageName: "bubble.left"
    )
  }
}
