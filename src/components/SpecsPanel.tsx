import React, { useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, RotateCw } from 'lucide-react';
import { KnownIssue, MotorcycleSpecs } from '../types';

interface SpecsPanelProps {
  specsData: MotorcycleSpecs | null;
  isLoading: boolean;
  requestedModel: string;
  onRefresh: () => void;
}

const SEVERITY_ORDER: Record<string, number> = { High: 0, Moderate: 1, Common: 2, Watchpoint: 3, Low: 4, Minor: 5 };

const severityStyle = (severity?: string) => {
  switch (severity) {
    case 'High':
      return { bar: 'bg-danger', badge: 'bg-danger text-white' };
    case 'Moderate':
      return { bar: 'bg-caution', badge: 'bg-caution text-white' };
    default:
      return { bar: 'bg-muted/50', badge: 'bg-road text-ink border border-line' };
  }
};

const SectionTitle: React.FC<{ children: React.ReactNode; count?: number }> = ({ children, count }) => (
  <h3 className="mb-3 flex items-baseline gap-2 font-display text-xl font-bold tracking-tight">
    {children}
    {count !== undefined && <span className="tabular text-base font-semibold text-muted">{count}</span>}
  </h3>
);

export const SpecsPanel: React.FC<SpecsPanelProps> = ({ specsData, isLoading, requestedModel, onRefresh }) => {
  const [copied, setCopied] = useState(false);
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);

  if (isLoading) {
    return (
      <div aria-live="polite" className="rounded-lg border border-line bg-white p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-muted">
          <RotateCw className="h-4 w-4 animate-spin" aria-hidden="true" />
          Looking up {requestedModel}…
        </div>
        <p className="mt-1 text-sm text-muted">Bikes outside the built-in list are searched online and can take up to a minute.</p>
        <div className="mt-5 space-y-3" aria-hidden="true">
          <div className="h-8 w-2/3 animate-pulse rounded bg-road" />
          <div className="h-4 w-full animate-pulse rounded bg-road" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-road" />
          <div className="h-4 w-4/6 animate-pulse rounded bg-road" />
        </div>
      </div>
    );
  }

  if (!specsData) return null;

  const { model, category, year, overview, specs, highlights, maintenanceNotes, knownIssues, sources } = specsData;

  const issues: KnownIssue[] = (knownIssues || [])
    .map((issue) => (typeof issue === 'string' ? { title: issue, severity: 'Watchpoint' as const, description: '' } : issue))
    .sort((a, b) => (SEVERITY_ORDER[a.severity || 'Watchpoint'] ?? 9) - (SEVERITY_ORDER[b.severity || 'Watchpoint'] ?? 9));
  const visibleIssues = showAllIssues ? issues : issues.slice(0, 3);

  const safeSpecs = specs || (specsData as any)?.specifications || {};

  const specRows = [
    ['Engine', safeSpecs.engine],
    ['Displacement', safeSpecs.displacement],
    ['Power', safeSpecs.power],
    ['Torque', safeSpecs.torque],
    ['Weight', safeSpecs.curbWeight],
    ['Seat height', safeSpecs.seatHeight],
    ['Fuel tank', safeSpecs.fuelCapacity],
    ['Transmission', safeSpecs.transmission],
    ['Brakes', safeSpecs.brakes],
    ['Front suspension', safeSpecs.suspensionFront],
    ['Rear suspension', safeSpecs.suspensionRear],
    ['Top speed', safeSpecs.topSpeed],
    ['Fuel economy', safeSpecs.fuelEconomy],
  ].filter(([, value]) => !!value) as [string, string][];

  const handleCopy = () => {
    const text = [model, ...specRows.map(([label, value]) => `${label}: ${value}`)].join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const overviewParas = (overview || '').split(/\n{2,}/).filter(Boolean);

  // Safety net: never show an empty spec sheet
  if (specRows.length === 0 && overviewParas.length === 0 && issues.length === 0) {
    return (
      <div role="alert" className="rounded-lg border border-line bg-white p-6">
        <h2 className="font-display text-2xl font-bold tracking-tight">{model || requestedModel}</h2>
        <p className="mt-2 text-[15px]">No reliable details came back for this bike. Check the spelling, or add the make and year, then look it up again.</p>
        <button type="button" onClick={onRefresh} className="mt-4 rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-white">
          Look up again
        </button>
      </div>
    );
  }
  const overviewIsLong = (overview || '').length > 420;

  return (
    <article className="space-y-10">
      {/* Title */}
      <header>
        <h2 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">{model}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {category && <span className="rounded bg-ink px-2 py-0.5 font-semibold text-white">{category}</span>}
          {year && <span className="rounded border border-line bg-white px-2 py-0.5 font-medium text-muted">{/[-–]/.test(year) ? 'Model years' : 'Model year'} {year}</span>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium hover:border-ink/40"
          >
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy specs'}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium hover:border-ink/40"
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Look up again
          </button>
        </div>
      </header>

      {/* Overview */}
      {overviewParas.length > 0 && (
        <section>
          <div className={`max-w-prose space-y-3 text-[17px] leading-relaxed ${overviewIsLong && !overviewOpen ? 'line-clamp-4' : ''}`}>
            {overviewParas.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {overviewIsLong && (
            <button
              type="button"
              onClick={() => setOverviewOpen((v) => !v)}
              className="mt-2 text-sm font-semibold underline underline-offset-4"
            >
              {overviewOpen ? 'Show less' : 'Read more'}
            </button>
          )}
        </section>
      )}

      {/* Known issues: the most useful thing for owners and used-bike buyers */}
      {issues.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-signal" aria-hidden="true">
              <AlertTriangle className="h-4 w-4 text-ink" />
            </span>
            <h3 className="font-display text-xl font-bold tracking-tight">
              Known issues <span className="tabular text-base font-semibold text-muted">{issues.length}</span>
            </h3>
          </div>
          <p className="mb-4 max-w-prose text-sm text-muted">
            Problems owners and mechanics report for this generation. Worth checking before you buy or at your next service.
          </p>
          <ul className="space-y-3">
            {visibleIssues.map((issue, idx) => {
              const style = severityStyle(issue.severity);
              return (
                <li key={idx} className="relative overflow-hidden rounded-lg border border-line bg-white py-4 pl-5 pr-4">
                  <span className={`absolute inset-y-0 left-0 w-1.5 ${style.bar}`} aria-hidden="true" />
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h4 className="text-base font-semibold leading-snug">{issue.title}</h4>
                    {issue.severity && (
                      <span className={`rounded px-2 py-0.5 text-xs font-bold ${style.badge}`}>{issue.severity}</span>
                    )}
                  </div>
                  {(issue.affectedYears || issue.category) && (
                    <p className="mt-1 text-sm text-muted">
                      {[issue.category, issue.affectedYears].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {issue.description && <p className="mt-2 text-[15px] leading-relaxed">{issue.description}</p>}
                  {issue.solution && (
                    <p className="mt-2 text-[15px] leading-relaxed">
                      <span className="font-semibold">Fix: </span>
                      {issue.solution}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {issues.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllIssues((v) => !v)}
              className="mt-3 text-sm font-semibold underline underline-offset-4"
            >
              {showAllIssues ? 'Show fewer' : `Show all ${issues.length} issues`}
            </button>
          )}
        </section>
      )}

      {/* Spec sheet */}
      {specRows.length > 0 && (
        <section>
          <SectionTitle>Specifications</SectionTitle>
          <dl className="overflow-hidden rounded-lg border border-line bg-white">
            {specRows.map(([label, value], i) => (
              <div
                key={label}
                className={`grid grid-cols-1 gap-0.5 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4 ${i > 0 ? 'border-t border-line' : ''}`}
              >
                <dt className="text-sm font-medium text-muted">{label}</dt>
                <dd className="tabular text-[15px] font-semibold leading-snug">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Service intervals */}
      {maintenanceNotes && maintenanceNotes.length > 0 && (
        <section>
          <SectionTitle>Service intervals</SectionTitle>
          <ul className="space-y-2 text-[15px] leading-relaxed">
            {maintenanceNotes.map((note, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-hidden="true" />
                <span className="tabular">{note}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Highlights */}
      {highlights && highlights.length > 0 && (
        <section>
          <SectionTitle>Highlights</SectionTitle>
          <ul className="space-y-2 text-[15px] leading-relaxed">
            {highlights.map((h, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-hidden="true" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Manuals & sources */}
      {sources && sources.length > 0 && (
        <section>
          <SectionTitle>Manuals and sources</SectionTitle>
          <ul className="space-y-2">
            {sources.map((source, i) => (
              <li key={i}>
                <a
                  href={source.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-start gap-1.5 text-[15px] font-medium underline decoration-line underline-offset-4 hover:decoration-ink"
                >
                  <span>{source.title}</span>
                  <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                </a>
                {source.type && <span className="ml-2 text-sm text-muted">{source.type}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="max-w-prose border-t border-line pt-4 text-sm text-muted">
        Specs and issues are gathered with AI from web sources and can contain mistakes. Check anything safety-critical,
        like torque values or tyre pressures, in your owner's manual.
      </p>
    </article>
  );
};
