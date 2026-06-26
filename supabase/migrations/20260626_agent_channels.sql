-- Multi-canal por colaborador: um agente pode atender N canais (inboxes Talki).
-- Antes existia só a coluna `channel` (singular). Esta migration adiciona
-- `channels text[]` e faz backfill a partir do channel atual.
--
-- Retrocompat: o painel mantém `channel = channels[0]` e o worker (findByChannel)
-- AINDA roteia pelo `channel` singular. Pra rotear pelos canais secundários
-- (channels[1..]) o worker precisa passar a casar `channels @> array[<canal>]`
-- — tarefa separada. Aplicar com `supabase db push` OU colar no SQL Editor.

alter table public.agents
  add column if not exists channels text[] not null default '{}'::text[];

-- Backfill: agentes que já tinham um channel ganham ele como primeiro canal.
update public.agents
   set channels = array[channel]
 where channel is not null
   and channel <> ''
   and (channels is null or channels = '{}'::text[]);

-- Índice GIN pra lookup eficiente por canal (quando o worker migrar pra array).
create index if not exists agents_channels_gin
  on public.agents using gin (channels);
