import ActivityKit
import SwiftUI
import WidgetKit

@main
struct VoiceIslandBundle: WidgetBundle {
  var body: some Widget {
    VoiceIslandLiveActivity()
  }
}

private let surface = Color(red: 11 / 255, green: 12 / 255, blue: 14 / 255)

/// Mesmas cores da pílula/esfera do app: verde ouvindo, âmbar pensando, azul falando.
private func phaseColor(_ phase: String) -> Color {
  switch phase {
  case "thinking": return Color(red: 244 / 255, green: 194 / 255, blue: 103 / 255)
  case "speaking": return Color(red: 127 / 255, green: 176 / 255, blue: 245 / 255)
  case "muted": return Color(white: 0.55)
  default: return Color(red: 124 / 255, green: 217 / 255, blue: 154 / 255)
  }
}

/// A esfera do modo voz (snapshot da NeuralSphere — a ilha não roda WebGL) com
/// um anel fino na cor do estado.
private struct Orb: View {
  let phase: String
  let size: CGFloat

  var body: some View {
    let c = phaseColor(phase)
    ZStack {
      Image("Orb").resizable().scaledToFit()
      Circle().stroke(c.opacity(0.75), lineWidth: max(1, size * 0.05))
    }
    .frame(width: size, height: size)
    .shadow(color: c.opacity(0.55), radius: size * 0.18)
  }
}

/// Pausar/ligar o mic sem abrir o app (iOS 17+: botão com App Intent).
private struct MicButton: View {
  let phase: String

  var body: some View {
    if #available(iOS 17.0, *) {
      let muted = phase == "muted"
      Button(intent: ToggleVoiceMicIntent()) {
        Label(muted ? "Ligar mic" : "Pausar mic", systemImage: muted ? "mic.slash.fill" : "mic.fill")
          .font(.caption.weight(.semibold))
          .foregroundColor(muted ? Color(red: 1, green: 0.42, blue: 0.42) : .white)
          .padding(.horizontal, 12)
          .padding(.vertical, 7)
          .background(Capsule().fill(Color.white.opacity(0.14)))
      }
      .buttonStyle(.plain)
    }
  }
}

struct VoiceIslandLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: VoiceIslandAttributes.self) { ctx in
      // Tela de bloqueio / banner
      HStack(spacing: 12) {
        Orb(phase: ctx.state.phase, size: 38)
        VStack(alignment: .leading, spacing: 2) {
          Text(ctx.attributes.agentName).font(.headline).foregroundColor(.white)
          Text(ctx.state.label).font(.subheadline).foregroundColor(phaseColor(ctx.state.phase))
        }
        Spacer()
        MicButton(phase: ctx.state.phase)
      }
      .padding(16)
      .activityBackgroundTint(surface)
      .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { ctx in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Orb(phase: ctx.state.phase, size: 44).padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Image(systemName: "waveform")
            .font(.title2)
            .foregroundColor(phaseColor(ctx.state.phase))
            .padding(.trailing, 6)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 2) {
            Text(ctx.attributes.agentName).font(.headline)
            Text(ctx.state.label).font(.subheadline).foregroundColor(phaseColor(ctx.state.phase))
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack {
            Text("Toque para abrir a conversa").font(.caption).foregroundColor(.secondary)
            Spacer()
            MicButton(phase: ctx.state.phase)
          }
          .padding(.horizontal, 6)
        }
      } compactLeading: {
        Orb(phase: ctx.state.phase, size: 20)
      } compactTrailing: {
        Image(systemName: "waveform").foregroundColor(phaseColor(ctx.state.phase))
      } minimal: {
        Orb(phase: ctx.state.phase, size: 20)
      }
    }
  }
}
