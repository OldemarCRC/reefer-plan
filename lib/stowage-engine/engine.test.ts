// ============================================================================
// STOWAGE ENGINE — SELF-CONTAINED TEST
// Uses Node's built-in assert module. No Jest, no external dependencies.
// Run: npx tsx lib/stowage-engine/engine.test.ts
//
// Vessel: ACONCAGUA BAY (T1 type, 4 holds, 8 zones, 19 sections)
// Data source: docs/PROJECT_CONTEXT.md
// Formula: maxPallets = Math.floor(sqm * designStowageFactor)
// ============================================================================

import assert from 'node:assert/strict';
import { generateStowagePlan } from './index';
import type { EngineInput, EngineSection, EngineZone } from './types';

// ----------------------------------------------------------------------------
// ACONCAGUA BAY section data (sqm from PROJECT_CONTEXT.md, dsf = 1.32)
// ----------------------------------------------------------------------------

const DSF = 1.32;

function makeSection(
  sectionId: string,
  zoneId: string,
  sqm: number,
  holdNumber: number,
): EngineSection {
  // Approximate longitudinal arms by hold (metres from midship, +fwd/-aft)
  const ARM: Record<number, number> = { 1: 60, 2: 20, 3: -20, 4: -60 };
  return {
    sectionId,
    zoneId,
    sqm,
    designStowageFactor: DSF,
    maxPallets: Math.floor(sqm * DSF),
    holdNumber,
    longitudinalArm: ARM[holdNumber] ?? 0,
    transverseArm: 0,
    assignedTemperature: null,
  };
}

const sections: EngineSection[] = [
  // Hold 1 — zones 1AB and 1CD
  makeSection('1A', '1AB', 363.8, 1),   // 480 plt
  makeSection('1B', '1AB', 210.8, 1),   // 278 plt
  makeSection('1C', '1CD', 145.4, 1),   // 191 plt
  makeSection('1D', '1CD', 141.5, 1),   // 186 plt

  // Hold 2 — zones 2UPDAB and 2CD
  makeSection('2UPD', '2UPDAB', 108.7, 2),  // 143 plt
  makeSection('2A',   '2UPDAB', 428.6, 2),  // 565 plt
  makeSection('2B',   '2UPDAB', 378.2, 2),  // 499 plt
  makeSection('2C',   '2CD',    367.6, 2),  // 485 plt
  makeSection('2D',   '2CD',    284.6, 2),  // 375 plt

  // Hold 3 — zones 3UPDAB and 3CD
  makeSection('3UPD', '3UPDAB', 103.4, 3),  // 136 plt
  makeSection('3A',   '3UPDAB', 458.3, 3),  // 604 plt
  makeSection('3B',   '3UPDAB', 437.2, 3),  // 577 plt
  makeSection('3C',   '3CD',    461.2, 3),  // 608 plt
  makeSection('3D',   '3CD',    411.9, 3),  // 543 plt

  // Hold 4 — zones 4UPDAB and 4CD
  makeSection('4UPD', '4UPDAB', 103.3, 4),  // 136 plt
  makeSection('4A',   '4UPDAB', 442.0, 4),  // 583 plt
  makeSection('4B',   '4UPDAB', 412.2, 4),  // 544 plt
  makeSection('4C',   '4CD',    381.0, 4),  // 502 plt
  makeSection('4D',   '4CD',    254.8, 4),  // 336 plt
];

const zones: EngineZone[] = [
  { zoneId: '1AB',    sectionIds: ['1A', '1B'],              assignedTemperature: null, source: null },
  { zoneId: '1CD',    sectionIds: ['1C', '1D'],              assignedTemperature: null, source: null },
  { zoneId: '2UPDAB', sectionIds: ['2UPD', '2A', '2B'],      assignedTemperature: null, source: null },
  { zoneId: '2CD',    sectionIds: ['2C', '2D'],              assignedTemperature: null, source: null },
  { zoneId: '3UPDAB', sectionIds: ['3UPD', '3A', '3B'],      assignedTemperature: null, source: null },
  { zoneId: '3CD',    sectionIds: ['3C', '3D'],              assignedTemperature: null, source: null },
  { zoneId: '4UPDAB', sectionIds: ['4UPD', '4A', '4B'],      assignedTemperature: null, source: null },
  { zoneId: '4CD',    sectionIds: ['4C', '4D'],              assignedTemperature: null, source: null },
];

