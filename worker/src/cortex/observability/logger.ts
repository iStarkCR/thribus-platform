/**
 * Logger estruturado JSON pro Cortex.
 *
 * Toda linha de log do Brain sai em JSON com:
 *   - ts          → ISO timestamp
 *   - level       → debug|info|warn|error
 *   - component   → cortex.{module}
 *   - tenant_id   → se aplicável
 *   - trace_id    → se aplicável
 *   - msg         → mensagem
 *   - extras livres
 *
 * Saída: stdout (Coolify/Docker captura). Em produção, agregador (Loki/Datadog)
 * indexa pelos campos.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIO: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL: Level =
  (process.env.CORTEX_LOG_LEVEL as Level) ?? 'info';
const JSON_MODE = process.env.CORTEX_LOG_JSON !== 'false';

export interface LogContext {
  tenantId?: string;
  traceId?: string;
  sessionId?: string;
  agentId?: string;
  [k: string]: unknown;
}

function emit(level: Level, component: string, msg: string, ctx?: LogContext): void {
  if (LEVEL_PRIO[level] < LEVEL_PRIO[MIN_LEVEL]) return;

  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    component,
    msg,
    ...(ctx ?? {}),
  };

  const line = JSON_MODE
    ? JSON.stringify(entry)
    : `[${entry.ts}] ${level.toUpperCase()} ${component} ${msg}${
        ctx && Object.keys(ctx).length > 0 ? ` ${JSON.stringify(ctx)}` : ''
      }`;

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function createLogger(component: string) {
  return {
    debug: (msg: string, ctx?: LogContext) => emit('debug', component, msg, ctx),
    info: (msg: string, ctx?: LogContext) => emit('info', component, msg, ctx),
    warn: (msg: string, ctx?: LogContext) => emit('warn', component, msg, ctx),
    error: (msg: string, ctx?: LogContext) => emit('error', component, msg, ctx),
  };
}

export const log = {
  debug: (component: string, msg: string, ctx?: LogContext) =>
    emit('debug', component, msg, ctx),
  info: (component: string, msg: string, ctx?: LogContext) =>
    emit('info', component, msg, ctx),
  warn: (component: string, msg: string, ctx?: LogContext) =>
    emit('warn', component, msg, ctx),
  error: (component: string, msg: string, ctx?: LogContext) =>
    emit('error', component, msg, ctx),
};
