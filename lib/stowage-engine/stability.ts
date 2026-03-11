// ============================================================================
// STOWAGE ENGINE — STABILITY CALCULATIONS
// Placeholder arms derived from sectionId hold number.
// When real hydrostatic data is available, store arms in the vessel document.
// ============================================================================

import type {
  EngineSection,
  CargoAssignment,
  EngineBooking,
  StabilityIndicator,
} from './types';

// Default weight per pallet (kg) when no actual weight data is available.
const AVG_PALLET_WEIGHT_KG = 850;

// Placeholder vessel parameters (conservative defaults).
const VESSEL_LPP = 150;   // metres between perpendiculars
const VESSEL_BEAM = 24;   // metres

// Approximate longitudinal arms by hold (metres from midship, + = forward).
const HOLD_LONGITUDINAL_ARM: Record<number, number> = {
  1: 60,
  2: 20,
  3: -20,
  4: -60,
};

// Derive hold number from sectionId (first character is the hold digit).
function holdFromSectionId(sectionId: string): number {
  return parseInt(sectionId.charAt(0), 10) || 1;
}

function classifyStatus(
  trimIndex: number,
  listIndex: number,
): StabilityIndicator['status'] {
  const t = Math.abs(trimIndex);
  const l = Math.abs(listIndex);
  if (t >= 0.05 || l >= 0.05) return 'RED';
  if (t >= 0.02 || l >= 0.02) return 'YELLOW';
  return 'GREEN';
}

// ----------------------------------------------------------------------------
// Main export
// ----------------------------------------------------------------------------

export function calculateStability(
  sections: EngineSection[],
  assignments: CargoAssignment[],
  bookings: EngineBooking[],
  portSequences: number[],
): StabilityIndicator[] {
  if (portSequences.length === 0) return [];

  const sectionMap = new Map(sections.map(s => [s.sectionId, s]));
  const bookingMap = new Map(bookings.map(b => [b.bookingId, b]));

  const indicators: StabilityIndicator[] = [];

  // Work through port events in ascending sequence order (earliest port first).
  const sortedPorts = [...portSequences].sort((a, b) => a - b);

  // Start with all assignments; remove cargo as ports are visited.
  let active = [...assignments];

  for (const portSeq of sortedPorts) {
    // Remove cargo being discharged at this port.
    active = active.filter(a => {
      const b = bookingMap.get(a.bookingId);
      return b ? b.podSequence > portSeq : true;
    });

    if (active.length === 0) {
      indicators.push({
        trimIndex: 0,
        listIndex: 0,
        status: 'GREEN',
        portSequence: portSeq,
        portCode: `SEQ${portSeq}`,
      });
      continue;
    }

    let totalWeight = 0;
    let longMoment = 0;
    let transMoment = 0;

    for (const a of active) {
      const sec = sectionMap.get(a.sectionId);
      const b   = bookingMap.get(a.bookingId);
      if (!sec || !b) continue;

      const weight = a.palletsAssigned * AVG_PALLET_WEIGHT_KG;
      const lArm   = sec.longitudinalArm !== 0
        ? sec.longitudinalArm
        : (HOLD_LONGITUDINAL_ARM[holdFromSectionId(sec.sectionId)] ?? 0);
      const tArm   = sec.transverseArm;

      totalWeight  += weight;
      longMoment   += weight * lArm;
      transMoment  += weight * tArm;
    }

    if (totalWeight === 0) {
      indicators.push({
        trimIndex: 0,
        listIndex: 0,
        status: 'GREEN',
        portSequence: portSeq,
        portCode: `SEQ${portSeq}`,
      });
      continue;
    }

    const lcg = longMoment / totalWeight;
    const tcg = transMoment / totalWeight;

    const trimIndex = lcg / VESSEL_LPP;
    const listIndex = tcg / (VESSEL_BEAM / 2);

    indicators.push({
      trimIndex: Math.round(trimIndex * 10000) / 10000,
      listIndex: Math.round(listIndex * 10000) / 10000,
      status: classifyStatus(trimIndex, listIndex),
      portSequence: portSeq,
      portCode: `SEQ${portSeq}`,
    });
  }

  return indicators;
}
