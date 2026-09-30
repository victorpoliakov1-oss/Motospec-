import React from 'react';
import { Bookmark } from 'lucide-react';

interface HeaderProps {
  savedCount: number;
  onOpenSaved: () => void;
  onGoHome: () => void;
}

// Speedometer mark: a simple arc and needle, drawn to sit on the ink tile.
const Logo = () => (
  <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden="true">
    <rect width="32" height="32" rx="7" fill="var(--color-ink)" />
    <path d="M7 21a9 9 0 1 1 18 0" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M16 21l5.5-6.5" stroke="var(--color-signal)" strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="16" cy="21" r="2" fill="var(--color-signal)" />
  </svg>
);

export const Header: React.FC<HeaderProps> = ({ savedCount, onOpenSaved, onGoHome }) => (
  <header className="border-b border-line bg-white">
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
      <button type="button" onClick={onGoHome} className="flex items-center gap-3 text-left" aria-label="MotoSpec home">
        <Logo />
        <div>
          <div className="font-display text-2xl font-bold leading-none tracking-tight">MotoSpec</div>
          <div className="mt-0.5 hidden text-sm text-muted sm:block">Specs, known issues and parts for your bike</div>
        </div>
      </button>

      <button
        type="button"
        onClick={onOpenSaved}
        className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold hover:border-ink/40"
      >
        <Bookmark className="h-4 w-4" aria-hidden="true" />
        Saved parts
        {savedCount > 0 && (
          <span className="tabular rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-white">{savedCount}</span>
        )}
      </button>
    </div>
  </header>
);
