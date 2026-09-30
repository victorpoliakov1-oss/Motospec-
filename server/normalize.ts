// Turns whatever shape Gemini answers in into the exact shape the app uses.
// Gemini (especially with Google Search switched on) sometimes wraps its JSON
// in prose, renames fields ("specifications", "known_issues"), nests values,
// or writes "N/A". Everything here is defensive so none of that reaches the UI.

export const PART_CATEGORIES = [
  'Exhaust & Tuning',
  'Crash Protection',
  'Styling',
  'Suspension & Brakes',
  'Ergonomics & Controls',
  'Luggage & Touring',
  'Lighting & Electronics',
] as const;

const SEVERITIES = ['High', 'Moderate', 'Common', 'Watchpoint', 'Low'] as const;
const INSTALL_LEVELS = ['Easy (DIY)', 'Moderate', 'Advanced (Shop recommended)'] as const;

// ---------------------------------------------------------------------------
// JSON extraction
// ---------------------------------------------------------------------------

function tryParse(text: string): unknown | null {
  const attempts = [text, text.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"')];
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      /* try the next repair */
    }
  }
  return null;
}

function findBalancedEnd(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** True for objects, and for arrays that contain at least one object. Rejects things like [1] or [2, 3]. */
function isUseful(v: unknown): boolean {
  if (Array.isArray(v)) return v.some((x) => !!x && typeof x === 'object');
  return !!v && typeof v === 'object';
}

/**
 * Returns the LARGEST valid JSON object/array in the text.
 * (Grounded answers often contain citation markers like "[1]" before the real JSON,
 * and "[1]" is itself valid JSON, so "first match wins" is not safe.)
 */
function parseLargestJson(s: string): unknown | null {
  const direct = tryParse(s.trim());
  if (isUseful(direct)) return direct;

  let best: unknown = null;
  let bestLength = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{' && s[i] !== '[') continue;
    const end = findBalancedEnd(s, i);
    if (end === -1) continue;
    const chunk = s.slice(i, end + 1);
    const parsed = tryParse(chunk);
    if (isUseful(parsed)) {
      if (chunk.length > bestLength) {
        best = parsed;
        bestLength = chunk.length;
      }
      i = end; // anything nested inside this chunk is smaller
    }
  }
  return best;
}

/** Finds the JSON in a model answer: fenced blocks first, then the first balanced object. */
export function extractJson(text: string | undefined | null): unknown | null {
  if (!text) return null;
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  for (const candidate of [...fenced, text]) {
    const parsed = parseLargestJson(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

const keyNorm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
const BLANK = /^(n\/?a|unknown|not (available|specified|listed|published|applicable)|none|null|undefined|tbd|-+|—|–|\?)$/i;

function tidy(s: string): string {
  return s
    .replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, '') // citation markers like [1] or [2, 3]
    .replace(/\*\*|__/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function humanize(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Any value -> clean single-line string ('' when empty or placeholder). */
export function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const t = tidy(value);
    return BLANK.test(t) ? '' : t;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => {
        const t = text(v);
        return t ? `${humanize(k)}: ${t}` : '';
      })
      .filter(Boolean)
      .join('; ');
  }
  return '';
}

/** Multi-paragraph text: keeps paragraph breaks. */
function paragraphs(value: unknown): string {
  if (Array.isArray(value)) return value.map(paragraphs).filter(Boolean).join('\n\n');
  if (typeof value !== 'string') return text(value);
  return value
    .split(/\n\s*\n/)
    .map((p) => tidy(p))
    .filter((p) => p && !BLANK.test(p))
    .join('\n\n');
}

function list(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') {
    return value
      .split(/\n+|(?:^|\s)[•\-*]\s+/)
      .map((s) => text(s))
      .filter(Boolean);
  }
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => {
        const t = text(v);
        return t ? `${humanize(k)}: ${t}` : '';
      })
      .filter(Boolean);
  }
  return [];
}

/** Value of the first key (any spelling or casing) that matches one of the aliases. */
function pick(obj: Record<string, unknown>, aliases: string[]): unknown {
  const wanted = aliases.map(keyNorm);
  for (const alias of wanted) {
    for (const [k, v] of Object.entries(obj)) {
      if (keyNorm(k) === alias) return v;
    }
  }
  return undefined;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

const TOP = {
  model: ['model', 'fullName', 'name', 'motorcycleModel', 'motorcycle', 'bike', 'title'],
  make: ['make', 'manufacturer', 'brand'],
  year: ['year', 'modelYear', 'years', 'modelYears', 'generation'],
  category: ['category', 'type', 'class', 'segment', 'style'],
  overview: ['overview', 'description', 'summary', 'review', 'about'],
  specs: ['specs', 'specifications', 'technicalSpecs', 'technicalSpecifications', 'techSpecs', 'spec', 'keySpecs'],
  highlights: ['highlights', 'features', 'keyFeatures', 'notableFeatures'],
  knownIssues: ['knownIssues', 'issues', 'commonIssues', 'commonProblems', 'problems', 'knownProblems', 'watchpoints'],
  maintenance: ['maintenanceNotes', 'maintenance', 'serviceIntervals', 'service', 'maintenanceSchedule'],
  revzilla: ['revzillaPartsUrl', 'revzillaUrl', 'revzilla'],
  found: ['found', 'exists', 'identified'],
  suggestion: ['suggestion', 'didYouMean', 'closestMatch'],
};

const SPEC_FIELDS: Record<string, string[]> = {
  engine: ['engine', 'engineType', 'motor', 'powerplant'],
  displacement: ['displacement', 'engineDisplacement', 'capacity', 'engineCapacity', 'cc'],
  power: ['power', 'maxPower', 'horsepower', 'peakPower', 'maximumPower', 'hp'],
  torque: ['torque', 'maxTorque', 'peakTorque', 'maximumTorque'],
  transmission: ['transmission', 'gearbox', 'gears'],
  curbWeight: ['curbWeight', 'kerbWeight', 'wetWeight', 'weight', 'dryWeight'],
  seatHeight: ['seatHeight'],
  fuelCapacity: ['fuelCapacity', 'fuelTank', 'fuelTankCapacity', 'tankCapacity'],
  brakes: ['brakes', 'brake', 'brakingSystem'],
  suspensionFront: ['suspensionFront', 'frontSuspension'],
  suspensionRear: ['suspensionRear', 'rearSuspension'],
  topSpeed: ['topSpeed', 'maxSpeed', 'maximumSpeed', 'estimatedTopSpeed'],
  fuelEconomy: ['fuelEconomy', 'fuelConsumption', 'mileage', 'mpg', 'economy'],
};

function looksLikeSpecs(o: Record<string, unknown>): boolean {
  const keys = Object.keys(o).map(keyNorm);
  const known = new Set([...TOP.model, ...TOP.specs, ...TOP.overview].map(keyNorm));
  return keys.some((k) => known.has(k));
}

/** Handles answers like {"motorcycle": {...}} or [{...}]. */
function unwrap(raw: unknown): Record<string, unknown> | null {
  if (Array.isArray(raw)) return unwrap(raw.find(isObject));
  if (!isObject(raw)) return null;
  if (looksLikeSpecs(raw)) {
    // {"motorcycle": {...full object...}} also "looks like" specs via the "motorcycle" key
    const inner = Object.values(raw).find((v) => isObject(v) && looksLikeSpecs(v as Record<string, unknown>) && pick(v as Record<string, unknown>, TOP.specs));
    if (inner && !pick(raw, TOP.specs)) return inner as Record<string, unknown>;
    return raw;
  }
  const inner = Object.values(raw).find(isObject);
  return inner ? unwrap(inner) : raw;
}

function normalizeSeverity(raw: unknown): (typeof SEVERITIES)[number] {
  const s = text(raw).toLowerCase();
  if (/high|critical|severe|major|serious/.test(s)) return 'High';
  if (/moderate|medium/.test(s)) return 'Moderate';
  if (/common|frequent|widespread/.test(s)) return 'Common';
  if (/low|minor/.test(s)) return 'Low';
  return 'Watchpoint';
}

export interface NormalizedSpecs {
  model: string;
  make?: string;
  year?: string;
  category?: string;
  overview: string;
  specs: Record<string, string>;
  highlights: string[];
  knownIssues: {
    title: string;
    severity: (typeof SEVERITIES)[number];
    category?: string;
    affectedYears?: string;
    description: string;
    solution?: string;
  }[];
  maintenanceNotes: string[];
  revzillaPartsUrl?: string;
}

export interface NotFound {
  notFound: true;
  suggestion?: string;
}

export function isNotFound(x: NormalizedSpecs | NotFound | null): x is NotFound {
  return !!x && (x as NotFound).notFound === true;
}

export function normalizeSpecs(raw: unknown, typedModel: string): NormalizedSpecs | NotFound | null {
  const obj = unwrap(raw);
  if (!obj) return null;

  const found = pick(obj, TOP.found);
  if (found === false || text(found).toLowerCase() === 'false') {
    return { notFound: true, suggestion: text(pick(obj, TOP.suggestion)) || undefined };
  }

  // Specs may be nested under "specs" or sit at the top level
  const specSource = isObject(pick(obj, TOP.specs)) ? (pick(obj, TOP.specs) as Record<string, unknown>) : obj;
  const specs: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(SPEC_FIELDS)) {
    const value = text(pick(specSource, aliases));
    if (value) specs[field] = value;
  }
  // {"suspension": {"front": "...", "rear": "..."}}
  const suspension = pick(specSource, ['suspension']);
  if (isObject(suspension)) {
    if (!specs.suspensionFront) specs.suspensionFront = text(pick(suspension, ['front']));
    if (!specs.suspensionRear) specs.suspensionRear = text(pick(suspension, ['rear']));
  } else if (typeof suspension === 'string' && !specs.suspensionFront) {
    specs.suspensionFront = text(suspension);
  }
  for (const k of Object.keys(specs)) if (!specs[k]) delete specs[k];

  const rawModel = pick(obj, TOP.model);
  const model = (typeof rawModel === 'string' ? text(rawModel) : '') || tidy(typedModel);

  const rawIssues = pick(obj, TOP.knownIssues);
  const knownIssues = (Array.isArray(rawIssues) ? rawIssues : rawIssues ? [rawIssues] : [])
    .map((issue) => {
      if (typeof issue === 'string') {
        const t = text(issue);
        return t ? { title: t, severity: 'Watchpoint' as const, description: '' } : null;
      }
      if (!isObject(issue)) return null;
      const title = text(pick(issue, ['title', 'name', 'issue', 'problem']));
      const description = text(pick(issue, ['description', 'details', 'symptoms', 'explanation', 'summary']));
      if (!title && !description) return null;
      return {
        title: title || description.split('. ')[0],
        severity: normalizeSeverity(pick(issue, ['severity', 'level', 'risk', 'priority'])),
        category: text(pick(issue, ['category', 'area', 'system'])) || undefined,
        affectedYears: text(pick(issue, ['affectedYears', 'years', 'affected', 'modelYears'])) || undefined,
        description,
        solution: text(pick(issue, ['solution', 'fix', 'remedy', 'resolution', 'recommendation'])) || undefined,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const revzilla = text(pick(obj, TOP.revzilla));

  return {
    model,
    make: text(pick(obj, TOP.make)) || undefined,
    year: text(pick(obj, TOP.year)) || undefined,
    category: text(pick(obj, TOP.category)) || undefined,
    overview: paragraphs(pick(obj, TOP.overview)),
    specs,
    highlights: list(pick(obj, TOP.highlights)),
    knownIssues,
    maintenanceNotes: list(pick(obj, TOP.maintenance)),
    revzillaPartsUrl: /^https?:\/\//.test(revzilla) ? revzilla : undefined,
  };
}

/** Enough real content to show? Otherwise we repair or report, never show a blank page. */
export function specsAreUsable(s: NormalizedSpecs): boolean {
  const filled = Object.values(s.specs).filter(Boolean).length;
  return !!s.model && (filled >= 4 || (filled >= 2 && s.overview.length >= 80));
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

export function closestCategory(raw: unknown): (typeof PART_CATEGORIES)[number] {
  const exact = PART_CATEGORIES.find((c) => c.toLowerCase() === text(raw).toLowerCase());
  if (exact) return exact;
  const c = text(raw).toLowerCase();
  if (/exhaust|tun|intake|air|ecu|fuel|muffler|pipe|header/.test(c)) return 'Exhaust & Tuning';
  if (/crash|slider|guard|protect/.test(c)) return 'Crash Protection';
  if (/suspens|brake|shock|fork|rotor|pad/.test(c)) return 'Suspension & Brakes';
  if (/ergo|control|seat|bar|lever|peg|board|grip/.test(c)) return 'Ergonomics & Controls';
  if (/lugg|bag|tour|rack|case|windshield|windscreen/.test(c)) return 'Luggage & Touring';
  if (/light|electr|led|lamp|audio|speaker/.test(c)) return 'Lighting & Electronics';
  return 'Styling';
}

function normalizeInstall(raw: unknown): (typeof INSTALL_LEVELS)[number] | undefined {
  const s = text(raw).toLowerCase();
  if (!s) return undefined;
  if (/easy|diy|simple|beginner/.test(s)) return 'Easy (DIY)';
  if (/advanced|shop|professional|dealer|hard|difficult/.test(s)) return 'Advanced (Shop recommended)';
  return 'Moderate';
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export interface NormalizedPart {
  id: string;
  name: string;
  brand: string;
  category: string;
  searchQuery?: string;
  fitmentNotes: string;
  estimatedPrice: string;
  description: string;
  keyBenefits: string[];
  installationDifficulty?: (typeof INSTALL_LEVELS)[number];
}

export function normalizeParts(raw: unknown): NormalizedPart[] {
  let arr: unknown = raw;
  if (isObject(raw)) {
    arr = pick(raw, ['parts', 'aftermarketParts', 'items', 'products', 'results', 'upgrades', 'recommendations']);
    if (!Array.isArray(arr)) {
      // {"motorcycle": {"parts": [...]}} or category -> list maps
      const nested = Object.values(raw).find((v) => isObject(v) && Array.isArray(pick(v as Record<string, unknown>, ['parts', 'items', 'products'])));
      if (nested) arr = pick(nested as Record<string, unknown>, ['parts', 'items', 'products']);
      else {
        const lists = Object.entries(raw).filter(([, v]) => Array.isArray(v));
        arr = lists.flatMap(([cat, v]) => (v as unknown[]).map((p) => (isObject(p) && !pick(p, ['category']) ? { ...p, category: cat } : p)));
      }
    }
  }
  if (!Array.isArray(arr)) return [];

  const seen = new Set<string>();
  const out: NormalizedPart[] = [];
  for (const p of arr) {
    if (!isObject(p)) continue;
    let name = text(pick(p, ['name', 'productName', 'product', 'title', 'partName']));
    const brand = text(pick(p, ['brand', 'manufacturer', 'maker', 'make']));
    if (!name || !brand) continue;
    // Drop the brand if the model repeated it at the start of the name
    if (name.toLowerCase().startsWith(brand.toLowerCase() + ' ')) name = name.slice(brand.length).trim();
    const id = `part-${slugify(`${brand} ${name}`)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      brand,
      category: closestCategory(pick(p, ['category', 'type', 'group'])),
      searchQuery: text(pick(p, ['searchQuery', 'storeQuery', 'query', 'searchTerm'])) || undefined,
      fitmentNotes: text(pick(p, ['fitmentNotes', 'fitment', 'fits', 'compatibility'])),
      estimatedPrice: text(pick(p, ['estimatedPrice', 'price', 'priceRange', 'cost'])),
      description: text(pick(p, ['description', 'summary', 'details', 'why'])),
      keyBenefits: list(pick(p, ['keyBenefits', 'benefits', 'pros', 'features'])),
      installationDifficulty: normalizeInstall(pick(p, ['installationDifficulty', 'installation', 'difficulty', 'install'])),
    });
  }
  return out;
}
