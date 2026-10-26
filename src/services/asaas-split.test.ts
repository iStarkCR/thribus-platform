import { describe, expect, it } from 'vitest';
// Fonte única: o builder vive na Edge Function (Deno) e é testado aqui (Node).
import {
  buildSplitArray,
  SplitError,
  type SplitRecipientRow,
} from '../../supabase/functions/asaas-proxy/split';

const partner = (over: Partial<SplitRecipientRow> = {}): SplitRecipientRow => ({
  id: 'r1',
  wallet_id: 'wal_abc',
  name: 'Parceiro 1',
  active: true,
  default_percentual: null,
  default_fixed_value: null,
  ...over,
});

describe('buildSplitArray', () => {
  it('sem inputs → array vazio (cobrança normal)', () => {
    expect(buildSplitArray([], [partner()], 100)).toEqual([]);
  });

  it('percentualValue explícito monta entrada com walletId', () => {
    const out = buildSplitArray([{ recipientId: 'r1', percentualValue: 10 }], [partner()], 200);
    expect(out).toEqual([{ walletId: 'wal_abc', externalReference: 'r1', percentualValue: 10 }]);
  });

  it('fixedValue explícito', () => {
    const out = buildSplitArray([{ recipientId: 'r1', fixedValue: 25 }], [partner()], 200);
    expect(out).toEqual([{ walletId: 'wal_abc', externalReference: 'r1', fixedValue: 25 }]);
  });

  it('usa default_percentual quando input não especifica', () => {
    const out = buildSplitArray([{ recipientId: 'r1' }], [partner({ default_percentual: 15 })], 200);
    expect(out[0].percentualValue).toBe(15);
  });

  it('usa default_fixed_value quando input não especifica', () => {
    const out = buildSplitArray([{ recipientId: 'r1' }], [partner({ default_fixed_value: 30 })], 200);
    expect(out[0].fixedValue).toBe(30);
  });

  it('input percentual sobrescreve default fixed', () => {
    const out = buildSplitArray(
      [{ recipientId: 'r1', percentualValue: 5 }],
      [partner({ default_fixed_value: 30 })],
      200,
    );
    expect(out[0]).toEqual({ walletId: 'wal_abc', externalReference: 'r1', percentualValue: 5 });
  });

  it('múltiplos parceiros somando <= 100%', () => {
    const out = buildSplitArray(
      [{ recipientId: 'r1', percentualValue: 40 }, { recipientId: 'r2', percentualValue: 30 }],
      [partner(), partner({ id: 'r2', wallet_id: 'wal_xyz', name: 'P2' })],
      500,
    );
    expect(out).toHaveLength(2);
  });

  it('erro: parceiro inexistente', () => {
    expect(() => buildSplitArray([{ recipientId: 'ghost' }], [partner()], 100)).toThrow(SplitError);
  });

  it('erro: parceiro inativo', () => {
    expect(() => buildSplitArray([{ recipientId: 'r1', percentualValue: 10 }], [partner({ active: false })], 100))
      .toThrow(/inativo/);
  });

  it('erro: sem valor e sem default', () => {
    expect(() => buildSplitArray([{ recipientId: 'r1' }], [partner()], 100)).toThrow(/defina percentualValue/);
  });

  it('erro: percentual > 100 individual', () => {
    expect(() => buildSplitArray([{ recipientId: 'r1', percentualValue: 150 }], [partner()], 100))
      .toThrow(/0.100/);
  });

  it('erro: soma dos percentuais > 100', () => {
    expect(() => buildSplitArray(
      [{ recipientId: 'r1', percentualValue: 60 }, { recipientId: 'r2', percentualValue: 50 }],
      [partner(), partner({ id: 'r2', wallet_id: 'wal_xyz' })],
      100,
    )).toThrow(/excede 100/);
  });

  it('erro: soma dos fixos >= valor da cobrança', () => {
    expect(() => buildSplitArray([{ recipientId: 'r1', fixedValue: 100 }], [partner()], 100))
      .toThrow(/>= valor da cobrança/);
  });

  it('erro: wallet_id vazio', () => {
    expect(() => buildSplitArray([{ recipientId: 'r1', percentualValue: 10 }], [partner({ wallet_id: '' })], 100))
      .toThrow(/wallet_id/);
  });

  it('erro: valor da cobrança inválido', () => {
    expect(() => buildSplitArray([{ recipientId: 'r1', percentualValue: 10 }], [partner()], 0))
      .toThrow(/valor da cobrança inválido/);
  });
});
