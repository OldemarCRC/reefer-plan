// ============================================================================
// ACONCAGUA BAY - VESSEL DATA
// 
// Source: Aconcagua Bay vessel specification PDF (December 2023)
// IMO: 9019652 | Flag: Liberia | Built: April 1992
// 
// Capacity: 512,361 cbft / 5,894 sqm / 4,840 pallets
// ============================================================================

// ----------------------------------------------------------------------------
// COMPARTMENT DATA (19 compartments across 4 holds)
// ----------------------------------------------------------------------------

export interface CompartmentData {
  id: string;
  holdNumber: number;
  level: 'DECK' | 'UPD' | 'A' | 'B' | 'C' | 'D';
  capacityCbft: number;
  capacitySqm: number;
  maxPallets: number;
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
  position: {
    lcg: number; // Longitudinal Center of Gravity from midship (m)
    tcg: number; // Transverse Center of Gravity from centerline (m)
    vcg: number; // Vertical Center of Gravity from baseline (m)
  };
  maxStackWeight: number;
  coolingSectionId: string;
  temperatureZoneGroup: string;
  hatchSize: {
    length: number;
    width: number;
  };
}

// Data from PDF - Page 2: Reefer Compartment Capacity Breakdown
// Pallet capacity calculated as: sqm * 1.32 (stowage factor from PDF page 5)
export const COMPARTMENTS: CompartmentData[] = [
  // ============ HOLD 1 ============
  // Hold 1 has NO UPD level
  {
    id: 'H1-A',
    holdNumber: 1,
    level: 'A',
    capacityCbft: 34096,
    capacitySqm: 363.82,
    maxPallets: Math.floor(363.82 * 1.32), // 480
    dimensions: { length: 24.0, width: 15.2, height: 2.65 },
    position: { lcg: 55.0, tcg: 0, vcg: 9.5 },
    maxStackWeight: 22000,
    coolingSectionId: 'H1-A',
    temperatureZoneGroup: 'ZONE_1AB',
    hatchSize: { length: 10.0, width: 7.5 },
  },
  {
    id: 'H1-B',
    holdNumber: 1,
    level: 'B',
    capacityCbft: 22703,
    capacitySqm: 210.75,
    maxPallets: Math.floor(210.75 * 1.32), // 278
    dimensions: { length: 18.0, width: 11.7, height: 2.65 },
    position: { lcg: 55.0, tcg: 0, vcg: 6.8 },
    maxStackWeight: 22000,
    coolingSectionId: 'H1-B',
    temperatureZoneGroup: 'ZONE_1AB',
    hatchSize: { length: 10.0, width: 7.5 },
  },
  {
    id: 'H1-C',
    holdNumber: 1,
    level: 'C',
    capacityCbft: 12401,
    capacitySqm: 145.35,
    maxPallets: Math.floor(145.35 * 1.32), // 191
    dimensions: { length: 14.0, width: 10.4, height: 2.65 },
    position: { lcg: 55.0, tcg: 0, vcg: 4.2 },
    maxStackWeight: 22000,
    coolingSectionId: 'H1-C',
    temperatureZoneGroup: 'ZONE_1CD',
    hatchSize: { length: 7.0, width: 4.5 },
  },
  {
    id: 'H1-D',
    holdNumber: 1,
    level: 'D',
    capacityCbft: 11750,
    capacitySqm: 141.50,
    maxPallets: Math.floor(141.50 * 1.32), // 186
    dimensions: { length: 14.0, width: 10.1, height: 2.65 },
    position: { lcg: 55.0, tcg: 0, vcg: 1.6 },
    maxStackWeight: 22000,
    coolingSectionId: 'H1-D',
    temperatureZoneGroup: 'ZONE_1CD',
    hatchSize: { length: 7.0, width: 4.5 }, // Access via H1-C hatch
  },

  // ============ HOLD 2 ============
  {
    id: 'H2-UPD',
    holdNumber: 2,
    level: 'UPD',
    capacityCbft: 8815,
    capacitySqm: 108.68,
    maxPallets: Math.floor(108.68 * 1.32), // 143
    dimensions: { length: 12.0, width: 9.1, height: 2.20 },
    position: { lcg: 35.0, tcg: 0, vcg: 12.0 },
    maxStackWeight: 22000,
    coolingSectionId: 'H2-UPD',
    temperatureZoneGroup: 'ZONE_2UPDAB',
    hatchSize: { length: 10.0, width: 7.5 },
  },
  {
    id: 'H2-A',
    holdNumber: 2,
    level: 'A',
    capacityCbft: 36070,
    capacitySqm: 428.60,
    maxPallets: Math.floor(428.60 * 1.32), // 565
    dimensions: { length: 26.0, width: 16.5, height: 2.65 },
    position: { lcg: 35.0, tcg: 0, vcg: 9.5 },
    maxStackWeight: 22000,
    coolingSectionId: 'H2-A',
    temperatureZoneGroup: 'ZONE_2UPDAB',
    hatchSize: { length: 10.0, width: 7.5 },
  },
  {
    id: 'H2-B',
    holdNumber: 2,
    level: 'B',
    capacityCbft: 33005,
    capacitySqm: 378.17,
    maxPallets: Math.floor(378.17 * 1.32), // 499
    dimensions: { length: 24.0, width: 15.8, height: 2.65 },
    position: { lcg: 35.0, tcg: 0, vcg: 6.8 },
    maxStackWeight: 22000,
    coolingSectionId: 'H2-B',
    temperatureZoneGroup: 'ZONE_2UPDAB',
    hatchSize: { length: 10.0, width: 7.5 },
  },
  {
    id: 'H2-C',
    holdNumber: 2,
    level: 'C',
    capacityCbft: 30961,
    capacitySqm: 367.59,
    maxPallets: Math.floor(367.59 * 1.32), // 485
    dimensions: { length: 24.0, width: 15.3, height: 2.65 },
    position: { lcg: 35.0, tcg: 0, vcg: 4.2 },
    maxStackWeight: 22000,
    coolingSectionId: 'H2-C',
    temperatureZoneGroup: 'ZONE_2CD',
    hatchSize: { length: 10.0, width: 7.5 },
  },
  {
    id: 'H2-D',
    holdNumber: 2,
    level: 'D',
    capacityCbft: 25941,
    capacitySqm: 284.60,
    maxPallets: Math.floor(284.60 * 1.32), // 375
    dimensions: { length: 20.0, width: 14.2, height: 2.65 },
    position: { lcg: 35.0, tcg: 0, vcg: 1.6 },
    maxStackWeight: 22000,
    coolingSectionId: 'H2-D',
    temperatureZoneGroup: 'ZONE_2CD',
    hatchSize: { length: 10.0, width: 7.5 },
  },

  // ============ HOLD 3 ============
  {
    id: 'H3-UPD',
    holdNumber: 3,
    level: 'UPD',
    capacityCbft: 8833,
    capacitySqm: 103.40,
    maxPallets: Math.floor(103.40 * 1.32), // 136
    dimensions: { length: 12.0, width: 8.6, height: 2.20 },
    position: { lcg: 10.0, tcg: 0, vcg: 12.0 },
    maxStackWeight: 22000,
    coolingSectionId: 'H3-UPD',
    temperatureZoneGroup: 'ZONE_3UPDAB',
    hatchSize: { length: 10.0, width: 7.5 },
  },
  {
    id: 'H3-A',
    holdNumber: 3,
    level: 'A',
    capacityCbft: 37515,
    capacitySqm: 458.29,
    maxPallets: Math.floor(458.29 * 1.32), // 604
    dimensions: { length: 28.0, width: 16.4, height: 2.65 },
    position: { lcg: 10.0, tcg: 0, vcg: 9.5 },
    maxStackWeight: 22000,
    coolingSectionId: 'H3-A',
    temperatureZoneGroup: 'ZONE_3UPDAB',
    hatchSize: { length: 10.0, width: 7.5 },
  },
  {
    id: 'H3-B',
    holdNumber: 3,
    level: 'B',
    capacityCbft: 37100,
    capacitySqm: 437.24,
    maxPallets: Math.floor(437.24 * 1.32), // 577
    dimensions: { length: 28.0, width: 15.6, height: 2.65 },
    position: { lcg: 10.0, tcg: 0, vcg: 6.8 },
    maxStackWeight: 22000,
    coolingSectionId: 'H3-B',
    temperatureZoneGroup: 'ZONE_3UPDAB',
    hatchSize: { length: 10.0, width: 7.5 },
  },
  {
    id: 'H3-C',
    holdNumber: 3,
    level: 'C',
    capacityCbft: 38387,
    capacitySqm: 461.17,
    maxPallets: Math.floor(461.17 * 1.32), // 608
    dimensions: { length: 28.0, width: 16.5, height: 2.65 },
    position: { lcg: 10.0, tcg: 0, vcg: 4.2 },
    maxStackWeight: 22000,
    coolingSectionId: 'H3-C',
    temperatureZoneGroup: 'ZONE_3CD',
    hatchSize: { length: 10.0, width: 7.5 },
  },
  {
    id: 'H3-D',
    holdNumber: 3,
    level: 'D',
    capacityCbft: 35763,
    capacitySqm: 411.94,
    maxPallets: Math.floor(411.94 * 1.32), // 543
    dimensions: { length: 26.0, width: 15.8, height: 2.65 },
    position: { lcg: 10.0, tcg: 0, vcg: 1.6 },
    maxStackWeight: 22000,
    coolingSectionId: 'H3-D',
    temperatureZoneGroup: 'ZONE_3CD',
    hatchSize: { length: 10.0, width: 7.5 },
  },

  // ============ HOLD 4 ============
  {
    id: 'H4-UPD',
    holdNumber: 4,
    level: 'UPD',
    capacityCbft: 8739,
    capacitySqm: 103.30,
    maxPallets: Math.floor(103.30 * 1.32), // 136
    dimensions: { length: 12.0, width: 8.6, height: 2.20 },
    position: { lcg: -15.0, tcg: 0, vcg: 12.0 },
    maxStackWeight: 22000,
    coolingSectionId: 'H4-UPD',
    temperatureZoneGroup: 'ZONE_4UPDAB',
    hatchSize: { length: 10.0, width: 7.5 },
  },
  {
    id: 'H4-A',
    holdNumber: 4,
    level: 'A',
    capacityCbft: 36205,
    capacitySqm: 441.98,
    maxPallets: Math.floor(441.98 * 1.32), // 583
    dimensions: { length: 26.0, width: 17.0, height: 2.65 },
    position: { lcg: -15.0, tcg: 0, vcg: 9.5 },
    maxStackWeight: 22000,
    coolingSectionId: 'H4-A',
    temperatureZoneGroup: 'ZONE_4UPDAB',
    hatchSize: { length: 10.0, width: 7.5 },
  },
  {
    id: 'H4-B',
    holdNumber: 4,
    level: 'B',
    capacityCbft: 36090,
    capacitySqm: 412.20,
    maxPallets: Math.floor(412.20 * 1.32), // 544
    dimensions: { length: 26.0, width: 15.9, height: 2.65 },
    position: { lcg: -15.0, tcg: 0, vcg: 6.8 },
    maxStackWeight: 22000,
    coolingSectionId: 'H4-B',
    temperatureZoneGroup: 'ZONE_4UPDAB',
    hatchSize: { length: 10.0, width: 7.5 },
  },
  {
    id: 'H4-C',
    holdNumber: 4,
    level: 'C',
    capacityCbft: 32513,
    capacitySqm: 380.99,
    maxPallets: Math.floor(380.99 * 1.32), // 502
    dimensions: { length: 24.0, width: 15.9, height: 2.65 },
    position: { lcg: -15.0, tcg: 0, vcg: 4.2 },
    maxStackWeight: 22000,
    coolingSectionId: 'H4-C',
    temperatureZoneGroup: 'ZONE_4CD',
    hatchSize: { length: 10.0, width: 7.5 },
  },
  {
    id: 'H4-D',
    holdNumber: 4,
    level: 'D',
    capacityCbft: 25474,
    capacitySqm: 254.81,
    maxPallets: Math.floor(254.81 * 1.32), // 336
    dimensions: { length: 18.0, width: 14.2, height: 2.65 },
    position: { lcg: -15.0, tcg: 0, vcg: 1.6 },
    maxStackWeight: 22000,
    coolingSectionId: 'H4-D',
    temperatureZoneGroup: 'ZONE_4CD',
    hatchSize: { length: 10.0, width: 7.5 },
  },
];

