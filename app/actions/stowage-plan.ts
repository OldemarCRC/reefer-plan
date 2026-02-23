// ============================================================================
// STOWAGE PLAN SERVER ACTIONS
// Handles stowage planning with cooling section validation
//
// CHANGE #1: Plans can be created 4+ weeks in advance (ESTIMATED status)
// CHANGE #6: Cooling sections - compartments sharing refrigeration must have same temp
// CHANGE #7: Reefer plug limits on deck
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { StowagePlanModel, VesselModel, VoyageModel, BookingModel } from '@/lib/db/schemas';
import type { StowagePlan, StowagePlanStatus } from '@/types/models';
import { sendPlanNotification } from '@/lib/email';

// ISO week number from a date (1–53)
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// WK14-ACONCAGUA_BAY-ACON-062026-0001
// weekNumber takes priority over departureDate. Falls back to ISO week from
// departureDate for old voyages that predate the weekNumber field.
async function generatePlanNumber(
  voyageNumber: string,
  vesselName: string,
  weekNumber?: number,
  departureDate?: Date,
): Promise<string> {
  const week = weekNumber ?? (departureDate ? getISOWeek(departureDate) : getISOWeek(new Date()));
  const wk = `WK${String(week).padStart(2, '0')}`;
  const vessel = vesselName.toUpperCase().replace(/\s+/g, '_');
  const count = await StowagePlanModel.countDocuments({ voyageNumber });
  const seq = String(count + 1).padStart(4, '0');
  return `${wk}-${vessel}-${voyageNumber}-${seq}`;
}

// ----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

const StowagePlanIdSchema = z.string().min(1, 'Plan ID is required');

const CreateStowagePlanSchema = z.object({
  vesselId: z.string().min(1),
  voyageId: z.string().min(1),
  createdBy: z.string().min(1), // User ID
  estimatedDepartureDate: z.date().optional(),
});

const CreatePlanFromWizardSchema = z.object({
  voyageId: z.string().min(1, 'Voyage ID is required'),
  coolingSectionTemps: z.array(z.object({
    coolingSectionId: z.string().min(1),
    targetTemp: z.number().min(-25).max(15),
  })).min(1, 'At least one cooling section temperature is required'),
});

const AssignCargoSchema = z.object({
  planId: z.string().min(1),
  bookingId: z.string().min(1),
  compartmentId: z.string().min(1),
  quantity: z.number().int().positive(),
  temperature: z.number().min(-30).max(20),
});

const AssignDeckContainerSchema = z.object({
  planId: z.string().min(1),
  bookingId: z.string().min(1),
  quantity: z.number().int().positive().max(19), // Max reefer plugs
  temperature: z.number().min(-30).max(20),
});

// ----------------------------------------------------------------------------
// CREATE STOWAGE PLAN
// CHANGE #1: Can create plans weeks in advance with ESTIMATED status
// ----------------------------------------------------------------------------

