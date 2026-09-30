import React, { useRef, useState } from 'react';
import { AlertCircle, RotateCw, Search, X } from 'lucide-react';
import { Header } from './components/Header';
import { SpecsPanel } from './components/SpecsPanel';
import { AftermarketPartsPanel } from './components/AftermarketPartsPanel';
import { SavedPartsModal } from './components/SavedPartsModal';
import { AftermarketPart, AftermarketPartsResponse, MotorcycleSpecs, RevzillaBike } from './types';

// These load instantly from the built-in data
const EXAMPLES = ['2016 Harley-Davidson Road King', '2024 Yamaha MT-07', '2021 BMW R 1250 GS', '2024 KTM 390 Duke'];

type SavedItem = { part: AftermarketPart; model: string; revzillaVehicleId?: string };

type LookupFailure = { message: string; status?: number; suggestion?: string };

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: ignore */
  }
}

class RequestError extends Error {
  constructor(
    message: string,
    public status?: number,
    public suggestion?: string
  ) {
    super(message);
  }
}

async function postJSON<T>(url: string, body: unknown, timeoutMs = 120_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new RequestError(data.error || `Something went wrong (error ${res.status}). Try again.`, res.status, data.suggestion);
    return data as T;
  } catch (err: any) {
    if (err instanceof RequestError) throw err;
    if (err?.name === 'AbortError') throw new RequestError('The lookup took too long. Try again.', 504);
    throw new RequestError("Couldn't reach MotoSpec's server. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

const toFailure = (err: any): LookupFailure => ({ message: err?.message || 'Something went wrong. Try again.', status: err?.status, suggestion: err?.suggestion });

const partId = (part: AftermarketPart) => part.id || `${part.brand}-${part.name}`;

export default function App() {
  const [modelInput, setModelInput] = useState('');
  const [activeModel, setActiveModel] = useState('');
  const [partQuery, setPartQuery] = useState('');
  const [mobileTab, setMobileTab] = useState<'specs' | 'parts'>('specs');

  const [specsData, setSpecsData] = useState<MotorcycleSpecs | null>(null);
  const [partsData, setPartsData] = useState<AftermarketPartsResponse | null>(null);
  const [isLoadingSpecs, setIsLoadingSpecs] = useState(false);
  const [isLoadingParts, setIsLoadingParts] = useState(false);
  const [specsError, setSpecsError] = useState<LookupFailure | null>(null);
  const [partsError, setPartsError] = useState<LookupFailure | null>(null);
  const [revzilla, setRevzilla] = useState<RevzillaBike | null>(null);

  const [savedParts, setSavedParts] = useState<SavedItem[]>(() => readStorage('motospec_saved_parts', []));
  const [searchHistory, setSearchHistory] = useState<string[]>(() => readStorage('motospec_search_history', []));
  const [isSavedOpen, setIsSavedOpen] = useState(false);

  // Ignore responses from an older search that arrive after a newer one
  const specsRequest = useRef(0);
  const partsRequest = useRef(0);
  const revzillaRequest = useRef(0);

  // Finds RevZilla's page and number for this bike, so store links open with it selected.
  // Optional: if it fails, links fall back to a plain part search.
  const fetchRevzilla = async (data: MotorcycleSpecs, query: string) => {
    const id = ++revzillaRequest.current;
    try {
      const result = await postJSON<{ revzilla: RevzillaBike | null }>(
        '/api/motorcycle/revzilla',
        { query, model: data.model, make: data.make, revzillaPartsUrl: data.revzillaPartsUrl },
        30_000
      );
      if (id === revzillaRequest.current) setRevzilla(result.revzilla || null);
    } catch {
      if (id === revzillaRequest.current) setRevzilla(null);
    }
  };

  const addToHistory = (name: string) => {
    setSearchHistory((prev) => {
      const updated = [name, ...prev.filter((m) => m.toLowerCase() !== name.toLowerCase())].slice(0, 6);
      writeStorage('motospec_search_history', updated);
      return updated;
    });
  };

  const fetchSpecs = async (model: string) => {
    const id = ++specsRequest.current;
    setIsLoadingSpecs(true);
    setSpecsError(null);
    try {
      const data = await postJSON<MotorcycleSpecs>('/api/motorcycle/specs', { model });
      if (id !== specsRequest.current) return;
      setSpecsData(data);
      // Save the corrected name ("Yamah MT 07" becomes "2024 Yamaha MT-07")
      addToHistory(data.model || model);
      fetchRevzilla(data, model);
    } catch (err: any) {
      if (id !== specsRequest.current) return;
      setSpecsError(toFailure(err));
    } finally {
      if (id === specsRequest.current) setIsLoadingSpecs(false);
    }
  };

  const fetchParts = async (model: string, query = '') => {
    const id = ++partsRequest.current;
    setIsLoadingParts(true);
    setPartsError(null);
    setPartQuery(query);
    try {
      const data = await postJSON<AftermarketPartsResponse>('/api/motorcycle/parts', { model, partQuery: query });
      if (id !== partsRequest.current) return;
      setPartsData(data);
    } catch (err: any) {
      if (id !== partsRequest.current) return;
      setPartsError(toFailure(err));
    } finally {
      if (id === partsRequest.current) setIsLoadingParts(false);
    }
  };

  const handleModelSearch = (raw: string) => {
    const model = raw.trim();
    if (!model) return;
    setActiveModel(model);
    setModelInput(model);
    setSpecsData(null);
    setPartsData(null);
    revzillaRequest.current++;
    setRevzilla(null);
    setMobileTab('specs');
    fetchSpecs(model);
    fetchParts(model, '');
  };

  const goHome = () => {
    specsRequest.current++;
    partsRequest.current++;
    revzillaRequest.current++;
    setRevzilla(null);
    setActiveModel('');
    setModelInput('');
    setSpecsData(null);
    setPartsData(null);
    setSpecsError(null);
    setPartsError(null);
    setIsLoadingSpecs(false);
    setIsLoadingParts(false);
  };

  const bikeName = specsData?.model || partsData?.motorcycleModel || activeModel;
  const store = { bikeContext: `${bikeName} ${specsData?.category || ''}`, revzillaVehicleId: revzilla?.vehicleId };

  const isPartSaved = (id: string) => savedParts.some((item) => partId(item.part) === id);
  const updateSaved = (updated: SavedItem[]) => {
    writeStorage('motospec_saved_parts', updated);
    return updated;
  };
  const handleToggleSavePart = (part: AftermarketPart) => {
    const id = partId(part);
    setSavedParts((prev) =>
      updateSaved(prev.some((i) => partId(i.part) === id) ? prev.filter((i) => partId(i.part) !== id) : [...prev, { part, model: bikeName, revzillaVehicleId: revzilla?.vehicleId }])
    );
  };
  const handleRemoveSaved = (id: string) => setSavedParts((prev) => updateSaved(prev.filter((i) => partId(i.part) !== id)));
  const handleClearSaved = () => setSavedParts(updateSaved([]));

  const removeHistory = (name: string) =>
    setSearchHistory((prev) => {
      const updated = prev.filter((m) => m !== name);
      writeStorage('motospec_search_history', updated);
      return updated;
    });

  const isHome = !activeModel;
  const partsCount = specsError?.status === 404 ? 0 : partsData?.parts?.length || 0;

  const searchForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!modelInput.trim()) {
          document.getElementById('bike-search')?.focus();
          return;
        }
        handleModelSearch(modelInput);
      }}
      className={`flex gap-2 ${isHome ? 'flex-col sm:flex-row' : ''}`}
      role="search"
    >
      <label htmlFor="bike-search" className="sr-only">
        Motorcycle make, model and year
      </label>
      <input
        id="bike-search"
        type="search"
        value={modelInput}
        onChange={(e) => setModelInput(e.target.value)}
        placeholder="Make, model and year"
        autoComplete="off"
        className={`min-w-0 flex-1 rounded-md border border-line bg-white px-4 placeholder:text-muted/80 focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-signal ${
          isHome ? 'py-4 text-lg' : 'py-2.5 text-base'
        }`}
      />
      <button
        type="submit"
        disabled={isLoadingSpecs}
        className={`inline-flex items-center justify-center gap-2 rounded-md bg-ink font-semibold text-white hover:bg-black disabled:opacity-50 ${
          isHome ? 'px-6 py-3.5 text-lg sm:py-0' : 'px-4 text-sm'
        }`}
      >
        {isLoadingSpecs ? <RotateCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
        Look up
      </button>
    </form>
  );

  const recentChips = searchHistory.length > 0 && (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Recent:</span>
      {searchHistory.map((name) => (
        <span key={name} className="inline-flex items-center rounded-full border border-line bg-white">
          <button type="button" onClick={() => handleModelSearch(name)} className="py-1 pl-3 pr-1 font-medium hover:underline">
            {name}
          </button>
          <button
            type="button"
            onClick={() => removeHistory(name)}
            className="rounded-full p-1.5 text-muted hover:text-ink"
            aria-label={`Remove ${name} from recent searches`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
    </div>
  );

  const ErrorBanner = ({ failure, onRetry }: { failure: LookupFailure; onRetry: () => void }) => (
    <div role="alert" className="rounded-lg border border-danger/30 bg-white p-4">
      <div className="flex items-start gap-2 text-[15px]">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
        <span>{failure.message}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 pl-7">
        {failure.suggestion ? (
          <button
            type="button"
            onClick={() => handleModelSearch(failure.suggestion!)}
            className="rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-white"
          >
            Look up {failure.suggestion}
          </button>
        ) : failure.status === 404 ? (
          <button
            type="button"
            onClick={() => document.getElementById('bike-search')?.focus()}
            className="rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-white"
          >
            Change search
          </button>
        ) : (
          <button type="button" onClick={onRetry} className="rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-white">
            Try again
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Header savedCount={savedParts.length} onOpenSaved={() => setIsSavedOpen(true)} onGoHome={goHome} />

      {isHome ? (
        /* Home: the search is the whole point, so it gets the stage */
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-14 sm:px-8 sm:pt-24">
          <h1 className="font-display text-5xl font-bold leading-[0.95] tracking-tight sm:text-7xl">Look up any motorcycle</h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            See its specs, the problems owners report, and aftermarket parts that fit, with links straight to the stores.
          </p>
          <div className="mt-8">{searchForm}</div>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => handleModelSearch(ex)}
                className="rounded-full border border-line bg-white px-3 py-1 font-medium hover:border-ink/40"
              >
                {ex}
              </button>
            ))}
          </div>
          {recentChips && <div className="mt-3">{recentChips}</div>}
        </main>
      ) : (
        <>
          <div className="border-b border-line bg-white">
            <div className="mx-auto max-w-7xl space-y-3 px-4 py-4 sm:px-8">
              <div className="max-w-2xl">{searchForm}</div>
              {recentChips}
            </div>
          </div>

          {/* Mobile: switch between specs and parts */}
          <div className="sticky top-0 z-30 border-b border-line bg-white/95 px-4 py-2 backdrop-blur lg:hidden">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-road p-1" role="tablist" aria-label="Bike details">
              {(['specs', 'parts'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === tab}
                  onClick={() => {
                    setMobileTab(tab);
                    window.scrollTo({ top: 0 });
                  }}
                  className={`rounded-md py-2 text-sm font-semibold ${mobileTab === tab ? 'bg-white shadow-sm' : 'text-muted'}`}
                >
                  {tab === 'specs' ? 'Specs and issues' : `Parts${partsCount ? ` (${partsCount})` : ''}`}
                </button>
              ))}
            </div>
          </div>

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8 sm:py-10">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
              <div className={mobileTab === 'specs' ? 'block' : 'hidden lg:block'}>
                {specsError ? (
                  <ErrorBanner failure={specsError} onRetry={() => fetchSpecs(activeModel)} />
                ) : (
                  <SpecsPanel
                    specsData={specsData}
                    isLoading={isLoadingSpecs}
                    requestedModel={activeModel}
                    onRefresh={() => fetchSpecs(activeModel)}
                  />
                )}
              </div>

              <div className={mobileTab === 'parts' ? 'block' : 'hidden lg:block'}>
                {specsError?.status === 404 ? (
                  <div className="rounded-lg border border-dashed border-line bg-white p-5 text-[15px] text-muted">
                    Aftermarket parts appear here once the bike is found.
                  </div>
                ) : partsError && !isLoadingParts ? (
                  <ErrorBanner failure={partsError} onRetry={() => fetchParts(activeModel, partQuery)} />
                ) : (
                  <AftermarketPartsPanel
                    bikeName={bikeName}
                    store={store}
                    revzilla={revzilla}
                    partsData={partsData}
                    isLoading={isLoadingParts}
                    activeQuery={partQuery}
                    onSearch={(q) => fetchParts(activeModel, q)}
                    onToggleSavePart={handleToggleSavePart}
                    isPartSaved={isPartSaved}
                  />
                )}
              </div>
            </div>
          </main>
        </>
      )}

      <footer className="border-t border-line bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-muted sm:px-8">
          MotoSpec suggestions are AI-assisted and can be wrong. Confirm fitment with the store and safety-critical specs
          with your owner's manual.
        </div>
      </footer>

      <SavedPartsModal
        isOpen={isSavedOpen}
        onClose={() => setIsSavedOpen(false)}
        savedParts={savedParts}
        onRemovePart={handleRemoveSaved}
        onClearAll={handleClearSaved}
      />
    </div>
  );
}
