// scripts/diagnose-plan.ts
// Runs the stowage engine on the Baltic Klipper voyage, saves the result to DB,
// then prints the same diagnostic output as the original script.
import mongoose from 'mongoose';
import connectDB from '../lib/db/connect';
import { generateStowagePlan } from '../lib/stowage-engine/index';
import { getTempRange } from '../lib/stowage-engine/temperature';
import type {
  EngineInput,
  EngineSection,
  EngineZone,
  EngineBooking,
} from '../lib/stowage-engine/types';

// ── Helpers (mirrors autoGenerateSinglePlan internals) ────────────────────────

const HOLD_LONGITUDINAL_ARM: Record<number, number> = { 1: 60, 2: 20, 3: -20, 4: -60 };

function buildEngineSections(vessel: any): EngineSection[] {
  const sections: EngineSection[] = [];
  for (const zone of vessel.temperatureZones ?? []) {
    for (const cs of zone.coolingSections ?? []) {
      const holdNumber = parseInt(String(cs.sectionId).charAt(0), 10) || 1;
      const dsf = cs.designStowageFactor ?? 1.32;
      sections.push({
        sectionId:           cs.sectionId,
        zoneId:              zone.zoneId,
        sqm:                 cs.sqm,
        designStowageFactor: dsf,
        maxPallets:          Math.floor(cs.sqm * dsf),
        holdNumber,
        longitudinalArm:     HOLD_LONGITUDINAL_ARM[holdNumber] ?? 0,
        transverseArm:       0,
        assignedTemperature: null,
      });
    }
  }
  return sections;
}

function buildEngineZones(vessel: any): EngineZone[] {
  return (vessel.temperatureZones ?? []).map((zone: any): EngineZone => ({
    zoneId:              zone.zoneId,
    sectionIds:          (zone.coolingSections ?? []).map((s: any) => s.sectionId as string),
    assignedTemperature: null,
    source:              null,
  }));
}

function buildEngineBookings(bookings: any[], voyage: any): EngineBooking[] {
  const portCallMap = new Map<string, number>(
    (voyage.portCalls ?? []).map((pc: any) => [pc.portCode as string, pc.sequence as number]),
  );
  const result: EngineBooking[] = [];
  for (const b of bookings) {
    const polSeq = portCallMap.get(b.pol?.portCode);
    const podSeq = portCallMap.get(b.pod?.portCode);
    if (polSeq === undefined || podSeq === undefined) continue;
    const tempRange = getTempRange(b.cargoType ?? '');
    const confirmed = (b.confirmedQuantity ?? 0) > 0;
    const pallets   = confirmed ? b.confirmedQuantity : b.requestedQuantity;
    result.push({
      bookingId:    b._id.toString(),
      cargoType:    b.cargoType ?? 'OTHER_CHILLED',
      tempMin:      tempRange.min,
      tempMax:      tempRange.max,
      pallets,
      polPortCode:  b.pol?.portCode ?? '',
      podPortCode:  b.pod?.portCode ?? '',
      polSeq,
      podSeq,
      polSequence:  polSeq,
      podSequence:  podSeq,
      shipperId:    b.shipperId?.toString() ?? b.shipper?.code ?? '',
      consigneeCode: b.consignee?.code ?? '',
      confidence:   confirmed ? 'CONFIRMED' : 'ESTIMATED',
      frozen:       confirmed,
    });
  }
  return result;
}

