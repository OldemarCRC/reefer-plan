// ============================================================================
// SHIPPER PORTAL — My Bookings
// ============================================================================

import { auth } from '@/auth';
import { getBookingsByShipperCode } from '@/app/actions/booking';
import BookingsClient from './BookingsClient';

export default async function ShipperBookingsPage() {
  const session = await auth();
  const shipperCode = (session?.user as any)?.shipperCode as string | null;

  const result = shipperCode
    ? await getBookingsByShipperCode(shipperCode)
    : { success: true, data: [] };

  return (
    <BookingsClient
      initialBookings={result.success ? result.data : []}
      shipperCode={shipperCode ?? ''}
    />
  );
}
