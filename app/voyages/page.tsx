import AppShell from '@/components/layout/AppShell';
import { getVoyages } from '@/app/actions/voyage';
import { getPortWeather } from '@/app/actions/weather';
import VoyagesClient from './VoyagesClient';
import type { DisplayVoyage } from './VoyagesClient';
import styles from './page.module.css';
import Link from 'next/link';

function formatShortDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return null;
  }
}

export default async function VoyagesPage() {
  const result = await getVoyages();
  const voyages = result.success ? result.data : [];

  // Collect unique (portName, country) pairs for weather lookup
  const portKeys = new Map<string, { portName: string; country: string }>();
  for (const v of voyages) {
    for (const pc of v.portCalls || []) {
      const key = `${pc.portName},${pc.country || ''}`.toLowerCase();
      if (!portKeys.has(key)) {
        portKeys.set(key, { portName: pc.portName, country: pc.country || '' });
      }
    }
  }

  // Fetch weather for all unique ports in parallel
  const weatherEntries = await Promise.all(
    Array.from(portKeys.values()).map(async ({ portName, country }) => {
      const temp = await getPortWeather(portName, country);
      return [`${portName},${country}`.toLowerCase(), temp] as const;
    })
  );
  const weatherByPort = Object.fromEntries(weatherEntries);

  console.log('[VoyagesPage] sorting portCalls by ETA for', voyages.length, 'voyages');
  const displayVoyages: DisplayVoyage[] = voyages.map((v: any) => ({
    _id: v._id,
    voyageNumber: v.voyageNumber,
    status: v.status || 'PLANNED',
    vesselName: v.vesselName,
    serviceCode: v.serviceId?.serviceCode || 'N/A',
    startDate: v.departureDate ? new Date(v.departureDate).toLocaleDateString() : 'TBD',
    portCalls: (v.portCalls || [])
      .slice()
      .sort((a: any, b: any) => {
        const ta = a.eta ? new Date(a.eta).getTime() : (a.sequence ?? 0) * 1e10;
        const tb = b.eta ? new Date(b.eta).getTime() : (b.sequence ?? 0) * 1e10;
        return ta - tb;
      })
      .map((pc: any) => ({
        portCode: pc.portCode,
        portName: pc.portName,
        country: pc.country || '',
        sequence: pc.sequence ?? 0,
        eta: formatShortDate(pc.eta),
        etd: formatShortDate(pc.etd),
        operations: pc.operations || [],
        locked: pc.locked ?? false,
        weather: weatherByPort[`${pc.portName},${pc.country || ''}`.toLowerCase()] ?? null,
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
