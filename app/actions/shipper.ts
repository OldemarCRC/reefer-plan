// ============================================================================
// SHIPPER PORTAL SERVER ACTIONS
// Data aggregation for the /shipper/* pages
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { BookingModel, VoyageModel, ServiceModel, ShipperModel } from '@/lib/db/schemas';
import { toTitleCase, toUpperCode, toLower } from '@/lib/utils/normalize';
import { auth } from '@/auth';

// ============================================================================
// SHIPPER CRUD
// ============================================================================

const CreateShipperSchema = z.object({
  name:     z.string().min(1).max(200),
  code:     z.string().min(1).max(20),
  contact:  z.string().min(1).max(200),
  email:    z.string().email(),
  phone:    z.string().max(50).optional(),
  country:  z.string().min(1).max(100),
});

const UpdateShipperSchema = CreateShipperSchema.partial();

export async function createShipper(data: unknown) {
  try {
    const validated = CreateShipperSchema.parse(data);
    await connectDB();

    const exists = await ShipperModel.findOne({ code: validated.code.toUpperCase() });
    if (exists) {
      return { success: false, error: `Shipper code ${validated.code.toUpperCase()} already exists` };
    }

    const shipper = await ShipperModel.create({
      name:    toTitleCase(validated.name),
      code:    toUpperCode(validated.code),
      contact: toTitleCase(validated.contact),
      email:   toLower(validated.email),
      phone:   validated.phone?.trim(),
      country: validated.country.toUpperCase(),
    });

    return { success: true, data: JSON.parse(JSON.stringify(shipper)) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    console.error('Error creating shipper:', error);
    return { success: false, error: 'Failed to create shipper' };
  }
}

export async function getShippers() {
  try {
    await connectDB();
    const shippers = await ShipperModel.find().sort({ name: 1 }).lean();
    return { success: true, data: JSON.parse(JSON.stringify(shippers)) };
  } catch (error) {
    console.error('Error fetching shippers:', error);
    return { success: false, data: [], error: 'Failed to fetch shippers' };
  }
}

export async function getActiveShippers() {
  try {
    await connectDB();
    const shippers = await ShipperModel.find({ active: true }).sort({ name: 1 }).lean();
    return { success: true, data: JSON.parse(JSON.stringify(shippers)) };
  } catch (error) {
    console.error('Error fetching active shippers:', error);
    return { success: false, data: [], error: 'Failed to fetch active shippers' };
  }
}

export async function getShipperById(id: string) {
  try {
    await connectDB();
    const shipper = await ShipperModel.findById(id).lean();
    if (!shipper) return { success: false, error: 'Shipper not found' };
    return { success: true, data: JSON.parse(JSON.stringify(shipper)) };
  } catch (error) {
    console.error('Error fetching shipper:', error);
    return { success: false, error: 'Failed to fetch shipper' };
  }
}

export async function updateShipper(id: string, data: unknown) {
  try {
    const validated = UpdateShipperSchema.parse(data);
    await connectDB();

    if (validated.code) {
      validated.code = toUpperCode(validated.code);
      const conflict = await ShipperModel.findOne({ code: validated.code, _id: { $ne: id } });
      if (conflict) {
        return { success: false, error: `Shipper code ${validated.code} already exists` };
      }
    }

    const normalizedUpdate: Record<string, any> = { ...validated };
    if (validated.name)    normalizedUpdate.name    = toTitleCase(validated.name);
    if (validated.contact) normalizedUpdate.contact = toTitleCase(validated.contact);
    if (validated.email)   normalizedUpdate.email   = toLower(validated.email);
    if (validated.country) normalizedUpdate.country = validated.country.toUpperCase();
    if (validated.phone !== undefined) normalizedUpdate.phone = validated.phone?.trim();

    const shipper = await ShipperModel.findByIdAndUpdate(
      id,
      { $set: normalizedUpdate },
      { new: true, runValidators: true }
    );

    if (!shipper) return { success: false, error: 'Shipper not found' };
    return { success: true, data: JSON.parse(JSON.stringify(shipper)) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    console.error('Error updating shipper:', error);
    return { success: false, error: 'Failed to update shipper' };
  }
}

export async function deactivateShipper(id: string) {
  try {
    await connectDB();
    const shipper = await ShipperModel.findByIdAndUpdate(
      id,
      { $set: { active: false } },
      { new: true }
    );
    if (!shipper) return { success: false, error: 'Shipper not found' };
    return { success: true, data: JSON.parse(JSON.stringify(shipper)) };
  } catch (error) {
    console.error('Error deactivating shipper:', error);
    return { success: false, error: 'Failed to deactivate shipper' };
  }
}

// ----------------------------------------------------------------------------
// GET SHIPPER DASHBOARD
// Summary cards + upcoming voyages + last 5 bookings
// ----------------------------------------------------------------------------

export async function getShipperDashboard(shipperCode: string, shipperId?: string) {
  if (!shipperCode && !shipperId) return { success: false, error: 'Shipper code required' };

  try {
    await connectDB();

    const query = shipperId
      ? { $or: [{ shipperId }, { 'shipper.code': shipperCode }] }
      : { 'shipper.code': shipperCode };

    const bookings = await BookingModel.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const bList = bookings as any[];

    const activeBookings = bList.filter((b: any) =>
      ['PENDING', 'CONFIRMED', 'PARTIAL', 'STANDBY'].includes(b.status)
    ).length;

    const confirmedPallets = bList
      .filter((b: any) => b.status === 'CONFIRMED' || b.status === 'PARTIAL')
      .reduce((sum: number, b: any) => sum + (b.confirmedQuantity ?? 0), 0);

    const pendingCount = bList.filter((b: any) => b.status === 'PENDING').length;
    const standbyCount = bList.filter((b: any) => b.status === 'STANDBY').length;

    // Upcoming voyages that have at least one booking for this shipper
    const voyageIds = [...new Set(bList.map((b: any) => b.voyageId?.toString()).filter(Boolean))];

    const voyages = voyageIds.length > 0
      ? await VoyageModel.find({
          _id: { $in: voyageIds },
          status: { $in: ['PLANNED', 'IN_PROGRESS'] },
        })
          .sort({ departureDate: 1 })
          .limit(5)
          .lean()
      : [];

    const upcomingVoyages = (voyages as any[]).map((v: any) => ({
      _id: v._id.toString(),
      voyageNumber: v.voyageNumber,
      vesselName: v.vesselName,
      status: v.status,
      departureDate: v.departureDate ? v.departureDate.toISOString() : null,
      portCalls: (v.portCalls ?? []).map((pc: any) => ({
        portCode: pc.portCode,
        portName: pc.portName,
        country: pc.country ?? '',
        sequence: pc.sequence,
        eta: pc.eta ? pc.eta.toISOString() : null,
        etd: pc.etd ? pc.etd.toISOString() : null,
        operations: pc.operations ?? [],
        locked: pc.locked ?? false,
      })),
    }));

    const recentBookings = bList.slice(0, 5).map((b: any) => ({
      _id: b._id.toString(),
      bookingNumber: b.bookingNumber,
      voyageNumber: b.voyageNumber ?? '',
      serviceCode: b.serviceCode ?? '',
      cargoType: b.cargoType ?? '',
      requestedQuantity: b.requestedQuantity ?? 0,
      confirmedQuantity: b.confirmedQuantity ?? 0,
      status: b.status,
      pol: b.pol ?? null,
      pod: b.pod ?? null,
      consignee: b.consignee ?? null,
      createdAt: b.createdAt ? b.createdAt.toISOString() : null,
    }));

    return {
      success: true,
      data: {
        summary: { activeBookings, confirmedPallets, pendingCount, standbyCount },
        upcomingVoyages,
        recentBookings,
      },
    };
  } catch (error) {
    console.error('Error fetching shipper dashboard:', error);
    return { success: false, error: 'Failed to load dashboard' };
  }
}

// ----------------------------------------------------------------------------
// GET SHIPPER SCHEDULES
// Upcoming voyages grouped by service — public schedule info only, no cargo data
// ----------------------------------------------------------------------------

export async function getShipperSchedules() {
  try {
    await connectDB();

    const session = await auth();
    const serviceFilter = (session?.user as any)?.serviceFilter ?? [];

    const now = new Date();

    let scheduleQuery: Record<string, unknown> = {
      status: { $in: ['PLANNED', 'ESTIMATED', 'CONFIRMED', 'IN_PROGRESS'] },
      $or: [{ departureDate: { $gte: now } }, { departureDate: null }],
    };

    if (serviceFilter.length > 0) {
      const services = await ServiceModel.find({ serviceCode: { $in: serviceFilter } }).select('_id').lean();
      const serviceIds = (services as any[]).map((s: any) => s._id);
      scheduleQuery = { ...scheduleQuery, serviceId: { $in: serviceIds } };
    }

    const voyages = await VoyageModel.find(scheduleQuery)
      .populate('serviceId', 'serviceCode serviceName shortCode')
      .sort({ departureDate: 1 })
      .limit(60)
      .lean();

    // Group by service
    const serviceMap = new Map<string, {
      serviceCode: string;
      serviceName: string;
      voyages: any[];
    }>();

    for (const v of voyages as any[]) {
      const sCode = v.serviceId?.serviceCode ?? v.serviceCode ?? 'UNKNOWN';
      const sName = v.serviceId?.serviceName ?? sCode;

      if (!serviceMap.has(sCode)) {
        serviceMap.set(sCode, { serviceCode: sCode, serviceName: sName, voyages: [] });
      }

      serviceMap.get(sCode)!.voyages.push({
        _id: v._id.toString(),
        voyageNumber: v.voyageNumber,
        vesselName: v.vesselName,
        status: v.status,
        departureDate: v.departureDate ? v.departureDate.toISOString() : null,
        portCalls: (v.portCalls ?? []).map((pc: any) => ({
          portCode: pc.portCode,
          portName: pc.portName,
          country: pc.country ?? '',
          sequence: pc.sequence,
          eta: pc.eta ? pc.eta.toISOString() : null,
          etd: pc.etd ? pc.etd.toISOString() : null,
          operations: pc.operations ?? [],
        })),
      });
    }

    return {
      success: true,
      data: Array.from(serviceMap.values()),
    };
  } catch (error) {
    console.error('Error fetching schedules:', error);
    return { success: false, data: [], error: 'Failed to load schedules' };
  }
}

// ----------------------------------------------------------------------------
// GET CONTRACTS FOR SHIPPER
// Returns active contracts that include this shipper code
// ----------------------------------------------------------------------------

import { ContractModel } from '@/lib/db/schemas';

export async function getContractsForShipper(shipperCode: string, shipperId?: string) {
  if (!shipperCode && !shipperId) return { success: false, data: [], error: 'Shipper code required' };

  try {
    await connectDB();

    // Match contracts where shipper appears in any of:
    // - new counterparties[] (shipperCode field)
    // - legacy shippers[] (code field)
    // - client itself (SHIPPER type + clientNumber = shipperCode)
    const orConditions: any[] = [
      { 'counterparties.shipperCode': shipperCode },
      { 'shippers.code': shipperCode },
      { 'client.type': 'SHIPPER', 'client.clientNumber': shipperCode },
    ];
    if (shipperId) {
      orConditions.push({ 'counterparties.shipperId': shipperId });
    }

    const contracts = await ContractModel.find({
      active: true,
      $or: orConditions,
    })
      .populate('serviceId', 'serviceCode serviceName shortCode portRotation cycleDurationWeeks')
      .lean();

    return { success: true, data: JSON.parse(JSON.stringify(contracts)) };
  } catch (error) {
    console.error('Error fetching contracts for shipper:', error);
    return { success: false, data: [], error: 'Failed to fetch contracts' };
  }
}

// ----------------------------------------------------------------------------
// GET UPCOMING VOYAGES FOR BOOKING REQUEST
// Returns future voyages for a specific service
// ----------------------------------------------------------------------------

export async function getUpcomingVoyagesForService(serviceId: string, shipperPolPortCode?: string) {
  try {
    await connectDB();

    const now = new Date();

    const voyages = await VoyageModel.find({
      serviceId,
      status: { $in: ['PLANNED'] },
      $or: [{ departureDate: { $gte: now } }, { departureDate: null }],
    })
      .sort({ departureDate: 1 })
      .limit(12)
      .lean();

    const mapped = (voyages as any[]).map((v: any) => ({
      _id: v._id.toString(),
      voyageNumber: v.voyageNumber,
      vesselName: v.vesselName,
      status: v.status,
      departureDate: v.departureDate ? v.departureDate.toISOString() : null,
      portCalls: (v.portCalls ?? []).map((pc: any) => {
        const etaDate = pc.eta ? new Date(pc.eta) : null;
        const ataDate = pc.ata ? new Date(pc.ata) : null;
        const atdDate = pc.atd ? new Date(pc.atd) : null;
        const etaDay = etaDate ? new Date(etaDate.getFullYear(), etaDate.getMonth(), etaDate.getDate()) : null;
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        // inOperation: ETA day passed AND ATA recorded AND no ATD yet
        const inOperation = !!(etaDay && etaDay <= todayStart && ataDate && !atdDate);
        return {
          portCode: pc.portCode,
          portName: pc.portName,
          country: pc.country ?? '',
          sequence: pc.sequence,
          eta: pc.eta ? pc.eta.toISOString() : null,
          ata: pc.ata ? pc.ata.toISOString() : null,
          atd: pc.atd ? pc.atd.toISOString() : null,
          etd: pc.etd ? pc.etd.toISOString() : null,
          inOperation,
          operations: pc.operations ?? [],
        };
      }),
    }));

    // If a POL port code is provided, exclude voyages where that port has already departed
    const filtered = shipperPolPortCode
      ? mapped.filter(v => {
          const polPc = v.portCalls.find((pc: any) => pc.portCode === shipperPolPortCode);
          return !polPc || !polPc.atd;
        })
      : mapped;

    return { success: true, data: filtered };
  } catch (error) {
    console.error('Error fetching voyages for service:', error);
    return { success: false, data: [], error: 'Failed to fetch voyages' };
  }
}
