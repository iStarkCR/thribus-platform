import { describe, it, expect } from 'vitest';
import { route } from './cortex-router';
import { classifyWhatsapp, classifyPainel } from './cortex-router.config';

// Helper: gera texto com N chars sem disparar nenhum sinal de tier (só 'a').
const filler = (n: number) => 'a'.repeat(n);

describe('classifyWhatsapp — tiers (1:1 com o daemon)', () => {
  it('trivial por comprimento curto (<=12) → haiku, reason "curta"', () => {
    expect(classifyWhatsapp('oi')).toEqual({
      tier: 'trivial', model: 'haiku', effort: null, reason: 'curta',
    });
  });

  it('trivial por saudação (<=40) → haiku, reason "saudação/confirmação"', () => {
    const r = classifyWhatsapp('bom dia, tudo certo por aí hoje?');
    expect(r.tier).toBe('trivial');
    expect(r.model).toBe('haiku');
    expect(r.reason).toBe('saudação/confirmação');
  });

  it('médio → sonnet (default, sem sinal e curto)', () => {
    const r = classifyWhatsapp('me manda o status do cliente texnet de hoje');
    expect(r).toEqual({ tier: 'médio', model: 'sonnet', effort: null, reason: 'default' });
  });

  it('complexo → opus · high (sinal de raciocínio, texto curto)', () => {
    const r = classifyWhatsapp('debug esse erro no login que está quebrando');
    expect(r.tier).toBe('complexo');
    expect(r.model).toBe('opus');
    expect(r.effort).toBe('high');
    expect(r.reason).toBe('raciocínio');
  });

  it('crítico → opus · xhigh (denso, len > 600)', () => {
    const r = classifyWhatsapp('analisa ' + filler(620));
    expect(r.tier).toBe('crítico');
    expect(r.model).toBe('opus');
    expect(r.effort).toBe('xhigh');
    expect(r.reason).toBe('longa');
  });

  it('máximo → opus · max (sinal estratégico)', () => {
    const r = classifyWhatsapp('preciso de uma estratégia de posicionamento de produto');
    expect(r.tier).toBe('máximo');
    expect(r.model).toBe('opus');
    expect(r.effort).toBe('max');
    expect(r.reason).toBe('estratégico/profundo');
  });

  it('máximo por tamanho (len > 900) → reason "muito longa"', () => {
    const r = classifyWhatsapp(filler(950));
    expect(r.tier).toBe('máximo');
    expect(r.effort).toBe('max');
    expect(r.reason).toBe('muito longa');
  });
});

describe('classifyWhatsapp — bordas', () => {
  it('saudação LONGA (começa com "oi" mas len > 40) NÃO é trivial', () => {
    const r = classifyWhatsapp('oi ' + filler(60));
    expect(r.tier).not.toBe('trivial');
    expect(r.tier).toBe('médio');
  });

  it('"código" curto (<=12) vence pela régua de comprimento → trivial', () => {
    expect(classifyWhatsapp('código').tier).toBe('trivial');
  });

  it('"revisa o código" (>12) cai no sinal complex → complexo', () => {
    expect(classifyWhatsapp('revisa o código').tier).toBe('complexo');
  });
});

describe('route — imagem força sonnet', () => {
  it('imagem que cairia em haiku → model sonnet, mas sticky permanece haiku', () => {
    const r = route({ text: 'oi', hasImage: true, profile: 'whatsapp' });
    expect(r.model).toBe('sonnet');
    expect(r.stickyModel).toBe('haiku'); // sticky é o modelo PRÉ-imagem
    expect(r.effort).toBeNull();
  });

  it('imagem que NÃO cairia em haiku mantém o modelo da heurística', () => {
    const r = route({ text: 'analisa esse gráfico em detalhe', hasImage: true });
    expect(r.model).toBe('opus');
    expect(r.effort).toBe('high');
  });
});

