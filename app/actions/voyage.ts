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
import { VoyageModel, VesselModel, StowagePlanModel, BookingModel } from '@/lib/db/schemas';
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
  weekNumber: z.number().int().min(1).max(53).optional(),
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
    const portCalls = validated.portCalls.map((pc: any) => ({
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
      weekNumber: validated.weekNumber,
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
    const sequences = validated.portCalls.map((p: any) => p.sequence).sort((a: any, b: any) => a - b);
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
    const portCallsWithDefaults = validated.portCalls.map((pc: any) => ({
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
        error: `Validation error: ${error.issues[0].message}`,
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
    const portCall = voyage.portCalls.find((p: any) => p.portCode === code);
    
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
    
    const portCall = voyage.portCalls.find((p: any) => p.portCode === code);

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
      .filter((pc: any) => pc.locked)
      .map((pc: any) => ({
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
    
    const portCall = voyage.portCalls.find((p: any) => p.portCode === code);

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
        error: `Validation error: ${error.issues[0].message}`,
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

    // Guard: cannot cancel a voyage that still has stowage plans or bookings
    const [planCount, bookingCount] = await Promise.all([
      StowagePlanModel.countDocuments({ voyageId: id }),
      BookingModel.countDocuments({ voyageId: id }),
    ]);
    if (planCount > 0 || bookingCount > 0) {
      const reasons: string[] = [];
      if (planCount > 0) reasons.push(`${planCount} stowage plan${planCount > 1 ? 's' : ''}`);
      if (bookingCount > 0) reasons.push(`${bookingCount} booking${bookingCount > 1 ? 's' : ''}`);
      return {
        success: false,
        error: `Cannot cancel voyage: ${reasons.join(' and ')} must be removed first`,
        blockedBy: { plans: planCount, bookings: bookingCount },
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
// HARD DELETE VOYAGE (admin only — removes document from DB)
// Only allowed when voyage has zero stowage plans AND zero bookings.
// For operational cancellations, use deleteVoyage (soft cancel).
// ----------------------------------------------------------------------------

export async function hardDeleteVoyage(voyageId: unknown) {
  try {
    const id = VoyageIdSchema.parse(voyageId);

    await connectDB();

    const [planCount, bookingCount] = await Promise.all([
      StowagePlanModel.countDocuments({ voyageId: id }),
      BookingModel.countDocuments({ voyageId: id }),
    ]);

    if (planCount > 0 || bookingCount > 0) {
      const reasons: string[] = [];
      if (planCount > 0) reasons.push(`${planCount} stowage plan${planCount > 1 ? 's' : ''}`);
      if (bookingCount > 0) reasons.push(`${bookingCount} booking${bookingCount > 1 ? 's' : ''}`);
      return {
        success: false,
        error: `Cannot delete voyage: ${reasons.join(' and ')} must be removed first`,
        blockedBy: { plans: planCount, bookings: bookingCount },
      };
    }

    const voyage = await VoyageModel.findByIdAndDelete(id).lean();
    if (!voyage) {
      return { success: false, error: 'Voyage not found' };
    }

    return {
      success: true,
      message: `Voyage ${(voyage as any).voyageNumber} permanently deleted`,
    };
  } catch (error) {
    console.error('Error hard-deleting voyage:', error);
    return { success: false, error: 'Failed to delete voyage' };
  }
}

// ----------------------------------------------------------------------------
// UPDATE PORT ROTATION (post-creation port call editing)
// Handles: cancel, restore, add, reorder, date changes.
// Each change appends an entry to voyage.portCallChangelog[].
// ----------------------------------------------------------------------------

export interface PortCallChange {
  action: 'CANCEL' | 'RESTORE' | 'ADD' | 'REORDER' | 'DATE_CHANGED' | 'CHANGE_PORT';
  portCode: string;       // current portCode (identifies which port call to modify)
  portName?: string;
  country?: string;
  sequence?: number;
  eta?: string;           // ISO date string
  etd?: string;           // ISO date string
  operations?: ('LOAD' | 'DISCHARGE')[];
  reason?: string;
  // For CHANGE_PORT action:
  newPortCode?: string;
  newPortName?: string;
}

export async function updatePortRotation(
  voyageId: unknown,
  changes: PortCallChange[],
  globalReason?: string,
) {
  try {
    const id = z.string().min(1).parse(voyageId);
    await connectDB();

    // Use lean() to get plain JS objects — avoids Mongoose doc validation on old subdocs
    const voyage = await VoyageModel.findById(id).lean();
    if (!voyage) return { success: false, error: 'Voyage not found' };

    const now = new Date();
    const changedBy = 'SYSTEM'; // TODO: replace with session user when auth added
    const changelogEntries: object[] = [];

    // Work on a mutable copy of portCalls (plain objects from lean)
    const portCalls: any[] = (voyage.portCalls as any[]).map((pc: any) => ({ ...pc }));

    for (const change of changes) {
      const reason = change.reason ?? globalReason;

      if (change.action === 'CANCEL') {
        const pc = portCalls.find((p: any) => p.portCode === change.portCode);
        if (!pc) continue;
        changelogEntries.push({
          changedAt: now, changedBy, action: 'CANCELLED',
          portCode: pc.portCode, portName: pc.portName,
          previousValue: pc.status ?? 'SCHEDULED', newValue: 'CANCELLED', reason,
        });
        pc.status = 'CANCELLED';
        pc.cancelledAt = now;
        pc.cancelledBy = changedBy;
        pc.cancellationReason = reason ?? '';

      } else if (change.action === 'RESTORE') {
        const pc = portCalls.find((p: any) => p.portCode === change.portCode);
        if (!pc) continue;
        changelogEntries.push({
          changedAt: now, changedBy, action: 'RESTORED',
          portCode: pc.portCode, portName: pc.portName,
          previousValue: 'CANCELLED', newValue: 'SCHEDULED', reason,
        });
        pc.status = 'SCHEDULED';
        delete pc.cancelledAt;
        delete pc.cancelledBy;
        delete pc.cancellationReason;

      } else if (change.action === 'DATE_CHANGED') {
        const pc = portCalls.find((p: any) => p.portCode === change.portCode);
        if (!pc) continue;

        // Validate: ETA must be before ETD
        const effectiveEta = change.eta !== undefined ? (change.eta ? new Date(change.eta) : undefined) : pc.eta;
        const effectiveEtd = change.etd !== undefined ? (change.etd ? new Date(change.etd) : undefined) : pc.etd;
        if (effectiveEta && effectiveEtd && effectiveEta >= effectiveEtd) {
          return { success: false, error: 'ETA must be before ETD — vessel cannot depart before arriving' };
        }

        const etaStr = pc.eta ? new Date(pc.eta).toISOString().slice(0, 10) : '';
        const etdStr = pc.etd ? new Date(pc.etd).toISOString().slice(0, 10) : '';
        const prev = `ETA:${etaStr},ETD:${etdStr}`;
        if (change.eta !== undefined) pc.eta = change.eta ? new Date(change.eta) : undefined;
        if (change.etd !== undefined) pc.etd = change.etd ? new Date(change.etd) : undefined;
        const etaNew = pc.eta ? new Date(pc.eta).toISOString().slice(0, 10) : '';
        const etdNew = pc.etd ? new Date(pc.etd).toISOString().slice(0, 10) : '';
        changelogEntries.push({
          changedAt: now, changedBy, action: 'DATE_CHANGED',
          portCode: pc.portCode, portName: pc.portName,
          previousValue: prev, newValue: `ETA:${etaNew},ETD:${etdNew}`, reason,
        });

      } else if (change.action === 'CHANGE_PORT') {
        // Rename port code/name/country on an existing port call
        const pc = portCalls.find((p: any) => p.portCode === change.portCode);
        if (!pc || !change.newPortCode) continue;
        const oldInfo = `${pc.portCode}/${pc.portName}`;
        changelogEntries.push({
          changedAt: now, changedBy, action: 'REORDERED', // reuse REORDERED action for audit
          portCode: change.newPortCode, portName: change.newPortName ?? change.newPortCode,
          previousValue: oldInfo, newValue: `${change.newPortCode}/${change.newPortName ?? ''}`, reason,
        });
        pc.portCode = change.newPortCode;
        pc.portName = change.newPortName ?? change.newPortCode;
        if (change.country) pc.country = change.country;

      } else if (change.action === 'REORDER') {
        const pc = portCalls.find((p: any) => p.portCode === change.portCode);
        if (!pc || change.sequence == null) continue;
        const oldSeq = pc.sequence;
        const newSeq = change.sequence;
        if (oldSeq === newSeq) continue;
        portCalls.forEach((p: any) => {
          if (p.portCode === change.portCode) return;
          if (oldSeq < newSeq && p.sequence > oldSeq && p.sequence <= newSeq) p.sequence--;
          else if (oldSeq > newSeq && p.sequence >= newSeq && p.sequence < oldSeq) p.sequence++;
        });
        pc.sequence = newSeq;
        changelogEntries.push({
          changedAt: now, changedBy, action: 'REORDERED',
          portCode: pc.portCode, portName: pc.portName,
          previousValue: String(oldSeq), newValue: String(newSeq), reason,
        });

      } else if (change.action === 'ADD') {
        // Validate: ETA must be before ETD
        if (change.eta && change.etd && new Date(change.eta) >= new Date(change.etd)) {
          return { success: false, error: 'ETA must be before ETD — vessel cannot depart before arriving' };
        }
        const maxSeq = Math.max(0, ...portCalls.map((p: any) => p.sequence));
        const newSeq = change.sequence ?? maxSeq + 1;
        portCalls.forEach((p: any) => { if (p.sequence >= newSeq) p.sequence++; });
        portCalls.push({
          portCode: change.portCode,
          portName: change.portName ?? change.portCode,
          country: change.country ?? '',
          sequence: newSeq,
          eta: change.eta ? new Date(change.eta) : undefined,
          etd: change.etd ? new Date(change.etd) : undefined,
          operations: change.operations ?? ['LOAD'],
          status: 'SCHEDULED',
          locked: false,
          addedPostCreation: true,
        });
        changelogEntries.push({
          changedAt: now, changedBy, action: 'ADDED',
          portCode: change.portCode, portName: change.portName ?? change.portCode,
          newValue: `seq:${newSeq}`, reason,
        });
      }
    }

    // Persist with updateOne — bypasses full-document Mongoose validation
    await VoyageModel.updateOne(
      { _id: id },
      {
        $set: { portCalls },
        $push: changelogEntries.length > 0
          ? { portCallChangelog: { $each: changelogEntries } }
          : {},
      },
    );

    return {
      success: true,
      portCalls: JSON.parse(JSON.stringify(portCalls)),
      message: `${changelogEntries.length} port rotation change(s) saved`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error updating port rotation:', msg);
    return { success: false, error: `Failed to update port rotation: ${msg}` };
  }
}

// ----------------------------------------------------------------------------
// RESEQUENCE PORT CALLS BY ETA
// Sorts SCHEDULED port calls by ETA ascending and assigns sequence 1, 2, 3…
// CANCELLED port calls are placed after scheduled ones, preserving their
// relative order. Called after any date change or new port addition so that
// the sequence field in the DB always reflects ETA order.
// ----------------------------------------------------------------------------

export async function resequencePortCallsByEta(voyageId: unknown) {
  try {
    const id = z.string().min(1).parse(voyageId);
    await connectDB();

    const voyage = await VoyageModel.findById(id).lean();
    if (!voyage) return { success: false, error: 'Voyage not found' };

    const portCalls: any[] = [...((voyage.portCalls as any[]) ?? [])];

    const scheduled = portCalls
      .filter((p: any) => p.status !== 'CANCELLED')
      .sort((a: any, b: any) => {
        const ta = a.eta ? new Date(a.eta).getTime() : Infinity;
        const tb = b.eta ? new Date(b.eta).getTime() : Infinity;
        if (ta !== tb) return ta - tb;
        return (a.sequence ?? 0) - (b.sequence ?? 0); // tie-break by old sequence
      });

    const cancelled = portCalls
      .filter((p: any) => p.status === 'CANCELLED')
      .sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0));

    const resequenced = [
      ...scheduled.map((p: any, i: number) => ({ ...p, sequence: i + 1 })),
      ...cancelled.map((p: any, i: number) => ({ ...p, sequence: scheduled.length + i + 1 })),
    ];

    await VoyageModel.updateOne({ _id: id }, { $set: { portCalls: resequenced } });

    return {
      success: true,
      portCalls: JSON.parse(JSON.stringify(resequenced)),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error resequencing port calls:', msg);
    return { success: false, error: `Failed to resequence: ${msg}` };
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
// GET VOYAGES FOR STOWAGE PLAN WIZARD
// Returns only active voyages, with vessel temperatureZones populated so the
// wizard can render the correct zone table for each vessel type.
// ----------------------------------------------------------------------------

export async function getVoyagesForPlanWizard() {
  try {
    await connectDB();

    const voyages = await VoyageModel.find({
      status: { $in: ['PLANNED', 'CONFIRMED', 'IN_PROGRESS'] },
    })
      .populate('vesselId', 'name temperatureZones')
      .sort({ departureDate: -1 })
      .lean();

    return {
      success: true,
      data: JSON.parse(JSON.stringify(voyages)),
    };
  } catch (error) {
    console.error('Error fetching voyages for plan wizard:', error);
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
      .sort((a: any, b: any) => a.sequence - b.sequence)
      .map((pc: any) => ({
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
// CANCEL VOYAGE (soft cancel — admin, no guard)
// Sets status to CANCELLED regardless of plans or bookings.
// For admin use: preserves full audit trail.
// ----------------------------------------------------------------------------

export async function cancelVoyage(voyageId: unknown) {
  try {
    const id = VoyageIdSchema.parse(voyageId);
    await connectDB();

    const voyage = await VoyageModel.findByIdAndUpdate(
      id,
      { status: 'CANCELLED' },
      { new: true }
    ).lean();

    if (!voyage) {
      return { success: false, error: 'Voyage not found' };
    }

    return {
      success: true,
      message: `Voyage ${(voyage as any).voyageNumber} cancelled`,
    };
  } catch (error) {
    console.error('Error cancelling voyage:', error);
    return { success: false, error: 'Failed to cancel voyage' };
  }
}

// ----------------------------------------------------------------------------
// GET ADMIN VOYAGES — full list with plan + booking counts (for /admin page)
// ----------------------------------------------------------------------------

export async function getAdminVoyages() {
  try {
    await connectDB();

    const voyages = await VoyageModel.find()
      .populate('vesselId', 'name imoNumber')
      .populate('serviceId', 'serviceCode serviceName')
      .sort({ departureDate: -1 })
      .lean();

    // Fetch plan + booking counts for all voyages in parallel
    const ids = voyages.map((v: any) => v._id);
    const [planCounts, bookingCounts] = await Promise.all([
      StowagePlanModel.aggregate([
        { $match: { voyageId: { $in: ids } } },
        { $group: { _id: '$voyageId', count: { $sum: 1 } } },
      ]),
      BookingModel.aggregate([
        { $match: { voyageId: { $in: ids } } },
        { $group: { _id: '$voyageId', count: { $sum: 1 } } },
      ]),
    ]);

    const planMap = Object.fromEntries(planCounts.map((r: any) => [r._id.toString(), r.count]));
    const bookingMap = Object.fromEntries(bookingCounts.map((r: any) => [r._id.toString(), r.count]));

    const data = voyages.map((v: any) => ({
      ...v,
      _id: v._id.toString(),
      planCount: planMap[v._id.toString()] ?? 0,
      bookingCount: bookingMap[v._id.toString()] ?? 0,
    }));

    return { success: true, data: JSON.parse(JSON.stringify(data)) };
  } catch (error) {
    console.error('Error fetching admin voyages:', error);
    return { success: false, error: 'Failed to fetch voyages' };
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
