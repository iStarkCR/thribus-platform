import { useState } from 'react';
import {
  User, Mail, Phone, Briefcase, MapPin, Camera, Save,
  KeyRound, Smartphone, ShieldCheck, Bell, Globe,
  Trash2, CheckCircle2, LogOut, Clock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useSession } from '@/hooks/useSession';

type Tab = 'general' | 'security' | 'preferences' | 'sessions';

export function ProfilePage() {
  const [tab, setTab] = useState<Tab>('general');
  const navigate = useNavigate();

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <User size={16} className="text-creme-mute" /> Meu perfil
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · informações pessoais · segurança · preferências
          </span>
        </div>
        <button
          onClick={() => navigate('/login')}
          className="px-3 py-1.5 rounded-md text-[12px] font-semibold bg-semantic-red/10 text-semantic-red hover:bg-semantic-red/20 inline-flex items-center gap-1"
        >
          <LogOut size={11} /> Sair da conta
        </button>
      </div>

      <div className="bg-surface-2 border border-default rounded-[10px] p-6 mb-3">
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-brand-dim to-brand border border-default flex items-center justify-center text-[28px] font-bold text-creme">
              CA
            </div>
            <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-surface-1 border border-default text-creme-mute hover:text-creme inline-flex items-center justify-center">
              <Camera size={12} />
            </button>
          </div>
          <div className="flex-1">
            <h2 className="text-[20px] font-bold text-creme">Charles Andrade</h2>
            <div className="text-[13px] text-creme-mute mt-0.5">CEO · Thribus Tech</div>
            <div className="flex items-center gap-3 mt-2 text-[11.5px] text-creme-faint">
              <span className="inline-flex items-center gap-1"><Mail size={11} /> developer@thribus.com.br</span>
              <span className="inline-flex items-center gap-1"><Briefcase size={11} /> admin</span>
              <span className="inline-flex items-center gap-1 text-semantic-green"><CheckCircle2 size={11} /> 2FA ativo</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-default">
        <TabBtn active={tab === 'general'} onClick={() => setTab('general')} icon={<User size={13} />} label="Geral" />
        <TabBtn active={tab === 'security'} onClick={() => setTab('security')} icon={<ShieldCheck size={13} />} label="Segurança" />
        <TabBtn active={tab === 'preferences'} onClick={() => setTab('preferences')} icon={<Bell size={13} />} label="Preferências" />
        <TabBtn active={tab === 'sessions'} onClick={() => setTab('sessions')} icon={<Smartphone size={13} />} label="Sessões" />
      </div>

      {tab === 'general' && <GeneralPanel />}
      {tab === 'security' && <SecurityPanel />}
      {tab === 'preferences' && <PreferencesPanel />}
      {tab === 'sessions' && <SessionsPanel onLogoutAll={() => navigate('/login')} />}
    </>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={clsx('flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px', active ? 'text-brand-bright border-brand' : 'text-creme-mute border-transparent')}>
      {icon} {label}
    </button>
  );
}

