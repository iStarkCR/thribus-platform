import ActivityKit
import Foundation

/// Chamado pelo Rust (comando `voice_island`) via runtime ObjC — sem símbolo
/// extern, então o cdylib do Rust linka sem depender deste arquivo.
///
/// A Live Activity começa junto com o modo voz; o iOS só a mostra na Dynamic
/// Island quando o app sai da tela (com o app aberto, a pílula do próprio app
/// faz esse papel).
@objc(ThribusVoiceIsland)
public final class ThribusVoiceIsland: NSObject {
  @objc(apply:phase:label:agent:)
  public static func apply(_ action: NSString, phase: NSString, label: NSString, agent: NSString) {
    guard #available(iOS 16.2, *) else { return }
    let act = action as String
    let state = VoiceIslandAttributes.ContentState(phase: phase as String, label: label as String)
    let agentName = agent as String
    Task { @MainActor in
      switch act {
      case "start":
        await endAll()
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        _ = try? Activity.request(
          attributes: VoiceIslandAttributes(agentName: agentName),
          content: ActivityContent(state: state, staleDate: nil),
          pushType: nil
        )
      case "update":
        for a in Activity<VoiceIslandAttributes>.activities {
          await a.update(ActivityContent(state: state, staleDate: nil))
        }
      default:
        await endAll()
      }
    }
  }

  @available(iOS 16.2, *)
  private static func endAll() async {
    for a in Activity<VoiceIslandAttributes>.activities {
      await a.end(nil, dismissalPolicy: .immediate)
    }
  }
}
