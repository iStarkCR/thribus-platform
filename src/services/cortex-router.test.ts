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
  it('sonnet CARREGA esforço (Fase 3: a ponte repassa via forceEffort)', () => {
    const r = route({ text: 'qualquer coisa', ctx: { forcedModel: 'sonnet', forcedEffort: 'high' } });
    expect(r.effort).toBe('high');
  });
  it('haiku descarta esforço', () => {
    const r = route({ text: 'qualquer coisa', ctx: { forcedModel: 'haiku', forcedEffort: 'high' } });
    expect(r.effort).toBeNull();
  });
});

describe('classifyPainel — Fase 3: sonnet cavalo de batalha', () => {
  // ── trivial → haiku: curto + só sinal leve, sem nada pesado ──
  it('ack curto → haiku', () => {
    expect(classifyPainel('ok')).toEqual({ tier: 'trivial', model: 'haiku', effort: null, reason: 'ack/saudação' });
  });
  it('saudação curta → haiku', () => {
    expect(classifyPainel('bom dia!').tier).toBe('trivial');
    expect(classifyPainel('valeu, fechou').tier).toBe('trivial');
  });

  // ── médio → sonnet · medium: conversa/pergunta curta SEM sinal pesado ──
  it('pergunta leve curta (sem sinal pesado) → sonnet medium', () => {
    const r = classifyPainel('qual o status do cliente texnet hoje?');
    expect(r).toEqual({ tier: 'médio', model: 'sonnet', effort: 'medium', reason: 'default' });
  });
  it('mensagem curta sem ack e sem pesado → sonnet (não vira haiku à toa)', () => {
    expect(classifyPainel('e o relatório do mês?').tier).toBe('médio');
  });

  // ── um sinal pesado → sonnet · high (não mais opus) ──
  it('verbo de ação curto → sonnet complexo high', () => {
    const r = classifyPainel('refatora isso');
    expect(r.tier).toBe('complexo');
    expect(r.model).toBe('sonnet');
    expect(r.effort).toBe('high');
  });
  it('noun técnico curto → sonnet high (pesado > leve, mas sem opus)', () => {
    const r = classifyPainel('como tá o deploy?');
    expect(r.model).toBe('sonnet');
    expect(r.effort).toBe('high');
  });
  it('SQL sozinho → sonnet high', () => {
    expect(classifyPainel('select * from clientes where ativo').model).toBe('sonnet');
  });

  // ── denso (2+ sinais, código, pesado+longo) → sonnet · max ──
  it('"audita o RLS do cortex" → sonnet max (múltiplos sinais)', () => {
    const r = classifyPainel('audita o RLS do cortex');
    expect(r.tier).toBe('crítico');
    expect(r.model).toBe('sonnet');
    expect(r.effort).toBe('max');
  });
  it('bloco de código sozinho → sonnet max', () => {
    const r = classifyPainel('olha esse erro:\n```ts\nconst x = 1\n```');
    expect(r.tier).toBe('crítico');
    expect(r.model).toBe('sonnet');
    expect(r.effort).toBe('max');
  });
  it('estratégico solto ("qual a estratégia?") → sonnet max, NÃO opus', () => {
    const r = classifyPainel('qual a estratégia de produto pra 2026?');
    expect(r.tier).toBe('crítico');
    expect(r.model).toBe('sonnet');
    expect(r.effort).toBe('max');
  });

  // ── máximo → opus: SÓ dev pesado ou estratégico denso ──
  it('dev pesado (implementa + multi-parte) → opus', () => {
    const r = classifyPainel('implementa a feature completa de export CSV\n1. schema\n2. migration\n3. testes');
    expect(r.tier).toBe('máximo');
    expect(r.model).toBe('opus');
  });
  it('estratégico denso (arquitetura + multi-parte) → opus', () => {
    const r = classifyPainel('define a arquitetura do billing com trade-offs:\n1. opção A\n2. opção B');
    expect(r.tier).toBe('máximo');
    expect(r.model).toBe('opus');
  });
  it('opus só chega a max no extremo (estratégico + dev pesado)', () => {
    const r = classifyPainel('define a arquitetura e implementa a migração do zero do módulo de billing, com roadmap:\n1. a\n2. b');
    expect(r.model).toBe('opus');
    expect(r.effort).toBe('max');
  });

  // ── fable → só pedido explícito ──
  it('pedido explícito de fable → fable medium', () => {
    const r = classifyPainel('usa o fable pra essa análise');
    expect(r.model).toBe('fable');
    expect(r.effort).toBe('medium');
  });

  // ── tamanho puro escala DENTRO do sonnet ──
  it('longo-leve curto (<550) → sonnet médio', () => {
    expect(classifyPainel(filler(400)).tier).toBe('médio');
  });
  it('longo-leve 550–1100 → sonnet high', () => {
    const r = classifyPainel(filler(700));
    expect(r.model).toBe('sonnet');
    expect(r.effort).toBe('high');
  });
  it('longo-leve > 1100 → sonnet max', () => {
    const r = classifyPainel(filler(1200));
    expect(r.model).toBe('sonnet');
    expect(r.effort).toBe('max');
  });

  // ── boundary: substantivos não disparam verbo por radical compartilhado ──
  it('"validade do boleto" NÃO dispara verbo "valida" → fica sonnet medium', () => {
    const r = classifyPainel('qual a validade do boleto?');
    expect(r.tier).toBe('médio');
  });
  it('"montante de R$ 5 mil" NÃO dispara verbo "monta" → fica sonnet medium', () => {
    expect(classifyPainel('qual o montante de R$ 5 mil?').tier).toBe('médio');
  });
});

describe('route — perfil painel: refinamentos universais ainda valem', () => {
  it('override manual vence a heurística calibrada', () => {
    const r = route({ text: 'audita o RLS do cortex', profile: 'painel', ctx: { forcedModel: 'haiku' } });
    expect(r.source).toBe('override');
    expect(r.model).toBe('haiku');
  });
  it('sticky só sobe: trivial com sticky em opus mantém opus, com kept=true', () => {
    const r = route({ text: 'ok', profile: 'painel', currentModel: 'opus' });
    expect(r.model).toBe('opus');
    expect(r.kept).toBe(true);
  });
  it('classificação no próprio modelo → kept=false', () => {
    const r = route({ text: 'refatora isso', profile: 'painel' });
    expect(r.kept).toBe(false);
  });
  it('imagem força sonnet quando cairia em haiku, sticky permanece haiku', () => {
    const r = route({ text: 'ok', hasImage: true, profile: 'painel' });
    expect(r.model).toBe('sonnet');
    expect(r.stickyModel).toBe('haiku');
  });
  it('route propaga tier/model do classifier do painel (curto-pesado)', () => {
    const r = route({ text: 'refatora isso', profile: 'painel' });
    expect(r.model).toBe('sonnet');
    expect(r.tier).toBe('complexo');
  });
});
