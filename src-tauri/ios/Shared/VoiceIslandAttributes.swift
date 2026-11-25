import ActivityKit

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
