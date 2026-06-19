-- ============================================================================
-- Canal de origem por sessão — pro painel "Uso por sessão" marcar Telegram/
-- WhatsApp(talki)/Painel. Deriva das mensagens: o canal não-'thribus' se
-- houver (origem externa), senão 'thribus' (conversa do painel).
-- ============================================================================
create or replace function public.chat_session_channels(p_agent_id text)
returns table (session_id uuid, channel text)
language sql
stable
security invoker
set search_path = public
as $$
  select m.session_id,
         coalesce(
           (array_agg(distinct m.channel) filter (where m.channel <> 'thribus'))[1],
           'thribus'
         )
    from public.collaborator_messages m
    join public.chat_sessions s on s.id = m.session_id
   where s.agent_id = p_agent_id
     and m.session_id is not null
   group by m.session_id;
$$;
