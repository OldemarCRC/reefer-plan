// ============================================================================
// VESSEL SERVER ACTIONS
// CRUD operations for vessels (ships)
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { VesselModel, VoyageModel } from '@/lib/db/schemas';
import type { Vessel } from '@/types/models';

// ----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

const VesselIdSchema = z.string().min(1, 'Vessel ID is required');

const VesselNameSchema = z.string()
  .min(1, 'Vessel name is required')
  .max(200, 'Vessel name too long');

// ----------------------------------------------------------------------------
// GET ALL VESSELS
// ----------------------------------------------------------------------------

export async function getVessels(): Promise<Vessel[]> {
  try {
    await connectDB();
    
    const vessels = await VesselModel.find()
      .sort({ name: 1 })
      .lean();
    
    // Convert MongoDB documents to plain objects
    return JSON.parse(JSON.stringify(vessels));
  } catch (error) {
    console.error('Error fetching vessels:', error);
    throw new Error('Failed to fetch vessels');
  }
}

// ----------------------------------------------------------------------------
// GET VESSEL BY ID
// ----------------------------------------------------------------------------

export async function getVesselById(id: unknown): Promise<Vessel | null> {
  try {
    // Validate input
    const vesselId = VesselIdSchema.parse(id);
    
    await connectDB();
    
    const vessel = await VesselModel.findById(vesselId).lean();
    
    if (!vessel) {
      return null;
    }
    
    return JSON.parse(JSON.stringify(vessel));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation error: ${error.errors[0].message}`);
    }
    console.error('Error fetching vessel by ID:', error);
    throw new Error('Failed to fetch vessel');
  }
}

// ----------------------------------------------------------------------------
// GET VESSEL BY NAME
// ----------------------------------------------------------------------------

export async function getVesselByName(name: unknown): Promise<Vessel | null> {
  try {
    // Validate input
    const vesselName = VesselNameSchema.parse(name);
    
    await connectDB();
    
    const vessel = await VesselModel.findOne({ 
      name: { $regex: new RegExp(`^${vesselName}$`, 'i') } 
    }).lean();
    
    if (!vessel) {
      return null;
    }
    
    return JSON.parse(JSON.stringify(vessel));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation error: ${error.errors[0].message}`);
    }
    console.error('Error fetching vessel by name:', error);
    throw new Error('Failed to fetch vessel');
  }
}

// ----------------------------------------------------------------------------
// GET VESSEL BY IMO NUMBER
// ----------------------------------------------------------------------------

export async function getVesselByImo(imoNumber: unknown): Promise<Vessel | null> {
  try {
    // Validate IMO number (7 digits)
    const imoSchema = z.string().regex(/^\d{7}$/, 'Invalid IMO number format');
    const imo = imoSchema.parse(imoNumber);
    
    await connectDB();
    
    const vessel = await VesselModel.findOne({ imoNumber: imo }).lean();
    
    if (!vessel) {
      return null;
    }
    
    return JSON.parse(JSON.stringify(vessel));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation error: ${error.errors[0].message}`);
    }
    console.error('Error fetching vessel by IMO:', error);
    throw new Error('Failed to fetch vessel');
  }
}

// ----------------------------------------------------------------------------
// GET ACTIVE VESSELS
// ----------------------------------------------------------------------------

export async function getActiveVessels(): Promise<Vessel[]> {
  try {
    await connectDB();
    
    const vessels = await VesselModel.find({ active: true })
      .sort({ name: 1 })
      .lean();
    
    return JSON.parse(JSON.stringify(vessels));
  } catch (error) {
    console.error('Error fetching active vessels:', error);
    throw new Error('Failed to fetch active vessels');
  }
}

// ----------------------------------------------------------------------------
// GET VESSEL COOLING SECTIONS
// Returns the cooling sections configuration for a vessel
// CRITICAL: Used for temperature validation in stowage planning
// ----------------------------------------------------------------------------

export async function getVesselCoolingSections(vesselId: unknown) {
  try {
    const id = VesselIdSchema.parse(vesselId);
    
    await connectDB();
    
    const vessel = await VesselModel.findById(id)
      .select('coolingSections maxTemperatureZones')
      .lean();
    
    if (!vessel) {
      throw new Error('Vessel not found');
    }
    
    return JSON.parse(JSON.stringify({
      coolingSections: vessel.coolingSections,
      maxTemperatureZones: vessel.maxTemperatureZones,
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation error: ${error.errors[0].message}`);
    }
    console.error('Error fetching cooling sections:', error);
    throw new Error('Failed to fetch cooling sections');
  }
}

