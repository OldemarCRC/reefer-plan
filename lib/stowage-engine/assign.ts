// ============================================================================
// STOWAGE ENGINE — CARGO ASSIGNMENT
// Phase-based algorithm: HoldState tracking, canPlace POL/POD constraint,
// balance scoring, CargoPositionOutput generation.
// ============================================================================

import type {
  EngineInput,
  EngineZone,
  CargoAssignment,
  CargoPositionOutput,
  EngineConflict,
  EngineOutput,
  EngineBooking,
  SectionEntry,
  HoldState,
} from './types';
import { isTemperatureCompatible } from './constraints';

// ── Level ordering ────────────────────────────────────────────────────────────
// Top (most accessible for discharge) → bottom (least accessible).
const LEVEL_ORDER = ['DECK', 'UPD', 'FC', 'A', 'B', 'C', 'D', 'E'];

// Parse sectionId into hold number and level string.
// "2UPD" → { holdNumber: 2, level: "UPD" }
// "3A"   → { holdNumber: 3, level: "A" }
function parseSection(sectionId: string): { holdNumber: number; level: string } {
  const match = sectionId.match(/^(\d+)(.+)$/);
  return {
    holdNumber: match ? parseInt(match[1], 10) : 1,
    level: match ? match[2].toUpperCase() : sectionId.toUpperCase(),
  };
}

function levelIndex(level: string): number {
  const idx = LEVEL_ORDER.indexOf(level.toUpperCase());
  return idx === -1 ? LEVEL_ORDER.length : idx; // unknown → least accessible
}

// Depth ranking for score tie-breaking: higher value = deeper in hold.
// Deeper sections win ties so the engine fills bottom-up: latest-discharge cargo
// settles at the bottom and earliest-discharge cargo at the top of each hold,
// which is the correct reefer overstow practice and lets canPlace pass freely.
const LEVEL_DEPTH: Record<string, number> = { FC: 0, A: 1, B: 2, C: 3, D: 4 };

function depthRank(sectionId: string): number {
  const { level } = parseSection(sectionId);
  return LEVEL_DEPTH[level] ?? levelIndex(level);
}

// Returns sectionIds in the same hold that are ABOVE (more accessible than) sectionId.
function getLevelsAbove(sectionId: string, holdState: HoldState): string[] {
  const { holdNumber, level } = parseSection(sectionId);
  const myIdx = levelIndex(level);
  return Object.keys(holdState).filter(sid => {
    const p = parseSection(sid);
    return p.holdNumber === holdNumber && levelIndex(p.level) < myIdx;
  });
}

// Returns sectionIds in the same hold that are BELOW (less accessible than) sectionId.
function getLevelsBelow(sectionId: string, holdState: HoldState): string[] {
  const { holdNumber, level } = parseSection(sectionId);
  const myIdx = levelIndex(level);
  return Object.keys(holdState).filter(sid => {
    const p = parseSection(sid);
    return p.holdNumber === holdNumber && levelIndex(p.level) > myIdx;
  });
}

// ── POL/POD sequence constraint ───────────────────────────────────────────────
// A booking can be placed in sectionId only if:
//   1. Its podSeq is >= the highest podSeq already above it in the hold
//      (don't bury earlier-discharge cargo under later-discharge cargo)
//   2. Its podSeq is <= the lowest podSeq already below it in the hold
//      (don't cover later-discharge cargo that sits below)
//   3. Its polSeq is >= the highest polSeq already below it in the hold
//      (monotonic bottom→top loading: no retreat to an earlier port)
//   4. Its polSeq is <= the lowest polSeq already above it in the hold
//      (monotonic bottom→top loading: no advance past a later port already above)
function canPlace(
  booking: EngineBooking,
  sectionId: string,
  holdState: HoldState,
): boolean {
  const levelsAbove = getLevelsAbove(sectionId, holdState);
  const levelsBelow = getLevelsBelow(sectionId, holdState);

  const podMaxAbove = levelsAbove.reduce(
    (max, l) => Math.max(max, holdState[l].maxPodSeq), 0,
  );
  const podMinBelow = levelsBelow.reduce(
    (min, l) => Math.min(min, holdState[l].minPodSeq), Infinity,
  );
  const polMinAbove = levelsAbove.reduce(
    (min, l) => Math.min(min, holdState[l].minPolSeq), Infinity,
  );
  const polMaxBelow = levelsBelow.reduce(
    (max, l) => Math.max(max, holdState[l].maxPolSeq), 0,
  );

  return (
    booking.podSeq >= podMaxAbove &&  // don't bury earlier-discharge cargo
    booking.podSeq <= podMinBelow &&  // don't cover later-discharge cargo below
    booking.polSeq >= polMaxBelow &&  // load: monotonic fondo→tope (no retreat)
    booking.polSeq <= polMinAbove     // load: monotonic fondo→tope (no advance)
  );
}

