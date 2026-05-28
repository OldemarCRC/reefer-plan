// ============================================================================
// SHIPPER PORTAL — Voyage Schedules
// ============================================================================

import { getShipperSchedules } from '@/app/actions/shipper';
import SchedulesClient from './SchedulesClient';
import styles from '../shipper.module.css';


export default async function ShipperSchedulesPage() {
  const result = await getShipperSchedules();

  if (!result.success) {
    return (
      <div>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Voyage Schedules</h1>
        </div>
        <div className={styles.emptyState}>
          <div className={styles.emptyStateTitle}>Failed to load schedules</div>
        </div>
      </div>
    );
  }

  const services = result.data;

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Voyage Schedules</h1>
        <p className={styles.pageSubtitle}>Upcoming sailings across all services. Dates are estimated and subject to change.</p>
      </div>

      {services.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>🗓</div>
          <div className={styles.emptyStateTitle}>No upcoming voyages</div>
          <div className={styles.emptyStateDesc}>Check back later for scheduled sailings.</div>
        </div>
      ) : (
        <SchedulesClient services={services} />
      )}
    </div>
  );
}
