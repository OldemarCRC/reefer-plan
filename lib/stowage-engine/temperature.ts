// ============================================================================
// STOWAGE ENGINE — ZONE TEMPERATURE INITIALISATION
// ============================================================================

import type { EngineInput, EngineZone } from './types';

// ----------------------------------------------------------------------------
// Cargo temperature ranges (°C).
// Group: bookings whose ranges overlap can share a zone.
// ----------------------------------------------------------------------------

const CARGO_TEMP_RANGES: Record<string, { min: number; max: number }> = {
  BANANAS:          { min: 12,    max: 14   },
  ORGANIC_BANANAS:  { min: 12,    max: 14   },
  PLANTAINS:        { min: 12,    max: 14   },
  FROZEN_FISH:      { min: -25,   max: -18  },
  OTHER_FROZEN:     { min: -25,   max: -18  },
  TABLE_GRAPES:     { min: -0.5,  max: 0.5  },
  BERRIES:          { min: -0.5,  max: 1.0  },
  CHERRIES:         { min: -0.5,  max: 0.5  },
  BLUEBERRIES:      { min: -0.5,  max: 1.0  },
  CITRUS:           { min: 4,     max: 10   },
  AVOCADOS:         { min: 5,     max: 8    },
  PINEAPPLES:       { min: 7,     max: 10   },
  PAPAYA:           { min: 7,     max: 10   },
  MANGOES:          { min: 7,     max: 10   },
  KIWIS:            { min: -0.5,  max: 1    },
  APPLES:           { min: -0.5,  max: 4    },
  PEARS:            { min: -0.5,  max: 4    },
  PLUMS:            { min: 0.0,   max: 2.0  },
  PEACHES:          { min: -0.5,  max: 2    },
  OTHER_CHILLED:    { min: 2,     max: 6    },
};

export function getTempRange(cargoType: string): { min: number; max: number } {
  return CARGO_TEMP_RANGES[cargoType] ?? { min: 0, max: 4 };
}

// Returns true if the two temperature ranges overlap.
function rangesOverlap(
  a: { min: number; max: number },
  b: { min: number; max: number },
): boolean {
  return a.min <= b.max && b.min <= a.max;
}

// Midpoint of a range, rounded to 1 decimal place.
function rangeMidpoint(r: { min: number; max: number }): number {
  return Math.round(((r.min + r.max) / 2) * 10) / 10;
}

// Group bookings by compatible temperature (bookings whose ranges overlap
// with any member of a group join that group).
interface CargoGroup {
  range: { min: number; max: number };
  totalPallets: number;
  bookingIds: string[];
}

function groupByTemperature(
  bookings: EngineInput['bookings'],
): CargoGroup[] {
  const groups: CargoGroup[] = [];

  for (const b of bookings) {
    const range = { min: b.tempMin, max: b.tempMax };
    const match = groups.find(g => rangesOverlap(g.range, range));
    if (match) {
      // Narrow the group range to the intersection so later bookings must
      // also fit within it.
      match.range = {
        min: Math.max(match.range.min, range.min),
        max: Math.min(match.range.max, range.max),
      };
      match.totalPallets += b.pallets;
      match.bookingIds.push(b.bookingId);
    } else {
      groups.push({ range, totalPallets: b.pallets, bookingIds: [b.bookingId] });
    }
  }

  return groups.sort((a, b) => b.totalPallets - a.totalPallets); // majority first
}

// Return a Map from holdNumber → total sqm of all sections in that hold.
function holdSqmMap(sections: EngineInput['vessel']['sections']): Map<number, number> {
  const map = new Map<number, number>();
  for (const s of sections) {
    map.set(s.holdNumber, (map.get(s.holdNumber) ?? 0) + s.sqm);
  }
  return map;
}

// Return the primary holdNumber for a zone (from its first section).
function holdForZone(
  zone: EngineZone,
  sections: EngineInput['vessel']['sections'],
): number {
  const sec = sections.find(s => s.sectionId === zone.sectionIds[0]);
  return sec?.holdNumber ?? 1;
}

