// ============================================================================
// VOYAGE SERVER ACTIONS
// Manages vessel voyages with port-level locking
//
// CHANGE #2: PORT-LEVEL LOCKING (CRITICAL)
// Each port can be locked independently when the ship departs
// NOT locking the entire voyage - only specific ports
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { VoyageModel, VesselModel, StowagePlanModel } from '@/lib/db/schemas';
import type { Voyage, VoyagePortCall } from '@/types/models';

// ----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

const VoyageIdSchema = z.string().min(1, 'Voyage ID is required');

const VoyageNumberSchema = z.string()
  .regex(/^[A-Z0-9-]+$/, 'Voyage number must be alphanumeric with hyphens');

const PortCallSchema = z.object({
  portCode: z.string().min(4).max(6),
  portName: z.string().min(1),
  country: z.string().min(1),
  sequence: z.number().int().positive(),
  eta: z.date().optional(),
  etd: z.date().optional(),
  locked: z.boolean().default(false),
});

const CreateVoyageSchema = z.object({
  voyageNumber: VoyageNumberSchema,
  serviceId: z.string().min(1, 'Service ID is required'),
  vesselId: z.string().min(1, 'Vessel ID is required'),
  departureDate: z.date(),
  arrivalDate: z.date(),
  portCalls: z.array(PortCallSchema).min(2, 'Voyage must have at least 2 ports'),
  status: z.enum(['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED']).default('PLANNED'),
});

const UpdateVoyageSchema = CreateVoyageSchema.partial();

// ----------------------------------------------------------------------------
// CREATE VOYAGE FROM WIZARD
// Accepts string dates from the UI wizard, converts and saves with correct field names
// ----------------------------------------------------------------------------

const WizardPortCallSchema = z.object({
  portCode: z.string().min(4).max(6),
  portName: z.string().min(1),
  country: z.string().min(1),
  sequence: z.number().int().positive(),
  eta: z.string().optional(),
  etd: z.string().optional(),
  operations: z.array(z.enum(['LOAD', 'DISCHARGE'])).default(['LOAD']),
});

const CreateVoyageFromWizardSchema = z.object({
  voyageNumber: z.string().regex(/^[A-Z0-9-]+$/, 'Voyage number must be uppercase alphanumeric with hyphens'),
  serviceId: z.string().min(1),
  vesselId: z.string().min(1),
  vesselName: z.string().min(1),
  departureDate: z.string().min(1),
  portCalls: z.array(WizardPortCallSchema).min(2, 'Voyage must have at least 2 ports'),
});

export async function createVoyageFromWizard(data: unknown) {
  try {
    const validated = CreateVoyageFromWizardSchema.parse(data);

    await connectDB();

    // Check duplicate voyage number
    const existing = await VoyageModel.findOne({ voyageNumber: validated.voyageNumber });
    if (existing) {
      return { success: false, error: `Voyage number ${validated.voyageNumber} already exists` };
    }

    // Build portCalls with Date objects
    const portCalls = validated.portCalls.map(pc => ({
      portCode: pc.portCode,
      portName: pc.portName,
      country: pc.country,
      sequence: pc.sequence,
      eta: pc.eta ? new Date(pc.eta) : undefined,
      etd: pc.etd ? new Date(pc.etd) : undefined,
      operations: pc.operations,
      status: 'SCHEDULED',
      locked: false,
    }));

    // Estimated arrival = last port's ETD or ETA
    const lastPort = portCalls[portCalls.length - 1];
    const estimatedArrivalDate = lastPort.etd || lastPort.eta || new Date(validated.departureDate);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const voyage: any = await VoyageModel.create({
      voyageNumber: validated.voyageNumber,
      serviceId: validated.serviceId,
      vesselId: validated.vesselId,
      vesselName: validated.vesselName,
      departureDate: new Date(validated.departureDate),
      estimatedArrivalDate,
      status: 'PLANNED',
      portCalls,
    } as any);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(voyage)),
      voyageId: voyage._id.toString(),
      message: `Voyage ${validated.voyageNumber} created successfully`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { success: false, error: `Validation error: ${(error as any).errors?.[0]?.message ?? error.message}` };
    }
    console.error('Error creating voyage from wizard:', error);
    return { success: false, error: 'Failed to create voyage' };
  }
}

// ----------------------------------------------------------------------------
// CREATE VOYAGE
// Creates a new voyage with port calls
// ----------------------------------------------------------------------------