export async function createStowagePlan(data: unknown) {
  try {
    const validated = CreateStowagePlanSchema.parse(data);
    
    await connectDB();
    
    // Get vessel to initialize cooling sections
    const vessel = await VesselModel.findById(validated.vesselId);
    if (!vessel) {
      return { success: false, error: 'Vessel not found' };
    }

    // Fetch voyage to get weekNumber and voyageNumber
    const voyage = await VoyageModel.findById(validated.voyageId).lean();
    const voyageNumber = (voyage as any)?.voyageNumber ?? (validated as any).voyageNumber ?? '';
    const voyageWeekNumber: number | undefined = (voyage as any)?.weekNumber ?? undefined;

    // Determine initial status based on departure date
    const daysUntilDeparture = validated.estimatedDepartureDate
      ? Math.ceil(
          (validated.estimatedDepartureDate.getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
        )
      : 0;

    const initialStatus: StowagePlanStatus =
      daysUntilDeparture >= 28 ? 'ESTIMATED' : 'DRAFT';

    const planNumber = await generatePlanNumber(
      voyageNumber,
      vessel.name,
      voyageWeekNumber,
      validated.estimatedDepartureDate,
    );

    const plan = await StowagePlanModel.create({
      planNumber,
      vesselId: validated.vesselId,
      voyageId: validated.voyageId,
      status: initialStatus,
      cargoPositions: [],
      coolingSectionStatus: vessel.temperatureZones.map((cs: any) => ({
        zoneId: cs.zoneId,
        coolingSectionIds: cs.coolingSections.map((s: any) => s.sectionId),
        assignedTemperature: undefined,
        locked: false,
        assignedCargo: [],
      })),
      overstowViolations: [],
      temperatureConflicts: [],
      weightDistributionWarnings: [],
      createdBy: validated.createdBy,
    });
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(plan)),
      message: initialStatus === 'ESTIMATED' 
        ? 'Plan created with ESTIMATED status (4+ weeks in advance)'
        : 'Plan created as DRAFT',
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.issues[0].message}`,
      };
    }
    console.error('Error creating stowage plan:', error);
    return {
      success: false,
      error: 'Failed to create stowage plan',
    };
  }
}

// ----------------------------------------------------------------------------
// CREATE STOWAGE PLAN FROM WIZARD
// Called by the new plan wizard — derives vesselId from voyage,
// stores cooling section temperature assignments, returns planId for redirect
// ----------------------------------------------------------------------------

export async function createStowagePlanFromWizard(data: unknown) {
  try {
    const validated = CreatePlanFromWizardSchema.parse(data);

    await connectDB();

    // Resolve voyage to get vessel info and voyage number
    const voyage = await VoyageModel.findById(validated.voyageId).lean();
    if (!voyage) {
      return { success: false, error: 'Voyage not found' };
    }

    const vessel = await VesselModel.findById(voyage.vesselId).lean();
    if (!vessel) {
      return { success: false, error: 'Vessel not found' };
    }

    const planNumber = await generatePlanNumber(
      voyage.voyageNumber,
      vessel.name,
      (voyage as any).weekNumber ?? undefined,
      (voyage as any).departureDate,
    );

    // Phase 3 seeding guarantees all vessels have temperatureZones populated.
    if (!vessel.temperatureZones || vessel.temperatureZones.length === 0) {
      return { success: false, error: 'Vessel has no temperature zone data. Re-seed the database.' };
    }

    const vesselSections = vessel.temperatureZones;

    const coolingSectionStatus = vesselSections.map((cs: any) => {
      const tempInput = validated.coolingSectionTemps.find(
        t => t.coolingSectionId === cs.zoneId
      );
      return {
        zoneId: cs.zoneId,
        coolingSectionIds: cs.coolingSections.map((s: any) => s.sectionId),
        assignedTemperature: tempInput?.targetTemp ?? 13,
        locked: false,
      };
    });

    const plan = await StowagePlanModel.create({
      planNumber,
      voyageId: voyage._id,
      voyageNumber: voyage.voyageNumber,
      vesselId: vessel._id,
      vesselName: vessel.name,
      status: 'DRAFT',
      cargoPositions: [],
      coolingSectionStatus,
      overstowViolations: [],
      temperatureConflicts: [],
      weightDistributionWarnings: [],
      createdBy: 'SYSTEM', // TODO: replace with session user when auth is added
    });

    return {
      success: true,
      planId: plan._id.toString(),
      message: `Stowage plan ${planNumber} created for voyage ${voyage.voyageNumber}`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.issues[0].message}`,
      };
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error creating stowage plan from wizard:', msg);
    return {
      success: false,
      error: `Failed to create stowage plan: ${msg}`,
    };
  }
}

// ----------------------------------------------------------------------------
// ASSIGN CARGO TO COMPARTMENT
// CHANGE #6: Validates cooling section temperature compatibility
// ----------------------------------------------------------------------------

