// ============================================================================
// COUNTRY SERVER ACTIONS
// Read-only — country list is managed via seed script, not the admin UI.
// ============================================================================

'use server';

import connectDB from '@/lib/db/connect';
import { CountryModel } from '@/lib/db/schemas';
import { auth } from '@/auth';

export interface CountryOption {
  code: string;
  name: string;
  flag: string;
}

// ----------------------------------------------------------------------------
// GET ALL ACTIVE COUNTRIES — sorted by name
// All authenticated users can read.
// ----------------------------------------------------------------------------

export async function getCountries(): Promise<CountryOption[]> {
  try {
    const session = await auth();
    if (!session?.user) return [];

    await connectDB();
    const countries = await CountryModel.find({ active: true })
      .sort({ name: 1 })
      .lean();

    return (countries as any[]).map((c: any) => ({
      code: c.code,
      name: c.name,
      flag: c.flag,
    }));
  } catch (error) {
    console.error('Error fetching countries:', error);
    return [];
  }
}
