import { useMemo, useState } from 'react';
import {
  Store, Search, Star, Flame, ShieldCheck, Download, TrendingUp,
  Sparkles, Wrench, Layout, GitBranch, Crown, Package, Gift,
  Users, DollarSign, MessageCircle, BadgeCheck, Lock,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_MKT_LISTINGS,
  type MarketplaceListing, type ListingType, type ListingPricing,
} from '@/lib/seed-marketplace';
import {
  SEED_BUNDLES, SEED_PUBLISHER_EARNINGS, SEED_REVIEWS,
  SEED_SECTOR_PACKS, SEED_PRIVATE_MARKETPLACES,
  type MarketplaceBundle, type ListingReview,
} from '@/lib/seed-marketplace-extras';
import { BrandLogo } from '@/components/shared/BrandLogo';

type Tab = 'catalog' | 'bundles' | 'packs' | 'publishers' | 'private';

const TYPE_ICON: Record<ListingType, typeof Sparkles> = {
  skill: Sparkles, template: Layout, integration: Wrench, workflow: GitBranch,
};
const PRICING_LABEL: Record<ListingPricing, { label: string; color: string }> = {
  free: { label: 'Grátis', color: 'bg-semantic-green/15 text-semantic-green' },
  paid: { label: 'Pago', color: 'bg-brand/15 text-brand-bright' },
  subscription: { label: 'Assinatura', color: 'bg-semantic-amber/15 text-semantic-amber' },
  revshare: { label: 'Revenue share', color: 'bg-semantic-red/15 text-semantic-red' },
};

export function MarketplacePage() {
  const [tab, setTab] = useState<Tab>('catalog');

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Store size={16} className="text-creme-mute" /> Marketplace
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · catálogo · bundles · packs setoriais · earnings · privado
          </span>
        </div>
        <button className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand transition-all flex items-center gap-1">
          <Crown size={11} /> Publicar
        </button>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-default overflow-x-auto">
        <TabBtn active={tab === 'catalog'} onClick={() => setTab('catalog')} icon={<Store size={13} />} label="Catálogo" count={SEED_MKT_LISTINGS.length} />
        <TabBtn active={tab === 'bundles'} onClick={() => setTab('bundles')} icon={<Package size={13} />} label="Bundles" count={SEED_BUNDLES.length} />
        <TabBtn active={tab === 'packs'} onClick={() => setTab('packs')} icon={<Gift size={13} />} label="Packs setoriais" count={SEED_SECTOR_PACKS.length} />
        <TabBtn active={tab === 'publishers'} onClick={() => setTab('publishers')} icon={<DollarSign size={13} />} label="Earnings" count={SEED_PUBLISHER_EARNINGS.length} />
        <TabBtn active={tab === 'private'} onClick={() => setTab('private')} icon={<Lock size={13} />} label="Privado" count={SEED_PRIVATE_MARKETPLACES.length} />
      </div>

      {tab === 'catalog' && <CatalogPanel />}
      {tab === 'bundles' && <BundlesPanel />}
      {tab === 'packs' && <PacksPanel />}
      {tab === 'publishers' && <PublishersPanel />}
      {tab === 'private' && <PrivatePanel />}
    </>
  );
}

