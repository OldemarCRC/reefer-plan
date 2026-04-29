// ============================================================================
// SPACE FORECAST SERVER ACTIONS
// Manages per-voyage, per-shipper pallet forecasts that feed into stowage plans.
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import {
  SpaceForecastModel,
  VoyageModel,
  ContractModel,
  StowagePlanModel,
} from '@/lib/db/schemas';
import type { SpaceForecast, SpaceForecastSource, SpaceForecastPlanImpact } from '@/types/models';
import { auth } from '@/auth';

// ----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

const CreateSpaceForecastSchema = z.object({
  contractId:       z.string().min(1),
  voyageId:         z.string().min(1),
  estimatedPallets: z.number().int().min(1),
  source:           z.enum(['SHIPPER_PORTAL', 'PLANNER_ENTRY', 'CONTRACT_DEFAULT']),
  notes:            z.string().optional(),
});

// ----------------------------------------------------------------------------
// HELPER: generateForecastNumber
// Format: {officeCode}{svcShort}{voyageNumber}F{seq:3}
// ----------------------------------------------------------------------------

async function generateForecastNumber(
  officeCode: string,
  serviceCode: string,
  voyageNumber: string,
  voyageId: string
): Promise<string> {
  const svcShort = serviceCode.replace(/-/g, '').substring(0, 3).toUpperCase();
  const count = await SpaceForecastModel.countDocuments({ voyageId });
  const seq = String(count + 1).padStart(3, '0');
  return `${officeCode}${svcShort}${voyageNumber}F${seq}`;
}

// ----------------------------------------------------------------------------
// PRIVATE: core forecast creation logic — shared by createSpaceForecast and
// createContractDefaultForecasts
// ----------------------------------------------------------------------------

interface ForecastCoreParams {
  voyageDoc: any;
  contractDoc: any;
  counterparty: any;    // resolved ShipperCounterparty doc
  estimatedPallets: number;
  source: SpaceForecastSource;
  notes?: string;
  submittedBy: string;
}

async function _createForecastCore(
  params: ForecastCoreParams
): Promise<{ success: true; data: SpaceForecast } | { success: false; error: string }> {
  const { voyageDoc, contractDoc, counterparty, estimatedPallets, source, notes, submittedBy } = params;

  const resolvedShipperId = counterparty.shipperId;
  const shipperName   = counterparty.shipperName;
  const consigneeName = contractDoc.consignee?.name ?? contractDoc.client?.name ?? '';
  const consigneeCode = contractDoc.consignee?.code?.trim() || contractDoc.client?.code || 'N/A';
  const cargoType     = counterparty.cargoTypes?.[0] ?? contractDoc.cargoType ?? 'OTHER_CHILLED';
  const polPortCode   = contractDoc.originPort?.portCode ?? contractDoc.origin?.portCode ?? '';
  const podPortCode   = contractDoc.destinationPort?.portCode ?? contractDoc.destination?.portCode ?? '';
  const vesselName    = voyageDoc.vesselName;
  const serviceCode   = voyageDoc.serviceCode ?? contractDoc.serviceCode ?? '';
  const officeCode    = contractDoc.officeCode ?? '';
  const contractNumber = contractDoc.contractNumber;
  const voyageNumber   = voyageDoc.voyageNumber;
  const voyageId       = voyageDoc._id;
  const contractId     = contractDoc._id;

  // Supersede logic — find existing active forecast for this shipper/voyage/contract
  const existingForecast = await SpaceForecastModel.findOne({
    voyageId,
    shipperId: resolvedShipperId,
    contractId,
    planImpact: { $ne: 'SUPERSEDED' },
  }).sort({ submittedAt: -1 }).lean();

  let newPlanImpact: SpaceForecastPlanImpact;
  if (existingForecast) {
    newPlanImpact = (existingForecast as any).estimatedPallets === estimatedPallets
      ? 'NO_CHANGE'
      : 'PENDING_REVIEW';
  } else {
    newPlanImpact = 'PENDING_REVIEW';
  }

  // Generate forecast number
  const forecastNumber = await generateForecastNumber(
    officeCode,
    serviceCode,
    voyageNumber,
    voyageId.toString()
  );

  // Create new forecast document
  const forecastDoc = await SpaceForecastModel.create({
    forecastNumber,
    contractId,
    contractNumber,
    voyageId,
    voyageNumber,
    vesselName,
    serviceCode,
    officeCode,
    shipperId: resolvedShipperId,
    shipperName,
    consigneeName,
    consigneeCode,
    cargoType,
    polPortCode,
    podPortCode,
    estimatedPallets,
    source,
    submittedBy,
    submittedAt: new Date(),
    planImpact: newPlanImpact,
    previousForecastId: existingForecast ? (existingForecast as any)._id : undefined,
    notes,
  });

  // Mark old forecast as superseded
  if (existingForecast) {
    await SpaceForecastModel.findByIdAndUpdate((existingForecast as any)._id, {
      planImpact: 'SUPERSEDED',
    });
  }

  // Notify stowage plan if this changes the expected pallet count
  if (newPlanImpact === 'PENDING_REVIEW') {
    await StowagePlanModel.findOneAndUpdate(
      { voyageId, status: { $ne: 'CANCELLED' } },
      { $addToSet: { pendingForecastUpdates: forecastDoc._id.toString() } }
    );
  }

  return { success: true, data: forecastDoc.toObject() as SpaceForecast };
}

