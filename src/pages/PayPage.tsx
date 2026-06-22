/**
 * PayPage — página de pagamento pública da Thribus Tech (/pay/:id).
 *
 * Substitui a fatura padrão do Asaas por um checkout com identidade Thribus.
 * Lê a cobrança via asaas-proxy (action `charges.get`, read-only). Sem login.
 *
 * Tema claro, independente do tema do painel (cores explícitas aqui).
 * Métodos: PIX (QR + copia-cola), boleto (PDF + linha digitável) e fallback
 * pro checkout hospedado do Asaas (cartão / Open Finance). Mostra a NF quando
 * emitida.
 */

import { useEffect, useState } from 'react';
import {
  ShieldCheck, Copy, Check, QrCode, Barcode, CreditCard,
  CalendarClock, AlertTriangle, CheckCircle2, Loader2, ExternalLink,
  FileText, Clock,
} from 'lucide-react';
import { getPublicCharge, type AsaasPublicCharge, type AsaasChargeStatus } from '@/services/asaas';

// Entidade que cobra (dados públicos da fatura). Ajuste aqui se mudar.
const BILLER = {
  name: 'Thribus Tech',
  legal: 'Antonio Charles Andrade da Costa',
  cnpj: '53.415.734/0001-06',
  email: 'charles@thribus.com.br',
  phone: '(85) 99791-8646',
  site: 'thribus.com.br',
};

