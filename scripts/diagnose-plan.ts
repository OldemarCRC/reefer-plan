// Save as scripts/diagnose-plan.ts and run with: npx ts-node scripts/diagnose-plan.ts
import mongoose from 'mongoose';
import connectDB from '../lib/db/connect';

async function diagnose() {
  await connectDB();

  const db = mongoose.connection.db!;

  // Find the Baltic Klipper plan
  const plan = await db.collection('stowageplans').findOne(
    { 'vesselName': /baltic klipper/i },
    { sort: { createdAt: -1 } }
  );

  if (!plan) { console.log('Plan not found'); process.exit(1); }

  console.log('\n=== PLAN:', plan.planNumber, '===');
  console.log('Status:', plan.status);

  // Show conflicts
  const conflicts = plan.conflicts ?? [];
  console.log('\n=== ENGINE CONFLICTS ===');
  console.log('Total conflicts:', conflicts.length);
  conflicts.forEach((c: any) => {
    console.log(`  [${c.type}] ${c.palletsAffected} pallets — ${c.message}`);
  });

  // Show unassigned bookings
  const unassigned = plan.unassignedBookings ?? [];
  console.log('\n=== UNASSIGNED BOOKINGS ===');
  console.log('Total:', unassigned.length);
  unassigned.forEach((u: any) => {
    console.log(`  ${u.bookingId}: ${u.reason}`);
  });

  // Show cargo positions summary by POL
  const positions = plan.cargoPositions ?? [];
  const byPol: Record<string, number> = {};
  for (const pos of positions) {
    const pol = pos.polPortCode ?? 'unknown';
    byPol[pol] = (byPol[pol] ?? 0) + (pos.quantity ?? 0);
  }
  console.log('\n=== ASSIGNED PALLETS BY POL ===');
  Object.entries(byPol).forEach(([pol, qty]) => console.log(`  ${pol}: ${qty} pallets`));

  // Show cargo positions summary by section
  const bySection: Record<string, number> = {};
  for (const pos of positions) {
    const sid = pos.coolingSectionId ?? pos.compartment?.id ?? 'unknown';
    bySection[sid] = (bySection[sid] ?? 0) + (pos.quantity ?? 0);
  }
  console.log('\n=== ASSIGNED PALLETS BY SECTION ===');
  Object.entries(bySection).sort().forEach(([sid, qty]) => console.log(`  ${sid}: ${qty}`));

  // Show total vessel capacity
  const vessel = await db.collection('vessels').findOne({ name: /baltic klipper/i });
  if (vessel) {
    let totalCap = 0;
    let totalAssigned = 0;
    for (const zone of vessel.temperatureZones ?? []) {
      for (const sec of zone.coolingSections ?? []) {
        const cap = Math.floor((sec.sqm ?? 0) / (sec.designStowageFactor ?? 1.32));
        const assigned = bySection[sec.sectionId] ?? 0;
        totalCap += cap;
        totalAssigned += assigned;
        if (assigned > 0) {
          console.log(`  ${sec.sectionId}: ${assigned}/${cap} (${Math.round(assigned/cap*100)}%)`);
        }
      }
    }
    console.log(`\nTotal: ${totalAssigned}/${totalCap} pallets (${Math.round(totalAssigned/totalCap*100)}%)`);
  }

  process.exit(0);
}

diagnose().catch(console.error);
