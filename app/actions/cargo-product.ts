// ============================================================================
// CARGO PRODUCT + COMPATIBILITY GROUP SERVER ACTIONS
// SUPERUSER and ADMIN only for all mutating actions.
// Read actions available to all authenticated users.
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { CompatibilityGroupModel, CargoProductModel } from '@/lib/db/schemas';
import { auth } from '@/auth';
import { toUpperCode, toTitleCase } from '@/lib/utils/normalize';

// ----------------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------------

const MUTATING_ROLES = ['SUPERUSER', 'ADMIN'] as const;

async function requireMutatingRole() {
  const session = await auth();
  if (!session?.user) return { error: 'Unauthorized' as const };
  const role = (session.user as any).role;
  if (!MUTATING_ROLES.includes(role)) return { error: 'Forbidden' as const };
  return { session };
}

function createdByLabel(session: any): string {
  return session.user.name ?? session.user.email ?? 'SYSTEM';
}

// ----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const CreateCompatibilityGroupSchema = z.object({
  groupCode:      z.string().min(2, 'Group code must be at least 2 characters').max(50),
  groupName:      z.string().min(1, 'Group name is required').max(200),
  description:    z.string().max(500).optional(),
  canCoexistWith: z.array(z.string()).default([]),
  color:          z.string().regex(HEX_COLOR_RE, 'Color must be a valid hex color (e.g. #64748b)').default('#64748b'),
});

const UpdateCompatibilityGroupSchema = z.object({
  groupName:      z.string().min(1, 'Group name is required').max(200).optional(),
  description:    z.string().max(500).optional(),
  canCoexistWith: z.array(z.string()).optional(),
  color:          z.string().regex(HEX_COLOR_RE, 'Color must be a valid hex color (e.g. #64748b)').optional(),
  active:         z.boolean().optional(),
});

const CreateCargoProductSchema = z.object({
  code:                 z.string().min(2, 'Code must be at least 2 characters').max(50),
  name:                 z.string().min(1, 'Name is required').max(200),
  shortLabel:           z.string().min(1, 'Short label is required').max(4, 'Short label must be at most 4 characters'),
  compatibilityGroupId: z.string().min(1, 'Compatibility group is required'),
  notes:                z.string().max(500).optional(),
});

const UpdateCargoProductSchema = z.object({
  name:                 z.string().min(1, 'Name is required').max(200).optional(),
  shortLabel:           z.string().min(1, 'Short label is required').max(4, 'Short label must be at most 4 characters').optional(),
  compatibilityGroupId: z.string().min(1, 'Compatibility group is required').optional(),
  notes:                z.string().max(500).optional(),
  active:               z.boolean().optional(),
});

// ============================================================================
// COMPATIBILITY GROUP ACTIONS
// ============================================================================

export async function getCompatibilityGroups() {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, data: [], error: 'Unauthorized' };

    await connectDB();
    const groups = await CompatibilityGroupModel.find({ active: true }).sort({ groupCode: 1 }).lean();
    return { success: true, data: JSON.parse(JSON.stringify(groups)) };
  } catch (error) {
    console.error('Error fetching compatibility groups:', error);
    return { success: false, data: [], error: 'Failed to fetch compatibility groups' };
  }
}

export async function createCompatibilityGroup(data: unknown) {
  try {
    const auth_result = await requireMutatingRole();
    if ('error' in auth_result) return { success: false, error: auth_result.error };

    const validated = CreateCompatibilityGroupSchema.parse(data);
    await connectDB();

    const code = toUpperCode(validated.groupCode);

    const exists = await CompatibilityGroupModel.findOne({ groupCode: code });
    if (exists) {
      return { success: false, error: `Compatibility group code "${code}" already exists` };
    }

    const group = await CompatibilityGroupModel.create({
      groupCode:      code,
      groupName:      toTitleCase(validated.groupName),
      description:    validated.description?.trim(),
      canCoexistWith: validated.canCoexistWith.map((c: string) => toUpperCode(c)),
      color:          validated.color,
      createdBy:      createdByLabel(auth_result.session),
    });

    return { success: true, data: JSON.parse(JSON.stringify(group)) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    console.error('Error creating compatibility group:', error);
    return { success: false, error: 'Failed to create compatibility group' };
  }
}

export async function updateCompatibilityGroup(id: string, data: unknown) {
  try {
    const auth_result = await requireMutatingRole();
    if ('error' in auth_result) return { success: false, error: auth_result.error };

    const validated = UpdateCompatibilityGroupSchema.parse(data);
    await connectDB();

    const setFields: Record<string, unknown> = {};
    if (validated.groupName      !== undefined) setFields.groupName      = toTitleCase(validated.groupName);
    if (validated.description    !== undefined) setFields.description    = validated.description.trim();
    if (validated.canCoexistWith !== undefined) setFields.canCoexistWith = validated.canCoexistWith.map((c: string) => toUpperCode(c));
    if (validated.color          !== undefined) setFields.color          = validated.color;
    if (validated.active         !== undefined) setFields.active         = validated.active;

    const group = await CompatibilityGroupModel.findByIdAndUpdate(
      id,
      { $set: setFields },
      { new: true }
    );
    if (!group) return { success: false, error: 'Compatibility group not found' };

    return { success: true, data: JSON.parse(JSON.stringify(group)) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    console.error('Error updating compatibility group:', error);
    return { success: false, error: 'Failed to update compatibility group' };
  }
}

export async function deleteCompatibilityGroup(id: string) {
  try {
    const auth_result = await requireMutatingRole();
    if ('error' in auth_result) return { success: false, error: auth_result.error };

    await connectDB();

    const count = await CargoProductModel.countDocuments({ compatibilityGroupId: id, active: true });
    if (count > 0) {
      return {
        success: false,
        error: `Cannot delete: ${count} active cargo product${count === 1 ? '' : 's'} reference this group`,
        blockedBy: { count },
      };
    }

    const group = await CompatibilityGroupModel.findByIdAndUpdate(
      id,
      { $set: { active: false } },
      { new: true }
    );
    if (!group) return { success: false, error: 'Compatibility group not found' };

    return { success: true, data: JSON.parse(JSON.stringify(group)) };
  } catch (error) {
    console.error('Error deleting compatibility group:', error);
    return { success: false, error: 'Failed to delete compatibility group' };
  }
}

// ============================================================================
// CARGO PRODUCT ACTIONS
// ============================================================================

export async function getCargoProducts() {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, data: [], error: 'Unauthorized' };

    await connectDB();
    const products = await CargoProductModel
      .find({ active: true })
      .populate('compatibilityGroupId', 'groupCode groupName color')
      .sort({ code: 1 })
      .lean();
    return { success: true, data: JSON.parse(JSON.stringify(products)) };
  } catch (error) {
    console.error('Error fetching cargo products:', error);
    return { success: false, data: [], error: 'Failed to fetch cargo products' };
  }
}

