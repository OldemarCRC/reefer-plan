// scripts/analyze-route.ts
// Read-only route analysis for Baltic Klipper AC26020.
// Does NOT modify any files or DB records.
import mongoose from 'mongoose';
import connectDB from '../lib/db/connect';
import { getTempRange } from '../lib/stowage-engine/temperature';

async function main() {
  await connectDB();
  const db = mongoose.connection.db!;

  // ── Load plan / voyage / vessel ───────────────────────────────────────────
  const plan = await db.collection('stowageplans').findOne(
    { vesselName: /baltic klipper/i },
    { sort: { createdAt: -1 } },
  );
  if (!plan) { console.log('Plan not found'); process.exit(1); }

  const voyage = await db.collection('voyages').findOne({ _id: plan.voyageId });
  if (!voyage) { console.log('Voyage not found'); process.exit(1); }

  const vessel = await db.collection('vessels').findOne({ _id: voyage.vesselId });
  if (!vessel) { console.log('Vessel not found'); process.exit(1); }

  const portCallMap = new Map<string, number>(
    (voyage.portCalls ?? []).map((pc: any) => [pc.portCode as string, pc.sequence as number]),
  );
  const seqToPort = new Map<number, string>(
    (voyage.portCalls ?? []).map((pc: any) => [pc.sequence as number, pc.portCode as string]),
  );

  // ── Load bookings ─────────────────────────────────────────────────────────
  const bookings = await db.collection('bookings').find({
    voyageId: voyage._id,
    status: { $in: ['CONFIRMED', 'PARTIAL', 'PENDING'] },
  }).toArray();

  // ── Load forecasts ────────────────────────────────────────────────────────
  const activeForecasts = await db.collection('spaceforecasts').find({
    voyageId: voyage._id,
    planImpact: { $in: ['PENDING_REVIEW', 'INCORPORATED'] },
  }).toArray();

  const forecastByPair = new Map<string, any>();
  for (const fc of activeForecasts) {
    const key = `${fc.shipperId?.toString() ?? ''}:${fc.contractId?.toString() ?? ''}`;
    forecastByPair.set(key, fc);
  }

  // ── Load contracts ────────────────────────────────────────────────────────
  const activeContracts = voyage.serviceId
    ? await db.collection('contracts').find({ serviceId: voyage.serviceId, active: true }).toArray()
    : [];

  const contractCoverageMap = new Map<string, Set<string> | 'ALL'>();
  for (const b of bookings) {
    const cid = b.contractId?.toString();
    if (!cid) continue;
    const sid = b.shipperId?.toString();
    if (!sid) { contractCoverageMap.set(cid, 'ALL'); }
    else if (contractCoverageMap.get(cid) !== 'ALL') {
      if (!contractCoverageMap.has(cid)) contractCoverageMap.set(cid, new Set());
      (contractCoverageMap.get(cid) as Set<string>).add(sid);
    }
  }

  // ── Build cargo items ─────────────────────────────────────────────────────
  type CargoItem = {
    label: string;
    polCode: string;
    polSeq: number;
    podCode: string;
    podSeq: number;
    cargoType: string;
    pallets: number;
    tempMin: number;
    tempMax: number;
  };
  const items: CargoItem[] = [];

  // Real bookings
  for (const b of bookings) {
    const polSeq = portCallMap.get(b.pol?.portCode);
    const podSeq = portCallMap.get(b.pod?.portCode);
    if (polSeq === undefined || podSeq === undefined) continue;
    const confirmed = (b.confirmedQuantity ?? 0) > 0;
    const pallets = confirmed ? b.confirmedQuantity : b.requestedQuantity;
    const cargoType = b.cargoType ?? 'OTHER_CHILLED';
    const tr = getTempRange(cargoType);
    items.push({
      label: `BOOKING ${b._id.toString().slice(-6)}`,
      polCode: b.pol?.portCode ?? '',
      polSeq,
      podCode: b.pod?.portCode ?? '',
      podSeq,
      cargoType,
      pallets,
      tempMin: tr.min,
      tempMax: tr.max,
    });
  }

  // Forecasts + contract defaults
  for (const contract of activeContracts as any[]) {
    const contractId = contract._id.toString();
    const polCode: string = contract.originPort?.portCode ?? '';
    const podCode: string = contract.destinationPort?.portCode ?? '';
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
          const cargoType: string = forecast.cargoType ?? (cp.cargoTypes ?? [])[0] ?? contract.cargoType ?? 'OTHER_CHILLED';
          const tr = getTempRange(cargoType);
          items.push({
            label: `FORECAST ${forecast._id.toString().slice(-6)}`,
            polCode, polSeq, podCode, podSeq,
            cargoType,
            pallets: forecast.estimatedPallets,
            tempMin: tr.min,
            tempMax: tr.max,
          });
          continue;
        }

        // CONTRACT_DEFAULT
        const pallets: number = cp.weeklyEstimate;
        if (!pallets || pallets <= 0) continue;
        const cargoType: string = (cp.cargoTypes ?? [])[0] ?? contract.cargoType ?? 'OTHER_CHILLED';
        const tr = getTempRange(cargoType);
        items.push({
          label: `CONTRACT-EST ${contractId.slice(-6)}-${i}`,
          polCode, polSeq, podCode, podSeq,
          cargoType,
          pallets,
          tempMin: tr.min,
          tempMax: tr.max,
        });
      }
    } else {
      if (contractCoverageMap.has(contractId)) continue;
      if (!contract.weeklyPallets) continue;
      const cargoType: string = contract.cargoType ?? 'OTHER_CHILLED';
      const tr = getTempRange(cargoType);
      items.push({
        label: `CONTRACT-EST ${contractId.slice(-6)}`,
        polCode, polSeq, podCode, podSeq,
        cargoType,
        pallets: contract.weeklyPallets,
        tempMin: tr.min,
        tempMax: tr.max,
      });
    }
  }

  // Sort by polSeq, podSeq, cargoType
  items.sort((a, b) => {
    if (a.polSeq !== b.polSeq) return a.polSeq - b.polSeq;
    if (a.podSeq !== b.podSeq) return a.podSeq - b.podSeq;
    return a.cargoType.localeCompare(b.cargoType);
  });

  // ── 1. All bookings + forecasts grouped by POL → POD ─────────────────────
  console.log('\n=== 1. ALL CARGO ITEMS GROUPED BY POL → POD ===');
  let currentGroup = '';
  for (const it of items) {
    const group = `${it.polCode}(seq=${it.polSeq}) → ${it.podCode}(seq=${it.podSeq})`;
    if (group !== currentGroup) {
      console.log(`\n  ${group}`);
      currentGroup = group;
    }
    console.log(`    [${it.label}]  ${it.cargoType}  ${it.pallets} pal  temp=[${it.tempMin}°C,${it.tempMax}°C]`);
  }

  // ── 2. Total pallets per POD destination ──────────────────────────────────
  console.log('\n\n=== 2. TOTAL PALLETS PER POD DESTINATION ===');
  const podTotals = new Map<string, number>();
  for (const it of items) {
    const key = `${it.podCode}:${it.podSeq}`;
    podTotals.set(key, (podTotals.get(key) ?? 0) + it.pallets);
  }
  const podEntries = [...podTotals.entries()].sort((a, b) => {
    const sa = parseInt(a[0].split(':')[1]);
    const sb = parseInt(b[0].split(':')[1]);
    return sa - sb;
  });
  for (const [key, total] of podEntries) {
    const [code, seq] = key.split(':');
    console.log(`  POD(seq=${seq}) ${code}: ${total} pallets total`);
  }

  // ── 3. Vessel section capacity by hold with temperature ───────────────────
  console.log('\n\n=== 3. VESSEL SECTION CAPACITY BY HOLD ===');
  type SectionInfo = { sectionId: string; sqm: number; capacity: number; zoneId: string; temp: number | null; };
  const sectionsByHold = new Map<number, SectionInfo[]>();

  for (const zone of vessel.temperatureZones ?? []) {
    for (const cs of zone.coolingSections ?? []) {
      const holdNumber = parseInt(String(cs.sectionId).charAt(0), 10) || 1;
      const dsf = cs.designStowageFactor ?? 1.32;
      const capacity = Math.floor(cs.sqm / dsf);
      const info: SectionInfo = {
        sectionId: cs.sectionId,
        sqm: cs.sqm,
        capacity,
        zoneId: zone.zoneId,
        temp: zone.targetTemperature ?? zone.defaultTemperature ?? null,
      };
      if (!sectionsByHold.has(holdNumber)) sectionsByHold.set(holdNumber, []);
      sectionsByHold.get(holdNumber)!.push(info);
    }
  }

  // Also collect zone temps assigned on plan
  const planCooling: Record<string, number> = {};
  for (const cs of plan.coolingSectionStatus ?? []) {
    if (cs.assignedTemperature != null) {
      for (const sid of cs.coolingSectionIds ?? []) {
        planCooling[sid] = cs.assignedTemperature;
      }
    }
  }

  const holdNums = [...sectionsByHold.keys()].sort((a, b) => a - b);
  for (const hold of holdNums) {
    const sections = sectionsByHold.get(hold)!;
    const holdTotal = sections.reduce((s, x) => s + x.capacity, 0);
    console.log(`\n  Hold ${hold}  (${holdTotal} pal total)`);
    for (const s of sections.sort((a, b) => a.sectionId.localeCompare(b.sectionId))) {
      const planTemp = planCooling[s.sectionId];
      const tempStr = planTemp != null ? `${planTemp}°C (plan)` : s.temp != null ? `${s.temp}°C (default)` : 'no temp';
      console.log(`    ${s.sectionId.padEnd(6)} | ${String(s.capacity).padStart(4)} pal | ${String(s.sqm).padStart(6)} sqm | zone=${s.zoneId} | ${tempStr}`);
    }
  }

  // ── 4. POL→POD combinations sharing cargo type and temperature ───────────
  console.log('\n\n=== 4. POL→POD COMBINATIONS SHARING CARGO TYPE + TEMPERATURE ===');
  type GroupKey = string;
  const compatGroups = new Map<GroupKey, { polCode: string; polSeq: number; podCode: string; podSeq: number; pallets: number }[]>();
  for (const it of items) {
    const key = `${it.cargoType}|${it.tempMin}-${it.tempMax}`;
    if (!compatGroups.has(key)) compatGroups.set(key, []);
    const grp = compatGroups.get(key)!;
    const existing = grp.find(g => g.polCode === it.polCode && g.podCode === it.podCode);
    if (existing) { existing.pallets += it.pallets; }
    else { grp.push({ polCode: it.polCode, polSeq: it.polSeq, podCode: it.podCode, podSeq: it.podSeq, pallets: it.pallets }); }
  }

  for (const [key, pairs] of compatGroups.entries()) {
    if (pairs.length < 2) continue; // only show groups with 2+ distinct POL→POD
    const [cargoType, tempRange] = key.split('|');
    const total = pairs.reduce((s, p) => s + p.pallets, 0);
    console.log(`\n  ${cargoType}  [${tempRange}°C]  — ${total} pal across ${pairs.length} routes — CAN SHARE A HOLD`);
    pairs.sort((a, b) => a.polSeq - b.polSeq || a.podSeq - b.podSeq);
    for (const p of pairs) {
      console.log(`    ${p.polCode}(seq=${p.polSeq}) → ${p.podCode}(seq=${p.podSeq}) : ${p.pallets} pal`);
    }
  }

  // ── 5. Hold reservation feasibility ──────────────────────────────────────
  console.log('\n\n=== 5. HOLD RESERVATION FEASIBILITY ===');
  console.log('  Scenario: Hold 1 = GBPME only | Hold 2 = pineapple (fixed) | Hold 3+4 = NLVLI only');
  console.log('  (Hold 2 is pineapple +7°C — unchanged)');

  // Collect pallets per POD and cargo type
  const gbpmeItems = items.filter(it => it.podCode === 'GBPME');
  const nlvliItems  = items.filter(it => it.podCode === 'NLVLI');

  const gbpmeBanana    = gbpmeItems.filter(it => it.cargoType === 'BANANAS');
  const gbpmePineapple = gbpmeItems.filter(it => it.cargoType === 'PINEAPPLES');
  const nlvliBanana    = nlvliItems.filter(it => it.cargoType === 'BANANAS');
  const nlvliPineapple = nlvliItems.filter(it => it.cargoType === 'PINEAPPLES');
  const otherItems     = items.filter(it => it.podCode !== 'GBPME' && it.podCode !== 'NLVLI');

  const sum = (arr: CargoItem[]) => arr.reduce((s, i) => s + i.pallets, 0);

  console.log('\n  --- GBPME cargo (all POLs) ---');
  for (const it of gbpmeItems.sort((a,b) => a.polSeq - b.polSeq)) {
    console.log(`    ${it.polCode}(seq=${it.polSeq}) → GBPME | ${it.cargoType} | ${it.pallets} pal`);
  }
  console.log(`    Total GBPME BANANAS   : ${sum(gbpmeBanana)} pal (banana zone +13°C)`);
  console.log(`    Total GBPME PINEAPPLES: ${sum(gbpmePineapple)} pal (pineapple zone +7°C)`);
  console.log(`    Total GBPME all       : ${sum(gbpmeItems)} pal`);

  console.log('\n  --- NLVLI cargo (all POLs) ---');
  for (const it of nlvliItems.sort((a,b) => a.polSeq - b.polSeq)) {
    console.log(`    ${it.polCode}(seq=${it.polSeq}) → NLVLI | ${it.cargoType} | ${it.pallets} pal`);
  }
  console.log(`    Total NLVLI BANANAS   : ${sum(nlvliBanana)} pal (banana zone +13°C)`);
  console.log(`    Total NLVLI PINEAPPLES: ${sum(nlvliPineapple)} pal (pineapple zone +7°C)`);
  console.log(`    Total NLVLI all       : ${sum(nlvliItems)} pal`);

  console.log('\n  --- Other cargo ---');
  for (const it of otherItems.sort((a,b) => a.polSeq - b.polSeq || a.podSeq - b.podSeq)) {
    console.log(`    ${it.polCode}(seq=${it.polSeq}) → ${it.podCode}(seq=${it.podSeq}) | ${it.cargoType} | ${it.pallets} pal`);
  }
  console.log(`    Total other: ${sum(otherItems)} pal`);

  // Hold capacities
  const holdCap = new Map<number, { banana: number; pineapple: number; total: number }>();
  for (const hold of holdNums) {
    const sections = sectionsByHold.get(hold)!;
    let banana = 0, pineapple = 0;
    for (const s of sections) {
      const planTemp = planCooling[s.sectionId];
      const temp = planTemp ?? s.temp ?? 13;
      if (temp <= 10) { pineapple += s.capacity; }
      else { banana += s.capacity; }
    }
    holdCap.set(hold, { banana, pineapple, total: banana + pineapple });
  }

  console.log('\n  --- Hold capacities (from vessel + plan temps) ---');
  for (const hold of holdNums) {
    const c = holdCap.get(hold)!;
    console.log(`    Hold ${hold}: ${c.total} pal total  (banana=${c.banana} pal @13°C, pineapple=${c.pineapple} pal @7°C)`);
  }

  console.log('\n  --- Scenario math ---');
  const hold1 = holdCap.get(1)!;
  const hold2 = holdCap.get(2)!;
  const hold3 = holdCap.get(3)!;
  const hold4 = holdCap.get(4)!;

  const gbpmeBananaPal    = sum(gbpmeBanana);
  const gbpmePineapplePal = sum(gbpmePineapple);
  const nlvliBananaPal    = sum(nlvliBanana);
  const nlvliPineapplePal = sum(nlvliPineapple);
  const otherBananaPal    = otherItems.filter(i => i.cargoType === 'BANANAS').reduce((s,i)=>s+i.pallets,0);
  const otherPineapplePal = otherItems.filter(i => i.cargoType === 'PINEAPPLES').reduce((s,i)=>s+i.pallets,0);

  // Hold 1 = GBPME banana only (it's a banana hold)
  console.log(`\n  Hold 1 (banana, ${hold1.banana} pal) reserved for GBPME BANANAS:`);
  console.log(`    GBPME BANANAS: ${gbpmeBananaPal} pal  vs  Hold 1 banana capacity: ${hold1.banana} pal`);
  console.log(`    Fits? ${gbpmeBananaPal <= hold1.banana ? 'YES ✓' : 'NO ✗'}  (${hold1.banana - gbpmeBananaPal >= 0 ? 'surplus' : 'deficit'}: ${Math.abs(hold1.banana - gbpmeBananaPal)} pal)`);

  // Hold 2 = pineapple (fixed) — receives pineapple cargo for all PODs
  const allPineapplePal = gbpmePineapplePal + nlvliPineapplePal + otherPineapplePal;
  console.log(`\n  Hold 2 (pineapple, ${hold2.pineapple} pal) receives ALL pineapple cargo:`);
  console.log(`    Pineapple total (all PODs): ${allPineapplePal} pal  vs  Hold 2 pineapple capacity: ${hold2.pineapple} pal`);
  console.log(`    Fits? ${allPineapplePal <= hold2.pineapple ? 'YES ✓' : 'NO ✗'}  (${hold2.pineapple - allPineapplePal >= 0 ? 'surplus' : 'deficit'}: ${Math.abs(hold2.pineapple - allPineapplePal)} pal)`);

  // Hold 3 + 4 = NLVLI banana + other banana
  const h34bananaCapacity = (hold3.banana) + (hold4.banana);
  const nonGbpmeBananaPal = nlvliBananaPal + otherBananaPal;
  console.log(`\n  Hold 3+4 (banana, ${h34bananaCapacity} pal combined) reserved for NLVLI + other BANANAS:`);
  console.log(`    NLVLI BANANAS  : ${nlvliBananaPal} pal`);
  console.log(`    Other BANANAS  : ${otherBananaPal} pal (COTRB→COTRB-area etc.)`);
  console.log(`    Total non-GBPME bananas: ${nonGbpmeBananaPal} pal  vs  Hold 3+4 banana capacity: ${h34bananaCapacity} pal`);
  console.log(`    Fits? ${nonGbpmeBananaPal <= h34bananaCapacity ? 'YES ✓' : 'NO ✗'}  (${h34bananaCapacity - nonGbpmeBananaPal >= 0 ? 'surplus' : 'deficit'}: ${Math.abs(h34bananaCapacity - nonGbpmeBananaPal)} pal)`);

  const totalCargo = sum(items);
  const totalCapacity = [...holdCap.values()].reduce((s,c) => s + c.total, 0);
  console.log(`\n  --- Summary ---`);
  console.log(`    Total cargo   : ${totalCargo} pal`);
  console.log(`    Total capacity: ${totalCapacity} pal`);
  console.log(`    Utilization   : ${Math.round(totalCargo/totalCapacity*100)}%`);
  console.log(`    Scenario feasible overall? ${totalCargo <= totalCapacity ? 'YES ✓' : 'NO ✗'}`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
