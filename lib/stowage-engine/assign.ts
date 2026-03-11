// ============================================================================
// STOWAGE ENGINE — CARGO ASSIGNMENT
// Greedy constructive pass + local repair pass + conflict generation.
// ============================================================================

import type {
  EngineInput,
  EngineZone,
  CargoAssignment,
  EngineConflict,
  EngineOutput,
  EngineSection,
  EngineBooking,
} from './types';
import {
  getCompatibleSections,
  getSectionRemainingCapacity,
  isTemperatureCompatible,
} from './constraints';

// Best-fit section: pick the section whose remaining capacity is >= needed
// and as close to needed as possible (minimises leftover, avoids fragmentation).
function bestFitSection(
  sections: EngineSection[],
  needed: number,
  assignments: CargoAssignment[],
): EngineSection | null {
  let best: EngineSection | null = null;
  let bestLeftover = Infinity;

  for (const s of sections) {
    const remaining = getSectionRemainingCapacity(s, assignments);
    if (remaining >= needed) {
      const leftover = remaining - needed;
      if (leftover < bestLeftover) {
        bestLeftover = leftover;
        best = s;
      }
    }
  }
  return best;
}

// Determine majority hold pair from zone temperature assignments.
// Returns the hold numbers that hold the most cargo (by zone count).
function preferredHolds(zones: EngineZone[], sections: EngineSection[]): Set<number> {
  const holdCount = new Map<number, number>();
  for (const z of zones) {
    if (z.assignedTemperature === null) continue;
    for (const sid of z.sectionIds) {
      const sec = sections.find(s => s.sectionId === sid);
      if (!sec) continue;
      holdCount.set(sec.holdNumber, (holdCount.get(sec.holdNumber) ?? 0) + 1);
    }
  }
  // Sort holds by count desc, take top 2.
  const sorted = [...holdCount.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 2).map(([h]) => h);
  return new Set(top);
}

// ----------------------------------------------------------------------------
// Main export
// ----------------------------------------------------------------------------