// ----------------------------------------------------------------------------
// TEMPERATURE ZONES (8 zones for UI grouping)
// From PDF: "Cooling sections 1A|B - 1C|D - 2UPD|A|B - 2C|D - 3UPD|A|B - 3C|D - 4UPD|A|B - 4C|D"
// ----------------------------------------------------------------------------

export interface TemperatureZoneData {
  zoneId: string;
  name: string;
  minTemp: number;
  maxTemp: number;
  color: string;
  compartmentIds: string[];
}

export const TEMPERATURE_ZONES: TemperatureZoneData[] = [
  {
    zoneId: 'ZONE_1AB',
    name: 'Hold 1 A|B',
    minTemp: -25,
    maxTemp: 15,
    color: '#3B82F6', // Blue
    compartmentIds: ['H1-A', 'H1-B'],
  },
  {
    zoneId: 'ZONE_1CD',
    name: 'Hold 1 C|D',
    minTemp: -25,
    maxTemp: 15,
    color: '#06B6D4', // Cyan
    compartmentIds: ['H1-C', 'H1-D'],
  },
  {
    zoneId: 'ZONE_2UPDAB',
    name: 'Hold 2 UPD|A|B',
    minTemp: -25,
    maxTemp: 15,
    color: '#8B5CF6', // Purple
    compartmentIds: ['H2-UPD', 'H2-A', 'H2-B'],
  },
  {
    zoneId: 'ZONE_2CD',
    name: 'Hold 2 C|D',
    minTemp: -25,
    maxTemp: 15,
    color: '#EC4899', // Pink
    compartmentIds: ['H2-C', 'H2-D'],
  },
  {
    zoneId: 'ZONE_3UPDAB',
    name: 'Hold 3 UPD|A|B',
    minTemp: -25,
    maxTemp: 15,
    color: '#10B981', // Emerald
    compartmentIds: ['H3-UPD', 'H3-A', 'H3-B'],
  },
  {
    zoneId: 'ZONE_3CD',
    name: 'Hold 3 C|D',
    minTemp: -25,
    maxTemp: 15,
    color: '#14B8A6', // Teal
    compartmentIds: ['H3-C', 'H3-D'],
  },
  {
    zoneId: 'ZONE_4UPDAB',
    name: 'Hold 4 UPD|A|B',
    minTemp: -25,
    maxTemp: 15,
    color: '#F59E0B', // Amber
    compartmentIds: ['H4-UPD', 'H4-A', 'H4-B'],
  },
  {
    zoneId: 'ZONE_4CD',
    name: 'Hold 4 C|D',
    minTemp: -25,
    maxTemp: 15,
    color: '#EF4444', // Red
    compartmentIds: ['H4-C', 'H4-D'],
  },
];