function GeneralPanel() {
  const { user, updateProfile, configured } = useSession();

  const md = (user?.user_metadata ?? {}) as Record<string, string>;
  const [form, setForm] = useState({
    name: md.name ?? user?.email?.split('@')[0] ?? 'Charles Andrade',
    phone: md.phone ?? '+55 53 99999-9999',
    role: md.role ?? 'CEO',
    company: md.company ?? 'Thribus Tech',
    location: md.location ?? 'Bagé/RS · Brasil',
    bio: md.bio ?? 'CEO da Thribus Tech. Construindo plataforma B2B de colaboradores digitais com Cortex Brain.',
  });
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');

  const handleSave = async () => {
    if (!configured) {
      setSaving('saved');
      setTimeout(() => setSaving('idle'), 1500);
      return;
    }
    setSaving('saving');
    const { error } = await updateProfile(form);
    if (!error) {
      setSaving('saved');
      setTimeout(() => setSaving('idle'), 1500);
    } else {
      setSaving('idle');
      alert(`Erro: ${error.message}`);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <Section title="Identidade">
        <Field label="Nome completo" icon={<User size={12} />} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label="Email" icon={<Mail size={12} />} value={user?.email ?? ''} readOnly />
        <Field label="Telefone" icon={<Phone size={12} />} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
      </Section>
      <Section title="Empresa">
        <Field label="Cargo" icon={<Briefcase size={12} />} value={form.role} onChange={(v) => setForm({ ...form, role: v })} />
        <Field label="Empresa" icon={<Briefcase size={12} />} value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
        <Field label="Localização" icon={<MapPin size={12} />} value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
      </Section>
      <Section title="Sobre" full>
        <textarea
          rows={3}
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
          className="w-full px-3 py-2 rounded-md bg-surface-1 border border-default text-[13px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand resize-none"
        />
      </Section>
      <div className="col-span-2 flex justify-end items-center gap-2">
        {saving !== 'idle' && (
          <span className="text-[11px] font-mono text-creme-faint">
            {saving === 'saving' ? 'salvando…' : '✓ salvo'}
          </span>
        )}
        <button className="px-4 py-1.5 rounded-md text-[12.5px] font-semibold text-creme-mute hover:text-creme">Cancelar</button>
        <button onClick={handleSave} disabled={saving === 'saving'} className="px-4 py-1.5 rounded-md text-[12.5px] font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand inline-flex items-center gap-1.5 disabled:opacity-60">
          <Save size={12} /> Salvar alterações
        </button>
      </div>
    </div>
  );
}

function SecurityPanel() {
  return (
    <div className="space-y-3">
      <SecurityRow
        icon={<KeyRound size={16} />}
        title="Senha"
        subtitle="Última alteração há 2 meses"
        action="Alterar"
      />
      <SecurityRow
        icon={<Smartphone size={16} />}
        title="Autenticação em 2 fatores"
        subtitle="Google Authenticator · ativo"
        action="Gerenciar"
        statusOk
      />
      <SecurityRow
        icon={<ShieldCheck size={16} />}
        title="Códigos de recuperação"
        subtitle="8 códigos disponíveis · gerados em 22/03/2026"
        action="Gerar novos"
      />
      <SecurityRow
        icon={<KeyRound size={16} />}
        title="Passkeys (WebAuthn)"
        subtitle="Nenhuma chave registrada"
        action="Adicionar"
      />
      <SecurityRow
        icon={<Globe size={16} />}
        title="SSO Enterprise"
        subtitle="SAML · Microsoft Entra · ativo pra workspace TexNet"
        action="Configurar"
        statusOk
      />
    </div>
  );
}

function SecurityRow({ icon, title, subtitle, action, statusOk }: { icon: React.ReactNode; title: string; subtitle: string; action: string; statusOk?: boolean }) {
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-4 flex items-center gap-3">
      <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', statusOk ? 'bg-semantic-green/15 text-semantic-green' : 'bg-surface-1 text-creme-mute border border-default')}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-bold text-creme">{title}</span>
          {statusOk && <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-semantic-green/15 text-semantic-green inline-flex items-center gap-1"><CheckCircle2 size={9} /> ativo</span>}
        </div>
        <div className="text-[11.5px] text-creme-faint mt-0.5">{subtitle}</div>
      </div>
      <button className="px-3 py-1.5 rounded-md text-[12px] font-semibold bg-surface-3 text-creme-mute hover:bg-surface-hover hover:text-creme">
        {action}
      </button>
    </div>
  );
}

function PreferencesPanel() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Section title="Idioma & Formato">
        <SelectRow label="Idioma" value="Português (BR)" />
        <SelectRow label="Fuso horário" value="América/São Paulo (GMT-3)" />
        <SelectRow label="Formato de data" value="DD/MM/AAAA" />
        <SelectRow label="Moeda padrão" value="BRL (R$)" />
      </Section>
      <Section title="Notificações">
        <ToggleRow label="Email — aprovações pendentes" active />
        <ToggleRow label="Email — relatório semanal" active />
        <ToggleRow label="Push — SLA estourou" active />
        <ToggleRow label="Push — @menções" active />
        <ToggleRow label="Push — novidades de produto" />
      </Section>
      <Section title="Aparência" full>
        <div className="grid grid-cols-3 gap-2">
          <ThemeOption label="Escuro" subtitle="atual" active />
          <ThemeOption label="Claro" subtitle="em breve" />
          <ThemeOption label="Sistema" subtitle="em breve" />
        </div>
      </Section>
    </div>
  );
}

