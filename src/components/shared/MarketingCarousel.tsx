import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles, Zap, Plug, Gift, Store, Brain } from 'lucide-react';
import { clsx } from 'clsx';
import { SEED_ADS, type MarketingAd } from '@/lib/seed-marketing';

const VARIANT_ICON = {
  cortex: Brain,
  integration: Plug,
  trial: Gift,
  promo: Zap,
  event: Sparkles,
  marketplace: Store,
};

const ACCENT_STYLE = {
  brand: {
    container: 'from-brand/15 via-brand/5 to-surface-2 border-brand/30',
    badge: 'bg-brand/20 text-brand-bright',
    icon: 'text-brand-bright',
    cta: 'bg-brand-dim border-brand hover:bg-brand text-creme',
  },
  amber: {
    container: 'from-semantic-amber/15 via-semantic-amber/5 to-surface-2 border-semantic-amber/30',
    badge: 'bg-semantic-amber/20 text-semantic-amber',
    icon: 'text-semantic-amber',
    cta: 'bg-semantic-amber/20 border-semantic-amber/40 hover:bg-semantic-amber/30 text-semantic-amber',
  },
  green: {
    container: 'from-semantic-green/15 via-semantic-green/5 to-surface-2 border-semantic-green/30',
    badge: 'bg-semantic-green/20 text-semantic-green',
    icon: 'text-semantic-green',
    cta: 'bg-semantic-green/20 border-semantic-green/40 hover:bg-semantic-green/30 text-semantic-green',
  },
  red: {
    container: 'from-semantic-red/15 via-semantic-red/5 to-surface-2 border-semantic-red/30',
    badge: 'bg-semantic-red/20 text-semantic-red',
    icon: 'text-semantic-red',
    cta: 'bg-semantic-red/20 border-semantic-red/40 hover:bg-semantic-red/30 text-semantic-red',
  },
};

export function MarketingCarousel() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const ads = SEED_ADS;
  const ad = ads[idx];

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % ads.length), 6000);
    return () => clearInterval(t);
  }, [paused, ads.length]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative"
    >
      <AdCard ad={ad} />

      {/* Controles */}
      <div className="absolute right-3 top-3 flex items-center gap-1">
        <button onClick={() => setIdx((i) => (i - 1 + ads.length) % ads.length)} className="w-7 h-7 rounded-md bg-surface-1/80 backdrop-blur border border-default text-creme-mute hover:text-creme inline-flex items-center justify-center">
          <ChevronLeft size={13} />
        </button>
        <button onClick={() => setIdx((i) => (i + 1) % ads.length)} className="w-7 h-7 rounded-md bg-surface-1/80 backdrop-blur border border-default text-creme-mute hover:text-creme inline-flex items-center justify-center">
          <ChevronRight size={13} />
        </button>
      </div>

      {/* Dots */}
      <div className="absolute bottom-3 right-4 flex items-center gap-1.5">
        {ads.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={clsx(
              'h-1.5 rounded-full transition-all',
              i === idx ? 'w-6 bg-creme' : 'w-1.5 bg-creme-faint/50 hover:bg-creme-faint',
            )}
          />
        ))}
      </div>
    </div>
  );
}

function AdCard({ ad }: { ad: MarketingAd }) {
  const nav = useNavigate();
  const Icon = VARIANT_ICON[ad.variant];
  const s = ACCENT_STYLE[ad.accentColor];

  return (
    <div className={clsx('relative rounded-[12px] border bg-gradient-to-br p-5 overflow-hidden', s.container)}>
      <div className="absolute -right-12 -bottom-12 opacity-10">
        <Icon size={180} className={s.icon} strokeWidth={1} />
      </div>

      <div className="relative flex items-start gap-4">
        <div className={clsx('w-11 h-11 rounded-lg bg-surface-1 border border-default flex items-center justify-center shrink-0', s.icon)}>
          <Icon size={20} />
        </div>
        <div className="flex-1 min-w-0 pr-24">
          {ad.badge && (
            <span className={clsx('inline-block text-[10.5px] font-bold uppercase tracking-wider px-1.5 py-px rounded-full mb-1.5', s.badge)}>
              {ad.badge}
            </span>
          )}
          <h3 className="text-[16px] font-bold text-creme leading-tight">{ad.title}</h3>
          <p className="text-[12.5px] text-creme-mute mt-1.5 leading-relaxed max-w-[640px]">{ad.subtitle}</p>
          <button
            onClick={() => nav(ad.ctaHref)}
            className={clsx('mt-3 px-3 py-1.5 rounded-md border text-[12.5px] font-semibold transition-all inline-flex items-center gap-1.5', s.cta)}
          >
            {ad.cta} <ArrowRight size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}
