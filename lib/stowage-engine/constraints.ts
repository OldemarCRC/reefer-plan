// ============================================================================
// STOWAGE ENGINE — HARD CONSTRAINT VALIDATORS
// Pure functions — no side effects.
// ============================================================================

import type {
  EngineBooking,
  EngineSection,
  EngineZone,
  CargoAssignment,
} from './types';

// Level accessibility order: index 0 = most accessible (easiest to discharge).
// DECK and FC are handled as synonymous with UPD for accessibility ranking.
const LEVEL_ORDER = ['DECK', 'UPD', 'FC', 'A', 'B', 'C', 'D', 'E'];

function levelIndex(sectionId: string): number {
  // sectionId = "{holdDigit}{level}" e.g. "1A", "2UPD", "4D"
  const level = sectionId.slice(1).toUpperCase(); // strip leading hold digit
  const idx = LEVEL_ORDER.indexOf(level);
  return idx === -1 ? LEVEL_ORDER.length : idx; // unknown → least accessible
}

// ----------------------------------------------------------------------------
// 1. Temperature compatibility
// ----------------------------------------------------------------------------

export function isTemperatureCompatible(
  booking: EngineBooking,
  zone: EngineZone,
): boolean {
  if (zone.assignedTemperature === null) return false;
  return (
    zone.assignedTemperature >= booking.tempMin &&
    zone.assignedTemperature <= booking.tempMax
  );
}

// ----------------------------------------------------------------------------
// 2. Remaining section capacity
// ----------------------------------------------------------------------------

export function getSectionRemainingCapacity(
  section: EngineSection,
  assignments: CargoAssignment[],
): number {
  const used = assignments
    .filter(a => a.sectionId === section.sectionId)
    .reduce((sum, a) => sum + a.palletsAssigned, 0);
  return section.maxPallets - used;
}

// ----------------------------------------------------------------------------
// 3. Overstow violation
// Placing this booking in this section violates overstow if, within the same
// hold, later-discharge cargo ends up in a more accessible level than
// earlier-discharge cargo.
//
// Rule: cargo for EARLIER discharge (lower podSequence) must be in SAME OR
// MORE ACCESSIBLE levels than cargo for LATER discharge in the same hold.
// Violation = later cargo (higher podSequence) in a lower level-index
// (more accessible) position than earlier cargo.
// ----------------------------------------------------------------------------

export function isOverstowViolation(
  booking: EngineBooking,
  section: EngineSection,
  assignments: CargoAssignment[],
  allBookings: EngineBooking[],
): boolean {
  const bookingLevelIdx = levelIndex(section.sectionId);

  // Build a lookup from bookingId → booking.
  const bookingMap = new Map(allBookings.map(b => [b.bookingId, b]));

  // Find all existing assignments in the same hold.
  for (const existing of assignments) {
    // We need to know which section the existing assignment is in,
    // and what hold that section belongs to.
    // We infer hold from the sectionId's leading digit.
    const existingHold = parseInt(existing.sectionId.charAt(0), 10);
    if (existingHold !== section.holdNumber) continue;

    const existingBooking = bookingMap.get(existing.bookingId);
    if (!existingBooking) continue;
    if (existingBooking.bookingId === booking.bookingId) continue;

    const existingLevelIdx = levelIndex(existing.sectionId);

    // Violation case A: we are placing LATER cargo in a MORE accessible spot
    // than existing EARLIER cargo.
    if (
      booking.podSequence > existingBooking.podSequence &&
      bookingLevelIdx < existingLevelIdx
    ) {
      return true;
    }

    // Violation case B: we are placing EARLIER cargo in a LESS accessible spot
    // than existing LATER cargo.
    if (
      booking.podSequence < existingBooking.podSequence &&
      bookingLevelIdx > existingLevelIdx
    ) {
      return true;
    }
  }

  return false;
}

// ----------------------------------------------------------------------------
// 4. Get all sections that pass every hard constraint for this booking.
// ----------------------------------------------------------------------------

export function getCompatibleSections(
  booking: EngineBooking,
  sections: EngineSection[],
  zones: EngineZone[],
  assignments: CargoAssignment[],
  allBookings: EngineBooking[],
): EngineSection[] {
  // Build zoneId → zone lookup.
  const zoneMap = new Map(zones.map(z => [z.zoneId, z]));

  return sections.filter(section => {
    const zone = zoneMap.get(section.zoneId);
    if (!zone) return false;

    // Hard constraint 1: temperature.
    if (!isTemperatureCompatible(booking, zone)) return false;

    // Hard constraint 2: remaining capacity > 0.
    if (getSectionRemainingCapacity(section, assignments) <= 0) return false;

    // Hard constraint 3: no overstow violation.
    if (isOverstowViolation(booking, section, assignments, allBookings)) return false;

    return true;
  });
}
