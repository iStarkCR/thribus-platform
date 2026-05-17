/**
 * Seed — Agent Studio (no-code builder).
 *
 * Blocos visuais que montam um agente — persona, knowledge, tools,
 * skills, workflows, canais. Cada bloco tem inputs configuráveis.
 */

export type BlockType =
  | 'persona'
  | 'knowledge'
  | 'tool'
  | 'skill'
  | 'workflow'
  | 'channel'
  | 'guardrail'
  | 'handoff';

export interface StudioBlock {
  id: string;
  type: BlockType;
  title: string;
  subtitle: string;
  configSummary: string;
  position: { x: number; y: number };
  connectsTo: string[];
}

export interface StudioCanvas {
  id: string;
  agentName: string;
  description: string;
  status: 'draft' | 'published';
  blocks: StudioBlock[];
  blocksCount: number;
  updatedAt: string;
  publishedAt?: string;
  author: string;
}

export const STUDIO_BLOCK_PALETTE: { type: BlockType; label: string; description: string; emoji: string }[] = [
  { type: 'persona', label: 'Persona', description: 'Nome, tom de voz, papel, idioma', emoji: '🎭' },
  { type: 'knowledge', label: 'Knowledge Base', description: 'Conhecimento que o agente consulta via RAG', emoji: '📚' },
  { type: 'tool', label: 'Tool / Integração', description: 'API que o agente pode chamar', emoji: '🔧' },
  { type: 'skill', label: 'Skill', description: 'Habilidade empacotada (prompt + tools)', emoji: '🧩' },
  { type: 'workflow', label: 'Workflow', description: 'Gatilho automático (SLA, sentiment...)', emoji: '⚡' },
  { type: 'channel', label: 'Canal', description: 'WhatsApp, email, voz, web', emoji: '📡' },
  { type: 'guardrail', label: 'Guardrail', description: 'Limite — não fazer X, sempre Y', emoji: '🛡️' },
  { type: 'handoff', label: 'Handoff', description: 'Quando passar pra outro agente', emoji: '🤝' },
];

export const SEED_STUDIO_CANVAS: StudioCanvas = {
  id: 'sc_bianca',
  agentName: 'Bianca (Vendas TexNet)',
  description: 'Agente de vendas pra ISP — qualifica lead, consulta viabilidade, oferta plano e fecha venda.',
  status: 'published',
  publishedAt: '2026-05-12T09:00:00Z',
  updatedAt: '2026-05-16T11:42:00Z',
  author: 'Charles Andrade',
  blocksCount: 9,
  blocks: [
    { id: 'b_1', type: 'persona', title: 'Bianca', subtitle: 'Vendedora cordial-direta', configSummary: 'PT-BR · gpt-4o · temp 0.4 · sem promessa de prazo', position: { x: 20, y: 20 }, connectsTo: ['b_2', 'b_3'] },
    { id: 'b_2', type: 'channel', title: 'WhatsApp 360dialog', subtitle: 'Canal principal', configSummary: 'BR · template aprovado · webhook /v1/wh', position: { x: 280, y: 20 }, connectsTo: ['b_4'] },
    { id: 'b_3', type: 'knowledge', title: 'Planos TexNet', subtitle: 'KB com 412 chunks', configSummary: 'text-embedding-3-small · top_k 4', position: { x: 20, y: 160 }, connectsTo: ['b_4'] },
    { id: 'b_4', type: 'tool', title: 'consultar_viabilidade', subtitle: 'API Geogrid', configSummary: 'GET /geogrid/v2/check · cache 24h', position: { x: 280, y: 160 }, connectsTo: ['b_5'] },
    { id: 'b_5', type: 'tool', title: 'ixc_consulta_cliente', subtitle: 'API IXC', configSummary: 'GET cliente por telefone · auth: ixc_token', position: { x: 540, y: 160 }, connectsTo: ['b_6'] },
    { id: 'b_6', type: 'skill', title: 'Negociação ISP', subtitle: 'v1.3.0 · pública', configSummary: 'Cross-sell + handle objeção preço · 4 tools', position: { x: 20, y: 300 }, connectsTo: ['b_7'] },
    { id: 'b_7', type: 'guardrail', title: 'Sem prazo de instalação', subtitle: 'hard rule', configSummary: 'Nunca prometer dia/hora. Sempre "janela útil".', position: { x: 280, y: 300 }, connectsTo: ['b_8'] },
    { id: 'b_8', type: 'workflow', title: 'Sentimento neg → Carla', subtitle: 'Trigger automático', configSummary: 'sentiment < -0.4 · reassign agent_carla', position: { x: 540, y: 300 }, connectsTo: ['b_9'] },
    { id: 'b_9', type: 'handoff', title: 'Escalar gerente', subtitle: 'manual + auto', configSummary: 'desconto fora alçada · objeção forte · pedido especial', position: { x: 280, y: 440 }, connectsTo: [] },
  ],
};
