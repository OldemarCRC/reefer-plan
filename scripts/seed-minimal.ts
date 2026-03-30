// scripts/seed-minimal.ts
// Seeds: 3 services, 6 offices, 10 contracts, 19 real vessels, 3 users, 19 captain contacts
// Voyages, bookings, and stowage plans are created via the UI wizard.

require('dotenv').config({ path: '.env.local' });

import bcrypt from 'bcryptjs';
import connectDB from '../lib/db/connect';
import {
    ServiceModel,
    VoyageModel,
    BookingModel,
    UserModel,
    StowagePlanModel,
    VesselModel,
    OfficeModel,
    ContractModel,
    PortModel,
    UnecePortModel,
} from '../lib/db/schemas';

const FORCE = process.argv.includes('--force');

// Helper: section shorthand
const s = (sectionId: string, sqm: number) => ({ sectionId, sqm, designStowageFactor: 1.32 });

async function seedMinimal() {
    // Safety gate — require explicit --force flag to prevent accidental wipes
    if (!FORCE) {
        console.error('\n⛔  Refusing to run without --force flag.');
        console.error('\n   This script will DELETE ALL DATA in:');
        console.error('     • Services, Offices, Contracts, Vessels, Voyages, Bookings, Users, StowagePlans');
        console.error('\n   To proceed, run one of:');
        console.error('     npm run db:seed:reset          (alias with --force)');
        console.error('     tsx scripts/seed-minimal.ts --force');
        console.error('');
        process.exit(1);
    }

    try {
        console.log('🌱 Starting minimal database seeding...');

        await connectDB();
        console.log('✅ Connected to MongoDB');

        // Clear existing data
        console.log('\n🧹 Clearing existing data...');
        await Promise.all([
            ServiceModel.deleteMany({}),
            VoyageModel.deleteMany({}),
            BookingModel.deleteMany({}),
            UserModel.deleteMany({}),
            StowagePlanModel.deleteMany({}),
            VesselModel.deleteMany({}),
            OfficeModel.deleteMany({}),
            ContractModel.deleteMany({}),
            PortModel.deleteMany({}),
            UnecePortModel.deleteMany({}),
        ]);
        console.log('✅ Database cleared');

        // ── 0a. UNECE_PORTS — reference/master data ────────────────────────────
        console.log('\n🌍 Seeding UNECE reference ports...');
        await UnecePortModel.create([
            { unlocode: 'CLVAP', countryCode: 'CL', country: 'Chile',              portName: 'Valparaíso',    latitude: -33.0333, longitude: -71.6167 },
            { unlocode: 'CLCOQ', countryCode: 'CL', country: 'Chile',              portName: 'Coquimbo',      latitude: -29.9533, longitude: -71.3394 },
            { unlocode: 'CLCLD', countryCode: 'CL', country: 'Chile',              portName: 'Caldera',       latitude: -27.0667, longitude: -70.8333 },
            { unlocode: 'USILG', countryCode: 'US', country: 'United States',      portName: 'Wilmington',    latitude:  39.7167, longitude: -75.5333 },
            { unlocode: 'ECPBO', countryCode: 'EC', country: 'Ecuador',            portName: 'Puerto Bolívar',latitude:  -3.2667, longitude: -80.0000 },
            { unlocode: 'ECGYE', countryCode: 'EC', country: 'Ecuador',            portName: 'Guayaquil',     latitude:  -2.2833, longitude: -79.9167 },
            { unlocode: 'NLVLI', countryCode: 'NL', country: 'Netherlands',        portName: 'Vlissingen',    latitude:  51.4444, longitude:   3.5858 },
            { unlocode: 'GBDVR', countryCode: 'GB', country: 'United Kingdom',     portName: 'Dover',         latitude:  51.1275, longitude:   1.3131 },
            { unlocode: 'GBPME', countryCode: 'GB', country: 'United Kingdom',     portName: 'Portsmouth',    latitude:  50.8167, longitude:  -1.0833 },
            { unlocode: 'NLRTM', countryCode: 'NL', country: 'Netherlands',        portName: 'Rotterdam',     latitude:  51.9489, longitude:   4.1444 },
            { unlocode: 'COTRB', countryCode: 'CO', country: 'Colombia',           portName: 'Turbo',         latitude:   8.0925, longitude: -76.7289 },
            { unlocode: 'FRRAD', countryCode: 'FR', country: 'France',             portName: 'Radicatel',     latitude:  49.4833, longitude:   0.5167 },
            { unlocode: 'COSMR', countryCode: 'CO', country: 'Colombia',           portName: 'Santa Marta',   latitude:  11.2500, longitude: -74.2167 },
            { unlocode: 'PEPAI', countryCode: 'PE', country: 'Peru',               portName: 'Paita',         latitude:  -5.0833, longitude: -81.1167 },
            { unlocode: 'CWWIL', countryCode: 'CW', country: 'Curaçao',            portName: 'Willemstad',    latitude:  12.1083, longitude: -68.9333 },
            { unlocode: 'AWAUA', countryCode: 'AW', country: 'Aruba',              portName: 'Oranjestad',    latitude:  12.5167, longitude: -70.0333 },
            { unlocode: 'DOMNZ', countryCode: 'DO', country: 'Dominican Republic', portName: 'Manzanillo',    latitude:  19.7000, longitude: -71.7500 },
            { unlocode: 'MQFDF', countryCode: 'MQ', country: 'Martinique',         portName: 'Fort-de-France',latitude:  14.6000, longitude: -61.0667 },
            { unlocode: 'SRPBM', countryCode: 'SR', country: 'Suriname',           portName: 'Paramaribo',    latitude:   5.8333, longitude: -55.1667 },
            { unlocode: 'GPPTP', countryCode: 'GP', country: 'Guadeloupe',         portName: 'Pointe-à-Pitre',latitude:  16.2333, longitude: -61.5333 },
            { unlocode: 'GYGEO', countryCode: 'GY', country: 'Guyana',             portName: 'Georgetown',    latitude:   6.8000, longitude: -58.1667 },
        ]);
        console.log('✅ 21 UNECE reference ports seeded');

        // ── 0b. Operational ports — pre-populated from UNECE reference data ───
        console.log('\n🗺️  Seeding operational ports...');
        await PortModel.create([
            { unlocode: 'CLVAP', countryCode: 'CL', country: 'Chile',              portName: 'Valparaíso',    weatherCity: 'Valparaíso',     latitude: -33.0333, longitude: -71.6167, active: true },
            { unlocode: 'CLCOQ', countryCode: 'CL', country: 'Chile',              portName: 'Coquimbo',      weatherCity: 'Coquimbo',       latitude: -29.9533, longitude: -71.3394, active: true },
            { unlocode: 'CLCLD', countryCode: 'CL', country: 'Chile',              portName: 'Caldera',       weatherCity: 'Caldera',        latitude: -27.0667, longitude: -70.8333, active: true },
            { unlocode: 'USILG', countryCode: 'US', country: 'United States',      portName: 'Wilmington',    weatherCity: 'Wilmington',     latitude:  39.7167, longitude: -75.5333, active: true },
            { unlocode: 'ECPBO', countryCode: 'EC', country: 'Ecuador',            portName: 'Puerto Bolívar',weatherCity: 'Machala',        latitude:  -3.2667, longitude: -80.0000, active: true },
            { unlocode: 'ECGYE', countryCode: 'EC', country: 'Ecuador',            portName: 'Guayaquil',     weatherCity: 'Guayaquil',      latitude:  -2.2833, longitude: -79.9167, active: true },
            { unlocode: 'NLVLI', countryCode: 'NL', country: 'Netherlands',        portName: 'Vlissingen',    weatherCity: 'Vlissingen',     latitude:  51.4444, longitude:   3.5858, active: true },
            { unlocode: 'GBDVR', countryCode: 'GB', country: 'United Kingdom',     portName: 'Dover',         weatherCity: 'Dover',          latitude:  51.1275, longitude:   1.3131, active: true },
            { unlocode: 'GBPME', countryCode: 'GB', country: 'United Kingdom',     portName: 'Portsmouth',    weatherCity: 'Portsmouth',     latitude:  50.8167, longitude:  -1.0833, active: true },
            { unlocode: 'NLRTM', countryCode: 'NL', country: 'Netherlands',        portName: 'Rotterdam',     weatherCity: 'Rotterdam',      latitude:  51.9489, longitude:   4.1444, active: true },
            { unlocode: 'COTRB', countryCode: 'CO', country: 'Colombia',           portName: 'Turbo',         weatherCity: 'Turbo',          latitude:   8.0925, longitude: -76.7289, active: true },
            { unlocode: 'FRRAD', countryCode: 'FR', country: 'France',             portName: 'Radicatel',     weatherCity: 'Radicatel',      latitude:  49.4833, longitude:   0.5167, active: true },
            { unlocode: 'COSMR', countryCode: 'CO', country: 'Colombia',           portName: 'Santa Marta',   weatherCity: 'Santa Marta',    latitude:  11.2500, longitude: -74.2167, active: true },
            { unlocode: 'PEPAI', countryCode: 'PE', country: 'Peru',               portName: 'Paita',         weatherCity: 'Paita',          latitude:  -5.0833, longitude: -81.1167, active: true },
            { unlocode: 'CWWIL', countryCode: 'CW', country: 'Curaçao',            portName: 'Willemstad',    weatherCity: 'Willemstad',     latitude:  12.1083, longitude: -68.9333, active: true },
            { unlocode: 'AWAUA', countryCode: 'AW', country: 'Aruba',              portName: 'Oranjestad',    weatherCity: 'Oranjestad',     latitude:  12.5167, longitude: -70.0333, active: true },
            { unlocode: 'DOMNZ', countryCode: 'DO', country: 'Dominican Republic', portName: 'Manzanillo',    weatherCity: 'Manzanillo',     latitude:  19.7000, longitude: -71.7500, active: true },
            { unlocode: 'MQFDF', countryCode: 'MQ', country: 'Martinique',         portName: 'Fort-de-France',weatherCity: 'Fort-de-France', latitude:  14.6000, longitude: -61.0667, active: true },
            { unlocode: 'SRPBM', countryCode: 'SR', country: 'Suriname',           portName: 'Paramaribo',    weatherCity: 'Paramaribo',     latitude:   5.8333, longitude: -55.1667, active: true },
            { unlocode: 'GPPTP', countryCode: 'GP', country: 'Guadeloupe',         portName: 'Pointe-à-Pitre',weatherCity: 'Pointe-à-Pitre', latitude:  16.2333, longitude: -61.5333, active: true },
            { unlocode: 'GYGEO', countryCode: 'GY', country: 'Guyana',             portName: 'Georgetown',    weatherCity: 'Georgetown',     latitude:   6.8000, longitude: -58.1667, active: true },
        ]);
        console.log('✅ 21 operational ports seeded');

        // ── 1. Services ─────────────────────────────────────────────────────────
        console.log('\n📦 Seeding services...');
        const services = await ServiceModel.create([
            {
                serviceCode: 'ANDES-EXPRESS',
                shortCode: 'ANX',
                serviceName: 'Andes Express — Chile to USA',
                description: 'Stone fruit, table grapes and berry service from Chilean ports to Wilmington',
                active: true,
                portRotation: [
                    { portCode: 'CLVAP', portName: 'Valparaíso', country: 'Chile', sequence: 1, weeksFromStart: 0, operations: ['LOAD'] },
                    { portCode: 'CLCQQ', portName: 'Coquimbo', country: 'Chile', sequence: 2, weeksFromStart: 0, operations: ['LOAD'] },
                    { portCode: 'CLCLD', portName: 'Caldera', country: 'Chile', sequence: 3, weeksFromStart: 1, operations: ['LOAD'] },
                    { portCode: 'USILG', portName: 'Wilmington', country: 'USA', sequence: 4, weeksFromStart: 3, operations: ['DISCHARGE'] },
                ],
                cycleDurationWeeks: 4,
                cargoTypes: ['TABLE_GRAPES', 'CHERRIES', 'BLUEBERRIES', 'PLUMS', 'PEACHES', 'APPLES', 'PEARS'],
            },
            {
                serviceCode: 'RAYO',
                shortCode: 'RAY',
                serviceName: 'Rayo — Ecuador/Peru to Europe',
                description: 'Banana and tropical fruit service from Ecuador and Peru to Northern Europe',
                active: true,
                portRotation: [
                    { portCode: 'ECPBO', portName: 'Puerto Bolívar', country: 'Ecuador', sequence: 1, weeksFromStart: 0, operations: ['LOAD'] },
                    { portCode: 'ECGYE', portName: 'Guayaquil', country: 'Ecuador', sequence: 2, weeksFromStart: 0, operations: ['LOAD'] },
                    { portCode: 'PEPAI', portName: 'Paita', country: 'Peru', sequence: 3, weeksFromStart: 1, operations: ['LOAD'] },
                    { portCode: 'GBDVR', portName: 'Dover', country: 'UK', sequence: 4, weeksFromStart: 3, operations: ['DISCHARGE'] },
                    { portCode: 'NLVLI', portName: 'Flushing', country: 'Netherlands', sequence: 5, weeksFromStart: 3, operations: ['DISCHARGE'] },
                    { portCode: 'FRRAD', portName: 'Radicatel', country: 'France', sequence: 6, weeksFromStart: 4, operations: ['DISCHARGE'] },
                ],
                cycleDurationWeeks: 4,
                cargoTypes: ['BANANAS', 'ORGANIC_BANANAS', 'PLANTAINS', 'PINEAPPLES', 'AVOCADOS', 'TABLE_GRAPES', 'PAPAYA', 'MANGOES'],
            },
            {
                serviceCode: 'CARIBANEX',
                shortCode: 'CBX',
                serviceName: 'Caribanex — Colombia/Panama to Europe',
                description: 'Banana and tropical fruit service from Colombian and Panamanian ports to Northern Europe',
                active: true,
                portRotation: [
                    { portCode: 'COTRB', portName: 'Turbo', country: 'Colombia', sequence: 1, weeksFromStart: 0, operations: ['LOAD'] },
                    { portCode: 'COSMR', portName: 'Santa Marta', country: 'Colombia', sequence: 2, weeksFromStart: 0, operations: ['LOAD'] },
                    { portCode: 'PAMIT', portName: 'Manzanillo', country: 'Panama', sequence: 3, weeksFromStart: 1, operations: ['LOAD'] },
                    { portCode: 'NLVLI', portName: 'Flushing', country: 'Netherlands', sequence: 4, weeksFromStart: 3, operations: ['DISCHARGE'] },
                    { portCode: 'GBPME', portName: 'Portsmouth', country: 'UK', sequence: 5, weeksFromStart: 3, operations: ['DISCHARGE'] },
                ],
                cycleDurationWeeks: 4,
                cargoTypes: ['BANANAS', 'ORGANIC_BANANAS', 'PINEAPPLES', 'PLANTAINS', 'MANGOES', 'AVOCADOS'],
            },
        ]);
        console.log(`✅ Created ${services.length} services`);

        // ── 1b. Offices ───────────────────────────────────────────────────────────
        console.log('\n🏢 Seeding offices...');
        const offices = await OfficeModel.create([
            { code: 'RTM', name: 'Rotterdam', country: 'Netherlands' },
            { code: 'VLP', name: 'Valparaiso', country: 'Chile' },
            { code: 'GYE', name: 'Guayaquil', country: 'Ecuador' },
            { code: 'SMR', name: 'Santa Marta', country: 'Colombia' },
            { code: 'PME', name: 'Portsmouth', country: 'UK' },
            { code: 'VLI', name: 'Flushing', country: 'Netherlands' },
        ]);
        console.log(`✅ Created ${offices.length} offices`);

        // ── 1c. Contracts ──────────────────────────────────────────────────────────
        // Contract number format: {officeCode}{serviceShortCode}{year}{clientNumber}{seq}
        // Majority are CONSIGNEE-type (buyer holds the contract, nominates shippers)
        console.log('\n📄 Seeding contracts...');

        const rtm = offices.find((o: any) => o.code === 'RTM');
        const smr = offices.find((o: any) => o.code === 'SMR');
        const gye = offices.find((o: any) => o.code === 'GYE');
        const vlp = offices.find((o: any) => o.code === 'VLP');
        const cbx = services.find((s: any) => s.serviceCode === 'CARIBANEX');
        const ray = services.find((s: any) => s.serviceCode === 'RAYO');
        const anx = services.find((s: any) => s.serviceCode === 'ANDES-EXPRESS');

        const contracts = await ContractModel.create([
            // ── CARIBANEX contracts (Colombia → Europe) ──────────────────────
            // European buyers contract Colombian shippers
            {
                contractNumber: 'RTMCBX2026C001001',
                officeId: rtm._id, officeCode: 'RTM',
                client: {
                    type: 'CONSIGNEE', name: 'COBANA GmbH', clientNumber: 'C001',
                    contact: 'Klaus Weber', email: 'klaus@cobana.de', country: 'Germany',
                },
                shippers: [
                    { name: 'Banafrut S.A.', code: 'BFR', weeklyEstimate: 200, cargoTypes: ['BANANAS'] },
                    { name: 'Uniban S.A.', code: 'UNB', weeklyEstimate: 180, cargoTypes: ['BANANAS', 'PLANTAINS'] },
                ],
                consignees: [],
                serviceId: cbx._id, serviceCode: 'CARIBANEX',
                originPort: { portCode: 'COSMR', portName: 'Santa Marta', country: 'Colombia' },
                destinationPort: { portCode: 'NLVLI', portName: 'Flushing', country: 'Netherlands' },
                validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'),
            },
            {
                contractNumber: 'RTMCBX2026C002001',
                officeId: rtm._id, officeCode: 'RTM',
                client: {
                    type: 'CONSIGNEE', name: 'Fyffes PLC', clientNumber: 'C002',
                    contact: 'Seamus O\'Brien', email: 'seamus@fyffes.com', country: 'Ireland',
                },
                shippers: [
                    { name: 'Banafrut S.A.', code: 'BFR', weeklyEstimate: 150, cargoTypes: ['BANANAS', 'ORGANIC_BANANAS'] },
                    { name: 'Técnicas Baltime', code: 'TBL', weeklyEstimate: 120, cargoTypes: ['BANANAS'] },
                ],
                consignees: [],
                serviceId: cbx._id, serviceCode: 'CARIBANEX',
                originPort: { portCode: 'COTRB', portName: 'Turbo', country: 'Colombia' },
                destinationPort: { portCode: 'GBPME', portName: 'Portsmouth', country: 'UK' },
                validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'),
            },
            {
                contractNumber: 'RTMCBX2026C003001',
                officeId: rtm._id, officeCode: 'RTM',
                client: {
                    type: 'CONSIGNEE', name: 'AgroFair Europe', clientNumber: 'C003',
                    contact: 'Hans van den Berg', email: 'hans@agrofair.nl', country: 'Netherlands',
                },
                shippers: [
                    { name: 'BanaCol', code: 'BCL', weeklyEstimate: 100, cargoTypes: ['ORGANIC_BANANAS'] },
                    { name: 'Banafrut S.A.', code: 'BFR', weeklyEstimate: 80, cargoTypes: ['ORGANIC_BANANAS'] },
                ],
                consignees: [],
                serviceId: cbx._id, serviceCode: 'CARIBANEX',
                originPort: { portCode: 'COSMR', portName: 'Santa Marta', country: 'Colombia' },
                destinationPort: { portCode: 'NLVLI', portName: 'Flushing', country: 'Netherlands' },
                validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'),
            },
            // ── SHIPPER-type: Colombian exporter contracts European consignees ──
            {
                contractNumber: 'SMRCBX2026C004001',
                officeId: smr._id, officeCode: 'SMR',
                client: {
                    type: 'SHIPPER', name: 'Técnicas Baltime', clientNumber: 'C004',
                    contact: 'Carlos Ruiz', email: 'carlos@tecbalt.co', country: 'Colombia',
                },
                consignees: [
                    { name: 'Compagnie Fruitière', code: 'CFR', weeklyEstimate: 250, cargoTypes: ['BANANAS', 'ORGANIC_BANANAS'] },
                ],
                shippers: [],
                serviceId: cbx._id, serviceCode: 'CARIBANEX',
                originPort: { portCode: 'COSMR', portName: 'Santa Marta', country: 'Colombia' },
                destinationPort: { portCode: 'GBPME', portName: 'Portsmouth', country: 'UK' },
                validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'),
            },

            // ── RAYO contracts (Ecuador → Europe) ────────────────────────────
            // European buyers contract Ecuadorian shippers
            {
                contractNumber: 'GYERAY2026C005001',
                officeId: gye._id, officeCode: 'GYE',
                client: {
                    type: 'CONSIGNEE', name: 'Fyffes PLC', clientNumber: 'C005',
                    contact: 'Seamus O\'Brien', email: 'seamus@fyffes.com', country: 'Ireland',
                },
                shippers: [
                    { name: 'Noboa Corp (Bonita)', code: 'NOB', weeklyEstimate: 300, cargoTypes: ['BANANAS'] },
                    { name: 'Reybanpac S.A.', code: 'RBP', weeklyEstimate: 200, cargoTypes: ['BANANAS', 'PINEAPPLES'] },
                ],
                consignees: [],
                serviceId: ray._id, serviceCode: 'RAYO',
                originPort: { portCode: 'ECGYE', portName: 'Guayaquil', country: 'Ecuador' },
                destinationPort: { portCode: 'NLVLI', portName: 'Flushing', country: 'Netherlands' },
                validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'),
            },
            {
                contractNumber: 'GYERAY2026C006001',
                officeId: gye._id, officeCode: 'GYE',
                client: {
                    type: 'CONSIGNEE', name: 'Compagnie Fruitière', clientNumber: 'C006',
                    contact: 'Pierre Dupont', email: 'pierre@compfruit.fr', country: 'France',
                },
                shippers: [
                    { name: 'Reybanpac S.A.', code: 'RBP', weeklyEstimate: 220, cargoTypes: ['BANANAS', 'ORGANIC_BANANAS'] },
                    { name: 'Ecuaplantation S.A.', code: 'ECP', weeklyEstimate: 160, cargoTypes: ['BANANAS', 'PLANTAINS'] },
                ],
                consignees: [],
                serviceId: ray._id, serviceCode: 'RAYO',
                originPort: { portCode: 'ECPBO', portName: 'Puerto Bolívar', country: 'Ecuador' },
                destinationPort: { portCode: 'FRRAD', portName: 'Radicatel', country: 'France' },
                validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'),
            },
            {
                contractNumber: 'GYERAY2026C007001',
                officeId: gye._id, officeCode: 'GYE',
                client: {
                    type: 'CONSIGNEE', name: 'Del Monte Fresh', clientNumber: 'C007',
                    contact: 'James Taylor', email: 'james@delmonte.com', country: 'USA',
                },
                shippers: [
                    { name: 'Ecuaplantation S.A.', code: 'ECP', weeklyEstimate: 180, cargoTypes: ['BANANAS', 'MANGOES'] },
                ],
                consignees: [],
                serviceId: ray._id, serviceCode: 'RAYO',
                originPort: { portCode: 'ECGYE', portName: 'Guayaquil', country: 'Ecuador' },
                destinationPort: { portCode: 'GBDVR', portName: 'Dover', country: 'UK' },
                validFrom: new Date('2026-03-01'), validTo: new Date('2026-12-31'),
            },

            // ── ANDES-EXPRESS contracts (Chile → USA) ────────────────────────
            // US buyers contract Chilean shippers
            {
                contractNumber: 'VLPANX2026C008001',
                officeId: vlp._id, officeCode: 'VLP',
                client: {
                    type: 'CONSIGNEE', name: 'Pandol Bros', clientNumber: 'C008',
                    contact: 'Matt Pandol', email: 'matt@pandol.com', country: 'USA',
                },
                shippers: [
                    { name: 'Frutera San Fernando', code: 'FSF', weeklyEstimate: 250, cargoTypes: ['TABLE_GRAPES', 'CHERRIES'] },
                    { name: 'Agricom Ltda', code: 'AGR', weeklyEstimate: 150, cargoTypes: ['TABLE_GRAPES', 'BLUEBERRIES'] },
                ],
                consignees: [],
                serviceId: anx._id, serviceCode: 'ANDES-EXPRESS',
                originPort: { portCode: 'CLVAP', portName: 'Valparaíso', country: 'Chile' },
                destinationPort: { portCode: 'USILG', portName: 'Wilmington', country: 'USA' },
                validFrom: new Date('2025-11-01'), validTo: new Date('2026-04-30'),
            },
            {
                contractNumber: 'VLPANX2026C009001',
                officeId: vlp._id, officeCode: 'VLP',
                client: {
                    type: 'CONSIGNEE', name: 'Oppy USA', clientNumber: 'C009',
                    contact: 'Sarah Chen', email: 'sarah@oppy.com', country: 'USA',
                },
                shippers: [
                    { name: 'Exportadora Subsole', code: 'SUB', weeklyEstimate: 180, cargoTypes: ['CHERRIES', 'BLUEBERRIES'] },
                    { name: 'Agricom Ltda', code: 'AGR', weeklyEstimate: 200, cargoTypes: ['TABLE_GRAPES', 'PLUMS', 'PEACHES'] },
                ],
                consignees: [],
                serviceId: anx._id, serviceCode: 'ANDES-EXPRESS',
                originPort: { portCode: 'CLCQQ', portName: 'Coquimbo', country: 'Chile' },
                destinationPort: { portCode: 'USILG', portName: 'Wilmington', country: 'USA' },
                validFrom: new Date('2025-12-01'), validTo: new Date('2026-04-30'),
            },
            // ── SHIPPER-type: Chilean exporter contracts US consignees ──
            {
                contractNumber: 'VLPANX2026C010001',
                officeId: vlp._id, officeCode: 'VLP',
                client: {
                    type: 'SHIPPER', name: 'Exportadora Subsole', clientNumber: 'C010',
                    contact: 'Diego Vargas', email: 'diego@subsole.cl', country: 'Chile',
                },
                consignees: [
                    { name: 'Giumarra Companies', code: 'GIU', weeklyEstimate: 120, cargoTypes: ['TABLE_GRAPES', 'APPLES', 'PEARS'] },
                ],
                shippers: [],
                serviceId: anx._id, serviceCode: 'ANDES-EXPRESS',
                originPort: { portCode: 'CLVAP', portName: 'Valparaíso', country: 'Chile' },
                destinationPort: { portCode: 'USILG', portName: 'Wilmington', country: 'USA' },
                validFrom: new Date('2025-11-15'), validTo: new Date('2026-04-30'),
            },
        ]);
        console.log(`✅ Created ${contracts.length} contracts`);

        // ── 2. Vessels (19 real vessels from spec sheets) ────────────────────────
        console.log('\n🚢 Seeding vessels...');
        const vessels = await VesselModel.create([

            // ── T1: ACONCAGUA BAY ──────────────────────────────────────────────────
            // Zones: 1AB 1CD | 2UPDAB 2CD | 3UPDAB 3CD | 4UPDAB 4CD
            {
                name: 'ACONCAGUA BAY', imoNumber: '9019652', flag: 'LIBERIA',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1AB', coolingSections: [s('1A', 363.82), s('1B', 210.75)] },
                    { zoneId: '1CD', coolingSections: [s('1C', 145.35), s('1D', 141.5)] },
                    { zoneId: '2UPDAB', coolingSections: [s('2UPD', 108.68), s('2A', 428.6), s('2B', 378.17)] },
                    { zoneId: '2CD', coolingSections: [s('2C', 367.59), s('2D', 284.6)] },
                    { zoneId: '3UPDAB', coolingSections: [s('3UPD', 103.4), s('3A', 458.29), s('3B', 437.24)] },
                    { zoneId: '3CD', coolingSections: [s('3C', 461.17), s('3D', 411.94)] },
                    { zoneId: '4UPDAB', coolingSections: [s('4UPD', 103.3), s('4A', 441.98), s('4B', 412.2)] },
                    { zoneId: '4CD', coolingSections: [s('4C', 380.99), s('4D', 254.81)] },
                ],
            },

            // ── T3A: Island vessels + REGAL BAY ───────────────────────────────────
            // Zones: 1AB 1C | 2AB 2CD | 3AB 3CD | 4AB 4CD
            // NOTE: ALBEMARLE ISLAND, CHARLES ISLAND, DUNCAN ISLAND, and HOOD ISLAND
            // are T3A sister ships — their identical sqm values per section are correct
            // per vessel type specification. Do not treat as copy-paste errors.
            {
                name: 'ALBEMARLE ISLAND', imoNumber: '9059602', flag: 'BAHAMAS',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1AB', coolingSections: [s('1A', 578), s('1B', 395)] },
                    { zoneId: '1C', coolingSections: [s('1C', 263)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 594), s('2B', 548)] },
                    { zoneId: '2CD', coolingSections: [s('2C', 478), s('2D', 355)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 559), s('3B', 563)] },
                    { zoneId: '3CD', coolingSections: [s('3C', 564), s('3D', 438)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 557), s('4B', 560)] },
                    { zoneId: '4CD', coolingSections: [s('4C', 528), s('4D', 337)] },
                ],
            },
            {
                name: 'CHARLES ISLAND', imoNumber: '9059626', flag: 'BAHAMAS',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1AB', coolingSections: [s('1A', 578), s('1B', 395)] },
                    { zoneId: '1C', coolingSections: [s('1C', 263)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 594), s('2B', 548)] },
                    { zoneId: '2CD', coolingSections: [s('2C', 478), s('2D', 355)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 559), s('3B', 563)] },
                    { zoneId: '3CD', coolingSections: [s('3C', 564), s('3D', 438)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 557), s('4B', 560)] },
                    { zoneId: '4CD', coolingSections: [s('4C', 528), s('4D', 337)] },
                ],
            },
            {
                name: 'DUNCAN ISLAND', imoNumber: '9059638', flag: 'BAHAMAS',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1AB', coolingSections: [s('1A', 578), s('1B', 395)] },
                    { zoneId: '1C', coolingSections: [s('1C', 263)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 594), s('2B', 548)] },
                    { zoneId: '2CD', coolingSections: [s('2C', 478), s('2D', 355)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 559), s('3B', 563)] },
                    { zoneId: '3CD', coolingSections: [s('3C', 564), s('3D', 438)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 557), s('4B', 560)] },
                    { zoneId: '4CD', coolingSections: [s('4C', 528), s('4D', 337)] },
                ],
            },
            {
                name: 'HOOD ISLAND', imoNumber: '9059640', flag: 'BAHAMAS',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1AB', coolingSections: [s('1A', 578), s('1B', 395)] },
                    { zoneId: '1C', coolingSections: [s('1C', 263)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 594), s('2B', 548)] },
                    { zoneId: '2CD', coolingSections: [s('2C', 478), s('2D', 355)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 559), s('3B', 563)] },
                    { zoneId: '3CD', coolingSections: [s('3C', 564), s('3D', 438)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 557), s('4B', 560)] },
                    { zoneId: '4CD', coolingSections: [s('4C', 528), s('4D', 337)] },
                ],
            },
            {
                name: 'REGAL BAY', imoNumber: '9053658', flag: 'BAHAMAS',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1AB', coolingSections: [s('1A', 375), s('1B', 261)] },
                    { zoneId: '1C', coolingSections: [s('1C', 178)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 440), s('2B', 419)] },
                    { zoneId: '2CD', coolingSections: [s('2C', 379), s('2D', 314)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 459), s('3B', 462)] },
                    { zoneId: '3CD', coolingSections: [s('3C', 461), s('3D', 434)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 464), s('4B', 444)] },
                    { zoneId: '4CD', coolingSections: [s('4C', 413), s('4D', 348)] },
                ],
            },

            // ── T2A: ATLANTIC KLIPPER, ELVIRA ─────────────────────────────────────
            // Zones: 1AB 1CD | 2AB 2CD | 3AB 3CD | 4AB 4CD
            {
                name: 'ATLANTIC KLIPPER', imoNumber: '9454761', flag: 'LIBERIA',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1AB', coolingSections: [s('1A', 573.9), s('1B', 346.8)] },
                    { zoneId: '1CD', coolingSections: [s('1C', 284.6), s('1D', 237.5)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 535.3), s('2B', 513.2)] },
                    { zoneId: '2CD', coolingSections: [s('2C', 464.3), s('2D', 371.9)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 543.9), s('3B', 546.7)] },
                    { zoneId: '3CD', coolingSections: [s('3C', 541.3), s('3D', 403.3)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 486.5), s('4B', 484.7)] },
                    { zoneId: '4CD', coolingSections: [s('4C', 440.9), s('4D', 343.4)] },
                ],
            },
            {
                name: 'ELVIRA', imoNumber: '9202869', flag: 'BARBADOS',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1AB', coolingSections: [s('1A', 488.16), s('1B', 307.97)] },
                    { zoneId: '1CD', coolingSections: [s('1C', 215.27), s('1D', 106.52)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 461.72), s('2B', 435.83)] },
                    { zoneId: '2CD', coolingSections: [s('2C', 380.71), s('2D', 282.79)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 479.41), s('3B', 480.42)] },
                    { zoneId: '3CD', coolingSections: [s('3C', 475.67), s('3D', 434.05)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 479.25), s('4B', 475.58)] },
                    { zoneId: '4CD', coolingSections: [s('4C', 432.12), s('4D', 308.29)] },
                ],
            },

            // ── T2B: ATLANTIC REEFER ───────────────────────────────────────────────
            // Zones: 1AB 1CD | 2AB 2CDE | 3AB 3CDE | 4AB 4CDE
            {
                name: 'ATLANTIC REEFER', imoNumber: '9179256', flag: 'LIBERIA',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1AB', coolingSections: [s('1A', 399), s('1B', 269)] },
                    { zoneId: '1CD', coolingSections: [s('1C', 183), s('1D', 157)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 202), s('2B', 433)] },
                    { zoneId: '2CDE', coolingSections: [s('2C', 453), s('2D', 391), s('2E', 339)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 203), s('3B', 431)] },
                    { zoneId: '3CDE', coolingSections: [s('3C', 497), s('3D', 479), s('3E', 483)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 202), s('4B', 467)] },
                    { zoneId: '4CDE', coolingSections: [s('4C', 479), s('4D', 408), s('4E', 329)] },
                ],
            },

            // ── T3B: STREAM vessels ────────────────────────────────────────────────
            // Zones: 1AB 1C | 2AB 2CDE | 3AB 3CDE | 4AB 4CDE
            {
                name: 'AUTUMN STREAM', imoNumber: '9038323', flag: 'BAHAMAS',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1AB', coolingSections: [s('1A', 404), s('1B', 319)] },
                    { zoneId: '1C', coolingSections: [s('1C', 242)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 494), s('2B', 480)] },
                    { zoneId: '2CDE', coolingSections: [s('2C', 445), s('2D', 395), s('2E', 260)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 481), s('3B', 485)] },
                    { zoneId: '3CDE', coolingSections: [s('3C', 484), s('3D', 478), s('3E', 332)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 490), s('4B', 497)] },
                    { zoneId: '4CDE', coolingSections: [s('4C', 505), s('4D', 475), s('4E', 291)] },
                ],
            },
            {
                name: 'HELLAS STREAM', imoNumber: '9015187', flag: 'BAHAMAS',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1AB', coolingSections: [s('1A', 404), s('1B', 319)] },
                    { zoneId: '1C', coolingSections: [s('1C', 242)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 494), s('2B', 480)] },
                    { zoneId: '2CDE', coolingSections: [s('2C', 445), s('2D', 395), s('2E', 260)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 481), s('3B', 485)] },
                    { zoneId: '3CDE', coolingSections: [s('3C', 484), s('3D', 478), s('3E', 332)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 494), s('4B', 501)] },
                    { zoneId: '4CDE', coolingSections: [s('4C', 505), s('4D', 475), s('4E', 291)] },
                ],
            },
            {
                name: 'ITALIA STREAM', imoNumber: '9030137', flag: 'BAHAMAS',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1AB', coolingSections: [s('1A', 404), s('1B', 319)] },
                    { zoneId: '1C', coolingSections: [s('1C', 242)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 494), s('2B', 480)] },
                    { zoneId: '2CDE', coolingSections: [s('2C', 445), s('2D', 395), s('2E', 260)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 481), s('3B', 485)] },
                    { zoneId: '3CDE', coolingSections: [s('3C', 484), s('3D', 478), s('3E', 332)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 494), s('4B', 501)] },
                    { zoneId: '4CDE', coolingSections: [s('4C', 505), s('4D', 475), s('4E', 291)] },
                ],
            },
            {
                name: 'SWEDISH STREAM', imoNumber: '9030149', flag: 'BAHAMAS',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1AB', coolingSections: [s('1A', 404), s('1B', 319)] },
                    { zoneId: '1C', coolingSections: [s('1C', 242)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 494), s('2B', 480)] },
                    { zoneId: '2CDE', coolingSections: [s('2C', 445), s('2D', 395), s('2E', 260)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 481), s('3B', 485)] },
                    { zoneId: '3CDE', coolingSections: [s('3C', 484), s('3D', 478), s('3E', 332)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 494), s('4B', 501)] },
                    { zoneId: '4CDE', coolingSections: [s('4C', 505), s('4D', 475), s('4E', 291)] },
                ],
            },

            // ── T4A: CS/STAR/STRAIT vessels ───────────────────────────────────────
            // Zones: 1FCAB | 2AB 2CD | 3AB 3CD | 4AB 4CD  (7 zones)
            {
                name: 'CS QUALITY', imoNumber: '9438494', flag: 'SINGAPORE',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1FCAB', coolingSections: [s('1FC', 589.7), s('1A', 325.7), s('1B', 212)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 560.3), s('2B', 495.4)] },
                    { zoneId: '2CD', coolingSections: [s('2C', 446), s('2D', 350.9)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 560.5), s('3B', 563.6)] },
                    { zoneId: '3CD', coolingSections: [s('3C', 550.8), s('3D', 390.3)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 541.7), s('4B', 517.8)] },
                    { zoneId: '4CD', coolingSections: [s('4C', 445.8), s('4D', 332)] },
                ],
            },
            {
                name: 'CS SERVICE', imoNumber: '9438482', flag: 'SINGAPORE',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1FCAB', coolingSections: [s('1FC', 590.8), s('1A', 326.8), s('1B', 212.3)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 560.8), s('2B', 494.9)] },
                    { zoneId: '2CD', coolingSections: [s('2C', 445.2), s('2D', 350.8)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 561.2), s('3B', 563.5)] },
                    { zoneId: '3CD', coolingSections: [s('3C', 552.3), s('3D', 390.1)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 540.9), s('4B', 517.4)] },
                    { zoneId: '4CD', coolingSections: [s('4C', 445.5), s('4D', 332.8)] },
                ],
            },
            {
                name: 'STAR PRIMA', imoNumber: '9338747', flag: 'BAHAMAS',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1FCAB', coolingSections: [s('1FC', 589.8), s('1A', 326.2), s('1B', 211.7)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 560.3), s('2B', 494.6)] },
                    { zoneId: '2CD', coolingSections: [s('2C', 445), s('2D', 350.5)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 560.5), s('3B', 562.3)] },
                    { zoneId: '3CD', coolingSections: [s('3C', 550.2), s('3D', 389.9)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 540.5), s('4B', 517.1)] },
                    { zoneId: '4CD', coolingSections: [s('4C', 443.5), s('4D', 331.6)] },
                ],
            },
            {
                name: 'LOMBOK STRAIT', imoNumber: '9204958', flag: 'LIBERIA',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1FCAB', coolingSections: [s('1FC', 554.66), s('1A', 327.69), s('1B', 174.08)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 614.3), s('2B', 543.29)] },
                    { zoneId: '2CD', coolingSections: [s('2C', 441.33), s('2D', 284.19)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 674.3), s('3B', 669.44)] },
                    { zoneId: '3CD', coolingSections: [s('3C', 653.28), s('3D', 498.98)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 572.8), s('4B', 571.54)] },
                    { zoneId: '4CD', coolingSections: [s('4C', 495.91), s('4D', 264.46)] },
                ],
            },
            {
                name: 'LUZON STRAIT', imoNumber: '9204960', flag: 'LIBERIA',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1FCAB', coolingSections: [s('1FC', 554.66), s('1A', 327.69), s('1B', 174.08)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 614.6), s('2B', 543.29)] },
                    { zoneId: '2CD', coolingSections: [s('2C', 441.33), s('2D', 284.19)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 674.3), s('3B', 669.44)] },
                    { zoneId: '3CD', coolingSections: [s('3C', 653.28), s('3D', 498.98)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 572.8), s('4B', 571.54)] },
                    { zoneId: '4CD', coolingSections: [s('4C', 495.91), s('4D', 264.46)] },
                ],
            },

            // ── T4B: BALTIC KLIPPER ────────────────────────────────────────────────
            // Zones: 1FCAB 1C | 2AB 2CD | 3AB 3CD | 4AB 4CD  (8 zones)
            {
                name: 'BALTIC KLIPPER', imoNumber: '9454759', flag: 'LIBERIA',
                vesselType: 'REEFER', active: true,
                temperatureZones: [
                    { zoneId: '1FCAB', coolingSections: [s('1FC', 573.9), s('1A', 346.8), s('1B', 284.6)] },
                    { zoneId: '1C', coolingSections: [s('1C', 237.5)] },
                    { zoneId: '2AB', coolingSections: [s('2A', 535.3), s('2B', 513.2)] },
                    { zoneId: '2CD', coolingSections: [s('2C', 464.3), s('2D', 371.9)] },
                    { zoneId: '3AB', coolingSections: [s('3A', 543.9), s('3B', 546.7)] },
                    { zoneId: '3CD', coolingSections: [s('3C', 541.3), s('3D', 403.3)] },
                    { zoneId: '4AB', coolingSections: [s('4A', 486.5), s('4B', 484.7)] },
                    { zoneId: '4CD', coolingSections: [s('4C', 440.9), s('4D', 343.9)] },
                ],
            },

        ]);
        console.log(`✅ Created ${vessels.length} vessels`);

        // ── 3. Users ─────────────────────────────────────────────────────────────
        console.log('\n👤 Seeding users...');
        const defaultHash = await bcrypt.hash('password123', 10);
        const users = await UserModel.create([
            {
                email: 'oldemar.chaves+planner@gmail.com',
                name: 'John Planner',
                role: 'SHIPPING_PLANNER',
                port: 'CLVAP',
                canSendEmailsToCaptains: true,
                passwordHash: defaultHash,
            },
            {
                email: 'stevedore@reefer.com',
                name: 'Mike Stevedore',
                role: 'STEVEDORE',
                port: 'CLVAP',
                passwordHash: defaultHash,
            },
            {
                email: 'admin@reefer.com',
                name: 'Admin User',
                role: 'ADMIN',
                canSendEmailsToCaptains: true,
                passwordHash: defaultHash,
            },
        ]);
        console.log(`✅ Created ${users.length} users (password: password123)`);

        // ── 4. Captain Contacts (one per vessel, using +alias Gmail addresses) ──
        console.log('\n⚓ Seeding captain contacts...');
        console.log('\n✅ Minimal seeding completed successfully!');
        console.log('\n📊 Summary:');
        console.log(`   - Services:         ${services.length}  (ANDES-EXPRESS, RAYO, CARIBANEX) — with shortCodes`);
        console.log(`   - Offices:          ${offices.length}  (RTM, VLP, GYE, SMR, PME, VLI)`);
        console.log(`   - Contracts:        ${contracts.length}  (3 CBX-consignee + 1 CBX-shipper, 3 RAY-consignee, 2 ANX-consignee + 1 ANX-shipper)`);
        console.log(`   - Vessels:          ${vessels.length}  (all 19 real vessels from spec sheets)`);
        console.log(`   - Users:            ${users.length}  (planner: oldemar.chaves+planner@gmail.com)`);
        console.log('   - Voyages, Bookings, Stowage Plans: none (created via UI)');
        console.log('\n✅ Database ready!');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Seeding failed:', error);
        process.exit(1);
    }
}

seedMinimal();