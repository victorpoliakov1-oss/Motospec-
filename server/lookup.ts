// Online lookups for bikes and parts.
//
// Step 1: ask Gemini WITH Google Search for the answer as JSON.
// Step 2: if that answer is missing, malformed or too thin, ask Gemini again
//         WITHOUT search but with a strict JSON schema, feeding it the step-1
//         research, so the shape is guaranteed.
// If both fail we throw a LookupError with a message the rider can act on.
// A blank page is never an option.

import {
  extractJson,
  normalizeParts,
  normalizeSpecs,
  specsAreUsable,
  isNotFound,
  PART_CATEGORIES,
  type NormalizedPart,
  type NormalizedSpecs,
} from './normalize';

export interface Source {
  title: string;
  uri: string;
}

export interface GenerateResult {
  text: string;
  sources: Source[];
}

/** Injected so the lookup logic can be tested without calling Gemini. */
export type GenerateFn = (prompt: string, options: { search: boolean; jsonSchema?: object }) => Promise<GenerateResult>;

export class LookupError extends Error {
  constructor(
    message: string,
    public status = 503,
    public suggestion?: string
  ) {
    super(message);
  }
}

/** Turns a raw Gemini/network error into a message the rider understands. */
export function friendlyError(err: unknown, what: string): LookupError {
  if (err instanceof LookupError) return err;
  const msg = String((err as any)?.message || err || '');
  if (/GEMINI_API_KEY|API key not valid|API_KEY_INVALID/i.test(msg)) {
    return new LookupError('The Gemini API key is missing or invalid. Add GEMINI_API_KEY in Settings → Secrets.', 500);
  }
  if (/429|RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg)) {
    return new LookupError(`The AI service's usage limit was reached while looking up ${what}. Wait a minute and try again.`, 429);
  }
  if (/abort|timed? ?out|deadline/i.test(msg)) {
    return new LookupError(`Looking up ${what} took too long. Try again.`, 504);
  }
  return new LookupError(`Couldn't reach the AI service to look up ${what}. Try again in a minute.`, 503);
}

// ---------------------------------------------------------------------------
// Schemas for the repair pass (JSON Schema, passed as responseJsonSchema)
// ---------------------------------------------------------------------------

const str = { type: 'string' };

const SPEC_PROPS = {
  engine: str,
  displacement: str,
  power: str,
  torque: str,
  transmission: str,
  curbWeight: str,
  seatHeight: str,
  fuelCapacity: str,
  brakes: str,
  suspensionFront: str,
  suspensionRear: str,
  topSpeed: str,
  fuelEconomy: str,
};

export const SPECS_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    suggestion: str,
    model: str,
    make: str,
    year: str,
    category: str,
    overview: str,
    specs: { type: 'object', properties: SPEC_PROPS },
    highlights: { type: 'array', items: str },
    knownIssues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: str,
          severity: { type: 'string', enum: ['High', 'Moderate', 'Common', 'Watchpoint', 'Low'] },
          category: str,
          affectedYears: str,
          description: str,
          solution: str,
        },
        required: ['title', 'severity', 'description'],
      },
    },
    maintenanceNotes: { type: 'array', items: str },
    revzillaPartsUrl: str,
  },
  required: ['found', 'model', 'specs'],
};

export const PARTS_SCHEMA = {
  type: 'object',
  properties: {
    motorcycleModel: str,
    parts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: str,
          brand: str,
          category: { type: 'string', enum: [...PART_CATEGORIES] },
          searchQuery: str,
          fitmentNotes: str,
          estimatedPrice: str,
          description: str,
          keyBenefits: { type: 'array', items: str },
          installationDifficulty: { type: 'string', enum: ['Easy (DIY)', 'Moderate', 'Advanced (Shop recommended)'] },
        },
        required: ['name', 'brand', 'category', 'searchQuery', 'description'],
      },
    },
  },
  required: ['parts'],
};

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SPECS_JSON_SHAPE = `{
  "found": true,
  "suggestion": "",
  "model": "<model year> <make> <model name and variant code>",
  "make": "<manufacturer>",
  "year": "<model year, or the generation's year range>",
  "category": "<Naked | Supersport | Sport Touring | Adventure | Cruiser | Touring | Dual Sport | Scooter | other>",
  "overview": "<2-3 short plain-language paragraphs: engine character, handling, comfort, who it suits>",
  "specs": {
    "engine": "<capacity, cooling, valve train, cylinder layout>",
    "displacement": "<cc (cu in)>",
    "power": "<hp (kW) @ rpm>",
    "torque": "<Nm (lb-ft) @ rpm>",
    "transmission": "<number of gears, clutch type>",
    "curbWeight": "<kg (lb), say wet or dry>",
    "seatHeight": "<mm (in)>",
    "fuelCapacity": "<L (US gal)>",
    "brakes": "<front and rear discs, calipers, ABS>",
    "suspensionFront": "<fork type, diameter, travel>",
    "suspensionRear": "<shock type, travel, adjustability>",
    "topSpeed": "<km/h (mph), approximate>",
    "fuelEconomy": "<L/100 km (mpg), typical>"
  },
  "highlights": ["<3-4 notable features>"],
  "knownIssues": [
    {
      "title": "<short name of the issue>",
      "severity": "<High | Moderate | Common | Watchpoint | Low>",
      "category": "<Engine & Drivetrain | Chassis & Suspension | Electrical & Electronics | Thermal & Cooling>",
      "affectedYears": "<affected years>",
      "description": "<what goes wrong, why, and the symptoms>",
      "solution": "<recall fix, preventive step or proven remedy>"
    }
  ],
  "maintenanceNotes": ["<3-5 key service intervals>"],
  "revzillaPartsUrl": "<RevZilla's parts page for this exact bike and year if you find it, starting https://www.revzilla.com/parts/ , else empty>"
}`;

