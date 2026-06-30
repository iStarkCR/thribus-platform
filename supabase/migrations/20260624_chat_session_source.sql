-- Distingue conversas ESPELHO do Claude Code (cc-mirror) das DIGITADAS no painel,
-- via coluna `source` em vez do prefixo 💻 no título (removido a pedido do Charles —
-- "fica infantil"). A ponte usa isso pra NÃO compactar espelho (não dá --resume) e
-- o front pra esconder o botão "Compactar" nelas. Ver cc-mirror.mjs / bukowiski-bridge.mjs.

alter table public.chat_sessions
  add column if not exists source text not null default 'panel'; -- 'panel' | 'claude_code'

-- Backfill: marca os espelhos existentes (ainda com 💻 no título) ANTES de limpar os
-- títulos — o code novo passa a filtrar por source, então a limpeza fica segura.
update public.chat_sessions set source = 'claude_code' where title like '💻%';
