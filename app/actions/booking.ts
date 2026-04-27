// ============================================================================
// BOOKING SERVER ACTIONS
// Phase 9A — Redesigned with contract-based creation, per-voyage sequential
// booking numbers, and SHIPPER/CONSIGNEE model.
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { BookingModel, ContractModel, VoyageModel, VesselModel, ServiceModel, OfficeModel, UserModel, SpaceForecastModel, StowagePlanModel } from '@/lib/db/schemas';
import {
  sendBookingReceivedToShipper,
  sendBookingCreatedOnBehalf,
  sendBookingReceivedToPlanners,
  sendBookingStatusChanged,
  sendBookingCancelledToShipper,
  sendBookingCancelledToPlanners,
  sendBookingModifiedToShipper,
  sendBookingModifiedToPlanners,
  sendStandbyResolved,
} from '@/lib/email';
import type { BookingStatus } from '@/types/models';
import { auth } from '@/auth';
import { buildServiceFilter } from '@/lib/utils/accessFilter';

// ----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

const BookingIdSchema = z.string().min(1, 'Booking ID is required');

const CargoTypeSchema = z.enum([
  'BANANAS', 'ORGANIC_BANANAS', 'PLANTAINS', 'FROZEN_FISH', 'TABLE_GRAPES',
  'CITRUS', 'AVOCADOS', 'BERRIES', 'KIWIS', 'PINEAPPLES', 'CHERRIES',
  'BLUEBERRIES', 'PLUMS', 'PEACHES', 'APPLES', 'PEARS', 'PAPAYA',
  'MANGOES', 'OTHER_FROZEN', 'OTHER_CHILLED',
]);

const CreateBookingFromContractSchema = z.object({
  contractId:             z.string().min(1, 'Contract ID is required'),
  voyageId:               z.string().min(1, 'Voyage ID is required'),
  shipperId:              z.string().optional(),
  shipperCode:            z.string().min(1, 'Shipper code is required'),
  consigneeCode:          z.string().min(1, 'Consignee code is required'),
  cargoType:              CargoTypeSchema,
  cargoMode:              z.enum(['HOLD', 'CONTAINER']).default('HOLD'),
  weekNumber:             z.number().int().min(1).max(52).optional(),
  requestedQuantity:      z.number().int().positive().max(10000),
  requestedTemperature:   z.number().optional(),
  estimatedWeightPerUnit: z.number().optional(),
  containerType:          z.enum(['20FT', '40FT', '40HC']).optional(),
  estimateSource:         z.enum(['CONTRACT_DEFAULT', 'SHIPPER_CONFIRMED']).default('CONTRACT_DEFAULT'),
  shipperEmailDate:       z.coerce.date().optional(),
  shipperEmailNotes:      z.string().optional(),
});

const ApproveBookingSchema = z.object({
  bookingId:         z.string().min(1),
  confirmedQuantity: z.number().int().min(0),
  standbyQuantity:   z.number().int().min(0),
  rejectedQuantity:  z.number().int().min(0),
}).refine(
  data => data.confirmedQuantity + data.standbyQuantity + data.rejectedQuantity > 0,
  { message: 'At least one quantity must be greater than zero' }
);

const ResolveStandbySchema = z.object({
  bookingId: z.string().min(1),
  action:    z.enum(['CONFIRM', 'REJECT']),
  quantity:  z.number().int().min(1).optional(),
});

const RejectBookingSchema = z.object({
  bookingId: z.string().min(1),
  rejectionReason: z.string().min(1).max(500),
});

const CancelBookingSchema = z.object({
  bookingId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

const UpdateBookingQuantitySchema = z.object({
  bookingId: z.string().min(1),
  requestedQuantity: z.number().int().min(1).max(10000),
  confirmedQuantity: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'PARTIAL', 'STANDBY', 'REJECTED', 'CANCELLED']).optional(),
});

// ----------------------------------------------------------------------------
// AUTO-NUMBERING HELPER
// Format: {officeCode}{serviceShortCode}{voyageNumber}{seq:3}
// Sequential per voyage
// ----------------------------------------------------------------------------

async function generateBookingNumber(
  officeCode: string,
  serviceShortCode: string,
  voyageNumber: string,
  voyageId: string
): Promise<string> {
  const count = await BookingModel.countDocuments({ voyageId });
  const seq = String(count + 1).padStart(3, '0');
  return `${officeCode}${serviceShortCode}${voyageNumber}${seq}`;
}

// ----------------------------------------------------------------------------
// PLANNER RECIPIENT LOOKUP
// Returns all SHIPPING_PLANNER users assigned to offices that serve the given
// serviceCode. Falls back to every confirmed SHIPPING_PLANNER if none found.
// ----------------------------------------------------------------------------

async function lookupPlannerRecipients(
  serviceCode: string
): Promise<{ name: string; email: string }[]> {
  const offices = await OfficeModel.find({ services: serviceCode, active: true })
    .select('_id').lean();
  const officeIds = (offices as any[]).map((o: any) => o._id);
  let planners: any[] = [];
  if (officeIds.length > 0) {
    planners = await UserModel.find({
      role: 'SHIPPING_PLANNER',
      offices: { $in: officeIds },
      emailConfirmed: true,
    }).select('name email').lean();
  }
  if (planners.length === 0) {
    planners = await UserModel.find({
      role: 'SHIPPING_PLANNER',
      emailConfirmed: true,
    }).select('name email').lean();
  }
  return (planners as any[]).map((p: any) => ({ name: p.name, email: p.email }));
}

// ----------------------------------------------------------------------------
// CREATE BOOKING FROM CONTRACT
// Primary creation path — looks up contract to auto-fill fields
// ----------------------------------------------------------------------------

