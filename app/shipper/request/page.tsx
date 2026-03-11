// ============================================================================
// SHIPPER PORTAL — New Booking Request (server wrapper)
// ============================================================================

import { auth } from '@/auth';
import { getContractsForShipper } from '@/app/actions/shipper';
import RequestClient from './RequestClient';
import styles from '../shipper.module.css';

export default async function ShipperRequestPage() {
  const session = await auth();
  const shipperCode = (session?.user as any)?.shipperCode as string | null;
  const shipperId   = (session?.user as any)?.shipperId   as string | null;

  if (!shipperCode && !shipperId) {
    return (
      <div>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>New Booking Request</h1>
        </div>
        <div className={styles.detailCard}>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Your account is not linked to a shipper. Contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  const result = await getContractsForShipper(shipperCode ?? '', shipperId ?? undefined);
  const contracts = result.success ? result.data : [];

  return (
    <RequestClient
      shipperCode={shipperCode ?? ''}
      initialContracts={contracts}
    />
  );
}
