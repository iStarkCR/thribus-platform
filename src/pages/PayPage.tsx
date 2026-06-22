/**
 * PayPage — página de pagamento pública da Thribus Tech (/pay/:id).
 *
 * Substitui a fatura padrão do Asaas por um checkout com identidade Thribus.
 * Lê a cobrança via asaas-proxy (action `charges.get`, read-only). Sem login.
 *
 * Métodos: PIX (QR + copia-cola), boleto (PDF + linha digitável) e fallback
 * pro checkout hospedado do Asaas (cartão / Open Finance) via invoiceUrl.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ShieldCheck, Copy, Check, QrCode, Barcode, CreditCard,
  CalendarClock, AlertTriangle, CheckCircle2, Loader2, ExternalLink,
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

export function PayPage() {
  const { id = '' } = useParams();
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
    <div className="relative min-h-screen w-full overflow-x-hidden bg-surface-0 text-creme font-sans">
      {/* aurora sutil ao fundo */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(900px 480px at 50% -8%, rgb(var(--brand-glow) / 0.16), transparent 60%),' +
            'radial-gradient(700px 420px at 88% 6%, rgb(var(--gold) / 0.07), transparent 55%)',
        }}
      />

      <div className="mx-auto w-full max-w-[600px] px-4 py-10 sm:py-14">
        <BrandHeader />

        {loading && <CenterState icon={<Loader2 className="animate-spin" size={22} />} text="Carregando cobrança…" />}
        {!loading && error && (
          <CenterState
            icon={<AlertTriangle size={22} className="text-semantic-red" />}
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
      <div className="flex items-center gap-3">
        <div
          className="grid h-10 w-10 place-items-center rounded-xl text-[15px] font-extrabold shadow-lg"
          style={{ background: 'rgb(var(--brand))', color: '#0d140d', boxShadow: '0 6px 20px rgb(var(--brand-glow) / 0.25)' }}
        >
          Tt
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight">{BILLER.name}</div>
          <div className="text-[11.5px] text-creme-mute">Colaboradores Digitais &amp; AI</div>
        </div>
      </div>
      <div className="hidden items-center gap-1.5 text-[11.5px] text-creme-mute sm:flex">
        <ShieldCheck size={14} className="text-brand-bright" />
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
      <section className="overflow-hidden rounded-2xl border border-default bg-surface-1">
        <div className="border-b border-default px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[12px] font-medium uppercase tracking-wide text-creme-mute">Valor a pagar</div>
              <div className="mt-1 text-[34px] font-extrabold leading-none tracking-tight">{brl(charge.value)}</div>
            </div>
            <StatusPill kind={st.kind} label={st.label} />
          </div>
          {charge.invoiceNumber && (
            <div className="mt-3 text-[12px] text-creme-faint">Fatura nº {charge.invoiceNumber}</div>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-px bg-[rgb(var(--border-default)/0.12)]">
          <Field icon={<CalendarClock size={14} />} label="Vencimento">
            <span>{fmtDate(charge.dueDate)}</span>
            {due !== null && st.kind === 'pending' && (
              <span className="ml-1.5 text-[11.5px] text-creme-faint">
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
              <span className="text-creme-mute">Sem acréscimo</span>
            )}
          </Field>
        </dl>

        {charge.description && (
          <div className="border-t border-default px-6 py-4">
            <div className="text-[11.5px] font-medium uppercase tracking-wide text-creme-mute">Descrição</div>
            <p className="mt-1 text-[13.5px] leading-relaxed text-creme-dim">{charge.description}</p>
          </div>
        )}

        {charge.buyerName && (
          <div className="border-t border-default px-6 py-4">
            <div className="text-[11.5px] font-medium uppercase tracking-wide text-creme-mute">Pagador</div>
            <div className="mt-1 text-[13.5px] font-medium">{charge.buyerName}</div>
            {charge.buyerEmail && <div className="text-[12.5px] text-creme-mute">{charge.buyerEmail}</div>}
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
          className="flex items-center justify-between rounded-2xl border border-default bg-surface-1 px-5 py-4 transition-colors hover:border-hover hover:bg-surface-2"
        >
          <span className="flex items-center gap-3">
            <CreditCard size={18} className="text-brand-bright" />
            <span>
              <span className="block text-[13.5px] font-semibold">Cartão de crédito ou Open Finance</span>
              <span className="block text-[12px] text-creme-mute">Pague com seu banco ou parcele no cartão</span>
            </span>
          </span>
          <ExternalLink size={15} className="text-creme-faint" />
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
    <section className="rounded-2xl border border-brand/30 bg-surface-1 p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[14px] font-semibold">
          <QrCode size={18} className="text-brand-bright" /> Pagar com PIX
        </span>
        <span className="rounded-full bg-brand/15 px-2.5 py-0.5 text-[11px] font-semibold text-brand-bright">
          Mais rápido
        </span>
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {charge.pixQrCode && (
          <div className="shrink-0 rounded-xl bg-white p-2.5">
            <img
              src={`data:image/png;base64,${charge.pixQrCode}`}
              alt="QR Code PIX"
              className="h-40 w-40"
            />
          </div>
        )}
        <div className="w-full">
          <p className="text-[12.5px] leading-relaxed text-creme-mute">
            Abra o app do seu banco, escolha <span className="text-creme-dim">PIX → Pagar com QR Code</span> e
            aponte para o código. Ou use o PIX copia-e-cola:
          </p>
          <button
            onClick={copy}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-[13.5px] font-semibold text-[#0d140d] transition-opacity hover:opacity-90"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Código copiado!' : 'Copiar código PIX'}
          </button>
          <p className="mt-2 break-all rounded-lg bg-surface-0/60 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-creme-faint">
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
    <section className="rounded-2xl border border-default bg-surface-1 p-5">
      <div className="mb-4 flex items-center gap-2 text-[14px] font-semibold">
        <Barcode size={18} className="text-brand-bright" /> Boleto bancário
      </div>
      {charge.boletoLine && (
        <p className="mb-3 break-all rounded-lg bg-surface-0/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-creme-dim">
          {charge.boletoLine}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        {charge.boletoLine && (
          <button
            onClick={copyLine}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-default px-4 py-3 text-[13.5px] font-semibold text-creme transition-colors hover:bg-surface-2"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Linha copiada!' : 'Copiar linha digitável'}
          </button>
        )}
        <a
          href={charge.boletoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface-3 px-4 py-3 text-[13.5px] font-semibold text-creme transition-colors hover:bg-surface-4"
        >
          <ExternalLink size={15} /> Abrir boleto (PDF)
        </a>
      </div>
    </section>
  );
}

function PaidBanner({ charge }: { charge: AsaasPublicCharge }) {
  return (
    <section className="rounded-2xl border border-semantic-green/30 bg-semantic-green/10 px-5 py-6 text-center">
      <CheckCircle2 size={32} className="mx-auto text-semantic-green" />
      <div className="mt-2 text-[15px] font-semibold">Pagamento confirmado</div>
      <p className="mt-1 text-[12.5px] text-creme-mute">
        Recebemos {brl(charge.value)}
        {charge.paymentDate ? ` em ${fmtDate(charge.paymentDate)}` : ''}. Obrigado!
      </p>
      {charge.invoiceUrl && (
        <a
          href={charge.invoiceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-bright hover:underline"
        >
          Ver comprovante <ExternalLink size={13} />
        </a>
      )}
    </section>
  );
}

function StatusPill({ kind, label }: { kind: StatusKind; label: string }) {
  const styles: Record<StatusKind, string> = {
    pending: 'bg-semantic-amber/15 text-semantic-amber',
    paid: 'bg-semantic-green/15 text-semantic-green',
    overdue: 'bg-semantic-red/15 text-semantic-red',
    refunded: 'bg-creme-faint/15 text-creme-mute',
  };
  return (
    <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${styles[kind]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-1 px-6 py-4">
      <div className="flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wide text-creme-mute">
        <span className="text-brand-bright">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-[14px] font-medium text-creme">{children}</div>
    </div>
  );
}

function InfoBanner({ text }: { text: string }) {
  return (
    <section className="rounded-2xl border border-default bg-surface-1 px-5 py-4 text-center text-[13px] text-creme-mute">
      {text}
    </section>
  );
}

function CenterState({ icon, text, sub }: { icon: React.ReactNode; text: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-default bg-surface-1 px-6 py-16 text-center">
      {icon}
      <div className="text-[13.5px] font-medium text-creme-dim">{text}</div>
      {sub && <div className="max-w-[80%] text-[12px] text-creme-faint">{sub}</div>}
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-8 space-y-1.5 text-center text-[11px] leading-relaxed text-creme-faint">
      <div className="flex items-center justify-center gap-1.5 text-creme-mute">
        <ShieldCheck size={13} className="text-brand-bright" />
        Processado com segurança via Asaas (gateway homologado pelo Banco Central)
      </div>
      <div>{BILLER.legal} · CNPJ {BILLER.cnpj}</div>
      <div>
        {BILLER.email} · {BILLER.phone} · {BILLER.site}
      </div>
    </footer>
  );
}
