import ActivityKit
import Foundation
import UIKit
import WebKit

/// Chamado pelo Rust (comando `voice_island`) via runtime ObjC — sem símbolo
/// extern, então o cdylib do Rust linka sem depender deste arquivo.
///
/// A Live Activity começa junto com o modo voz; o iOS só a mostra na Dynamic
/// Island quando o app sai da tela (com o app aberto, a pílula do próprio app
/// faz esse papel).
@objc(ThribusVoiceIsland)
public final class ThribusVoiceIsland: NSObject {
  private static var micObserver: NSObjectProtocol?

  @objc(apply:phase:label:agent:)
  public static func apply(_ action: NSString, phase: NSString, label: NSString, agent: NSString) {
    guard #available(iOS 16.2, *) else { return }
    let act = action as String
    let state = VoiceIslandAttributes.ContentState(phase: phase as String, label: label as String)
    let agentName = agent as String
    Task { @MainActor in
      observeMicToggle()
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

  /// Botão de mic da ilha → modo voz na WebView (o TalkPage expõe
  /// `window.__thribusVoice.toggleMute` enquanto a voz está ligada).
  @MainActor
  private static func observeMicToggle() {
    guard micObserver == nil else { return }
    micObserver = NotificationCenter.default.addObserver(forName: .thribusToggleVoiceMic, object: nil, queue: .main) { _ in
      MainActor.assumeIsolated {
        findWebView()?.evaluateJavaScript("window.__thribusVoice && window.__thribusVoice.toggleMute()", completionHandler: nil)
      }
    }
  }

  @MainActor
  private static func findWebView() -> WKWebView? {
    func search(_ v: UIView) -> WKWebView? {
      if let w = v as? WKWebView { return w }
      for s in v.subviews { if let w = search(s) { return w } }
      return nil
    }
    for scene in UIApplication.shared.connectedScenes {
      guard let ws = scene as? UIWindowScene else { continue }
      for win in ws.windows { if let w = search(win) { return w } }
    }
    return nil
  }

  @available(iOS 16.2, *)
  private static func endAll() async {
    for a in Activity<VoiceIslandAttributes>.activities {
      await a.end(nil, dismissalPolicy: .immediate)
    }
  }
}