function SessionsPanel({ onLogoutAll }: { onLogoutAll: () => void }) {
  const sessions = [
    { device: 'MacBook Pro · Chrome 138', location: 'Bagé/RS · Brasil', ip: '189.78.32.114', current: true, lastActive: 'agora' },
    { device: 'iPhone 15 · Safari', location: 'Bagé/RS · Brasil', ip: '189.78.32.114', current: false, lastActive: '2h atrás' },
    { device: 'MacBook Air · Chrome', location: 'Porto Alegre/RS', ip: '177.45.10.22', current: false, lastActive: 'ontem' },
  ];
  return (
    <>
      <div className="bg-semantic-amber/5 border border-semantic-amber/20 rounded-[10px] p-3 mb-3 text-[12px] text-creme-mute leading-relaxed">
        Se você vê um dispositivo que não reconhece, encerre a sessão e troque sua senha.
      </div>
      <div className="space-y-2">
        {sessions.map((s, i) => (
          <div key={i} className="bg-surface-2 border border-default rounded-[10px] p-3.5 flex items-center gap-3">
            <Smartphone size={16} className="text-creme-mute shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-creme">{s.device}</span>
                {s.current && <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-semantic-green/15 text-semantic-green inline-flex items-center gap-1"><CheckCircle2 size={9} /> sessão atual</span>}
              </div>
              <div className="text-[11px] text-creme-faint font-mono mt-0.5">{s.location} · {s.ip}</div>
              <div className="text-[10.5px] text-creme-faint mt-0.5"><Clock size={9} className="inline mr-0.5" /> {s.lastActive}</div>
            </div>
            {!s.current && (
              <button className="px-2.5 py-1 rounded-md text-[11.5px] font-semibold bg-semantic-red/10 text-semantic-red hover:bg-semantic-red/20 inline-flex items-center gap-1">
                <Trash2 size={10} /> Encerrar
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <button onClick={onLogoutAll} className="px-3 py-1.5 rounded-md text-[12px] font-semibold bg-semantic-red/15 text-semantic-red hover:bg-semantic-red/25 inline-flex items-center gap-1">
          <LogOut size={11} /> Encerrar todas as sessões
        </button>
      </div>
    </>
  );
}

// Helpers
function Section({ title, full, children }: { title: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={clsx('bg-surface-2 border border-default rounded-[10px] p-4', full && 'col-span-2')}>
      <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-creme-dim mb-3">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Field({ label, icon, value, onChange, readOnly }: { label: string; icon: React.ReactNode; value: string; onChange?: (v: string) => void; readOnly?: boolean }) {
  return (
    <div>
      <label className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint inline-flex items-center gap-1 mb-1">{icon} {label}</label>
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        className={clsx(
          'w-full px-3 py-2 rounded-md bg-surface-1 border border-default text-[13px] text-creme focus:outline-none focus:border-brand',
          readOnly && 'opacity-60 cursor-not-allowed',
        )}
      />
    </div>
  );
}

function SelectRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-md bg-surface-1 border border-default">
      <span className="text-[12px] text-creme-mute">{label}</span>
      <span className="text-[12.5px] font-semibold text-creme">{value}</span>
    </div>
  );
}

function ToggleRow({ label, active }: { label: string; active?: boolean }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-md bg-surface-1 border border-default">
      <span className="text-[12px] text-creme-mute">{label}</span>
      <div className={clsx('w-8 h-4 rounded-full relative transition-colors', active ? 'bg-brand' : 'bg-surface-3')}>
        <span className={clsx('absolute top-0.5 w-3 h-3 rounded-full bg-creme transition-all', active ? 'left-[18px]' : 'left-0.5')} />
      </div>
    </div>
  );
}

function ThemeOption({ label, subtitle, active }: { label: string; subtitle: string; active?: boolean }) {
  return (
    <button className={clsx(
      'p-3 rounded-md border text-left transition-all',
      active ? 'bg-brand/10 border-brand/40' : 'bg-surface-1 border-default hover:border-hover',
    )}>
      <div className={clsx('text-[13px] font-bold', active ? 'text-brand-bright' : 'text-creme')}>{label}</div>
      <div className="text-[10.5px] font-mono text-creme-faint mt-0.5">{subtitle}</div>
    </button>
  );
}
