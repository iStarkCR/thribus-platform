/**
 * Seed — Agent Lab (Playground + Eval).
 *
 * Versões de prompt do agente, suite de golden answers,
 * runs de eval e replay determinístico.
 */

export interface PromptVersion {
  id: string;
  agentId: string;
  agentName: string;
  version: string;
  label: string;
  systemPrompt: string;
  author: string;
  isLive: boolean;
  createdAt: string;
  charsCount: number;
}

export interface GoldenAnswer {
  id: string;
  agentId: string;
  category: string;
  input: string;
  expectedAnswer: string;
  expectedToolCalls: string[];
  weight: number;
  createdAt: string;
}

export type EvalScore = 'pass' | 'fail' | 'partial';

export interface EvalRunCase {
  goldenId: string;
  input: string;
  expected: string;
  actual: string;
  score: EvalScore;
  similarity: number;
  toolMatch: boolean;
  latencyMs: number;
  tokens: number;
}

export interface EvalRun {
  id: string;
  agentId: string;
  agentName: string;
  promptVersionId: string;
  promptVersionLabel: string;
  totalCases: number;
  passed: number;
  failed: number;
  partial: number;
  passRate: number;
  avgLatencyMs: number;
  avgTokens: number;
  totalCost: number;
  runBy: string;
  startedAt: string;
  finishedAt: string;
  cases: EvalRunCase[];
}

export const SEED_PROMPT_VERSIONS: PromptVersion[] = [
  { id: 'pv_1', agentId: 'agent_bianca', agentName: 'Bianca', version: '1.4.2', label: 'v1.4.2 (live)', systemPrompt: 'Você é a Bianca, consultora de vendas da TexNet. Atenda em PT-BR, tom cordial mas direto. Sempre consulte viabilidade antes de ofertar plano. Não prometa prazo de instalação fora da janela útil. Se cliente reclamar, escale.', author: 'Charles Andrade', isLive: true, createdAt: '2026-05-12T09:00:00Z', charsCount: 312 },
  { id: 'pv_2', agentId: 'agent_bianca', agentName: 'Bianca', version: '1.5.0-rc1', label: 'v1.5.0-rc1 (rascunho)', systemPrompt: 'Você é a Bianca, consultora de vendas da TexNet...\n\n[v1.5.0] Adicionada instrução de cross-sell de combo TV.', author: 'Charles Andrade', isLive: false, createdAt: '2026-05-16T11:42:00Z', charsCount: 458 },
  { id: 'pv_3', agentId: 'agent_renata', agentName: 'Renata', version: '2.1.0', label: 'v2.1.0 (live)', systemPrompt: 'Você é a Renata, suporte técnico N1 da TexNet. Antes de pedir reset, sempre confira incidentes ativos na região. Empatia primeiro, técnico depois.', author: 'Charles Andrade', isLive: true, createdAt: '2026-04-22T15:30:00Z', charsCount: 240 },
];

