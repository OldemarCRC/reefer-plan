// ============================================================================
// BOOKING SERVER ACTIONS
// Phase 9A — Redesigned with contract-based creation, per-voyage sequential
// booking numbers, and SHIPPER/CONSIGNEE model.
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { BookingModel, ContractModel, VoyageModel, ServiceModel } from '@/lib/db/schemas';
import type { BookingStatus } from '@/types/models';

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
  bookingId: z.string().min(1),
  confirmedQuantity: z.number().int().min(0),
  approvedBy: z.string().min(1),
});

const RejectBookingSchema = z.object({
  bookingId: z.string().min(1),
  rejectionReason: z.string().min(1).max(500),
  rejectedBy: z.string().min(1),
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
// CREATE BOOKING FROM CONTRACT
// Primary creation path — looks up contract to auto-fill fields
// ----------------------------------------------------------------------------

export async function createBookingFromContract(data: unknown) {
  try {
    const validated = CreateBookingFromContractSchema.parse(data);
    await connectDB();

    // Look up contract
    const contract = await ContractModel.findById(validated.contractId).lean();
    if (!contract) {
      return { success: false, error: 'Contract not found' };
    }
    if (!contract.active) {
      return { success: false, error: 'Contract is not active' };
    }

    // Look up voyage
    const voyage = await VoyageModel.findById(validated.voyageId).lean();
    if (!voyage) {
      return { success: false, error: 'Voyage not found' };
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

    // Try new counterparties[] first, then legacy shippers[], then client
    const cpMatch = contract.counterparties?.find((cp: any) => cp.shipperCode === validated.shipperCode);
    if (cpMatch) {
      shipperName = cpMatch.shipperName;
      shipperCode = cpMatch.shipperCode;
      resolvedShipperId = resolvedShipperId ?? cpMatch.shipperId?.toString();
    } else if (contract.client.type === 'SHIPPER') {
      shipperName = contract.client.name;
      shipperCode = validated.shipperCode;
    } else {
      // Legacy: look up from shippers array
      const shipper = contract.shippers?.find((s: any) => s.code === validated.shipperCode);
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
    const validated = ApproveBookingSchema.parse(data);
    await connectDB();

    const booking = await BookingModel.findById(validated.bookingId);
    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }
    if (booking.status !== 'PENDING') {
      return { success: false, error: 'Booking is not in PENDING status' };
    }

    const requested = booking.requestedQuantity;
    const confirmed = validated.confirmedQuantity;

    let status: BookingStatus;
    let standby = 0;

    if (confirmed === 0) {
      status = 'STANDBY';
      standby = requested;
    } else if (confirmed < requested) {
      status = 'PARTIAL';
      standby = requested - confirmed;
    } else {
      status = 'CONFIRMED';
    }

    booking.confirmedQuantity = confirmed;
    booking.standbyQuantity = standby;
    booking.status = status;
    booking.confirmedDate = new Date();
    booking.approvedBy = validated.approvedBy;
    await booking.save();

    return {
      success: true,
      data: JSON.parse(JSON.stringify(booking)),
      message: status === 'PARTIAL'
        ? `Partially confirmed: ${confirmed}/${requested} pallets. ${standby} on standby.`
        : status === 'STANDBY'
          ? `All ${requested} pallets placed on standby.`
          : `Fully confirmed: ${confirmed} pallets.`,
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
// REJECT BOOKING
// ----------------------------------------------------------------------------

export async function rejectBooking(data: unknown) {
  try {
    const validated = RejectBookingSchema.parse(data);
    await connectDB();

    const booking = await BookingModel.findById(validated.bookingId);
    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }

    booking.status = 'REJECTED';
    booking.rejectionReason = validated.rejectionReason;
    booking.confirmedDate = new Date();
    booking.approvedBy = validated.rejectedBy;
    await booking.save();

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
// GET ALL BOOKINGS
// ----------------------------------------------------------------------------

export async function getBookings() {
  try {
    await connectDB();

    const bookings = await BookingModel.find({})
      .populate('voyageId')
      .sort({ createdAt: -1 })
      .lean();

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

export async function getBookingsByShipperCode(code: string) {
  try {
    if (!code) return { success: false, data: [], error: 'Shipper code is required' };

    await connectDB();

    const bookings = await BookingModel.find({ 'shipper.code': code })
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
