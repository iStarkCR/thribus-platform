-- ───────────────────────────────────────────────────────────────────────────
-- Time Interno v2 — destilados do CCB: confinamento, resiliência, circuit-breaker
--
-- (1) Confinamento de tools do worker  → allowed_tools / disallowed_tools
-- (2) Resiliência de estado            → owner_pid / heartbeat_at / claude_session_id / terminal_reason
-- (3) Circuit-breaker                  → consecutive_failures
-- ───────────────────────────────────────────────────────────────────────────

-- (1) Confinamento — toolset por colaborador
alter table public.internal_agents
  add column if not exists allowed_tools    text[],
  add column if not exists disallowed_tools text[];

-- (2) Resiliência + (3) circuit-breaker — colunas na task
alter table public.internal_project_tasks
  add column if not exists owner_pid           integer,
  add column if not exists heartbeat_at        timestamptz,
  add column if not exists claude_session_id   text,
  add column if not exists terminal_reason     text
    check (terminal_reason in ('completed','budget_exceeded','gate_pending','subagent_error','stale_daemon_restart','killed')),
  add column if not exists consecutive_failures integer not null default 0;

-- Seed do confinamento do Turing: allowlist mínima de execução; Task sempre bloqueado
-- (o orchestrator também força 'Task' em disallowed em runtime, anti-recursão).
update public.internal_agents
  set allowed_tools    = array['Read','Grep','Glob','Write','Edit','Bash'],
      disallowed_tools = array['Task']
  where slug = 'turing' and allowed_tools is null;
