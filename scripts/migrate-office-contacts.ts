/**
 * One-time migration: add contactName, contactEmail, contactPhone to
 * the 6 seeded offices (RTM, VLP, GYE, SMR, PME, VLI).
 * Safe to re-run — only updates documents that still have empty contact fields.
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/reefer-planner';

const contacts: Record<string, { contactName: string; contactEmail: string; contactPhone: string }> = {
  RTM: {
    contactName:  'Pieter van Dijk',
    contactEmail: 'p.vandijk@reefer-rtm.com',
    contactPhone: '+31 10 412 7890',
  },
  VLP: {
    contactName:  'Rodrigo Fuentes',
    contactEmail: 'r.fuentes@reefer-vlp.com',
    contactPhone: '+56 32 221 4567',
  },
  GYE: {
    contactName:  'María José Andrade',
    contactEmail: 'mj.andrade@reefer-gye.com',
    contactPhone: '+593 4 256 3890',
  },
  SMR: {
    contactName:  'Carlos Herrera',
    contactEmail: 'c.herrera@reefer-smr.com',
    contactPhone: '+57 5 431 7823',
  },
  PME: {
    contactName:  'Ana Villalobos',
    contactEmail: 'a.villalobos@reefer-pme.com',
    contactPhone: '+56 65 225 9034',
  },
  VLI: {
    contactName:  'Lucas Ferreira',
    contactEmail: 'l.ferreira@reefer-vli.com',
    contactPhone: '+55 27 3223 5678',
  },
};

async function run() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db!;
  const col = db.collection('offices');

  let updated = 0;
  for (const [code, data] of Object.entries(contacts)) {
    const result = await col.updateOne(
      { code },
      { $set: data }
    );
    if (result.modifiedCount > 0) {
      console.log(`  ✓ ${code}: set contact → ${data.contactName}`);
      updated++;
    } else if (result.matchedCount > 0) {
      console.log(`  · ${code}: already has contact data (skipped)`);
    } else {
      console.log(`  ✗ ${code}: office not found`);
    }
  }

  console.log(`\nDone — ${updated} office(s) updated.`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
