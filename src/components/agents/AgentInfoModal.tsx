import { X, Crown, Cpu, Wrench, FileText, Building2, Settings2 } from 'lucide-react';
import type { Agent } from '@/types';

/**
 * Painel de config & documentação do colaborador (read-friendly).
 * Mostra identidade, skills/ferramentas que ele usa e a documentação (persona).
 * Pra editar de fato, "Configuração completa" abre o AgentDetailModal.
 */
export function AgentInfoModal({ agent, onClose, onEdit }: { agent: Agent; onClose: () => void; onEdit?: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-surface-1 border border-default rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-default">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand-dim to-brand flex items-center justify-center text-[16px] font-bold text-white shrink-0">
            {agent.name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-bold text-creme flex items-center gap-2">
              {agent.name}
              {agent.isSupervisor && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-semantic-amber/15 text-semantic-amber px-1.5 py-0.5 rounded-full">
                  <Crown size={11} /> Supervisor
                </span>
              )}
            </div>
            <div className="text-[12.5px] text-creme-faint truncate">{agent.sector} · {agent.client}</div>
          </div>
          <button onClick={onClose} className="text-creme-faint hover:text-creme shrink-0"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Identidade */}
          <div className="grid grid-cols-2 gap-2.5">
            <InfoCard icon={<Cpu size={14} />} label="Modelo" value={agent.model} mono />
            <InfoCard icon={<Building2 size={14} />} label="Tipo" value={agent.type} />
          </div>

          {/* Skills & ferramentas */}
          <Section icon={<Wrench size={14} />} title={`Skills & ferramentas (${agent.tools.length})`}>
            {agent.tools.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {agent.tools.map((t) => (
                  <span key={t} className="px-2 py-1 rounded-md bg-surface-2 border border-default text-[12px] font-mono text-creme-dim">{t}</span>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-creme-faint italic">Sem ferramentas declaradas.</p>
            )}
            {agent.isSupervisor && (
              <p className="text-[11.5px] text-creme-faint mt-2 leading-relaxed">
                Via Claude Code (ponte), tem acesso a todas as ~30 skills da Thribus e ao organograma pra delegar.
              </p>
            )}
          </Section>

          {/* Documentação / persona */}
          <Section icon={<FileText size={14} />} title="Documentação (persona / instruções)">
            {agent.systemPrompt ? (
              <pre className="text-[12px] text-creme-mute leading-relaxed whitespace-pre-wrap font-sans bg-surface-2 border border-default rounded-lg p-3 max-h-64 overflow-y-auto">
                {agent.systemPrompt}
              </pre>
            ) : (
              <p className="text-[12.5px] text-creme-faint italic">Sem documentação/persona definida.</p>
            )}
          </Section>
        </div>

        {/* Footer */}
        {onEdit && (
          <div className="px-5 py-3.5 border-t border-default flex justify-end">
            <button
              onClick={() => { onEdit(); onClose(); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-2 border border-default text-[13px] font-semibold text-creme-dim hover:text-creme hover:bg-surface-hover transition-colors"
            >
              <Settings2 size={14} /> Configuração completa
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-surface-2 border border-default rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-creme-faint mb-1">
        <span className="text-creme-mute">{icon}</span> {label}
      </div>
      <div className={`text-[13px] text-creme ${mono ? 'font-mono' : 'capitalize'}`}>{value}</div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-creme mb-2">
        <span className="text-creme-mute">{icon}</span> {title}
      </div>
      {children}
    </div>
  );
}