export async function createBookingFromContract(data: unknown) {
  try {
    const validated = CreateBookingFromContractSchema.parse(data);
    const session = await auth();
    await connectDB();

    // Look up contract
    const contract = await ContractModel.findById(validated.contractId).lean();
    if (!contract) {
      return { success: false, error: 'Contract not found' };
    }
    if (!contract.active) {
      return { success: false, error: 'Contract is not active' };
    }

    // Validate cargoType matches contract if contract has a fixed cargoType
    if (contract.cargoType && validated.cargoType !== contract.cargoType) {
      return { success: false, error: `Cargo type must be ${contract.cargoType} for this contract` };
    }

    // Prevent duplicate active bookings for same contract + voyage + shipper
    const shipperOrQuery: any[] = [{ 'shipper.code': validated.shipperCode }];
    if (validated.shipperId) shipperOrQuery.push({ shipperId: validated.shipperId });
    const existingBooking = await BookingModel.findOne({
      contractId: validated.contractId,
      voyageId: validated.voyageId,
      $or: shipperOrQuery,
      status: { $nin: ['CANCELLED', 'REJECTED'] },
    }).lean();
    if (existingBooking) {
      return {
        success: false,
        error: `A booking already exists for shipper "${existingBooking.shipper.name || validated.shipperCode}" on this contract and voyage. To change quantities, edit the existing booking.`,
      };
    }

    // Look up voyage
    const voyage = await VoyageModel.findById(validated.voyageId).lean();
    if (!voyage) {
      return { success: false, error: 'Voyage not found' };
    }

    // Resolve vessel name — voyage.vesselName may be empty for older documents
    const vesselDoc = await VesselModel.findById((voyage as any).vesselId).select('name').lean();
    const resolvedVesselName = (voyage as any).vesselName || (vesselDoc as any)?.name || '';

    // Validate POL port call status
    const polPortCode = (contract.originPort as any)?.portCode;
    const creatorRole = (session?.user as any)?.role;
    if (polPortCode) {
      const polPortCall = (voyage.portCalls as any[])?.find(
        (pc: any) => pc.portCode === polPortCode
      );

      if (polPortCall) {
        const now = new Date();
        const eta  = polPortCall.eta  ? new Date(polPortCall.eta)  : null;
        const ata  = polPortCall.ata  ? new Date(polPortCall.ata)  : null;
        const atd  = polPortCall.atd  ? new Date(polPortCall.atd)  : null;

        // Rule 1: ATD set → vessel departed → ALL roles blocked
        if (atd) {
          return {
            success: false,
            error: 'The vessel has already departed this loading port. No further bookings are allowed.',
          };
        }

        // Rule 2: ETA is in the past
        if (eta) {
          const etaDay = new Date(eta); etaDay.setHours(0, 0, 0, 0);
          const today  = new Date(now); today.setHours(0, 0, 0, 0);

          if (etaDay <= today) {
            if (creatorRole === 'EXPORTER') {
              return {
                success: false,
                error: ata
                  ? 'The vessel is currently in port operations. Please contact your shipping coordinator to request space on this sailing.'
                  : 'The estimated arrival date has passed. Please contact your shipping coordinator for the updated schedule.',
              };
            } else {
              // ADMIN / SHIPPING_PLANNER: require ATA to be recorded
              if (!ata) {
                return {
                  success: false,
                  error: `The estimated arrival date for ${polPortCode} has passed but no actual arrival time has been recorded. Please update the actual arrival time (ATA) for this port call before creating bookings.`,
                };
              }
              // ATA recorded → vessel in operations → planner/admin can proceed
            }
          }
        }
      }
    }

    // Look up service for shortCode
    const service = await ServiceModel.findById(contract.serviceId).lean();
    if (!service || !service.shortCode) {
      return { success: false, error: 'Service not found or missing shortCode' };
    }

    // Resolve shipper from contract counterparties or client
    let shipperName: string;
    let shipperCode: string;
    let resolvedShipperId: string | undefined = validated.shipperId;

    if (contract.counterparties && (contract.counterparties as any[]).length > 0) {
      // New system: shipper must be in active counterparties[]
      const activeCounterparties = (contract.counterparties as any[]).filter((cp) => cp.active !== false);
      if (activeCounterparties.length === 0) {
        return {
          success: false,
          error: 'No shippers assigned to this contract. Add shippers in contract settings first.',
        };
      }
      const cpMatch = activeCounterparties.find((cp: any) => cp.shipperCode === validated.shipperCode);
      if (!cpMatch) {
        return {
          success: false,
          error: `Shipper ${validated.shipperCode} is not authorized for this contract`,
        };
      }
      shipperName = cpMatch.shipperName;
      shipperCode = cpMatch.shipperCode;
      resolvedShipperId = resolvedShipperId ?? cpMatch.shipperId?.toString();
    } else if (contract.client.type === 'SHIPPER') {
      // Legacy: client is the shipper
      shipperName = contract.client.name;
      shipperCode = validated.shipperCode;
    } else {
      // Legacy: look up from shippers array
      const shipper = (contract.shippers as any[])?.find((s: any) => s.code === validated.shipperCode);
      if (!shipper) {
        return { success: false, error: `Shipper with code ${validated.shipperCode} not found in contract` };
      }
      shipperName = shipper.name;
      shipperCode = shipper.code;
    }

    // Resolve consignee from contract counterparties or client
    let consigneeName: string;
    let consigneeCode: string;
    if (contract.client.type === 'CONSIGNEE') {
      // Client is the consignee — use client info
      consigneeName = contract.client.name;
      consigneeCode = validated.consigneeCode;
    } else {
      // Client is shipper — look up consignee from consignees array
      const consignee = contract.consignees?.find((c: any) => c.code === validated.consigneeCode);
      if (!consignee) {
        return { success: false, error: `Consignee with code ${validated.consigneeCode} not found in contract` };
      }
      consigneeName = consignee.name;
      consigneeCode = consignee.code;
    }

    // Generate booking number
    const bookingNumber = await generateBookingNumber(
      contract.officeCode,
      service.shortCode,
      voyage.voyageNumber,
      validated.voyageId
    );

    const totalEstimatedWeight = validated.estimatedWeightPerUnit
      ? 0  // will be updated when confirmed; starts at 0
      : undefined;

    const booking = await BookingModel.create({
      bookingNumber,
      contractId: validated.contractId,
      voyageId: validated.voyageId,
      voyageNumber: voyage.voyageNumber,
      vesselName: resolvedVesselName,
      officeCode: contract.officeCode,
      serviceCode: contract.serviceCode,
      client: {
        name: contract.client.name,
        clientNumber: contract.client.clientNumber,
        contact: contract.client.contact,
        email: contract.client.email,
      },
      shipper: { name: shipperName, code: shipperCode },
      consignee: { name: consigneeName, code: consigneeCode },
      cargoType: validated.cargoType,
      requestedQuantity: validated.requestedQuantity,
      confirmedQuantity: 0,
      requestedTemperature: validated.requestedTemperature,
      pol: contract.originPort,
      pod: contract.destinationPort,
      estimateSource: validated.estimateSource,
      // New fields
      shipperId: resolvedShipperId,
      cargoMode: validated.cargoMode,
      weekNumber: validated.weekNumber ?? voyage.weekNumber,
      estimatedWeightPerUnit: validated.estimatedWeightPerUnit,
      totalEstimatedWeight,
      containerType: validated.containerType,
      shipperEmailDate: validated.shipperEmailDate,
      shipperEmailNotes: validated.shipperEmailNotes,
      status: 'PENDING',
      requestedDate: new Date(),
    });

    // Silently replace any active forecasts for this contract+voyage+shipper
    try {
      const forecastFilter = {
        contractId: validated.contractId,
        voyageId: validated.voyageId,
        planImpact: { $nin: ['SUPERSEDED', 'REPLACED_BY_BOOKING'] },
      } as any;
      // match by shipperId if available, fallback to shipperCode
      if (validated.shipperId) {
        forecastFilter.shipperId = validated.shipperId;
      } else if (validated.shipperCode) {
        forecastFilter.shipperCode = validated.shipperCode;
      }

      const affectedForecasts = await SpaceForecastModel.find(forecastFilter).select('_id').lean();

      if (affectedForecasts.length > 0) {
        const affectedIds = (affectedForecasts as any[]).map((f: any) => f._id.toString());

        // Mark forecasts as replaced
        await SpaceForecastModel.updateMany(
          { _id: { $in: affectedIds } },
          { $set: { planImpact: 'REPLACED_BY_BOOKING' } }
        );

        // For each affected forecast: remove from pendingForecastUpdates, add to pendingBookingReplacements
        // on any StowagePlan that references them
        await StowagePlanModel.updateMany(
          { voyageId: validated.voyageId, pendingForecastUpdates: { $in: affectedIds } },
          {
            $pull: { pendingForecastUpdates: { $in: affectedIds } },
            $addToSet: { pendingBookingReplacements: { $each: affectedIds } },
          }
        );
      }
    } catch (err) {
      // fire-and-forget — do not fail booking creation if forecast update fails
      console.warn('SpaceForecast replacement update failed:', err);
    }

    // Fire-and-forget booking created emails
    const emailData = {
      bookingId: booking._id.toString(),
      bookingNumber,
      voyageNumber: voyage.voyageNumber,
      vesselName: resolvedVesselName,
      serviceCode: contract.serviceCode,
      polPortName: (contract.originPort as any)?.portName ?? (contract.originPort as any)?.portCode ?? '',
      podPortName: (contract.destinationPort as any)?.portName ?? (contract.destinationPort as any)?.portCode ?? '',
      cargoType: validated.cargoType,
      requestedQuantity: validated.requestedQuantity,
      shipperName,
    };

    if (creatorRole === 'EXPORTER') {
      // Shipper submitted their own booking — confirm receipt to them directly.
      const creatorEmail = session!.user!.email;
      if (creatorEmail) {
        sendBookingReceivedToShipper(
          { name: session!.user!.name ?? undefined, email: creatorEmail },
          emailData
        ).catch(err => console.error('[email] sendBookingReceivedToShipper failed:', err.message));
      }

      // Notify planners — shipper-initiated bookings require planner review.
      lookupPlannerRecipients(contract.serviceCode)
        .then(recipients => sendBookingReceivedToPlanners(recipients, emailData))
        .catch(err => console.error('[email] sendBookingReceivedToPlanners failed:', err.message));

    } else {
      // Planner or Admin created the booking on behalf of the shipper.
      // Do NOT notify planners (they created it — they already know).
      // Find the shipper's user account and send a "created on your behalf" email.
      if (booking.shipperId) {
        UserModel.findOne({ shipperId: booking.shipperId }).select('name email').lean()
          .then(shipperUser => {
            if (shipperUser) {
              const plannerName = session?.user?.name ?? session?.user?.email ?? 'A shipping planner';
              return sendBookingCreatedOnBehalf(
                { name: (shipperUser as any).name, email: (shipperUser as any).email },
                emailData,
                plannerName
              );
            }
            console.warn('[email] no shipper user account found for booking', bookingNumber, '— shipperId:', booking.shipperId);
          })
          .catch(err => console.error('[email] sendBookingCreatedOnBehalf failed:', err.message));
      } else {
        console.warn('[email] booking', bookingNumber, 'has no shipperId — skipping shipper notification');
      }
    }

    return {
      success: true,
      data: JSON.parse(JSON.stringify(booking)),
      message: `Booking ${bookingNumber} created successfully`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    console.error('Error creating booking:', error);
    return { success: false, error: 'Failed to create booking' };
  }
}

// ----------------------------------------------------------------------------
// APPROVE BOOKING (Full or Partial)
// ----------------------------------------------------------------------------

export async function approveBooking(data: unknown) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role;
    if (role !== 'ADMIN' && role !== 'SHIPPING_PLANNER') return { success: false, error: 'Forbidden' };

    const validated = ApproveBookingSchema.parse(data);
    await connectDB();

    const booking = await BookingModel.findById(validated.bookingId);
    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }
    if (booking.status !== 'PENDING' && booking.status !== 'PARTIAL') {
      return { success: false, error: 'Booking must be in PENDING or PARTIAL status to approve' };
    }

    const requested = booking.requestedQuantity;
    const confirmed = validated.confirmedQuantity;
    const standby   = validated.standbyQuantity;
    const rejected  = validated.rejectedQuantity;

    if (confirmed + standby + rejected !== requested) {
      return {
        success: false,
        error: `Quantities must sum to ${requested} (requested). Got ${confirmed + standby + rejected}.`,
      };
    }

    let status: BookingStatus;
    if (confirmed === requested) {
      status = 'CONFIRMED';
    } else if (confirmed > 0) {
      status = 'PARTIAL';
    } else if (standby > 0) {
      status = 'STANDBY';
    } else {
      status = 'REJECTED';
    }

    booking.confirmedQuantity = confirmed;
    booking.standbyQuantity   = standby;
    booking.rejectedQuantity  = rejected;
    booking.status = status;
    booking.confirmedDate = new Date();
    booking.approvedBy = session.user.name ?? (session.user as any).email ?? 'system';
    await booking.save();

    let resolvedVesselName = booking.vesselName ?? '';
    if (!resolvedVesselName && booking.voyageId) {
      const voy = await VoyageModel.findById(booking.voyageId).select('vesselName vesselId').lean();
      resolvedVesselName = (voy as any)?.vesselName ?? '';
      if (!resolvedVesselName && (voy as any)?.vesselId) {
        const ves = await VesselModel.findById((voy as any).vesselId).select('name').lean();
        resolvedVesselName = (ves as any)?.name ?? '';
      }
    }

    const shipperUserForApprove = await UserModel.findOne({
      shipperId: booking.shipperId,
    }).select('email').lean() as any;
    const recipientEmailForApprove: string | null = shipperUserForApprove?.email ?? null;
    console.log('[email] attempting to send booking status email to:', recipientEmailForApprove);
    if (recipientEmailForApprove) {
      sendBookingStatusChanged(
        { email: recipientEmailForApprove },
        {
          bookingId: booking._id.toString(),
          bookingNumber: booking.bookingNumber,
          voyageNumber: booking.voyageNumber ?? '',
          vesselName: resolvedVesselName,
          serviceCode: booking.serviceCode ?? '',
          polPortName: (booking.pol as any)?.portName ?? (booking.pol as any)?.portCode ?? '',
          podPortName: (booking.pod as any)?.portName ?? (booking.pod as any)?.portCode ?? '',
          cargoType: booking.cargoType,
          requestedQuantity: requested,
          confirmedQuantity: confirmed,
          standbyQuantity: standby,
          rejectedQuantity: rejected,
          newStatus: status,
        }
      ).catch(err => console.error('[email] sendBookingStatusChanged failed:', err.message));
    } else {
      console.warn('[email] no shipper user found for booking', booking.bookingNumber, '— shipperId:', booking.shipperId);
    }

    const parts: string[] = [];
    if (confirmed > 0) parts.push(`${confirmed} confirmed`);
    if (standby > 0)   parts.push(`${standby} on standby`);
    if (rejected > 0)  parts.push(`${rejected} rejected`);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(booking)),
      message: `${requested} pallets processed: ${parts.join(', ')}.`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    console.error('Error approving booking:', error);
    return { success: false, error: 'Failed to approve booking' };
  }
}

