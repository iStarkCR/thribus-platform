/**
 * Ponte nativa (Tauri) — tudo aqui é no-op no site web (Vercel).
 *
 * O app nativo injeta `document.documentElement.classList.add('tauri')` via
 * `initialization_script` (ver src-tauri/src/lib.rs). O site web nunca recebe
 * essa classe nem o runtime `__TAURI_INTERNALS__`, então `isTauri()` é o gate
 * único: qualquer chamada nativa fica atrás dele e simplesmente não roda no web.
 *
 * Os plugins nativos são importados dinamicamente — assim o bundle web não
 * carrega código que depende do backend Rust (que não existe no browser).
 */

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    document.documentElement.classList.contains('tauri') ||
    '__TAURI_INTERNALS__' in window
  );
}

let permissionReady: Promise<boolean> | null = null;

/** Garante (uma vez) que temos permissão da Central de Notificações do macOS. */
async function ensurePermission(): Promise<boolean> {
  if (!isTauri()) return false;
  if (!permissionReady) {
    permissionReady = (async () => {
      try {
        const { isPermissionGranted, requestPermission } = await import(
          '@tauri-apps/plugin-notification'
        );
        if (await isPermissionGranted()) return true;
        return (await requestPermission()) === 'granted';
      } catch (err) {
        console.warn('[native] permissão de notificação falhou', err);
        return false;
      }
    })();
  }
  return permissionReady;
}

/**
 * Dispara uma notificação nativa do macOS (Central de Notificações).
 * No web é no-op silencioso. Retorna `true` se de fato notificou.
 */
export async function notify(title: string, body?: string, route?: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    if (!(await ensurePermission())) return false;
    const { sendNotification } = await import('@tauri-apps/plugin-notification');
    // `route` (ex: "/talk?agent=123") viaja no payload; o listener de clique
    // (onNotificationClick) navega pra lá quando o usuário toca na notificação.
    sendNotification({ title, body, extra: route ? { route } : undefined });
    return true;
  } catch (err) {
    console.warn('[native] notify falhou', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Integrações nativas do macOS (Agenda, Lembretes, Notas, Atalhos)
//
// Comandos Rust expostos via `invoke()`. Todos atrás de `isTauri()` — no web
// retornam valor vazio/no-op (o backend Rust não existe no browser). Os
// comandos só são registrados no target macOS (ver src-tauri/src/lib.rs).
// ---------------------------------------------------------------------------

export type CalendarEvent = { start: string; end: string; calendar: string; title: string };
export type ReminderItem = { list: string; title: string; due: string };
export type NoteItem = { title: string; snippet: string };

/** Chama um comando Tauri. No web (sem backend) devolve `fallback`. */
async function call<T>(cmd: string, args: Record<string, unknown>, fallback: T): Promise<T> {
  if (!isTauri()) return fallback;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke(cmd, args)) as T;
  } catch (err) {
    console.warn(`[native] ${cmd} falhou`, err);
    return fallback;
  }
}

/** Eventos da Agenda nos próximos `days` dias (a partir de hoje 00:00). */
export async function getCalendarEvents(days = 1): Promise<CalendarEvent[]> {
  const raw = await call<string>('get_calendar_events', { days }, '[]');
  try {
    return JSON.parse(raw) as CalendarEvent[];
  } catch {
    return [];
  }
}

/** Cria um evento. `date` em formato que o AppleScript consegue parsear (locale do macOS). */
export async function createCalendarEvent(
  title: string,
  date: string,
  calendar?: string,
): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('create_calendar_event', { title, date, calendar: calendar ?? null });
    return true;
  } catch (err) {
    console.warn('[native] createCalendarEvent falhou', err);
    return false;
  }
}

/** Lembretes pendentes (todas as listas). */
export async function listReminders(): Promise<ReminderItem[]> {
  const raw = await call<string>('list_reminders', {}, '[]');
  try {
    return JSON.parse(raw) as ReminderItem[];
  } catch {
    return [];
  }
}

/** Cria um lembrete na lista padrão. `dueDate` opcional (formato parseável pelo AppleScript). */
export async function createReminder(title: string, dueDate?: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('create_reminder', { title, dueDate: dueDate ?? null });
    return true;
  } catch (err) {
    console.warn('[native] createReminder falhou', err);
    return false;
  }
}

