use tauri::{WebviewUrl, WebviewWindowBuilder};

// Override de performance aplicado SOMENTE no app nativo (WKWebView).
// O WebKit do macOS renderiza `backdrop-filter: blur()` muito mais caro que o
// Chromium — e a sidebar (.glass-strong) recompõe o blur a cada frame ao
// expandir/recolher, deixando o menu lateral "pesado". Aqui removemos o blur e
// deixamos os painéis opacos. Nada disso vaza pro site web (Vercel), que nunca
// recebe este script nem a classe `tauri`.
//
// Também: a sidebar anima `width` ao expandir/recolher — no WKWebView isso força
// reflow de layout a cada frame e trava a transição. Tiramos `width` da lista
// de propriedades animadas (deixando só `transform`), então a largura troca
// instantânea (snappy) em vez de arrastar 200ms travados.
const PERF_OVERRIDES: &str = r#"
(function () {
  var css =
    "html.glass .glass-strong, html.glass .glass-panel {" +
    "  backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }" +
    "html.glass:not(.light) .glass-strong { background: rgb(22 23 27 / 0.985) !important; }" +
    "html.glass:not(.light) .glass-panel  { background: rgb(22 23 27 / 0.965) !important; }" +
    "html.glass.light .glass-strong { background: rgb(255 255 255 / 0.985) !important; }" +
    "html.glass.light .glass-panel  { background: rgb(255 255 255 / 0.975) !important; }" +
    "aside.fixed.left-0 { transition-property: transform !important; }" +
    // O <main> anima `transition-[margin]` ao expandir/recolher a sidebar — isso
    // reflui o conteúdo inteiro (chat, tabelas) a cada frame, a real causa da
    // lentidão na abertura. Tiramos a transição: a margem troca instantânea.
    "main[class*='transition-[margin'] { transition: none !important; }";
  function inject() {
    if (document.getElementById('tauri-perf-overrides')) return;
    var s = document.createElement('style');
    s.id = 'tauri-perf-overrides';
    s.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(s);
  }
  document.documentElement.classList.add('tauri');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
"#;

// ---------------------------------------------------------------------------
// Integrações nativas do macOS (Agenda, Lembretes, Notas, Atalhos)
//
// Tudo via AppleScript (`osascript`) e a CLI `shortcuts`, chamados por
// `std::process::Command` direto no backend Rust. Mesmo padrão já validado nas
// skills internas (apple-calendar / apple-reminders / apple-notes).
//
// SEGURANÇA — injeção de AppleScript: NENHUM texto do usuário é interpolado na
// string do script. O script sempre tem um handler `on run argv ... end run` e
// os dados (título, body, query, data) chegam como *argumentos* (argv) do
// processo `osascript`, nunca concatenados no fonte do script. Assim um título
// como `foo" & (do shell script "rm -rf ~") & "` é tratado como texto literal.
// ---------------------------------------------------------------------------
#[cfg(target_os = "macos")]
mod mac_native {
  use std::io::Write;
  use std::process::{Command, Stdio};

  // Separadores de campo (US) e de registro (RS) — caracteres de controle que
  // nunca aparecem em texto digitado, então servem de delimitador seguro entre
  // o AppleScript e o parsing em Rust (evita problema de escaping com JSON no
  // lado do AppleScript, que é frágil).
  const FS: char = '\u{1f}';
  const RS: char = '\u{1e}';

  /// Roda um AppleScript lido do stdin, passando `args` como argv (`on run argv`).
  fn osascript(script: &str, args: &[&str]) -> Result<String, String> {
    let mut child = Command::new("osascript")
      .arg("-")
      .args(args)
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .spawn()
      .map_err(|e| format!("falha ao iniciar osascript: {e}"))?;
    child
      .stdin
      .as_mut()
      .ok_or_else(|| "sem stdin no osascript".to_string())?
      .write_all(script.as_bytes())
      .map_err(|e| format!("falha ao escrever script: {e}"))?;
    let out = child
      .wait_with_output()
      .map_err(|e| format!("falha ao executar osascript: {e}"))?;
    if out.status.success() {
      Ok(String::from_utf8_lossy(&out.stdout).trim_end().to_string())
    } else {
      Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
  }

  /// Converte a saída delimitada (FS/RS) num JSON array de objetos, usando
  /// `keys` como nomes dos campos na ordem em que o AppleScript os emitiu.
  fn delimited_to_json(raw: &str, keys: &[&str]) -> String {
    let mut arr = Vec::new();
    for rec in raw.split(RS) {
      if rec.trim().is_empty() {
        continue;
      }
      let fields: Vec<&str> = rec.split(FS).collect();
      let mut obj = serde_json::Map::new();
      for (i, key) in keys.iter().enumerate() {
        let v = fields.get(i).copied().unwrap_or("");
        obj.insert((*key).to_string(), serde_json::Value::String(v.to_string()));
      }
      arr.push(serde_json::Value::Object(obj));
    }
    serde_json::Value::Array(arr).to_string()
  }

  #[tauri::command]
  pub fn get_calendar_events(days: i32) -> Result<String, String> {
    let script = r#"
on run argv
	set numDays to (item 1 of argv) as integer
	set startDate to current date
	set hours of startDate to 0
	set minutes of startDate to 0
	set seconds of startDate to 0
	set endDate to startDate + (numDays * days)
	set fs to (ASCII character 31)
	set rs to (ASCII character 30)
	tell application "Calendar"
		set out to ""
		repeat with c in calendars
			try
				set evs to (every event of c whose start date is greater than or equal to startDate and start date is less than endDate)
				repeat with e in evs
					set out to out & ((start date of e) as string) & fs & ((end date of e) as string) & fs & (name of c) & fs & (summary of e) & rs
				end repeat
			end try
		end repeat
		return out
	end tell
end run
"#;
    let days = days.max(1).to_string();
    let raw = osascript(script, &[&days])?;
    Ok(delimited_to_json(&raw, &["start", "end", "calendar", "title"]))
  }

  #[tauri::command]
  pub fn create_calendar_event(
    title: String,
    date: String,
    calendar: Option<String>,
  ) -> Result<(), String> {
    let script = r#"
on run argv
	set evTitle to item 1 of argv
	set evDateStr to item 2 of argv
	set calName to item 3 of argv
	set startDate to date evDateStr
	set endDate to startDate + (60 * minutes)
	tell application "Calendar"
		if calName is "" then
			set targetCal to item 1 of calendars
		else
			set targetCal to (first calendar whose name is calName)
		end if
		tell targetCal
			make new event with properties {summary:evTitle, start date:startDate, end date:endDate}
		end tell
	end tell
end run
"#;
    let cal = calendar.unwrap_or_default();
    osascript(script, &[&title, &date, &cal]).map(|_| ())
  }

  #[tauri::command]
  pub fn list_reminders() -> Result<String, String> {
    let script = r#"
on run argv
	set fs to (ASCII character 31)
	set rs to (ASCII character 30)
	tell application "Reminders"
		set out to ""
		repeat with l in lists
			try
				set pend to (every reminder of l whose completed is false)
				repeat with r in pend
					set dd to ""
					try
						set dd to ((due date of r) as string)
					end try
					set out to out & (name of l) & fs & (name of r) & fs & dd & rs
				end repeat
			end try
		end repeat
		return out
	end tell
end run
"#;
    let raw = osascript(script, &[])?;
    Ok(delimited_to_json(&raw, &["list", "title", "due"]))
  }

  #[tauri::command]
  pub fn create_reminder(title: String, due_date: Option<String>) -> Result<(), String> {
    let script = r#"
on run argv
	set rTitle to item 1 of argv
	set dueStr to item 2 of argv
	tell application "Reminders"
		tell default list
			if dueStr is "" then
				make new reminder with properties {name:rTitle}
			else
				make new reminder with properties {name:rTitle, due date:(date dueStr)}
			end if
		end tell
	end tell
end run
"#;
    let due = due_date.unwrap_or_default();
    osascript(script, &[&title, &due]).map(|_| ())
  }

  #[tauri::command]
  pub fn list_notes(query: Option<String>) -> Result<String, String> {
    // Sem query: só nomes (listar o body de TODAS as notas é pesado). Com
    // query: inclui um trecho em texto puro (plaintext) pra contexto.
    let script = r#"
on run argv
	set q to item 1 of argv
	set fs to (ASCII character 31)
	set rs to (ASCII character 30)
	tell application "Notes"
		set out to ""
		repeat with n in notes
			try
				if q is "" then
					set out to out & (name of n) & fs & "" & rs
				else if ((name of n) contains q) or ((plaintext of n) contains q) then
					set snippet to (plaintext of n)
					set out to out & (name of n) & fs & snippet & rs
				end if
			end try
		end repeat
		return out
	end tell
end run
"#;
    let q = query.unwrap_or_default();
    let raw = osascript(script, &[&q])?;
    // Trunca o snippet em Rust pra não devolver notas gigantes ao frontend.
    let mut arr = Vec::new();
    for rec in raw.split(RS) {
      if rec.trim().is_empty() {
        continue;
      }
      let fields: Vec<&str> = rec.split(FS).collect();
      let name = fields.first().copied().unwrap_or("");
      let snippet: String = fields.get(1).copied().unwrap_or("").chars().take(280).collect();
      let mut obj = serde_json::Map::new();
      obj.insert("title".into(), serde_json::Value::String(name.to_string()));
      obj.insert("snippet".into(), serde_json::Value::String(snippet));
      arr.push(serde_json::Value::Object(obj));
    }
    Ok(serde_json::Value::Array(arr).to_string())
  }

  #[tauri::command]
  pub fn create_note(title: String, body: String) -> Result<(), String> {
    // Cria na conta/pasta padrão do Notes (locale-safe: não fixa "Notas"/"Notes").
    // `body` aceita HTML simples (<h1>, <p>, <ul><li>, <b>, <a href>...).
    let script = r#"
on run argv
	set nTitle to item 1 of argv
	set nBody to item 2 of argv
	tell application "Notes"
		make new note with properties {name:nTitle, body:nBody}
	end tell
end run
"#;
    osascript(script, &[&title, &body]).map(|_| ())
  }

  #[tauri::command]
  pub fn list_shortcuts() -> Result<String, String> {
    let out = Command::new("shortcuts")
      .arg("list")
      .output()
      .map_err(|e| format!("falha ao rodar shortcuts list: {e}"))?;
    if out.status.success() {
      Ok(String::from_utf8_lossy(&out.stdout).trim_end().to_string())
    } else {
      Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
  }

  #[tauri::command]
  pub fn run_shortcut(name: String, input: Option<String>) -> Result<String, String> {
    let mut cmd = Command::new("shortcuts");
    cmd.arg("run").arg(&name);
    // Com input: `--input-path -` faz o shortcuts ler o input do stdin.
    if input.is_some() {
      cmd.arg("--input-path").arg("-");
    }
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd
      .spawn()
      .map_err(|e| format!("falha ao iniciar shortcuts run: {e}"))?;
    if let Some(data) = input {
      child
        .stdin
        .as_mut()
        .ok_or_else(|| "sem stdin no shortcuts".to_string())?
        .write_all(data.as_bytes())
        .map_err(|e| format!("falha ao escrever input: {e}"))?;
    }
    let out = child
      .wait_with_output()
      .map_err(|e| format!("falha ao executar shortcuts run: {e}"))?;
    if out.status.success() {
      Ok(String::from_utf8_lossy(&out.stdout).trim_end().to_string())
    } else {
      Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_opener::init());

  // Comandos nativos do macOS (Agenda/Lembretes/Notas/Atalhos) só existem no
  // target macOS — registra o handler apenas lá.
  #[cfg(target_os = "macos")]
  let builder = builder.invoke_handler(tauri::generate_handler![
    mac_native::get_calendar_events,
    mac_native::create_calendar_event,
    mac_native::list_reminders,
    mac_native::create_reminder,
    mac_native::list_notes,
    mac_native::create_note,
    mac_native::list_shortcuts,
    mac_native::run_shortcut,
  ]);

  builder
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Auto-updater (só desktop) — o check/download/instalação é disparado
      // pelo frontend (ver src/lib/native.ts checkForUpdates).
      #[cfg(desktop)]
      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

      WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("Thribus Platform")
        .inner_size(1280.0, 840.0)
        .min_inner_size(960.0, 600.0)
        .resizable(true)
        .initialization_script(PERF_OVERRIDES)
        .disable_drag_drop_handler()
        .build()?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
