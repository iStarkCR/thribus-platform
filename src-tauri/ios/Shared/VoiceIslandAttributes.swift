import ActivityKit
import AppIntents
import Foundation

/// Live Activity do modo voz — compartilhada entre o app e a extensão da ilha.
@available(iOS 16.1, *)
struct VoiceIslandAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    /// listening | talking | thinking | speaking | muted
    var phase: String
    /// Texto curto mostrado na ilha ("Ouvindo", "Respondendo"…)
    var label: String
  }

  var agentName: String
}

extension Notification.Name {
  static let thribusToggleVoiceMic = Notification.Name("ThribusToggleVoiceMic")
}

/// Botão de mic na ilha expandida. LiveActivityIntent roda no processo do APP
/// (não na extensão), então o aviso chega no ThribusVoiceIsland, que repassa
/// pro modo voz na WebView.
@available(iOS 17.0, *)
struct ToggleVoiceMicIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Pausar ou ligar o microfone"
  static var openAppWhenRun: Bool = false

  init() {}

  func perform() async throws -> some IntentResult {
    await MainActor.run { NotificationCenter.default.post(name: .thribusToggleVoiceMic, object: nil) }
    return .result()
  }
}