export async function assignCargoToCompartment(data: unknown) {
  try {
    const validated = AssignCargoSchema.parse(data);
    
    await connectDB();
    
    const plan = await StowagePlanModel.findById(validated.planId);
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }
    
    const vessel = await VesselModel.findById(plan.vesselId);
    if (!vessel) {
      return { success: false, error: 'Vessel not found' };
    }
    
    // CRITICAL: Find cooling section for this compartment
    const coolingSection = vessel.temperatureZones.find((cs: any) =>
      cs.coolingSections.some((s: any) => s.sectionId === validated.compartmentId)
    );

    if (!coolingSection) {
      return {
        success: false,
        error: 'Compartment not found in any cooling section',
      };
    }

    // CRITICAL: Validate temperature compatibility
    const sectionStatus = plan.coolingSectionStatus?.find(
      (cs: any) => cs.zoneId === coolingSection.zoneId
    );

    if (sectionStatus) {
      // If section already has assigned temperature
      if (
        sectionStatus.assignedTemperature !== undefined &&
        sectionStatus.assignedTemperature !== validated.temperature
      ) {
        return {
          success: false,
          error: `Temperature conflict: Cooling section ${coolingSection.zoneId} is already set to ${sectionStatus.assignedTemperature}°C. All compartments in this section must share the same temperature. Compartments in this section: ${coolingSection.coolingSections.map((s: any) => s.sectionId).join(', ')}`,
        };
      }

      // If section is locked
      if (sectionStatus.locked) {
        return {
          success: false,
          error: `Cooling section ${coolingSection.zoneId} is locked and cannot be modified`,
        };
      }
      
      // Assign temperature to cooling section if not set
      if (sectionStatus.assignedTemperature === undefined) {
        sectionStatus.assignedTemperature = validated.temperature;
      }
    }
    
    // Add cargo to plan
    plan.cargoPositions.push({
      bookingId: validated.bookingId,
      cargoUnitId: `UNIT-${Date.now()}`, // Generate unique ID
      compartment: {
        id: validated.compartmentId,
        holdNumber: getHoldNumber(validated.compartmentId),
        level: getLevel(validated.compartmentId),
      },
      weight: 0, // Will be calculated from booking data
      position: {
        lcg: 0, // Will be calculated from compartment position
        tcg: 0,
        vcg: 0,
      },
    });
    
    await plan.save();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(plan)),
      message: `Cargo assigned to ${validated.compartmentId} at ${validated.temperature}°C`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.issues[0].message}`,
      };
    }
    console.error('Error assigning cargo:', error);
    return {
      success: false,
      error: 'Failed to assign cargo',
    };
  }
}

// ----------------------------------------------------------------------------
// ASSIGN CONTAINERS TO DECK
// CHANGE #7: Validates reefer plug limit (19 for ACONCAGUA BAY)
// ----------------------------------------------------------------------------

export async function assignContainersToDeck(data: unknown) {
  try {
    const validated = AssignDeckContainerSchema.parse(data);
    
    await connectDB();
    
    const plan = await StowagePlanModel.findById(validated.planId);
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }
    
    const vessel = await VesselModel.findById(plan.vesselId);
    if (!vessel) {
      return { success: false, error: 'Vessel not found' };
    }
    
    // CRITICAL: Check reefer plug limit
    const currentDeckContainers = plan.cargoPositions.filter(
      (p: any) => p.compartment.level === 'DECK'
    ).length;
    const maxReeferPlugs = vessel.deckContainerCapacity?.maxReeferPlugs || 0;

    if (currentDeckContainers + validated.quantity > maxReeferPlugs) {
      return {
        success: false,
        error: `Reefer plug limit exceeded: ${currentDeckContainers} + ${validated.quantity} > ${maxReeferPlugs} max plugs`,
      };
    }

    // Add containers to deck
    for (let i = 0; i < validated.quantity; i++) {
      plan.cargoPositions.push({
        bookingId: validated.bookingId,
        cargoUnitId: `DECK-${Date.now()}-${i}`,
        compartment: {
          id: 'DECK',
          holdNumber: 0,
          level: 'DECK',
        },
        weight: 0,
        position: { lcg: 0, tcg: 0, vcg: 0 },
      });
    }
    
    await plan.save();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(plan)),
      message: `${validated.quantity} containers assigned to deck (${currentDeckContainers + validated.quantity}/${maxReeferPlugs} reefer plugs used)`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.issues[0].message}`,
      };
    }
    console.error('Error assigning deck containers:', error);
    return {
      success: false,
      error: 'Failed to assign deck containers',
    };
  }
}

// ----------------------------------------------------------------------------
// VALIDATE COOLING SECTIONS
// Checks all cooling sections for temperature conflicts
// ----------------------------------------------------------------------------

export async function validateCoolingSections(planId: unknown) {
  try {
    const id = StowagePlanIdSchema.parse(planId);
    
    await connectDB();
    
    const plan = await StowagePlanModel.findById(id);
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }
    
    const vessel = await VesselModel.findById(plan.vesselId);
    if (!vessel) {
      return { success: false, error: 'Vessel not found' };
    }
    
    const conflicts: string[] = [];
    
    // Check each cooling section
    for (const coolingSection of vessel.temperatureZones) {
      const compartmentsInSection = plan.cargoPositions.filter((pos: any) =>
        coolingSection.coolingSections.some((s: any) => s.sectionId === pos.compartment.id)
      );

      if (compartmentsInSection.length === 0) continue;

      // Get unique temperatures in this section
      const temperatures = new Set(
        compartmentsInSection.map((pos: any) => {
          // TODO: Get actual temperature from cargo data
          return 0; // Placeholder
        })
      );

      if (temperatures.size > 1) {
        conflicts.push(
          `Cooling section ${coolingSection.zoneId} has multiple temperatures: ${Array.from(temperatures).join(', ')}°C`
        );
      }
    }
    
    return {
      success: true,
      valid: conflicts.length === 0,
      conflicts,
    };
  } catch (error) {
    console.error('Error validating cooling sections:', error);
    return {
      success: false,
      error: 'Failed to validate cooling sections',
    };
  }
}

// ----------------------------------------------------------------------------
// GET PLAN BY ID
// ----------------------------------------------------------------------------

