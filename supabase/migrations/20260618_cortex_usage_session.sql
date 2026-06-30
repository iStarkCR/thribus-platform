-- ============================================================================
-- Uso por SESSÃO de chat — token/custo agregado por conversa
-- ============================================================================
-- cortex_usage já registra cada execução (ref_id = id da mensagem), mas não
-- amarrava à sessão. Aqui adicionamos session_id (ligação direta) + backfill
-- dos registros antigos via collaborator_messages, e uma RPC que devolve o
-- agregado por sessão (tokens, custo, execuções) pro painel "Uso por sessão".
-- ============================================================================

alter table public.cortex_usage
  add column if not exists session_id uuid references public.chat_sessions(id) on delete set null;

create index if not exists idx_cortex_usage_session
  on public.cortex_usage(session_id);

-- Backfill: liga as execuções de chat existentes à sessão pela mensagem (ref_id).
update public.cortex_usage u
   set session_id = m.session_id
  from public.collaborator_messages m
 where u.ref_id = m.id
   and u.kind = 'chat'
   and u.session_id is null
   and m.session_id is not null;

-- Agregado por sessão (respeita RLS de cortex_usage via security invoker).
create or replace function public.chat_session_usage(p_agent_id text)
returns table (
  session_id        uuid,
  cost_usd          numeric,
  total_tokens      bigint,
  input_tokens      bigint,
  output_tokens     bigint,
  cache_read_tokens bigint,
  runs              bigint,
  last_at           timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select u.session_id,
         coalesce(sum(u.cost_usd), 0)::numeric,
         coalesce(sum(u.total_tokens), 0)::bigint,
         coalesce(sum(u.input_tokens), 0)::bigint,
         coalesce(sum(u.output_tokens), 0)::bigint,
         coalesce(sum(u.cache_read_tokens), 0)::bigint,
         count(*)::bigint,
         max(u.created_at)
    from public.cortex_usage u
   where u.kind = 'chat'
     and u.agent_id = p_agent_id
     and u.session_id is not null
   group by u.session_id;
$$;
