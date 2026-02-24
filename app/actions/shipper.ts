// ============================================================================
// SHIPPER PORTAL SERVER ACTIONS
// Data aggregation for the /shipper/* pages
// ============================================================================

'use server'

import connectDB from '@/lib/db/connect';
import { BookingModel, VoyageModel, ServiceModel } from '@/lib/db/schemas';

// ----------------------------------------------------------------------------
// GET SHIPPER DASHBOARD
// Summary cards + upcoming voyages + last 5 bookings
// ----------------------------------------------------------------------------

export async function getShipperDashboard(shipperCode: string) {
  if (!shipperCode) return { success: false, error: 'Shipper code required' };

  try {
    await connectDB();

    const bookings = await BookingModel.find({ 'shipper.code': shipperCode })
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
          status: { $in: ['PLANNED', 'ESTIMATED', 'CONFIRMED', 'IN_PROGRESS'] },
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

    const now = new Date();

    const voyages = await VoyageModel.find({
      status: { $in: ['PLANNED', 'ESTIMATED', 'CONFIRMED', 'IN_PROGRESS'] },
      $or: [{ departureDate: { $gte: now } }, { departureDate: null }],
    })
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

export async function getContractsForShipper(shipperCode: string) {
  if (!shipperCode) return { success: false, data: [], error: 'Shipper code required' };

  try {
    await connectDB();

    // Match contracts where:
    // - client.type = SHIPPER and client.clientNumber = shipperCode, OR
    // - shippers array has an entry with code = shipperCode
    const contracts = await ContractModel.find({
      active: true,
      $or: [
        { 'shippers.code': shipperCode },
        { 'client.type': 'SHIPPER', 'client.clientNumber': shipperCode },
      ],
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

export async function getUpcomingVoyagesForService(serviceId: string) {
  try {
    await connectDB();

    const now = new Date();

    const voyages = await VoyageModel.find({
      serviceId,
      status: { $in: ['PLANNED', 'ESTIMATED', 'CONFIRMED'] },
      $or: [{ departureDate: { $gte: now } }, { departureDate: null }],
    })
      .sort({ departureDate: 1 })
      .limit(12)
      .lean();

    return {
      success: true,
      data: (voyages as any[]).map((v: any) => ({
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
      })),
    };
  } catch (error) {
    console.error('Error fetching voyages for service:', error);
    return { success: false, data: [], error: 'Failed to fetch voyages' };
  }
}
