import AppShell from '@/components/layout/AppShell';
import { getBookings } from '@/app/actions/booking';
import BookingsClient from './BookingsClient';
import type { DisplayBooking } from './BookingsClient';
import styles from './page.module.css';
import type { CargoType } from '@/types/models';

export default async function BookingsPage() {
  const result = await getBookings();
  const bookings = result.success ? result.data : [];

  const displayBookings: DisplayBooking[] = bookings.map((b: any) => ({
    _id: b._id,
    bookingNumber: b.bookingNumber,
    voyageNumber: b.voyageId?.voyageNumber || 'N/A',
    clientName: b.clientName || b.client?.name || 'Unknown',
    consigneeName: b.consignee?.name || '—',
    cargoType: b.cargoType as CargoType,
    requestedQuantity: b.requestedQuantity || 0,
    confirmedQuantity: b.confirmedQuantity || 0,
    standbyQuantity: b.standbyQuantity || 0,
    polCode: b.polCode || b.pol?.portCode || '—',
    podCode: b.podCode || b.pod?.portCode || '—',
    status: b.status || 'PENDING',
  }));

  const confirmed = displayBookings.filter((b: any) => b.status === 'CONFIRMED').length;
  const pending = displayBookings.filter((b: any) =>
    b.status === 'PENDING' || b.status === 'STANDBY' || b.status === 'PARTIAL'
  ).length;

  const voyageNumbers = [
    ...new Set(displayBookings.map((b: any) => b.voyageNumber).filter((v: any) => v !== 'N/A')),
  ];

  return (
    <AppShell>
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Bookings</h1>
            <p className={styles.pageSubtitle}>
              {displayBookings.length} total · {confirmed} confirmed · {pending} pending action
            </p>
          </div>
          <button className={styles.btnPrimary}>+ New Booking</button>
        </div>

        <BookingsClient bookings={displayBookings} voyageNumbers={voyageNumbers} />
      </div>
    </AppShell>
  );
}
