import { AftermarketPart } from '../types';

export interface SavedPartItem {
  part: AftermarketPart;
  model: string;
}

/**
 * Calculates estimated low and high sum totals from price strings like "$180.00 USD" or "$890 - $1,150"
 */
export function calculateTotalBudget(savedParts: SavedPartItem[]): { min: number; max: number; formatted: string } {
  let minTotal = 0;
  let maxTotal = 0;
  let hasValidPrice = false;

  savedParts.forEach(({ part }) => {
    if (!part.estimatedPrice) return;
    
    // Find all numbers in the string
    const cleaned = part.estimatedPrice.replace(/,/g, '');
    const matches = cleaned.match(/\$?(\d+(?:\.\d{1,2})?)/g);
    
    if (matches && matches.length > 0) {
      hasValidPrice = true;
      const nums = matches.map(m => parseFloat(m.replace('$', ''))).filter(n => !isNaN(n));
      if (nums.length === 1) {
        minTotal += nums[0];
        maxTotal += nums[0];
      } else if (nums.length >= 2) {
        minTotal += Math.min(...nums);
        maxTotal += Math.max(...nums);
      }
    }
  });

  if (!hasValidPrice) {
    return { min: 0, max: 0, formatted: 'Custom / Quote-based' };
  }

  const formatCurrency = (val: number) =>
    `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;

  if (minTotal === maxTotal) {
    return { min: minTotal, max: maxTotal, formatted: formatCurrency(minTotal) };
  }

  return {
    min: minTotal,
    max: maxTotal,
    formatted: `${formatCurrency(minTotal)} – ${formatCurrency(maxTotal)}`,
  };
}

