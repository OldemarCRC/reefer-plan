// Migration: set planImpact = 'INCORPORATED' on CONTRACT_DEFAULT forecasts that still
// carry the legacy planImpact = 'PENDING_REVIEW' value.
//
// Root cause: older code created CONTRACT_DEFAULT forecasts with the schema default
// planImpact of 'PENDING_REVIEW'. Current code (post-v1.56.0) sets 'INCORPORATED'
// immediately for authoritative sources (CONTRACT_DEFAULT, PLANNER_ENTRY, NO_CARGO).
// These stale entries are valid estimates and should be marked incorporated.
//
// Run once:
//   npx ts-node -r tsconfig-paths/register scripts/migrate-contract-default-pending-to-incorporated.ts

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
    planImpact: 'PENDING_REVIEW',
  }).lean();

  console.log(`Found ${targets.length} CONTRACT_DEFAULT forecast(s) with planImpact === 'PENDING_REVIEW'`);

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