describe('route — sticky model (só sobe)', () => {
  it('mensagem trivial com sticky em opus MANTÉM opus (não desce)', () => {
    const r = route({ text: 'oi', currentModel: 'opus' });
    expect(r.model).toBe('opus');
    expect(r.stickyModel).toBe('opus');
    expect(r.effort).toBeNull(); // kept → esforço não é forçado
  });

  it('mensagem complexa com sticky em haiku SOBE pra opus', () => {
    const r = route({ text: 'debug esse erro complexo no sistema', currentModel: 'haiku' });
    expect(r.model).toBe('opus');
    expect(r.stickyModel).toBe('opus');
    expect(r.effort).toBe('high');
  });

  it('mesmo tier do sticky mantém o modelo corrente (sem trocar)', () => {
    const r = route({ text: 'me manda o status do cliente texnet de hoje', currentModel: 'sonnet' });
    expect(r.model).toBe('sonnet');
    expect(r.stickyModel).toBe('sonnet');
  });
});

describe('route — override manual (hook de pin)', () => {
  it('forcedModel vence a heurística, zera o sticky e é "override"', () => {
    const r = route({ text: 'oi', ctx: { forcedModel: 'opus', forcedEffort: 'max' } });
    expect(r.source).toBe('override');
    expect(r.model).toBe('opus');
    expect(r.effort).toBe('max');
    expect(r.stickyModel).toBeNull();
    expect(r.reason).toBe('override manual');
  });

  it('override pra haiku ignora a classificação complexa', () => {
    const r = route({ text: 'analisa e refatora esse código todo', ctx: { forcedModel: 'haiku' } });
    expect(r.model).toBe('haiku');
    expect(r.effort).toBeNull(); // haiku não é effortable
  });

  it('override pra haiku + imagem ainda sobe pra sonnet (visão vence)', () => {
    const r = route({ text: 'x', hasImage: true, ctx: { forcedModel: 'haiku' } });
    expect(r.model).toBe('sonnet');
    expect(r.source).toBe('override');
  });
});

describe('route — esforço efetivo', () => {
  it('esforço é descartado em modelos não-effortable (sonnet)', () => {
    const r = route({ text: 'qualquer coisa', ctx: { forcedModel: 'sonnet', forcedEffort: 'high' } });
    expect(r.effort).toBeNull();
  });
});

