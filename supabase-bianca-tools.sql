-- ══════════════════════════════════════════════════════════════════
-- Adicionar as 8 tools do Agente Comercial Texnet (n8n) no painel
-- ══════════════════════════════════════════════════════════════════
-- Cole no SQL Editor do Supabase e Run.
--
-- Endpoints usam padrão de webhook n8n. Cada subworkflow do n8n
-- precisa de uma Webhook Trigger configurada com o caminho indicado
-- (ou usar n8n REST API com X-N8N-API-KEY no worker).
-- ══════════════════════════════════════════════════════════════════

insert into tools (name, description, endpoint, method, scope, active)
values
  (
    'consultar_viabilidade',
    'Verifica se um endereço tem cobertura de internet da Texnet. Chame após coletar o endereço completo do cliente. Passe o endereço como campo "query" em texto livre — pode incluir rua, número, bairro e CEP juntos. Retorna "COBERTURA DISPONÍVEL" (com pontos de acesso) ou "SEM COBERTURA".',
    'https://n8n.thribustech.com/webhook/consulta-viabilidade',
    'POST',
    'Texnet',
    true
  ),
  (
    'consultar_cpf',
    'Consulta se o CPF do cliente já existe no sistema IXC. Use antes de apresentar planos. Retorna: existe (true/false), cliente_id, nome, mensagem. Input: cpf (somente números).',
    'https://n8n.thribustech.com/webhook/consulta-cpf',
    'POST',
    'Texnet',
    true
  ),
  (
    'listar_planos',
    'Lista todos os planos de internet disponíveis para venda. Retorna id_ixc, nome, velocidade e preço de cada plano ativo. Use quando o cliente perguntar sobre planos, preços, velocidades ou opções disponíveis. Sem input.',
    'https://n8n.thribustech.com/webhook/listar-planos',
    'POST',
    'Texnet',
    true
  ),
  (
    'cadastro_wizard',
    'Cria um novo cliente completo no IXC (cliente + contrato + acesso + OS). Use quando o cliente confirmou o plano e forneceu todos os dados. O plano de internet (500 Mega) é definido automaticamente — NÃO é necessário informar plano_id. Requer: cpf, nome, email, celular, cep, rua, numero, bairro, tipo_cobranca=B, dia_vencimento (10 ou 15), canal_venda=whatsapp.',
    'https://n8n.thribustech.com/webhook/cadastro-wizard',
    'POST',
    'Texnet',
    true
  ),
  (
    'status_contrato',
    'Consulta o status atual de um contrato no IXC. Use após o cadastro do cliente para verificar se o contrato foi assinado e está ativo. Input obrigatório: contrato_id (ID retornado pelo cadastro_wizard, NÃO o CPF). Retorna contrato_ativo (boolean) e status.',
    'https://n8n.thribustech.com/webhook/status-contrato',
    'POST',
    'Texnet',
    true
  ),
  (
    'consultar_agenda',
    'Consulta a primeira data disponível para instalação a partir da data solicitada. Verifica dia a dia (máximo 10 dias à frente) quantas OS de instalação já estão agendadas. Retorna primeira data com menos de 20 instalações. Input obrigatório: data_desejada (YYYY-MM-DD).',
    'https://n8n.thribustech.com/webhook/consulta-agenda',
    'POST',
    'Texnet',
    true
  ),
  (
    'criar_agendamento',
    'Cria um agendamento de instalação para o cliente. Input obrigatório: cliente_id (ID no IXC), data (YYYY-MM-DD). Opcional: periodo (manhã, tarde, noite), observacoes. IMPORTANTE: só chame após cadastro_wizard.',
    'https://n8n.thribustech.com/webhook/criar-agendamento',
    'POST',
    'Texnet',
    true
  ),
  (
    'criar_os_agendamento',
    'Agenda a instalação atualizando a OS existente no IXC (PUT). Use após o cliente confirmar data e período. Input obrigatório: login (CPF somente números), data_reservada (YYYY-MM-DD), periodo (manhã ou tarde).',
    'https://n8n.thribustech.com/webhook/criar-os-agendamento',
    'POST',
    'Texnet',
    true
  )
on conflict (name) do update set
  description = excluded.description,
  endpoint    = excluded.endpoint,
  method      = excluded.method,
  scope       = excluded.scope,
  active      = excluded.active,
  updated_at  = now();

-- ══════════════════════════════════════════════════════════════════
-- Vincular as 8 tools à Bianca (sobrescreve a lista atual)
-- ══════════════════════════════════════════════════════════════════
update agents
set tools = array[
  'consultar_viabilidade',
  'consultar_cpf',
  'listar_planos',
  'cadastro_wizard',
  'status_contrato',
  'consultar_agenda',
  'criar_agendamento',
  'criar_os_agendamento'
]
where name = 'Bianca' and lower(client) = 'texnet';

-- Confirma resultado
select name, tools, channel from agents where name = 'Bianca';
select name, scope, active from tools where scope = 'Texnet' order by name;
