-- 003_conversation_state.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Adiciona state machine explícita por conversa.
--
-- Motivação: LLMs (especialmente modelos pequenos como gpt-5-mini) regridem
-- de estado quando o histórico fica longo. Com state tracking explícito, o
-- worker injeta "ESTADO ATUAL: X" a cada turno, eliminando a inferência.
--
-- Estados possíveis (alinhados ao prompt da Bianca):
--   1_welcome           — Boas-vindas
--   2_qualifying        — Cliente novo ou existente
--   3_address           — Coletando endereço
--   4_viability         — Verificando viabilidade
--   5_plans             — Apresentando planos
--   6_terms             — Aguardando aceite dos termos
--   7_data_collection   — Coletando dados pessoais
--   8_registering       — Executando cadastro_wizard
--   9_signature_check   — Aguardando assinatura
--   10_scheduling       — Agendando instalação
--   11_completed        — Atendimento finalizado
--
-- Estados especiais:
--   escalated           — Passou pra humano
--   sem_cobertura       — Encerrado por falta de cobertura
-- ─────────────────────────────────────────────────────────────────────────────

alter table conversations
  add column if not exists current_state text default '1_welcome',
  add column if not exists state_data jsonb default '{}'::jsonb,
  add column if not exists state_updated_at timestamptz default now();

-- Index pra buscar conversas em estados específicos rapidamente
create index if not exists idx_conversations_current_state
  on conversations(current_state);

-- state_data armazena pequenos values entre turnos (sem precisar parsear histórico):
--   {
--     "endereco": "Rua X, 123 - Aldeota - 60110-000",
--     "cobertura_ok": true,
--     "uso": "trabalho",
--     "pessoas": 3,
--     "plano_escolhido": { "id_ixc": 5, "nome": "500 Mega", "preco": 99.90 },
--     "termos_aceitos": true,
--     "cpf": "12345678900",
--     "dados_pessoais": { ... },
--     "wizard_result": { "wizard_contrato_id": 123, ... },
--     "agendamento": { "data": "2026-05-15", "periodo": "manha" }
--   }
