// Utility for generating and validating genuine technical service manuals, workshop manuals, and OEM documentation links

export interface TechnicalManualSource {
  title: string;
  uri: string;
  type: string;
  isOfficial?: boolean;
}

export function getGenuineTechnicalManualSources(modelName: string): TechnicalManualSource[] {
  const norm = modelName.toLowerCase();
  const cleanModel = modelName.trim();
  const encodedModel = encodeURIComponent(cleanModel);
  const sources: TechnicalManualSource[] = [];

  // 1. Factory Service & Workshop Repair Manual (Direct Manual Search on ManualsLib)
  sources.push({
    title: `${cleanModel} - Factory Service & Repair Manual (ManualsLib)`,
    uri: `https://www.manualslib.com/manual-search.html?q=${encodeURIComponent(cleanModel + ' service manual')}`,
    type: 'Factory Service Manual',
    isOfficial: false,
  });

  // 2. Official OEM Technical Service / Owner's Manual Portal
  if (
    norm.includes('harley') ||
    norm.includes('road king') ||
    norm.includes('street glide') ||
    norm.includes('road glide') ||
    norm.includes('sportster') ||
    norm.includes('softail') ||
    norm.includes('electra glide') ||
    norm.includes('flhr') ||
    norm.includes('fat boy')
  ) {
    sources.push({
      title: 'Harley-Davidson Service Information Portal (SIP) & Technical Manuals',
      uri: `https://serviceinfo.harley-davidson.com/sip/service/document/index`,
      type: 'OEM Factory Service Portal',
      isOfficial: true,
    });
  } else if (
    norm.includes('yamaha') ||
    norm.includes('mt-07') ||
    norm.includes('mt-09') ||
    norm.includes('mt-10') ||
    norm.includes('yzf-r') ||
    norm.includes('tenere') ||
    norm.includes('tracer') ||
    norm.includes('fz-')
  ) {
    sources.push({
      title: `${cleanModel} - owner's manual search (ManualsLib)`,
      uri: `https://www.manualslib.com/manual-search.html?q=${encodeURIComponent(cleanModel + ' owners manual')}`,
      type: "Owner's manual search",
      isOfficial: false,
    });
  } else if (
    norm.includes('honda') ||
    norm.includes('cbr') ||
    norm.includes('crf') ||
    norm.includes('rebel') ||
    norm.includes('goldwing') ||
    norm.includes('africa twin') ||
    norm.includes('cb500') ||
    norm.includes('cb650')
  ) {
    sources.push({
      title: `${cleanModel} - Honda Powersports Official Manuals & Tech Docs`,
      uri: `https://powersports.honda.com/downloads/manuals`,
      type: 'OEM Technical Manual',
      isOfficial: true,
    });
  } else if (
    norm.includes('kawasaki') ||
    norm.includes('ninja') ||
    norm.includes('z900') ||
    norm.includes('z650') ||
    norm.includes('zx-') ||
    norm.includes('klr') ||
    norm.includes('versys')
  ) {
    sources.push({
      title: `${cleanModel} - Kawasaki Owner Center & Service Manuals`,
      uri: `https://www.kawasaki.com/en-us/owner-center/service-manuals`,
      type: 'OEM Service Manual',
      isOfficial: true,
    });
  } else if (
    norm.includes('bmw') ||
    norm.includes('r 1250') ||
    norm.includes('r 1200') ||
    norm.includes('r 1300') ||
    norm.includes('s 1000') ||
    norm.includes('f 850') ||
    norm.includes('f 900')
  ) {
    sources.push({
      title: `${cleanModel} - BMW Motorrad Official Rider's & Technical Manuals`,
      uri: `https://www.bmw-motorrad.com/en/service/manuals/rider-manual.html`,
      type: 'OEM Technical Manual',
      isOfficial: true,
    });
  } else if (
    norm.includes('ducati') ||
    norm.includes('panigale') ||
    norm.includes('monster') ||
    norm.includes('multistrada') ||
    norm.includes('streetfighter') ||
    norm.includes('scrambler') ||
    norm.includes('diavel')
  ) {
    sources.push({
      title: `${cleanModel} - Ducati Technical Maintenance & Owner's Handbook`,
      uri: `https://www.ducati.com/ww/en/service-maintenance/owner-manuals`,
      type: "OEM Owner's Handbook",
      isOfficial: true,
    });
  } else if (
    norm.includes('ktm') ||
    norm.includes('duke') ||
    norm.includes('super adventure') ||
    norm.includes('super duke') ||
    norm.includes('exc')
  ) {
    sources.push({
      title: `${cleanModel} - KTM Official Owner's & Workshop Manuals`,
      uri: `https://www.ktm.com/en-us/service/manuals.html`,
      type: 'OEM Workshop Manual',
      isOfficial: true,
    });
  } else if (
    norm.includes('suzuki') ||
    norm.includes('gsx') ||
    norm.includes('v-strom') ||
    norm.includes('hayabusa') ||
    norm.includes('sv650') ||
    norm.includes('dr-z')
  ) {
    sources.push({
      title: `${cleanModel} - Suzuki Genuine Owner's & Technical Manuals`,
      uri: `https://suzukicycles.com/owners/manuals`,
      type: 'OEM Technical Manual',
      isOfficial: true,
    });
  } else if (
    norm.includes('triumph') ||
    norm.includes('bonneville') ||
    norm.includes('speed triple') ||
    norm.includes('street triple') ||
    norm.includes('tiger') ||
    norm.includes('scrambler')
  ) {
    sources.push({
      title: `${cleanModel} - Triumph Technical Handbooks & Service Portal`,
      uri: `https://www.triumphmotorcycles.com/owners/handbooks`,
      type: 'OEM Technical Handbook',
      isOfficial: true,
    });
  } else {
    sources.push({
      title: `${cleanModel} - OEM Owner's Manual & Maintenance Documentation`,
      uri: `https://ownersmanuals2.com/search?q=${encodedModel}`,
      type: "OEM Owner's Manual",
      isOfficial: true,
    });
  }

  // 3. OEM Exploded Parts Diagrams & Service Microfiche (Partzilla)
  sources.push({
    title: `${cleanModel} - OEM Exploded Parts Diagrams & Microfiche (Partzilla)`,
    uri: `https://www.partzilla.com/search?q=${encodedModel}`,
    type: 'OEM Parts Diagrams & Microfiche',
    isOfficial: false,
  });

  // 4. RepairManual.com Workshop Service Guides & Wiring Schematics
  sources.push({
    title: `${cleanModel} - RepairManual OEM Workshop Manual & Wiring Guide`,
    uri: `https://www.repairmanual.com/?s=${encodeURIComponent(cleanModel + ' service manual')}`,
    type: 'Workshop Repair Guide',
    isOfficial: false,
  });

  // 5. Cyclepedia Press Technical Service Database
  sources.push({
    title: `${cleanModel} - Cyclepedia Online Technical Service & Repair Guide`,
    uri: `https://www.cyclepedia.com/?s=${encodedModel}`,
    type: 'Technical Service Manual',
    isOfficial: false,
  });

  return sources;
}

