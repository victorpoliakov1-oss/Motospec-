import React, { useEffect, useMemo, useState } from 'react';
import { Bookmark, BookmarkCheck, Check, ChevronDown, Copy, ExternalLink, RotateCw, Search, Wrench, X } from 'lucide-react';
import { AftermarketPart, AftermarketPartsResponse, RevzillaBike } from '../types';
import { RetailerLinks, getPartLinks, type StoreContext } from './RetailerLinks';

interface AftermarketPartsPanelProps {
  bikeName: string;
  store: StoreContext;
  /** RevZilla's page for this bike, when the app found and checked it */
  revzilla: RevzillaBike | null;
  partsData: AftermarketPartsResponse | null;
  isLoading: boolean;
  activeQuery: string;
  onSearch: (query: string) => void;
  onToggleSavePart: (part: AftermarketPart) => void;
  isPartSaved: (partId: string) => boolean;
}

const CATEGORY_ORDER = [
  'Exhaust & Tuning',
  'Suspension & Brakes',
  'Crash Protection',
  'Ergonomics & Controls',
  'Luggage & Touring',
  'Lighting & Electronics',
  'Styling',
];

/** "$949.00 - $1,150.00 USD" -> "$949–$1,150" */
export function formatPrice(raw?: string): string {
  if (!raw) return '';
  return raw
    .replace(/\.00\b/g, '')
    .replace(/\s*USD\b/gi, '')
    .replace(/\s*[-–]\s*/g, '–')
    .trim();
}

const partKey = (part: AftermarketPart) => part.id || `${part.brand}-${part.name}`;