/** Lista/busca notas. Sem `query` devolve só títulos; com `query` inclui trecho (até 280 chars). */
export async function listNotes(query?: string): Promise<NoteItem[]> {
  const raw = await call<string>('list_notes', { query: query ?? null }, '[]');
  try {
    return JSON.parse(raw) as NoteItem[];
  } catch {
    return [];
  }
}

/** Cria uma nota. `body` aceita HTML simples (<h1>, <p>, <ul><li>, <b>, <a href>...). */
export async function createNote(title: string, body: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('create_note', { title, body });
    return true;
  } catch (err) {
    console.warn('[native] createNote falhou', err);
    return false;
  }
}

/** Nomes dos Atalhos disponíveis (um por linha, como o `shortcuts list` devolve). */
export async function listShortcuts(): Promise<string[]> {
  const raw = await call<string>('list_shortcuts', {}, '');
  return raw.split('\n').map((l) => l.trim()).filter(Boolean);
}

/** Dispara um Atalho pelo nome, com `input` opcional. Retorna a saída (stdout) do atalho. */
export async function runShortcut(name: string, input?: string): Promise<string> {
  return call<string>('run_shortcut', { name, input: input ?? null }, '');
}

// thribus://talk?agent=123  →  "/talk?agent=123" (rota interna do HashRouter)
function deepLinkToRoute(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'thribus:') return null;
    const host = u.host || '';
    const path = u.pathname && u.pathname !== '/' ? u.pathname : '';
    const route = '/' + host + path;
    return (route === '/' ? '/' : route.replace(/\/$/, '')) + (u.search || '');
  } catch {
    return null;
  }
}

/**
 * Registra o handler de deep link `thribus://` — tanto cold start (app aberto
 * pela URL) quanto em runtime (app já aberto). `cb` recebe a rota interna
 * (ex: "/talk?agent=123"). No web é no-op.
 */
export async function onDeepLink(cb: (route: string) => void): Promise<void> {
  if (!isTauri()) return;
  try {
    const dl = await import('@tauri-apps/plugin-deep-link');
    const handle = (urls: string[] | null) => {
      for (const url of urls ?? []) {
        const route = deepLinkToRoute(url);
        if (route) cb(route);
      }
    };
    handle(await dl.getCurrent());
    await dl.onOpenUrl(handle);
  } catch (err) {
    console.warn('[native] deep link falhou', err);
  }
}

/**
 * Auto-updater (GitHub Releases): checa se há versão nova; se houver, baixa e
 * instala. Não força reinício — avisa via `onStatus` pra o usuário reiniciar
 * quando quiser (a nova versão aplica no próximo open). No web é no-op.
 */
export async function checkForUpdates(onStatus?: (msg: string) => void): Promise<void> {
  if (!isTauri()) return;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return; // já está na última
    onStatus?.(`Baixando atualização ${update.version}…`);
    await update.downloadAndInstall();
    onStatus?.(`Atualização ${update.version} instalada — reinicie o app pra aplicar.`);
  } catch (err) {
    console.warn('[native] checkForUpdates falhou', err);
  }
}

/**
 * Abre uma URL no navegador padrão do sistema (plugin-opener). No web é no-op
 * — ali o `<a target="_blank">` já abre nova aba sozinho.
 */
async function openExternal(url: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return true;
  } catch (err) {
    console.warn('[native] openExternal falhou', err);
    return false;
  }
}

/**
 * Dentro do WKWebView nativo, `<a target="_blank">` não abre o navegador do
 * sistema sozinho — precisa do plugin-opener. Este listener global intercepta
 * (captura) clique em qualquer `<a href="http(s)://…">` da árvore e abre via
 * `openExternal`, prevenindo a navegação interna da webview. No web é no-op
 * (isTauri() === false), o clique segue o comportamento nativo do browser.
 */
export function installExternalLinkHandler(): () => void {
  if (!isTauri()) return () => {};
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = (e.target as HTMLElement)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href)) return;
    e.preventDefault();
    void openExternal(href);
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}

/**
 * Clique numa notificação nativa → navega pra rota que ela carrega (`extra.route`).
 * No web é no-op.
 */
export async function onNotificationClick(cb: (route: string) => void): Promise<void> {
  if (!isTauri()) return;
  try {
    const { onAction } = await import('@tauri-apps/plugin-notification');
    await onAction((n) => {
      const route = (n as { extra?: Record<string, unknown> })?.extra?.route;
      if (typeof route === 'string' && route) cb(route);
    });
  } catch (err) {
    console.warn('[native] onNotificationClick falhou', err);
  }
}