describe('classifyPainel — calibrado (Fase 2): gate por SINAL', () => {
  // ── trivial → haiku: curto + só sinal leve, sem nada pesado ──
  it('ack curto → haiku', () => {
    expect(classifyPainel('ok')).toEqual({ tier: 'trivial', model: 'haiku', effort: null, reason: 'ack/saudação' });
  });
  it('saudação curta → haiku', () => {
    expect(classifyPainel('bom dia!').tier).toBe('trivial');
    expect(classifyPainel('valeu, fechou').tier).toBe('trivial');
  });

  // ── médio → sonnet: conversa/pergunta curta SEM sinal pesado ──
  it('pergunta leve curta (sem sinal pesado) → sonnet', () => {
    const r = classifyPainel('qual o status do cliente texnet hoje?');
    expect(r).toEqual({ tier: 'médio', model: 'sonnet', effort: null, reason: 'default' });
  });
  it('mensagem curta sem ack e sem pesado → sonnet (não vira haiku à toa)', () => {
    expect(classifyPainel('e o relatório do mês?').tier).toBe('médio');
  });

  // ── CURTO-MAS-PESADO (o ponto da Fase 2): tamanho NÃO rebaixa ──
  it('"audita o RLS do cortex" (24 chars) → opus, não sonnet', () => {
    const r = classifyPainel('audita o RLS do cortex');
    expect(r.model).toBe('opus');
    expect(r.effort).not.toBeNull();
  });
  it('verbo de ação curto → opus complexo high', () => {
    const r = classifyPainel('refatora isso');
    expect(r.tier).toBe('complexo');
    expect(r.model).toBe('opus');
    expect(r.effort).toBe('high');
  });
  it('noun técnico curto vence a pergunta leve (pesado > leve)', () => {
    const r = classifyPainel('como tá o deploy?');
    expect(r.model).toBe('opus');
  });
  it('chamada de função foo() → opus', () => {
    expect(classifyPainel('roda o route() de novo').model).toBe('opus');
  });
  it('path de arquivo → opus', () => {
    expect(classifyPainel('abre o src/services/cortex-router.ts').model).toBe('opus');
  });
  it('SQL → opus', () => {
    expect(classifyPainel('select * from clientes where ativo').model).toBe('opus');
  });
  it('desempate: "como faço pra refatorar o módulo?" → opus (pesado vence leve)', () => {
    expect(classifyPainel('como faço pra refatorar o módulo?').model).toBe('opus');
  });

  // ── crítico → opus xhigh: pesado + (len>600 OU 2+ sinais OU bloco de código) ──
  it('dois sinais pesados (delegação + verbo) → crítico xhigh', () => {
    const r = classifyPainel('manda o Atlas montar o fluxo do n8n');
    expect(r.tier).toBe('crítico');
    expect(r.effort).toBe('xhigh');
  });
  it('bloco de código sozinho → crítico xhigh (não máximo)', () => {
    const r = classifyPainel('olha esse erro:\n```ts\nconst x = 1\n```');
    expect(r.tier).toBe('crítico');
    expect(r.model).toBe('opus');
    expect(r.effort).toBe('xhigh');
  });
  it('pesado + denso (len>600) → crítico xhigh', () => {
    const r = classifyPainel('refatora ' + filler(620));
    expect(r.tier).toBe('crítico');
    expect(r.effort).toBe('xhigh');
  });

  // ── máximo → opus max: estratégia/arquitetura/roadmap; len>1500; código multi-parte ──
  it('keyword estratégica → máximo max', () => {
    const r = classifyPainel('qual a estratégia de produto pra 2026?');
    expect(r.tier).toBe('máximo');
    expect(r.effort).toBe('max');
  });
  it('arquitetura vence verbo (estratégico → máximo)', () => {
    expect(classifyPainel('revisa a arquitetura do sistema').tier).toBe('máximo');
  });
  it('texto muito longo (>1500) → máximo, mesmo sem sinal', () => {
    expect(classifyPainel(filler(1600)).tier).toBe('máximo');
  });
  it('código + pedido multi-parte (enumeração) → máximo', () => {
    const r = classifyPainel('faz isso:\n1. ajusta o schema\n2. roda a migration\n```sql\nselect 1\n```');
    expect(r.tier).toBe('máximo');
    expect(r.effort).toBe('max');
  });

  // ── tamanho puro escala (LONGO-LEVE, sem sinal pesado) ──
  it('longo-leve curto (<400) → sonnet', () => {
    expect(classifyPainel(filler(300)).tier).toBe('médio');
  });
  it('longo-leve 400–900 (sem sinal pesado) → complexo high (escalada por tamanho)', () => {
    const r = classifyPainel(filler(500));
    expect(r.tier).toBe('complexo');
    expect(r.effort).toBe('high');
  });
  it('longo-leve > 900 (sem sinal) → crítico xhigh', () => {
    expect(classifyPainel(filler(1000)).tier).toBe('crítico');
  });

  // ── boundary: substantivos não disparam verbo por radical compartilhado ──
  it('"validade do boleto" NÃO dispara verbo "valida" → fica sonnet', () => {
    expect(classifyPainel('qual a validade do boleto?').model).toBe('sonnet');
  });
  it('"montante de R$ 5 mil" NÃO dispara verbo "monta" → fica sonnet', () => {
    expect(classifyPainel('qual o montante de R$ 5 mil?').model).toBe('sonnet');
  });
});

describe('route — perfil painel: refinamentos universais ainda valem', () => {
  it('override manual vence a heurística calibrada', () => {
    const r = route({ text: 'audita o RLS do cortex', profile: 'painel', ctx: { forcedModel: 'haiku' } });
    expect(r.source).toBe('override');
    expect(r.model).toBe('haiku');
  });
  it('sticky só sobe: trivial com sticky em opus mantém opus', () => {
    const r = route({ text: 'ok', profile: 'painel', currentModel: 'opus' });
    expect(r.model).toBe('opus');
  });
  it('imagem força sonnet quando cairia em haiku, sticky permanece haiku', () => {
    const r = route({ text: 'ok', hasImage: true, profile: 'painel' });
    expect(r.model).toBe('sonnet');
    expect(r.stickyModel).toBe('haiku');
  });
  it('route propaga tier/model do classifier do painel (curto-pesado)', () => {
    const r = route({ text: 'refatora isso', profile: 'painel' });
    expect(r.model).toBe('opus');
    expect(r.tier).toBe('complexo');
  });
});
