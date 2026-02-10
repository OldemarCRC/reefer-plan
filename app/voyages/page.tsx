import AppShell from '@/components/layout/AppShell';
import { getVoyages } from '@/app/actions/voyage';
import VoyagesClient from './VoyagesClient';
import type { DisplayVoyage } from './VoyagesClient';
import styles from './page.module.css';
import Link from 'next/link';

export default async function VoyagesPage() {
  const result = await getVoyages();
  const voyages = result.success ? result.data : [];

  const displayVoyages: DisplayVoyage[] = voyages.map((v: any) => ({
    _id: v._id,
    voyageNumber: v.voyageNumber,
    status: v.status || 'PLANNED',
    vesselName: v.vesselName,
    serviceCode: v.serviceId?.serviceCode || 'N/A',
    startDate: v.departureDate ? new Date(v.departureDate).toLocaleDateString() : 'TBD',
    portCalls: (v.portCalls || []).map((pc: any) => ({
      portCode: pc.portCode,
      portName: pc.portName,
      operations: pc.operations || [],
      locked: false,
    })),
    bookingsCount: 0,
    palletsBooked: 0,
    palletsCapacity: 1800,
  }));

  return (
    <AppShell>
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Voyages</h1>
            <p className={styles.pageSubtitle}>{displayVoyages.length} voyages</p>
          </div>
          <Link href="/voyages/new" className={styles.btnPrimary}>+ New Voyage</Link>
        </div>

        <VoyagesClient voyages={displayVoyages} />
      </div>
    </AppShell>
  );
}
