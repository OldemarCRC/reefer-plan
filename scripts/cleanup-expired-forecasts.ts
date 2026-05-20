// scripts/cleanup-expired-forecasts.ts
// Deletes SpaceForecast documents with planImpact REPLACED_BY_BOOKING or EXPIRED
// that are older than 30 days.
//
// Run manually:
//   npx tsx --env-file=.env.local scripts/cleanup-expired-forecasts.ts

require('dotenv').config({ path: '.env.local' });

import connectDB from '../lib/db/connect';
import { SpaceForecastModel } from '../lib/db/schemas';

async function main() {
  await connectDB();

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const filter = {
    planImpact: { $in: ['REPLACED_BY_BOOKING', 'EXPIRED'] },
    updatedAt: { $lt: cutoff },
  };

  const count = await SpaceForecastModel.countDocuments(filter);
  console.log(`Found ${count} stale forecast(s) older than 30 days (REPLACED_BY_BOOKING or EXPIRED).`);

  if (count === 0) {
    console.log('Nothing to delete.');
    process.exit(0);
  }

  const result = await SpaceForecastModel.deleteMany(filter);
  console.log(`Deleted ${result.deletedCount} forecast document(s).`);
  process.exit(0);
}

main().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
