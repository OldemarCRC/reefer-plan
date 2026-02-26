// scripts/cleanup-transactional.ts
// Deletes all transactional data while preserving master/structural collections.
//
// DELETES:  bookings, contracts, services, shippers, stowageplans, voyages
// KEEPS:    vessels, users, offices, ports
//
// Usage:
//   npx tsx scripts/cleanup-transactional.ts --confirm

require('dotenv').config({ path: '.env.local' });

import connectDB from '../lib/db/connect';
import {
    BookingModel,
    ContractModel,
    ServiceModel,
    ShipperModel,
    StowagePlanModel,
    VoyageModel,
} from '../lib/db/schemas';

const CONFIRM = process.argv.includes('--confirm');

async function cleanupTransactional() {
    if (!CONFIRM) {
        console.error('\n⛔  Refusing to run without --confirm flag.');
        console.error('\n   This script will DELETE ALL DOCUMENTS from:');
        console.error('     • bookings');
        console.error('     • contracts');
        console.error('     • services');
        console.error('     • shippers');
        console.error('     • stowageplans');
        console.error('     • voyages');
        console.error('\n   The following collections will NOT be touched:');
        console.error('     • vessels  • users  • offices  • ports');
        console.error('\n   To proceed, run:');
        console.error('     npx tsx scripts/cleanup-transactional.ts --confirm');
        console.error('');
        process.exit(1);
    }

    try {
        console.log('\n🧹 Connecting to database...');
        await connectDB();
        console.log('✅ Connected\n');

        console.log('🗑️  Deleting transactional data...');

        const [
            bookingsDel,
            contractsDel,
            servicesDel,
            shippersDel,
            plansDel,
            voyagesDel,
        ] = await Promise.all([
            BookingModel.deleteMany({}),
            ContractModel.deleteMany({}),
            ServiceModel.deleteMany({}),
            ShipperModel.deleteMany({}),
            StowagePlanModel.deleteMany({}),
            VoyageModel.deleteMany({}),
        ]);

        console.log(`  bookings:      ${bookingsDel.deletedCount} deleted`);
        console.log(`  contracts:     ${contractsDel.deletedCount} deleted`);
        console.log(`  services:      ${servicesDel.deletedCount} deleted`);
        console.log(`  shippers:      ${shippersDel.deletedCount} deleted`);
        console.log(`  stowageplans:  ${plansDel.deletedCount} deleted`);
        console.log(`  voyages:       ${voyagesDel.deletedCount} deleted`);

        console.log('\n✅ Cleanup complete. vessels, users, offices and ports were NOT modified.');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Cleanup failed:', error);
        process.exit(1);
    }
}

cleanupTransactional();
