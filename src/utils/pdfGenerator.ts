import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AftermarketPart } from '../types';
import { calculateTotalBudget } from './budget';
export { calculateTotalBudget };

export interface SavedPartItem {
  part: AftermarketPart;
  model: string;
}

/**
 * Generates and downloads a clean, professional PDF build sheet of all saved aftermarket parts.
 */
export function generateSavedPartsPDF(savedParts: SavedPartItem[]): void {
  if (!savedParts || savedParts.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36; // 0.5 inch margins

  // Color Palette
  const darkNavy = [15, 23, 42]; // #0f172a (Slate 900)
  const slate600 = [71, 85, 105];
  const slate400 = [148, 163, 184];
  const lightBg = [248, 250, 252];
  const borderGray = [226, 232, 240];

  // Distinct models list
  const distinctModels = Array.from(new Set(savedParts.map(item => item.model).filter(Boolean)));
  const modelsLabel = distinctModels.length > 0 ? distinctModels.join(', ') : 'Various Motorcycles';
  const budget = calculateTotalBudget(savedParts);

  // 1. Header Banner
  doc.setFillColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  doc.rect(0, 0, pageWidth, 68, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('MOTOSPEC', margin, 32);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225); // Slate 300
  doc.text('AFTERMARKET UPGRADE BUILD SHEET & COMPONENT SPECIFICATION', margin, 48);

  const exportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  doc.setFontSize(8);
  doc.text(`Generated: ${exportDate}`, pageWidth - margin, 32, { align: 'right' });
  doc.text(`Total Saved Items: ${savedParts.length}`, pageWidth - margin, 48, { align: 'right' });

  // 2. Summary Overview Box
  const summaryBoxY = 82;
  const summaryBoxHeight = 58;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  doc.setLineWidth(1);
  doc.roundedRect(margin, summaryBoxY, pageWidth - margin * 2, summaryBoxHeight, 4, 4, 'FD');

  // Summary Left: Target Vehicles
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(slate400[0], slate400[1], slate400[2]);
  doc.text('TARGET MOTORCYCLE MODEL(S)', margin + 14, summaryBoxY + 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  const truncatedModels = modelsLabel.length > 55 ? `${modelsLabel.substring(0, 52)}...` : modelsLabel;
  doc.text(truncatedModels, margin + 14, summaryBoxY + 36);

  // Summary Right: Estimated Total Budget
  const budgetColX = pageWidth - margin - 180;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(slate400[0], slate400[1], slate400[2]);
  doc.text('ESTIMATED PARTS BUDGET', budgetColX, summaryBoxY + 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  doc.text(budget.formatted, budgetColX, summaryBoxY + 36);

  // 3. Prepare Table Data
  const tableRows = savedParts.map((item, index) => {
    const { part, model } = item;
    const benefitsText = part.keyBenefits && part.keyBenefits.length > 0
      ? `• ${part.keyBenefits.join('\n• ')}`
      : part.description || 'Standard high-performance upgrade';

    const retailersText = part.retailersOrMfr ? `\n\nRetailers: ${part.retailersOrMfr}` : '';

    return [
      (index + 1).toString(),
      `${part.brand.toUpperCase()}\n${part.name}`,
      `${part.category}\n(For: ${model || 'General Fitment'})`,
      part.fitmentNotes || 'Direct bolt-on replacement',
      `${part.estimatedPrice || 'Price on request'}\n\n[${part.installationDifficulty || 'DIY/Moderate'}]`,
      `${benefitsText}${retailersText}`,
    ];
  });

  // 4. Generate AutoTable
  autoTable(doc, {
    startY: summaryBoxY + summaryBoxHeight + 16,
    head: [['#', 'Brand & Component', 'Category & Bike', 'Fitment Notes', 'Est. Price / Install', 'Key Benefits & Availability']],
    body: tableRows,
    margin: { left: margin, right: margin, bottom: 45 },
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
      halign: 'left',
      cellPadding: 7,
    },
    bodyStyles: {
      textColor: [30, 41, 59],
      fontSize: 8,
      cellPadding: 6,
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
      valign: 'top',
    },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 105, fontStyle: 'bold' },
      2: { cellWidth: 95 },
      3: { cellWidth: 105 },
      4: { cellWidth: 80, fontStyle: 'bold' },
      5: { cellWidth: 'auto' }, // remaining width
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didDrawPage: (data) => {
      // Footer on every page
      const currentYear = new Date().getFullYear();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(slate400[0], slate400[1], slate400[2]);
      
      // Left footer
      doc.text(
        `MotoSpec Build Sheet • Advisory fitment only — verify OEM part numbers with certified mechanics.`,
        margin,
        pageHeight - 20
      );

      // Right footer
      const pageCount = doc.internal.pages.length - 1;
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        pageWidth - margin,
        pageHeight - 20,
        { align: 'right' }
      );
    },
  });

  // 5. File name generation
  const cleanModelSlug = distinctModels[0]
    ? distinctModels[0].replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase()
    : 'motorcycle';
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `MotoSpec-Saved-Parts-${cleanModelSlug}-${dateStr}.pdf`;

  // Trigger browser download
  doc.save(filename);
}
