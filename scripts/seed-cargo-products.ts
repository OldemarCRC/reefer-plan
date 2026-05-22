// Run: npx tsx --env-file=.env.local scripts/seed-cargo-products.ts

import connectDB from '../lib/db/connect';
import { CargoProductModel, CompatibilityGroupModel } from '../lib/db/schemas';

const products = [
  { code: 'BAN',    name: 'Bananas',         shortLabel: 'BAN',  temperature: 13  },
  { code: 'OBAN',   name: 'Organic Bananas',  shortLabel: 'OBAN', temperature: 13  },
  { code: 'PINE',   name: 'Pineapples',       shortLabel: 'PINE', temperature: 7   },
  { code: 'PLAN',   name: 'Plantains',        shortLabel: 'PLAN', temperature: 13  },
  { code: 'AVOC',   name: 'Avocados',         shortLabel: 'AVOC', temperature: 6   },
  { code: 'GRAPE',  name: 'Table Grapes',     shortLabel: 'GRPE', temperature: -1  },
  { code: 'CITRUS', name: 'Citrus',           shortLabel: 'CITR', temperature: 5   },
  { code: 'MANGO',  name: 'Mangoes',          shortLabel: 'MANG', temperature: 10  },
  { code: 'PAPA',   name: 'Papaya',           shortLabel: 'PAPA', temperature: 10  },
];

async function seed() {
  await connectDB();

  // compatibilityGroupId and compatibilityGroupCode are required on CargoProductSchema.
  // Find or create a placeholder GENERAL group so the seed works without pre-existing groups.
  let group = await CompatibilityGroupModel.findOne({ groupCode: 'GENERAL' }).lean() as any;
  if (!group) {
    group = await CompatibilityGroupModel.create({
      groupCode:      'GENERAL',
      groupName:      'General',
      description:    'Placeholder group for initial cargo product seed',
      canCoexistWith: [],
      color:          '#64748b',
      createdBy:      'system',
    });
    console.log('✓ Created placeholder CompatibilityGroup: GENERAL');
  } else {
    console.log('✓ Using existing CompatibilityGroup: GENERAL');
  }

  const groupId   = (group._id ?? group.id).toString();
  const groupCode = group.groupCode as string;

  for (const p of products) {
    const result = await CargoProductModel.updateOne(
      { code: p.code },
      {
        $setOnInsert: {
          ...p,
          compatibilityGroupId:   groupId,
          compatibilityGroupCode: groupCode,
          createdBy:              'system',
          active:                 true,
        },
      },
      { upsert: true }
    );
    const action = result.upsertedCount > 0 ? 'inserted' : 'skipped (exists)';
    console.log(`✓ ${p.code.padEnd(7)} — ${p.name.padEnd(20)} ${p.temperature >= 0 ? '+' : ''}${p.temperature}°C  [${action}]`);
  }

  console.log('\nDone.');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
