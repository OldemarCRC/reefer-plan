// ============================================================================
// STOWAGE ENGINE — ENTRY POINT
// ============================================================================

import type { EngineInput, EngineOutput, EngineConflict } from './types';
import { initializeZoneTemperatures } from './temperature';
import { assignCargo } from './assign';
import { calculateStability } from './stability';

export { initializeZoneTemperatures } from './temperature';
export { assignCargo } from './assign';
export { calculateStability } from './stability';
export * from './types';

export function generateStowagePlan(input: EngineInput): EngineOutput {
  // 1. Initialise zone temperatures (overrides → inherited → majority rule).
  const zoneTemps = initializeZoneTemperatures(input);

  // 2. Assign cargo to sections.
  const { assignments, conflicts, unassigned } = assignCargo(input, zoneTemps);

  // 3. Derive port sequences from bookings (unique POD sequences, sorted).
  const portSequences = [
    ...new Set(input.bookings.map(b => b.podSequence)),
  ].sort((a, b) => a - b);

  // 4. Calculate stability snapshot at each discharge port.
  const stabilityByPort = calculateStability(
    input.vessel.sections,
    assignments,
    input.bookings,
    portSequences,
  );

  // 5. Append STABILITY_WARNING conflicts for any RED indicators.
  const stabilityConflicts: EngineConflict[] = stabilityByPort
    .filter(s => s.status === 'RED')
    .map(s => ({
      type: 'STABILITY_WARNING' as const,
      bookingIds: [],
      sectionsInvolved: [],
      palletsAffected: 0,
      message: `Stability RED at port sequence ${s.portSequence}: trimIndex=${s.trimIndex}, listIndex=${s.listIndex}.`,
      suggestedActions: [
        'Redistribute cargo between fore and aft holds to improve trim balance.',
      ],
    }));

  return {
    assignments,
    zoneTemps,
    conflicts: [...conflicts, ...stabilityConflicts],
    stabilityByPort,
    unassignedBookings: unassigned,
  };
}
