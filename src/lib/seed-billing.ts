/**
 * Seed mock — Billing unificado (Stripe + Asaas).
 *
 * Stripe = internacional/cartão (SaaS B2B, BarberAI, CORTEX).
 * Asaas = BR (PIX/boleto/cartão) — usado pra clientes BR finais (Texnet via Asaas, etc).
 */

import type { StripeCustomer, StripeSubscription, StripeInvoice, StripeRefund } from '@/services/stripe';
import type { AsaasCustomer, AsaasCharge, AsaasSubscription } from '@/services/asaas';

// ─── Stripe mock ─────────────────────────────────────────────────────────
export const SEED_STRIPE_CUSTOMERS: StripeCustomer[] = [
  { id: 'cus_NA1Z9KsxPo', email: 'cto@texnet.com.br', name: 'TexNet Telecomunicações', created: 1730000000, defaultPaymentMethod: 'card_visa_4242', subscriptionsCount: 1, totalSpent: 8_940 },
  { id: 'cus_NB3X8LtqRp', email: 'admin@aionics.com', name: 'Aionics Studio', created: 1718000000, defaultPaymentMethod: 'card_mc_5555', subscriptionsCount: 2, totalSpent: 14_280 },
  { id: 'cus_NC5Y4MwqSr', email: 'financeiro@holdingtelecomsul.com.br', name: 'Holding Telecom Sul', created: 1722000000, defaultPaymentMethod: 'card_amex_3782', subscriptionsCount: 1, totalSpent: 4_780 },
  { id: 'cus_ND7Z2NxrTt', email: 'felipe@empresanova.com.br', name: 'Empresa Nova LTDA', created: 1735000000, subscriptionsCount: 0, totalSpent: 0 },
];

export const SEED_STRIPE_SUBSCRIPTIONS: StripeSubscription[] = [
  { id: 'sub_1NaA9KsxPo', customerId: 'cus_NA1Z9KsxPo', customerName: 'TexNet Telecomunicações', status: 'active', product: 'Thribus Agents — Enterprise', amount: 149_000, interval: 'month', currentPeriodEnd: 1748000000, cancelAtPeriodEnd: false },
  { id: 'sub_1NbB3LtqRp', customerId: 'cus_NB3X8LtqRp', customerName: 'Aionics Studio', status: 'active', product: 'Thribus Agents — Pro', amount: 49_000, interval: 'month', currentPeriodEnd: 1747500000, cancelAtPeriodEnd: false },
  { id: 'sub_2NbC5LtqRp', customerId: 'cus_NB3X8LtqRp', customerName: 'Aionics Studio', status: 'active', product: 'Marketplace Publisher Fee', amount: 9_900, interval: 'month', currentPeriodEnd: 1747500000, cancelAtPeriodEnd: false },
  { id: 'sub_1NcD5MwqSr', customerId: 'cus_NC5Y4MwqSr', customerName: 'Holding Telecom Sul', status: 'past_due', product: 'Thribus Agents — Enterprise', amount: 198_000, interval: 'month', currentPeriodEnd: 1746000000, cancelAtPeriodEnd: false },
];

export const SEED_STRIPE_INVOICES: StripeInvoice[] = [
  { id: 'in_1OaQwLsx', customerId: 'cus_NA1Z9KsxPo', customerName: 'TexNet Telecomunicações', number: 'THB-2026-0512', amount: 149_000, status: 'paid', createdAt: 1747000000, hostedInvoiceUrl: '#inv-1' },
  { id: 'in_1ObRxMsx', customerId: 'cus_NB3X8LtqRp', customerName: 'Aionics Studio', number: 'THB-2026-0511', amount: 58_900, status: 'paid', createdAt: 1746900000, hostedInvoiceUrl: '#inv-2' },
  { id: 'in_1OcSyNsx', customerId: 'cus_NC5Y4MwqSr', customerName: 'Holding Telecom Sul', number: 'THB-2026-0508', amount: 198_000, status: 'open', createdAt: 1746500000, dueDate: 1747300000, hostedInvoiceUrl: '#inv-3' },
  { id: 'in_1OdTzOsx', customerId: 'cus_NA1Z9KsxPo', customerName: 'TexNet Telecomunicações', number: 'THB-2026-0412', amount: 149_000, status: 'paid', createdAt: 1744500000, hostedInvoiceUrl: '#inv-4' },
];

export const SEED_STRIPE_REFUNDS: StripeRefund[] = [
  { id: 're_3Oa1Lsx', chargeId: 'ch_3PqWj9', amount: 19_990, reason: 'requested_by_customer', status: 'succeeded', createdAt: 1747100000 },
  { id: 're_3Ob2Mtx', chargeId: 'ch_3PqXm2', amount: 5_000, reason: 'duplicate', status: 'succeeded', createdAt: 1746800000 },
];