export const SEED_GOLDEN: GoldenAnswer[] = [
  { id: 'g_1', agentId: 'agent_bianca', category: 'Viabilidade', input: 'tem fibra na rua do progresso 412 bagé?', expectedAnswer: 'Confirma cobertura, oferta plano com fidelidade e pede confirmação de instalação.', expectedToolCalls: ['consultar_viabilidade', 'rag.query'], weight: 1.0, createdAt: '2026-05-10T10:00:00Z' },
  { id: 'g_2', agentId: 'agent_bianca', category: 'Preço', input: 'quanto custa o plano de 600 mega?', expectedAnswer: 'Cita R$ 99,90/mês, promoção 3m R$ 79,90, fidelidade 12 meses.', expectedToolCalls: ['rag.query'], weight: 1.0, createdAt: '2026-05-10T10:00:00Z' },
  { id: 'g_3', agentId: 'agent_bianca', category: 'Objeção', input: 'tá caro, o concorrente faz mais barato', expectedAnswer: 'Reconhece, reframe valor (estabilidade + atendimento), não baixa preço sem alçada.', expectedToolCalls: [], weight: 1.5, createdAt: '2026-05-10T10:00:00Z' },
  { id: 'g_4', agentId: 'agent_bianca', category: 'Escalação', input: 'meu vizinho contratou por 60 reais, faz pra mim?', expectedAnswer: 'Reconhece, não promete, oferece passar pra gerente comercial.', expectedToolCalls: ['escalate'], weight: 1.5, createdAt: '2026-05-10T10:00:00Z' },
  { id: 'g_5', agentId: 'agent_bianca', category: 'Cross-sell', input: 'só quero internet mesmo, não quero TV', expectedAnswer: 'Aceita o pedido, fecha venda só de internet sem insistir.', expectedToolCalls: [], weight: 1.0, createdAt: '2026-05-10T10:00:00Z' },
  { id: 'g_6', agentId: 'agent_renata', category: 'Diagnóstico', input: 'internet caindo direto desde ontem', expectedAnswer: 'Consulta incidentes da região antes de pedir reset.', expectedToolCalls: ['ixc_consulta_cliente', 'ixc_incidentes_regiao'], weight: 1.5, createdAt: '2026-05-10T10:00:00Z' },
];

export const SEED_EVAL_RUNS: EvalRun[] = [
  {
    id: 'er_1', agentId: 'agent_bianca', agentName: 'Bianca',
    promptVersionId: 'pv_2', promptVersionLabel: 'v1.5.0-rc1',
    totalCases: 5, passed: 4, failed: 0, partial: 1, passRate: 0.80,
    avgLatencyMs: 2_140, avgTokens: 268, totalCost: 0.012,
    runBy: 'Charles Andrade', startedAt: '2026-05-16T11:48:00Z', finishedAt: '2026-05-16T11:49:18Z',
    cases: [
      { goldenId: 'g_1', input: 'tem fibra na rua do progresso 412 bagé?', expected: 'Confirma cobertura...', actual: 'Sim, atendemos sua rua com fibra. Plano de 600 mega...', score: 'pass', similarity: 0.94, toolMatch: true, latencyMs: 2_270, tokens: 248 },
      { goldenId: 'g_2', input: 'quanto custa o plano de 600 mega?', expected: 'R$ 99,90...', actual: 'O plano de 600 mega sai R$ 99,90/mês. Tenho promoção...', score: 'pass', similarity: 0.97, toolMatch: true, latencyMs: 1_820, tokens: 224 },
      { goldenId: 'g_3', input: 'tá caro, o concorrente faz mais barato', expected: 'Reframe valor...', actual: 'Entendo. Nosso preço reflete... [missing: empatia inicial]', score: 'partial', similarity: 0.72, toolMatch: true, latencyMs: 2_410, tokens: 312 },
      { goldenId: 'g_4', input: 'meu vizinho contratou por 60 reais', expected: 'Escala pra gerente', actual: 'Vou te passar pro gerente comercial agora mesmo.', score: 'pass', similarity: 0.91, toolMatch: true, latencyMs: 1_950, tokens: 198 },
      { goldenId: 'g_5', input: 'só quero internet', expected: 'Não insiste em TV', actual: 'Perfeito, só internet então. Confirma fechamento?', score: 'pass', similarity: 0.95, toolMatch: true, latencyMs: 2_250, tokens: 358 },
    ],
  },
  {
    id: 'er_2', agentId: 'agent_bianca', agentName: 'Bianca',
    promptVersionId: 'pv_1', promptVersionLabel: 'v1.4.2',
    totalCases: 5, passed: 5, failed: 0, partial: 0, passRate: 1.0,
    avgLatencyMs: 2_080, avgTokens: 252, totalCost: 0.011,
    runBy: 'Charles Andrade', startedAt: '2026-05-12T14:00:00Z', finishedAt: '2026-05-12T14:01:12Z',
    cases: [],
  },
];
