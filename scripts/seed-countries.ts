// scripts/seed-countries.ts
// Seeds the Country collection with ~60 countries relevant to maritime/shipping operations.
// Run with: npm run db:seed:countries
// Safe to re-run: uses upsert so existing records are not duplicated.

require('dotenv').config({ path: '.env.local' });

import connectDB from '../lib/db/connect';
import { CountryModel } from '../lib/db/schemas';

function codeToFlagEmoji(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0)))
    .join('');
}

const COUNTRIES: { name: string; code: string }[] = [
  // South America (key origin ports for reefer cargo)
  { name: 'Chile', code: 'CL' },
  { name: 'Peru', code: 'PE' },
  { name: 'Ecuador', code: 'EC' },
  { name: 'Colombia', code: 'CO' },
  { name: 'Brazil', code: 'BR' },
  { name: 'Argentina', code: 'AR' },
  { name: 'Uruguay', code: 'UY' },
  { name: 'Bolivia', code: 'BO' },
  { name: 'Venezuela', code: 'VE' },
  { name: 'Guyana', code: 'GY' },
  { name: 'Suriname', code: 'SR' },

  // Central America & Caribbean
  { name: 'Panama', code: 'PA' },
  { name: 'Costa Rica', code: 'CR' },
  { name: 'Guatemala', code: 'GT' },
  { name: 'Honduras', code: 'HN' },
  { name: 'Nicaragua', code: 'NI' },
  { name: 'Mexico', code: 'MX' },
  { name: 'Cuba', code: 'CU' },
  { name: 'Dominican Republic', code: 'DO' },
  { name: 'Jamaica', code: 'JM' },
  { name: 'Trinidad And Tobago', code: 'TT' },
  { name: 'Barbados', code: 'BB' },

  // North America
  { name: 'United States', code: 'US' },
  { name: 'Canada', code: 'CA' },

  // Europe (major destination ports)
  { name: 'Netherlands', code: 'NL' },
  { name: 'United Kingdom', code: 'GB' },
  { name: 'Germany', code: 'DE' },
  { name: 'Belgium', code: 'BE' },
  { name: 'France', code: 'FR' },
  { name: 'Spain', code: 'ES' },
  { name: 'Portugal', code: 'PT' },
  { name: 'Italy', code: 'IT' },
  { name: 'Norway', code: 'NO' },
  { name: 'Sweden', code: 'SE' },
  { name: 'Denmark', code: 'DK' },
  { name: 'Finland', code: 'FI' },
  { name: 'Poland', code: 'PL' },
  { name: 'Russia', code: 'RU' },
  { name: 'Greece', code: 'GR' },
  { name: 'Turkey', code: 'TR' },

  // Common vessel flag states (open registries)
  { name: 'Liberia', code: 'LR' },
  { name: 'Bahamas', code: 'BS' },
  { name: 'Marshall Islands', code: 'MH' },
  { name: 'Malta', code: 'MT' },
  { name: 'Cyprus', code: 'CY' },
  { name: 'Singapore', code: 'SG' },
  { name: 'Bermuda', code: 'BM' },

  // Africa
  { name: 'South Africa', code: 'ZA' },
  { name: 'Morocco', code: 'MA' },
  { name: 'Ivory Coast', code: 'CI' },
  { name: 'Ghana', code: 'GH' },
  { name: 'Cameroon', code: 'CM' },
  { name: 'Kenya', code: 'KE' },
  { name: 'Senegal', code: 'SN' },

  // Asia Pacific
  { name: 'Japan', code: 'JP' },
  { name: 'China', code: 'CN' },
  { name: 'South Korea', code: 'KR' },
  { name: 'Philippines', code: 'PH' },
  { name: 'Thailand', code: 'TH' },
  { name: 'Malaysia', code: 'MY' },
  { name: 'Indonesia', code: 'ID' },
  { name: 'India', code: 'IN' },
  { name: 'Australia', code: 'AU' },
  { name: 'New Zealand', code: 'NZ' },

  // Middle East
  { name: 'United Arab Emirates', code: 'AE' },
  { name: 'Saudi Arabia', code: 'SA' },
];

async function seedCountries() {
  try {
    console.log('🌱 Seeding Country collection...');
    await connectDB();
    console.log('✅ Connected to MongoDB');

    let inserted = 0;
    let updated = 0;

    for (const country of COUNTRIES) {
      const flag = codeToFlagEmoji(country.code);
      const result = await CountryModel.updateOne(
        { code: country.code },
        { $set: { name: country.name, code: country.code, flag, active: true } },
        { upsert: true }
      );
      if (result.upsertedCount > 0) inserted++;
      else if (result.modifiedCount > 0) updated++;
    }

    const total = await CountryModel.countDocuments();
    console.log(`\n✅ Done: ${inserted} inserted, ${updated} updated, ${total} total countries`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding countries:', error);
    process.exit(1);
  }
}

seedCountries();
