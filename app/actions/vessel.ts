// ============================================================================
// VESSEL SERVER ACTIONS
// CRUD operations for vessels (ships)
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { VesselModel, VoyageModel, StowagePlanModel } from '@/lib/db/schemas';
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
      throw new Error(`Validation error: ${error.issues[0].message}`);
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
      throw new Error(`Validation error: ${error.issues[0].message}`);
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
      throw new Error(`Validation error: ${error.issues[0].message}`);
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
      .select('temperatureZones maxTemperatureZones')
      .lean();

    if (!vessel) {
      throw new Error('Vessel not found');
    }

    return JSON.parse(JSON.stringify({
      temperatureZones: vessel.temperatureZones,
      maxTemperatureZones: vessel.maxTemperatureZones,
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation error: ${error.issues[0].message}`);
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
      .select('holds temperatureZones')
      .lean();

    if (!vessel) {
      throw new Error('Vessel not found');
    }

    // Flatten all compartments from all holds
    const compartments = vessel.holds.flatMap((hold: any) =>
      hold.compartments.map((comp: any) => ({
        ...comp,
        holdNumber: hold.holdNumber,
        coolingSectionId: vessel.temperatureZones.find((cs: any) =>
          cs.coolingSections.some((s: any) => s.sectionId === comp.id)
        )?.zoneId || null,
      }))
    );
    
    return JSON.parse(JSON.stringify(compartments));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation error: ${error.issues[0].message}`);
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
      throw new Error(`Validation error: ${error.issues[0].message}`);
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
    const zoneId = z.string().parse(coolingSectionId);
    const temp = z.number().min(-30).max(20).parse(temperature);

    await connectDB();

    const vessel = await VesselModel.findById(id).lean();

    if (!vessel) {
      throw new Error('Vessel not found');
    }

    const coolingSection = vessel.temperatureZones.find(
      (cs: any) => cs.zoneId === zoneId
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
        message: `Cooling section ${zoneId} is already set to ${coolingSection.currentTemperature}°C. All compartments in this section must share the same temperature.`,
      };
    }

    // If section is locked, cannot change temperature
    if (coolingSection.locked) {
      return {
        valid: false,
        message: `Cooling section ${zoneId} is locked and cannot be modified.`,
      };
    }
    
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation error: ${error.issues[0].message}`);
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

// ----------------------------------------------------------------------------
// RECALCULATE HISTORICAL STOWAGE FACTORS
// Called when a voyage is marked COMPLETED.
// For each compartment in the voyage's stowage plan, computes actualFactor =
// palletsLoaded / sqm and updates the vessel's historicalStowageFactor using
// a weighted rolling average: newAvg = (oldAvg * n + actual) / (n + 1)
// ----------------------------------------------------------------------------

export async function recalculateHistoricalFactors(voyageId: unknown) {
  try {
    const id = z.string().min(1).parse(voyageId);
    await connectDB();

    // Fetch the voyage to get vesselId
    const voyage = await VoyageModel.findById(id).lean() as any;
    if (!voyage) return { success: false, error: 'Voyage not found' };

    const vesselId = voyage.vesselId?.toString();
    if (!vesselId) return { success: false, error: 'Voyage has no vessel' };

    // Fetch the vessel
    const vessel = await VesselModel.findById(vesselId).lean() as any;
    if (!vessel) return { success: false, error: 'Vessel not found' };

    // Fetch the most recent stowage plan for this voyage
    const plan = await StowagePlanModel.findOne({ voyageId: id })
      .sort({ createdAt: -1 })
      .lean() as any;
    if (!plan) return { success: false, error: 'No stowage plan found for this voyage' };

    // Build a map of compartmentId → palletsLoaded from cargoPositions
    const loadedBySection = new Map<string, number>();
    for (const pos of plan.cargoPositions ?? []) {
      const compId = pos.compartment?.id;
      if (!compId) continue;
      loadedBySection.set(compId, (loadedBySection.get(compId) ?? 0) + (pos.quantity ?? 0));
    }

    // Build a map of sectionId → { sqm, designStowageFactor, historicalStowageFactor, historicalVoyageCount }
    // from vessel.temperatureZones[].coolingSections[]
    const sectionData = new Map<string, {
      zoneIdx: number; sectionIdx: number;
      sqm: number; historicalStowageFactor?: number; historicalVoyageCount: number;
    }>();
    for (let zi = 0; zi < (vessel.temperatureZones ?? []).length; zi++) {
      const zone = vessel.temperatureZones[zi];
      for (let si = 0; si < (zone.coolingSections ?? []).length; si++) {
        const sec = zone.coolingSections[si];
        sectionData.set(sec.sectionId, {
          zoneIdx: zi,
          sectionIdx: si,
          sqm: sec.sqm ?? 0,
          historicalStowageFactor: sec.historicalStowageFactor ?? undefined,
          historicalVoyageCount: sec.historicalVoyageCount ?? 0,
        });
      }
    }

    // Compute updates
    const updates: { path: string; value: number }[] = [];
    for (const [sectionId, loaded] of loadedBySection) {
      const sec = sectionData.get(sectionId);
      if (!sec || sec.sqm <= 0 || loaded <= 0) continue;

      const actualFactor = loaded / sec.sqm;
      const n = sec.historicalVoyageCount;
      const oldAvg = sec.historicalStowageFactor ?? actualFactor;
      const newAvg = n > 0 ? (oldAvg * n + actualFactor) / (n + 1) : actualFactor;

      const basePath = `temperatureZones.${sec.zoneIdx}.coolingSections.${sec.sectionIdx}`;
      updates.push({ path: `${basePath}.historicalStowageFactor`, value: Math.round(newAvg * 10000) / 10000 });
      updates.push({ path: `${basePath}.historicalVoyageCount`, value: n + 1 });
    }

    if (updates.length === 0) {
      return { success: true, updated: 0, message: 'No loaded compartments — nothing to update' };
    }

    // Apply all updates in a single $set
    const $set: Record<string, number> = {};
    for (const u of updates) $set[u.path] = u.value;
    await VesselModel.updateOne({ _id: vesselId }, { $set });

    return { success: true, updated: updates.length / 2 };
  } catch (error) {
    console.error('Error recalculating historical stowage factors:', error);
    return { success: false, error: 'Failed to recalculate historical stowage factors' };
  }
}