export async function createVoyage(data: unknown) {
  try {
    const validated = CreateVoyageSchema.parse(data);
    
    await connectDB();
    
    // Check if voyage number already exists
    const existing = await VoyageModel.findOne({
      voyageNumber: validated.voyageNumber,
    });
    
    if (existing) {
      return {
        success: false,
        error: `Voyage number ${validated.voyageNumber} already exists`,
      };
    }
    
    // Validate port sequence (must be consecutive)
    const sequences = validated.portCalls.map(p => p.sequence).sort((a, b) => a - b);
    for (let i = 0; i < sequences.length; i++) {
      if (sequences[i] !== i + 1) {
        return {
          success: false,
          error: 'Port sequence must be consecutive starting from 1',
        };
      }
    }
    
    // Validate dates
    if (validated.arrivalDate <= validated.departureDate) {
      return {
        success: false,
        error: 'Arrival date must be after departure date',
      };
    }
    
    // IMPORTANT: All ports start unlocked
    const portCallsWithDefaults = validated.portCalls.map(pc => ({
      ...pc,
      locked: false,
    }));
    
    const voyage = await VoyageModel.create({
      ...validated,
      portCalls: portCallsWithDefaults,
    });
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(voyage)),
      message: `Voyage ${validated.voyageNumber} created successfully`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors[0].message}`,
      };
    }
    console.error('Error creating voyage:', error);
    return {
      success: false,
      error: 'Failed to create voyage',
    };
  }
}

// ----------------------------------------------------------------------------
// LOCK PORT (CRITICAL FEATURE)
// CHANGE #2: Lock a specific port when vessel departs
// This prevents modifications to cargo for that port
// ----------------------------------------------------------------------------

export async function lockPort(
  voyageId: unknown,
  portCode: unknown
) {
  try {
    const id = VoyageIdSchema.parse(voyageId);
    const code = z.string().parse(portCode);
    
    await connectDB();
    
    const voyage = await VoyageModel.findById(id);
    
    if (!voyage) {
      return { success: false, error: 'Voyage not found' };
    }
    
    // Find the port in portCalls array
    const portCall = voyage.portCalls.find(p => p.portCode === code);
    
    if (!portCall) {
      return {
        success: false,
        error: `Port ${code} not found in voyage ${voyage.voyageNumber}`,
      };
    }
    
    // Check if already locked
    if (portCall.locked) {
      return {
        success: false,
        error: `Port ${portCall.portName} is already locked`,
      };
    }
    
    // Lock the port
    portCall.locked = true;
    portCall.lockedAt = new Date();
    
    await voyage.save();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(voyage)),
      message: `Port ${portCall.portName} locked successfully. Cargo for this port cannot be modified.`,
    };
  } catch (error) {
    console.error('Error locking port:', error);
    return {
      success: false,
      error: 'Failed to lock port',
    };
  }
}

// ----------------------------------------------------------------------------
// UNLOCK PORT (CRITICAL FEATURE)
// Unlocks a port (admin only - rare operation)
// ----------------------------------------------------------------------------

export async function unlockPort(
  voyageId: unknown,
  portCode: unknown
) {
  try {
    const id = VoyageIdSchema.parse(voyageId);
    const code = z.string().parse(portCode);
    
    await connectDB();
    
    const voyage = await VoyageModel.findById(id);
    
    if (!voyage) {
      return { success: false, error: 'Voyage not found' };
    }
    
    const portCall = voyage.portCalls.find(p => p.portCode === code);
    
    if (!portCall) {
      return {
        success: false,
        error: `Port ${code} not found in voyage`,
      };
    }
    
    if (!portCall.locked) {
      return {
        success: false,
        error: `Port ${portCall.portName} is not locked`,
      };
    }
    
    // Unlock the port
    portCall.locked = false;
    portCall.lockedAt = undefined;
    
    await voyage.save();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(voyage)),
      message: `Port ${portCall.portName} unlocked`,
    };
  } catch (error) {
    console.error('Error unlocking port:', error);
    return {
      success: false,
      error: 'Failed to unlock port',
    };
  }
}

// ----------------------------------------------------------------------------
// GET LOCKED PORTS
// Returns list of locked ports for a voyage
// ----------------------------------------------------------------------------

export async function getLockedPorts(voyageId: unknown) {
  try {
    const id = VoyageIdSchema.parse(voyageId);
    
    await connectDB();
    
    const voyage = await VoyageModel.findById(id)
      .select('voyageNumber portCalls')
      .lean();
    
    if (!voyage) {
      return { success: false, error: 'Voyage not found' };
    }
    
    const lockedPorts = voyage.portCalls
      .filter(pc => pc.locked)
      .map(pc => ({
        portCode: pc.portCode,
        portName: pc.portName,
        sequence: pc.sequence,
        lockedAt: pc.lockedAt,
      }));
    
    return {
      success: true,
      data: {
        voyageNumber: voyage.voyageNumber,
        lockedPorts: JSON.parse(JSON.stringify(lockedPorts)),
        totalLocked: lockedPorts.length,
        totalPorts: voyage.portCalls.length,
      },
    };
  } catch (error) {
    console.error('Error getting locked ports:', error);
    return {
      success: false,
      error: 'Failed to get locked ports',
    };
  }
}

// ----------------------------------------------------------------------------
// CHECK IF PORT IS LOCKED
// Returns true if port is locked in the voyage
// ----------------------------------------------------------------------------

export async function isPortLocked(
  voyageId: unknown,
  portCode: unknown
): Promise<{ success: boolean; locked?: boolean; error?: string }> {
  try {
    const id = VoyageIdSchema.parse(voyageId);
    const code = z.string().parse(portCode);
    
    await connectDB();
    
    const voyage = await VoyageModel.findById(id)
      .select('portCalls')
      .lean();
    
    if (!voyage) {
      return { success: false, error: 'Voyage not found' };
    }
    
    const portCall = voyage.portCalls.find(p => p.portCode === code);
    
    if (!portCall) {
      return { success: false, error: 'Port not found in voyage' };
    }
    
    return {
      success: true,
      locked: portCall.locked || false,
    };
  } catch (error) {
    console.error('Error checking port lock status:', error);
    return {
      success: false,
      error: 'Failed to check port lock status',
    };
  }
}

// ----------------------------------------------------------------------------
// UPDATE VOYAGE
// ----------------------------------------------------------------------------

export async function updateVoyage(
  voyageId: unknown,
  updates: unknown
) {
  try {
    const id = VoyageIdSchema.parse(voyageId);
    const validated = UpdateVoyageSchema.parse(updates);
    
    await connectDB();
    
    // If updating voyage number, check for duplicates
    if (validated.voyageNumber) {
      const existing = await VoyageModel.findOne({
        voyageNumber: validated.voyageNumber,
        _id: { $ne: id },
      });
      
      if (existing) {
        return {
          success: false,
          error: `Voyage number ${validated.voyageNumber} already exists`,
        };
      }
    }
    
    const voyage = await VoyageModel.findByIdAndUpdate(
      id,
      { $set: validated },
      { new: true, runValidators: true }
    );
    
    if (!voyage) {
      return { success: false, error: 'Voyage not found' };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(voyage)),
      message: 'Voyage updated successfully',
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors[0].message}`,
      };
    }
    console.error('Error updating voyage:', error);
    return {
      success: false,
      error: 'Failed to update voyage',
    };
  }
}

