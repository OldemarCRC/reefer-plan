// ============================================================================
// SHIPMENT SERVER ACTIONS
// Manages specific cargo shipments with POL/POD
//
// CHANGE #5: Multiple Consignees - Each shipment has specific POL/POD
// POL = Port of Loading, POD = Port of Discharge
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { ShipmentModel } from '@/lib/db/schemas';
import type { Shipment } from '@/types/models';

// ----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

const ShipmentIdSchema = z.string().min(1, 'Shipment ID is required');

const ShipmentNumberSchema = z.string()
  .regex(/^SH-\d{4}-\d{5}$/, 'Shipment number format: SH-YYYY-NNNNN');

const PortReferenceSchema = z.object({
  portCode: z.string().min(4).max(6),
  portName: z.string().min(1),
  country: z.string().min(1),
});

const CreateShipmentSchema = z.object({
  shipmentNumber: ShipmentNumberSchema.optional(), // Auto-generated if not provided
  bookingId: z.string().min(1, 'Booking ID is required'),
  contractId: z.string().optional(),
  voyageId: z.string().min(1, 'Voyage ID is required'),
  
  shipper: z.object({
    name: z.string().min(1).max(200),
    contact: z.string().min(1),
    email: z.string().email(),
  }),
  
  // CHANGE #5: Specific consignee for this shipment
  consignee: z.object({
    name: z.string().min(1).max(200),
    address: z.string().min(1),
    country: z.string().min(1),
    contact: z.string().min(1),
    email: z.string().email(),
  }),
  
  // CHANGE #5: Specific POL/POD (Port of Loading / Port of Discharge)
  pol: PortReferenceSchema, // Port of Loading
  pod: PortReferenceSchema, // Port of Discharge
  
  cargo: z.object({
    type: z.enum([
      'BANANAS',
      'FROZEN_FISH',
      'TABLE_GRAPES',
      'CITRUS',
      'AVOCADOS',
      'BERRIES',
      'OTHER_FROZEN',
      'OTHER_CHILLED',
    ]),
    quantity: z.number().int().positive(),
    totalWeight: z.number().positive(), // kg
    packageType: z.enum(['PALLET', 'CONTAINER', 'BULK']).default('PALLET'),
  }),
  
  status: z.enum([
    'PENDING',
    'CONFIRMED',
    'LOADED',
    'IN_TRANSIT',
    'DISCHARGED',
    'DELIVERED',
    'CANCELLED',
  ]).default('PENDING'),
});

const UpdateShipmentSchema = CreateShipmentSchema.partial();

// ----------------------------------------------------------------------------
// CREATE SHIPMENT
// ----------------------------------------------------------------------------

export async function createShipment(data: unknown) {
  try {
    const validated = CreateShipmentSchema.parse(data);
    
    await connectDB();
    
    // Generate shipment number if not provided
    let shipmentNumber = validated.shipmentNumber;
    if (!shipmentNumber) {
      const year = new Date().getFullYear();
      const count = await ShipmentModel.countDocuments();
      shipmentNumber = `SH-${year}-${String(count + 1).padStart(5, '0')}`;
    } else {
      // Check if shipment number already exists
      const existing = await ShipmentModel.findOne({ shipmentNumber });
      if (existing) {
        return {
          success: false,
          error: `Shipment number ${shipmentNumber} already exists`,
        };
      }
    }
    
    // Validate POL and POD are different
    if (validated.pol.portCode === validated.pod.portCode) {
      return {
        success: false,
        error: 'Port of Loading and Port of Discharge must be different',
      };
    }
    
    // TODO: Validate that POL and POD are in the voyage route
    // TODO: Validate that POL comes before POD in sequence
    
    const shipment = await ShipmentModel.create({
      ...validated,
      shipmentNumber,
    });
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(shipment)),
      message: `Shipment ${shipmentNumber} created successfully`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.issues[0].message}`,
      };
    }
    console.error('Error creating shipment:', error);
    return {
      success: false,
      error: 'Failed to create shipment',
    };
  }
}

// ----------------------------------------------------------------------------
// UPDATE SHIPMENT
// ----------------------------------------------------------------------------

export async function updateShipment(
  shipmentId: unknown,
  updates: unknown
) {
  try {
    const id = ShipmentIdSchema.parse(shipmentId);
    const validated = UpdateShipmentSchema.parse(updates);
    
    await connectDB();
    
    // If updating POL/POD, validate they're different
    if (validated.pol && validated.pod) {
      if (validated.pol.portCode === validated.pod.portCode) {
        return {
          success: false,
          error: 'Port of Loading and Port of Discharge must be different',
        };
      }
    }
    
    const shipment = await ShipmentModel.findByIdAndUpdate(
      id,
      { $set: validated },
      { new: true, runValidators: true }
    );
    
    if (!shipment) {
      return { success: false, error: 'Shipment not found' };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(shipment)),
      message: 'Shipment updated successfully',
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.issues[0].message}`,
      };
    }
    console.error('Error updating shipment:', error);
    return {
      success: false,
      error: 'Failed to update shipment',
    };
  }
}

