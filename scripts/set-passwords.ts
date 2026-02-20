// scripts/set-passwords.ts
// One-off migration: set default password hash for all users without one.
// Usage: tsx scripts/set-passwords.ts

require('dotenv').config({ path: '.env.local' });

import bcrypt from 'bcryptjs';
import connectDB from '../lib/db/connect';
import { UserModel } from '../lib/db/schemas';

async function main() {
  await connectDB();

  const hash = await bcrypt.hash('password123', 10);
  const result = await UserModel.updateMany(
    { passwordHash: { $exists: false } },
    { $set: { passwordHash: hash } }
  );

  console.log(`✅ Updated ${result.modifiedCount} user(s) with default password: password123`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