export function specsPrompt(query: string): string {
  return `A motorcycle rider typed: ${JSON.stringify(query)}.
Use Google Search to identify the exact motorcycle they mean and look up its details.
The text may contain typos, a missing make, or no year. If no year is given, use the most recent model year and include it in "model".

Rules:
- Describe ONLY that model year's generation. Never mix in engines, suspension or features from other generations.
- Prefer manufacturer spec sheets, owner's manuals and established motorcycle publications.
- Use metric with imperial in brackets. Leave a field as "" if you cannot confirm it. Never write "N/A", and never copy the placeholder text.
- Known issues: only problems widely documented by owners, recalls or service bulletins for this generation.
- If the text is not a real motorcycle, set "found": false and put the closest real model in "suggestion".

Reply with ONLY this JSON object, no other text:
${SPECS_JSON_SHAPE}`;
}

function specsRepairPrompt(query: string, research: string): string {
  return `A motorcycle rider typed: ${JSON.stringify(query)}.
Fill in the JSON for the exact motorcycle they mean (fix typos, add the make, and if there's no year use the most recent model year and include it in "model").
${research ? `Base your answer on these research notes from a web search:\n"""\n${research.slice(0, 12000)}\n"""\nYou may add well-established facts you are certain of.` : 'Use well-established facts you are certain of.'}
Describe only that model year's generation. Leave any field you are not sure of as "". Never write "N/A".
If it is not a real motorcycle, set "found" to false and put the closest real model in "suggestion".`;
}

export function partsPrompt(model: string, partQuery: string): string {
  const scope = partQuery
    ? `The rider is looking for: ${JSON.stringify(partQuery)}. Return 4 to 8 distinct matching products.`
    : `Return 2 to 3 well-known products for EACH of these categories: ${PART_CATEGORIES.join(', ')}.`;
  return `Use Google Search to find real aftermarket parts listed as fitting this motorcycle: ${JSON.stringify(model)}.
The name may contain typos or skip the make; work out the exact bike first.
Check retailer and manufacturer listings (RevZilla, J&P Cycles, eBay Motors, and brand websites).
${scope}

Rules:
- Only include products listed for this bike's model and year range.
- One product per entry. Never combine two products (e.g. head pipes + mufflers) in one entry.
- "category" must be exactly one of: ${PART_CATEGORIES.join(', ')}.
- "fitmentNotes": the years and variants the listing says it fits, or "Check fitment for your year on the store page."
- "searchQuery": 3-6 words a shopper would type into a store's search box to find this exact product. Brand + product line only. No bike model, no year, no symbols.
- "estimatedPrice": typical US retail price range in dollars.

Reply with ONLY this JSON object, no other text:
{
  "motorcycleModel": "<full bike name with year>",
  "parts": [
    {
      "name": "<product name as the manufacturer lists it>",
      "brand": "<manufacturer>",
      "category": "<one of the categories above>",
      "searchQuery": "<short store search phrase>",
      "fitmentNotes": "<listed fitment>",
      "estimatedPrice": "<typical US price range>",
      "description": "<1-2 sentences on what it is and what it improves>",
      "keyBenefits": ["<2-3 short benefits>"],
      "installationDifficulty": "<Easy (DIY) | Moderate | Advanced (Shop recommended)>"
    }
  ]
}`;
}

