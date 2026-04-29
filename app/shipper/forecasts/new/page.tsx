// ============================================================================
// SHIPPER PORTAL — New Forecast (server wrapper)
// ============================================================================

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getContractsForShipper, getUpcomingVoyagesForService } from '@/app/actions/shipper';
import { getMyForecasts } from '@/app/actions/space-forecast';
import ForecastWizard from './ForecastWizard';
import styles from '../../shipper.module.css';

export default async function NewForecastPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if ((session.user as any).role !== 'EXPORTER') redirect('/shipper');

  const shipperCode = (session.user as any).shipperCode as string | null;
  const shipperId   = (session.user as any).shipperId   as string | null;

  if (!shipperCode && !shipperId) {
    return (
      <div>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>New Forecast</h1>
        </div>
        <div className={styles.detailCard}>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Your account is not linked to a shipper. Contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  // Fetch contracts for this shipper
  const contractsResult = await getContractsForShipper(shipperCode ?? '', shipperId ?? undefined);
  const contracts = contractsResult.success ? contractsResult.data : [];

  // Pre-fetch upcoming voyages for each unique service across all contracts
  const serviceIdsSeen = new Set<string>();
  const voyagesByServiceId: Record<string, any[]> = {};

  for (const contract of contracts) {
    const svcId = contract.serviceId?._id?.toString() ?? contract.serviceId?.toString() ?? '';
    if (!svcId || serviceIdsSeen.has(svcId)) continue;
    serviceIdsSeen.add(svcId);

    // Use the shipper's POL port code (from contract originPort) to filter
    const polPortCode = contract.originPort?.portCode ?? '';
    const voyResult = await getUpcomingVoyagesForService(svcId, polPortCode || undefined);
    voyagesByServiceId[svcId] = voyResult.success ? voyResult.data : [];
  }

  // Fetch existing forecasts (to pre-fill inputs)
  const forecastsResult = await getMyForecasts();
  const existingForecasts = forecastsResult.success ? forecastsResult.data : [];

  return (
    <ForecastWizard
      contracts={contracts}
      voyagesByServiceId={voyagesByServiceId}
      existingForecasts={existingForecasts as any[]}
    />
  );
}