// ----------------------------------------------------------------------------
// Main export
// ----------------------------------------------------------------------------

export function initializeZoneTemperatures(input: EngineInput): EngineZone[] {
  const zones: EngineZone[] = input.vessel.zones.map(z => ({ ...z }));
  const { sections, } = input.vessel;

  // 1. Planner overrides — highest priority.
  if (input.plannerOverrides) {
    for (const z of zones) {
      if (z.zoneId in input.plannerOverrides) {
        z.assignedTemperature = input.plannerOverrides[z.zoneId];
        z.source = 'PLANNER_OVERRIDE';
      }
    }
  }

  // 2. Inherited temperatures from previous plan.
  if (input.previousZoneTemps) {
    for (const z of zones) {
      if (z.source !== null) continue; // already set by override
      if (z.zoneId in input.previousZoneTemps) {
        z.assignedTemperature = input.previousZoneTemps[z.zoneId];
        z.source = 'INHERITED';
      }
    }
  }

  // Check if all zones are already assigned.
  const unassigned = zones.filter(z => z.source === null);
  if (unassigned.length === 0) return zones;

  // 3. Majority-rule for first voyage on this service.
  if (input.bookings.length === 0) return zones; // no bookings → leave null

  const groups = groupByTemperature(input.bookings);
  const sqmByHold = holdSqmMap(sections);

  // Identify which holds are available for unassigned zones.
  const unassignedHolds = new Set(
    unassigned.map(z => holdForZone(z, sections)),
  );

  // Non-adjacent hold pairs among the unassigned holds.
  // Canonical pairs: (1+3) and (2+4). Take whichever pair is fully unassigned.
  const pairCandidates: number[][] = [[1, 3], [2, 4]];
  const availablePairs = pairCandidates.filter(pair =>
    pair.every(h => unassignedHolds.has(h)),
  );

  if (availablePairs.length === 0) {
    // Fallback: all unassigned holds as individual groups.
    const holdsArr = [...unassignedHolds].sort((a, b) => {
      const sqmA = sqmByHold.get(a) ?? 0;
      const sqmB = sqmByHold.get(b) ?? 0;
      return sqmB - sqmA; // largest first
    });
    assignGroupsToHolds(zones, groups, holdsArr, sections);
    return zones;
  }

  // Find the larger pair by combined sqm.
  const pairSqm = (pair: number[]) =>
    pair.reduce((sum, h) => sum + (sqmByHold.get(h) ?? 0), 0);

  const sortedPairs = availablePairs.sort((a, b) => pairSqm(b) - pairSqm(a));
  const largerPair = sortedPairs[0];

  // Majority group → larger pair; remaining groups → other unassigned holds.
  const majorityGroup = groups[0];
  const majorityTemp = rangeMidpoint(majorityGroup.range);

  for (const z of zones) {
    if (z.source !== null) continue;
    if (largerPair.includes(holdForZone(z, sections))) {
      z.assignedTemperature = majorityTemp;
      z.source = 'MAJORITY_RULE';
    }
  }

  // Remaining groups → remaining unassigned holds, sorted by sqm desc.
  const remainingHolds = [...unassignedHolds]
    .filter(h => !largerPair.includes(h))
    .sort((a, b) => (sqmByHold.get(b) ?? 0) - (sqmByHold.get(a) ?? 0));

  const remainingGroups = groups.slice(1);
  assignGroupsToHolds(zones, remainingGroups, remainingHolds, sections);

  return zones;
}

function assignGroupsToHolds(
  zones: EngineZone[],
  groups: CargoGroup[],
  holds: number[],
  sections: EngineInput['vessel']['sections'],
): void {
  for (let i = 0; i < holds.length; i++) {
    const hold = holds[i];
    const group = groups[i]; // may be undefined if more holds than groups
    if (!group) break;

    const temp = rangeMidpoint(group.range);
    for (const z of zones) {
      if (z.source !== null) continue;
      if (holdForZone(z, sections) === hold) {
        z.assignedTemperature = temp;
        z.source = 'MAJORITY_RULE';
      }
    }
  }
}