// ----------------------------------------------------------------------------
// COOLING SECTIONS (19 sections, one per compartment)
// Each compartment has independent temperature control
// ----------------------------------------------------------------------------

export interface CoolingSectionData {
  sectionId: string;
  compartmentIds: string[];
  assignedTemperatureZone: string;
  currentTemperature: number | null;
  locked: boolean;
}

export const COOLING_SECTIONS: CoolingSectionData[] = COMPARTMENTS.map((comp) => ({
  sectionId: comp.coolingSectionId,
  compartmentIds: [comp.id],
  assignedTemperatureZone: comp.temperatureZoneGroup,
  currentTemperature: null,
  locked: false,
}));

// ----------------------------------------------------------------------------
// VESSEL DATA (General specifications)
// Source: PDF pages 1-5
// ----------------------------------------------------------------------------

export const VESSEL_DATA = {
  name: 'ACONCAGUA BAY',
  imoNumber: '9019652',
  flag: 'Liberia',
  callSign: 'A8KY9',

  dimensions: {
    loa: 148.50, // Length Over All (m)
    beam: 20.60, // Beam/Width (m)
    depth: 12.80, // Depth (m)
    draft: {
      summer: 9.42,
      winter: 9.22,
      tropical: 9.61,
    },
  },

  capacity: {
    gt: 9074, // Gross Tonnage (International)
    nt: 5844, // Net Tonnage
    dwat: {
      summer: 11581,
      winter: 11128,
      tropical: 12039,
    },
    totalCbft: 512361, // Total cubic feet
    totalSqm: 5894.38, // Total square meters
    totalPallets: 4840, // Based on 1.32 pallets/sqm stowage factor
  },

  // Deck container capacity
  deckContainerCapacity: {
    maxReeferPlugs: 19,
    maxTEU: 20,
    maxFEU: 19,
  },

  // Reference stability data (for preliminary calculations only)
  // Captain must verify with onboard systems
  stability: {
    lightship: {
      weight: 5500, // Estimated lightship weight (tonnes)
      lcg: 0, // LCG from midship (m)
      vcg: 7.5, // VCG from baseline (m) - KG
      tcg: 0, // TCG from centerline (m)
    },
    referenceLimits: {
      minGM: 0.15, // Minimum GM (m)
      maxGM: 8.0, // Maximum GM (m) - to avoid excessive stiffness
      maxTrim: 1.5, // Maximum trim (m)
      maxList: 5.0, // Maximum list (degrees)
      maxDraft: 9.5, // Maximum draft (m) - summer
    },
    approvalRequired: true,
  },

  // Reefer specifications
  reefer: {
    holds: 4,
    hatches: 4,
    compartments: 19,
    temperatureZones: 8, // UI groupings
    coolingSections: 19, // Actual independent cooling (one per compartment)
    minDeckHeight: 2.20, // meters (excl local areas)
    maxForkliftWeight: 6000, // kg (6 mt max, with 4 non-hard rubber air tires)
    temperatureRange: {
      min: -25,
      max: 15,
    },
    airCirculationsPerHour: 90,
    airRenewalsPerHour: 0,
    usdaEquipped: true,
    usdaValidUntil: new Date('2024-07-01'), // From PDF
    controlledAtmosphere: false,
    modifiedAtmosphere: false,
  },

  // Classification
  classification: {
    society: 'Bureau Veritas (BV)',
    mainClass: 'I, +Hull, +MACH',
    serviceNotations: 'Refrigerated cargo ship',
    navigationNotations: 'Unrestricted Navigation',
    additionalNotations: '+REF-CARGO',
    machinery: '+MACH',
    iceClass: null, // No Finnish/Swedish ice class
  },

  // Cargo gear
  cargoGear: {
    description: '8 Derricks x 7.0 mt or 4 x 5.0 mt in Union Purchase',
    derricks: 8,
    maxLiftCapacity: 7.0, // tonnes per derrick
  },

  // Bunker capacity (from PDF page 4)
  bunkerCapacity: {
    ifo380: {
      cbm100: 1027,
      cbmAtMaxFill: 845,
      mt: 837,
    },
    mgo: {
      cbm100: 142,
      cbmAtMaxFill: 120,
      mt: 102,
    },
  },

  built: new Date('1992-04-01'),
};

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------------------------------