export const AftermarketPartsPanel: React.FC<AftermarketPartsPanelProps> = ({
  bikeName,
  store,
  revzilla,
  partsData,
  isLoading,
  activeQuery,
  onSearch,
  onToggleSavePart,
  isPartSaved,
}) => {
  const [input, setInput] = useState(activeQuery);
  const [category, setCategory] = useState('All');
  const [openId, setOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Reset local state whenever a new bike or search comes in
  useEffect(() => {
    setInput(activeQuery);
  }, [activeQuery]);
  useEffect(() => {
    setCategory('All');
    setOpenId(null);
    setShowAll(false);
  }, [bikeName, activeQuery]);

  const parts = partsData?.parts || [];

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    parts.forEach((p) => counts.set(p.category, (counts.get(p.category) || 0) + 1));
    return [...counts.entries()].sort(
      (a, b) => (CATEGORY_ORDER.indexOf(a[0]) + 99) % 99 - (CATEGORY_ORDER.indexOf(b[0]) + 99) % 99
    );
  }, [parts]);

  const INITIAL_COUNT = 8;
  const visibleParts = category === 'All' ? parts : parts.filter((p) => p.category === category);
  const shownParts = showAll ? visibleParts : visibleParts.slice(0, INITIAL_COUNT);

  const handleCopy = (part: AftermarketPart) => {
    const link = getPartLinks(part, store)[0];
    navigator.clipboard.writeText(`${part.brand} ${part.name}\nFor: ${bikeName}\n${link.name}: ${link.url}`);
    setCopiedId(partKey(part));
    setTimeout(() => setCopiedId(null), 2000);
  };

  // "Browse everything for this bike" fallback links (bike name without the year)
  const bikeOnly = bikeName.replace(/\(.*?\)/g, '').replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
  const browseLinks: { name: string; url: string }[] = [];
  if (revzilla) {
    // RevZilla's bike page only lists parts that fit; ?query= searches within it
    browseLinks.push({
      name: 'RevZilla (only parts that fit)',
      url: activeQuery ? `${revzilla.url}?query=${encodeURIComponent(activeQuery)}` : revzilla.url,
    });
  } else {
    browseLinks.push({ name: 'RevZilla', url: `https://www.revzilla.com/search?query=${encodeURIComponent(`${bikeOnly} ${activeQuery}`.trim())}` });
  }
  browseLinks.push({ name: 'J&P Cycles', url: `https://www.jpcycles.com/search?query=${encodeURIComponent(`${bikeOnly} ${activeQuery}`.trim())}` });

  return (
    <section aria-labelledby="parts-heading">
      <h2 id="parts-heading" className="font-display text-3xl font-bold tracking-tight">
        Aftermarket parts
      </h2>
      <p className="mt-1 text-sm text-muted">
        Suggested upgrades for this bike. Prices are estimates. Confirm fitment for your exact year on the store page before
        you buy.
      </p>

      {revzilla && (
        <div className="mt-3 rounded-lg bg-white p-3 text-sm ring-1 ring-line">
          <a
            href={revzilla.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold underline decoration-line underline-offset-4 hover:decoration-ink"
          >
            Shop every part that fits your {revzilla.name}
            <ExternalLink className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
          </a>
          {revzilla.vehicleId && (
            <p className="mt-1 text-muted">RevZilla buttons below open with your bike already selected.</p>
          )}
        </div>
      )}

      {/* Part search: lives with the parts, not next to the bike search */}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(input.trim());
        }}
      >
        <label htmlFor="part-search" className="sr-only">
          Search parts for this bike
        </label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            id="part-search"
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Exhaust, seat, crash bars…"
            className="w-full rounded-md border border-line bg-white py-2.5 pl-9 pr-3 text-[15px] placeholder:text-muted/80 focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-signal"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {activeQuery && !isLoading && (
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-muted">
            Results for <span className="font-semibold text-ink">“{activeQuery}”</span>
          </span>
          <button
            type="button"
            onClick={() => onSearch('')}
            className="inline-flex items-center gap-1 font-semibold underline underline-offset-4"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Show all parts
          </button>
        </div>
      )}

      {/* Category filter: filters locally, no extra AI request */}
      {!isLoading && categories.length > 1 && (
        <div
          className="-mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          role="group"
          aria-label="Filter by category"
        >
          {[['All', parts.length] as [string, number], ...categories].map(([cat, count]) => {
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setCategory(cat);
                  setShowAll(false);
                }}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium ${
                  active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink/40'
                }`}
              >
                {cat} <span className={`tabular ${active ? 'text-white/70' : 'text-muted'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* List */}
      <div className="mt-5" aria-live="polite">
        {isLoading ? (
          <div className="rounded-lg border border-line bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-muted">
              <RotateCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              Finding parts for {bikeName}…
            </div>
            <div className="mt-4 space-y-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded bg-road" />
              ))}
            </div>
          </div>
        ) : visibleParts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-white p-6 text-[15px]">
            <p className="font-semibold">No parts found{activeQuery ? ` for “${activeQuery}”` : ''}.</p>
            <p className="mt-1 text-muted">Try a broader word like “exhaust” or “seat”, or browse the stores directly below.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {shownParts.map((part) => {
              const key = partKey(part);
              const saved = isPartSaved(key);
              const open = openId === key;
              const primaryLink = getPartLinks(part, store)[0];
              return (
                <li key={key} className="rounded-lg border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-muted">{part.brand}</div>
                      <h3 className="mt-0.5 text-[17px] font-semibold leading-snug">
                        <a
                          href={primaryLink.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline hover:underline-offset-4"
                        >
                          {part.name}
                        </a>
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleSavePart(part)}
                      aria-pressed={saved}
                      aria-label={saved ? `Remove ${part.name} from saved parts` : `Save ${part.name}`}
                      className={`shrink-0 rounded-md border p-2 ${
                        saved ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink/40'
                      }`}
                    >
                      {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    {part.estimatedPrice && (
                      <span className="tabular font-semibold">
                        <span className="font-normal text-muted">est. </span>
                        {formatPrice(part.estimatedPrice)}
                      </span>
                    )}
                    <span className="rounded bg-road px-1.5 py-0.5 text-muted">{part.category}</span>
                    {part.installationDifficulty && (
                      <span className="inline-flex items-center gap-1 text-muted">
                        <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                        {part.installationDifficulty}
                      </span>
                    )}
                  </div>

                  {part.description && (
                    <p className={`mt-2 text-[15px] leading-relaxed ${open ? '' : 'line-clamp-2'}`}>{part.description}</p>
                  )}

                  {open && (
                    <div className="mt-3 space-y-3 border-t border-line pt-3 text-[15px] leading-relaxed">
                      {part.fitmentNotes && (
                        <p>
                          <span className="font-semibold">Fitment notes: </span>
                          {part.fitmentNotes}
                        </p>
                      )}
                      {part.keyBenefits?.length > 0 && (
                        <ul className="space-y-1">
                          {part.keyBenefits.map((b, i) => (
                            <li key={i} className="flex gap-2.5">
                              <Check className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopy(part)}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold underline underline-offset-4"
                      >
                        {copiedId === key ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copiedId === key ? 'Copied' : 'Copy part name and link'}
                      </button>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
                    <RetailerLinks part={part} store={store} />
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : key)}
                      aria-expanded={open}
                      className="inline-flex items-center gap-1 py-2 text-sm font-semibold text-muted hover:text-ink"
                    >
                      {open ? 'Less' : 'Fitment and details'}
                      <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!isLoading && visibleParts.length > shownParts.length && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-3 w-full rounded-md border border-line bg-white py-2.5 text-sm font-semibold hover:border-ink/40"
          >
            Show all {visibleParts.length} parts
          </button>
        )}
      </div>

      {/* Fallback: browse the whole store for this bike */}
      {!isLoading && bikeOnly && (
        <div className="mt-6 rounded-lg bg-white p-4 text-sm ring-1 ring-line">
          <p className="font-semibold">Not what you're after?</p>
          <p className="mt-1 text-muted">Browse every {activeQuery ? `“${activeQuery}”` : 'part'} listed for the {bikeOnly}:</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {browseLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold underline decoration-line underline-offset-4 hover:decoration-ink"
              >
                {link.name}
                <ExternalLink className="h-3 w-3 text-muted" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      )}

      {partsData?.sources && partsData.sources.length > 0 && !isLoading && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold text-muted hover:text-ink">Where these suggestions came from</summary>
          <ul className="mt-2 space-y-1">
            {partsData.sources.map((s, i) => (
              <li key={i}>
                <a href={s.uri} target="_blank" rel="noopener noreferrer" className="underline decoration-line underline-offset-4 hover:decoration-ink">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
};