export async function createCargoProduct(data: unknown) {
  try {
    const auth_result = await requireMutatingRole();
    if ('error' in auth_result) return { success: false, error: auth_result.error };

    const validated = CreateCargoProductSchema.parse(data);
    await connectDB();

    const code = toUpperCode(validated.code);

    const exists = await CargoProductModel.findOne({ code });
    if (exists) {
      return { success: false, error: `Cargo product code "${code}" already exists` };
    }

    // Resolve the group's denormalized code
    const group = await CompatibilityGroupModel.findById(validated.compatibilityGroupId).lean() as any;
    if (!group) return { success: false, error: 'Compatibility group not found' };
    if (!group.active) return { success: false, error: 'Compatibility group is inactive' };

    const product = await CargoProductModel.create({
      code,
      name:                   toTitleCase(validated.name),
      shortLabel:             toUpperCode(validated.shortLabel),
      compatibilityGroupId:   validated.compatibilityGroupId,
      compatibilityGroupCode: group.groupCode,
      notes:                  validated.notes?.trim(),
      createdBy:              createdByLabel(auth_result.session),
    });

    return { success: true, data: JSON.parse(JSON.stringify(product)) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    console.error('Error creating cargo product:', error);
    return { success: false, error: 'Failed to create cargo product' };
  }
}

export async function updateCargoProduct(id: string, data: unknown) {
  try {
    const auth_result = await requireMutatingRole();
    if ('error' in auth_result) return { success: false, error: auth_result.error };

    const validated = UpdateCargoProductSchema.parse(data);
    await connectDB();

    const setFields: Record<string, unknown> = {};
    if (validated.name       !== undefined) setFields.name       = toTitleCase(validated.name);
    if (validated.shortLabel !== undefined) setFields.shortLabel = toUpperCode(validated.shortLabel);
    if (validated.notes      !== undefined) setFields.notes      = validated.notes.trim();
    if (validated.active     !== undefined) setFields.active     = validated.active;

    // If group is changing, re-resolve the denormalized code
    if (validated.compatibilityGroupId !== undefined) {
      const group = await CompatibilityGroupModel.findById(validated.compatibilityGroupId).lean() as any;
      if (!group) return { success: false, error: 'Compatibility group not found' };
      if (!group.active) return { success: false, error: 'Compatibility group is inactive' };
      setFields.compatibilityGroupId   = validated.compatibilityGroupId;
      setFields.compatibilityGroupCode = group.groupCode;
    }

    const product = await CargoProductModel.findByIdAndUpdate(
      id,
      { $set: setFields },
      { new: true }
    );
    if (!product) return { success: false, error: 'Cargo product not found' };

    return { success: true, data: JSON.parse(JSON.stringify(product)) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    console.error('Error updating cargo product:', error);
    return { success: false, error: 'Failed to update cargo product' };
  }
}

export async function deleteCargoProduct(id: string) {
  try {
    const auth_result = await requireMutatingRole();
    if ('error' in auth_result) return { success: false, error: auth_result.error };

    await connectDB();

    const product = await CargoProductModel.findByIdAndUpdate(
      id,
      { $set: { active: false } },
      { new: true }
    );
    if (!product) return { success: false, error: 'Cargo product not found' };

    return { success: true, data: JSON.parse(JSON.stringify(product)) };
  } catch (error) {
    console.error('Error deleting cargo product:', error);
    return { success: false, error: 'Failed to delete cargo product' };
  }
}
