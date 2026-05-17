import { useState } from 'react';
import {
  BookMarked, GraduationCap, Search, Clock, Eye, ThumbsUp,
  PlayCircle, Award,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_HELP_ARTICLES, SEED_COURSES,
  type HelpArticle, type AcademyCourse,
} from '@/lib/seed-extras2';

const CATEGORY_COLOR: Record<HelpArticle['category'], string> = {
  getting_started: 'bg-brand/15 text-brand-bright',
  agents: 'bg-semantic-green/15 text-semantic-green',
  integrations: 'bg-semantic-amber/15 text-semantic-amber',
  troubleshooting: 'bg-semantic-red/15 text-semantic-red',
  best_practices: 'bg-surface-3 text-creme-mute',
};

const LEVEL_COLOR: Record<AcademyCourse['level'], string> = {
  iniciante: 'bg-brand/15 text-brand-bright',
  intermediário: 'bg-semantic-amber/15 text-semantic-amber',
  avançado: 'bg-semantic-red/15 text-semantic-red',
};

export function HelpPage() {
  const [tab, setTab] = useState<'help' | 'academy'>('help');
  const [search, setSearch] = useState('');

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <BookMarked size={16} className="text-creme-mute" /> Help Center & Academy
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · artigos · cursos · certificação · changelog
          </span>
        </div>
      </div>

      <div className="bg-brand/5 border border-brand/20 rounded-[10px] p-4 mb-4 flex items-center gap-3">
        <Search size={18} className="text-brand-bright shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Como podemos te ajudar? Ex: 'como conectar WhatsApp', 'tool falhando', 'criar agente'..."
          className="flex-1 bg-transparent text-[14px] text-creme placeholder-creme-faint focus:outline-none"
        />
        <button className="px-3 py-1.5 rounded-md bg-brand-dim border border-brand text-creme text-[12px] font-semibold">
          Buscar
        </button>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-default">
        <button onClick={() => setTab('help')} className={clsx('flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px', tab === 'help' ? 'text-brand-bright border-brand' : 'text-creme-mute border-transparent')}>
          <BookMarked size={13} /> Artigos
          <span className={clsx('text-[11px] font-mono px-1.5 py-px rounded-full', tab === 'help' ? 'bg-brand/15 text-brand-bright' : 'bg-surface-3 text-creme-faint')}>{SEED_HELP_ARTICLES.length}</span>
        </button>
        <button onClick={() => setTab('academy')} className={clsx('flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px', tab === 'academy' ? 'text-brand-bright border-brand' : 'text-creme-mute border-transparent')}>
          <GraduationCap size={13} /> Academy
          <span className={clsx('text-[11px] font-mono px-1.5 py-px rounded-full', tab === 'academy' ? 'bg-brand/15 text-brand-bright' : 'bg-surface-3 text-creme-faint')}>{SEED_COURSES.length}</span>
        </button>
      </div>

      {tab === 'help' && (
        <div className="grid grid-cols-2 gap-3">
          {SEED_HELP_ARTICLES.map((a) => (
            <div key={a.id} className="bg-surface-2 border border-default rounded-[10px] p-4 hover:border-hover transition-all cursor-pointer">
              <div className="flex items-center gap-2 mb-2">
                <span className={clsx('text-[10.5px] font-mono px-1.5 py-px rounded-full uppercase tracking-wider', CATEGORY_COLOR[a.category])}>
                  {a.category.replace('_', ' ')}
                </span>
                <span className="text-[10.5px] font-mono text-creme-faint inline-flex items-center gap-1">
                  <Clock size={9} /> {a.readMinutes}min
                </span>
              </div>
              <h4 className="text-[14px] font-bold text-creme leading-tight">{a.title}</h4>
              <p className="text-[12.5px] text-creme-mute mt-1.5 leading-relaxed line-clamp-2">{a.summary}</p>
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-default text-[10.5px] font-mono text-creme-faint">
                <span className="inline-flex items-center gap-1"><Eye size={10} /> {a.views.toLocaleString('pt-BR')}</span>
                <span className="inline-flex items-center gap-1 text-semantic-green"><ThumbsUp size={10} /> {a.helpful}</span>
                <span className="ml-auto">{new Date(a.updatedAt).toLocaleDateString('pt-BR')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'academy' && (
        <div className="grid grid-cols-2 gap-3">
          {SEED_COURSES.map((c) => (
            <div key={c.id} className="bg-surface-2 border border-default rounded-[10px] p-5 hover:border-hover transition-all">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h4 className="text-[15px] font-bold text-creme">{c.title}</h4>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={clsx('text-[10.5px] font-mono px-1.5 py-px rounded-full uppercase tracking-wider', LEVEL_COLOR[c.level])}>
                      {c.level}
                    </span>
                    {c.certified && (
                      <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-semantic-amber/15 text-semantic-amber inline-flex items-center gap-1">
                        <Award size={9} /> certificado
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <Stat label="Módulos" value={c.modules.toString()} />
                <Stat label="Duração" value={`${Math.floor(c.durationMin / 60)}h${c.durationMin % 60 ? ` ${c.durationMin % 60}m` : ''}`} />
                <Stat label="Alunos" value={c.enrolledCount.toString()} />
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-default">
                <span className="text-[11.5px] text-creme-mute">⭐ {c.rating}</span>
                <button className="px-3 py-1 rounded-md bg-brand-dim border border-brand text-creme text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-brand">
                  <PlayCircle size={11} /> Começar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-1 border border-default rounded-md p-2">
      <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint">{label}</div>
      <div className="text-[13px] font-bold font-mono text-creme mt-0.5">{value}</div>
    </div>
  );
}