// ----------------------------------------------------------------------------
// getSpaceForecasts — any authenticated role
// Returns all non-superseded forecasts for a voyage, newest first.
// ----------------------------------------------------------------------------

export async function getSpaceForecasts(
  voyageId: string
): Promise<{ success: true; data: SpaceForecast[] } | { success: false; data: []; error: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, data: [], error: 'Unauthorized' };

    await connectDB();
    const forecasts = await SpaceForecastModel.find({
      voyageId,
      planImpact: { $ne: 'SUPERSEDED' },
    }).sort({ submittedAt: -1 }).lean();

    return {
      success: true,
      data: (forecasts as any[]).map((f: any) => f as SpaceForecast),
    };
  } catch (err: any) {
    return { success: false, data: [], error: err.message ?? 'Failed to fetch forecasts' };
  }
}

// ----------------------------------------------------------------------------
// getMyForecasts — EXPORTER role only
// Returns forecasts for the session shipper, optionally filtered by voyage.
// ----------------------------------------------------------------------------

export async function getMyForecasts(
  voyageId?: string
): Promise<{ success: true; data: SpaceForecast[] } | { success: false; data: []; error: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, data: [], error: 'Unauthorized' };
    if ((session.user as any).role !== 'EXPORTER') {
      return { success: false, data: [], error: 'Only exporters can access their forecasts' };
    }
    const shipperId = (session.user as any).shipperId;
    if (!shipperId) {
      return { success: false, data: [], error: 'Account not linked to a shipper' };
    }

    await connectDB();
    const query: any = { shipperId, planImpact: { $ne: 'SUPERSEDED' } };
    if (voyageId) query.voyageId = voyageId;

    const forecasts = await SpaceForecastModel.find(query).sort({ submittedAt: -1 }).lean();
    return {
      success: true,
      data: (forecasts as any[]).map((f: any) => f as SpaceForecast),
    };
  } catch (err: any) {
    return { success: false, data: [], error: err.message ?? 'Failed to fetch forecasts' };
  }
}

// ----------------------------------------------------------------------------
// createSpaceForecast — ADMIN, SHIPPING_PLANNER, or EXPORTER
// ----------------------------------------------------------------------------

export async function createSpaceForecast(
  input: unknown
): Promise<{ success: true; data: SpaceForecast } | { success: false; error: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role as string;
    if (!['ADMIN', 'SHIPPING_PLANNER', 'EXPORTER'].includes(role)) {
      return { success: false, error: 'Forbidden' };
    }

    // 1. Validate
    let validated: z.infer<typeof CreateSpaceForecastSchema>;
    try {
      validated = CreateSpaceForecastSchema.parse(input);
    } catch (err: any) {
      return { success: false, error: err.issues?.[0]?.message ?? 'Validation error' };
    }

    await connectDB();

    // 2. Fetch voyage — must exist and be open
    const voyage = await VoyageModel.findById(validated.voyageId).lean();
    if (!voyage) return { success: false, error: 'Voyage not found' };
    const voyageStatus = (voyage as any).status as string;
    if (['CANCELLED', 'CLOSED', 'COMPLETED'].includes(voyageStatus)) {
      return { success: false, error: `Voyage is ${voyageStatus.toLowerCase()} and cannot accept new forecasts` };
    }

    // 3. Fetch contract — must exist and be active
    const contract = await ContractModel.findById(validated.contractId).lean();
    if (!contract) return { success: false, error: 'Contract not found' };
    if (!(contract as any).active) return { success: false, error: 'Contract is not active' };

    // 4. Resolve counterparty
    const counterparties: any[] = (contract as any).counterparties ?? [];
    let counterparty: any;
    if (role === 'EXPORTER') {
      const shipperId = (session.user as any).shipperId;
      counterparty = counterparties.find(
        (cp: any) => cp.shipperId?.toString() === shipperId?.toString() && cp.active !== false
      );
    } else {
      counterparty = counterparties.find((cp: any) => cp.active !== false);
    }
    if (!counterparty) {
      return { success: false, error: 'No active counterparty found for this shipper on this contract' };
    }

    // 5–11. Core creation logic
    const submittedBy = (session.user as any).email ?? session.user.name ?? 'SYSTEM';
    return await _createForecastCore({
      voyageDoc: voyage,
      contractDoc: contract,
      counterparty,
      estimatedPallets: validated.estimatedPallets,
      source: validated.source,
      notes: validated.notes,
      submittedBy,
    });
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to create forecast' };
  }
}