// ----------------------------------------------------------------------------
// DELETE VOYAGE
// Soft delete - sets status to CANCELLED
// ----------------------------------------------------------------------------

export async function deleteVoyage(voyageId: unknown) {
  try {
    const id = VoyageIdSchema.parse(voyageId);

    await connectDB();

    // Guard: cannot cancel a voyage that still has stowage plans
    const planCount = await StowagePlanModel.countDocuments({ voyageId: id });
    if (planCount > 0) {
      return {
        success: false,
        error: `Cannot cancel voyage: ${planCount} stowage plan${planCount > 1 ? 's' : ''} must be deleted first`,
        blockedBy: { plans: planCount },
      };
    }

    const voyage = await VoyageModel.findByIdAndUpdate(
      id,
      { status: 'CANCELLED' },
      { new: true }
    );

    if (!voyage) {
      return { success: false, error: 'Voyage not found' };
    }

    return {
      success: true,
      message: `Voyage ${voyage.voyageNumber} cancelled successfully`,
    };
  } catch (error) {
    console.error('Error deleting voyage:', error);
    return {
      success: false,
      error: 'Failed to delete voyage',
    };
  }
}

// ----------------------------------------------------------------------------
// GET ALL VOYAGES
// ----------------------------------------------------------------------------

export async function getVoyages() {
  try {
    await connectDB();
    
    const voyages = await VoyageModel.find()
      .populate('vesselId', 'name imoNumber')
      .populate('serviceId', 'serviceCode serviceName')
      .sort({ departureDate: -1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(voyages)),
    };
  } catch (error) {
    console.error('Error fetching voyages:', error);
    return {
      success: false,
      error: 'Failed to fetch voyages',
    };
  }
}

// ----------------------------------------------------------------------------
// GET ACTIVE VOYAGES
// Returns voyages with PLANNED or ACTIVE status
// ----------------------------------------------------------------------------

export async function getActiveVoyages() {
  try {
    await connectDB();
    
    const voyages = await VoyageModel.find({
      status: { $in: ['PLANNED', 'ACTIVE'] },
    })
      .populate('vesselId', 'name')
      .populate('serviceId', 'serviceCode')
      .sort({ departureDate: 1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(voyages)),
    };
  } catch (error) {
    console.error('Error fetching active voyages:', error);
    return {
      success: false,
      error: 'Failed to fetch active voyages',
    };
  }
}