// Paleta clara — Verde Sage Thribus sobre branco/creme.
const C = {
  page: '#f4f6f1',
  card: '#ffffff',
  inset: '#f7f9f4',
  border: '#e6e9e0',
  borderSage: '#d7e3cd',
  ink: '#1b211a',
  ink2: '#565c52',
  ink3: '#8a9083',
  faint: '#a7ad9f',
  sage: '#5f8a4e',
  sageInk: '#3f6b32',
  sageSoft: '#eef4e8',
  amberBg: '#fdf1dd', amberInk: '#a86f12',
  greenBg: '#e7f3e2', greenInk: '#3a7a2e',
  redInk: '#c0392b',
  grayBg: '#eef0ea', grayInk: '#6b7064',
};

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const due = new Date(iso.slice(0, 10) + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

type StatusKind = 'pending' | 'paid' | 'overdue' | 'refunded';
const STATUS: Record<string, { kind: StatusKind; label: string }> = {
  PENDING: { kind: 'pending', label: 'Aguardando pagamento' },
  AWAITING_RISK_ANALYSIS: { kind: 'pending', label: 'Em análise' },
  RECEIVED: { kind: 'paid', label: 'Pago' },
  CONFIRMED: { kind: 'paid', label: 'Pago' },
  RECEIVED_IN_CASH: { kind: 'paid', label: 'Pago' },
  OVERDUE: { kind: 'overdue', label: 'Vencido' },
  REFUNDED: { kind: 'refunded', label: 'Estornado' },
  REFUND_REQUESTED: { kind: 'refunded', label: 'Estorno solicitado' },
  CHARGEBACK: { kind: 'refunded', label: 'Chargeback' },
};
const statusOf = (s: AsaasChargeStatus | string) =>
  STATUS[s] ?? { kind: 'pending' as StatusKind, label: 'Aguardando pagamento' };

export function PayPage({ chargeId = '' }: { chargeId?: string }) {
  const id = chargeId;
  const [charge, setCharge] = useState<AsaasPublicCharge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    getPublicCharge(id)
      .then((c) => { if (alive) setCharge(c); })
      .catch((e) => { if (alive) setError(e?.message ?? 'Cobrança não encontrada'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  return (
    <div
      className="relative min-h-screen w-full overflow-x-hidden font-sans"
      style={{ background: C.page, color: C.ink }}
    >
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(900px 460px at 50% -10%, rgba(95,138,78,0.10), transparent 62%),' +
            'radial-gradient(680px 380px at 90% 4%, rgba(176,138,56,0.05), transparent 55%)',
        }}
      />

      <div className="mx-auto w-full max-w-[600px] px-4 py-10 sm:py-14">
        <BrandHeader />

        {loading && <CenterState icon={<Loader2 className="animate-spin" size={22} style={{ color: C.sage }} />} text="Carregando cobrança…" />}
        {!loading && error && (
          <CenterState
            icon={<AlertTriangle size={22} style={{ color: C.redInk }} />}
            text="Não foi possível abrir esta cobrança."
            sub={error}
          />
        )}
        {!loading && charge && <ChargeView charge={charge} />}

        <Footer />
      </div>
    </div>
  );
}

function BrandHeader() {
  return (
    <header className="mb-7 flex items-center justify-between">
      <div className="leading-tight">
        <div className="text-[19px] font-extrabold tracking-tight" style={{ color: C.sageInk }}>
          Thribus<span style={{ color: C.ink }}> Tech</span>
        </div>
        <div className="text-[11.5px]" style={{ color: C.ink3 }}>Colaboradores Digitais &amp; AI</div>
      </div>
      <div className="hidden items-center gap-1.5 text-[11.5px] sm:flex" style={{ color: C.ink3 }}>
        <ShieldCheck size={14} style={{ color: C.sage }} />
        Pagamento seguro
      </div>
    </header>
  );
}

function ChargeView({ charge }: { charge: AsaasPublicCharge }) {
  const st = statusOf(charge.status);
  const due = daysUntil(charge.dueDate);
  const hasFees = (charge.fine ?? 0) > 0 || (charge.interest ?? 0) > 0;

  return (
    <main className="space-y-4">
      {/* Cartão principal: valor + status */}
      <section className="overflow-hidden rounded-2xl" style={{ background: C.card, border: `1px solid ${C.border}` }}>
        <div className="px-6 py-5" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[12px] font-medium uppercase tracking-wide" style={{ color: C.ink3 }}>Valor a pagar</div>
              <div className="mt-1 text-[34px] font-extrabold leading-none tracking-tight" style={{ color: C.ink }}>{brl(charge.value)}</div>
            </div>
            <StatusPill kind={st.kind} label={st.label} />
          </div>
          {charge.invoiceNumber && (
            <div className="mt-3 text-[12px]" style={{ color: C.faint }}>Fatura nº {charge.invoiceNumber}</div>
          )}
        </div>

        <div className="grid grid-cols-2" style={{ background: C.border, gap: '1px' }}>
          <Field icon={<CalendarClock size={14} />} label="Vencimento">
            <span>{fmtDate(charge.dueDate)}</span>
            {due !== null && st.kind === 'pending' && (
              <span className="ml-1.5 text-[11.5px]" style={{ color: C.faint }}>
                {due === 0 ? '(hoje)' : due > 0 ? `(em ${due} ${due === 1 ? 'dia' : 'dias'})` : `(${-due}d em atraso)`}
              </span>
            )}
          </Field>
          <Field icon={<AlertTriangle size={14} />} label="Após o vencimento">
            {hasFees ? (
              <span className="text-[13px]">
                {(charge.fine ?? 0) > 0 && `${brl(charge.fine)} multa`}
                {(charge.fine ?? 0) > 0 && (charge.interest ?? 0) > 0 && ' · '}
                {(charge.interest ?? 0) > 0 && `${charge.interest}% juros/mês`}
              </span>
            ) : (
              <span style={{ color: C.ink3 }}>Sem acréscimo</span>
            )}
          </Field>
        </div>

        {charge.description && (
          <div className="px-6 py-4" style={{ borderTop: `1px solid ${C.border}` }}>
            <div className="text-[11.5px] font-medium uppercase tracking-wide" style={{ color: C.ink3 }}>Descrição</div>
            <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: C.ink2 }}>{charge.description}</p>
          </div>
        )}

        {charge.buyerName && (
          <div className="px-6 py-4" style={{ borderTop: `1px solid ${C.border}` }}>
            <div className="text-[11.5px] font-medium uppercase tracking-wide" style={{ color: C.ink3 }}>Pagador</div>
            <div className="mt-1 text-[13.5px] font-medium" style={{ color: C.ink }}>{charge.buyerName}</div>
            {charge.buyerEmail && <div className="text-[12.5px]" style={{ color: C.ink3 }}>{charge.buyerEmail}</div>}
          </div>
        )}
      </section>

      {/* Pagamento ou comprovante */}
      {st.kind === 'paid' ? (
        <PaidBanner charge={charge} />
      ) : st.kind === 'refunded' ? (
        <InfoBanner text={`Esta cobrança consta como ${st.label.toLowerCase()}.`} />
      ) : (
        <PaymentMethods charge={charge} />
      )}

      {/* Nota fiscal */}
      <NotaFiscal charge={charge} />
    </main>
  );
}