// ----------------------------------------------------------------------------
// createContractDefaultForecasts — ADMIN or SHIPPING_PLANNER only
// Creates one CONTRACT_DEFAULT forecast per active counterparty on a contract.
// ----------------------------------------------------------------------------

export async function createContractDefaultForecasts(
  voyageId: string,
  contractId: string
): Promise<{ success: true; created: number; skipped: number } | { success: false; error: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role as string;
    if (!['ADMIN', 'SHIPPING_PLANNER'].includes(role)) {
      return { success: false, error: 'Forbidden' };
    }

    await connectDB();

    // 1. Fetch voyage
    const voyage = await VoyageModel.findById(voyageId).lean();
    if (!voyage) return { success: false, error: 'Voyage not found' };
    const voyageStatus = (voyage as any).status as string;
    if (['CANCELLED', 'CLOSED', 'COMPLETED'].includes(voyageStatus)) {
      return { success: false, error: `Voyage is ${voyageStatus.toLowerCase()} and cannot accept new forecasts` };
    }

    // 2. Fetch contract
    const contract = await ContractModel.findById(contractId).lean();
    if (!contract) return { success: false, error: 'Contract not found' };
    if (!(contract as any).active) return { success: false, error: 'Contract is not active' };

    // 3. Filter to active counterparties
    const counterparties: any[] = (contract as any).counterparties ?? [];
    const activeCounterparties = counterparties.filter((cp: any) => cp.active !== false);

    const submittedBy = (session.user as any).email ?? session.user.name ?? 'SYSTEM';
    let created = 0;
    let skipped = 0;

    // 4. Create forecast for each active counterparty with a non-zero weeklyEstimate
    for (const cp of activeCounterparties) {
      const weeklyEstimate: number = cp.weeklyEstimate ?? 0;
      if (!weeklyEstimate || weeklyEstimate === 0) {
        skipped++;
        continue;
      }
      const result = await _createForecastCore({
        voyageDoc: voyage,
        contractDoc: contract,
        counterparty: cp,
        estimatedPallets: weeklyEstimate,
        source: 'CONTRACT_DEFAULT',
        submittedBy,
      });
      if (result.success) created++;
      else skipped++;
    }

    return { success: true, created, skipped };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to create contract default forecasts' };
  }
}

// ----------------------------------------------------------------------------
// markForecastIncorporated — ADMIN or SHIPPING_PLANNER only
// Marks a forecast as incorporated into a stowage plan and removes it from
// the plan's pendingForecastUpdates list.
// ----------------------------------------------------------------------------

export async function markForecastIncorporated(
  forecastId: string,
  planId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role as string;
    if (!['ADMIN', 'SHIPPING_PLANNER'].includes(role)) {
      return { success: false, error: 'Forbidden' };
    }

    await connectDB();

    const forecast = await SpaceForecastModel.findById(forecastId).lean();
    if (!forecast) return { success: false, error: 'Forecast not found' };
    if ((forecast as any).planImpact === 'SUPERSEDED') {
      return { success: false, error: 'Cannot modify a superseded forecast' };
    }

    await SpaceForecastModel.findByIdAndUpdate(forecastId, {
      planImpact: 'INCORPORATED',
      incorporatedInPlanId: planId,
      reviewedBy: (session.user as any).email ?? session.user.name,
      reviewedAt: new Date(),
    });

    await StowagePlanModel.findByIdAndUpdate(planId, {
      $pull: { pendingForecastUpdates: forecastId },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to mark forecast as incorporated' };
  }
}

// ----------------------------------------------------------------------------
// dismissBookingReplacement — ADMIN or SHIPPING_PLANNER only
// Acknowledges that a forecast was superseded by a booking; removes it from
// the plan's pendingBookingReplacements list. planImpact stays REPLACED_BY_BOOKING.
// ----------------------------------------------------------------------------

export async function dismissBookingReplacement(
  forecastId: string,
  planId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role as string;
    if (!['ADMIN', 'SHIPPING_PLANNER'].includes(role)) {
      return { success: false, error: 'Forbidden' };
    }

    await connectDB();

    const forecast = await SpaceForecastModel.findById(forecastId).lean();
    if (!forecast) return { success: false, error: 'Forecast not found' };
    if ((forecast as any).planImpact !== 'REPLACED_BY_BOOKING') {
      return { success: false, error: 'Forecast is not in REPLACED_BY_BOOKING state' };
    }

    await SpaceForecastModel.findByIdAndUpdate(forecastId, {
      reviewedBy: (session.user as any).email ?? session.user.name,
      reviewedAt: new Date(),
    });

    await StowagePlanModel.findByIdAndUpdate(planId, {
      $pull: { pendingBookingReplacements: forecastId },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to dismiss booking replacement' };
  }
}
