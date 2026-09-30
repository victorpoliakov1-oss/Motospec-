import React, { useEffect, useState } from 'react';
import { FileDown, Trash2, X } from 'lucide-react';
import { AftermarketPart } from '../types';
import { RetailerLinks } from './RetailerLinks';
import { formatPrice } from './AftermarketPartsPanel';
import { calculateTotalBudget } from '../utils/budget';

interface SavedPartsModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedParts: { part: AftermarketPart; model: string; revzillaVehicleId?: string }[];
  onRemovePart: (partId: string) => void;
  onClearAll: () => void;
}

export const SavedPartsModal: React.FC<SavedPartsModalProps> = ({ isOpen, onClose, savedParts, onRemovePart, onClearAll }) => {
  const [pdfDone, setPdfDone] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) setConfirmClear(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const budget = calculateTotalBudget(savedParts);

  const handlePdf = async () => {
    try {
      // Loaded on demand: the PDF library is large and most visits never need it
      const { generateSavedPartsPDF } = await import('../utils/pdfGenerator');
      generateSavedPartsPDF(savedParts);
      setPdfDone(true);
      setTimeout(() => setPdfDone(false), 3000);
    } catch (err) {
      console.error('Failed to create PDF build sheet:', err);
    }
  };

  // Group by bike so a list covering two bikes stays readable
  const byBike: Record<string, AftermarketPart[]> = {};
  const bikeNumbers: Record<string, string | undefined> = {};
  savedParts.forEach(({ part, model, revzillaVehicleId }) => {
    const bike = model || 'Other';
    (byBike[bike] ||= []).push(part);
    if (revzillaVehicleId) bikeNumbers[bike] = revzillaVehicleId;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl sm:rounded-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id="saved-title" className="font-display text-2xl font-bold tracking-tight">
            Saved parts <span className="tabular text-lg text-muted">{savedParts.length}</span>
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-2 hover:bg-road" aria-label="Close saved parts">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {savedParts.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-semibold">No saved parts yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                Tap the bookmark on any part to keep it here. You can then export your list as a PDF build sheet.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(byBike).map(([bike, parts]) => (
                <div key={bike}>
                  <h3 className="mb-2 text-sm font-semibold text-muted">For {bike}</h3>
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {parts.map((part) => (
                      <li key={part.id} className="flex items-start justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-muted">{part.brand}</div>
                          <div className="font-semibold leading-snug">{part.name}</div>
                          {part.estimatedPrice && (
                            <div className="tabular mt-1 text-sm">
                              <span className="text-muted">est. </span>
                              {formatPrice(part.estimatedPrice)}
                            </div>
                          )}
                          <div className="mt-2">
                            <RetailerLinks part={part} store={{ bikeContext: bike, revzillaVehicleId: bikeNumbers[bike] }} compact />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemovePart(part.id || `${part.brand}-${part.name}`)}
                          className="shrink-0 rounded-md p-2 text-muted hover:bg-road hover:text-danger"
                          aria-label={`Remove ${part.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {savedParts.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-road px-5 py-4">
            <div className="text-sm">
              <div className="text-muted">Estimated total</div>
              <div className="tabular font-semibold">{budget.formatted}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {confirmClear ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onClearAll();
                      setConfirmClear(false);
                    }}
                    className="rounded-md bg-danger px-3 py-2 text-sm font-semibold text-white"
                  >
                    Yes, remove all
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold"
                  >
                    Keep them
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold hover:border-ink/40"
                >
                  Remove all
                </button>
              )}
              <button
                type="button"
                onClick={handlePdf}
                className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-black"
              >
                <FileDown className="h-4 w-4" aria-hidden="true" />
                {pdfDone ? 'PDF downloaded' : 'Download PDF'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