function PaymentMethods({ charge }: { charge: AsaasPublicCharge }) {
  return (
    <div className="space-y-4">
      {charge.pixCopyPaste && <PixCard charge={charge} />}
      {charge.boletoUrl && <BoletoCard charge={charge} />}
      {charge.invoiceUrl && (
        <a
          href={charge.invoiceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-2xl px-5 py-4 transition-colors"
          style={{ background: C.card, border: `1px solid ${C.border}` }}
        >
          <span className="flex items-center gap-3">
            <CreditCard size={18} style={{ color: C.sage }} />
            <span>
              <span className="block text-[13.5px] font-semibold" style={{ color: C.ink }}>Cartão de crédito ou Open Finance</span>
              <span className="block text-[12px]" style={{ color: C.ink3 }}>Pague com seu banco ou parcele no cartão</span>
            </span>
          </span>
          <ExternalLink size={15} style={{ color: C.faint }} />
        </a>
      )}
    </div>
  );
}

function PixCard({ charge }: { charge: AsaasPublicCharge }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(charge.pixCopyPaste!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch { /* clipboard bloqueado — usuário copia manual */ }
  };
  return (
    <section className="rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.borderSage}` }}>
      <div className="mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: C.ink }}>
          <QrCode size={18} style={{ color: C.sage }} /> Pagar com PIX
        </span>
        <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: C.sageSoft, color: C.sageInk }}>
          Mais rápido
        </span>
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {charge.pixQrCode && (
          <div className="shrink-0 rounded-xl p-2.5" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
            <img
              src={`data:image/png;base64,${charge.pixQrCode}`}
              alt="QR Code PIX"
              className="h-40 w-40"
            />
          </div>
        )}
        <div className="w-full">
          <p className="text-[12.5px] leading-relaxed" style={{ color: C.ink2 }}>
            Abra o app do seu banco, escolha <span style={{ color: C.ink }}>PIX → Pagar com QR Code</span> e
            aponte para o código. Ou use o PIX copia-e-cola:
          </p>
          <button
            onClick={copy}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: C.sage }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Código copiado!' : 'Copiar código PIX'}
          </button>
          <p className="mt-2 break-all rounded-lg px-3 py-2 font-mono text-[10.5px] leading-relaxed" style={{ background: C.inset, color: C.ink3, border: `1px solid ${C.border}` }}>
            {charge.pixCopyPaste}
          </p>
        </div>
      </div>
    </section>
  );
}

function BoletoCard({ charge }: { charge: AsaasPublicCharge }) {
  const [copied, setCopied] = useState(false);
  const copyLine = async () => {
    if (!charge.boletoLine) return;
    try {
      await navigator.clipboard.writeText(charge.boletoLine);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch { /* segue */ }
  };
  return (
    <section className="rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <div className="mb-4 flex items-center gap-2 text-[14px] font-semibold" style={{ color: C.ink }}>
        <Barcode size={18} style={{ color: C.sage }} /> Boleto bancário
      </div>
      {charge.boletoLine && (
        <p className="mb-3 break-all rounded-lg px-3 py-2 font-mono text-[11px] leading-relaxed" style={{ background: C.inset, color: C.ink2, border: `1px solid ${C.border}` }}>
          {charge.boletoLine}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        {charge.boletoLine && (
          <button
            onClick={copyLine}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13.5px] font-semibold transition-colors"
            style={{ border: `1px solid ${C.border}`, color: C.ink, background: C.card }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Linha copiada!' : 'Copiar linha digitável'}
          </button>
        )}
        <a
          href={charge.boletoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13.5px] font-semibold transition-colors text-white"
          style={{ background: C.sage }}
        >
          <ExternalLink size={15} /> Abrir boleto (PDF)
        </a>
      </div>
    </section>
  );
}

function NotaFiscal({ charge }: { charge: AsaasPublicCharge }) {
  const nf = charge.nf;
  const authorized = nf?.status === 'AUTHORIZED' && nf?.pdfUrl;

  return (
    <section className="rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <div className="mb-1 flex items-center gap-2 text-[14px] font-semibold" style={{ color: C.ink }}>
        <FileText size={18} style={{ color: C.sage }} /> Nota fiscal
        {nf?.number && <span className="text-[12.5px] font-normal" style={{ color: C.ink3 }}>nº {nf.number}</span>}
      </div>

      {authorized ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <a
            href={nf.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: C.sage }}
          >
            <FileText size={15} /> Baixar nota fiscal (PDF)
          </a>
          {nf.xmlUrl && (
            <a
              href={nf.xmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13.5px] font-semibold transition-colors"
              style={{ border: `1px solid ${C.border}`, color: C.ink }}
            >
              <ExternalLink size={15} /> Baixar XML
            </a>
          )}
        </div>
      ) : nf ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px]" style={{ color: C.ink3 }}>
          <Clock size={14} /> Nota fiscal em processamento — disponível em instantes.
        </p>
      ) : (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px]" style={{ color: C.ink3 }}>
          <Clock size={14} /> A nota fiscal é emitida após a confirmação do pagamento e aparece aqui.
        </p>
      )}
    </section>
  );
}

