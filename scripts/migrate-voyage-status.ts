// Migration: collapse ESTIMATED and CONFIRMED voyage statuses → PLANNED
// Run once: npx ts-node --project tsconfig.json scripts/migrate-voyage-status.ts

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI as string;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set in .env.local');
  process.exit(1);
}

const VoyageSchema = new mongoose.Schema({}, { strict: false });
const VoyageModel = mongoose.models.Voyage ?? mongoose.model('Voyage', VoyageSchema);

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const result = await VoyageModel.updateMany(
    { status: { $in: ['ESTIMATED', 'CONFIRMED'] } },
    { $set: { status: 'PLANNED' } }
  );

  console.log(`Migration complete: ${result.modifiedCount} voyage(s) updated to PLANNED`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