// ----------------------------------------------------------------------------
// RESOLVE STANDBY — move standby pallets to confirmed or rejected
// ----------------------------------------------------------------------------

export async function resolveStandby(data: unknown) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role;
    if (role !== 'ADMIN' && role !== 'SHIPPING_PLANNER') return { success: false, error: 'Forbidden' };

    const validated = ResolveStandbySchema.parse(data);
    await connectDB();

    const booking = await BookingModel.findById(validated.bookingId);
    if (!booking) return { success: false, error: 'Booking not found' };

    if (!['STANDBY', 'PARTIAL'].includes(booking.status)) {
      return { success: false, error: 'Booking must be in STANDBY or PARTIAL status' };
    }
    const currentStandby = booking.standbyQuantity ?? 0;
    if (currentStandby <= 0) {
      return { success: false, error: 'No standby quantity to resolve' };
    }

    const qty = validated.quantity ?? currentStandby;
    if (qty > currentStandby) {
      return { success: false, error: `Cannot resolve ${qty} — only ${currentStandby} on standby` };
    }

    const changedBy = session.user.name ?? (session.user as any).email ?? 'system';
    const now = new Date();

    if (validated.action === 'CONFIRM') {
      booking.confirmedQuantity = (booking.confirmedQuantity ?? 0) + qty;
      booking.standbyQuantity   = currentStandby - qty;
      booking.status = booking.standbyQuantity === 0 && (booking.rejectedQuantity ?? 0) === 0
        ? 'CONFIRMED'
        : 'PARTIAL';
    } else {
      booking.rejectedQuantity = (booking.rejectedQuantity ?? 0) + qty;
      booking.standbyQuantity  = currentStandby - qty;
      booking.status = (booking.confirmedQuantity ?? 0) === 0 && booking.standbyQuantity === 0
        ? 'REJECTED'
        : 'PARTIAL';
    }

    if (!(booking as any).changelog) (booking as any).changelog = [];
    (booking as any).changelog.push({
      changedAt: now,
      changedBy,
      field: 'standbyQuantity',
      fromValue: String(qty),
      toValue: validated.action === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED',
    });

    await booking.save();

    let resolvedVesselName = booking.vesselName ?? '';
    if (!resolvedVesselName && booking.voyageId) {
      const voy = await VoyageModel.findById(booking.voyageId).select('vesselName vesselId').lean();
      resolvedVesselName = (voy as any)?.vesselName ?? '';
      if (!resolvedVesselName && (voy as any)?.vesselId) {
        const ves = await VesselModel.findById((voy as any).vesselId).select('name').lean();
        resolvedVesselName = (ves as any)?.name ?? '';
      }
    }

    const shipperUser = await UserModel.findOne({ shipperId: booking.shipperId }).select('email').lean() as any;
    if (shipperUser?.email) {
      sendStandbyResolved(
        { email: shipperUser.email },
        {
          bookingId: booking._id.toString(),
          bookingNumber: booking.bookingNumber,
          voyageNumber: booking.voyageNumber ?? '',
          vesselName: resolvedVesselName,
          serviceCode: booking.serviceCode ?? '',
          polPortName: (booking.pol as any)?.portName ?? (booking.pol as any)?.portCode ?? '',
          podPortName: (booking.pod as any)?.portName ?? (booking.pod as any)?.portCode ?? '',
          cargoType: booking.cargoType,
          action: validated.action,
          resolvedQuantity: qty,
          confirmedQuantity: booking.confirmedQuantity ?? 0,
          standbyQuantity: booking.standbyQuantity ?? 0,
          rejectedQuantity: booking.rejectedQuantity ?? 0,
        }
      ).catch(err => console.error('[email] resolveStandby email failed:', err.message));
    } else {
      console.warn('[email] no shipper user found for booking', booking.bookingNumber, '— skipping standby resolve email');
    }

    return { success: true, data: JSON.parse(JSON.stringify(booking)) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    console.error('Error resolving standby:', error);
    return { success: false, error: 'Failed to resolve standby' };
  }
}