// ----------------------------------------------------------------------------
// GET VOYAGE BY ID
// ----------------------------------------------------------------------------

export async function getVoyageById(voyageId: unknown) {
  try {
    const id = VoyageIdSchema.parse(voyageId);
    
    await connectDB();
    
    const voyage = await VoyageModel.findById(id)
      .populate('vesselId')
      .populate('serviceId')
      .lean();
    
    if (!voyage) {
      return { success: false, error: 'Voyage not found' };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(voyage)),
    };
  } catch (error) {
    console.error('Error fetching voyage:', error);
    return {
      success: false,
      error: 'Failed to fetch voyage',
    };
  }
}

// ----------------------------------------------------------------------------
// GET VOYAGE BY NUMBER
// ----------------------------------------------------------------------------

export async function getVoyageByNumber(voyageNumber: unknown) {
  try {
    const number = VoyageNumberSchema.parse(voyageNumber);
    
    await connectDB();
    
    const voyage = await VoyageModel.findOne({ voyageNumber: number })
      .populate('vesselId')
      .populate('serviceId')
      .lean();
    
    if (!voyage) {
      return { success: false, error: 'Voyage not found' };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(voyage)),
    };
  } catch (error) {
    console.error('Error fetching voyage by number:', error);
    return {
      success: false,
      error: 'Failed to fetch voyage',
    };
  }
}

// ----------------------------------------------------------------------------
// GET VOYAGES BY VESSEL
// ----------------------------------------------------------------------------

export async function getVoyagesByVessel(vesselId: unknown) {
  try {
    const id = z.string().parse(vesselId);
    
    await connectDB();
    
    const voyages = await VoyageModel.find({ vesselId: id })
      .populate('serviceId', 'serviceCode serviceName')
      .sort({ departureDate: -1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(voyages)),
    };
  } catch (error) {
    console.error('Error fetching voyages by vessel:', error);
    return {
      success: false,
      error: 'Failed to fetch voyages',
    };
  }
}

// ----------------------------------------------------------------------------
// GET VOYAGES BY SERVICE
// ----------------------------------------------------------------------------

export async function getVoyagesByService(serviceId: unknown) {
  try {
    const id = z.string().parse(serviceId);
    
    await connectDB();
    
    const voyages = await VoyageModel.find({ serviceId: id })
      .populate('vesselId', 'name')
      .sort({ departureDate: -1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(voyages)),
    };
  } catch (error) {
    console.error('Error fetching voyages by service:', error);
    return {
      success: false,
      error: 'Failed to fetch voyages',
    };
  }
}

// ----------------------------------------------------------------------------
// GET VOYAGE PORT SEQUENCE
// Returns ordered list of ports with lock status
// ----------------------------------------------------------------------------

export async function getVoyagePortSequence(voyageId: unknown) {
  try {
    const id = VoyageIdSchema.parse(voyageId);
    
    await connectDB();
    
    const voyage = await VoyageModel.findById(id)
      .select('voyageNumber portCalls')
      .lean();
    
    if (!voyage) {
      return { success: false, error: 'Voyage not found' };
    }
    
    const sortedPorts = voyage.portCalls
      .sort((a, b) => a.sequence - b.sequence)
      .map(pc => ({
        sequence: pc.sequence,
        portCode: pc.portCode,
        portName: pc.portName,
        country: pc.country,
        eta: pc.eta,
        etd: pc.etd,
        locked: pc.locked || false,
        lockedAt: pc.lockedAt,
      }));
    
    return {
      success: true,
      data: {
        voyageNumber: voyage.voyageNumber,
        ports: JSON.parse(JSON.stringify(sortedPorts)),
      },
    };
  } catch (error) {
    console.error('Error fetching voyage port sequence:', error);
    return {
      success: false,
      error: 'Failed to fetch port sequence',
    };
  }
}

// ----------------------------------------------------------------------------
// GET FLEET STATUS (for sidebar widget)
// Returns vessel counts grouped by operational status
// ----------------------------------------------------------------------------

export async function getFleetStatus(): Promise<{
  inTransit: number;
  confirmed: number;
  planned: number;
}> {
  try {
    await connectDB();
    const [inTransit, confirmed, planned] = await Promise.all([
      VoyageModel.countDocuments({ status: 'IN_PROGRESS' }),
      VoyageModel.countDocuments({ status: 'CONFIRMED' }),
      VoyageModel.countDocuments({ status: 'PLANNED' }),
    ]);
    return { inTransit, confirmed, planned };
  } catch {
    return { inTransit: 0, confirmed: 0, planned: 0 };
  }
}
