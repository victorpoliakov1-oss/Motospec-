export interface KnownIssue {
  title: string;
  category?: string;
  severity?: 'High' | 'Moderate' | 'Low' | 'Watchpoint' | 'Common' | 'Minor';
  description: string;
  affectedYears?: string;
  solution?: string;
}

export interface MotorcycleSpecs {
  model: string;
  year?: string;
  make?: string;
  category?: string;
  overview: string;
  specs?: {
    engine?: string;
    displacement?: string;
    power?: string;
    torque?: string;
    transmission?: string;
    curbWeight?: string;
    seatHeight?: string;
    fuelCapacity?: string;
    brakes?: string;
    suspensionFront?: string;
    suspensionRear?: string;
    topSpeed?: string;
    fuelEconomy?: string;
    [key: string]: string | undefined;
  };
  highlights?: string[];
  maintenanceNotes?: string[];
  knownIssues?: (KnownIssue | string)[];
  sources?: { title: string; uri: string; type?: string }[];
  /** RevZilla bike page suggested by the online lookup (checked by the server before use) */
  revzillaPartsUrl?: string;
  /** false when web search wasn't available and the answer came from the AI's own knowledge */
  grounded?: boolean;
}

/** RevZilla's own page and number for the rider's bike */
export interface RevzillaBike {
  url: string;
  name: string;
  vehicleId?: string;
}

export interface AftermarketPart {
  id: string;
  name: string;
  brand: string;
  category: string;
  fitmentNotes: string;
  estimatedPrice: string;
  description: string;
  keyBenefits: string[];
  installationDifficulty?: 'Easy (DIY)' | 'Moderate' | 'Advanced (Shop recommended)';
  retailersOrMfr?: string;
  /** Short store-search phrase, e.g. "Vance Hines Power Duals" */
  searchQuery?: string;
}

export interface AftermarketPartsResponse {
  motorcycleModel: string;
  partQuery?: string;
  parts: AftermarketPart[];
  sources?: { title: string; uri: string }[];
  grounded?: boolean;
}
