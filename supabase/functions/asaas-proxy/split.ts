/**
 * Builder puro do array `split` do Asaas (POST /v3/payments).
 *
 * Isolado e sem dependência de runtime (sem Deno, sem supabase-js) de propósito:
 *  - a Edge Function (Deno) importa daqui via `./split.ts`;
 *  - o vitest (Node) testa a mesma função — fonte única, sem drift em código
 *    de pagamento.
 *
 * O contrato do Asaas: cada item do split referencia a `walletId` de uma conta
 * Asaas destinatária e divide por `percentualValue` (% do valor) OU `fixedValue`
 * (valor fixo em reais). Nunca os dois no mesmo item.
 */

/** Linha da tabela `split_recipients` (parceiro cadastrado com wallet Asaas). */
export interface SplitRecipientRow {
  id: string;
  wallet_id: string;
  name: string;
  active: boolean;
  default_percentual: number | null;
  default_fixed_value: number | null;
}

/** Input vindo da criação da cobrança — aponta pro parceiro + como dividir. */
export interface SplitInput {
  recipientId: string;
  /** % do valor (0 < p <= 100). Exclusivo com fixedValue. */
  percentualValue?: number;
  /** valor fixo em reais. Exclusivo com percentualValue. */
  fixedValue?: number;
}

/** Item do array `split` no payload do Asaas. */
export interface AsaasSplitEntry {
  walletId: string;
  percentualValue?: number;
  fixedValue?: number;
  externalReference?: string;
}

export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SplitError';
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Resolve inputs de split em entradas prontas pro Asaas, validando contra os
 * parceiros cadastrados e contra o valor da cobrança.
 *
 * @param inputs      splits pedidos na criação da cobrança
 * @param recipients  linhas de `split_recipients` relevantes (já carregadas)
 * @param chargeValue valor total da cobrança (BRL)
 */
export function buildSplitArray(
  inputs: SplitInput[],
  recipients: SplitRecipientRow[],
  chargeValue: number,
): AsaasSplitEntry[] {
  if (!Array.isArray(inputs) || inputs.length === 0) return [];
  if (!(chargeValue > 0)) throw new SplitError('valor da cobrança inválido pra split');

  const byId = new Map(recipients.map((r) => [r.id, r]));
  const entries: AsaasSplitEntry[] = [];
  let percentSum = 0;
  let fixedSum = 0;

  for (const input of inputs) {
    const recipient = byId.get(input.recipientId);
    if (!recipient) throw new SplitError(`parceiro de split não encontrado: ${input.recipientId}`);
    if (!recipient.active) throw new SplitError(`parceiro de split inativo: ${recipient.name}`);
    if (!recipient.wallet_id) throw new SplitError(`parceiro sem wallet_id: ${recipient.name}`);

    // Resolve o valor: input explícito > default do cadastro.
    let percentualValue = input.percentualValue ?? recipient.default_percentual ?? undefined;
    let fixedValue = input.fixedValue ?? undefined;
    // só usa fixed default se nem percent (input/default) nem fixed input vieram
    if (percentualValue === undefined && fixedValue === undefined) {
      fixedValue = recipient.default_fixed_value ?? undefined;
    }
    // input explícito de um lado anula o default do outro
    if (input.percentualValue !== undefined) fixedValue = undefined;
    if (input.fixedValue !== undefined) percentualValue = undefined;

    if (percentualValue !== undefined && fixedValue !== undefined) {
      throw new SplitError(`split de ${recipient.name}: use percentualValue OU fixedValue, não ambos`);
    }
    if (percentualValue === undefined && fixedValue === undefined) {
      throw new SplitError(`split de ${recipient.name}: defina percentualValue ou fixedValue (sem default cadastrado)`);
    }

    const entry: AsaasSplitEntry = { walletId: recipient.wallet_id, externalReference: recipient.id };
    if (percentualValue !== undefined) {
      if (!(percentualValue > 0) || percentualValue > 100) {
        throw new SplitError(`split de ${recipient.name}: percentualValue fora de 0–100`);
      }
      entry.percentualValue = round2(percentualValue);
      percentSum += percentualValue;
    } else {
      if (!(fixedValue! > 0)) throw new SplitError(`split de ${recipient.name}: fixedValue deve ser > 0`);
      entry.fixedValue = round2(fixedValue!);
      fixedSum += fixedValue!;
    }
    entries.push(entry);
  }

  if (round2(percentSum) > 100) {
    throw new SplitError(`soma dos percentuais de split (${round2(percentSum)}%) excede 100%`);
  }
  if (round2(fixedSum) >= chargeValue) {
    throw new SplitError(`soma dos valores fixos de split (R$${round2(fixedSum)}) >= valor da cobrança (R$${chargeValue})`);
  }

  return entries;
}