function PaidBanner({ charge }: { charge: AsaasPublicCharge }) {
  return (
    <section className="rounded-2xl px-5 py-6 text-center" style={{ background: C.greenBg, border: `1px solid ${C.borderSage}` }}>
      <CheckCircle2 size={32} className="mx-auto" style={{ color: C.greenInk }} />
      <div className="mt-2 text-[15px] font-semibold" style={{ color: C.ink }}>Pagamento confirmado</div>
      <p className="mt-1 text-[12.5px]" style={{ color: C.ink2 }}>
        Recebemos {brl(charge.value)}
        {charge.paymentDate ? ` em ${fmtDate(charge.paymentDate)}` : ''}. Obrigado!
      </p>
      {charge.invoiceUrl && (
        <a
          href={charge.invoiceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline"
          style={{ color: C.sageInk }}
        >
          Ver comprovante <ExternalLink size={13} />
        </a>
      )}
    </section>
  );
}

function StatusPill({ kind, label }: { kind: StatusKind; label: string }) {
  const styles: Record<StatusKind, { bg: string; fg: string }> = {
    pending: { bg: C.amberBg, fg: C.amberInk },
    paid: { bg: C.greenBg, fg: C.greenInk },
    overdue: { bg: '#fbe7e4', fg: C.redInk },
    refunded: { bg: C.grayBg, fg: C.grayInk },
  };
  const s = styles[kind];
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: s.bg, color: s.fg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />
      {label}
    </span>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-4" style={{ background: C.card }}>
      <div className="flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wide" style={{ color: C.ink3 }}>
        <span style={{ color: C.sage }}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-[14px] font-medium" style={{ color: C.ink }}>{children}</div>
    </div>
  );
}

function InfoBanner({ text }: { text: string }) {
  return (
    <section className="rounded-2xl px-5 py-4 text-center text-[13px]" style={{ background: C.card, border: `1px solid ${C.border}`, color: C.ink3 }}>
      {text}
    </section>
  );
}

function CenterState({ icon, text, sub }: { icon: React.ReactNode; text: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-16 text-center" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      {icon}
      <div className="text-[13.5px] font-medium" style={{ color: C.ink2 }}>{text}</div>
      {sub && <div className="max-w-[80%] text-[12px]" style={{ color: C.faint }}>{sub}</div>}
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-8 space-y-1.5 text-center text-[11px] leading-relaxed" style={{ color: C.faint }}>
      <div className="flex items-center justify-center gap-1.5" style={{ color: C.ink3 }}>
        <ShieldCheck size={13} style={{ color: C.sage }} />
        Processado com segurança via Asaas (gateway homologado pelo Banco Central)
      </div>
      <div>{BILLER.legal} · CNPJ {BILLER.cnpj}</div>
      <div>
        {BILLER.email} · {BILLER.phone} · {BILLER.site}
      </div>
    </footer>
  );
}