/**
 * Group compartments by hold number
 */
export function getCompartmentsByHold(): Map<number, CompartmentData[]> {
  const holdMap = new Map<number, CompartmentData[]>();
  
  for (const comp of COMPARTMENTS) {
    const existing = holdMap.get(comp.holdNumber) || [];
    existing.push(comp);
    holdMap.set(comp.holdNumber, existing);
  }
  
  return holdMap;
}

/**
 * Calculate total capacity for a hold
 */
export function getHoldTotals(holdNumber: number): { cbft: number; sqm: number; pallets: number } {
  const compartments = COMPARTMENTS.filter((c) => c.holdNumber === holdNumber);
  
  return {
    cbft: compartments.reduce((sum, c) => sum + c.capacityCbft, 0),
    sqm: compartments.reduce((sum, c) => sum + c.capacitySqm, 0),
    pallets: compartments.reduce((sum, c) => sum + c.maxPallets, 0),
  };
}

/**
 * Get compartments by temperature zone
 */
export function getCompartmentsByZone(zoneId: string): CompartmentData[] {
  return COMPARTMENTS.filter((c) => c.temperatureZoneGroup === zoneId);
}

/**
 * Build holds array for Mongoose schema
 */
export function buildHoldsArray() {
  const holds = [];
  
  for (let holdNum = 1; holdNum <= 4; holdNum++) {
    const compartments = COMPARTMENTS.filter((c) => c.holdNumber === holdNum);
    const totals = getHoldTotals(holdNum);
    
    holds.push({
      holdNumber: holdNum,
      compartments: compartments.map((c) => ({
        id: c.id,
        level: c.level,
        capacityCbft: c.capacityCbft,
        capacitySqm: c.capacitySqm,
        maxPallets: c.maxPallets,
        dimensions: c.dimensions,
        position: c.position,
        maxStackWeight: c.maxStackWeight,
        coolingSectionId: c.coolingSectionId,
        hatchSize: c.hatchSize,
      })),
      totalCapacityCbft: totals.cbft,
      totalCapacitySqm: totals.sqm,
    });
  }
  
  return holds;
}

