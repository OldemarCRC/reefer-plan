// ============================================================================
// OFFICE SERVER ACTIONS
// CRUD operations for the offices collection
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { OfficeModel } from '@/lib/db/schemas';

// ----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

const OfficeIdSchema = z.string().min(1, 'Office ID is required');

const CreateOfficeSchema = z.object({
  code: z.string().length(3, 'Office code must be exactly 3 characters').toUpperCase(),
  name: z.string().min(1, 'Name is required').max(100),
  country: z.string().min(1, 'Country is required').max(100),
  active: z.boolean().default(true),
});

const UpdateOfficeSchema = CreateOfficeSchema.partial();

// ----------------------------------------------------------------------------
// GET ALL OFFICES
// ----------------------------------------------------------------------------

export async function getOffices() {
  try {
    await connectDB();
    const offices = await OfficeModel.find().sort({ code: 1 }).lean();
    return { success: true, data: JSON.parse(JSON.stringify(offices)) };
  } catch (error) {
    console.error('Error fetching offices:', error);
    return { success: false, error: 'Failed to fetch offices' };
  }
}

// ----------------------------------------------------------------------------
// GET ACTIVE OFFICES
// ----------------------------------------------------------------------------

export async function getActiveOffices() {
  try {
    await connectDB();
    const offices = await OfficeModel.find({ active: true }).sort({ code: 1 }).lean();
    return { success: true, data: JSON.parse(JSON.stringify(offices)) };
  } catch (error) {
    console.error('Error fetching active offices:', error);
    return { success: false, error: 'Failed to fetch active offices' };
  }
}

// ----------------------------------------------------------------------------
// GET OFFICE BY ID
// ----------------------------------------------------------------------------

export async function getOfficeById(officeId: unknown) {
  try {
    const id = OfficeIdSchema.parse(officeId);
    await connectDB();

    const office = await OfficeModel.findById(id).lean();
    if (!office) {
      return { success: false, error: 'Office not found' };
    }

    return { success: true, data: JSON.parse(JSON.stringify(office)) };
  } catch (error) {
    console.error('Error fetching office:', error);
    return { success: false, error: 'Failed to fetch office' };
  }
}

// ----------------------------------------------------------------------------
// GET OFFICE BY CODE
// ----------------------------------------------------------------------------

export async function getOfficeByCode(code: unknown) {
  try {
    const validCode = z.string().length(3).toUpperCase().parse(code);
    await connectDB();

    const office = await OfficeModel.findOne({ code: validCode }).lean();
    if (!office) {
      return { success: false, error: 'Office not found' };
    }

    return { success: true, data: JSON.parse(JSON.stringify(office)) };
  } catch (error) {
    console.error('Error fetching office by code:', error);
    return { success: false, error: 'Failed to fetch office' };
  }
}

// ----------------------------------------------------------------------------
// CREATE OFFICE
// ----------------------------------------------------------------------------

export async function createOffice(data: unknown) {
  try {
    const validated = CreateOfficeSchema.parse(data);
    await connectDB();

    const existing = await OfficeModel.findOne({ code: validated.code });
    if (existing) {
      return { success: false, error: `Office with code ${validated.code} already exists` };
    }

    const office = await OfficeModel.create(validated);
    return {
      success: true,
      data: JSON.parse(JSON.stringify(office)),
      message: `Office ${validated.code} created successfully`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    console.error('Error creating office:', error);
    return { success: false, error: 'Failed to create office' };
  }
}

// ----------------------------------------------------------------------------
// UPDATE OFFICE
// ----------------------------------------------------------------------------

export async function updateOffice(officeId: unknown, data: unknown) {
  try {
    const id = OfficeIdSchema.parse(officeId);
    const validated = UpdateOfficeSchema.parse(data);
    await connectDB();

    const office = await OfficeModel.findByIdAndUpdate(
      id,
      { $set: validated },
      { new: true, runValidators: true }
    );

    if (!office) {
      return { success: false, error: 'Office not found' };
    }

    return {
      success: true,
      data: JSON.parse(JSON.stringify(office)),
      message: 'Office updated successfully',
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    console.error('Error updating office:', error);
    return { success: false, error: 'Failed to update office' };
  }
}

// ----------------------------------------------------------------------------
// DELETE OFFICE (soft delete — sets active: false)
// ----------------------------------------------------------------------------

export async function deleteOffice(officeId: unknown) {
  try {
    const id = OfficeIdSchema.parse(officeId);
    await connectDB();

    const office = await OfficeModel.findByIdAndUpdate(
      id,
      { $set: { active: false } },
      { new: true }
    );

    if (!office) {
      return { success: false, error: 'Office not found' };
    }

    return {
      success: true,
      data: JSON.parse(JSON.stringify(office)),
      message: `Office ${office.code} deactivated`,
    };
  } catch (error) {
    console.error('Error deleting office:', error);
    return { success: false, error: 'Failed to delete office' };
  }
}
