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

describe('route — perfil painel (stub Fase 1)', () => {
  it('roteia tudo no default médio → sonnet, com reason de stub', () => {
    const r = route({ text: 'preciso de uma estratégia de arquitetura completa', profile: 'painel' });
    expect(r.model).toBe('sonnet');
    expect(r.tier).toBe('médio');
    expect(r.reason).toMatch(/stub/i);
  });

  it('classifyPainel ignora o conteúdo (sempre médio)', () => {
    expect(classifyPainel('debug crítico estratégico').tier).toBe('médio');
  });

  it('refinamentos universais ainda valem no painel (override)', () => {
    const r = route({ text: 'oi', profile: 'painel', ctx: { forcedModel: 'opus' } });
    expect(r.source).toBe('override');
    expect(r.model).toBe('opus');
  });
});
