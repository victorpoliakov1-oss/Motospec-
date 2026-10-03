// Calls Gemini with the right model for each step, and never wastes requests.
//
// Search step (Google Search on): Gemini 2.5 Flash first. On Google's FREE API tier,
//   Google Search is "Not available" for Gemini 3.x models, but 2.5 Flash includes it
//   free (up to 500 searches/day, shared with 2.5 Flash-Lite).
// Plain step (no search, strict JSON): Gemini 3.8 Flash first (free tokens on free tier).
//
// Retries: only a temporary "busy/overloaded" error is retried, once. A quota error
// ("You exceeded your current quota") is NOT retried: that model is put on a cooldown
// and skipped by later lookups until its limit resets, so no requests are wasted.
//
// Model lists can be changed without code via the GEMINI_SEARCH_MODELS and
// GEMINI_MODELS environment variables (comma-separated), e.g. after enabling billing.

import type { GenerateFn, Source } from './lookup';

const DEFAULT_SEARCH_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.8-flash'];
const DEFAULT_PLAIN_MODELS = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'];

function modelsFromEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  const list = raw ? raw.split(',').map((m) => m.trim()).filter(Boolean) : [];
  return list.length ? list : fallback;
}

export type ErrorKind = 'quota' | 'busy' | 'auth' | 'model' | 'timeout' | 'other';

export interface ClassifiedError {
  kind: ErrorKind;
  /** How long to skip this model, when Google says (or implies) how long. */
  retryAfterMs?: number;
  daily?: boolean;
}

/** Reads Google's error (often a JSON string inside err.message) and decides what it means. */
export function classifyError(err: unknown): ClassifiedError {
  const e = err as any;
  const msg = String(e?.message || e || '');
  const status: number | undefined = typeof e?.status === 'number' ? e.status : Number(msg.match(/"code"\s*:\s*(\d{3})/)?.[1]) || undefined;

  if (e?.name === 'AbortError' || /\babort(ed)?\b|timed? ?out|deadline/i.test(msg)) return { kind: 'timeout' };
  if (/API key not valid|API_KEY_INVALID|API key expired|GEMINI_API_KEY environment variable is missing/i.test(msg) || status === 401) {
    return { kind: 'auth' };
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|exceeded your current quota|quota/i.test(msg)) {
    const seconds = Number(msg.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)?.[1] || msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i)?.[1]);
    const daily = /PerDay|per day|daily/i.test(msg);
    return { kind: 'quota', daily, retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined };
  }
  if (status === 404 || /NOT_FOUND|is not found|not supported|is not available|unsupported/i.test(msg)) return { kind: 'model' };
  if ((status !== undefined && status >= 500) || /UNAVAILABLE|overloaded|high demand|INTERNAL|try again later/i.test(msg)) return { kind: 'busy' };
  return { kind: 'other' };
}

/** Milliseconds until the next midnight in US Pacific time, when Google resets daily limits. */
export function msUntilPacificMidnight(now = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
    const elapsed = (get('hour') * 3600 + get('minute') * 60 + get('second')) * 1000;
    return Math.max(60_000, 24 * 3600_000 - elapsed + 60_000); // +1 min safety
  } catch {
    return 3600_000;
  }
}

export class AllModelsUnavailableError extends Error {
  constructor(
    public reason: ErrorKind,
    public lastError?: unknown
  ) {
    super(
      reason === 'quota'
        ? 'RESOURCE_EXHAUSTED: Gemini quota used up for every model available to this step.'
        : `All Gemini models unavailable (${reason}).`
    );
  }
}

type ClientLike = { models: { generateContent(req: any): Promise<any> } };

export interface GenerateOptions {
  getClient: () => ClientLike;
  log?: (msg: string) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

function groundingSources(response: any, limit = 8): Source[] {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const chunk of chunks) {
    const web = chunk?.web;
    if (web?.uri && web?.title && !seen.has(web.uri)) {
      seen.add(web.uri);
      out.push({ title: web.title, uri: web.uri });
    }
  }
  return out.slice(0, limit);
}

