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
import { StowagePlanModel, VesselModel, VoyageModel, BookingModel, ContractModel, ServiceModel, SpaceForecastModel } from '@/lib/db/schemas';
import type { StowagePlan, StowagePlanStatus } from '@/types/models';
import { sendPlanNotification } from '@/lib/email';
import { generatePlanPdf } from '@/lib/generate-plan-pdf';
import { auth } from '@/auth';
import { generateStowagePlan } from '@/lib/stowage-engine';
import { getTempRange } from '@/lib/stowage-engine/temperature';
import type { EngineInput, EngineSection, EngineZone, EngineBooking } from '@/lib/stowage-engine/types';

// Placeholder longitudinal arms by hold (metres from midship, +fwd/-aft).
// Replace with real hydrostatic data when available per vessel.
const HOLD_LONGITUDINAL_ARM: Record<number, number> = { 1: 60, 2: 20, 3: -20, 4: -60 };

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
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role as string;
    if (!['ADMIN', 'SHIPPING_PLANNER'].includes(role)) return { success: false, error: 'Forbidden' };

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
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role as string;
    if (!['ADMIN', 'SHIPPING_PLANNER'].includes(role)) return { success: false, error: 'Forbidden' };

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
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role as string;
    if (!['ADMIN', 'SHIPPING_PLANNER'].includes(role)) return { success: false, error: 'Forbidden' };

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

    const session = await auth();
    const serviceFilter = (session?.user as any)?.serviceFilter ?? [];

    let planQuery: Record<string, unknown> = {};
    if (serviceFilter.length > 0) {
      const services = await ServiceModel.find({ serviceCode: { $in: serviceFilter } }).select('_id').lean();
      const serviceIds = (services as any[]).map((s: any) => s._id);
      const voyages = await VoyageModel.find({ serviceId: { $in: serviceIds } }).select('_id').lean();
      const voyageIds = (voyages as any[]).map((v: any) => v._id);
      planQuery = { voyageId: { $in: voyageIds } };
    }

    const plans = await StowagePlanModel.find(planQuery)
      .populate('voyageId')
      .populate('vesselId')
      .lean();

    (plans as any[]).sort((a: any, b: any) => {
      const da = new Date(a.voyageId?.departureDate ?? 0).getTime();
      const db = new Date(b.voyageId?.departureDate ?? 0).getTime();
      if (da !== db) return da - db;
      return (a.planNumber ?? '').localeCompare(b.planNumber ?? '');
    });

    // Collect unique voyageIds for a single-pass batch count (2 queries regardless of plan count)
    const voyageObjectIds = [...new Set(
      (plans as any[]).map((p: any) => p.voyageId?._id).filter(Boolean),
    )];

    const [bookingAgg, forecastAgg] = await Promise.all([
      BookingModel.aggregate([
        { $match: { voyageId: { $in: voyageObjectIds }, status: { $nin: ['CANCELLED', 'REJECTED'] } } },
        { $group: { _id: '$voyageId', count: { $sum: 1 } } },
      ]),
      SpaceForecastModel.aggregate([
        {
          $match: {
            voyageId: { $in: voyageObjectIds },
            $or: [
              {
                source:           { $in: ['SHIPPER_PORTAL', 'PLANNER_ENTRY'] },
                estimatedPallets: { $gt: 0 },
                planImpact:       { $nin: ['SUPERSEDED', 'REPLACED_BY_BOOKING'] },
              },
              {
                source:           'CONTRACT_DEFAULT',
                estimatedPallets: { $gt: 0 },
                planImpact:       'INCORPORATED',
              },
            ],
          },
        },
        { $group: { _id: '$voyageId', count: { $sum: 1 }, total: { $sum: '$estimatedPallets' } } },
      ]),
    ]);

    const bookingCountMap = new Map<string, number>(
      bookingAgg.map((r: any) => [r._id.toString(), r.count as number]),
    );
    const estimateCountMap = new Map<string, number>(
      forecastAgg.map((r: any) => [r._id.toString(), r.count as number]),
    );
    const estimateTotalMap = new Map<string, number>(
      forecastAgg.map((r: any) => [r._id.toString(), r.total as number]),
    );

    const enrichedPlans = (plans as any[]).map((p: any) => {
      const vid = p.voyageId?._id?.toString() ?? '';
      return {
        ...p,
        realBookingCount:      bookingCountMap.get(vid) ?? 0,
        estimateCount:         estimateCountMap.get(vid) ?? 0,
        estimatedPalletsTotal: estimateTotalMap.get(vid) ?? 0,
      };
    });

    return {
      success: true,
      data: JSON.parse(JSON.stringify(enrichedPlans)),
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
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role as string;
    if (!['ADMIN', 'SHIPPING_PLANNER'].includes(role)) return { success: false, error: 'Forbidden' };

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
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role as string;
    if (!['ADMIN', 'SHIPPING_PLANNER'].includes(role)) return { success: false, error: 'Forbidden' };

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
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role as string;
    if (!['ADMIN', 'SHIPPING_PLANNER'].includes(role)) return { success: false, error: 'Forbidden' };

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
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role as string;
    if (!['ADMIN', 'SHIPPING_PLANNER'].includes(role)) return { success: false, error: 'Forbidden' };

    const validated = MarkPlanSentSchema.parse(data);

    await connectDB();

    const plan = await StowagePlanModel.findById(validated.planId)
      .populate('vesselId', 'name')
      .populate('voyageId', 'voyageNumber portCalls');
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

    // Build PDF data ──────────────────────────────────────────────────────────
    const vesselName: string = (plan.vesselId as any)?.name ?? plan.vesselName ?? 'Unknown Vessel';
    const voyageNumber: string = (plan.voyageId as any)?.voyageNumber ?? plan.voyageNumber ?? 'N/A';

    // Build bookingNumber map from snapshots saved on cargoPositions first.
    // Only fall back to DB lookup for legacy positions that predate snapshot saving.
    const bookingMap: Record<string, string> = {};

    // Step 1: populate from snapshots (no DB query needed)
    for (const pos of (plan.cargoPositions ?? []) as any[]) {
      const bid = String(pos.bookingId ?? '');
      if (bid && pos.bookingNumber) {
        bookingMap[bid] = pos.bookingNumber;
      }
    }

    // Step 2: DB fallback only for real ObjectId bookingIds missing a snapshot
    const missingIds = [...new Set(
      ((plan.cargoPositions ?? []) as any[])
        .map((p: any) => String(p.bookingId ?? ''))
        .filter((id: string) =>
          id &&
          !id.startsWith('CONTRACT-ESTIMATE-') &&
          /^[a-f\d]{24}$/i.test(id) &&
          !bookingMap[id]
        )
    )];
    if (missingIds.length > 0) {
      const fallbackDocs = await BookingModel.find(
        { _id: { $in: missingIds } },
        'bookingNumber'
      ).lean();
      for (const b of fallbackDocs as any[]) {
        bookingMap[String(b._id)] = (b as any).bookingNumber;
      }
    }

    // Zone lookup: compartmentId → { zoneId, temp }
    const zoneByComp: Record<string, { zoneId: string; temp: number }> = {};
    for (const cs of (plan.coolingSectionStatus ?? [])) {
      for (const sId of ((cs as any).coolingSectionIds ?? [])) {
        zoneByComp[sId] = { zoneId: (cs as any).zoneId, temp: (cs as any).assignedTemperature ?? 13 };
      }
    }

    // Generate PDF (non-fatal — fall back to no attachment on error)
    let pdfBuffer: Buffer | undefined;
    try {
      pdfBuffer = await generatePlanPdf({
        planNumber: plan.planNumber,
        vesselName,
        voyageNumber,
        generatedAt: new Date(),
        temperatureZones: (plan.coolingSectionStatus ?? []).map((cs: any) => ({
          zoneId: cs.zoneId,
          coolingSectionIds: cs.coolingSectionIds ?? [],
          assignedTemperature: cs.assignedTemperature ?? 13,
        })),
        cargoRows: (plan.cargoPositions ?? [])
          .filter((pos: any) => pos.compartment?.id && (pos.quantity ?? 0) > 0)
          .map((pos: any) => {
            const compId: string = pos.compartment.id;
            const zone = zoneByComp[compId] ?? { zoneId: '-', temp: 0 };
            return {
              compartmentId: compId,
              zoneId: zone.zoneId,
              assignedTemperature: zone.temp,
              cargoType: pos.cargoType ?? '-',
              bookingRef: (pos.bookingId && bookingMap[String(pos.bookingId)])
                || String(pos.bookingId ?? '-'),
              quantity: pos.quantity ?? 0,
            };
          }),
        portCalls: ((plan.voyageId as any)?.portCalls ?? [])
          .map((pc: any) => ({
            sequence: pc.sequence ?? 0,
            portCode: pc.portCode,
            portName: pc.portName,
            eta: pc.eta ? String(pc.eta) : undefined,
            etd: pc.etd ? String(pc.etd) : undefined,
            operations: pc.operations ?? [],
            status: pc.status,
          }))
          .sort((a: any, b: any) => a.sequence - b.sequence),
      });
    } catch (pdfErr) {
      console.error('PDF generation failed (sending email without attachment):', pdfErr);
    }

    // Send the actual email ───────────────────────────────────────────────────
    await sendPlanNotification({
      to: { name: captain.name, email: captain.email },
      cc: ccRecipients.map(r => ({ name: r.name, email: r.email })),
      planNumber: plan.planNumber,
      vesselName,
      voyageNumber,
      note: validated.note,
      pdfBuffer,
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
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role as string;
    if (!['ADMIN', 'SHIPPING_PLANNER'].includes(role)) return { success: false, error: 'Forbidden' };

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
    bookingNumber: z.string().optional(),
    cargoType: z.string(),
    quantity: z.number().int().nonnegative(),
    snapshotTotalQuantity: z.number().int().nonnegative().optional(),
    compartmentId: z.string().min(1),
    polPortCode: z.string().optional(),
    podPortCode: z.string().optional(),
    consigneeName: z.string().optional(),
  })),
});

