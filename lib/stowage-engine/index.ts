// ============================================================================
// STOWAGE ENGINE — ENTRY POINT
// ============================================================================

import type {
  EngineInput,
  EngineOutput,
  EngineConflict,
  EngineBooking,
} from './types';
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

  // 2. Enrich all bookings with polSeq and podSeq from portSequence.
  //    Mutates the booking objects so assignCargo sees the updated values.
  const { polPorts, podPorts } = input.portSequence ?? { polPorts: [], podPorts: [] };

  const allBookings: EngineBooking[] = [
    ...(input.bookings ?? []),
    ...(input.contractEstimates ?? []),
  ];

  for (const b of allBookings) {
    b.polSeq = polPorts.find(p => p.portCode === b.polPortCode)?.seq ?? b.polSeq ?? 1;
    b.podSeq = podPorts.find(p => p.portCode === b.podPortCode)?.seq ?? b.podSeq ?? 1;
  }

  // 3. Assign cargo to sections.
  //    assignCargo builds the sorted work queue internally from
  //    input.bookings + input.contractEstimates (already enriched above).
  const { assignments, cargoPositions, conflicts, unassigned } = assignCargo(input, zoneTemps);

  // 4. Build portSequences for stability from unique podSeq values.
  const portSequences = [...new Set(allBookings.map(b => b.podSeq))].sort((a, b) => a - b);

  // 5. Build portSequenceToCode map.
  //    Primary source: podPorts from portSequence (seq → portCode).
  //    Fallback: legacy portCalls for backward compatibility.
  const portSequenceToCode = new Map<number, string>(
    podPorts.map(p => [p.seq, p.portCode]),
  );
  for (const pc of input.portCalls ?? []) {
    if (!portSequenceToCode.has(pc.sequence)) {
      portSequenceToCode.set(pc.sequence, pc.portCode);
    }
  }

  // 6. Calculate stability snapshot at each discharge port.
  //    stability.ts filters by b.podSequence, so map podSeq → podSequence
  //    on a shallow copy to avoid mutating the originals.
  const stabilityBookings = allBookings.map(b => ({ ...b, podSequence: b.podSeq }));

  const stabilityByPort = calculateStability(
    input.vessel.sections,
    assignments,
    stabilityBookings,
    portSequences,
    portSequenceToCode,
  );

  // 7. Append STABILITY_WARNING conflicts for any RED indicators.
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

  // 8. Compute estimateStats from cargoPositions.
  const estimateStats = {
    totalContractEstimates: cargoPositions.filter(p => p.confidence === 'CONTRACT_ESTIMATE').length,
    totalBookingEstimates:  cargoPositions.filter(p => p.confidence === 'ESTIMATED').length,
    totalConfirmed:         cargoPositions.filter(p => p.confidence === 'CONFIRMED').length,
  };

  return {
    assignments,
    zoneTemps,
    conflicts: [...conflicts, ...stabilityConflicts],
    stabilityByPort,
    unassignedBookings: unassigned,
    estimateStats,
  };
}
