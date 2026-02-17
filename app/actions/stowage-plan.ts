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
import { StowagePlanModel, VesselModel, VoyageModel } from '@/lib/db/schemas';
import type { StowagePlan, StowagePlanStatus } from '@/types/models';

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

    const plan = await StowagePlanModel.findByIdAndDelete(id);

    if (!plan) {
      return { success: false, error: 'Stowage plan not found' };
    }

    return {
      success: true,
      message: `Stowage plan ${plan.planNumber} deleted successfully`,
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
  captainName: z.string().min(1, 'Captain name is required'),
  captainEmail: z.string().email('Valid captain email required'),
  ccEmails: z.array(z.string().email()).optional(),
  note: z.string().optional(),
});

export async function markPlanSent(data: unknown) {
  try {
    const validated = MarkPlanSentSchema.parse(data);

    await connectDB();

    const plan = await StowagePlanModel.findById(validated.planId);
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }

    const LOCKED = ['EMAIL_SENT', 'CAPTAIN_APPROVED', 'CAPTAIN_REJECTED', 'IN_REVISION', 'READY_FOR_EXECUTION', 'IN_EXECUTION', 'COMPLETED'];
    if (LOCKED.includes(plan.status)) {
      return { success: false, error: `Plan is already locked (status: ${plan.status})` };
    }

    const recipients: { name?: string; email: string; role: 'CAPTAIN' | 'CC' }[] = [
      { name: validated.captainName, email: validated.captainEmail, role: 'CAPTAIN' },
      ...(validated.ccEmails ?? []).map((email: any) => ({ email, role: 'CC' as const })),
    ];

    plan.status = 'EMAIL_SENT';

    plan.captainCommunication = {
      emailSentAt: new Date(),
      captainName: validated.captainName,
      captainEmail: validated.captainEmail,
      responseType: 'PENDING',
    };

    if (!plan.communicationLog) {
      plan.communicationLog = [];
    }
    (plan.communicationLog as any[]).push({
      sentAt: new Date(),
      sentBy: 'SYSTEM',
      recipients,
      planStatus: 'EMAIL_SENT',
      note: validated.note ?? undefined,
    });

    plan.markModified('captainCommunication');
    plan.markModified('communicationLog');
    await plan.save();

    return {
      success: true,
      message: `Plan marked as sent to ${validated.captainEmail}`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message ?? 'Validation error' };
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error marking plan as sent:', msg);
    return { success: false, error: `Failed to mark plan as sent: ${msg}` };
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
    shipmentId: z.string(),
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