// ----------------------------------------------------------------------------
// REJECT BOOKING
// ----------------------------------------------------------------------------

export async function rejectBooking(data: unknown) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role;
    if (role !== 'ADMIN' && role !== 'SHIPPING_PLANNER') return { success: false, error: 'Forbidden' };

    const validated = RejectBookingSchema.parse(data);
    await connectDB();

    const booking = await BookingModel.findById(validated.bookingId);
    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }

    booking.status = 'REJECTED';
    booking.rejectionReason = validated.rejectionReason.trim();
    booking.confirmedDate = new Date();
    booking.approvedBy = session.user.name ?? (session.user as any).email ?? 'system';
    await booking.save();

    let resolvedVesselName = booking.vesselName ?? '';
    if (!resolvedVesselName && booking.voyageId) {
      const voy = await VoyageModel.findById(booking.voyageId).select('vesselName vesselId').lean();
      resolvedVesselName = (voy as any)?.vesselName ?? '';
      if (!resolvedVesselName && (voy as any)?.vesselId) {
        const ves = await VesselModel.findById((voy as any).vesselId).select('name').lean();
        resolvedVesselName = (ves as any)?.name ?? '';
      }
    }

    const shipperUserForReject = await UserModel.findOne({
      shipperId: booking.shipperId,
    }).select('email').lean() as any;
    const recipientEmailForReject: string | null = shipperUserForReject?.email ?? null;
    console.log('[email] attempting to send booking status email to:', recipientEmailForReject);
    if (recipientEmailForReject) {
      sendBookingStatusChanged(
        { email: recipientEmailForReject },
        {
          bookingId: booking._id.toString(),
          bookingNumber: booking.bookingNumber,
          voyageNumber: booking.voyageNumber ?? '',
          vesselName: resolvedVesselName,
          serviceCode: booking.serviceCode ?? '',
          polPortName: (booking.pol as any)?.portName ?? (booking.pol as any)?.portCode ?? '',
          podPortName: (booking.pod as any)?.portName ?? (booking.pod as any)?.portCode ?? '',
          cargoType: booking.cargoType,
          requestedQuantity: booking.requestedQuantity,
          newStatus: 'REJECTED',
          rejectionReason: validated.rejectionReason,
        }
      ).catch(err => console.error('[email] sendBookingStatusChanged failed:', err.message));
    } else {
      console.warn('[email] no shipper user found for booking', booking.bookingNumber, '— shipperId:', booking.shipperId);
    }

    return {
      success: true,
      data: JSON.parse(JSON.stringify(booking)),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    console.error('Error rejecting booking:', error);
    return { success: false, error: 'Failed to reject booking' };
  }
}