// ----------------------------------------------------------------------------
// Test input: 3 sample bookings with distinct temperature requirements
// ----------------------------------------------------------------------------

const input: EngineInput = {
  vessel: { sections, zones },
  phase: 'ESTIMATED',
  bookings: [
    {
      bookingId: 'B001',
      cargoType: 'BANANAS',
      tempMin: 12,
      tempMax: 14,
      pallets: 480,
      polSequence: 1,
      podSequence: 3,
      shipperId: 'S001',
      consigneeCode: 'C001',
      confidence: 'ESTIMATED',
      frozen: false,
    },
    {
      bookingId: 'B002',
      cargoType: 'FROZEN_FISH',
      tempMin: -25,
      tempMax: -18,
      pallets: 275,
      polSequence: 1,
      podSequence: 4,
      shipperId: 'S002',
      consigneeCode: 'C002',
      confidence: 'ESTIMATED',
      frozen: false,
    },
    {
      bookingId: 'B003',
      cargoType: 'TABLE_GRAPES',
      tempMin: -0.5,
      tempMax: 0.5,
      pallets: 191,
      polSequence: 1,
      podSequence: 3,
      shipperId: 'S003',
      consigneeCode: 'C003',
      confidence: 'ESTIMATED',
      frozen: false,
    },
  ],
};

// ----------------------------------------------------------------------------
// Run engine
// ----------------------------------------------------------------------------

console.log('Running stowage engine test with ACONCAGUA BAY...\n');
const output = generateStowagePlan(input);

// ----------------------------------------------------------------------------
// Assertions
// ----------------------------------------------------------------------------

// 1. All bookings should be assigned (no conflicts expected with this cargo).
assert.equal(
  output.unassignedBookings.length,
  0,
  `Expected 0 unassigned bookings, got ${output.unassignedBookings.length}: ${
    output.unassignedBookings.map(u => `${u.bookingId}: ${u.reason}`).join('; ')
  }`,
);

// 2. Total pallets assigned must equal total input pallets (480+275+191 = 946).
const totalAssigned = output.assignments.reduce((s, a) => s + a.palletsAssigned, 0);
assert.equal(totalAssigned, 946, `Expected 946 pallets assigned, got ${totalAssigned}`);

// 3. Each booking must have at least one assignment.
for (const b of input.bookings) {
  const bookingAssignments = output.assignments.filter(a => a.bookingId === b.bookingId);
  assert.ok(
    bookingAssignments.length > 0,
    `Booking ${b.bookingId} (${b.cargoType}) has no assignment`,
  );
  const assignedPallets = bookingAssignments.reduce((s, a) => s + a.palletsAssigned, 0);
  assert.equal(
    assignedPallets,
    b.pallets,
    `Booking ${b.bookingId}: expected ${b.pallets} pallets, got ${assignedPallets}`,
  );
}

// 4. Zone temperature assignments: hold 2+4 should get BANANAS temp (+13°C),
//    hold 3 should get FROZEN_FISH temp (-21.5°C),
//    hold 1 should get TABLE_GRAPES temp (0°C).
const zoneTempMap = new Map(output.zoneTemps.map(z => [z.zoneId, z]));

const hold2zones = ['2UPDAB', '2CD'];
const hold4zones = ['4UPDAB', '4CD'];
const hold1zones = ['1AB', '1CD'];
const hold3zones = ['3UPDAB', '3CD'];

for (const zid of [...hold2zones, ...hold4zones]) {
  const z = zoneTempMap.get(zid)!;
  assert.equal(z.source, 'MAJORITY_RULE', `Zone ${zid} expected MAJORITY_RULE source`);
  assert.ok(
    z.assignedTemperature !== null &&
    z.assignedTemperature >= 12 &&
    z.assignedTemperature <= 14,
    `Zone ${zid}: expected temperature in BANANAS range [12,14], got ${z.assignedTemperature}`,
  );
}

for (const zid of hold3zones) {
  const z = zoneTempMap.get(zid)!;
  assert.ok(
    z.assignedTemperature !== null &&
    z.assignedTemperature >= -25 &&
    z.assignedTemperature <= -18,
    `Zone ${zid}: expected temperature in FROZEN_FISH range [-25,-18], got ${z.assignedTemperature}`,
  );
}