// ----------------------------------------------------------------------------
// UPDATE SHIPMENT STATUS
// Convenience function for status updates
// ----------------------------------------------------------------------------

export async function updateShipmentStatus(
  shipmentId: unknown,
  status: unknown
) {
  try {
    const id = ShipmentIdSchema.parse(shipmentId);
    const newStatus = z.enum([
      'PENDING',
      'CONFIRMED',
      'LOADED',
      'IN_TRANSIT',
      'DISCHARGED',
      'DELIVERED',
      'CANCELLED',
    ]).parse(status);
    
    await connectDB();
    
    const shipment = await ShipmentModel.findByIdAndUpdate(
      id,
      { 
        status: newStatus,
        statusUpdatedAt: new Date(),
      },
      { new: true }
    );
    
    if (!shipment) {
      return { success: false, error: 'Shipment not found' };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(shipment)),
      message: `Shipment status updated to ${newStatus}`,
    };
  } catch (error) {
    console.error('Error updating shipment status:', error);
    return {
      success: false,
      error: 'Failed to update shipment status',
    };
  }
}

// ----------------------------------------------------------------------------
// CANCEL SHIPMENT
// ----------------------------------------------------------------------------

export async function cancelShipment(shipmentId: unknown, reason?: string) {
  try {
    const id = ShipmentIdSchema.parse(shipmentId);
    
    await connectDB();
    
    const shipment = await ShipmentModel.findByIdAndUpdate(
      id,
      { 
        status: 'CANCELLED',
        statusUpdatedAt: new Date(),
        cancellationReason: reason,
      },
      { new: true }
    );
    
    if (!shipment) {
      return { success: false, error: 'Shipment not found' };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(shipment)),
      message: `Shipment ${shipment.shipmentNumber} cancelled`,
    };
  } catch (error) {
    console.error('Error cancelling shipment:', error);
    return {
      success: false,
      error: 'Failed to cancel shipment',
    };
  }
}

// ----------------------------------------------------------------------------
// GET ALL SHIPMENTS
// ----------------------------------------------------------------------------

export async function getShipments() {
  try {
    await connectDB();
    
    const shipments = await ShipmentModel.find()
      .populate('voyageId', 'voyageNumber departureDate')
      .populate('bookingId', 'bookingNumber')
      .sort({ createdAt: -1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(shipments)),
    };
  } catch (error) {
    console.error('Error fetching shipments:', error);
    return {
      success: false,
      error: 'Failed to fetch shipments',
    };
  }
}

// ----------------------------------------------------------------------------
// GET SHIPMENT BY ID
// ----------------------------------------------------------------------------

export async function getShipmentById(shipmentId: unknown) {
  try {
    const id = ShipmentIdSchema.parse(shipmentId);
    
    await connectDB();
    
    const shipment = await ShipmentModel.findById(id)
      .populate('voyageId')
      .populate('bookingId')
      .populate('contractId')
      .lean();
    
    if (!shipment) {
      return { success: false, error: 'Shipment not found' };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(shipment)),
    };
  } catch (error) {
    console.error('Error fetching shipment:', error);
    return {
      success: false,
      error: 'Failed to fetch shipment',
    };
  }
}

// ----------------------------------------------------------------------------
// GET SHIPMENT BY NUMBER
// ----------------------------------------------------------------------------

export async function getShipmentByNumber(shipmentNumber: unknown) {
  try {
    const number = ShipmentNumberSchema.parse(shipmentNumber);
    
    await connectDB();
    
    const shipment = await ShipmentModel.findOne({ shipmentNumber: number })
      .populate('voyageId')
      .populate('bookingId')
      .populate('contractId')
      .lean();
    
    if (!shipment) {
      return { success: false, error: 'Shipment not found' };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(shipment)),
    };
  } catch (error) {
    console.error('Error fetching shipment by number:', error);
    return {
      success: false,
      error: 'Failed to fetch shipment',
    };
  }
}

// ----------------------------------------------------------------------------
// GET SHIPMENTS BY BOOKING
// Returns all shipments for a booking
// ----------------------------------------------------------------------------

export async function getShipmentsByBooking(bookingId: unknown) {
  try {
    const id = z.string().parse(bookingId);
    
    await connectDB();
    
    const shipments = await ShipmentModel.find({ bookingId: id })
      .populate('voyageId', 'voyageNumber')
      .sort({ createdAt: -1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(shipments)),
    };
  } catch (error) {
    console.error('Error fetching shipments by booking:', error);
    return {
      success: false,
      error: 'Failed to fetch shipments',
    };
  }
}

// ----------------------------------------------------------------------------
// GET SHIPMENTS BY VOYAGE
// Returns all shipments for a voyage
// ----------------------------------------------------------------------------

