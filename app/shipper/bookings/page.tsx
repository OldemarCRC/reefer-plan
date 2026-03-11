// ============================================================================
// SHIPPER PORTAL — My Bookings
// ============================================================================

import { auth } from '@/auth';
import { getBookingsByShipperCode } from '@/app/actions/booking';
import BookingsClient from './BookingsClient';
import styles from '../shipper.module.css';

export default async function ShipperBookingsPage() {
  const session = await auth();
  const shipperCode = (session?.user as any)?.shipperCode as string | null;
  const shipperId   = (session?.user as any)?.shipperId   as string | null;

  if (!shipperCode && !shipperId) {
    return (
      <div>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>My Bookings</h1>
        </div>
        <div className={styles.detailCard}>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Your account is not linked to a shipper. Contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  const result = await getBookingsByShipperCode(shipperCode ?? '', shipperId ?? undefined);

  return (
    <BookingsClient
      initialBookings={result.success ? result.data : []}
      shipperCode={shipperCode ?? ''}
    />
  );
}
