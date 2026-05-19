/**
 * Marketplace — listings, installs, reviews, publishers.
 */
import { supabase } from '@/lib/supabase';
import type { MarketplaceListing, ListingType, ListingPricing } from '@/lib/seed-marketplace';

export const marketplaceConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

interface ListingRow {
  id: string; publisher_id: string;
  type: ListingType; title: string; slug: string; description: string | null;
  category: string | null; icon: string | null; logo_slug: string | null;
  pricing: ListingPricing; price_monthly: number | null;
  rating: number; reviews_count: number;
  installs: number; installs_30d: number;
  featured: boolean; trending: boolean;
  version: string; published_at: string; updated_at: string;
  marketplace_publishers?: { name: string; verified: boolean }[] | { name: string; verified: boolean };
}

function rowToListing(r: ListingRow): MarketplaceListing {
  const pub = Array.isArray(r.marketplace_publishers) ? r.marketplace_publishers[0] : r.marketplace_publishers;
  return {
    id: r.id, type: r.type, title: r.title, slug: r.slug,
    description: r.description ?? '',
    publisherId: r.publisher_id, publisherName: pub?.name ?? '—',
    publisherVerified: pub?.verified ?? false,
    pricing: r.pricing, priceMonthly: r.price_monthly ?? undefined,
    category: r.category ?? '', icon: r.icon ?? '🔌',
    logoSlug: r.logo_slug ?? undefined,
    rating: Number(r.rating), reviews: r.reviews_count,
    installs: r.installs, installs30d: r.installs_30d,
    featured: r.featured, trending: r.trending,
    version: r.version,
    publishedAt: r.published_at, updatedAt: r.updated_at,
  };
}

export async function listListings(): Promise<MarketplaceListing[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('*, marketplace_publishers(name, verified)')
    .order('installs', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToListing(r as ListingRow));
}

export async function installListing(workspaceId: string, listingId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase
    .from('marketplace_installs')
    .upsert({ workspace_id: workspaceId, listing_id: listingId, active: true });
  if (error) throw error;
}

export async function uninstallListing(workspaceId: string, listingId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase
    .from('marketplace_installs')
    .update({ active: false })
    .eq('workspace_id', workspaceId)
    .eq('listing_id', listingId);
  if (error) throw error;
}

export async function listReviews(listingId: string): Promise<Array<{
  id: string; authorName: string; rating: number; body: string;
  helpful: number; createdAt: string;
  publisherReply?: { body: string; timestamp: string };
}>> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('marketplace_reviews')
    .select('*')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, authorName: r.author_name as string,
    rating: r.rating as number, body: r.body as string,
    helpful: r.helpful as number, createdAt: r.created_at as string,
    publisherReply: r.publisher_reply ? {
      body: r.publisher_reply as string,
      timestamp: (r.publisher_replied_at as string) ?? '',
    } : undefined,
  }));
}
