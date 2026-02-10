// ============================================================================
// VESSEL PROFILE MOCK DATA
// Temperature assignments and cargo fill for ACON-062026 voyage
// ============================================================================

// Temperature zone assignments for this specific voyage
export interface VoyageTempAssignment {
  compartmentId: string;
  zoneId: string;
  zoneName: string;
  zoneColor: string;
  setTemperature: number;  // °C
  cargoType: string;
  palletsLoaded: number;
  palletsCapacity: number;
  shipments: string[];     // shipment IDs
}

export const voyageTempAssignments: VoyageTempAssignment[] = [
  // ZONE_1AB: Bananas +13.3°C
  { compartmentId: '1A', zoneId: 'ZONE_1AB', zoneName: 'Hold 1 A|B', zoneColor: '#3B82F6', setTemperature: 13.3, cargoType: 'BANANAS', palletsLoaded: 420, palletsCapacity: 480, shipments: ['SHP-001'] },
  { compartmentId: '1B', zoneId: 'ZONE_1AB', zoneName: 'Hold 1 A|B', zoneColor: '#3B82F6', setTemperature: 13.3, cargoType: 'BANANAS', palletsLoaded: 250, palletsCapacity: 278, shipments: ['SHP-001'] },

  // ZONE_1CD: Frozen Fish -18°C
  { compartmentId: '1C', zoneId: 'ZONE_1CD', zoneName: 'Hold 1 C|D', zoneColor: '#06B6D4', setTemperature: -18, cargoType: 'FROZEN_FISH', palletsLoaded: 191, palletsCapacity: 191, shipments: ['SHP-002'] },
  { compartmentId: '1D', zoneId: 'ZONE_1CD', zoneName: 'Hold 1 C|D', zoneColor: '#06B6D4', setTemperature: -18, cargoType: 'FROZEN_FISH', palletsLoaded: 160, palletsCapacity: 186, shipments: ['SHP-002'] },

  // ZONE_2UPDAB: Table Grapes -1°C
  { compartmentId: '2UPD', zoneId: 'ZONE_2UPDAB', zoneName: 'Hold 2 UPD|A|B', zoneColor: '#8B5CF6', setTemperature: -1, cargoType: 'TABLE_GRAPES', palletsLoaded: 143, palletsCapacity: 143, shipments: ['SHP-003'] },
  { compartmentId: '2A', zoneId: 'ZONE_2UPDAB', zoneName: 'Hold 2 UPD|A|B', zoneColor: '#8B5CF6', setTemperature: -1, cargoType: 'TABLE_GRAPES', palletsLoaded: 500, palletsCapacity: 565, shipments: ['SHP-003'] },
  { compartmentId: '2B', zoneId: 'ZONE_2UPDAB', zoneName: 'Hold 2 UPD|A|B', zoneColor: '#8B5CF6', setTemperature: -1, cargoType: 'TABLE_GRAPES', palletsLoaded: 350, palletsCapacity: 499, shipments: ['SHP-003'] },

  // ZONE_2CD: Citrus +4°C
  { compartmentId: '2C', zoneId: 'ZONE_2CD', zoneName: 'Hold 2 C|D', zoneColor: '#EC4899', setTemperature: 4, cargoType: 'CITRUS', palletsLoaded: 400, palletsCapacity: 485, shipments: ['SHP-005'] },
  { compartmentId: '2D', zoneId: 'ZONE_2CD', zoneName: 'Hold 2 C|D', zoneColor: '#EC4899', setTemperature: 4, cargoType: 'CITRUS', palletsLoaded: 100, palletsCapacity: 375, shipments: ['SHP-005'] },

  // ZONE_3UPDAB: Bananas +13.3°C
  { compartmentId: '3UPD', zoneId: 'ZONE_3UPDAB', zoneName: 'Hold 3 UPD|A|B', zoneColor: '#10B981', setTemperature: 13.3, cargoType: 'BANANAS', palletsLoaded: 100, palletsCapacity: 136, shipments: ['SHP-001'] },
  { compartmentId: '3A', zoneId: 'ZONE_3UPDAB', zoneName: 'Hold 3 UPD|A|B', zoneColor: '#10B981', setTemperature: 13.3, cargoType: 'BANANAS', palletsLoaded: 0, palletsCapacity: 604, shipments: [] },
  { compartmentId: '3B', zoneId: 'ZONE_3UPDAB', zoneName: 'Hold 3 UPD|A|B', zoneColor: '#10B981', setTemperature: 13.3, cargoType: 'BANANAS', palletsLoaded: 0, palletsCapacity: 577, shipments: [] },

  // ZONE_3CD: Empty (not assigned)
  { compartmentId: '3C', zoneId: 'ZONE_3CD', zoneName: 'Hold 3 C|D', zoneColor: '#14B8A6', setTemperature: 0, cargoType: '', palletsLoaded: 0, palletsCapacity: 608, shipments: [] },
  { compartmentId: '3D', zoneId: 'ZONE_3CD', zoneName: 'Hold 3 C|D', zoneColor: '#14B8A6', setTemperature: 0, cargoType: '', palletsLoaded: 0, palletsCapacity: 543, shipments: [] },

  // ZONE_4UPDAB: Berries +1°C (standby)
  { compartmentId: '4UPD', zoneId: 'ZONE_4UPDAB', zoneName: 'Hold 4 UPD|A|B', zoneColor: '#F59E0B', setTemperature: 1, cargoType: 'BERRIES', palletsLoaded: 0, palletsCapacity: 136, shipments: [] },
  { compartmentId: '4A', zoneId: 'ZONE_4UPDAB', zoneName: 'Hold 4 UPD|A|B', zoneColor: '#F59E0B', setTemperature: 1, cargoType: 'BERRIES', palletsLoaded: 0, palletsCapacity: 583, shipments: [] },
  { compartmentId: '4B', zoneId: 'ZONE_4UPDAB', zoneName: 'Hold 4 UPD|A|B', zoneColor: '#F59E0B', setTemperature: 1, cargoType: 'BERRIES', palletsLoaded: 0, palletsCapacity: 544, shipments: [] },

  // ZONE_4CD: Avocados +5°C (standby)
  { compartmentId: '4C', zoneId: 'ZONE_4CD', zoneName: 'Hold 4 C|D', zoneColor: '#EF4444', setTemperature: 5, cargoType: 'AVOCADOS', palletsLoaded: 0, palletsCapacity: 502, shipments: [] },
  { compartmentId: '4D', zoneId: 'ZONE_4CD', zoneName: 'Hold 4 C|D', zoneColor: '#EF4444', setTemperature: 5, cargoType: 'AVOCADOS', palletsLoaded: 0, palletsCapacity: 336, shipments: [] },
];