export async function getShipmentsByVoyage(voyageId: unknown) {
  try {
    const id = z.string().parse(voyageId);
    
    await connectDB();
    
    const shipments = await ShipmentModel.find({ voyageId: id })
      .populate('bookingId', 'bookingNumber')
      .sort({ 'pol.portCode': 1 }) // Sort by loading port
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(shipments)),
    };
  } catch (error) {
    console.error('Error fetching shipments by voyage:', error);
    return {
      success: false,
      error: 'Failed to fetch shipments',
    };
  }
}

// ----------------------------------------------------------------------------
// GET SHIPMENTS BY CONSIGNEE
// CHANGE #5: Query shipments for a specific consignee
// ----------------------------------------------------------------------------

export async function getShipmentsByConsignee(consigneeName: unknown) {
  try {
    const name = z.string().min(1).parse(consigneeName);
    
    await connectDB();
    
    const shipments = await ShipmentModel.find({
      'consignee.name': { $regex: new RegExp(name, 'i') },
    })
      .populate('voyageId', 'voyageNumber departureDate')
      .populate('bookingId', 'bookingNumber')
      .sort({ createdAt: -1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(shipments)),
    };
  } catch (error) {
    console.error('Error fetching shipments by consignee:', error);
    return {
      success: false,
      error: 'Failed to fetch shipments',
    };
  }
}

// ----------------------------------------------------------------------------
// GET SHIPMENTS BY POL (Port of Loading)
// ----------------------------------------------------------------------------

export async function getShipmentsByPOL(portCode: unknown) {
  try {
    const code = z.string().parse(portCode);
    
    await connectDB();
    
    const shipments = await ShipmentModel.find({ 'pol.portCode': code })
      .populate('voyageId', 'voyageNumber')
      .sort({ createdAt: -1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(shipments)),
    };
  } catch (error) {
    console.error('Error fetching shipments by POL:', error);
    return {
      success: false,
      error: 'Failed to fetch shipments',
    };
  }
}

// ----------------------------------------------------------------------------
// GET SHIPMENTS BY POD (Port of Discharge)
// ----------------------------------------------------------------------------

export async function getShipmentsByPOD(portCode: unknown) {
  try {
    const code = z.string().parse(portCode);
    
    await connectDB();
    
    const shipments = await ShipmentModel.find({ 'pod.portCode': code })
      .populate('voyageId', 'voyageNumber')
      .sort({ createdAt: -1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(shipments)),
    };
  } catch (error) {
    console.error('Error fetching shipments by POD:', error);
    return {
      success: false,
      error: 'Failed to fetch shipments',
    };
  }
}

// ----------------------------------------------------------------------------
// GET SHIPMENTS BY STATUS
// ----------------------------------------------------------------------------

export async function getShipmentsByStatus(status: unknown) {
  try {
    const shipmentStatus = z.enum([
      'PENDING',
      'CONFIRMED',
      'LOADED',
      'IN_TRANSIT',
      'DISCHARGED',
      'DELIVERED',
      'CANCELLED',
    ]).parse(status);
    
    await connectDB();
    
    const shipments = await ShipmentModel.find({ status: shipmentStatus })
      .populate('voyageId', 'voyageNumber')
      .populate('bookingId', 'bookingNumber')
      .sort({ createdAt: -1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(shipments)),
    };
  } catch (error) {
    console.error('Error fetching shipments by status:', error);
    return {
      success: false,
      error: 'Failed to fetch shipments',
    };
  }
}

// ----------------------------------------------------------------------------
// GET SHIPMENTS FOR LOADING (at specific port)
// Returns shipments ready to be loaded at a specific port
// ----------------------------------------------------------------------------

export async function getShipmentsForLoading(
  voyageId: unknown,
  portCode: unknown
) {
  try {
    const vId = z.string().parse(voyageId);
    const pCode = z.string().parse(portCode);
    
    await connectDB();
    
    const shipments = await ShipmentModel.find({
      voyageId: vId,
      'pol.portCode': pCode,
      status: { $in: ['CONFIRMED', 'PENDING'] },
    })
      .populate('bookingId', 'bookingNumber')
      .sort({ createdAt: 1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(shipments)),
      count: shipments.length,
    };
  } catch (error) {
    console.error('Error fetching shipments for loading:', error);
    return {
      success: false,
      error: 'Failed to fetch shipments for loading',
    };
  }
}

// ----------------------------------------------------------------------------
// GET SHIPMENTS FOR DISCHARGE (at specific port)
// Returns shipments ready to be discharged at a specific port
// ----------------------------------------------------------------------------

export async function getShipmentsForDischarge(
  voyageId: unknown,
  portCode: unknown
) {
  try {
    const vId = z.string().parse(voyageId);
    const pCode = z.string().parse(portCode);
    
    await connectDB();
    
    const shipments = await ShipmentModel.find({
      voyageId: vId,
      'pod.portCode': pCode,
      status: { $in: ['LOADED', 'IN_TRANSIT'] },
    })
      .populate('bookingId', 'bookingNumber')
      .sort({ createdAt: 1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(shipments)),
      count: shipments.length,
    };
  } catch (error) {
    console.error('Error fetching shipments for discharge:', error);
    return {
      success: false,
      error: 'Failed to fetch shipments for discharge',
    };
  }
}