export async function getStowagePlanById(id: unknown) {
  try {
    const planId = StowagePlanIdSchema.parse(id);
    
    await connectDB();
    
    const plan = await StowagePlanModel.findById(planId)
      .populate('vesselId')
      .populate('voyageId')
      .lean();
    
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(plan)),
    };
  } catch (error) {
    console.error('Error fetching plan:', error);
    return {
      success: false,
      error: 'Failed to fetch plan',
    };
  }
}

// ----------------------------------------------------------------------------
// GET PLANS BY VOYAGE
// ----------------------------------------------------------------------------

export async function getStowagePlansByVoyage(voyageId: unknown) {
  try {
    const id = z.string().parse(voyageId);
    
    await connectDB();
    
    const plans = await StowagePlanModel.find({ voyageId: id })
      .sort({ createdAt: -1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(plans)),
    };
  } catch (error) {
    console.error('Error fetching plans:', error);
    return {
      success: false,
      error: 'Failed to fetch plans',
    };
  }
}

// ----------------------------------------------------------------------------
// GET ALL STOWAGE PLANS
// ----------------------------------------------------------------------------

export async function getStowagePlans() {
  try {
    await connectDB();

    const plans = await StowagePlanModel.find({})
      .populate('voyageId')
      .populate('vesselId')
      .sort({ createdAt: -1 })
      .lean();

    return {
      success: true,
      data: JSON.parse(JSON.stringify(plans)),
    };
  } catch (error) {
    console.error('Error fetching plans:', error);
    return {
      success: false,
      error: 'Failed to fetch plans',
      data: [],
    };
  }
}

// ----------------------------------------------------------------------------
// UPDATE PLAN STATUS
// ----------------------------------------------------------------------------

export async function updatePlanStatus(
  planId: unknown,
  status: unknown
) {
  try {
    const id = StowagePlanIdSchema.parse(planId);
    const newStatus = z.enum([
      'DRAFT',
      'ESTIMATED',
      'READY_FOR_CAPTAIN',
      'EMAIL_SENT',
      'CAPTAIN_APPROVED',
      'CAPTAIN_REJECTED',
      'IN_REVISION',
      'READY_FOR_EXECUTION',
      'IN_EXECUTION',
      'COMPLETED',
      'CANCELLED',
    ]).parse(status);
    
    await connectDB();
    
    const plan = await StowagePlanModel.findByIdAndUpdate(
      id,
      { status: newStatus },
      { new: true }
    );
    
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(plan)),
    };
  } catch (error) {
    console.error('Error updating plan status:', error);
    return {
      success: false,
      error: 'Failed to update plan status',
    };
  }
}

// ----------------------------------------------------------------------------
// UPDATE ZONE TEMPERATURES
// Reconfigures cooling section temperatures after initial plan creation.
// Warns on cargo conflicts but never hard-blocks the change.
// Appends an audit entry to temperatureChangelog.
// ----------------------------------------------------------------------------

const UpdateZoneTemperaturesSchema = z.object({
  planId: z.string().min(1),
  updates: z.array(z.object({
    zoneId: z.string().min(1),
    newTemp: z.number().min(-25).max(15),
  })).min(1),
  reason: z.string().optional(),
});

