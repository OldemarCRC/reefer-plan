// ============================================================================
// BOOKING SERVER ACTIONS
// Handles booking requests with partial confirmation support
// 
// CHANGE #3: Partial Booking Confirmation
// - requestedQuantity: What client requested
// - confirmedQuantity: What we confirmed
// - standbyQuantity: On waiting list
// - Status: CONFIRMED | PARTIAL | STANDBY | REJECTED
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { BookingModel } from '@/lib/db/schemas';
import type { Booking, BookingStatus } from '@/types/models';

// ----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

const BookingIdSchema = z.string().min(1, 'Booking ID is required');

const CargoTypeSchema = z.enum([
  'BANANAS',
  'FROZEN_FISH',
  'TABLE_GRAPES',
  'CITRUS',
  'AVOCADOS',
  'BERRIES',
  'OTHER_FROZEN',
  'OTHER_CHILLED',
]);

const PortSchema = z.object({
  code: z.string().min(4).max(6),
  name: z.string().min(1),
  country: z.string().min(1),
});

// IMPORTANT: Temperature NOT specified by client
// Temperature is a property of the vessel compartment
const CreateBookingSchema = z.object({
  voyageId: z.string().min(1, 'Voyage ID is required'),
  contractId: z.string().optional(), // Optional if no contract exists
  
  exporter: z.object({
    name: z.string().min(1).max(200),
    contact: z.string().min(1),
    email: z.string().email(),
  }),
  
  origin: PortSchema,
  destination: PortSchema,
  
  cargo: z.object({
    type: CargoTypeSchema,
    requestedQuantity: z.number().int().positive().max(10000),
    totalWeight: z.number().positive(), // kg
    // NO temperature here - it's vessel-defined
  }),
  
  requestedDate: z.date().optional().default(() => new Date()),
});

const ApproveBookingSchema = z.object({
  bookingId: z.string().min(1),
  confirmedQuantity: z.number().int().positive(),
  approvedBy: z.string().min(1), // User ID
  notes: z.string().optional(),
});

const RejectBookingSchema = z.object({
  bookingId: z.string().min(1),
  rejectionReason: z.string().min(1).max(500),
  rejectedBy: z.string().min(1), // User ID
});

// ----------------------------------------------------------------------------
// CREATE BOOKING
// Client requests space - always starts as PENDING
// ----------------------------------------------------------------------------

export async function createBooking(data: unknown) {
  try {
    // Validate input
    const validated = CreateBookingSchema.parse(data);
    
    await connectDB();
    
    // Generate booking number
    const count = await BookingModel.countDocuments();
    const bookingNumber = `BK-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    
    // Create booking with PENDING status
    const booking = await BookingModel.create({
      bookingNumber,
      voyageId: validated.voyageId,
      contractId: validated.contractId,
      exporter: validated.exporter,
      origin: validated.origin,
      destination: validated.destination,
      cargo: {
        type: validated.cargo.type,
        quantity: validated.cargo.requestedQuantity,
        totalWeight: validated.cargo.totalWeight,
        temperatureRange: {
          // Default ranges by cargo type - will be validated against vessel
          min: getDefaultMinTemp(validated.cargo.type),
          max: getDefaultMaxTemp(validated.cargo.type),
        },
        units: [], // Will be populated when confirmed
      },
      requestedQuantity: validated.cargo.requestedQuantity,
      confirmedQuantity: 0,
      standbyQuantity: 0,
      status: 'PENDING',
      requestedDate: validated.requestedDate,
    });
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(booking)),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors[0].message}`,
      };
    }
    console.error('Error creating booking:', error);
    return {
      success: false,
      error: 'Failed to create booking',
    };
  }
}