// ----------------------------------------------------------------------------
// SUMMARY STATISTICS
// ----------------------------------------------------------------------------

export const VESSEL_SUMMARY = {
  totalCompartments: COMPARTMENTS.length, // 19
  totalCoolingSections: COOLING_SECTIONS.length, // 19
  totalTemperatureZones: TEMPERATURE_ZONES.length, // 8
  
  totalCapacity: {
    cbft: COMPARTMENTS.reduce((sum, c) => sum + c.capacityCbft, 0), // 512,361
    sqm: COMPARTMENTS.reduce((sum, c) => sum + c.capacitySqm, 0), // 5,894.38
    pallets: COMPARTMENTS.reduce((sum, c) => sum + c.maxPallets, 0), // ~4,840
  },
  
  holdCapacities: {
    hold1: getHoldTotals(1),
    hold2: getHoldTotals(2),
    hold3: getHoldTotals(3),
    hold4: getHoldTotals(4),
  },
  
  compartmentsPerHold: {
    hold1: COMPARTMENTS.filter((c) => c.holdNumber === 1).length, // 4 (no UPD)
    hold2: COMPARTMENTS.filter((c) => c.holdNumber === 2).length, // 5
    hold3: COMPARTMENTS.filter((c) => c.holdNumber === 3).length, // 5
    hold4: COMPARTMENTS.filter((c) => c.holdNumber === 4).length, // 5
  },
};

// Log summary when imported (for debugging)
if (process.env.NODE_ENV === 'development') {
  console.log('📊 ACONCAGUA BAY Data Loaded:');
  console.log(`   • ${VESSEL_SUMMARY.totalCompartments} compartments`);
  console.log(`   • ${VESSEL_SUMMARY.totalCoolingSections} cooling sections`);
  console.log(`   • ${VESSEL_SUMMARY.totalTemperatureZones} temperature zones (UI)`);
  console.log(`   • ${VESSEL_SUMMARY.totalCapacity.pallets} total pallet capacity`);
}