export async function updateZoneTemperatures(data: unknown) {
  try {
    const validated = UpdateZoneTemperaturesSchema.parse(data);

    await connectDB();

    const plan = await StowagePlanModel.findById(validated.planId);
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }

    if (!plan.coolingSectionStatus || plan.coolingSectionStatus.length === 0) {
      return { success: false, error: 'Plan has no cooling section configuration' };
    }

    // Determine what actually changed
    const changes: Array<{
      zoneId: string;
      coolingSectionIds: string[];
      fromTemp: number;
      toTemp: number;
    }> = [];

    for (const update of validated.updates) {
      const section = plan.coolingSectionStatus.find(
        (cs: any) => cs.zoneId === update.zoneId
      );
      if (!section) continue;

      const fromTemp = section.assignedTemperature ?? 0;
      if (fromTemp === update.newTemp) continue; // no change

      changes.push({
        zoneId: update.zoneId,
        coolingSectionIds: Array.from(section.coolingSectionIds ?? []),
        fromTemp,
        toTemp: update.newTemp,
      });

      section.assignedTemperature = update.newTemp;
    }

    if (changes.length === 0) {
      return {
        success: true,
        data: JSON.parse(JSON.stringify(plan)),
        message: 'No changes made',
      };
    }

    // Collect affected booking/shipment IDs from cargoPositions in changed compartments
    const changedCompartments = new Set(changes.flatMap(c => c.coolingSectionIds));
    const affectedBookings = new Set<string>();

    for (const pos of plan.cargoPositions ?? []) {
      if (changedCompartments.has(pos.compartment?.id)) {
        if ((pos as any).bookingId) affectedBookings.add(String((pos as any).bookingId));
        if (pos.shipmentId) affectedBookings.add(String(pos.shipmentId));
      }
    }

    // Append audit entry
    if (!plan.temperatureChangelog) {
      plan.temperatureChangelog = [];
    }
    (plan.temperatureChangelog as any[]).push({
      changedAt: new Date(),
      changedBy: 'SYSTEM', // TODO: replace with session user when auth is added
      reason: validated.reason ?? undefined,
      changes,
      affectedBookings: Array.from(affectedBookings),
    });

    plan.markModified('temperatureChangelog');
    plan.markModified('coolingSectionStatus');
    await plan.save();

    return {
      success: true,
      data: JSON.parse(JSON.stringify(plan)),
      message: `${changes.length} zone(s) updated`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.issues[0].message}`,
      };
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error updating zone temperatures:', msg);
    return { success: false, error: `Failed to update temperatures: ${msg}` };
  }
}

// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
// DELETE STOWAGE PLAN
// Hard delete — no dependency guards (plans are leaf nodes in the hierarchy).
// Cascade order when cleaning up: delete Plans first, then Voyages, then Vessels.
// ----------------------------------------------------------------------------

export async function deleteStowagePlan(planId: unknown) {
  try {
    const id = StowagePlanIdSchema.parse(planId);

    await connectDB();

    const plan = await StowagePlanModel.findById(id).select('planNumber voyageId status').lean();
    if (!plan) {
      return { success: false, error: 'Stowage plan not found' };
    }

    // Guard: plans that have been sent or are in any locked state cannot be deleted
    const SENT_OR_LOCKED = [
      'EMAIL_SENT', 'CAPTAIN_APPROVED', 'CAPTAIN_REJECTED',
      'IN_REVISION', 'READY_FOR_EXECUTION', 'IN_EXECUTION', 'COMPLETED',
    ];
    if (SENT_OR_LOCKED.includes((plan as any).status)) {
      return {
        success: false,
        error: `Cannot delete a plan that has been sent or is locked (status: ${(plan as any).status})`,
      };
    }

    // Guard: only the most recent plan for a voyage can be deleted to prevent gaps
    // in the sequential numbering (WK-VESSEL-VOYAGE-0001, 0002, 0003 …)
    const voyageId = (plan as any).voyageId;
    if (voyageId) {
      const sibling = await StowagePlanModel.find({ voyageId })
        .select('_id planNumber')
        .sort({ planNumber: -1, createdAt: -1 })
        .lean();

      if (sibling.length > 1) {
        const latestId = String((sibling[0] as any)._id);
        if (latestId !== String(id)) {
          const latestNumber = (sibling[0] as any).planNumber ?? 'the most recent plan';
          return {
            success: false,
            error: `Can only delete the most recent plan (${latestNumber}). Delete newer plans first.`,
          };
        }
      }
    }

    await StowagePlanModel.findByIdAndDelete(id);

    return {
      success: true,
      message: `Stowage plan ${(plan as any).planNumber} deleted successfully`,
    };
  } catch (error) {
    console.error('Error deleting stowage plan:', error);
    return {
      success: false,
      error: 'Failed to delete stowage plan',
    };
  }
}

// ----------------------------------------------------------------------------
// MARK PLAN SENT
// Sets status to EMAIL_SENT, records recipients in communicationLog,
// and populates captainCommunication.emailSentAt + captainName/Email.
// Called by "Mark as Sent" modal on the stowage plan detail page.
// ----------------------------------------------------------------------------

const MarkPlanSentSchema = z.object({
  planId: z.string().min(1),
  recipients: z.array(z.object({
    name: z.string().optional(),
    email: z.string().email(),
    role: z.enum(['CAPTAIN', 'CC']),
  })).min(1, 'Select at least one recipient'),
  note: z.string().optional(),
});

export async function markPlanSent(data: unknown) {
  try {
    const validated = MarkPlanSentSchema.parse(data);

    await connectDB();

    const plan = await StowagePlanModel.findById(validated.planId)
      .populate('vesselId', 'name')
      .populate('voyageId', 'voyageNumber');
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }

    const LOCKED = ['EMAIL_SENT', 'CAPTAIN_APPROVED', 'CAPTAIN_REJECTED', 'IN_REVISION', 'READY_FOR_EXECUTION', 'IN_EXECUTION', 'COMPLETED'];
    if (LOCKED.includes(plan.status)) {
      return { success: false, error: `Plan is already locked (status: ${plan.status})` };
    }

    const captain = validated.recipients.find(r => r.role === 'CAPTAIN');
    if (!captain) {
      return { success: false, error: 'A captain recipient is required' };
    }

    const ccRecipients = validated.recipients.filter(r => r.role === 'CC');

    // Send the actual email
    const vesselName: string = (plan.vesselId as any)?.name ?? plan.vesselName ?? 'Unknown Vessel';
    const voyageNumber: string = (plan.voyageId as any)?.voyageNumber ?? plan.voyageNumber ?? 'N/A';

    await sendPlanNotification({
      to: { name: captain.name, email: captain.email },
      cc: ccRecipients.map(r => ({ name: r.name, email: r.email })),
      planNumber: plan.planNumber,
      vesselName,
      voyageNumber,
      note: validated.note,
    });

    // Lock the plan and record the communication log
    plan.status = 'EMAIL_SENT';

    plan.captainCommunication = {
      emailSentAt: new Date(),
      captainName: captain.name ?? 'Captain',
      captainEmail: captain.email,
      responseType: 'PENDING',
    };

    if (!plan.communicationLog) {
      plan.communicationLog = [];
    }
    (plan.communicationLog as any[]).push({
      sentAt: new Date(),
      sentBy: 'SYSTEM',
      recipients: validated.recipients,
      planStatus: 'EMAIL_SENT',
      note: validated.note ?? undefined,
    });

    plan.markModified('captainCommunication');
    plan.markModified('communicationLog');
    await plan.save();

    return {
      success: true,
      message: `Plan sent to ${captain.email}`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message ?? 'Validation error' };
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error marking plan as sent:', msg);
    return { success: false, error: `Failed to send plan: ${msg}` };
  }
}

// ----------------------------------------------------------------------------
// MARK CAPTAIN RESPONSE
// Sets status to CAPTAIN_APPROVED or CAPTAIN_REJECTED and records the event.
// Only callable by ADMIN / SHIPPING_PLANNER — enforced on the client via role check.
// ----------------------------------------------------------------------------

export async function markCaptainResponse(
  planId: unknown,
  response: 'CAPTAIN_APPROVED' | 'CAPTAIN_REJECTED',
) {
  try {
    const id = StowagePlanIdSchema.parse(planId);

    await connectDB();

    const plan = await StowagePlanModel.findById(id);
    if (!plan) return { success: false, error: 'Plan not found' };

    if (plan.status !== 'EMAIL_SENT') {
      return {
        success: false,
        error: `Plan must be in EMAIL_SENT status to record captain response (current: ${plan.status})`,
      };
    }

    plan.status = response;

    if (plan.captainCommunication) {
      plan.captainCommunication.responseType =
        response === 'CAPTAIN_APPROVED' ? 'APPROVED' : 'REJECTED';
      plan.captainCommunication.responseAt = new Date();
      plan.markModified('captainCommunication');
    }

    if (!plan.communicationLog) plan.communicationLog = [];
    (plan.communicationLog as any[]).push({
      sentAt: new Date(),
      sentBy: 'SYSTEM',
      recipients: [],
      planStatus: response,
      note: `Captain ${response === 'CAPTAIN_APPROVED' ? 'approved' : 'rejected'} the plan`,
    });
    plan.markModified('communicationLog');

    await plan.save();

    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error recording captain response:', msg);
    return { success: false, error: `Failed to record response: ${msg}` };
  }
}

// ----------------------------------------------------------------------------
// GET LATEST PLAN INFO FOR VOYAGES
// Returns a map of voyageId → latest plan info.
// Used by the stowage plan wizard to detect revision mode.
// ----------------------------------------------------------------------------

export interface LatestPlanInfo {
  planId: string;
  planNumber: string;
  status: string;
  coolingSectionStatus: { zoneId: string; assignedTemperature: number; coolingSectionIds: string[] }[];
}

export async function getLatestPlanInfoForVoyages(
  voyageIds: string[],
): Promise<Record<string, LatestPlanInfo>> {
  if (voyageIds.length === 0) return {};
  try {
    await connectDB();
    // Sort descending — first plan per voyage encountered is the latest
    const plans = await StowagePlanModel.find({ voyageId: { $in: voyageIds } })
      .select('voyageId planNumber status coolingSectionStatus')
      .sort({ planNumber: -1, createdAt: -1 })
      .lean();

    const map: Record<string, LatestPlanInfo> = {};
    for (const plan of plans) {
      const vid = String((plan as any).voyageId);
      if (!map[vid]) {
        map[vid] = {
          planId: String((plan as any)._id),
          planNumber: (plan as any).planNumber ?? '',
          status: (plan as any).status ?? 'DRAFT',
          coolingSectionStatus: ((plan as any).coolingSectionStatus ?? []).map((cs: any) => ({
            zoneId: cs.zoneId,
            assignedTemperature: cs.assignedTemperature ?? 13,
            coolingSectionIds: cs.coolingSectionIds ?? [],
          })),
        };
      }
    }
    return map;
  } catch {
    return {};
  }
}

// ----------------------------------------------------------------------------
// COPY STOWAGE PLAN (New Draft from locked plan)
// Duplicates cargoPositions + coolingSectionStatus into a new DRAFT plan.
// Called by "New Draft" button on a locked (EMAIL_SENT or beyond) plan.
// ----------------------------------------------------------------------------

export async function copyStowagePlan(sourcePlanId: unknown) {
  try {
    const id = StowagePlanIdSchema.parse(sourcePlanId);

    await connectDB();

    const source = await StowagePlanModel.findById(id)
      .populate('voyageId')
      .populate('vesselId')
      .lean();

    if (!source) {
      return { success: false, error: 'Source plan not found' };
    }

    const voyage = source.voyageId as any;
    const vessel = source.vesselId as any;

    const planNumber = await generatePlanNumber(
      (source as any).voyageNumber || voyage?.voyageNumber || '',
      (source as any).vesselName || vessel?.name || '',
      voyage?.weekNumber ?? undefined,
      voyage?.departureDate ?? undefined,
    );

    const newPlan = await StowagePlanModel.create({
      planNumber,
      voyageId: (source as any).voyageId?._id ?? (source as any).voyageId,
      voyageNumber: (source as any).voyageNumber || voyage?.voyageNumber || '',
      vesselId: (source as any).vesselId?._id ?? (source as any).vesselId,
      vesselName: (source as any).vesselName || vessel?.name || '',
      status: 'DRAFT',
      cargoPositions: (source as any).cargoPositions ?? [],
      coolingSectionStatus: (source as any).coolingSectionStatus ?? [],
      overstowViolations: [],
      temperatureConflicts: [],
      weightDistributionWarnings: [],
      createdBy: 'SYSTEM',
    });

    return {
      success: true,
      planId: newPlan._id.toString(),
      planNumber,
      message: `New draft ${planNumber} created from ${(source as any).planNumber}`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error copying stowage plan:', msg);
    return { success: false, error: `Failed to create new draft: ${msg}` };
  }
}

// ----------------------------------------------------------------------------
// SAVE CARGO ASSIGNMENTS
// Replaces all cargoPositions on a plan with the current in-memory assignments.
// Called by "Save Draft" on the stowage plan detail page.
// ----------------------------------------------------------------------------

const SaveCargoAssignmentsSchema = z.object({
  planId: z.string().min(1),
  assignments: z.array(z.object({
    shipmentId: z.string().optional(),
    bookingId: z.string().optional(),
    cargoType: z.string(),
    quantity: z.number().int().nonnegative(),
    compartmentId: z.string().min(1),
  })),
});

export async function saveCargoAssignments(data: unknown) {
  try {
    const validated = SaveCargoAssignmentsSchema.parse(data);

    await connectDB();

    const plan = await StowagePlanModel.findById(validated.planId);
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }

    plan.cargoPositions = validated.assignments.map((a: any) => ({
      shipmentId: a.shipmentId || undefined,
      bookingId: a.bookingId || undefined,
      cargoType: a.cargoType,
      quantity: a.quantity,
      compartment: {
        id: a.compartmentId,
        holdNumber: getHoldNumber(a.compartmentId),
        level: getLevel(a.compartmentId),
      },
      weight: 0,
      position: { lcg: 0, tcg: 0, vcg: 0 },
    }));

    plan.markModified('cargoPositions');
    await plan.save();

    return {
      success: true,
      message: `Plan saved with ${validated.assignments.length} cargo position(s)`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error saving cargo assignments:', msg);
    return { success: false, error: `Failed to save plan: ${msg}` };
  }
}

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------------------------------

function getHoldNumber(compartmentId: string): number {
  // Extract hold number from compartment ID (e.g., "2UPD" -> 2, "1A" -> 1)
  const match = compartmentId.match(/^(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

function getLevel(compartmentId: string): string {
  // Extract level from compartment ID (e.g., "2UPD" -> "UPD", "1A" -> "A")
  const match = compartmentId.match(/^\d+(.*)/);
  return match ? match[1] : '';
}

// ----------------------------------------------------------------------------
// AUTO-GENERATE DRAFT PLANS
// Scans all non-cancelled voyages departing within the next 28 days.
// For each voyage that has ≥1 CONFIRMED or PARTIAL booking and no existing
// non-cancelled stowage plan, creates a new DRAFT plan.
// Returns a summary so the UI can display what was created / skipped.
// ----------------------------------------------------------------------------

export async function autoGenerateDraftPlans() {
  try {
    await connectDB();

    const now = new Date();
    const cutoff = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);

    // Voyages departing in the next 28 days, not cancelled
    const voyages = await VoyageModel.find({
      departureDate: { $gte: now, $lte: cutoff },
      status: { $ne: 'CANCELLED' },
    }).lean();

    const results: {
      voyageNumber: string;
      action: 'created' | 'skipped';
      reason?: string;
      planNumber?: string;
    }[] = [];

    for (const voyage of voyages as any[]) {
      const voyageId = voyage._id.toString();

      // Check for existing non-cancelled plans
      const existingPlan = await StowagePlanModel.findOne({
        voyageId: voyage._id,
        status: { $nin: ['CANCELLED'] },
      }).lean();

      if (existingPlan) {
        results.push({
          voyageNumber: voyage.voyageNumber,
          action: 'skipped',
          reason: `Plan ${(existingPlan as any).planNumber || existingPlan._id} already exists`,
        });
        continue;
      }

      // Check for CONFIRMED / PARTIAL bookings
      const bookingCount = await BookingModel.countDocuments({
        voyageId: voyage._id,
        status: { $in: ['CONFIRMED', 'PARTIAL'] },
      });

      if (bookingCount === 0) {
        results.push({
          voyageNumber: voyage.voyageNumber,
          action: 'skipped',
          reason: 'No confirmed bookings',
        });
        continue;
      }

      // Fetch the vessel to initialise coolingSectionStatus
      const vessel = await VesselModel.findById(voyage.vesselId).lean() as any;
      if (!vessel) {
        results.push({
          voyageNumber: voyage.voyageNumber,
          action: 'skipped',
          reason: 'Vessel not found',
        });
        continue;
      }

      const planNumber = await generatePlanNumber(
        voyage.voyageNumber,
        vessel.name,
        voyage.weekNumber ?? undefined,
        voyage.departureDate ?? undefined,
      );

      await StowagePlanModel.create({
        planNumber,
        vesselId: vessel._id,
        voyageId: voyage._id,
        status: 'DRAFT',
        cargoPositions: [],
        coolingSectionStatus: (vessel.temperatureZones ?? []).map((zone: any) => ({
          zoneId: zone.zoneId,
          coolingSectionIds: (zone.coolingSections ?? []).map((s: any) => s.sectionId),
          assignedTemperature: undefined,
          locked: false,
          assignedCargo: [],
        })),
        overstowViolations: [],
        temperatureConflicts: [],
        weightDistributionWarnings: [],
        createdBy: 'AUTO',
      });

      results.push({
        voyageNumber: voyage.voyageNumber,
        action: 'created',
        planNumber,
      });
    }

    const created = results.filter(r => r.action === 'created').length;
    const skipped = results.filter(r => r.action === 'skipped').length;

    return {
      success: true,
      created,
      skipped,
      results,
      message: created === 0
        ? 'No new plans generated — all eligible voyages already have plans or lack confirmed bookings'
        : `Generated ${created} draft plan${created > 1 ? 's' : ''}`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error auto-generating draft plans:', msg);
    return { success: false, error: `Auto-generation failed: ${msg}` };
  }
}

// ----------------------------------------------------------------------------
// GET ADMIN PLANS — full list for /admin Stowage Plans tab
// Returns all plans with populated vessel + voyage, sorted newest first.
// ----------------------------------------------------------------------------

export async function getAdminPlans() {
  try {
    await connectDB();

    const plans = await StowagePlanModel.find()
      .populate('vesselId', 'name')
      .populate('voyageId', 'voyageNumber departureDate weekNumber')
      .sort({ createdAt: -1 })
      .lean();

    const data = plans.map((p: any) => ({
      _id: p._id.toString(),
      planNumber: p.planNumber ?? '—',
      status: p.status ?? 'DRAFT',
      createdAt: p.createdAt,
      cargoPositionCount: (p.cargoPositions ?? []).length,
      voyageRawId: p.voyageId ? (p.voyageId as any)._id?.toString() ?? null : null,
      vesselId: p.vesselId
        ? { name: (p.vesselId as any).name }
        : undefined,
      voyageId: p.voyageId
        ? {
            voyageNumber: (p.voyageId as any).voyageNumber,
            departureDate: (p.voyageId as any).departureDate,
            weekNumber: (p.voyageId as any).weekNumber,
          }
        : undefined,
    }));

    return { success: true, data };
  } catch (error) {
    console.error('Error fetching admin plans:', error);
    return { success: false, data: [], error: 'Failed to fetch plans' };
  }
}