for (const zid of hold1zones) {
  const z = zoneTempMap.get(zid)!;
  assert.ok(
    z.assignedTemperature !== null &&
    z.assignedTemperature >= -0.5 &&
    z.assignedTemperature <= 0.5,
    `Zone ${zid}: expected temperature in TABLE_GRAPES range [-0.5,0.5], got ${z.assignedTemperature}`,
  );
}

// 5. Each assignment section must be in the correct hold for its cargo type.
const sectionMap = new Map(sections.map(s => [s.sectionId, s]));
for (const a of output.assignments) {
  const booking = input.bookings.find(b => b.bookingId === a.bookingId)!;
  const sec = sectionMap.get(a.sectionId)!;
  const zone = zoneTempMap.get(sec.zoneId)!;
  assert.ok(
    zone.assignedTemperature !== null &&
    zone.assignedTemperature >= booking.tempMin &&
    zone.assignedTemperature <= booking.tempMax,
    `Assignment ${a.bookingId}→${a.sectionId}: zone temp ${zone.assignedTemperature} not in [${booking.tempMin},${booking.tempMax}]`,
  );
}

// 6. No overstow violations — FROZEN_FISH (POD 4) and BANANAS/TABLE_GRAPES (POD 3)
//    should be in separate holds so no cross-hold overstow issues arise.
const b002Sections = output.assignments
  .filter(a => a.bookingId === 'B002')
  .map(a => sectionMap.get(a.sectionId)!.holdNumber);
const b001Sections = output.assignments
  .filter(a => a.bookingId === 'B001')
  .map(a => sectionMap.get(a.sectionId)!.holdNumber);
const commonHolds = b002Sections.filter(h => b001Sections.includes(h));
assert.equal(
  commonHolds.length,
  0,
  `FROZEN_FISH (POD 4) and BANANAS (POD 3) share hold(s): ${commonHolds} — overstow risk`,
);

// 7. No conflicts expected for this compatible input.
const hardConflicts = output.conflicts.filter(c => c.type !== 'STABILITY_WARNING');
assert.equal(
  hardConflicts.length,
  0,
  `Unexpected conflicts: ${hardConflicts.map(c => c.message).join('; ')}`,
);

// 8. Stability indicators should be present and GREEN for this balanced load.
assert.ok(output.stabilityByPort.length > 0, 'Expected stability indicators');
for (const s of output.stabilityByPort) {
  assert.ok(
    ['GREEN', 'YELLOW', 'RED'].includes(s.status),
    `Invalid stability status: ${s.status}`,
  );
}

// ----------------------------------------------------------------------------
// Results summary
// ----------------------------------------------------------------------------

console.log('✓ All assertions passed\n');

console.log('Zone temperatures (MAJORITY_RULE):');
for (const z of output.zoneTemps) {
  console.log(`  ${z.zoneId.padEnd(10)} ${z.assignedTemperature?.toFixed(1).padStart(6)}°C  [${z.source}]`);
}

console.log('\nCargo assignments:');
for (const a of output.assignments) {
  const booking = input.bookings.find(b => b.bookingId === a.bookingId)!;
  const sec = sectionMap.get(a.sectionId)!;
  const zone = zoneTempMap.get(sec.zoneId)!;
  console.log(
    `  ${a.bookingId} (${booking.cargoType.padEnd(12)}) → section ${a.sectionId.padEnd(5)}` +
    ` zone ${sec.zoneId.padEnd(10)} ${zone.assignedTemperature?.toFixed(1).padStart(6)}°C` +
    `  ${a.palletsAssigned} pallets`,
  );
}

console.log('\nStability by discharge port:');
for (const s of output.stabilityByPort) {
  console.log(
    `  Port seq ${s.portSequence}: trim=${s.trimIndex.toFixed(4)}  list=${s.listIndex.toFixed(4)}  [${s.status}]`,
  );
}

console.log(`\nUnassigned bookings: ${output.unassignedBookings.length}`);
console.log(`Hard conflicts:      ${hardConflicts.length}`);
console.log(`Total pallets assigned: ${totalAssigned} / 946\n`);
