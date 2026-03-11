// ============================================================================
// STOWAGE ENGINE — TYPE DEFINITIONS
// Pure TypeScript only — no Mongoose, no DB imports.
// ============================================================================

// A single physical cooling section (one floor area, one stowage factor).
// maxPallets = Math.floor(sqm * designStowageFactor)
// Note: designStowageFactor in this codebase means pallets-per-sqm (not cubic m/t).
export interface EngineSection {
  sectionId: string;            // e.g. "1A", "2UPD", "3B"
  zoneId: string;               // zone this section belongs to, e.g. "1AB"
  sqm: number;
  designStowageFactor: number;  // pallets per sqm, e.g. 1.32
  maxPallets: number;           // Math.floor(sqm * designStowageFactor)
  holdNumber: number;           // 1 | 2 | 3 | 4
  longitudinalArm: number;      // metres from midship (+fwd / -aft)
  transverseArm: number;        // metres from centreline (+port / -starboard)
  assignedTemperature: number | null; // set once zone temp is initialised
}

// A temperature zone — one refrigeration circuit covering 1..N sections.
export interface EngineZone {
  zoneId: string;               // e.g. "1AB", "2UPDAB", "3CD"
  sectionIds: string[];
  assignedTemperature: number | null;
  source: 'INHERITED' | 'MAJORITY_RULE' | 'PLANNER_OVERRIDE' | null;
}

// A booking normalised for engine consumption.
export interface EngineBooking {
  bookingId: string;
  cargoType: string;
  tempMin: number;              // minimum compatible temperature for this cargo
  tempMax: number;              // maximum compatible temperature for this cargo
  pallets: number;              // requestedQuantity (ESTIMATED) or confirmedQuantity (CONFIRMED)
  polSequence: number;          // voyage port-call sequence for port of loading
  podSequence: number;          // voyage port-call sequence for port of discharge
  shipperId: string;
  consigneeCode: string;
  confidence: 'ESTIMATED' | 'CONFIRMED';
  frozen: boolean;              // true = confirmed assignment, never re-assigned by engine
}

// Full engine input bundle.
export interface EngineInput {
  vessel: {
    sections: EngineSection[];
    zones: EngineZone[];
  };
  bookings: EngineBooking[];
  previousZoneTemps?: Record<string, number>;  // zoneId → temperature (INHERITED)
  plannerOverrides?: Record<string, number>;   // zoneId → temperature (PLANNER_OVERRIDE)
  phase: 'ESTIMATED' | 'CONFIRMED';
}

// One booking ↔ section assignment.
export interface CargoAssignment {
  bookingId: string;
  sectionId: string;
  palletsAssigned: number;
  confidence: 'ESTIMATED' | 'CONFIRMED';
  frozen: boolean;
}

// A conflict detected during planning.
export type ConflictType =
  | 'TEMPERATURE_CONFLICT'
  | 'CAPACITY_CONFLICT'
  | 'OVERSTOW_CONFLICT'
  | 'STABILITY_WARNING';

export interface EngineConflict {
  type: ConflictType;
  bookingIds: string[];
  sectionsInvolved: string[];
  palletsAffected: number;
  message: string;
  suggestedActions: string[];
}

// Per-port stability snapshot.
export interface StabilityIndicator {
  trimIndex: number;    // -1 to 1 (LCG deviation relative to Lpp)
  listIndex: number;    // -1 to 1 (TCG deviation relative to beam/2)
  status: 'GREEN' | 'YELLOW' | 'RED';
  portSequence: number;
  portCode: string;
}

// Full engine output.
export interface EngineOutput {
  assignments: CargoAssignment[];
  zoneTemps: EngineZone[];
  conflicts: EngineConflict[];
  stabilityByPort: StabilityIndicator[];
  unassignedBookings: { bookingId: string; reason: string }[];
}