export function createGenerate(opts: GenerateOptions): GenerateFn & { cooldowns: Map<string, { until: number; reason: ErrorKind }> } {
  const log = opts.log || (() => {});
  const now = opts.now || Date.now;
  const sleep = opts.sleep || ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  // "model|search" or "model|plain" -> time (ms) until which it is skipped
  const cooldowns = new Map<string, { until: number; reason: ErrorKind }>();

  const coolDown = (model: string, search: boolean, ms: number, why: string, reason: ErrorKind) => {
    const until = now() + ms;
    cooldowns.set(`${model}|${search ? 'search' : 'plain'}`, { until, reason });
    log(`Skipping ${model} (${search ? 'with search' : 'plain'}) for ${Math.round(ms / 60000)} min: ${why}`);
  };
  const cooling = (model: string, search: boolean) => {
    const c = cooldowns.get(`${model}|${search ? 'search' : 'plain'}`);
    return c && c.until > now() ? c : null;
  };

  const generate = async (prompt: string, { search, jsonSchema }: { search: boolean; jsonSchema?: object }) => {
    const models = search ? modelsFromEnv('GEMINI_SEARCH_MODELS', DEFAULT_SEARCH_MODELS) : modelsFromEnv('GEMINI_MODELS', DEFAULT_PLAIN_MODELS);
    const ai = opts.getClient();
    const deadline = now() + (search ? 70_000 : 40_000);
    let lastErr: unknown = null;
    let lastKind: ErrorKind = 'other';
    let tried = 0;
    const skippedReasons: ErrorKind[] = [];

    for (const model of models) {
      const c = cooling(model, search);
      if (c) {
        skippedReasons.push(c.reason);
        continue;
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        const remaining = deadline - now();
        if (remaining < 3_000) throw lastErr || new Error('Lookup timed out');
        tried++;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(remaining, search ? 50_000 : 30_000));
        try {
          const config: any = { temperature: 0.2, abortSignal: controller.signal };
          if (search) config.tools = [{ googleSearch: {} }];
          if (jsonSchema) {
            config.responseMimeType = 'application/json';
            config.responseJsonSchema = jsonSchema;
          }
          const response = await ai.models.generateContent({ model, contents: prompt, config });
          const text = response?.text || '';
          if (text.trim()) return { text, sources: groundingSources(response) };
          lastErr = new Error(`Empty answer from ${model}`);
          lastKind = 'other';
          break; // next model
        } catch (err) {
          lastErr = err;
          const c = classifyError(err);
          lastKind = c.kind;
          if (c.kind === 'auth') throw err; // a bad key won't get better on another model

          if (c.kind === 'quota') {
            // Never retry a quota error: skip this model until its limit resets
            const ms = c.retryAfterMs ?? (c.daily ? msUntilPacificMidnight(new Date(now())) : 15 * 60_000);
            coolDown(model, search, Math.max(ms, 10_000), c.daily ? 'daily limit reached' : 'quota limit reached', 'quota');
            if (!search && c.daily) coolDown(model, true, Math.max(ms, 10_000), 'daily limit reached', 'quota');
            break;
          }
          if (c.kind === 'model') {
            coolDown(model, search, 6 * 3600_000, 'model not available for this step', 'model');
            break;
          }
          if (c.kind === 'busy' && attempt === 0) {
            await sleep(1_500); // one retry for a temporary overload
            continue;
          }
          break; // timeout, still busy, bad request: next model
        } finally {
          clearTimeout(timer);
        }
      }
    }

    if (tried === 0) {
      // Everything is on cooldown: fail instantly without spending a request
      throw new AllModelsUnavailableError(skippedReasons.includes('quota') ? 'quota' : skippedReasons[0] || 'other');
    }
    if (lastKind === 'quota') throw new AllModelsUnavailableError('quota', lastErr);
    throw lastErr || new AllModelsUnavailableError(lastKind);
  };

  return Object.assign(generate, { cooldowns });
}