// ----------------------------------------------------------------------------
// APPROVE BOOKING (Full or Partial)
// CHANGE #3: Supports partial confirmation
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
    
    // Determine status based on confirmation
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
      standby = 0;
    }
    
    // Update booking
    booking.confirmedQuantity = confirmed;
    booking.standbyQuantity = standby;
    booking.status = status;
    booking.approvalDate = new Date();
    booking.approvedBy = validated.approvedBy;
    
    if (validated.notes) {
      booking.notes = validated.notes;
    }
    
    await booking.save();
    
    // TODO: Send email notification to exporter
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(booking)),
      message: status === 'PARTIAL' 
        ? `Partially confirmed: ${confirmed}/${requested} units. ${standby} on standby.`
        : `Fully confirmed: ${confirmed} units.`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors[0].message}`,
      };
    }
    console.error('Error approving booking:', error);
    return {
      success: false,
      error: 'Failed to approve booking',
    };
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
    booking.approvalDate = new Date();
    booking.approvedBy = validated.rejectedBy;
    
    await booking.save();
    
    // TODO: Send rejection email to exporter
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(booking)),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors[0].message}`,
      };
    }
    console.error('Error rejecting booking:', error);
    return {
      success: false,
      error: 'Failed to reject booking',
    };
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
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(bookings)),
    };
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return {
      success: false,
      error: 'Failed to fetch bookings',
    };
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
    return {
      success: false,
      error: 'Failed to fetch bookings',
      data: [],
    };
  }
}

// ----------------------------------------------------------------------------
// GET PENDING BOOKINGS
// ----------------------------------------------------------------------------

export async function getPendingBookings() {
  try {
    await connectDB();
    
    const bookings = await BookingModel.find({ status: 'PENDING' })
      .sort({ requestedDate: 1 }) // Oldest first
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(bookings)),
    };
  } catch (error) {
    console.error('Error fetching pending bookings:', error);
    return {
      success: false,
      error: 'Failed to fetch pending bookings',
    };
  }
}

// ----------------------------------------------------------------------------
// GET CONFIRMED BOOKINGS (for stowage planning)
// Returns CONFIRMED and PARTIAL bookings ready to be assigned
// ----------------------------------------------------------------------------

export async function getConfirmedBookingsForVoyage(voyageId: unknown) {
  try {
    const id = z.string().parse(voyageId);
    
    await connectDB();
    
    const bookings = await BookingModel.find({
      voyageId: id,
      status: { $in: ['CONFIRMED', 'PARTIAL'] },
      assignedStowagePlanId: { $exists: false }, // Not yet assigned
    })
      .sort({ origin: 1 }) // Sort by origin port
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(bookings)),
    };
  } catch (error) {
    console.error('Error fetching confirmed bookings:', error);
    return {
      success: false,
      error: 'Failed to fetch confirmed bookings',
    };
  }
}

// ----------------------------------------------------------------------------
// UPDATE BOOKING
// ----------------------------------------------------------------------------

export async function updateBooking(
  bookingId: unknown,
  updates: unknown
) {
  try {
    const id = BookingIdSchema.parse(bookingId);
    
    // TODO: Add proper validation schema for updates
    
    await connectDB();
    
    const booking = await BookingModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    
    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(booking)),
    };
  } catch (error) {
    console.error('Error updating booking:', error);
    return {
      success: false,
      error: 'Failed to update booking',
    };
  }
}

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------------------------------

function getDefaultMinTemp(cargoType: string): number {
  const tempMap: Record<string, number> = {
    BANANAS: 12,
    FROZEN_FISH: -25,
    TABLE_GRAPES: -1,
    CITRUS: 4,
    AVOCADOS: 5,
    BERRIES: -1,
    OTHER_FROZEN: -20,
    OTHER_CHILLED: 0,
  };
  return tempMap[cargoType] || 0;
}

function getDefaultMaxTemp(cargoType: string): number {
  const tempMap: Record<string, number> = {
    BANANAS: 14,
    FROZEN_FISH: -18,
    TABLE_GRAPES: 0,
    CITRUS: 8,
    AVOCADOS: 8,
    BERRIES: 0,
    OTHER_FROZEN: -18,
    OTHER_CHILLED: 5,
  };
  return tempMap[cargoType] || 5;
}