// Compartment layout data for SVG rendering
// Longitudinal cross-section: BOW (left) → STERN (right)
// Vertical: DECK (top) → D (bottom)
export interface CompartmentLayout {
  id: string;
  holdNumber: number;
  level: string;
  pallets: number;
}

export const compartmentLayouts: CompartmentLayout[] = [
  // Hold 1: Forward (bow) — 4 levels, no UPD
  { id: '1A', holdNumber: 1, level: 'A', pallets: 480 },
  { id: '1B', holdNumber: 1, level: 'B', pallets: 278 },
  { id: '1C', holdNumber: 1, level: 'C', pallets: 191 },
  { id: '1D', holdNumber: 1, level: 'D', pallets: 186 },

  // Hold 2: 5 levels with UPD
  { id: '2UPD', holdNumber: 2, level: 'UPD', pallets: 143 },
  { id: '2A', holdNumber: 2, level: 'A', pallets: 565 },
  { id: '2B', holdNumber: 2, level: 'B', pallets: 499 },
  { id: '2C', holdNumber: 2, level: 'C', pallets: 485 },
  { id: '2D', holdNumber: 2, level: 'D', pallets: 375 },

  // Hold 3: 5 levels with UPD
  { id: '3UPD', holdNumber: 3, level: 'UPD', pallets: 136 },
  { id: '3A', holdNumber: 3, level: 'A', pallets: 604 },
  { id: '3B', holdNumber: 3, level: 'B', pallets: 577 },
  { id: '3C', holdNumber: 3, level: 'C', pallets: 608 },
  { id: '3D', holdNumber: 3, level: 'D', pallets: 543 },

  // Hold 4: Aft (stern) — 5 levels with UPD
  { id: '4UPD', holdNumber: 4, level: 'UPD', pallets: 136 },
  { id: '4A', holdNumber: 4, level: 'A', pallets: 583 },
  { id: '4B', holdNumber: 4, level: 'B', pallets: 544 },
  { id: '4C', holdNumber: 4, level: 'C', pallets: 502 },
  { id: '4D', holdNumber: 4, level: 'D', pallets: 336 },
];
