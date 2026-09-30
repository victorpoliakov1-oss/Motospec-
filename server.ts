import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { findMatchingPresetSpecs, findMatchingPresetParts } from './src/data/fallbackDatabase';
import { sanitizeTechnicalSources } from './src/utils/technicalManuals';
import { lookupSpecs, lookupParts, LookupError, friendlyError, type GenerateFn, type Source } from './server/lookup';
import { findRevzillaBike, templateFor, yearOf } from './server/revzilla';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Only successful lookups are cached, so a temporary outage never "sticks" to a bike.
const specsCache = new Map<string, any>();
const partsCache = new Map<string, any>();

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

// Tried in order. If one is busy, unavailable or retired, the next is used.
const CANDIDATE_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

let client: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is missing.');
  if (!client) {
    client = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
  }
  return client;
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One Gemini request with model fallback, a retry on "busy", and a hard time limit. */
const generate: GenerateFn = async (prompt, { search, jsonSchema }) => {
  const ai = getGeminiClient();
  const deadline = Date.now() + (search ? 70_000 : 40_000);
  let lastErr: unknown = null;

  for (const model of CANDIDATE_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 3_000) throw lastErr || new Error('Lookup timed out');

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
        const text = response.text || '';
        if (text.trim()) return { text, sources: groundingSources(response) };
        lastErr = new Error(`Empty answer from ${model}`);
        break; // try the next model
      } catch (err: any) {
        lastErr = err;
        const msg = String(err?.message || err);
        if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) throw err;
        if (/503|429|high demand|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded/i.test(msg) && attempt === 0) {
          await sleep(800);
          continue; // one retry on the same model
        }
        break; // unknown model, bad request, timeout: next model
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw lastErr || new Error('All Gemini models unavailable');
};

const log = (msg: string) => console.warn(`[MotoSpec] ${msg}`);

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
  if (specsCache.has(cacheKey)) return res.json(specsCache.get(cacheKey));

  const preset = findMatchingPresetSpecs(query);
  if (preset) {
    const result = { ...preset, sources: sanitizeTechnicalSources(preset.sources, preset.model || query) };
    specsCache.set(cacheKey, result);
    return res.json(result);
  }

  try {
    const found = await lookupSpecs(query, generate, log);
    const result = { ...found, sources: sanitizeTechnicalSources(found.sources, found.model) };
    specsCache.set(cacheKey, result);
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
  if (partsCache.has(cacheKey)) return res.json(partsCache.get(cacheKey));

  if (!query) {
    const preset = findMatchingPresetParts(bike);
    if (preset) {
      const result = { ...preset, partQuery: '', sources: [] };
      partsCache.set(cacheKey, result);
      return res.json(result);
    }
  }

  try {
    const result = await lookupParts(bike, query, generate, log);
    if (result.parts.length > 0) partsCache.set(cacheKey, result);
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