function partsRepairPrompt(model: string, partQuery: string, research: string): string {
  return `List real aftermarket parts that fit this motorcycle: ${JSON.stringify(model)}.
${partQuery ? `The rider is looking for: ${JSON.stringify(partQuery)} (4 to 8 products).` : `Give 2 to 3 well-known products for each category: ${PART_CATEGORIES.join(', ')}.`}
${research ? `Base your answer on these research notes from a web search:\n"""\n${research.slice(0, 12000)}\n"""` : 'Only include products you are confident exist and fit this bike.'}
One product per entry. "searchQuery" is 3-6 words: brand + product line only, no bike model, no year, no symbols.`;
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export interface SpecsResult extends NormalizedSpecs {
  sources: Source[];
}

function notFoundError(query: string, suggestion?: string): LookupError {
  return new LookupError(
    suggestion
      ? `Couldn't find a motorcycle called "${query}". Did you mean ${suggestion}?`
      : `Couldn't find a motorcycle called "${query}". Check the spelling, or add the make and year (e.g. 2012 Harley-Davidson Road King).`,
    404,
    suggestion
  );
}

export async function lookupSpecs(query: string, generate: GenerateFn, log: (msg: string) => void = () => {}): Promise<SpecsResult> {
  let research = '';
  let sources: Source[] = [];
  let firstError: unknown = null;

  // Step 1: grounded search
  try {
    const result = await generate(specsPrompt(query), { search: true });
    research = result.text;
    sources = result.sources;
    const normalized = normalizeSpecs(extractJson(result.text), query);
    if (isNotFound(normalized)) throw notFoundError(query, normalized.suggestion);
    if (normalized && specsAreUsable(normalized)) return { ...normalized, sources };
    log(`Specs answer for "${query}" was incomplete, running repair pass. Start of answer: ${result.text.slice(0, 300)}`);
  } catch (err) {
    if (err instanceof LookupError) throw err;
    firstError = err;
    log(`Grounded specs lookup failed for "${query}": ${(err as any)?.message || err}`);
    if (/GEMINI_API_KEY|API key not valid|API_KEY_INVALID/i.test(String((err as any)?.message))) throw friendlyError(err, `"${query}"`);
  }

  // Step 2: structured repair pass
  try {
    const result = await generate(specsRepairPrompt(query, research), { search: false, jsonSchema: SPECS_SCHEMA });
    const normalized = normalizeSpecs(extractJson(result.text), query);
    if (isNotFound(normalized)) throw notFoundError(query, normalized.suggestion);
    if (normalized && specsAreUsable(normalized)) return { ...normalized, sources };
    log(`Repair pass for "${query}" was still too thin: ${result.text.slice(0, 300)}`);
  } catch (err) {
    if (err instanceof LookupError) throw err;
    throw friendlyError(firstError || err, `"${query}"`);
  }

  throw new LookupError(
    `Couldn't find reliable details for "${query}". Check the spelling, or add the make and year (e.g. 2012 Harley-Davidson Road King).`,
    404
  );
}

export interface PartsResult {
  motorcycleModel: string;
  partQuery: string;
  parts: NormalizedPart[];
  sources: Source[];
}

export async function lookupParts(
  model: string,
  partQuery: string,
  generate: GenerateFn,
  log: (msg: string) => void = () => {}
): Promise<PartsResult> {
  const enough = partQuery ? 1 : 6;
  let research = '';
  let sources: Source[] = [];
  let motorcycleModel = model;
  let firstError: unknown = null;
  let best: NormalizedPart[] = [];

  try {
    const result = await generate(partsPrompt(model, partQuery), { search: true });
    research = result.text;
    sources = result.sources;
    const json = extractJson(result.text) as any;
    best = normalizeParts(json);
    if (typeof json?.motorcycleModel === 'string' && json.motorcycleModel.trim()) motorcycleModel = json.motorcycleModel.trim();
    if (best.length >= enough) return { motorcycleModel, partQuery, parts: best, sources };
    log(`Parts answer for "${model}" had ${best.length} usable parts, running repair pass.`);
  } catch (err) {
    firstError = err;
    log(`Grounded parts lookup failed for "${model}": ${(err as any)?.message || err}`);
    if (/GEMINI_API_KEY|API key not valid|API_KEY_INVALID/i.test(String((err as any)?.message))) throw friendlyError(err, `parts for "${model}"`);
  }

  try {
    const result = await generate(partsRepairPrompt(model, partQuery, research), { search: false, jsonSchema: PARTS_SCHEMA });
    const json = extractJson(result.text) as any;
    const repaired = normalizeParts(json);
    if (repaired.length > best.length) best = repaired;
    if (typeof json?.motorcycleModel === 'string' && json.motorcycleModel.trim()) motorcycleModel = json.motorcycleModel.trim();
  } catch (err) {
    if (best.length === 0) throw friendlyError(firstError || err, `parts for "${model}"`);
  }

  if (best.length === 0 && !partQuery) {
    throw new LookupError(`Couldn't find aftermarket parts for "${model}" right now. Try again, or search for a specific part.`, 404);
  }
  return { motorcycleModel, partQuery, parts: best, sources };
}
