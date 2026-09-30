// Finds RevZilla's own page for a bike, e.g.
//   https://www.revzilla.com/parts/2014-harley-davidson-road-king-flhri
// and reads RevZilla's bike number (vehicle_id) from it.
//
// With the bike number, a part search opens with the rider's bike already
// selected on RevZilla (tested: /search?query=power%20duals&vehicle_id=20772).
// The bike page itself lists only parts that fit.
//
// Every address is checked before use: it must load, be a RevZilla parts page,
// and its title must name the same year and model. Anything else is discarded
// and the app falls back to a plain part search.

export interface RevzillaBike {
  url: string;
  name: string;
  vehicleId?: string;
}

type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; url?: string; text(): Promise<string> }>;

const PARTS_PAGE = /^https:\/\/www\.revzilla\.com\/parts\/[a-z0-9-]{3,140}$/;

// Known page-name patterns where RevZilla adds a model code.
// (Road King Special and Classic use different page names, so they're excluded.)
const REVZILLA_TEMPLATES: { test: RegExp; template: string }[] = [
  { test: /harley.*road\s*king(?!\s*(special|classic))/i, template: '{year}-harley-davidson-road-king-flhri' },
];

export function templateFor(make: string, model: string): string | undefined {
  const name = `${make} ${model}`;
  return REVZILLA_TEMPLATES.find((t) => t.test.test(name))?.template;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const compact = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

/** "BMW Motorrad" -> "bmw", "Indian Motorcycle" -> "indian" */
export function makeSlug(make: string): string {
  return slugify(make.replace(/\b(motorrad|motorcycles?|motor company|motor co\.?|motors)\b/gi, ' '));
}

export function yearOf(...texts: (string | undefined)[]): number | null {
  for (const t of texts) {
    const m = t?.match(/\b(19[6-9]\d|20[0-4]\d)\b/);
    if (m) return Number(m[1]);
  }
  return null;
}

/** The model name without year, make or bracketed codes, e.g. "Road King". */
export function modelOnly(model: string, make: string): string {
  let base = model.replace(/\b(19|20)\d{2}\b/g, ' ');
  const makeWords = make.replace(/\b(motorrad|motorcycles?|motor company)\b/gi, ' ').trim();
  if (makeWords) base = base.replace(new RegExp(makeWords.replace(/[-\s]+/g, '[-\\s]*'), 'i'), ' ');
  base = base.replace(/harley[-\s]*davidson/i, ' ');
  return base.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeRevzillaUrl(raw?: string): string | null {
  if (!raw) return null;
  const u = raw.trim().replace(/^http:\/\//, 'https://').replace('://revzilla.com', '://www.revzilla.com').split(/[?#]/)[0].replace(/\/$/, '');
  return PARTS_PAGE.test(u) ? u : null;
}

export function buildCandidates(opts: { year: number; make: string; model: string; geminiUrl?: string; template?: string }): string[] {
  const { year, make, model } = opts;
  const out: string[] = [];
  const add = (slug: string) => {
    const url = `https://www.revzilla.com/parts/${slug}`;
    if (slug && PARTS_PAGE.test(url) && !out.includes(url)) out.push(url);
  };

  const fromGemini = normalizeRevzillaUrl(opts.geminiUrl);
  if (fromGemini && fromGemini.includes(`/parts/${year}-`)) out.push(fromGemini);
  if (opts.template) add(opts.template.replace('{year}', String(year)));

  const mk = makeSlug(make);
  const plain = modelOnly(model, make);
  if (mk && plain) {
    add(`${year}-${mk}-${slugify(plain)}`); // 2024-yamaha-mt-07, 2021-bmw-r-1250-gs
    add(`${year}-${mk}-${slugify(plain.replace(/\b([a-z])\s+(?=\d)/gi, '$1').replace(/(\d)\s+(?=[a-z])/gi, '$1'))}`); // r1250gs style
    const code = model.match(/\(([A-Za-z0-9/ -]{2,12})\)/)?.[1];
    if (code) {
      const c = slugify(code.replace(/\//g, ''));
      add(`${year}-${mk}-${slugify(plain)}-${c}`);
      if (/^(fl|fx|xl)/i.test(code) && !c.endsWith('i')) add(`${year}-${mk}-${slugify(plain)}-${c}i`);
    }
  }
  return out.slice(0, 5);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Loads one candidate page and checks it really is this bike's parts page. */
export async function verifyCandidate(url: string, year: number, model: string, make: string, fetchFn: FetchLike): Promise<RevzillaBike | null> {
  try {
    const res = await fetchFn(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const finalUrl = (res.url || url).split(/[?#]/)[0].replace(/\/$/, '');
    if (!PARTS_PAGE.test(finalUrl)) return null;

    const html = await res.text();
    const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
    if (!/parts\s*&\s*accessories/i.test(title) || !title.includes(String(year))) return null;

    // Same bike? The page title must contain the model name ("roadking" in "2014harleydavidsonroadkingflhri...")
    const wanted = compact(modelOnly(model, make));
    if (wanted.length >= 2 && !compact(title).includes(wanted)) return null;

    const vehicleId = html.match(/vehicle_id(?:=|%3D|&#61;)(\d{2,9})/)?.[1] || html.match(/"vehicle_?id"\s*:\s*"?(\d{2,9})/i)?.[1];
    const name = title.replace(/\s*Parts\s*&\s*Accessories[\s\S]*$/i, '').trim();
    return { url: finalUrl, name, vehicleId };
  } catch {
    return null;
  }
}

const cache = new Map<string, { value: RevzillaBike | null; expires: number }>();

export async function findRevzillaBike(
  opts: { year: number; make: string; model: string; geminiUrl?: string; template?: string },
  fetchFn: FetchLike = fetch as unknown as FetchLike
): Promise<RevzillaBike | null> {
  const candidates = buildCandidates(opts);
  if (candidates.length === 0) return null;

  const key = `${opts.year}|${compact(opts.make)}|${compact(modelOnly(opts.model, opts.make))}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  // Check all candidates at once, keep the first (most likely) one that verifies
  const results = await Promise.all(candidates.map((url) => verifyCandidate(url, opts.year, opts.model, opts.make, fetchFn)));
  const found = results.find((r): r is RevzillaBike => !!r) || null;

  cache.set(key, { value: found, expires: Date.now() + (found ? 24 : 1) * 60 * 60 * 1000 });
  return found;
}