export async function saveCargoAssignments(data: unknown) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role as string;
    if (!['ADMIN', 'SHIPPING_PLANNER'].includes(role)) return { success: false, error: 'Forbidden' };

    const validated = SaveCargoAssignmentsSchema.parse(data);

    await connectDB();

    const plan = await StowagePlanModel.findById(validated.planId);
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }

    plan.cargoPositions = validated.assignments.map((a: any) => ({
      shipmentId: a.shipmentId || undefined,
      bookingId: a.bookingId || undefined,
      bookingNumber: a.bookingNumber || undefined,
      cargoType: a.cargoType,
      quantity: a.quantity,
      snapshotTotalQuantity: a.snapshotTotalQuantity ?? undefined,
      compartment: {
        id: a.compartmentId,
        holdNumber: getHoldNumber(a.compartmentId),
        level: getLevel(a.compartmentId),
      },
      polPortCode: a.polPortCode || undefined,
      podPortCode: a.podPortCode || undefined,
      consigneeName: a.consigneeName || undefined,
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

// ----------------------------------------------------------------------------
// BUILD ENGINE INPUT — shared by autoGenerateDraftPlans and replanAfterTemperatureOverride
// ----------------------------------------------------------------------------

function buildEngineSections(vessel: any): EngineSection[] {
  const sections: EngineSection[] = [];
  for (const zone of vessel.temperatureZones ?? []) {
    for (const cs of zone.coolingSections ?? []) {
      const holdNumber = parseInt(String(cs.sectionId).charAt(0), 10) || 1;
      const dsf = cs.designStowageFactor ?? 1.32;
      sections.push({
        sectionId:           cs.sectionId,
        zoneId:              zone.zoneId,
        sqm:                 cs.sqm,
        designStowageFactor: dsf,
        maxPallets:          Math.floor(cs.sqm * dsf),
        holdNumber,
        longitudinalArm:     HOLD_LONGITUDINAL_ARM[holdNumber] ?? 0,
        transverseArm:       0,
        assignedTemperature: null,
      });
    }
  }
  return sections;
}

function buildEngineZones(vessel: any): EngineZone[] {
  return (vessel.temperatureZones ?? []).map((zone: any): EngineZone => ({
    zoneId:              zone.zoneId,
    sectionIds:          (zone.coolingSections ?? []).map((s: any) => s.sectionId as string),
    assignedTemperature: null,
    source:              null,
  }));
}

function buildEngineBookings(bookings: any[], voyage: any): EngineBooking[] {
  const portCallMap = new Map<string, number>(
    (voyage.portCalls ?? []).map((pc: any) => [pc.portCode as string, pc.sequence as number]),
  );

  const engineBookings: EngineBooking[] = [];
  for (const b of bookings) {
    const polSeq = portCallMap.get(b.pol?.portCode);
    const podSeq = portCallMap.get(b.pod?.portCode);
    if (polSeq === undefined || podSeq === undefined) continue; // port not in this voyage

    const tempRange = getTempRange(b.cargoType ?? '');
    const confirmed = (b.confirmedQuantity ?? 0) > 0;
    const pallets   = confirmed ? b.confirmedQuantity : b.requestedQuantity;

    engineBookings.push({
      bookingId:    b._id.toString(),
      cargoType:    b.cargoType ?? 'OTHER_CHILLED',
      tempMin:      tempRange.min,
      tempMax:      tempRange.max,
      pallets,
      polPortCode:  b.pol?.portCode ?? '',
      podPortCode:  b.pod?.portCode ?? '',
      polSeq:       polSeq,
      podSeq:       podSeq,
      polSequence:  polSeq,
      podSequence:  podSeq,
      shipperId:    b.shipperId?.toString() ?? b.shipper?.code ?? '',
      consigneeCode: b.consignee?.code ?? '',
      confidence:   confirmed ? 'CONFIRMED' : 'ESTIMATED',
      frozen:       confirmed,
    });
  }
  return engineBookings;
}

function mapEngineOutputToDocument(engineOutput: ReturnType<typeof generateStowagePlan>, bookings: any[]) {
  const bookingMap = new Map(bookings.map((b: any) => [b._id.toString(), b]));

  const cargoPositions = engineOutput.assignments.map(a => {
    const bk = bookingMap.get(a.bookingId);
    const holdNumber = parseInt(String(a.sectionId).charAt(0), 10) || 1;
    const level = String(a.sectionId).slice(1); // "1A" → "A", "2UPD" → "UPD"
    // Real bookings have pol/pod on bk.pol?.portCode; contract estimates store them as bk.polPortCode.
    const polPortCode = (bk as any)?.pol?.portCode ?? (bk as any)?.polPortCode ?? undefined;
    const podPortCode = (bk as any)?.pod?.portCode ?? (bk as any)?.podPortCode ?? undefined;
    return {
      bookingId:     a.bookingId,
      cargoType:     bk?.cargoType ?? undefined,
      consigneeName: (bk as any)?.consignee?.name ?? undefined,
      polPortCode,
      podPortCode,
      quantity:      a.palletsAssigned,
      compartment:   { id: a.sectionId, holdNumber, level },
    };
  });

  const coolingSectionStatus = engineOutput.zoneTemps.map(z => ({
    zoneId:              z.zoneId,
    coolingSectionIds:   z.sectionIds,
    assignedTemperature: z.assignedTemperature ?? undefined,
    locked:              false,
    temperatureSource:   z.source ?? undefined,
  }));

  const hasHardConflict = engineOutput.conflicts.some(c =>
    c.type === 'TEMPERATURE_CONFLICT' || c.type === 'OVERSTOW_CONFLICT',
  );

  return { cargoPositions, coolingSectionStatus, hasHardConflict };
}

export async function autoGenerateDraftPlans() {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role as string;
    if (!['ADMIN', 'SHIPPING_PLANNER'].includes(role)) return { success: false, error: 'Forbidden' };

    await connectDB();

    const now = new Date();
    // Extended to 60 days to capture more voyages for testing
    const cutoff = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const voyages = await VoyageModel.find({
      departureDate: { $gte: now, $lte: cutoff },
      status: { $ne: 'CANCELLED' },
    }).lean();

    type DetailItem = {
      voyageNumber: string;
      action: 'CREATED' | 'UPDATED' | 'SKIPPED';
      reason?: string;
      bookingsUsed: number;
      contractEstimatesUsed: number;
      conflictCount: number;
      sectionsAssigned: number;
    };

    const details: DetailItem[] = [];
    let created = 0, updated = 0, skipped = 0;

    const LOCKED_STATUSES = [
      'EMAIL_SENT', 'CAPTAIN_APPROVED', 'CAPTAIN_REJECTED',
      'IN_REVISION', 'READY_FOR_EXECUTION', 'IN_EXECUTION', 'COMPLETED',
    ];

    for (const voyage of voyages as any[]) {
      // ── Step 1: Determine action (CREATE / UPDATE / SKIP) ────────────────
      const existingPlan = await StowagePlanModel.findOne({
        voyageId: voyage._id,
        status: { $nin: ['CANCELLED'] },
      }).sort({ createdAt: -1 }).lean() as any;

      let planAction: 'CREATED' | 'UPDATED' = 'CREATED';

      if (existingPlan) {
        if (LOCKED_STATUSES.includes(existingPlan.status)) {
          skipped++;
          details.push({
            voyageNumber: voyage.voyageNumber,
            action: 'SKIPPED',
            reason: 'plan already sent to captain',
            bookingsUsed: 0,
            contractEstimatesUsed: 0,
            conflictCount: 0,
            sectionsAssigned: 0,
          });
          continue;
        }
        // DRAFT or ESTIMATED → update
        planAction = 'UPDATED';
      }

      // ── Step 2a: Real bookings (priority 1) ──────────────────────────────
      const bookings: any[] = await BookingModel.find({
        voyageId: voyage._id,
        status: { $in: ['CONFIRMED', 'PARTIAL', 'PENDING'] },
      }).lean();

      // ── Step 2b: Contract estimates (priority 2) ─────────────────────────
      const contractEstimates: EngineBooking[] = [];

      if (voyage.serviceId) {
        const portCallMap = new Map<string, number>(
          (voyage.portCalls ?? []).map((pc: any) => [pc.portCode as string, pc.sequence as number]),
        );
        console.log(`[AutoGen] ${voyage.voyageNumber}: portCallMap = ${JSON.stringify([...portCallMap.entries()])}`);

        // Contracts that already have a booking for this voyage
        const coveredContractIds = new Set(
          bookings.map((b: any) => b.contractId?.toString()).filter(Boolean),
        );

        const activeContracts = await ContractModel.find({
          serviceId: voyage.serviceId,
          active: true,
        }).lean();

        console.log(`[AutoGen] ${voyage.voyageNumber}: found ${(activeContracts as any[]).length} active contracts for serviceId=${voyage.serviceId}`);

        for (const contract of activeContracts as any[]) {
          const contractId = contract._id.toString();
          if (coveredContractIds.has(contractId)) {
            console.log(`[AutoGen] ${voyage.voyageNumber}: contract ${contract.contractNumber} already covered by booking — skipping`);
            continue;
          }

          const polCode = contract.originPort?.portCode;
          const podCode = contract.destinationPort?.portCode;
          const polSeq = portCallMap.get(polCode);
          const podSeq = portCallMap.get(podCode);

          console.log(`[AutoGen] ${voyage.voyageNumber}: contract ${contract.contractNumber} pol=${polCode}(seq=${polSeq}) pod=${podCode}(seq=${podSeq})`);

          if (polSeq === undefined || podSeq === undefined) {
            console.log(`[AutoGen] ${voyage.voyageNumber}: contract ${contract.contractNumber} pol/pod not in voyage — skipping`);
            continue;
          }

          // Fix 5 — warn if contract.cargoType differs from any counterparty cargoTypes
          const counterparties: any[] = contract.counterparties ?? [];
          for (const cp of counterparties) {
            if (cp.active && contract.cargoType && (cp.cargoTypes ?? []).length > 0) {
              if (!cp.cargoTypes.includes(contract.cargoType)) {
                console.warn(`[AutoGen] Contract ${contract.contractNumber}: cargoType "${contract.cargoType}" not in counterparty "${cp.shipperCode}" cargoTypes [${cp.cargoTypes.join(', ')}]`);
              }
            }
          }

          // Per-counterparty estimates — use counterparty.weeklyEstimate + cargoTypes[0]
          if (counterparties.length > 0) {
            for (let i = 0; i < counterparties.length; i++) {
              const cp = counterparties[i];
              if (!cp.active) continue;
              const pallets = cp.weeklyEstimate;
              if (!pallets || pallets <= 0) continue;
              const cargoType = (cp.cargoTypes ?? [])[0] ?? contract.cargoType ?? 'OTHER_CHILLED';
              const tempRange = getTempRange(cargoType);
              contractEstimates.push({
                bookingId:     `CONTRACT-ESTIMATE-${contractId}-${i}`,
                cargoType,
                tempMin:       tempRange.min,
                tempMax:       tempRange.max,
                pallets,
                polPortCode:   polCode ?? '',
                podPortCode:   podCode ?? '',
                polSeq:        polSeq as number,
                podSeq:        podSeq as number,
                polSequence:   polSeq,
                podSequence:   podSeq,
                shipperId:     '',
                consigneeCode: '',
                confidence:    'CONTRACT_ESTIMATE' as const,
                frozen:        false,
              });
              console.log(`[AutoGen] ${voyage.voyageNumber}: contract ${contract.contractNumber} cp[${i}] ${cp.shipperCode} → ${pallets} pallets of ${cargoType}`);
            }
          } else {
            // Fallback: use contract-level weeklyPallets + cargoType
            const pallets = contract.weeklyPallets;
            if (!pallets || pallets <= 0) continue;
            const cargoType = contract.cargoType ?? 'OTHER_CHILLED';
            const tempRange = getTempRange(cargoType);
            contractEstimates.push({
              bookingId:     `CONTRACT-ESTIMATE-${contractId}`,
              cargoType,
              tempMin:       tempRange.min,
              tempMax:       tempRange.max,
              pallets,
              polPortCode:   polCode ?? '',
              podPortCode:   podCode ?? '',
              polSeq:        polSeq as number,
              podSeq:        podSeq as number,
              polSequence:   polSeq,
              podSequence:   podSeq,
              shipperId:     '',
              consigneeCode: '',
              confidence:    'CONTRACT_ESTIMATE' as const,
              frozen:        false,
            });
            console.log(`[AutoGen] ${voyage.voyageNumber}: contract ${contract.contractNumber} fallback → ${pallets} pallets of ${cargoType}`);
          }
        }

        console.log(`[AutoGen] ${voyage.voyageNumber}: contractEstimates count = ${contractEstimates.length}`);
      }

      // ── Step 2c: Combine ─────────────────────────────────────────────────
      const realEngineBookings = buildEngineBookings(bookings, voyage);
      const allEngineBookings = [...realEngineBookings, ...contractEstimates];

      if (allEngineBookings.length === 0) {
        skipped++;
        details.push({
          voyageNumber: voyage.voyageNumber,
          action: 'SKIPPED',
          reason: 'no bookings and no matching contracts',
          bookingsUsed: 0,
          contractEstimatesUsed: 0,
          conflictCount: 0,
          sectionsAssigned: 0,
        });
        continue;
      }

      // ── Step 3: Fetch vessel ─────────────────────────────────────────────
      const vessel = await VesselModel.findById(voyage.vesselId).lean() as any;
      if (!vessel) {
        skipped++;
        details.push({
          voyageNumber: voyage.voyageNumber,
          action: 'SKIPPED',
          reason: 'vessel not found',
          bookingsUsed: realEngineBookings.length,
          contractEstimatesUsed: contractEstimates.length,
          conflictCount: 0,
          sectionsAssigned: 0,
        });
        continue;
      }

      try {
        // ── Step 4: Inherited zone temps from prior completed plan ───────
        let previousZoneTemps: Record<string, number> | undefined;
        const priorPlan = await StowagePlanModel.findOne({
          vesselId: voyage.vesselId,
          status: 'COMPLETED',
          voyageId: { $ne: voyage._id },
        }).sort({ createdAt: -1 }).lean() as any;

        if (priorPlan?.coolingSectionStatus?.length) {
          previousZoneTemps = {};
          for (const css of priorPlan.coolingSectionStatus) {
            if (css.assignedTemperature != null) {
              previousZoneTemps[css.zoneId] = css.assignedTemperature;
            }
          }
          if (Object.keys(previousZoneTemps).length === 0) previousZoneTemps = undefined;
        }

        // ── Step 5: Run engine ───────────────────────────────────────────
        const engineInput: EngineInput = {
          vessel: {
            sections: buildEngineSections(vessel),
            zones:    buildEngineZones(vessel),
          },
          bookings:          realEngineBookings,
          contractEstimates: contractEstimates,
          portCalls:         (voyage.portCalls ?? []).map((pc: any) => ({
            sequence: pc.sequence as number,
            portCode: pc.portCode as string,
          })),
          previousZoneTemps,
          plannerOverrides: undefined,
          phase: bookings.some((b: any) => (b.confirmedQuantity ?? 0) > 0) ? 'CONFIRMED' : 'ESTIMATED',
        };

        const engineOutput = generateStowagePlan(engineInput);

        // Build combined booking metadata for mapEngineOutputToDocument
        // Real bookings carry the full DB doc; contract estimates carry pol/pod snapshots.
        const allBookingMeta = [
          ...bookings,
          ...contractEstimates.map(ce => ({
            _id: { toString: () => ce.bookingId },
            cargoType: ce.cargoType,
            polPortCode: ce.polPortCode,
            podPortCode: ce.podPortCode,
          })),
        ];

        const { cargoPositions, coolingSectionStatus, hasHardConflict } =
          mapEngineOutputToDocument(engineOutput, allBookingMeta);

        const hardConflictCount = engineOutput.conflicts.filter(c =>
          c.type !== 'STABILITY_WARNING',
        ).length;
        const sectionsAssigned = new Set(engineOutput.assignments.map(a => a.sectionId)).size;
        const newStatus = hasHardConflict ? 'ESTIMATED' : 'DRAFT';

        // ── Step 6: CREATE or UPDATE ─────────────────────────────────────
        if (planAction === 'UPDATED' && existingPlan) {
          const updatePayload = {
            cargoPositions,
            coolingSectionStatus,
            conflicts:           engineOutput.conflicts,
            stabilityIndicators: engineOutput.stabilityByPort,
            generationMethod:    'AUTO',
            status:              newStatus,
          };

          if ((existingPlan.communicationLog ?? []).length > 0) {
            await StowagePlanModel.findByIdAndUpdate(existingPlan._id, {
              $set: updatePayload,
              $push: {
                communicationLog: {
                  sentAt: new Date(),
                  sentBy: 'AUTO',
                  recipients: [],
                  planStatus: newStatus,
                  note: `Auto-regenerated: ${realEngineBookings.length} booking(s), ${contractEstimates.length} contract estimate(s)`,
                },
              },
            });
          } else {
            await StowagePlanModel.findByIdAndUpdate(existingPlan._id, { $set: updatePayload });
          }

          updated++;
          details.push({
            voyageNumber:          voyage.voyageNumber,
            action:                'UPDATED',
            bookingsUsed:          realEngineBookings.length,
            contractEstimatesUsed: contractEstimates.length,
            conflictCount:         hardConflictCount,
            sectionsAssigned,
          });
        } else {
          const planNumber = await generatePlanNumber(
            voyage.voyageNumber,
            vessel.name,
            voyage.weekNumber ?? undefined,
            voyage.departureDate ?? undefined,
          );

          await StowagePlanModel.create({
            planNumber,
            vesselId:    vessel._id,
            vesselName:  vessel.name,
            voyageId:    voyage._id,
            voyageNumber: voyage.voyageNumber,
            generationMethod: 'AUTO',
            status:      newStatus,
            cargoPositions,
            coolingSectionStatus,
            conflicts:            engineOutput.conflicts,
            stabilityIndicators:  engineOutput.stabilityByPort,
            overstowViolations:   [],
            temperatureConflicts: [],
            weightDistributionWarnings: [],
            createdBy: 'AUTO',
          });

          created++;
          details.push({
            voyageNumber:          voyage.voyageNumber,
            action:                'CREATED',
            bookingsUsed:          realEngineBookings.length,
            contractEstimatesUsed: contractEstimates.length,
            conflictCount:         hardConflictCount,
            sectionsAssigned,
          });
        }
      } catch (err) {
        skipped++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Engine error for voyage ${voyage.voyageNumber}:`, msg);
        details.push({
          voyageNumber: voyage.voyageNumber,
          action: 'SKIPPED',
          reason: `Engine error: ${msg}`,
          bookingsUsed: 0,
          contractEstimatesUsed: 0,
          conflictCount: 0,
          sectionsAssigned: 0,
        });
      }
    }

    const total = created + updated;
    const parts: string[] = [];
    if (created > 0) parts.push(`created ${created}`);
    if (updated > 0) parts.push(`updated ${updated}`);

    return {
      success: true,
      created,
      updated,
      skipped,
      details,
      message: parts.length === 0
        ? 'No plans generated — no eligible voyages with bookings or matching contracts'
        : `Auto-generate: ${parts.join(', ')} draft plan${total > 1 ? 's' : ''}`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error auto-generating draft plans:', msg);
    return { success: false, error: `Auto-generation failed: ${msg}` };
  }
}

// ----------------------------------------------------------------------------
// REPLAN AFTER TEMPERATURE OVERRIDE
// Re-runs the engine with planner zone overrides; frozen confirmed assignments
// are not moved. Updates plan in-place and appends to temperatureChangelog.
// ----------------------------------------------------------------------------

export async function replanAfterTemperatureOverride(
  planId: unknown,
  zoneOverrides: { zoneId: string; temperature: number }[],
) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role as string;
    if (!['ADMIN', 'SHIPPING_PLANNER'].includes(role)) return { success: false, error: 'Forbidden' };

    const id = z.string().min(1).parse(planId);
    if (!Array.isArray(zoneOverrides) || zoneOverrides.length === 0) {
      return { success: false, error: 'At least one zone override is required' };
    }

    await connectDB();

    const plan = await StowagePlanModel.findById(id);
    if (!plan) return { success: false, error: 'Plan not found' };

    const voyage = await VoyageModel.findById(plan.voyageId).lean() as any;
    if (!voyage) return { success: false, error: 'Voyage not found' };

    const vessel = await VesselModel.findById(plan.vesselId).lean() as any;
    if (!vessel) return { success: false, error: 'Vessel not found' };

    const bookings: any[] = await BookingModel.find({
      voyageId: plan.voyageId,
      status: { $in: ['CONFIRMED', 'PARTIAL'] },
    }).lean();

    // Build planner overrides map
    const plannerOverrides: Record<string, number> = {};
    for (const o of zoneOverrides) {
      plannerOverrides[o.zoneId] = o.temperature;
    }

    // Build engine input — confirmed bookings are frozen
    const engineInput: EngineInput = {
      vessel: {
        sections: buildEngineSections(vessel),
        zones:    buildEngineZones(vessel),
      },
      bookings:         buildEngineBookings(bookings, voyage),
      portCalls:        (voyage.portCalls ?? []).map((pc: any) => ({
        sequence: pc.sequence as number,
        portCode: pc.portCode as string,
      })),
      previousZoneTemps: undefined,
      plannerOverrides,
      phase: bookings.some((b: any) => (b.confirmedQuantity ?? 0) > 0) ? 'CONFIRMED' : 'ESTIMATED',
    };

    const engineOutput = generateStowagePlan(engineInput);
    const { cargoPositions, coolingSectionStatus, hasHardConflict } =
      mapEngineOutputToDocument(engineOutput, bookings);

    // Compute temperatureChangelog entry
    const changedBy = (session.user as any).name ?? (session.user as any).email ?? 'SYSTEM';
    const changes: { zoneId: string; coolingSectionIds: string[]; fromTemp: number; toTemp: number }[] = [];

    for (const o of zoneOverrides) {
      const existing = (plan.coolingSectionStatus ?? []).find((css: any) => css.zoneId === o.zoneId);
      const fromTemp = existing?.assignedTemperature ?? 0;
      if (fromTemp === o.temperature) continue;
      changes.push({
        zoneId:           o.zoneId,
        coolingSectionIds: existing?.coolingSectionIds ?? [],
        fromTemp,
        toTemp:           o.temperature,
      });
    }

    // Bookings whose section assignments changed
    const oldSectionMap = new Map<string, string>();
    for (const pos of (plan.cargoPositions ?? []) as any[]) {
      oldSectionMap.set(String(pos.bookingId), pos.compartment?.id ?? '');
    }
    const newSectionMap = new Map<string, string>();
    for (const a of engineOutput.assignments) {
      newSectionMap.set(a.bookingId, a.sectionId);
    }
    const affectedBookings = bookings
      .map((b: any) => b._id.toString())
      .filter(bid => oldSectionMap.get(bid) !== newSectionMap.get(bid));

    // Apply updates
    plan.cargoPositions         = cargoPositions as any;
    plan.coolingSectionStatus   = coolingSectionStatus as any;
    (plan as any).conflicts     = engineOutput.conflicts;
    (plan as any).stabilityIndicators = engineOutput.stabilityByPort;
    (plan as any).generationMethod = 'REVISED';
    plan.status = hasHardConflict ? 'ESTIMATED' : 'IN_REVISION';

    if (!plan.temperatureChangelog) plan.temperatureChangelog = [];
    if (changes.length > 0) {
      (plan.temperatureChangelog as any[]).push({
        changedAt:        new Date(),
        changedBy,
        changes,
        affectedBookings,
      });
    }

    plan.markModified('cargoPositions');
    plan.markModified('coolingSectionStatus');
    plan.markModified('temperatureChangelog');
    await plan.save();

    return {
      success: true,
      data: JSON.parse(JSON.stringify(plan)),
      conflictCount: engineOutput.conflicts.filter(c => c.type !== 'STABILITY_WARNING').length,
      message: `Plan replanned with ${zoneOverrides.length} zone override(s). ${affectedBookings.length} booking assignment(s) changed.`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error replanning after temperature override:', msg);
    return { success: false, error: `Replan failed: ${msg}` };
  }
}

// ----------------------------------------------------------------------------
// GET STOWAGE PLAN WITH CONFLICTS
// Returns a plan including conflicts[] and stabilityIndicators[] fields.
// Used by the plan detail page (Step 5).
// ----------------------------------------------------------------------------

export async function getStowagePlanWithConflicts(id: unknown) {
  try {
    const planId = StowagePlanIdSchema.parse(id);
    await connectDB();

    const plan = await StowagePlanModel
      .findById(planId)
      .populate('vesselId')
      .populate('voyageId')
      .lean();

    if (!plan) return { success: false, error: 'Plan not found' };

    const p = plan as any;
    return {
      success: true,
      data: JSON.parse(JSON.stringify({
        ...p,
        conflicts:           p.conflicts           ?? [],
        stabilityIndicators: p.stabilityIndicators ?? [],
        generationMethod:    p.generationMethod    ?? 'MANUAL',
      })),
    };
  } catch (error) {
    console.error('Error fetching plan with conflicts:', error);
    return { success: false, error: 'Failed to fetch plan' };
  }
}

// ----------------------------------------------------------------------------
// GET ADMIN PLANS — full list for /admin Stowage Plans tab
// Returns all plans with populated vessel + voyage, sorted newest first.
// ----------------------------------------------------------------------------

export async function getAdminPlans() {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, data: [], error: 'Unauthorized' };
    if ((session.user as any).role !== 'ADMIN') return { success: false, data: [], error: 'Forbidden' };

    await connectDB();

    const plans = await StowagePlanModel.find()
      .populate('vesselId', 'name')
      .populate('voyageId', 'voyageNumber departureDate weekNumber')
      .lean();

    (plans as any[]).sort((a: any, b: any) => {
      const da = new Date((a.voyageId as any)?.departureDate ?? 0).getTime();
      const db = new Date((b.voyageId as any)?.departureDate ?? 0).getTime();
      if (da !== db) return da - db;
      return (a.planNumber ?? '').localeCompare(b.planNumber ?? '');
    });

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

// ----------------------------------------------------------------------------
// GET VOYAGES WITHOUT PLANS
// Returns PLANNED/IN_PROGRESS voyages that have no stowage plan yet (any
// non-cancelled status counts as "has a plan").  Populates vessel name +
// temperatureZones so the wizard can render the zone config SVG immediately.
// ----------------------------------------------------------------------------

export async function getVoyagesWithoutPlans() {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized', data: [] };

    await connectDB();

    // Collect voyageIds that already have a plan (any status except CANCELLED)
    const existingPlans = await StowagePlanModel.find({
      status: { $nin: ['CANCELLED'] },
    }).select('voyageId').lean();
    const plannedVoyageIds = new Set((existingPlans as any[]).map((p: any) => String(p.voyageId)));

    const serviceFilter = (session.user as any)?.serviceFilter ?? [];
    let serviceQuery: Record<string, unknown> = {};
    if (serviceFilter.length > 0) {
      const services = await ServiceModel.find({ serviceCode: { $in: serviceFilter } }).select('_id').lean();
      const serviceIds = (services as any[]).map((s: any) => s._id);
      serviceQuery = { serviceId: { $in: serviceIds } };
    }

    const voyages = await VoyageModel.find({
      status: { $in: ['PLANNED', 'IN_PROGRESS'] },
      ...serviceQuery,
    })
      .populate('vesselId', 'name temperatureZones')
      .sort({ departureDate: 1 })
      .lean();

    const without = (voyages as any[]).filter((v: any) => !plannedVoyageIds.has(String(v._id)));

    return { success: true, data: JSON.parse(JSON.stringify(without)) };
  } catch (error) {
    console.error('Error fetching voyages without plans:', error);
    return { success: false, error: 'Failed to fetch voyages', data: [] };
  }
}

// ----------------------------------------------------------------------------
// AUTO-GENERATE SINGLE PLAN
// Generates (or replaces) a draft stowage plan for ONE voyage with explicit
// zone temperatures supplied by the planner.  Returns the new plan's _id so
// the UI can navigate directly to the plan detail page.
// ----------------------------------------------------------------------------

export async function autoGenerateSinglePlan(
  voyageId: string,
  zoneTemperatures: Record<string, number>,
): Promise<{ success: boolean; planId?: string; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role as string;
    if (!['ADMIN', 'SHIPPING_PLANNER'].includes(role)) return { success: false, error: 'Forbidden' };

    await connectDB();

    const voyage = await VoyageModel.findById(voyageId).lean() as any;
    if (!voyage) return { success: false, error: 'Voyage not found' };

    const LOCKED_STATUSES = [
      'EMAIL_SENT', 'CAPTAIN_APPROVED', 'CAPTAIN_REJECTED',
      'IN_REVISION', 'READY_FOR_EXECUTION', 'IN_EXECUTION', 'COMPLETED',
    ];

    const existingPlan = await StowagePlanModel.findOne({
      voyageId: voyage._id,
      status: { $nin: ['CANCELLED'] },
    }).sort({ createdAt: -1 }).lean() as any;

    if (existingPlan && LOCKED_STATUSES.includes(existingPlan.status)) {
      return { success: false, error: 'A locked plan already exists for this voyage' };
    }

    const planAction = existingPlan ? 'UPDATED' : 'CREATED';

    // ── Step 1: Real bookings ─────────────────────────────────────────────────
    const bookings: any[] = await BookingModel.find({
      voyageId: voyage._id,
      status: { $in: ['CONFIRMED', 'PARTIAL', 'PENDING'] },
    }).lean();

    // ── Step 2: SpaceForecasts for this voyage (PENDING_REVIEW or INCORPORATED)
    const activeForecasts = await SpaceForecastModel.find({
      voyageId: voyage._id,
      planImpact: { $in: ['PENDING_REVIEW', 'INCORPORATED'] },
    }).lean();

    // Map: `${shipperId}:${contractId}` → forecast doc (at most one active per pair)
    const forecastByPair = new Map<string, any>();
    for (const fc of activeForecasts as any[]) {
      const key = `${fc.shipperId?.toString() ?? ''}:${fc.contractId?.toString() ?? ''}`;
      forecastByPair.set(key, fc);
    }

    // ── Step 3: Resolve per-counterparty cargo source with forecast priority ──
    // forecastBookings: SHIPPER_PORTAL / PLANNER_ENTRY → confidence ESTIMATED
    // contractDefaultEstimates: CONTRACT_DEFAULT → confidence CONTRACT_ESTIMATE
    const forecastBookings: EngineBooking[] = [];
    const contractDefaultEstimates: EngineBooking[] = [];
    type SnapshotEntry = {
      shipperId: string; shipperName: string; contractId: string;
      polPortCode: string; podPortCode: string; pallets: number;
      source: string; sourceId: string; snapshotAt: Date;
    };
    const cargoSnapshot: SnapshotEntry[] = [];

    if (voyage.serviceId) {
      const portCallMap = new Map<string, number>(
        (voyage.portCalls ?? []).map((pc: any) => [pc.portCode as string, pc.sequence as number]),
      );

      // Build per-contract coverage from bookings.
      // contractCoverageMap[contractId] = Set<shipperId> (specific shippers covered)
      //                                 | 'ALL' (if a booking has no shipperId — whole contract covered)
      const contractCoverageMap = new Map<string, Set<string> | 'ALL'>();
      for (const b of bookings) {
        const cid = b.contractId?.toString();
        if (!cid) continue;
        const sid = b.shipperId?.toString();
        if (!sid) {
          contractCoverageMap.set(cid, 'ALL');
        } else if (contractCoverageMap.get(cid) !== 'ALL') {
          if (!contractCoverageMap.has(cid)) contractCoverageMap.set(cid, new Set());
          (contractCoverageMap.get(cid) as Set<string>).add(sid);
        }
      }

      const activeContracts = await ContractModel.find({
        serviceId: voyage.serviceId,
        active: true,
      }).lean();

      for (const contract of activeContracts as any[]) {
        const contractId = contract._id.toString();
        const polCode = contract.originPort?.portCode;
        const podCode = contract.destinationPort?.portCode;
        const polSeq = portCallMap.get(polCode);
        const podSeq = portCallMap.get(podCode);
        if (polSeq === undefined || podSeq === undefined) continue;

        const counterparties: any[] = contract.counterparties ?? [];

        if (counterparties.length > 0) {
          for (let i = 0; i < counterparties.length; i++) {
            const cp = counterparties[i];
            if (!cp.active) continue;

            const shipperId = cp.shipperId?.toString() ?? '';

            // Priority 1: booking exists for this shipper+contract → skip
            const coverage = contractCoverageMap.get(contractId);
            if (coverage === 'ALL') continue;
            if (coverage instanceof Set && coverage.has(shipperId)) continue;

            const pairKey = `${shipperId}:${contractId}`;
            const forecast = forecastByPair.get(pairKey);

            // Priority 4: NO_CARGO forecast → skip engine, record snapshot
            if (forecast?.source === 'NO_CARGO') {
              cargoSnapshot.push({
                shipperId,
                shipperName: cp.shipperName ?? '',
                contractId,
                polPortCode: polCode ?? '',
                podPortCode: podCode ?? '',
                pallets: 0,
                source: 'NO_CARGO',
                sourceId: (forecast as any)._id.toString(),
                snapshotAt: new Date(),
              });
              continue;
            }

            // Priority 2: SHIPPER_PORTAL or PLANNER_ENTRY forecast → use forecast pallets
            if (forecast && (forecast.source === 'SHIPPER_PORTAL' || forecast.source === 'PLANNER_ENTRY')) {
              const pallets: number = forecast.estimatedPallets;
              const cargoType: string = forecast.cargoType ?? (cp.cargoTypes ?? [])[0] ?? contract.cargoType ?? 'OTHER_CHILLED';
              const tempRange = getTempRange(cargoType);
              const sourceId: string = (forecast as any)._id.toString();
              forecastBookings.push({
                bookingId:    `FORECAST-${sourceId}`,
                cargoType,
                tempMin:      tempRange.min,
                tempMax:      tempRange.max,
                pallets,
                polPortCode:  polCode ?? '',
                podPortCode:  podCode ?? '',
                polSeq:       polSeq as number,
                podSeq:       podSeq as number,
                polSequence:  polSeq,
                podSequence:  podSeq,
                shipperId,
                consigneeCode: '',
                confidence:   'ESTIMATED' as const,
                contractId,
                shipperName:  cp.shipperName ?? '',
                frozen:       false,
              });
              cargoSnapshot.push({
                shipperId,
                shipperName: cp.shipperName ?? '',
                contractId,
                polPortCode: polCode ?? '',
                podPortCode: podCode ?? '',
                pallets,
                source: forecast.source as string,
                sourceId,
                snapshotAt: new Date(),
              });
              continue;
            }

            // Priority 3: CONTRACT_DEFAULT — use counterparty weeklyEstimate
            const pallets: number = cp.weeklyEstimate;
            if (!pallets || pallets <= 0) continue;
            const cargoType: string = (cp.cargoTypes ?? [])[0] ?? contract.cargoType ?? 'OTHER_CHILLED';
            const tempRange = getTempRange(cargoType);
            contractDefaultEstimates.push({
              bookingId:    `CONTRACT-ESTIMATE-${contractId}-${i}`,
              cargoType,
              tempMin:      tempRange.min,
              tempMax:      tempRange.max,
              pallets,
              polPortCode:  polCode ?? '',
              podPortCode:  podCode ?? '',
              polSeq:       polSeq as number,
              podSeq:       podSeq as number,
              polSequence:  polSeq,
              podSequence:  podSeq,
              shipperId,
              consigneeCode: '',
              confidence:   'CONTRACT_ESTIMATE' as const,
              contractId,
              shipperName:  cp.shipperName ?? '',
              frozen:       false,
            });
            cargoSnapshot.push({
              shipperId,
              shipperName: cp.shipperName ?? '',
              contractId,
              polPortCode: polCode ?? '',
              podPortCode: podCode ?? '',
              pallets,
              source: 'CONTRACT_DEFAULT',
              sourceId: `${contractId}-${i}`,
              snapshotAt: new Date(),
            });
          }
        } else {
          // No counterparties — contract-level fallback, only if not already covered by any booking
          if (contractCoverageMap.has(contractId)) continue;
          if (!contract.weeklyPallets) continue;
          const cargoType: string = contract.cargoType ?? 'OTHER_CHILLED';
          const tempRange = getTempRange(cargoType);
          contractDefaultEstimates.push({
            bookingId:    `CONTRACT-ESTIMATE-${contractId}`,
            cargoType,
            tempMin:      tempRange.min,
            tempMax:      tempRange.max,
            pallets:      contract.weeklyPallets,
            polPortCode:  polCode ?? '',
            podPortCode:  podCode ?? '',
            polSeq:       polSeq as number,
            podSeq:       podSeq as number,
            polSequence:  polSeq,
            podSequence:  podSeq,
            shipperId:    '',
            consigneeCode: '',
            confidence:   'CONTRACT_ESTIMATE' as const,
            frozen:       false,
          });
          cargoSnapshot.push({
            shipperId: '',
            shipperName: '',
            contractId,
            polPortCode: polCode ?? '',
            podPortCode: podCode ?? '',
            pallets: contract.weeklyPallets,
            source: 'CONTRACT_DEFAULT',
            sourceId: contractId,
            snapshotAt: new Date(),
          });
        }
      }
    }

    // ── Step 4: Add booking entries to snapshot ───────────────────────────────
    for (const b of bookings) {
      const pallets = (b.confirmedQuantity ?? 0) > 0 ? b.confirmedQuantity : (b.requestedQuantity ?? 0);
      cargoSnapshot.push({
        shipperId:   b.shipperId?.toString() ?? '',
        shipperName: b.shipper?.name ?? '',
        contractId:  b.contractId?.toString() ?? '',
        polPortCode: b.pol?.portCode ?? '',
        podPortCode: b.pod?.portCode ?? '',
        pallets,
        source: 'BOOKING',
        sourceId: b._id.toString(),
        snapshotAt: new Date(),
      });
    }

    // ── Step 5: Build engine input ────────────────────────────────────────────
    const realEngineBookings = buildEngineBookings(bookings, voyage);

    const vessel = await VesselModel.findById(voyage.vesselId).lean() as any;
    if (!vessel) return { success: false, error: 'Vessel not found' };

    const validZoneTemps: Record<string, number> = {};
    for (const [k, v] of Object.entries(zoneTemperatures)) {
      if (!isNaN(v)) validZoneTemps[k] = v;
    }

    const engineInput: EngineInput = {
      vessel: {
        sections: buildEngineSections(vessel),
        zones:    buildEngineZones(vessel),
      },
      bookings:          [...realEngineBookings, ...forecastBookings],
      contractEstimates: contractDefaultEstimates,
      portCalls:         (voyage.portCalls ?? []).map((pc: any) => ({
        sequence: pc.sequence as number,
        portCode: pc.portCode as string,
      })),
      previousZoneTemps: undefined,
      plannerOverrides:  Object.keys(validZoneTemps).length > 0 ? validZoneTemps : undefined,
      phase: bookings.some((b: any) => (b.confirmedQuantity ?? 0) > 0) ? 'CONFIRMED' : 'ESTIMATED',
    } as any; // portSequence is required by EngineInput but derived internally from portCalls

    const engineOutput = generateStowagePlan(engineInput as any);

    const allBookingMeta = [
      ...bookings,
      ...forecastBookings.map(fe => ({
        _id: { toString: () => fe.bookingId },
        cargoType: fe.cargoType,
        polPortCode: fe.polPortCode,
        podPortCode: fe.podPortCode,
      })),
      ...contractDefaultEstimates.map(ce => ({
        _id: { toString: () => ce.bookingId },
        cargoType: ce.cargoType,
        polPortCode: ce.polPortCode,
        podPortCode: ce.podPortCode,
      })),
    ];

    const { cargoPositions, coolingSectionStatus, hasHardConflict } =
      mapEngineOutputToDocument(engineOutput, allBookingMeta);

    const newStatus = hasHardConflict ? 'ESTIMATED' : 'DRAFT';
    let planId: string;

    if (planAction === 'UPDATED' && existingPlan) {
      await StowagePlanModel.findByIdAndUpdate(existingPlan._id, {
        $set: {
          cargoPositions,
          coolingSectionStatus,
          cargoSnapshot,
          conflicts:           engineOutput.conflicts,
          stabilityIndicators: engineOutput.stabilityByPort,
          generationMethod:    'AUTO',
          status:              newStatus,
        },
      });
      planId = existingPlan._id.toString();
    } else {
      const planNumber = await generatePlanNumber(
        voyage.voyageNumber,
        vessel.name,
        voyage.weekNumber ?? undefined,
        voyage.departureDate ?? undefined,
      );
      const newPlan = await StowagePlanModel.create({
        planNumber,
        vesselId:     vessel._id,
        vesselName:   vessel.name,
        voyageId:     voyage._id,
        voyageNumber: voyage.voyageNumber,
        generationMethod: 'AUTO',
        status:       newStatus,
        cargoPositions,
        coolingSectionStatus,
        cargoSnapshot,
        conflicts:            engineOutput.conflicts,
        stabilityIndicators:  engineOutput.stabilityByPort,
        overstowViolations:   [],
        temperatureConflicts: [],
        weightDistributionWarnings: [],
        createdBy: session.user.name ?? 'AUTO',
      });
      planId = (newPlan as any)._id.toString();
    }

    return { success: true, planId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('autoGenerateSinglePlan error:', msg);
    return { success: false, error: `Auto-generation failed: ${msg}` };
  }
}