// ----------------------------------------------------------------------------
// CANCEL BOOKING
// ----------------------------------------------------------------------------

export async function cancelBooking(data: unknown) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role;
    if (role !== 'ADMIN' && role !== 'SHIPPING_PLANNER') return { success: false, error: 'Forbidden' };

    const validated = CancelBookingSchema.parse(data);
    await connectDB();

    const booking = await BookingModel.findById(validated.bookingId);
    if (!booking) return { success: false, error: 'Booking not found' };
    if (booking.status === 'CANCELLED') return { success: false, error: 'Booking is already cancelled' };

    booking.status = 'CANCELLED';
    if (validated.reason) booking.rejectionReason = validated.reason;
    booking.approvedBy = session.user.name ?? (session.user as any).email ?? 'system';
    await booking.save();

    let resolvedVesselName = booking.vesselName ?? '';
    if (!resolvedVesselName && booking.voyageId) {
      const voy = await VoyageModel.findById(booking.voyageId).select('vesselName vesselId').lean();
      resolvedVesselName = (voy as any)?.vesselName ?? '';
      if (!resolvedVesselName && (voy as any)?.vesselId) {
        const ves = await VesselModel.findById((voy as any).vesselId).select('name').lean();
        resolvedVesselName = (ves as any)?.name ?? '';
      }
    }

    // Notify the other party
    if (role === 'EXPORTER') {
      const plannerRecipients = await lookupPlannerRecipients(booking.serviceCode ?? '');
      sendBookingCancelledToPlanners(plannerRecipients, {
        bookingNumber: booking.bookingNumber,
        voyageNumber: booking.voyageNumber ?? '',
        vesselName: resolvedVesselName,
        shipperName: booking.shipper?.name ?? '',
        cancelledBy: (session.user as any).email ?? '',
      }).catch(err => console.error('[email] cancelBooking planner notify failed:', err.message));
    } else {
      const shipperUserForCancel = await UserModel.findOne({
        shipperId: booking.shipperId,
      }).select('email').lean() as any;
      if (shipperUserForCancel?.email) {
        sendBookingCancelledToShipper(shipperUserForCancel.email, {
          bookingNumber: booking.bookingNumber,
          voyageNumber: booking.voyageNumber ?? '',
          vesselName: resolvedVesselName,
          cancelledBy: session.user.name ?? (session.user as any).email ?? 'system',
        }).catch(err => console.error('[email] cancelBooking shipper notify failed:', err.message));
      } else {
        console.warn('[email] no shipper user found for cancelled booking', booking.bookingNumber);
      }
    }

    return { success: true, data: JSON.parse(JSON.stringify(booking)) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    console.error('Error cancelling booking:', error);
    return { success: false, error: 'Failed to cancel booking' };
  }
}

