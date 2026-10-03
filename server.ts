import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { findMatchingPresetSpecs, findMatchingPresetParts } from './src/data/fallbackDatabase';
import { sanitizeTechnicalSources } from './src/utils/technicalManuals';
import { lookupSpecs, lookupParts, LookupError, friendlyError } from './server/lookup';
import { createGenerate } from './server/gemini';
import { findRevzillaBike, templateFor, yearOf } from './server/revzilla';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Only successful lookups are cached, so a temporary outage never "sticks" to a bike.
// Answers made WITHOUT web search (daily search limit reached) are kept for 1 hour only,
// so a proper search answer replaces them once the limit resets.
type CacheEntry = { value: any; expires: number };
const specsCache = new Map<string, CacheEntry>();
const partsCache = new Map<string, CacheEntry>();
const fromCache = (cache: Map<string, CacheEntry>, key: string) => {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
};
const toCache = (cache: Map<string, CacheEntry>, key: string, value: any) => {
  const hours = value?.grounded === false ? 1 : 24 * 7;
  cache.set(key, { value, expires: Date.now() + hours * 3600_000 });
};

// ---------------------------------------------------------------------------
// Gemini (model choice, retries and cooldowns live in server/gemini.ts)
// ---------------------------------------------------------------------------

let client: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is missing.');
  if (!client) {
    client = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
  }
  return client;
}

const log = (msg: string) => console.warn(`[MotoSpec] ${msg}`);
const generate = createGenerate({ getClient: getGeminiClient, log });

function sendError(res: express.Response, err: unknown, what: string) {
  const e = err instanceof LookupError ? err : friendlyError(err, what);
  if (!(err instanceof LookupError)) log(`${what}: ${(err as any)?.message || err}`);
  return res.status(e.status).json({ error: e.message, suggestion: e.suggestion });
}

// ---------------------------------------------------------------------------
// Specs & known issues
// ---------------------------------------------------------------------------
app.post('/api/motorcycle/specs', async (req, res) => {
  const { model } = req.body || {};
  if (!model || typeof model !== 'string' || !model.trim()) {
    return res.status(400).json({ error: 'Enter a motorcycle make and model.' });
  }
  const query = model.trim().slice(0, 120);
  const cacheKey = query.toLowerCase();
  const cachedSpecs = fromCache(specsCache, cacheKey);
  if (cachedSpecs) return res.json(cachedSpecs);

  const preset = findMatchingPresetSpecs(query);
  if (preset) {
    const result = { ...preset, sources: sanitizeTechnicalSources(preset.sources, preset.model || query) };
    toCache(specsCache, cacheKey, result);
    return res.json(result);
  }

  try {
    const found = await lookupSpecs(query, generate, log);
    const result = { ...found, sources: sanitizeTechnicalSources(found.sources, found.model) };
    toCache(specsCache, cacheKey, result);
    return res.json(result);
  } catch (err) {
    return sendError(res, err, `"${query}"`);
  }
});

// ---------------------------------------------------------------------------
// Aftermarket parts (the client filters categories locally)
// ---------------------------------------------------------------------------
app.post('/api/motorcycle/parts', async (req, res) => {
  const { model, partQuery } = req.body || {};
  if (!model || typeof model !== 'string' || !model.trim()) {
    return res.status(400).json({ error: 'Enter a motorcycle model before searching for parts.' });
  }
  const bike = model.trim().slice(0, 120);
  const query = typeof partQuery === 'string' ? partQuery.trim().slice(0, 80) : '';
  const cacheKey = `${bike.toLowerCase()}__${query.toLowerCase()}`;
  const cachedParts = fromCache(partsCache, cacheKey);
  if (cachedParts) return res.json(cachedParts);

  if (!query) {
    const preset = findMatchingPresetParts(bike);
    if (preset) {
      const result = { ...preset, partQuery: '', sources: [] };
      toCache(partsCache, cacheKey, result);
      return res.json(result);
    }
  }

  try {
    const result = await lookupParts(bike, query, generate, log);
    if (result.parts.length > 0) toCache(partsCache, cacheKey, result);
    return res.json(result);
  } catch (err) {
    return sendError(res, err, `parts for "${bike}"`);
  }
});

// ---------------------------------------------------------------------------
// RevZilla bike page + bike number (optional: the app works without it)
// ---------------------------------------------------------------------------
app.post('/api/motorcycle/revzilla', async (req, res) => {
  const { query, model, make, revzillaPartsUrl } = req.body || {};
  if (typeof model !== 'string' || !model.trim()) return res.json({ revzilla: null });

  // A bike page is year-specific: use the year the rider typed, else the one in the bike name
  const year = yearOf(typeof query === 'string' ? query : '', model);
  if (!year) return res.json({ revzilla: null });

  const makeName = typeof make === 'string' && make.trim() ? make.trim() : model.replace(/\b(19|20)\d{2}\b/, '').trim().split(/\s+/)[0];
  try {
    const revzilla = await findRevzillaBike({
      year,
      make: makeName,
      model,
      geminiUrl: typeof revzillaPartsUrl === 'string' ? revzillaPartsUrl : undefined,
      template: templateFor(makeName, model),
    });
    return res.json({ revzilla });
  } catch (err) {
    log(`RevZilla lookup failed for "${model}": ${(err as any)?.message || err}`);
    return res.json({ revzilla: null });
  }
});

// Vite middleware & static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MotoSpec Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
