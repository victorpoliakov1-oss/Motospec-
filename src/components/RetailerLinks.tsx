import React, { useState } from 'react';
import { ExternalLink, ChevronDown } from 'lucide-react';
import { AftermarketPart } from '../types';

// ---------------------------------------------------------------------------
// Why links used to "just open the website":
// the old search text was "<bike name + year> <brand> <full part name>", often
// 15+ words. Store search engines need every word to match, so they returned
// no results or a generic page. We now search for the product only
// (brand + product line, max 6 words). The store page then shows fitment.
// ---------------------------------------------------------------------------

// Link formats tested on the live sites (30 Sep 2026):
//   RevZilla: /search?query=power%20duals&vehicle_id=20772 -> right part first,
//             and the 2014 Road King already selected in "Shop Your Ride"
//   J&P:      /search?query=power%20duals -> right results (the old ?q= was ignored)
// eBay's format is its long-standing public search address (not yet tested by us).

export interface StoreContext {
  /** Bike name and category, used to pick the best store first. */
  bikeContext?: string;
  /** RevZilla's own number for the rider's bike, when the app found it. */
  revzillaVehicleId?: string;
}

export interface Retailer {
  id: string;
  name: string;
  buildUrl: (encodedQuery: string, ctx?: StoreContext) => string;
}

const STORES: Record<string, Retailer> = {
  revzilla: {
    id: 'revzilla',
    name: 'RevZilla',
    buildUrl: (q, ctx) =>
      `https://www.revzilla.com/search?query=${q}${ctx?.revzillaVehicleId ? `&vehicle_id=${encodeURIComponent(ctx.revzillaVehicleId)}` : ''}`,
  },
  jp: { id: 'jp', name: 'J&P Cycles', buildUrl: (q) => `https://www.jpcycles.com/search?query=${q}` },
  ebay: { id: 'ebay', name: 'eBay Motors', buildUrl: (q) => `https://www.ebay.com/sch/i.html?_nkw=${q}&_sacat=6028` },
};

const CRUISER_PATTERN = /cruiser|touring|bagger|v-?twin|harley|indian|softail|glide|road king/i;

/**
 * Store order: RevZilla first when it can open with the rider's bike selected.
 * Otherwise J&P first for cruisers and V-twins, RevZilla first for everything else.
 */
export function getRetailersFor(ctx: StoreContext = {}): Retailer[] {
  const order = ctx.revzillaVehicleId
    ? ['revzilla', 'jp', 'ebay']
    : CRUISER_PATTERN.test(ctx.bikeContext || '')
      ? ['jp', 'revzilla', 'ebay']
      : ['revzilla', 'jp', 'ebay'];
  return order.map((key) => STORES[key]);
}

/** Short product-only search phrase, e.g. "Vance Hines Power Duals Head Pipes". */
export function buildStoreQuery(part: Pick<AftermarketPart, 'brand' | 'name' | 'searchQuery'>): string {
  const clean = (text: string) =>
    text
      .replace(/["“”″]/g, ' ') // inch marks and quotes
      .replace(/[&/|+®™]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  if (part.searchQuery && part.searchQuery.trim()) {
    return clean(part.searchQuery).split(' ').slice(0, 6).join(' ');
  }

  // Keep only the first product in names like "Head Pipes & Twin Slash Mufflers"
  const firstProduct = part.name.split(/\s(?:&|and|with|\+|-|–)\s|,|\(/i)[0];
  const brandWords = clean(part.brand).split(' ').filter(Boolean);
  const nameWords = clean(firstProduct)
    .split(' ')
    .filter((w) => w && !brandWords.some((b) => b.toLowerCase() === w.toLowerCase()));
  return [...brandWords, ...nameWords].slice(0, Math.max(6, brandWords.length + 2)).join(' ');
}

export function getPartLinks(part: AftermarketPart, ctx: StoreContext = {}) {
  const q = encodeURIComponent(buildStoreQuery(part));
  return getRetailersFor(ctx).map((r) => ({
    id: r.id,
    name: r.name,
    url: r.buildUrl(q, ctx),
    withBike: r.id === 'revzilla' && !!ctx.revzillaVehicleId,
  }));
}

interface RetailerLinksProps {
  part: AftermarketPart;
  store?: StoreContext;
  compact?: boolean;
}

export const RetailerLinks: React.FC<RetailerLinksProps> = ({ part, store = {}, compact = false }) => {
  const [showMore, setShowMore] = useState(false);
  const links = getPartLinks(part, store);
  const [primary, ...others] = links;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {links.slice(0, 3).map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
          >
            {link.name}
            <ExternalLink className="h-3 w-3 text-muted" aria-hidden="true" />
          </a>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={primary.url}
          title={primary.withBike ? 'Opens RevZilla with your bike already selected' : undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-black"
        >
          Find at {primary.name}
          <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-ink hover:border-ink/40"
        >
          Other stores
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>
      {showMore && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {others.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
            >
              {link.name}
              <ExternalLink className="h-3 w-3 text-muted" aria-hidden="true" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
