// scripts/seed-ports.ts
// Safe, targeted seed for UNECE_PORTS master data and operational ports.
// Does NOT touch Services, Voyages, Bookings, Users, Vessels, Contracts, or Offices.
// Run with: npm run db:seed:ports

require('dotenv').config({ path: '.env.local' });

import connectDB from '../lib/db/connect';
import { PortModel, UnecePortModel } from '../lib/db/schemas';

const WEATHER_CITY_OVERRIDES: Record<string, string> = {
  ECPBO: 'Machala', // Puerto Bolívar — city reported by OpenWeatherMap
};

const UNECE_PORTS = [
  { unlocode: 'CLVAP', countryCode: 'CL', country: 'Chile',              portName: 'Valparaíso',     latitude: -33.0333, longitude: -71.6167 },
  { unlocode: 'CLCOQ', countryCode: 'CL', country: 'Chile',              portName: 'Coquimbo',       latitude: -29.9533, longitude: -71.3394 },
  { unlocode: 'CLCLD', countryCode: 'CL', country: 'Chile',              portName: 'Caldera',        latitude: -27.0667, longitude: -70.8333 },
  { unlocode: 'USILG', countryCode: 'US', country: 'United States',      portName: 'Wilmington',     latitude:  39.7167, longitude: -75.5333 },
  { unlocode: 'ECPBO', countryCode: 'EC', country: 'Ecuador',            portName: 'Puerto Bolívar', latitude:  -3.2667, longitude: -80.0000 },
  { unlocode: 'ECGYE', countryCode: 'EC', country: 'Ecuador',            portName: 'Guayaquil',      latitude:  -2.2833, longitude: -79.9167 },
  { unlocode: 'NLVLI', countryCode: 'NL', country: 'Netherlands',        portName: 'Vlissingen',     latitude:  51.4444, longitude:   3.5858 },
  { unlocode: 'GBDVR', countryCode: 'GB', country: 'United Kingdom',     portName: 'Dover',          latitude:  51.1275, longitude:   1.3131 },
  { unlocode: 'GBPME', countryCode: 'GB', country: 'United Kingdom',     portName: 'Portsmouth',     latitude:  50.8167, longitude:  -1.0833 },
  { unlocode: 'NLRTM', countryCode: 'NL', country: 'Netherlands',        portName: 'Rotterdam',      latitude:  51.9489, longitude:   4.1444 },
  { unlocode: 'COTRB', countryCode: 'CO', country: 'Colombia',           portName: 'Turbo',          latitude:   8.0925, longitude: -76.7289 },
  { unlocode: 'FRRAD', countryCode: 'FR', country: 'France',             portName: 'Radicatel',      latitude:  49.4833, longitude:   0.5167 },
  { unlocode: 'COSMR', countryCode: 'CO', country: 'Colombia',           portName: 'Santa Marta',    latitude:  11.2500, longitude: -74.2167 },
  { unlocode: 'PEPAI', countryCode: 'PE', country: 'Peru',               portName: 'Paita',          latitude:  -5.0833, longitude: -81.1167 },
  { unlocode: 'CWWIL', countryCode: 'CW', country: 'Curaçao',            portName: 'Willemstad',     latitude:  12.1083, longitude: -68.9333 },
  { unlocode: 'AWAUA', countryCode: 'AW', country: 'Aruba',              portName: 'Oranjestad',     latitude:  12.5167, longitude: -70.0333 },
  { unlocode: 'DOMNZ', countryCode: 'DO', country: 'Dominican Republic', portName: 'Manzanillo',     latitude:  19.7000, longitude: -71.7500 },
  { unlocode: 'MQFDF', countryCode: 'MQ', country: 'Martinique',         portName: 'Fort-de-France', latitude:  14.6000, longitude: -61.0667 },
  { unlocode: 'SRPBM', countryCode: 'SR', country: 'Suriname',           portName: 'Paramaribo',     latitude:   5.8333, longitude: -55.1667 },
  { unlocode: 'GPPTP', countryCode: 'GP', country: 'Guadeloupe',         portName: 'Pointe-à-Pitre', latitude:  16.2333, longitude: -61.5333 },
  { unlocode: 'GYGEO', countryCode: 'GY', country: 'Guyana',             portName: 'Georgetown',     latitude:   6.8000, longitude: -58.1667 },
];

async function seedPorts() {
  try {
    console.log('🌱 Seeding port collections...');
    await connectDB();
    console.log('✅ Connected to MongoDB');

    // ── UNECE_PORTS — reference/master data ───────────────────────────────
    console.log('\n🧹 Clearing UNECE_PORTS...');
    await UnecePortModel.deleteMany({});

    console.log('🌍 Inserting UNECE reference ports...');
    await UnecePortModel.create(UNECE_PORTS);
    console.log(`✅ ${UNECE_PORTS.length} UNECE reference ports seeded`);

    // ── Operational ports — pre-populated from UNECE ──────────────────────
    console.log('\n🧹 Clearing operational ports...');
    await PortModel.deleteMany({});

    // Drop any stale indexes left over from previous schema versions
    // (e.g. 'code_1' from when the field was named 'code' instead of 'unlocode')
    try {
      await PortModel.collection.dropIndex('code_1');
      console.log('🗑️  Dropped stale index: code_1');
    } catch {
      // Index doesn't exist — that's fine
    }

    const operationalDocs = UNECE_PORTS.map(p => ({
      unlocode:    p.unlocode,
      countryCode: p.countryCode,
      country:     p.country,
      portName:    p.portName,
      weatherCity: WEATHER_CITY_OVERRIDES[p.unlocode] ?? p.portName,
      latitude:    p.latitude,
      longitude:   p.longitude,
      active:      true,
    }));

    await PortModel.create(operationalDocs);
    console.log(`✅ ${operationalDocs.length} operational ports seeded`);

    console.log('\n🎉 Port seed complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Port seed failed:', error);
    process.exit(1);
  }
}

seedPorts();
