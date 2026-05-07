// Migration: convert PLANNER_ENTRY forecasts with estimatedPallets === 0 to NO_CARGO
// These should never have been created as PLANNER_ENTRY — fix blocked in v1.65.4.
// Run once: npx ts-node --project tsconfig.json scripts/migrate-planner-zero-to-nocargo.ts

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
    source:      'PLANNER_ENTRY',
    estimatedPallets: 0,
    planImpact:  { $nin: ['SUPERSEDED', 'REPLACED_BY_BOOKING'] },
  }).lean();

  console.log(`Found ${targets.length} PLANNER_ENTRY forecast(s) with estimatedPallets === 0`);

  if (targets.length === 0) {
    console.log('Nothing to migrate.');
    await mongoose.disconnect();
    return;
  }

  const ids = (targets as any[]).map((d: any) => d._id);
  const result = await SpaceForecastModel.updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        source:      'NO_CARGO',
        planImpact:  'INCORPORATED',
        notes:       'Auto-migrated from PLANNER_ENTRY quantity=0',
      },
    }
  );

  console.log(`Migration complete: ${result.modifiedCount} forecast(s) updated to NO_CARGO / INCORPORATED`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
