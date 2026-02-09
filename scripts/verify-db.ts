require('dotenv').config({ path: '.env.local' });
import mongoose from 'mongoose';

async function verify() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db!;
    
    console.log('📊 Collection Counts:');
    console.log(`   - Services: ${await db.collection('services').countDocuments()}`);
    console.log(`   - Vessels: ${await db.collection('vessels').countDocuments()}`);
    console.log(`   - Voyages: ${await db.collection('voyages').countDocuments()}`);
    console.log(`   - Users: ${await db.collection('users').countDocuments()}`);
    console.log(`   - Bookings: ${await db.collection('bookings').countDocuments()}`);
    console.log(`   - Stowage Plans: ${await db.collection('stowageplans').countDocuments()}`);
    
    console.log('\n🚢 Vessels:');
    const vessels = await db.collection('vessels').find({}).toArray();
    vessels.forEach((v: any) => console.log(`   - ${v.name} (IMO: ${v.imoNumber})`));
    
    console.log('\n🗓️  Voyages:');
    const voyages = await db.collection('voyages').find({}).toArray();
    voyages.forEach((v: any) => console.log(`   - ${v.voyageNumber} (${v.vesselName}) - Status: ${v.status}`));
    
    console.log('\n📦 Stowage Plans:');
    const plans = await db.collection('stowageplans').find({}).toArray();
    plans.forEach((p: any) => console.log(`   - ${p.planNumber} (${p.voyageNumber}) - Status: ${p.status}`));
    
    console.log('\n📋 Bookings:');
    const bookings = await db.collection('bookings').find({}).toArray();
    bookings.forEach((b: any) => console.log(`   - ${b.bookingNumber} - Status: ${b.status} - ${b.cargoType}`));
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verify();