// ----------------------------------------------------------------------------
// GET VESSEL COMPARTMENTS
// Returns all compartments for a vessel with their cooling section assignments
// ----------------------------------------------------------------------------

export async function getVesselCompartments(vesselId: unknown) {
  try {
    const id = VesselIdSchema.parse(vesselId);
    
    await connectDB();
    
    const vessel = await VesselModel.findById(id)
      .select('holds coolingSections')
      .lean();
    
    if (!vessel) {
      throw new Error('Vessel not found');
    }
    
    // Flatten all compartments from all holds
    const compartments = vessel.holds.flatMap(hold => 
      hold.compartments.map(comp => ({
        ...comp,
        holdNumber: hold.holdNumber,
        coolingSectionId: vessel.coolingSections.find(cs => 
          cs.compartmentIds.includes(comp.id)
        )?.sectionId || null,
      }))
    );
    
    return JSON.parse(JSON.stringify(compartments));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation error: ${error.errors[0].message}`);
    }
    console.error('Error fetching compartments:', error);
    throw new Error('Failed to fetch compartments');
  }
}

// ----------------------------------------------------------------------------
// GET VESSEL DECK CAPACITY
// Returns deck container capacity (reefer plugs)
// ----------------------------------------------------------------------------

export async function getVesselDeckCapacity(vesselId: unknown) {
  try {
    const id = VesselIdSchema.parse(vesselId);
    
    await connectDB();
    
    const vessel = await VesselModel.findById(id)
      .select('deckContainerCapacity')
      .lean();
    
    if (!vessel) {
      throw new Error('Vessel not found');
    }
    
    return JSON.parse(JSON.stringify(vessel.deckContainerCapacity));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation error: ${error.errors[0].message}`);
    }
    console.error('Error fetching deck capacity:', error);
    throw new Error('Failed to fetch deck capacity');
  }
}

// ----------------------------------------------------------------------------
// VALIDATE COOLING SECTION TEMPERATURE
// Checks if a temperature can be assigned to a cooling section
// Returns true if valid, throws error if conflicts
// ----------------------------------------------------------------------------

export async function validateCoolingSectionTemperature(
  vesselId: unknown,
  coolingSectionId: unknown,
  temperature: unknown
): Promise<{ valid: boolean; message?: string }> {
  try {
    // Validate inputs
    const id = VesselIdSchema.parse(vesselId);
    const sectionId = z.string().parse(coolingSectionId);
    const temp = z.number().min(-30).max(20).parse(temperature);
    
    await connectDB();
    
    const vessel = await VesselModel.findById(id).lean();
    
    if (!vessel) {
      throw new Error('Vessel not found');
    }
    
    const coolingSection = vessel.coolingSections.find(
      cs => cs.sectionId === sectionId
    );
    
    if (!coolingSection) {
      throw new Error('Cooling section not found');
    }
    
    // If section has assigned temperature and it's different, conflict
    if (
      coolingSection.currentTemperature !== undefined &&
      coolingSection.currentTemperature !== temp
    ) {
      return {
        valid: false,
        message: `Cooling section ${sectionId} is already set to ${coolingSection.currentTemperature}°C. All compartments in this section must share the same temperature.`,
      };
    }
    
    // If section is locked, cannot change temperature
    if (coolingSection.locked) {
      return {
        valid: false,
        message: `Cooling section ${sectionId} is locked and cannot be modified.`,
      };
    }
    
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation error: ${error.errors[0].message}`);
    }
    console.error('Error validating cooling section temperature:', error);
    throw error;
  }
}

// ----------------------------------------------------------------------------
// DELETE VESSEL
// Hard delete — blocked if any voyages reference this vessel.
// Cascade order: delete StowagePlans → cancel Voyages → then call deleteVessel.
// ----------------------------------------------------------------------------

export async function deleteVessel(vesselId: unknown) {
  try {
    const id = VesselIdSchema.parse(vesselId);

    await connectDB();

    // Guard: cannot delete a vessel that still has voyages
    const voyageCount = await VoyageModel.countDocuments({ vesselId: id });
    if (voyageCount > 0) {
      return {
        success: false,
        error: `Cannot delete vessel: ${voyageCount} voyage${voyageCount > 1 ? 's' : ''} must be removed first`,
        blockedBy: { voyages: voyageCount },
      };
    }

    const vessel = await VesselModel.findByIdAndDelete(id);

    if (!vessel) {
      return { success: false, error: 'Vessel not found' };
    }

    return {
      success: true,
      message: `Vessel ${vessel.name} deleted successfully`,
    };
  } catch (error) {
    console.error('Error deleting vessel:', error);
    return {
      success: false,
      error: 'Failed to delete vessel',
    };
  }
}