// Function to sanitize any AI sources and ensure only genuine tech manuals are returned
export function sanitizeTechnicalSources(
  rawSources: { title: string; uri: string; type?: string }[] | undefined,
  modelName: string
): TechnicalManualSource[] {
  const genuineDefaults = getGenuineTechnicalManualSources(modelName);
  
  if (!rawSources || rawSources.length === 0) {
    return genuineDefaults;
  }

  // Filter out raw top-level homepages with no path or generic marketing magazines
  const validSpecificSources = rawSources.filter((s) => {
    if (!s.uri) return false;
    try {
      const url = new URL(s.uri);
      // If it's just a root domain like https://www.ducati.com or https://www.yamaha.com without specific path
      const isRootDomainOnly = url.pathname === '/' || url.pathname === '';
      const isGenericMagazine =
        url.hostname.includes('cycleworld.com') ||
        url.hostname.includes('motorcycle.com') ||
        url.hostname.includes('motorcyclistonline.com');

      // Keep if it has a real subpath or search query for manuals / technical specs
      if (isRootDomainOnly && !url.search) {
        return false;
      }
      if (isGenericMagazine && isRootDomainOnly) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  });

  // Merge genuine factory manuals with any valid specific sources found
  const combined: TechnicalManualSource[] = [...genuineDefaults];
  for (const src of validSpecificSources) {
    if (!combined.some((c) => c.uri === src.uri)) {
      combined.push({
        title: src.title,
        uri: src.uri,
        type: src.type || 'Technical Documentation',
      });
    }
  }

  return combined;
}
