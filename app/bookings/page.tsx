import AppShell from '@/components/layout/AppShell';
import { getBookings } from '@/app/actions/booking';
import { getActiveContracts } from '@/app/actions/contract';
import { getVoyages } from '@/app/actions/voyage';
import BookingsClient from './BookingsClient';
import type { DisplayBooking, ContractOption, VoyageOption } from './BookingsClient';
import type { CargoType } from '@/types/models';
import { auth } from '@/auth';

export default async function BookingsPage({ searchParams }: { searchParams?: Promise<{ archived?: string }> }) {
  const params = await searchParams;
  const showArchived = params?.archived === 'true';
  const [session, bookingsResult, contractsResult, voyagesResult] = await Promise.all([
    auth(),
    getBookings(showArchived),
    getActiveContracts(),
    getVoyages(),
  ]);

  const bookings = bookingsResult.success ? bookingsResult.data : [];
  const allContracts = contractsResult.success ? contractsResult.data : [];
  const serviceFilter: string[] = (session?.user as any)?.serviceFilter ?? [];
  const rawContracts = serviceFilter.length === 0
    ? allContracts
    : allContracts.filter((c: any) => serviceFilter.includes(c.serviceCode));
  const rawVoyages = voyagesResult.success ? voyagesResult.data : [];

  const displayBookings: DisplayBooking[] = bookings.map((b: any) => ({
    _id: b._id,
    bookingNumber: b.bookingNumber,
    voyageNumber: b.voyageId?.voyageNumber || b.voyageNumber || 'N/A',
    vesselName: b.vesselName ?? b.voyageId?.vesselName ?? '',
    clientName: b.clientName || b.client?.name || 'Unknown',
    shipperName: b.shipper?.name || '—',
    consigneeName: b.consignee?.name || '—',
    cargoType: b.cargoType as CargoType,
    requestedQuantity: b.requestedQuantity || 0,
    confirmedQuantity: b.confirmedQuantity || 0,
    standbyQuantity: b.standbyQuantity || 0,
    polCode: b.polCode || b.pol?.portCode || '—',
    podCode: b.podCode || b.pod?.portCode || '—',
    status: b.status || 'PENDING',
    estimateSource: b.estimateSource || 'CONTRACT_DEFAULT',
    serviceCode: b.serviceCode || '',
  }));

  const contracts: ContractOption[] = rawContracts.map((c: any) => ({
    id: c._id,
    contractNumber: c.contractNumber,
    clientName: c.client?.name || '',
    clientType: c.client?.type || 'SHIPPER',
    serviceId: typeof c.serviceId === 'object' ? c.serviceId._id : c.serviceId,
    serviceCode: c.serviceCode,
    officeCode: c.officeCode,
    originPort: c.originPort,
    destinationPort: c.destinationPort,
    shippers: c.shippers || [],
    consignees: c.consignees || [],
    counterparties: (c.counterparties || []).map((cp: any) => ({
      shipperId: cp.shipperId?.toString(),
      shipperName: cp.shipperName,
      shipperCode: cp.shipperCode,
      weeklyEstimate: cp.weeklyEstimate,
      cargoTypes: cp.cargoTypes,
      active: cp.active !== false,
    })),
    cargoType: c.cargoType || undefined,
    weeklyPallets: c.weeklyPallets ?? undefined,
    validFrom: c.validFrom,
    validTo: c.validTo,
  }));

  const voyages: VoyageOption[] = rawVoyages.map((v: any) => ({
    id: v._id,
    voyageNumber: v.voyageNumber,
    serviceId: typeof v.serviceId === 'object' ? v.serviceId._id : v.serviceId,
    serviceCode: typeof v.serviceId === 'object' ? v.serviceId.serviceCode : '',
    vesselName: v.vesselName || (typeof v.vesselId === 'object' ? v.vesselId.name : ''),
    departureDate: v.departureDate || v.startDate,
    status: v.status,
    portCalls: (v.portCalls ?? []).map((pc: any) => ({
      portCode: pc.portCode,
      eta: pc.eta ? new Date(pc.eta).toISOString() : undefined,
      ata: pc.ata ? new Date(pc.ata).toISOString() : undefined,
      atd: pc.atd ? new Date(pc.atd).toISOString() : undefined,
      operations: pc.operations ?? [],
    })),
  }));

  const confirmed = displayBookings.filter((b) => b.status === 'CONFIRMED').length;
  const pending = displayBookings.filter((b) =>
    b.status === 'PENDING' || b.status === 'STANDBY' || b.status === 'PARTIAL'
  ).length;

  const voyageOptions = [...new Map(
    displayBookings
      .filter((b) => b.voyageNumber !== 'N/A')
      .map(b => [b.voyageNumber, { voyageNumber: b.voyageNumber, vesselName: b.vesselName ?? '' }])
  ).values()].sort((a, b) => a.voyageNumber.localeCompare(b.voyageNumber));

  return (
    <AppShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', minWidth: 0, width: '100%' }}>
        <BookingsClient
          bookings={displayBookings}
          voyageOptions={voyageOptions}
          contracts={contracts}
          voyages={voyages}
          confirmedCount={confirmed}
          pendingCount={pending}
          showArchived={showArchived}
        />
      </div>
    </AppShell>
  );
}
