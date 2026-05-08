// Migration: set planImpact = 'INCORPORATED' on CONTRACT_DEFAULT forecasts that carry
// planImpact = 'NO_CHANGE'.
//
// Root cause: _createForecastCore evaluated the NO_CHANGE guard before the source check,
// so if createContractDefaultForecasts() was called on a voyage that already had a
// CONTRACT_DEFAULT with the same estimatedPallets, the new doc got NO_CHANGE instead of
// INCORPORATED. CONTRACT_DEFAULT is authoritative and never requires planner review;
// NO_CHANGE is only meaningful for SHIPPER_PORTAL resubmissions.
//
// Run once:
//   npx tsx scripts/migrate-contract-default-nochange-to-incorporated.ts

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI as string;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set in .env.local');
  process.exit(1);
}

const SpaceForecastSchema = new mongoose.Schema({}, { strict: false });
const SpaceForecastModel =
  mongoose.models.SpaceForecast ?? mongoose.model('SpaceForecast', SpaceForecastSchema);

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const targets = await SpaceForecastModel.find({
    source:     'CONTRACT_DEFAULT',
    planImpact: 'NO_CHANGE',
  }).lean();

  console.log(`Found ${targets.length} CONTRACT_DEFAULT forecast(s) with planImpact === 'NO_CHANGE'`);

  if (targets.length === 0) {
    console.log('Nothing to migrate.');
    await mongoose.disconnect();
    return;
  }

  const ids = (targets as any[]).map((d: any) => d._id);
  console.log('IDs to update:', ids.map((id: any) => id.toString()));

  const result = await SpaceForecastModel.updateMany(
    { _id: { $in: ids } },
    { $set: { planImpact: 'INCORPORATED' } }
  );

  console.log(`Migration complete: ${result.modifiedCount} forecast(s) updated to INCORPORATED`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