function mapEngineOutputToDocument(
  engineOutput: ReturnType<typeof generateStowagePlan>,
  bookingMeta: any[],
) {
  const bookingMap = new Map(bookingMeta.map((b: any) => [b._id.toString(), b]));

  const cpLookup = new Map<string, any>();
  for (const cp of (engineOutput as any).cargoPositions ?? []) {
    const key = `${cp.bookingId ?? ''}::${cp.sectionId}`;
    cpLookup.set(key, cp);
  }

  const cargoPositions = engineOutput.assignments.map(a => {
    const bk = bookingMap.get(a.bookingId);
    const holdNumber = parseInt(String(a.sectionId).charAt(0), 10) || 1;
    const level = String(a.sectionId).slice(1);
    const polPortCode = (bk as any)?.pol?.portCode ?? (bk as any)?.polPortCode ?? undefined;
    const podPortCode = (bk as any)?.pod?.portCode ?? (bk as any)?.podPortCode ?? undefined;
    const cpKey = `${a.bookingId}::${a.sectionId}`;
    const cpSnap = cpLookup.get(cpKey);
    const confidence: string = (bk as any)?.confidence
      ?? (a.bookingId?.startsWith('FORECAST-') ? 'ESTIMATED'
        : a.bookingId?.startsWith('CONTRACT-ESTIMATE-') ? 'CONTRACT_ESTIMATE'
        : 'CONFIRMED');
    return {
      bookingId:        a.bookingId,
      cargoType:        bk?.cargoType ?? cpSnap?.cargoType ?? undefined,
      shipperName:      (bk as any)?.shipperName ?? cpSnap?.shipperName ?? undefined,
      consigneeName:    (bk as any)?.consignee?.name ?? (bk as any)?.consigneeName ?? cpSnap?.consigneeName ?? undefined,
      polPortCode,
      podPortCode,
      quantity:         a.palletsAssigned,
      snapshotQuantity: cpSnap?.snapshotQuantity ?? a.palletsAssigned,
      confidence,
      polSeq:           (bk as any)?.polSeq ?? cpSnap?.polSeq ?? 0,
      podSeq:           (bk as any)?.podSeq ?? cpSnap?.podSeq ?? 0,
      compartment:      { id: a.sectionId, holdNumber, level },
    };
  });

  const coolingSectionStatus = engineOutput.zoneTemps.map(z => ({
    zoneId:              z.zoneId,
    coolingSectionIds:   z.sectionIds,
    assignedTemperature: z.assignedTemperature ?? undefined,
    locked:              false,
    temperatureSource:   z.source ?? undefined,
  }));

  const hasHardConflict = engineOutput.conflicts.some(
    c => c.type === 'TEMPERATURE_CONFLICT' || c.type === 'OVERSTOW_CONFLICT',
  );

  return { cargoPositions, coolingSectionStatus, hasHardConflict };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function diagnose() {
  await connectDB();
  const db = mongoose.connection.db!;

  // ── 1. Find most recent plan (any vessel), or fall back to first bookable voyage ──
  let plan = await db.collection('stowageplans').findOne(
    {},
    { sort: { createdAt: -1 } },
  );

  let voyage: any;
  let planId: any;

  if (plan) {
    console.log('\n=== RE-RUNNING ENGINE for PLAN:', plan.planNumber, '===');
    voyage = await db.collection('voyages').findOne({ _id: plan.voyageId });
    if (!voyage) { console.log('Voyage not found'); process.exit(1); }
    planId = plan._id;
  } else {
    // No plans exist — find a voyage that has bookings and create a skeleton plan
    console.log('\n=== No plans found — searching for a voyage with bookings ===');
    const allVoyages = await db.collection('voyages').find({}).toArray();
    for (const v of allVoyages) {
      const bkCount = await db.collection('bookings').countDocuments({ voyageId: v._id });
      if (bkCount > 0) { voyage = v; break; }
    }
    if (!voyage) { console.log('No voyage with bookings found'); process.exit(1); }

    const skeletonVessel = await db.collection('vessels').findOne({ _id: voyage.vesselId });
    const now = new Date();
    const insertResult = await db.collection('stowageplans').insertOne({
      voyageId:    voyage._id,
      vesselName:  skeletonVessel?.name ?? 'Unknown',
      planNumber:  `DIAG-${Date.now()}`,
      status:      'DRAFT',
      generationMethod: 'AUTO',
      cargoPositions:   [],
      coolingSectionStatus: [],
      conflicts:        [],
      createdAt:   now,
      updatedAt:   now,
    });
    planId = insertResult.insertedId;
    plan = { _id: planId, planNumber: `DIAG-${Date.now()}`, voyageId: voyage._id };
    console.log('Created skeleton plan:', planId);
  }

  console.log('\n=== VOYAGE:', voyage.voyageNumber, '===');
  console.log('Voyage:', voyage.voyageNumber, '· portCalls:',
    (voyage.portCalls ?? []).map((pc: any) => `${pc.portCode}(seq=${pc.sequence})`).join(', '));

  // ── 3. Load vessel ────────────────────────────────────────────────────────
  const vessel = await db.collection('vessels').findOne({ _id: voyage.vesselId });
  if (!vessel) { console.log('Vessel not found'); process.exit(1); }
  console.log('Vessel:', vessel.name);

  // ── 4. Load bookings ──────────────────────────────────────────────────────
  const bookings = await db.collection('bookings').find({
    voyageId: voyage._id,
    status: { $in: ['CONFIRMED', 'PARTIAL', 'PENDING'] },
  }).toArray();
  console.log('Bookings loaded:', bookings.length);

  // ── 5. Load SpaceForecasts ────────────────────────────────────────────────
  const activeForecasts = await db.collection('spaceforecasts').find({
    voyageId: voyage._id,
    planImpact: { $in: ['PENDING_REVIEW', 'INCORPORATED'] },
  }).toArray();
  console.log('Active forecasts loaded:', activeForecasts.length);

  const forecastByPair = new Map<string, any>();
  for (const fc of activeForecasts) {
    const key = `${fc.shipperId?.toString() ?? ''}:${fc.contractId?.toString() ?? ''}`;
    forecastByPair.set(key, fc);
  }

  // ── 6. Load active contracts for this service ─────────────────────────────
  const activeContracts = voyage.serviceId
    ? await db.collection('contracts').find({ serviceId: voyage.serviceId, active: true }).toArray()
    : [];
  console.log('Active contracts loaded:', activeContracts.length);

  // ── 7. Build forecastBookings + contractDefaultEstimates ──────────────────
  const portCallMap = new Map<string, number>(
    (voyage.portCalls ?? []).map((pc: any) => [pc.portCode as string, pc.sequence as number]),
  );

  const contractCoverageMap = new Map<string, Set<string> | 'ALL'>();
  for (const b of bookings) {
    const cid = b.contractId?.toString();
    if (!cid) continue;
    const sid = b.shipperId?.toString();
    if (!sid) {
      contractCoverageMap.set(cid, 'ALL');
    } else if (contractCoverageMap.get(cid) !== 'ALL') {
      if (!contractCoverageMap.has(cid)) contractCoverageMap.set(cid, new Set());
      (contractCoverageMap.get(cid) as Set<string>).add(sid);
    }
  }

  const forecastBookings: EngineBooking[] = [];
  const contractDefaultEstimates: EngineBooking[] = [];

  for (const contract of activeContracts as any[]) {
    const contractId = contract._id.toString();
    const polCode: string = contract.originPort?.portCode;
    const podCode: string = contract.destinationPort?.portCode;
    const polSeq = portCallMap.get(polCode);
    const podSeq = portCallMap.get(podCode);
    if (polSeq === undefined || podSeq === undefined) continue;

    const counterparties: any[] = contract.counterparties ?? [];

    if (counterparties.length > 0) {
      for (let i = 0; i < counterparties.length; i++) {
        const cp = counterparties[i];
        if (!cp.active) continue;
        const shipperId = cp.shipperId?.toString() ?? '';
        const coverage = contractCoverageMap.get(contractId);
        if (coverage === 'ALL') continue;
        if (coverage instanceof Set && coverage.has(shipperId)) continue;

        const pairKey = `${shipperId}:${contractId}`;
        const forecast = forecastByPair.get(pairKey);

        if (forecast?.source === 'NO_CARGO') continue;

        if (forecast && (forecast.source === 'SHIPPER_PORTAL' || forecast.source === 'PLANNER_ENTRY')) {
          const pallets: number = forecast.estimatedPallets;
          const cargoType: string = forecast.cargoType ?? (cp.cargoTypes ?? [])[0] ?? contract.cargoType ?? 'OTHER_CHILLED';
          const tempRange = getTempRange(cargoType);
          forecastBookings.push({
            bookingId:    `FORECAST-${(forecast as any)._id.toString()}`,
            cargoType,
            tempMin:      tempRange.min,
            tempMax:      tempRange.max,
            pallets,
            polPortCode:  polCode,
            podPortCode:  podCode,
            polSeq,
            podSeq,
            polSequence:  polSeq,
            podSequence:  podSeq,
            shipperId,
            consigneeCode: (forecast as any).consigneeCode ?? '',
            consigneeName: (forecast as any).consigneeName ?? '',
            confidence:   'ESTIMATED',
            contractId,
            shipperName:  cp.shipperName ?? '',
            frozen:       false,
          });
          continue;
        }

        // CONTRACT_DEFAULT
        const pallets: number = cp.weeklyEstimate;
        if (!pallets || pallets <= 0) continue;
        const cargoType: string = (cp.cargoTypes ?? [])[0] ?? contract.cargoType ?? 'OTHER_CHILLED';
        const tempRange = getTempRange(cargoType);
        contractDefaultEstimates.push({
          bookingId:    `CONTRACT-ESTIMATE-${contractId}-${i}`,
          cargoType,
          tempMin:      tempRange.min,
          tempMax:      tempRange.max,
          pallets,
          polPortCode:  polCode,
          podPortCode:  podCode,
          polSeq,
          podSeq,
          polSequence:  polSeq,
          podSequence:  podSeq,
          shipperId,
          consigneeCode: '',
          confidence:   'CONTRACT_ESTIMATE',
          contractId,
          shipperName:  cp.shipperName ?? '',
          frozen:       false,
        });
      }
    } else {
      // No counterparties — contract-level fallback
      if (contractCoverageMap.has(contractId)) continue;
      if (!contract.weeklyPallets) continue;
      const cargoType: string = contract.cargoType ?? 'OTHER_CHILLED';
      const tempRange = getTempRange(cargoType);
      contractDefaultEstimates.push({
        bookingId:    `CONTRACT-ESTIMATE-${contractId}`,
        cargoType,
        tempMin:      tempRange.min,
        tempMax:      tempRange.max,
        pallets:      contract.weeklyPallets,
        polPortCode:  polCode,
        podPortCode:  podCode,
        polSeq,
        podSeq,
        polSequence:  polSeq,
        podSequence:  podSeq,
        shipperId:    '',
        consigneeCode: '',
        confidence:   'CONTRACT_ESTIMATE',
        frozen:       false,
      });
    }
  }

  console.log('Forecast bookings:', forecastBookings.length,
    '· Contract defaults:', contractDefaultEstimates.length);

  // ── 8. Build engine input ─────────────────────────────────────────────────
  const realEngineBookings = buildEngineBookings(bookings, voyage);
  console.log('Real engine bookings:', realEngineBookings.length);

  const engineInput = {
    vessel: {
      sections: buildEngineSections(vessel),
      zones:    buildEngineZones(vessel),
    },
    bookings:          [...realEngineBookings, ...forecastBookings],
    contractEstimates: contractDefaultEstimates,
    portCalls: (voyage.portCalls ?? []).map((pc: any) => ({
      sequence: pc.sequence as number,
      portCode: pc.portCode as string,
    })),
    portSequence: { polPorts: [], podPorts: [] },
    previousZoneTemps: undefined,
    plannerOverrides:  undefined,
    phase: bookings.some((b: any) => (b.confirmedQuantity ?? 0) > 0) ? 'CONFIRMED' : 'ESTIMATED',
  } as unknown as EngineInput;

  // ── 9. Run engine ─────────────────────────────────────────────────────────
  console.log('\n--- Running engine... ---');
  const engineOutput = generateStowagePlan(engineInput);

  // ── 10. Map output to document format ─────────────────────────────────────
  const allBookingMeta = [
    ...bookings,
    ...forecastBookings.map(fe => ({
      _id:           { toString: () => fe.bookingId },
      cargoType:     fe.cargoType,
      polPortCode:   fe.polPortCode,
      podPortCode:   fe.podPortCode,
      shipperName:   (fe as any).shipperName ?? undefined,
      consigneeName: (fe as any).consigneeName ?? undefined,
      confidence:    fe.confidence,
      polSeq:        fe.polSeq,
      podSeq:        fe.podSeq,
    })),
    ...contractDefaultEstimates.map(ce => ({
      _id:         { toString: () => ce.bookingId },
      cargoType:   ce.cargoType,
      polPortCode: ce.polPortCode,
      podPortCode: ce.podPortCode,
      shipperName: (ce as any).shipperName ?? undefined,
      confidence:  ce.confidence,
      polSeq:      ce.polSeq,
      podSeq:      ce.podSeq,
    })),
  ];

  const { cargoPositions, coolingSectionStatus, hasHardConflict } =
    mapEngineOutputToDocument(engineOutput, allBookingMeta);

  const newStatus = hasHardConflict ? 'ESTIMATED' : 'DRAFT';

  // ── 11. Save to DB ────────────────────────────────────────────────────────
  await db.collection('stowageplans').updateOne(
    { _id: planId },
    {
      $set: {
        cargoPositions,
        coolingSectionStatus,
        conflicts:           engineOutput.conflicts,
        stabilityIndicators: engineOutput.stabilityByPort,
        unassignedBookings:  engineOutput.unassignedBookings,
        generationMethod:    'AUTO',
        status:              newStatus,
      },
    },
  );
  console.log('Plan updated in DB. New status:', newStatus);

  // ── 12. Print diagnostics (same format as original script) ────────────────
  const conflicts = engineOutput.conflicts;
  console.log('\n=== PLAN:', plan.planNumber, '===');
  console.log('Status:', newStatus);

  console.log('\n=== ENGINE CONFLICTS ===');
  console.log('Total conflicts:', conflicts.length);
  conflicts.forEach((c: any) => {
    console.log(`  [${c.type}] ${c.palletsAffected} pallets — ${c.message}`);
  });

  const unassigned = engineOutput.unassignedBookings ?? [];
  console.log('\n=== UNASSIGNED BOOKINGS ===');
  console.log('Total:', unassigned.length);
  unassigned.forEach((u: any) => {
    console.log(`  ${u.bookingId}: ${u.reason}`);
  });

  const byPol: Record<string, number> = {};
  for (const pos of cargoPositions) {
    const pol = pos.polPortCode ?? 'unknown';
    byPol[pol] = (byPol[pol] ?? 0) + (pos.quantity ?? 0);
  }
  console.log('\n=== ASSIGNED PALLETS BY POL ===');
  Object.entries(byPol).forEach(([pol, qty]) => console.log(`  ${pol}: ${qty} pallets`));

  const bySection: Record<string, number> = {};
  for (const pos of cargoPositions) {
    const sid = pos.compartment?.id ?? 'unknown';
    bySection[sid] = (bySection[sid] ?? 0) + (pos.quantity ?? 0);
  }
  console.log('\n=== ASSIGNED PALLETS BY SECTION ===');
  Object.entries(bySection).sort().forEach(([sid, qty]) => console.log(`  ${sid}: ${qty}`));

  let totalCap = 0;
  let totalAssigned = 0;
  for (const zone of vessel.temperatureZones ?? []) {
    for (const sec of zone.coolingSections ?? []) {
      const cap = Math.floor((sec.sqm ?? 0) / (sec.designStowageFactor ?? 1.32));
      const assigned = bySection[sec.sectionId] ?? 0;
      totalCap += cap;
      totalAssigned += assigned;
      if (assigned > 0) {
        console.log(`  ${sec.sectionId}: ${assigned}/${cap} (${Math.round(assigned / cap * 100)}%)`);
      }
    }
  }
  console.log(`\nTotal: ${totalAssigned}/${totalCap} pallets (${Math.round(totalAssigned / totalCap * 100)}%)`);

  // ── 13. Deep canPlace diagnostic ──────────────────────────────────────────────
  // Reconstruct the final holdState from engine assignments, then for every
  // unassigned booking evaluate all 4 canPlace conditions per candidate section.

  const LEVEL_ORDER_D = ['DECK', 'UPD', 'FC', 'A', 'B', 'C', 'D', 'E'];

  function parseSectionD(sectionId: string) {
    const match = sectionId.match(/^(\d+)(.+)$/);
    return {
      holdNumber: match ? parseInt(match[1], 10) : 1,
      level:      match ? match[2].toUpperCase() : sectionId.toUpperCase(),
    };
  }

  function levelIdxD(level: string): number {
    const i = LEVEL_ORDER_D.indexOf(level.toUpperCase());
    return i === -1 ? LEVEL_ORDER_D.length : i;
  }

  // HoldState keyed by sectionId
  interface SectionStateD {
    sectionId:  string;
    palletsUsed: number;
    capacity:   number;
    minPolSeq:  number;   // Infinity when empty
    maxPolSeq:  number;   // 0 when empty
    minPodSeq:  number;   // Infinity when empty
    maxPodSeq:  number;   // 0 when empty
  }
  const holdStateD: Record<string, SectionStateD> = {};
  for (const zone of vessel.temperatureZones ?? []) {
    for (const sec of zone.coolingSections ?? []) {
      const cap = Math.floor((sec.sqm ?? 0) / (sec.designStowageFactor ?? 1.32));
      holdStateD[sec.sectionId] = {
        sectionId:  sec.sectionId,
        palletsUsed: 0,
        capacity:   cap,
        minPolSeq:  Infinity,
        maxPolSeq:  0,
        minPodSeq:  Infinity,
        maxPodSeq:  0,
      };
    }
  }

  // Build bookingId → EngineBooking from every booking the engine saw
  const allEngineBookings: EngineBooking[] = [
    ...realEngineBookings,
    ...forecastBookings,
    ...contractDefaultEstimates,
  ];
  const engineBookingById = new Map<string, EngineBooking>(
    allEngineBookings.map(b => [b.bookingId, b]),
  );

  // Populate holdStateD from the engine's successful assignments
  for (const a of engineOutput.assignments) {
    const st = holdStateD[a.sectionId];
    if (!st) continue;
    const bk = engineBookingById.get(a.bookingId);
    if (!bk) continue;
    st.palletsUsed += a.palletsAssigned;
    st.minPolSeq = Math.min(st.minPolSeq, bk.polSeq);
    st.maxPolSeq = Math.max(st.maxPolSeq, bk.polSeq);
    st.minPodSeq = Math.min(st.minPodSeq, bk.podSeq);
    st.maxPodSeq = Math.max(st.maxPodSeq, bk.podSeq);
  }

  // Section → assigned zone temperature (from mapEngineOutputToDocument result)
  const sectionToTemp = new Map<string, number | null>();
  for (const zs of coolingSectionStatus) {
    const temp = zs.assignedTemperature ?? null;
    for (const sid of (zs.coolingSectionIds ?? []) as string[]) {
      sectionToTemp.set(sid, temp);
    }
  }

  // Helpers mirroring assign.ts getLevelsAbove / getLevelsBelow
  function levelsAboveD(sectionId: string): string[] {
    const { holdNumber, level } = parseSectionD(sectionId);
    const myIdx = levelIdxD(level);
    return Object.keys(holdStateD).filter(sid => {
      const p = parseSectionD(sid);
      return p.holdNumber === holdNumber && levelIdxD(p.level) < myIdx;
    });
  }
  function levelsBelowD(sectionId: string): string[] {
    const { holdNumber, level } = parseSectionD(sectionId);
    const myIdx = levelIdxD(level);
    return Object.keys(holdStateD).filter(sid => {
      const p = parseSectionD(sid);
      return p.holdNumber === holdNumber && levelIdxD(p.level) > myIdx;
    });
  }

  // Evaluate all 4 canPlace conditions individually
  function canPlaceDetail(bk: EngineBooking, sectionId: string) {
    const above = levelsAboveD(sectionId);
    const below = levelsBelowD(sectionId);

    const podMaxAbove = above.reduce((m, l) => Math.max(m, holdStateD[l]?.maxPodSeq ?? 0), 0);
    const podMinBelow = below.reduce((m, l) => Math.min(m, holdStateD[l]?.minPodSeq ?? Infinity), Infinity);
    const polMinAbove = above.reduce((m, l) => Math.min(m, holdStateD[l]?.minPolSeq ?? Infinity), Infinity);
    const polMaxBelow = below.reduce((m, l) => Math.max(m, holdStateD[l]?.maxPolSeq ?? 0), 0);

    const a = bk.podSeq >= podMaxAbove;
    const b = bk.podSeq <= podMinBelow;
    const c = bk.polSeq >= polMaxBelow;
    const d = bk.polSeq <= polMinAbove;

    return { podMaxAbove, podMinBelow, polMinAbove, polMaxBelow, a, b, c, d };
  }

  const inf = (v: number) => v === Infinity ? '∞' : String(v);

  console.log('\n=== DEEP canPlace DIAGNOSTIC ===');

  for (const u of unassigned) {
    const bk = engineBookingById.get(u.bookingId);
    if (!bk) {
      console.log(`\n[${u.bookingId}] not found in engine input — skipping`);
      continue;
    }

    console.log(`\n--- Booking: ${bk.bookingId}`);
    console.log(`    cargoType=${bk.cargoType}  polSeq=${bk.polSeq}  podSeq=${bk.podSeq}  pallets=${bk.pallets}  tempRange=[${bk.tempMin},${bk.tempMax}]`);

    // Sections with remaining capacity AND compatible temperature
    const candidates = Object.values(holdStateD)
      .filter(st => {
        if (st.capacity - st.palletsUsed <= 0) return false;
        const temp = sectionToTemp.get(st.sectionId);
        if (temp === undefined || temp === null) return false;
        return temp >= bk.tempMin && temp <= bk.tempMax;
      })
      .sort((a, b) => a.sectionId.localeCompare(b.sectionId));

    if (candidates.length === 0) {
      console.log('    → No sections with remaining capacity AND compatible temperature');
      continue;
    }

    for (const st of candidates) {
      const temp  = sectionToTemp.get(st.sectionId);
      const free  = st.capacity - st.palletsUsed;
      const det   = canPlaceDetail(bk, st.sectionId);
      const passes = det.a && det.b && det.c && det.d;

      console.log(`\n    Section ${st.sectionId}  temp=${temp}°C  free=${free}/${st.capacity}`);
      console.log(`      holdState: minPol=${inf(st.minPolSeq)} maxPol=${st.maxPolSeq} minPod=${inf(st.minPodSeq)} maxPod=${st.maxPodSeq}`);
      console.log(`      canPlace: ${passes ? 'PASS' : 'FAIL'}`);
      console.log(`        a) podSeq(${bk.podSeq}) >= podMaxAbove(${inf(det.podMaxAbove)})  → ${det.a ? 'OK' : 'FAIL'}`);
      console.log(`        b) podSeq(${bk.podSeq}) <= podMinBelow(${inf(det.podMinBelow)})  → ${det.b ? 'OK' : 'FAIL'}`);
      console.log(`        c) polSeq(${bk.polSeq}) >= polMaxBelow(${inf(det.polMaxBelow)})  → ${det.c ? 'OK' : 'FAIL'}`);
      console.log(`        d) polSeq(${bk.polSeq}) <= polMinAbove(${inf(det.polMinAbove)})  → ${det.d ? 'OK' : 'FAIL'}`);
    }
  }

  process.exit(0);
}

diagnose().catch(console.error);