export function assignCargo(
  input: EngineInput,
  zones: EngineZone[],
): {
  assignments: CargoAssignment[];
  conflicts: EngineConflict[];
  unassigned: EngineOutput['unassignedBookings'];
} {
  const { sections } = input.vessel;
  const allBookings = input.bookings;
  const assignments: CargoAssignment[] = [];
  const unassigned: EngineOutput['unassignedBookings'] = [];

  // Determine preferred hold pair (majority cargo holds).
  const preferred = preferredHolds(zones, sections);

  // Sort bookings: frozen first, then by podSequence desc (deepest load first),
  // then by pallets desc.
  const sorted = [...allBookings].sort((a, b) => {
    if (a.frozen !== b.frozen) return a.frozen ? -1 : 1;
    if (b.podSequence !== a.podSequence) return b.podSequence - a.podSequence;
    return b.pallets - a.pallets;
  });

  // ── Greedy constructive pass ──────────────────────────────────────────────
  const unassignedAfterGreedy: EngineBooking[] = [];

  for (const booking of sorted) {
    let remaining = booking.pallets;
    const compatible = getCompatibleSections(
      booking, sections, zones, assignments, allBookings,
    );

    if (compatible.length === 0) {
      unassignedAfterGreedy.push(booking);
      continue;
    }

    // Prefer sections in the preferred holds.
    const preferredSections = compatible.filter(s => preferred.has(s.holdNumber));
    const fallbackSections  = compatible.filter(s => !preferred.has(s.holdNumber));
    const orderedSections   = [...preferredSections, ...fallbackSections];

    // Try to fit entire booking into one section first.
    const single = bestFitSection(orderedSections, remaining, assignments);
    if (single) {
      assignments.push({
        bookingId: booking.bookingId,
        sectionId: single.sectionId,
        palletsAssigned: remaining,
        confidence: booking.confidence,
        frozen: booking.frozen,
      });
      continue;
    }

    // Split across multiple sections.
    let splitSuccessful = true;
    for (const sec of orderedSections) {
      if (remaining <= 0) break;
      const cap = getSectionRemainingCapacity(sec, assignments);
      if (cap <= 0) continue;
      const allocate = Math.min(remaining, cap);
      assignments.push({
        bookingId: booking.bookingId,
        sectionId: sec.sectionId,
        palletsAssigned: allocate,
        confidence: booking.confidence,
        frozen: booking.frozen,
      });
      remaining -= allocate;
    }

    if (remaining > 0) {
      // Partial — keep what was assigned, record unassigned remainder.
      unassignedAfterGreedy.push({ ...booking, pallets: remaining });
      splitSuccessful = false;
    }

    void splitSuccessful; // suppress unused var warning
  }

  // ── Local repair pass ─────────────────────────────────────────────────────
  const stillUnassigned: EngineBooking[] = [];

  for (const booking of unassignedAfterGreedy) {
    let repaired = false;

    for (let attempt = 0; attempt < 3 && !repaired; attempt++) {
      // Find ESTIMATED (non-frozen) assignments in sections that are compatible
      // with the booking.
      const zoneMap = new Map(zones.map(z => [z.zoneId, z]));

      for (const candidate of sections) {
        const zone = zoneMap.get(candidate.zoneId);
        if (!zone || !isTemperatureCompatible(booking, zone)) continue;

        const candidateAssignments = assignments.filter(
          a => a.sectionId === candidate.sectionId && !a.frozen,
        );
        if (candidateAssignments.length === 0) continue;

        // Try to move each ESTIMATED assignment in this section to another section.
        for (const movable of candidateAssignments) {
          const movableBooking = allBookings.find(b => b.bookingId === movable.bookingId);
          if (!movableBooking) continue;

          // Find an alternative section for the movable booking.
          const tempAssignmentsWithoutMovable = assignments.filter(a => a !== movable);
          const altSections = getCompatibleSections(
            movableBooking,
            sections,
            zones,
            tempAssignmentsWithoutMovable,
            allBookings,
          ).filter(s => s.sectionId !== candidate.sectionId);

          const alt = bestFitSection(altSections, movable.palletsAssigned, tempAssignmentsWithoutMovable);
          if (!alt) continue;

          // Execute the swap.
          const idx = assignments.indexOf(movable);
          assignments[idx] = {
            ...movable,
            sectionId: alt.sectionId,
          };

          // Now try to assign the original booking to candidate.
          const cap = getSectionRemainingCapacity(candidate, assignments);
          if (cap >= booking.pallets) {
            assignments.push({
              bookingId: booking.bookingId,
              sectionId: candidate.sectionId,
              palletsAssigned: booking.pallets,
              confidence: booking.confidence,
              frozen: booking.frozen,
            });
            repaired = true;
            break;
          } else {
            // Undo the swap.
            assignments[idx] = movable;
          }
        }

        if (repaired) break;
      }
    }

    if (!repaired) {
      stillUnassigned.push(booking);
    }
  }

  // ── Conflict generation ───────────────────────────────────────────────────
  const conflicts: EngineConflict[] = [];
  const zoneMap = new Map(zones.map(z => [z.zoneId, z]));

  for (const booking of stillUnassigned) {
    // Classify why the booking couldn't be assigned.
    const hasCompatibleTemp = zones.some(z => isTemperatureCompatible(booking, z));

    const compatibleZones = zones.filter(z => isTemperatureCompatible(booking, z));
    const compatibleSections = sections.filter(s => {
      const z = zoneMap.get(s.zoneId);
      return z && isTemperatureCompatible(booking, z);
    });
    const hasCapacity = compatibleSections.some(
      s => getSectionRemainingCapacity(s, assignments) > 0,
    );

    let type: EngineConflict['type'];
    let message: string;
    const suggestedActions: string[] = [];

    if (!hasCompatibleTemp) {
      type = 'TEMPERATURE_CONFLICT';
      message = `No zone has a compatible temperature for ${booking.cargoType} (range ${booking.tempMin}°C to ${booking.tempMax}°C).`;
      for (const z of zones) {
        if (z.assignedTemperature !== null) {
          const midpoint = (booking.tempMin + booking.tempMax) / 2;
          suggestedActions.push(
            `Change zone ${z.zoneId} temperature to ${midpoint}°C to accommodate this booking.`,
          );
        }
      }
    } else if (!hasCapacity) {
      type = 'CAPACITY_CONFLICT';
      message = `Compatible zones exist but all sections are full for ${booking.pallets} pallets of ${booking.cargoType}.`;
      suggestedActions.push(
        `Reduce booking quantity by ${booking.pallets - Math.max(...compatibleSections.map(s => getSectionRemainingCapacity(s, assignments)))} pallets or split to another voyage.`,
      );
    } else {
      type = 'OVERSTOW_CONFLICT';
      message = `Temperature and capacity constraints are met but overstow rules block all sections for ${booking.cargoType} (POD sequence ${booking.podSequence}).`;
      const involvedSections = compatibleSections
        .filter(s => getSectionRemainingCapacity(s, assignments) > 0)
        .map(s => s.sectionId);
      suggestedActions.push(
        `Move later-discharge cargo from section(s) [${involvedSections.join(', ')}] to free the access path.`,
      );
    }

    const involvedSections = compatibleZones.flatMap(z => z.sectionIds);

    conflicts.push({
      type,
      bookingIds: [booking.bookingId],
      sectionsInvolved: involvedSections,
      palletsAffected: booking.pallets,
      message,
      suggestedActions,
    });

    unassigned.push({ bookingId: booking.bookingId, reason: message });
  }

  return { assignments, conflicts, unassigned };
}