// ─── Asaas mock (BR) ─────────────────────────────────────────────────────
export const SEED_ASAAS_CUSTOMERS: AsaasCustomer[] = [
  { id: 'cus_000005881402', name: 'Padaria Pão Quente LTDA', cpfCnpj: '00.123.456/0001-90', email: 'pao.quente@gmail.com', phone: '5553955443322', city: 'Bagé/RS', createdAt: '2026-05-14T10:30:00Z', totalPaid: 0, pendingAmount: 199 },
  { id: 'cus_000005881411', name: 'José Carlos Oliveira', cpfCnpj: '123.456.789-00', email: 'jose.oliveira@hotmail.com', phone: '5553988776655', city: 'Bagé/RS', createdAt: '2024-08-22T15:00:00Z', totalPaid: 2_398, pendingAmount: 99.90 },
  { id: 'cus_000005881420', name: 'Maria Aparecida Silva', cpfCnpj: '456.789.012-34', email: 'maria.silva@gmail.com', phone: '5553991122334', city: 'Bagé/RS', createdAt: '2026-05-12T08:14:00Z', totalPaid: 0, pendingAmount: 79.90 },
  { id: 'cus_000005881430', name: 'Aline Souza', cpfCnpj: '789.012.345-67', phone: '5553977665544', city: 'Aceguá/RS', createdAt: '2023-02-10T11:00:00Z', totalPaid: 5_198, pendingAmount: 159.90 },
];

export const SEED_ASAAS_CHARGES: AsaasCharge[] = [
  { id: 'pay_5331819091', customerId: 'cus_000005881402', customerName: 'Padaria Pão Quente LTDA', value: 199.00, netValue: 197.01, billingType: 'PIX', status: 'PENDING', dueDate: '2026-05-19', pixQrCode: '00020126360014BR.GOV.BCB.PIX0114+5553999999995204000053039865802BR5925THRIBUS TECH SISTEMAS6009SAO PAULO62290525YQGgEPiX2026051912345-630470F2', pixCopyPaste: '00020126360014BR.GOV.BCB.PIX...', description: 'Instalação fibra 1Gbps + Wi-Fi mesh' },
  { id: 'pay_5331819092', customerId: 'cus_000005881420', customerName: 'Maria Aparecida Silva', value: 79.90, netValue: 78.31, billingType: 'PIX', status: 'PENDING', dueDate: '2026-05-20', pixQrCode: '00020126360014BR.GOV.BCB...', description: 'Mensalidade Fibra 600 (promo 3m)' },
  { id: 'pay_5331819093', customerId: 'cus_000005881411', customerName: 'José Carlos Oliveira', value: 99.90, netValue: 97.92, billingType: 'BOLETO', status: 'OVERDUE', dueDate: '2026-05-10', boletoUrl: '#boleto-1', description: 'Mensalidade Fibra 300 — abril' },
  { id: 'pay_5331819094', customerId: 'cus_000005881430', customerName: 'Aline Souza', value: 159.90, netValue: 156.74, billingType: 'PIX', status: 'CONFIRMED', dueDate: '2026-05-15', paymentDate: '2026-05-15T09:42:00Z', description: 'Mensalidade Fibra 1Gbps — maio' },
  { id: 'pay_5331819095', customerId: 'cus_000005881411', customerName: 'José Carlos Oliveira', value: 99.90, netValue: 97.92, billingType: 'PIX', status: 'RECEIVED', dueDate: '2026-04-10', paymentDate: '2026-04-12T18:30:00Z', description: 'Mensalidade Fibra 300 — março' },
  { id: 'pay_5331819096', customerId: 'cus_000005881402', customerName: 'Padaria Pão Quente LTDA', value: 350.00, netValue: 346.50, billingType: 'PIX', status: 'PENDING', dueDate: '2026-06-01', description: 'Mensalidade PJ Fibra 1Gbps comercial' },
];

export const SEED_ASAAS_SUBSCRIPTIONS: AsaasSubscription[] = [
  { id: 'sub_aaa111', customerId: 'cus_000005881411', customerName: 'José Carlos Oliveira', value: 99.90, cycle: 'MONTHLY', nextDueDate: '2026-06-10', billingType: 'BOLETO', status: 'ACTIVE', description: 'Fibra 300 mensal' },
  { id: 'sub_aaa222', customerId: 'cus_000005881430', customerName: 'Aline Souza', value: 159.90, cycle: 'MONTHLY', nextDueDate: '2026-06-15', billingType: 'PIX', status: 'ACTIVE', description: 'Fibra 1Gbps mensal' },
  { id: 'sub_aaa333', customerId: 'cus_000005881402', customerName: 'Padaria Pão Quente LTDA', value: 350.00, cycle: 'MONTHLY', nextDueDate: '2026-06-01', billingType: 'PIX', status: 'ACTIVE', description: 'PJ Fibra 1Gbps' },
];

// ─── Resumo financeiro consolidado ───────────────────────────────────────
export const BILLING_SUMMARY = {
  totalMRRBRL: 8_940 + 1_280 + 9_700 + 250 + 99.90 + 159.90 + 350.00,
  totalMRRStripeUSD: 1_490 + 490 + 99 + 1_980,
  pendingBoletoBRL: 99.90 + 350.00,
  pendingPixBRL: 199 + 79.90 + 99.90 + 350.00,
  overdueBRL: 99.90,
  refundedLast30dUSD: 199.90 + 50,
  netNewCustomers30d: 7,
  churn30d: 1,
};
