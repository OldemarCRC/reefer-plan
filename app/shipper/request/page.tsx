// ============================================================================
// SHIPPER PORTAL — New Booking Request (server wrapper)
// ============================================================================

import { auth } from '@/auth';
import { getContractsForShipper } from '@/app/actions/shipper';
import RequestClient from './RequestClient';

export default async function ShipperRequestPage() {
  const session = await auth();
  const shipperCode = (session?.user as any)?.shipperCode as string | null;

  let contracts: any[] = [];
  if (shipperCode) {
    const result = await getContractsForShipper(shipperCode);
    if (result.success) contracts = result.data;
  }

  return (
    <RequestClient
      shipperCode={shipperCode ?? ''}
      initialContracts={contracts}
    />
  );
}