// ── Balance scoring ───────────────────────────────────────────────────────────
// Preferred hold pair: (1+3) or (2+4) — whichever has more remaining capacity.
function getPreferredPair(holdState: HoldState): Set<number> {
  const pairRemaining = (holds: number[]) =>
    Object.values(holdState)
      .filter(s => holds.includes(parseSection(s.sectionId).holdNumber))
      .reduce((sum, s) => sum + (s.capacity - s.palletsUsed), 0);

  const cap13 = pairRemaining([1, 3]);
  const cap24 = pairRemaining([2, 4]);
  return new Set(cap13 >= cap24 ? [1, 3] : [2, 4]);
}

function sectionScore(
  sectionId: string,
  palletsUsed: number,
  capacity: number,
  preferredPair: Set<number>,
): number {
  const balanceScore = capacity > 0 ? palletsUsed / capacity : 1;
  const bonus = preferredPair.has(parseSection(sectionId).holdNumber) ? -0.2 : 0;
  return balanceScore + bonus;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function assignCargo(
  input: EngineInput,
  zones: EngineZone[],
): {
  assignments: CargoAssignment[];
  cargoPositions: CargoPositionOutput[];
  conflicts: EngineConflict[];
  unassigned: EngineOutput['unassignedBookings'];
} {
  const { sections } = input.vessel;
  const conflicts: EngineConflict[] = [];
  const unassigned: EngineOutput['unassignedBookings'] = [];

  // Zone lookup for temperature checks.
  const zoneMap = new Map(zones.map(z => [z.zoneId, z]));

  // 1. Build sorted work queue from bookings + contractEstimates.
  //    Index.ts has already enriched polSeq/podSeq on all bookings.
  //    PRIMARY:   polSeq ASC  (load from first port first)
  //    SECONDARY: podSeq DESC (furthest destination goes deepest in hold)
  //    TERTIARY:  pallets DESC (largest first to reduce fragmentation)
  const workQueue = [
    ...(input.bookings ?? []),
    ...(input.contractEstimates ?? []),
  ].sort((a, b) => {
    if (a.polSeq !== b.polSeq) return a.polSeq - b.polSeq;
    if (b.podSeq !== a.podSeq) return b.podSeq - a.podSeq;
    return b.pallets - a.pallets;
  });

  // 2. Initialise HoldState from all vessel sections.
  const holdState: HoldState = {};
  for (const section of sections) {
    holdState[section.sectionId] = {
      sectionId: section.sectionId,
      palletsUsed: 0,
      capacity: Math.floor(section.sqm / (section.designStowageFactor ?? 1.32)),
      minPolSeq: Infinity,
      maxPolSeq: 0,
      minPodSeq: Infinity,
      maxPodSeq: 0,
      entries: [],
    };
  }

  // 3. Preferred hold pair determined once at the start (full vessel capacity).
  const preferredPair = getPreferredPair(holdState);

  // 4. Main assignment loop.
  for (const booking of workQueue) {
    let palletsRemaining = booking.pallets;

    while (palletsRemaining > 0) {
      // Filter sections that pass all three gates:
      //   a) remaining capacity > 0
      //   b) temperature compatible with zone
      //   c) canPlace POL/POD constraint passes
      const candidates = sections.filter(sec => {
        const state = holdState[sec.sectionId];
        if (!state || state.capacity - state.palletsUsed <= 0) return false;
        const zone = zoneMap.get(sec.zoneId);
        if (!zone || !isTemperatureCompatible(booking, zone)) return false;
        if (!canPlace(booking, sec.sectionId, holdState)) return false;
        return true;
      });

      if (candidates.length === 0) {
        // Classify the conflict by narrowing down which constraint failed.
        const hasCompatibleTemp = zones.some(z => isTemperatureCompatible(booking, z));
        const compatibleTempSections = hasCompatibleTemp
          ? sections.filter(s => {
              const z = zoneMap.get(s.zoneId);
              return z && isTemperatureCompatible(booking, z);
            })
          : [];
        const hasCapacity = compatibleTempSections.some(s => {
          const st = holdState[s.sectionId];
          return st && st.capacity - st.palletsUsed > 0;
        });

        let type: EngineConflict['type'];
        let message: string;
        const suggestedActions: string[] = [];

        if (!hasCompatibleTemp) {
          type = 'TEMPERATURE_CONFLICT';
          message = `No zone has a compatible temperature for ${booking.cargoType} (range ${booking.tempMin}°C–${booking.tempMax}°C).`;
          suggestedActions.push(
            `Adjust a zone temperature to the range [${booking.tempMin}, ${booking.tempMax}]°C.`,
          );
        } else if (!hasCapacity) {
          type = 'CAPACITY_CONFLICT';
          message = `Compatible zones exist but all sections are full for ${palletsRemaining} pallets of ${booking.cargoType}.`;
          suggestedActions.push('Split to another voyage or reduce booking quantity.');
        } else {
          type = 'OVERSTOW_CONFLICT';
          message =
            `POL/POD sequence constraints block all sections for ${booking.cargoType}` +
            ` (POL seq ${booking.polSeq}, POD seq ${booking.podSeq}).` +
            ` ${palletsRemaining} pallets unplaced.`;
          suggestedActions.push(
            'Review loading order — cargo for this port pair cannot be placed without creating an overstow.',
          );
        }

        conflicts.push({
          type,
          bookingIds: [booking.bookingId],
          sectionsInvolved: compatibleTempSections.map(s => s.sectionId),
          palletsAffected: palletsRemaining,
          message,
          suggestedActions,
        });
        unassigned.push({ bookingId: booking.bookingId, reason: message });
        break; // stop trying to place this booking
      }

      // Score and rank candidates; pick the lowest score.
      // On score tie: prefer the deeper section (higher depthRank → bottom-up fill).
      // On depth tie: prefer the higher hold number.
      const best = candidates.reduce(
        (bestSec, sec) => {
          const state    = holdState[sec.sectionId];
          const score    = sectionScore(sec.sectionId, state.palletsUsed, state.capacity, preferredPair);
          const bestState = holdState[bestSec.sectionId];
          const bestScore = sectionScore(bestSec.sectionId, bestState.palletsUsed, bestState.capacity, preferredPair);
          if (score !== bestScore) return score < bestScore ? sec : bestSec;
          const depth    = depthRank(sec.sectionId);
          const depthBest = depthRank(bestSec.sectionId);
          if (depth !== depthBest) return depth > depthBest ? sec : bestSec;
          return parseSection(sec.sectionId).holdNumber > parseSection(bestSec.sectionId).holdNumber
            ? sec : bestSec;
        },
        candidates[0],
      );

      const bestState = holdState[best.sectionId];
      const assignable = Math.min(palletsRemaining, bestState.capacity - bestState.palletsUsed);

      // Record the entry in HoldState.
      const entry: SectionEntry = {
        bookingId: booking.bookingId,
        confidence: booking.confidence,
        polSeq: booking.polSeq,
        podSeq: booking.podSeq,
        quantity: assignable,
      };
      bestState.entries.push(entry);
      bestState.palletsUsed   += assignable;
      bestState.minPolSeq      = Math.min(bestState.minPolSeq, booking.polSeq);
      bestState.maxPolSeq      = Math.max(bestState.maxPolSeq, booking.polSeq);
      bestState.minPodSeq      = Math.min(bestState.minPodSeq, booking.podSeq);
      bestState.maxPodSeq      = Math.max(bestState.maxPodSeq, booking.podSeq);

      palletsRemaining -= assignable;
    }
  }

  // 5. Convert HoldState entries → CargoAssignment[] and CargoPositionOutput[].
  const assignments: CargoAssignment[] = [];
  const cargoPositions: CargoPositionOutput[] = [];

  for (const [sectionId, state] of Object.entries(holdState)) {
    for (const entry of state.entries) {
      const booking = workQueue.find(b => b.bookingId === entry.bookingId);
      if (!booking) continue;

      assignments.push({
        bookingId:       entry.bookingId,
        sectionId,
        palletsAssigned: entry.quantity,
        confidence:      booking.confidence,
        frozen:          booking.frozen,
      });

      cargoPositions.push({
        sectionId,
        bookingId:       booking.bookingId,
        contractId:      booking.contractId,
        contractNumber:  booking.contractNumber,
        shipperName:     booking.shipperName,
        consigneeName:   booking.consigneeName,
        snapshotQuantity: entry.quantity,
        confidence:      booking.confidence,
        polPortCode:     booking.polPortCode,
        podPortCode:     booking.podPortCode,
        polSeq:          entry.polSeq,
        podSeq:          entry.podSeq,
      });
    }
  }

  return { assignments, cargoPositions, conflicts, unassigned };
}