function TabBtn({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return (
    <button onClick={onClick} className={clsx('flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold transition-colors border-b-2 -mb-px shrink-0', active ? 'text-brand-bright border-brand' : 'text-creme-mute hover:text-creme border-transparent')}>
      {icon} {label}
      <span className={clsx('text-[11px] font-mono px-1.5 py-px rounded-full', active ? 'bg-brand/15 text-brand-bright' : 'bg-surface-3 text-creme-faint')}>{count}</span>
    </button>
  );
}

function CatalogPanel() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<ListingType | 'all'>('all');
  const [sort, setSort] = useState<'popular' | 'trending' | 'rating' | 'recent'>('popular');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let r = SEED_MKT_LISTINGS;
    if (type !== 'all') r = r.filter((l) => l.type === type);
    const q = search.trim().toLowerCase();
    if (q) r = r.filter((l) => l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q) || l.publisherName.toLowerCase().includes(q));
    if (sort === 'popular') r = [...r].sort((a, b) => b.installs - a.installs);
    if (sort === 'trending') r = [...r].sort((a, b) => b.installs30d - a.installs30d);
    if (sort === 'rating') r = [...r].sort((a, b) => b.rating - a.rating);
    if (sort === 'recent') r = [...r].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return r;
  }, [search, type, sort]);

  const featured = SEED_MKT_LISTINGS.filter((l) => l.featured);
  const selectedReviews = selectedId ? SEED_REVIEWS.filter((r) => r.listingId === selectedId) : [];
  const selectedListing = selectedId ? SEED_MKT_LISTINGS.find((l) => l.id === selectedId) : null;

  return (
    <>
      {selectedListing && selectedReviews.length > 0 ? (
        <ReviewsView listing={selectedListing} reviews={selectedReviews} onClose={() => setSelectedId(null)} />
      ) : (
        <>
          {featured.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[11.5px] font-bold uppercase tracking-wider text-creme-dim mb-2 flex items-center gap-1.5">
                <Star size={11} className="text-semantic-amber" /> Destaques
              </h4>
              <div className="grid grid-cols-3 gap-3">
                {featured.map((l) => <ListingCard key={l.id} listing={l} variant="featured" onReviews={() => setSelectedId(l.id)} />)}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="relative flex-1 max-w-[320px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-creme-faint" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-2 border border-default text-[13px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand" />
            </div>
            <select value={type} onChange={(e) => setType(e.target.value as ListingType | 'all')} className="px-3 py-1.5 rounded-md bg-surface-2 border border-default text-[12.5px] text-creme focus:outline-none focus:border-brand">
              <option value="all">Todos tipos</option>
              <option value="skill">Skills</option>
              <option value="template">Templates</option>
              <option value="integration">Integrações</option>
              <option value="workflow">Workflows</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="px-3 py-1.5 rounded-md bg-surface-2 border border-default text-[12.5px] text-creme focus:outline-none focus:border-brand">
              <option value="popular">⭐ Mais instalados</option>
              <option value="trending">🔥 Em alta</option>
              <option value="rating">★ Avaliação</option>
              <option value="recent">🆕 Recentes</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {filtered.map((l) => <ListingCard key={l.id} listing={l} onReviews={() => setSelectedId(l.id)} />)}
          </div>
        </>
      )}
    </>
  );
}

function ListingCard({ listing: l, variant, onReviews }: { listing: MarketplaceListing; variant?: 'featured'; onReviews: () => void }) {
  const TypeIcon = TYPE_ICON[l.type];
  return (
    <div className={clsx(
      'bg-surface-2 rounded-[10px] p-4 transition-all',
      variant === 'featured' ? 'border-2 border-brand/40 hover:border-brand/70' : 'border border-default hover:border-hover',
    )}>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-11 h-11 rounded-lg bg-surface-1 border border-default flex items-center justify-center shrink-0">
          {l.logoSlug ? <BrandLogo slug={l.logoSlug} size={24} fallbackEmoji={l.icon} /> : <span className="text-[20px]">{l.icon}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <TypeIcon size={11} className="text-creme-faint shrink-0" />
            <span className="text-[10.5px] font-mono text-creme-faint uppercase tracking-wider">{l.type}</span>
            <span className="text-creme-faint">·</span>
            <span className="text-[10.5px] font-mono text-creme-faint">{l.category}</span>
            {l.trending && <Flame size={11} className="text-semantic-red ml-1" />}
          </div>
          <h4 className="text-[13.5px] font-bold text-creme leading-tight line-clamp-2">{l.title}</h4>
        </div>
      </div>

      <p className="text-[12px] text-creme-mute leading-relaxed line-clamp-2 mb-3">{l.description}</p>

      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-default">
        <div className="text-[11px] text-creme-faint">por</div>
        <span className="text-[12px] font-semibold text-creme inline-flex items-center gap-1">
          {l.publisherName}
          {l.publisherVerified && <BadgeCheck size={11} className="text-brand-bright" />}
        </span>
        <span className="ml-auto text-[10.5px] font-mono text-creme-faint">v{l.version}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 text-[11px]">
        <div>
          <div className="text-creme-faint uppercase tracking-wider font-bold text-[10px]">Rating</div>
          <button onClick={onReviews} className="text-creme font-mono inline-flex items-center gap-0.5 mt-0.5 hover:text-brand-bright transition-colors">
            <Star size={10} className="text-semantic-amber fill-semantic-amber" />{l.rating}
            <span className="text-creme-faint">({l.reviews})</span>
          </button>
        </div>
        <div>
          <div className="text-creme-faint uppercase tracking-wider font-bold text-[10px]">Installs</div>
          <div className="text-creme font-mono mt-0.5">{l.installs}</div>
        </div>
        <div>
          <div className="text-creme-faint uppercase tracking-wider font-bold text-[10px]">/30d</div>
          <div className="text-brand-bright font-mono mt-0.5 inline-flex items-center gap-0.5">
            <TrendingUp size={9} />{l.installs30d}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className={clsx('text-[11px] font-semibold px-2 py-1 rounded-md', PRICING_LABEL[l.pricing].color)}>
          {(l.pricing === 'paid' || l.pricing === 'subscription') && l.priceMonthly ? `R$ ${l.priceMonthly}/mês` : PRICING_LABEL[l.pricing].label}
        </span>
        {l.pricing !== 'free' && (
          <span className="text-[10.5px] font-mono text-semantic-green inline-flex items-center gap-0.5">
            <Gift size={9} /> trial 14d
          </span>
        )}
        <button className="ml-auto px-3 py-1 rounded-md text-[12px] font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand transition-all inline-flex items-center gap-1">
          <Download size={11} /> Instalar
        </button>
      </div>
    </div>
  );
}

function ReviewsView({ listing, reviews, onClose }: { listing: MarketplaceListing; reviews: ListingReview[]; onClose: () => void }) {
  return (
    <>
      <button onClick={onClose} className="text-[12px] text-creme-faint hover:text-creme mb-3 inline-flex items-center gap-1">
        ← Voltar ao catálogo
      </button>
      <div className="bg-surface-2 border border-default rounded-[10px] p-5 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg bg-surface-1 border border-default flex items-center justify-center">
            {listing.logoSlug ? <BrandLogo slug={listing.logoSlug} size={26} fallbackEmoji={listing.icon} /> : <span className="text-[22px]">{listing.icon}</span>}
          </div>
          <div className="flex-1">
            <h2 className="text-[16px] font-bold text-creme">{listing.title}</h2>
            <div className="text-[12px] text-creme-mute mt-0.5 inline-flex items-center gap-1">
              por {listing.publisherName} {listing.publisherVerified && <BadgeCheck size={11} className="text-brand-bright" />}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[12.5px]">
              <span className="inline-flex items-center gap-1"><Star size={12} className="text-semantic-amber fill-semantic-amber" />{listing.rating}</span>
              <span className="text-creme-faint">{listing.reviews} reviews</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        {reviews.map((r) => (
          <div key={r.id} className="bg-surface-2 border border-default rounded-[10px] p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-creme">{r.authorName}</span>
                  {r.authorVerified && <BadgeCheck size={11} className="text-brand-bright" />}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={11} className={i < r.rating ? 'text-semantic-amber fill-semantic-amber' : 'text-creme-faint'} />
                  ))}
                  <span className="text-[10.5px] font-mono text-creme-faint ml-2">{new Date(r.timestamp).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
              <span className="text-[10.5px] font-mono text-creme-faint inline-flex items-center gap-1">
                👍 {r.helpful} útil
              </span>
            </div>
            <p className="text-[12.5px] text-creme-mute leading-relaxed">{r.body}</p>

            {r.publisherReply && (
              <div className="mt-3 pl-3 border-l-2 border-brand/40 bg-brand/5 p-3 rounded-r-md">
                <div className="text-[10.5px] uppercase tracking-wider font-bold text-brand-bright mb-1 inline-flex items-center gap-1">
                  <MessageCircle size={10} /> Resposta do publisher
                </div>
                <p className="text-[12px] text-creme-mute leading-relaxed">{r.publisherReply.body}</p>
                <div className="text-[10px] font-mono text-creme-faint mt-1">{new Date(r.publisherReply.timestamp).toLocaleDateString('pt-BR')}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function BundlesPanel() {
  return (
    <>
      <div className="bg-surface-2 border border-default rounded-[10px] p-3 mb-3 text-[12px] text-creme-mute leading-relaxed">
        <Package size={12} className="inline mr-1.5 text-brand-bright" />
        Pacotes com desconto — combine skills + integrações + templates relacionados a um preço menor.
      </div>
      <div className="grid grid-cols-2 gap-3">
        {SEED_BUNDLES.map((b) => <BundleCard key={b.id} bundle={b} />)}
      </div>
    </>
  );
}

function BundleCard({ bundle: b }: { bundle: MarketplaceBundle }) {
  const items = b.listingIds.map((id) => SEED_MKT_LISTINGS.find((l) => l.id === id)).filter(Boolean) as MarketplaceListing[];
  return (
    <div className={clsx(
      'bg-surface-2 rounded-[10px] p-4 transition-all',
      b.featured ? 'border-2 border-brand/40' : 'border border-default hover:border-hover',
    )}>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 rounded-lg bg-surface-1 border border-default flex items-center justify-center text-[24px]">{b.icon}</div>
        <div className="flex-1">
          <h4 className="text-[15px] font-bold text-creme">{b.title}</h4>
          <p className="text-[12px] text-creme-mute mt-1 leading-relaxed">{b.description}</p>
        </div>
      </div>

      <div className="space-y-1.5 mb-3 pb-3 border-b border-default">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 p-1.5 rounded bg-surface-1 border border-default">
            {it.logoSlug ? <BrandLogo slug={it.logoSlug} size={16} fallbackEmoji={it.icon} /> : <span className="text-[16px]">{it.icon}</span>}
            <span className="text-[12px] font-semibold text-creme truncate">{it.title}</span>
            <span className="ml-auto text-[10.5px] font-mono text-creme-faint">{it.type}</span>
          </div>
        ))}
      </div>

      <div className="flex items-end justify-between mb-3">
        <div>
          {b.savingsPercent > 0 && (
            <div className="text-[10.5px] line-through text-creme-faint font-mono">R$ {b.totalPriceMonthly.toFixed(0)}/mês</div>
          )}
          <div className="text-[20px] font-bold font-mono text-creme">
            {b.bundlePriceMonthly === 0 ? 'Grátis' : `R$ ${b.bundlePriceMonthly.toFixed(0)}/mês`}
          </div>
        </div>
        {b.savingsPercent > 0 && (
          <span className="text-[12px] font-bold text-semantic-green px-2 py-1 rounded-md bg-semantic-green/10">
            -{(b.savingsPercent * 100).toFixed(0)}%
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[11px] font-mono text-creme-faint inline-flex items-center gap-3">
          <span><Users size={10} className="inline mr-0.5" />{b.installs}</span>
          <span><Star size={10} className="inline mr-0.5 text-semantic-amber" />{b.rating}</span>
        </div>
        <button className="px-3 py-1.5 rounded-md text-[12px] font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand inline-flex items-center gap-1">
          <Download size={11} /> Instalar bundle
        </button>
      </div>
    </div>
  );
}

function PacksPanel() {
  return (
    <>
      <div className="bg-surface-2 border border-default rounded-[10px] p-3 mb-3 text-[12px] text-creme-mute leading-relaxed">
        <Gift size={12} className="inline mr-1.5 text-brand-bright" />
        <b>Pre-installed packs</b> — workspaces novos já vêm com a curadoria do setor. Onboarding zero-friction.
      </div>
      <div className="grid grid-cols-2 gap-3">
        {SEED_SECTOR_PACKS.map((p) => {
          const items = p.listingIds.map((id) => SEED_MKT_LISTINGS.find((l) => l.id === id)).filter(Boolean) as MarketplaceListing[];
          return (
            <div key={p.id} className="bg-surface-2 border border-default rounded-[10px] p-4 hover:border-hover transition-all">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-12 h-12 rounded-lg bg-surface-1 border border-default flex items-center justify-center text-[24px]">{p.emoji}</div>
                <div className="flex-1">
                  <h4 className="text-[15px] font-bold text-creme">{p.sectorLabel}</h4>
                  <p className="text-[12px] text-creme-mute mt-1 leading-relaxed">{p.description}</p>
                  <div className="text-[10.5px] font-mono text-creme-faint mt-1.5">
                    Curado por <span className="text-brand-bright">{p.curatedBy}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mb-3 pb-3 border-b border-default">
                {items.map((it) => (
                  <span key={it.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-1 border border-default text-[10.5px] font-mono text-creme-dim">
                    {it.logoSlug ? <BrandLogo slug={it.logoSlug} size={11} fallbackEmoji={it.icon} /> : <span>{it.icon}</span>}
                    {it.title.length > 22 ? it.title.slice(0, 22) + '…' : it.title}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-creme-faint"><Users size={10} className="inline mr-0.5" />{p.installs} workspaces usam</span>
                <button className="px-3 py-1.5 rounded-md text-[12px] font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand inline-flex items-center gap-1">
                  Aplicar pack
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function PublishersPanel() {
  return (
    <>
      <div className="bg-surface-2 border border-default rounded-[10px] p-3 mb-3 text-[12px] text-creme-mute leading-relaxed">
        <DollarSign size={12} className="inline mr-1.5 text-brand-bright" />
        Dashboard de quem publica no marketplace — MRR, churn, payouts. Vira plataforma de creators (network effect).
      </div>
      <div className="space-y-3">
        {SEED_PUBLISHER_EARNINGS.map((p) => (
          <div key={p.publisherId} className="bg-surface-2 border border-default rounded-[10px] p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h4 className="text-[16px] font-bold text-creme inline-flex items-center gap-2">
                  {p.publisherName} <BadgeCheck size={13} className="text-brand-bright" />
                </h4>
                <div className="text-[11.5px] text-creme-faint mt-1 font-mono">
                  {p.paidInstalls} pagos · {p.freeInstalls} grátis · churn 30d {p.churn30d}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">Próximo payout</div>
                <div className="text-[16px] font-bold font-mono text-semantic-green mt-0.5">R$ {p.nextPayoutAmount.toLocaleString('pt-BR')}</div>
                <div className="text-[10.5px] font-mono text-creme-faint">{new Date(p.nextPayoutAt).toLocaleDateString('pt-BR')}</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
              <EarningStat label="MRR" value={`R$ ${p.mrr.toLocaleString('pt-BR')}`} />
              <EarningStat label="ARR" value={`R$ ${(p.arr / 1000).toFixed(1)}k`} />
              <EarningStat label="Net new /30d" value={`+${p.netNew30d}`} positive />
              <EarningStat label="Payouts YTD" value={`R$ ${p.payoutsYTD.toLocaleString('pt-BR')}`} />
            </div>

            <div>
              <h5 className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mb-2">Top listings</h5>
              <div className="space-y-1.5">
                {p.topListings.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 p-2 rounded-md bg-surface-1 border border-default">
                    <span className="text-[12.5px] text-creme font-semibold flex-1 min-w-0 truncate">{l.title}</span>
                    <span className="text-[11px] font-mono text-creme-faint shrink-0">{l.installs} installs</span>
                    <span className="text-[12px] font-mono text-brand-bright font-bold shrink-0 w-[100px] text-right">R$ {l.mrr.toLocaleString('pt-BR')}/mês</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function EarningStat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="bg-surface-1 border border-default rounded-md p-2.5">
      <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint">{label}</div>
      <div className={clsx('text-[16px] font-bold font-mono mt-0.5', positive ? 'text-semantic-green' : 'text-creme')}>{value}</div>
    </div>
  );
}

function PrivatePanel() {
  return (
    <>
      <div className="bg-surface-2 border border-default rounded-[10px] p-3 mb-3 text-[12px] text-creme-mute leading-relaxed">
        <Lock size={12} className="inline mr-1.5 text-brand-bright" />
        <b>White-label marketplace privado</b> — holding/grupo tem o próprio marketplace interno só pros workspaces filhos. Skills proprietárias não vazam pra concorrência.
      </div>
      <div className="space-y-3">
        {SEED_PRIVATE_MARKETPLACES.map((pm) => (
          <div key={pm.id} className="bg-surface-2 border border-default rounded-[10px] p-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-lg flex items-center justify-center" style={{ backgroundColor: pm.brandColor + '33', border: `2px solid ${pm.brandColor}` }}>
                <ShieldCheck size={20} style={{ color: pm.brandColor }} />
              </div>
              <div className="flex-1">
                <h4 className="text-[15px] font-bold text-creme">{pm.holdingName}</h4>
                <code className="text-[11.5px] font-mono text-brand-bright">{pm.domain}</code>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <EarningStat label="Workspaces" value={pm.workspaceCount.toString()} />
                  <EarningStat label="Listings privados" value={pm.privateListings.toString()} />
                  <EarningStat label="Listings públicos" value={pm.publicListings.toString()} />
                </div>
              </div>
              <button className="px-3 py-1.5 rounded-md text-[12px] font-semibold bg-surface-3 text-creme-mute hover:bg-surface-hover hover:text-creme">
                Gerenciar
              </button>
            </div>
          </div>
        ))}
        <button className="w-full py-3 rounded-[10px] border-2 border-dashed border-default text-creme-faint hover:border-brand/40 hover:text-creme-mute text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors">
          <Lock size={12} /> Criar marketplace privado pra holding
        </button>
      </div>
    </>
  );
}
