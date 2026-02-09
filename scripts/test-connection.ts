// scripts/test-connection.ts
// Test MongoDB connection

// Load environment variables FIRST
require('dotenv').config({ path: '.env.local' });

import connectDB from '../lib/db/connect';
import mongoose from 'mongoose';

async function testConnection() {
  try {
    console.log('🔌 Testing MongoDB connection...');
    console.log(`📍 URI: ${process.env.MONGODB_URI?.replace(/\/\/.*:.*@/, '//<credentials>@') || 'NOT SET'}`);

    await connectDB();

    console.log('✅ Connection successful!');
    console.log(`📊 Database: ${mongoose.connection.db?.databaseName}`);
    console.log(`🏠 Host: ${mongoose.connection.host}`);
    console.log(`🔢 Port: ${mongoose.connection.port}`);

    // List collections
    const collections = await mongoose.connection.db?.listCollections().toArray();
    console.log(`\n📁 Collections (${collections?.length || 0}):`);
    collections?.forEach(col => console.log(`   - ${col.name}`));

    await mongoose.connection.close();
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Connection test failed:', error);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Check if MongoDB is running (local) or connection string is correct (Atlas)');
    console.error('   2. Verify MONGODB_URI in .env.local');
    console.error('   3. For local: Install MongoDB and start service');
    console.error('   4. For Atlas: Check IP whitelist and credentials');
    process.exit(1);
  }
}

testConnection();