// ----------------------------------------------------------------------------
// UPDATE BOOKING QUANTITY / NOTES / STATUS
// EXPORTER: own bookings only, status limited to CANCELLED
// ADMIN/SHIPPING_PLANNER: any booking, any valid status
// ----------------------------------------------------------------------------

export async function updateBookingQuantity(data: unknown) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role;
    const isPlanner = role === 'ADMIN' || role === 'SHIPPING_PLANNER';
    const isExporter = role === 'EXPORTER';
    if (!isPlanner && !isExporter) return { success: false, error: 'Forbidden' };

    const validated = UpdateBookingQuantitySchema.parse(data);
    await connectDB();

    const booking = await BookingModel.findById(validated.bookingId);
    if (!booking) return { success: false, error: 'Booking not found' };

    // Validate POL port call status before allowing edits
    const polPortCode = (booking.pol as any)?.portCode;
    if (polPortCode && booking.voyageId) {
      const voyage = await VoyageModel.findById(booking.voyageId)
        .select('portCalls')
        .lean();
      const polPortCall = (voyage?.portCalls as any[])?.find(
        (pc: any) => pc.portCode === polPortCode
      );

      if (polPortCall) {
        const now = new Date();
        const eta  = polPortCall.eta  ? new Date(polPortCall.eta)  : null;
        const ata  = polPortCall.ata  ? new Date(polPortCall.ata)  : null;
        const atd  = polPortCall.atd  ? new Date(polPortCall.atd)  : null;

        // ATD set → vessel departed → ALL roles blocked
        if (atd) {
          return {
            success: false,
            error: 'The vessel has already departed this loading port. No further changes are allowed.',
          };
        }

        // ETA passed: EXPORTER blocked; planner requires ATA to be recorded
        if (eta) {
          const etaDay = new Date(eta); etaDay.setHours(0, 0, 0, 0);
          const today  = new Date(now); today.setHours(0, 0, 0, 0);
          if (etaDay <= today) {
            if (isExporter) {
              return {
                success: false,
                error: ata
                  ? 'The vessel is currently in port operations. Please contact your shipping coordinator.'
                  : 'The estimated arrival date has passed. Please contact your shipping coordinator for the updated schedule.',
              };
            } else if (!ata) {
              return {
                success: false,
                error: `The ETA for ${polPortCode} has passed but no ATA has been recorded. Please update the ATA before modifying bookings.`,
              };
            }
          }
        }
      }
    }

    const previousQuantity = booking.requestedQuantity;
    const newQuantity = validated.requestedQuantity;
    let requiresReapproval = false;

    if (isExporter) {
      // Ownership check
      const shipperCode = (session.user as any).shipperCode;
      const shipperId   = (session.user as any).shipperId;
      const owns =
        (shipperId && booking.shipperId?.toString() === shipperId) ||
        (shipperCode && booking.shipper?.code === shipperCode);
      if (!owns) return { success: false, error: 'Forbidden' };

      // Exporters can only edit PENDING or CONFIRMED bookings
      if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') {
        return { success: false, error: 'Booking cannot be edited in its current status' };
      }
      // Exporters can only cancel, not change to other statuses
      if (validated.status && validated.status !== 'CANCELLED') {
        return { success: false, error: 'Forbidden: you can only cancel bookings' };
      }

      booking.requestedQuantity = newQuantity;
      if (validated.notes !== undefined) booking.notes = validated.notes;

      if (validated.status === 'CANCELLED') {
        booking.status = 'CANCELLED';
        booking.approvedBy = (session.user as any).name ?? (session.user as any).email ?? 'system';
      } else if (newQuantity > previousQuantity) {
        // Increase requires re-approval: reset to PENDING and clear all allocation
        booking.status = 'PENDING';
        booking.confirmedQuantity = 0;
        booking.standbyQuantity = 0;
        booking.rejectedQuantity = 0;
        requiresReapproval = true;
      }
      // Decrease: keep current status unchanged
    } else {
      // Planner / Admin
      booking.requestedQuantity = newQuantity;
      if (validated.confirmedQuantity !== undefined) booking.confirmedQuantity = validated.confirmedQuantity;
      if (validated.notes !== undefined) booking.notes = validated.notes;
      if (validated.status) {
        booking.status = validated.status;
        if (validated.status === 'CANCELLED') {
          booking.approvedBy = (session.user as any).name ?? (session.user as any).email ?? 'system';
        }
      }
    }

    if (!(booking as any).changelog) (booking as any).changelog = [];
    (booking as any).changelog.push({
      changedAt: new Date(),
      changedBy: session.user.name ?? (session.user as any).email ?? 'system',
      field: 'requestedQuantity',
      fromValue: String(previousQuantity),
      toValue: String(newQuantity),
    });

    await booking.save();

    let resolvedVesselName = booking.vesselName ?? '';
    if (!resolvedVesselName && booking.voyageId) {
      const voy = await VoyageModel.findById(booking.voyageId).select('vesselName vesselId').lean();
      resolvedVesselName = (voy as any)?.vesselName ?? '';
      if (!resolvedVesselName && (voy as any)?.vesselId) {
        const ves = await VesselModel.findById((voy as any).vesselId).select('name').lean();
        resolvedVesselName = (ves as any)?.name ?? '';
      }
    }

    // Notify the other party
    if (isExporter) {
      const plannerRecipients = await lookupPlannerRecipients(booking.serviceCode ?? '');
      sendBookingModifiedToPlanners(plannerRecipients, {
        bookingNumber: booking.bookingNumber,
        voyageNumber: booking.voyageNumber ?? '',
        vesselName: resolvedVesselName,
        shipperName: booking.shipper?.name ?? '',
        newQuantity,
        modifiedBy: (session.user as any).email ?? '',
        requiresReapproval,
      }).catch(err => console.error('[email] updateBookingQuantity planner notify failed:', err.message));
    } else {
      const shipperUserForModify = await UserModel.findOne({
        shipperId: booking.shipperId,
      }).select('email').lean() as any;
      if (shipperUserForModify?.email) {
        sendBookingModifiedToShipper(shipperUserForModify.email, {
          bookingId: booking._id.toString(),
          bookingNumber: booking.bookingNumber,
          voyageNumber: booking.voyageNumber ?? '',
          vesselName: resolvedVesselName,
          newQuantity,
          previousQuantity,
          modifiedBy: session.user.name ?? (session.user as any).email ?? 'system',
        }).catch(err => console.error('[email] updateBookingQuantity shipper notify failed:', err.message));
      } else {
        console.warn('[email] no shipper user found for modified booking', booking.bookingNumber);
      }
    }

    return { success: true, data: JSON.parse(JSON.stringify(booking)) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    console.error('Error updating booking quantity:', error);
    return { success: false, error: 'Failed to update booking' };
  }
}

