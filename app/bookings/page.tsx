import AppShell from '@/components/layout/AppShell';
import { getBookings } from '@/app/actions/booking';
import { getActiveContracts } from '@/app/actions/contract';
import { getVoyages } from '@/app/actions/voyage';
import BookingsClient from './BookingsClient';
import type { DisplayBooking, ContractOption, VoyageOption } from './BookingsClient';
import type { CargoType } from '@/types/models';

export default async function BookingsPage() {
  const [bookingsResult, contractsResult, voyagesResult] = await Promise.all([
    getBookings(),
    getActiveContracts(),
    getVoyages(),
  ]);

  const bookings = bookingsResult.success ? bookingsResult.data : [];
  const rawContracts = contractsResult.success ? contractsResult.data : [];
  const rawVoyages = voyagesResult.success ? voyagesResult.data : [];

  const displayBookings: DisplayBooking[] = bookings.map((b: any) => ({
    _id: b._id,
    bookingNumber: b.bookingNumber,
    voyageNumber: b.voyageId?.voyageNumber || b.voyageNumber || 'N/A',
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
    counterparties: c.counterparties || [],
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
  }));

  const confirmed = displayBookings.filter((b) => b.status === 'CONFIRMED').length;
  const pending = displayBookings.filter((b) =>
    b.status === 'PENDING' || b.status === 'STANDBY' || b.status === 'PARTIAL'
  ).length;

  const voyageNumbers = [
    ...new Set(displayBookings.map((b) => b.voyageNumber).filter((v) => v !== 'N/A')),
  ];

  return (
    <AppShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <BookingsClient
          bookings={displayBookings}
          voyageNumbers={voyageNumbers}
          contracts={contracts}
          voyages={voyages}
          confirmedCount={confirmed}
          pendingCount={pending}
        />
      </div>
    </AppShell>
  );
}
