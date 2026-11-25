# Código nativo iOS (fora do `gen/`)

`src-tauri/gen/apple` é gerado e fica fora do git. O que é nativo e nosso mora aqui
e o `project.yml` local aponta pra cá.

- `Shared/` — `VoiceIslandAttributes` (Live Activity do modo voz), usado pelo app e pela extensão
- `App/` — `ThribusVoiceIsland` (ObjC), chamado pelo comando Rust `voice_island`
- `VoiceIsland/` — extensão WidgetKit que desenha a Dynamic Island / tela de bloqueio

Se o `gen/apple` for recriado (`tauri ios init`), reaplicar no `project.yml` e rodar `xcodegen generate`:

```yaml
# targets.app_iOS.sources (+)
      - path: ../../ios/Shared
      - path: ../../ios/App
# targets.app_iOS.settings.base (+)
        SWIFT_VERSION: "5.0"
        CODE_SIGN_STYLE: Automatic
        DEVELOPMENT_TEAM: 356UVXF63A
# targets.app_iOS.dependencies (+, no topo)
      - target: VoiceIsland
        embed: true
# targets (+)
  VoiceIsland:
    type: app-extension
    platform: iOS
    deploymentTarget: "16.2"
    sources:
      - path: ../../ios/Shared
      - path: ../../ios/VoiceIsland
        excludes: ["Info.plist"]
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.thribustech.platform.VoiceIsland
        PRODUCT_NAME: VoiceIsland
        INFOPLIST_FILE: ../../ios/VoiceIsland/Info.plist
        GENERATE_INFOPLIST_FILE: false
        MARKETING_VERSION: 0.1.0
        CURRENT_PROJECT_VERSION: "0.1.0"
        SWIFT_VERSION: "5.0"
        TARGETED_DEVICE_FAMILY: "1,2"
        SKIP_INSTALL: true
        CODE_SIGN_STYLE: Automatic
        DEVELOPMENT_TEAM: 356UVXF63A
        LD_RUNPATH_SEARCH_PATHS: $(inherited) @executable_path/Frameworks @executable_path/../../Frameworks
    dependencies:
      - sdk: WidgetKit.framework
      - sdk: SwiftUI.framework
      - sdk: ActivityKit.framework
    postBuildScripts:
      - script: |
          V=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$SRCROOT/app_iOS/Info.plist")
          /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $V" "$TARGET_BUILD_DIR/$INFOPLIST_PATH"
        name: Sync build number with app
        basedOnDependencyAnalysis: false
```

App e extensão assinam no modo automático: o archive sai em desenvolvimento e o Organizer (Distribute → App Store Connect) re-assina pra App Store. Assinatura manual de distribuição no app quebra o build (a extensão teria certificado diferente).

`NSSupportsLiveActivities` e `UIBackgroundModes: audio` vêm do `src-tauri/Info.plist` (o Tauri mescla no build).