// ----------------------------------------------------------------------------
// GET ALL BOOKINGS (admin — auth guarded)
// ----------------------------------------------------------------------------

export async function getAdminBookings(includeArchived = false) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, data: [], error: 'Unauthorized' };
    const role = (session.user as any).role;
    if (role !== 'ADMIN' && role !== 'SHIPPING_PLANNER') return { success: false, data: [], error: 'Forbidden' };

    await connectDB();

    let voyageIdFilter: any = {};
    if (!includeArchived) {
      const inactiveVoyages = await VoyageModel.find({
        status: { $in: ['COMPLETED', 'CLOSED', 'CANCELLED'] }
      }).select('_id').lean();
      const inactiveVoyageIds = (inactiveVoyages as any[]).map((v: any) => v._id);
      voyageIdFilter = inactiveVoyageIds.length > 0
        ? { voyageId: { $nin: inactiveVoyageIds } }
        : {};
    }

    const statusFilter = includeArchived ? {} : {
      status: { $nin: ['CANCELLED', 'REJECTED'] }
    };

    const bookings = await BookingModel.find({ ...statusFilter, ...voyageIdFilter })
      .populate('voyageId', 'departureDate weekNumber')
      .lean();

    (bookings as any[]).sort((a: any, b: any) => {
      const da = new Date(a.voyageId?.departureDate ?? 0).getTime();
      const db = new Date(b.voyageId?.departureDate ?? 0).getTime();
      if (da !== db) return da - db;
      return (a.bookingNumber ?? '').localeCompare(b.bookingNumber ?? '');
    });

    return { success: true, data: JSON.parse(JSON.stringify(bookings)) };
  } catch (error) {
    console.error('Error fetching admin bookings:', error);
    return { success: false, data: [], error: 'Failed to fetch bookings' };
  }
}

// ----------------------------------------------------------------------------
// GET ALL BOOKINGS
// ----------------------------------------------------------------------------

export async function getBookings(includeArchived = false) {
  try {
    await connectDB();

    const session = await auth();
    const serviceFilter = (session?.user as any)?.serviceFilter ?? [];

    let voyageIdFilter: any = {};
    if (!includeArchived) {
      const inactiveVoyages = await VoyageModel.find({
        status: { $in: ['COMPLETED', 'CLOSED', 'CANCELLED'] }
      }).select('_id').lean();
      const inactiveVoyageIds = (inactiveVoyages as any[]).map((v: any) => v._id);
      voyageIdFilter = inactiveVoyageIds.length > 0
        ? { voyageId: { $nin: inactiveVoyageIds } }
        : {};
    }

    const statusFilter = includeArchived ? {} : {
      status: { $nin: ['CANCELLED', 'REJECTED'] }
    };

    const bookings = await BookingModel.find({
      ...buildServiceFilter(serviceFilter),
      ...statusFilter,
      ...voyageIdFilter,
    })
      .populate('voyageId')
      .lean();

    (bookings as any[]).sort((a: any, b: any) => {
      const da = new Date(a.voyageId?.departureDate ?? 0).getTime();
      const db = new Date(b.voyageId?.departureDate ?? 0).getTime();
      if (da !== db) return da - db;
      return (a.bookingNumber ?? '').localeCompare(b.bookingNumber ?? '');
    });

    return {
      success: true,
      data: JSON.parse(JSON.stringify(bookings)),
    };
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return { success: false, error: 'Failed to fetch bookings', data: [] };
  }
}

// ----------------------------------------------------------------------------
// GET BOOKINGS BY VOYAGE
// ----------------------------------------------------------------------------

export async function getBookingsByVoyage(voyageId: unknown) {
  try {
    const id = z.string().parse(voyageId);
    await connectDB();

    const bookings = await BookingModel.find({ voyageId: id })
      .sort({ requestedDate: -1 })
      .lean();

    return { success: true, data: JSON.parse(JSON.stringify(bookings)) };
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return { success: false, error: 'Failed to fetch bookings' };
  }
}

// ----------------------------------------------------------------------------
// GET PENDING BOOKINGS
// ----------------------------------------------------------------------------

export async function getPendingBookings() {
  try {
    await connectDB();

    const bookings = await BookingModel.find({ status: 'PENDING' })
      .sort({ requestedDate: 1 })
      .lean();

    return { success: true, data: JSON.parse(JSON.stringify(bookings)) };
  } catch (error) {
    console.error('Error fetching pending bookings:', error);
    return { success: false, error: 'Failed to fetch pending bookings' };
  }
}

// ----------------------------------------------------------------------------
// GET CONFIRMED BOOKINGS FOR VOYAGE (for stowage planning)
// ----------------------------------------------------------------------------

export async function getConfirmedBookingsForVoyage(voyageId: unknown) {
  try {
    const id = z.string().parse(voyageId);
    await connectDB();

    const bookings = await BookingModel.find({
      voyageId: id,
      status: { $in: ['CONFIRMED', 'PARTIAL'] },
    })
      .sort({ 'pol.portCode': 1 })
      .lean();

    return { success: true, data: JSON.parse(JSON.stringify(bookings)) };
  } catch (error) {
    console.error('Error fetching confirmed bookings:', error);
    return { success: false, error: 'Failed to fetch confirmed bookings' };
  }
}

// ----------------------------------------------------------------------------
// UPDATE BOOKING
// ----------------------------------------------------------------------------

export async function updateBooking(bookingId: unknown, updates: Record<string, unknown>) {
  try {
    const id = BookingIdSchema.parse(bookingId);
    await connectDB();

    const booking = await BookingModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }

    return { success: true, data: JSON.parse(JSON.stringify(booking)) };
  } catch (error) {
    console.error('Error updating booking:', error);
    return { success: false, error: 'Failed to update booking' };
  }
}

// ----------------------------------------------------------------------------
// GET BOOKINGS BY SHIPPER CODE (for EXPORTER portal)
// Filters bookings where shipper.code matches the user's shipperCode
// ----------------------------------------------------------------------------

export async function getBookingsByShipperCode(code: string, shipperId?: string) {
  try {
    if (!code && !shipperId) return { success: false, data: [], error: 'Shipper code is required' };

    await connectDB();

    const query = shipperId
      ? { $or: [{ shipperId }, { 'shipper.code': code }] }
      : { 'shipper.code': code };

    const bookings = await BookingModel.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const data = (bookings as any[]).map((b: any) => ({
      _id: b._id.toString(),
      bookingNumber: b.bookingNumber,
      contractId: b.contractId?.toString() ?? null,
      voyageId: b.voyageId?.toString() ?? null,
      voyageNumber: b.voyageNumber ?? '',
      officeCode: b.officeCode ?? '',
      serviceCode: b.serviceCode ?? '',
      shipper: b.shipper ?? { name: '', code: '' },
      consignee: b.consignee ?? { name: '', code: '' },
      cargoType: b.cargoType ?? '',
      requestedQuantity: b.requestedQuantity ?? 0,
      confirmedQuantity: b.confirmedQuantity ?? 0,
      standbyQuantity: b.standbyQuantity ?? 0,
      requestedTemperature: b.requestedTemperature ?? null,
      pol: b.pol ?? null,
      pod: b.pod ?? null,
      status: b.status ?? 'PENDING',
      requestedDate: b.requestedDate ? b.requestedDate.toISOString() : null,
      confirmedDate: b.confirmedDate ? b.confirmedDate.toISOString() : null,
      createdAt: b.createdAt ? b.createdAt.toISOString() : null,
    }));

    return { success: true, data };
  } catch (error) {
    console.error('Error fetching bookings by shipper code:', error);
    return { success: false, data: [], error: 'Failed to fetch bookings' };
  }
}

// ----------------------------------------------------------------------------
// UPDATE BOOKING DESTINATION (in-transit divert)
// Allowed only when voyage is IN_PROGRESS.
// Updates pod.portCode, pod.portName, consignee.name and appends to changelog.
// ----------------------------------------------------------------------------

export async function updateBookingDestination(
  bookingId: string,
  updates: { podPortCode: string; podPortName: string; consigneeName: string }
) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    const role = (session.user as any).role as string;
    if (!['ADMIN', 'SHIPPING_PLANNER'].includes(role)) return { success: false, error: 'Forbidden' };

    const { podPortCode, podPortName, consigneeName } = updates;
    if (!podPortCode?.trim() || !podPortName?.trim() || !consigneeName?.trim()) {
      return { success: false, error: 'POD port code, port name and consignee name are required' };
    }

    await connectDB();

    const booking = await BookingModel.findById(bookingId);
    if (!booking) return { success: false, error: 'Booking not found' };

    // Only allowed while voyage is in progress
    const voyage = await VoyageModel.findById(booking.voyageId).select('status').lean();
    if (!voyage) return { success: false, error: 'Voyage not found' };
    if ((voyage as any).status !== 'IN_PROGRESS') {
      return { success: false, error: 'Destination can only be changed while the voyage is in progress' };
    }

    const changedBy = (session.user as any).name ?? (session.user as any).email ?? 'SYSTEM';
    const now = new Date();
    const entries: object[] = [];

    const oldPodCode = (booking.pod as any)?.portCode ?? '';
    const oldPodName = (booking.pod as any)?.portName ?? '';
    const oldConsignee = (booking.consignee as any)?.name ?? '';

    if (podPortCode !== oldPodCode || podPortName !== oldPodName) {
      entries.push({
        changedAt: now, changedBy,
        field: 'pod',
        fromValue: `${oldPodCode} — ${oldPodName}`,
        toValue:   `${podPortCode} — ${podPortName}`,
      });
      (booking.pod as any).portCode = podPortCode;
      (booking.pod as any).portName = podPortName;
    }

    if (consigneeName !== oldConsignee) {
      entries.push({
        changedAt: now, changedBy,
        field: 'consignee.name',
        fromValue: oldConsignee,
        toValue:   consigneeName,
      });
      (booking.consignee as any).name = consigneeName;
    }

    if (entries.length === 0) return { success: true }; // nothing changed

    if (!(booking as any).changelog) (booking as any).changelog = [];
    (booking as any).changelog.push(...entries);

    await booking.save();

    return { success: true };
  } catch (error) {
    console.error('Error updating booking destination:', error);
    return { success: false, error: 'Failed to update booking destination' };
  }
}

// ----------------------------------------------------------------------------
// GET BOOKING BY ID (for shipper detail view)
// ----------------------------------------------------------------------------

export async function getBookingById(bookingId: string) {
  try {
    await connectDB();

    const booking = await BookingModel.findById(bookingId).lean() as any;
    if (!booking) return { success: false, data: null, error: 'Booking not found' };

    return { success: true, data: JSON.parse(JSON.stringify(booking)) };
  } catch (error) {
    console.error('Error fetching booking:', error);
    return { success: false, data: null, error: 'Failed to fetch booking' };
  }
}
