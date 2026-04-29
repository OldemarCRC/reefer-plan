import AppShell from '@/components/layout/AppShell';
import { getVoyageById } from '@/app/actions/voyage';
import { getStowagePlansByVoyage } from '@/app/actions/stowage-plan';
import { getBookingsByVoyage } from '@/app/actions/booking';
import { getContractsByService } from '@/app/actions/contract';
import { getSpaceForecasts } from '@/app/actions/space-forecast';
import { auth } from '@/auth';
import Link from 'next/link';
import styles from './page.module.css';
import { PortCallsEditor, DeletePlanButton, CloseVoyageButton, UnifiedContractsPanel } from './VoyageDetailClient';

const statusStyles: Record<string, { bg: string; color: string }> = {
  PLANNED:     { bg: 'var(--color-blue-muted)',     color: 'var(--color-blue-light)'    },
  IN_PROGRESS: { bg: 'var(--color-success-muted)',  color: 'var(--color-success)'       },
  COMPLETED:   { bg: 'var(--color-bg-tertiary)',    color: 'var(--color-text-tertiary)' },
  CLOSED:      { bg: 'var(--color-bg-tertiary)',    color: 'var(--color-text-tertiary)' },
  CANCELLED:   { bg: 'var(--color-danger-muted)',   color: 'var(--color-danger)'        },
};

function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] || { bg: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' };
  return (
    <span className={styles.badge} style={{ background: style.bg, color: style.color }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch {
    return '—';
  }
}

export default async function VoyageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [session, voyageResult] = await Promise.all([
    auth(),
    getVoyageById(id),
  ]);

  if (!voyageResult.success) {
    return (
      <AppShell>
        <div style={{ padding: '2rem', color: 'var(--color-text-secondary)' }}>
          Voyage not found.{' '}
          <Link href="/voyages" style={{ color: 'var(--color-blue-light)' }}>← Back to Voyages</Link>
        </div>
      </AppShell>
    );
  }

  const voyage = voyageResult.data;
  const portCalls: any[] = (voyage.portCalls || []).slice().sort((a: any, b: any) => {
    const ta = a.eta ? new Date(a.eta).getTime() : (a.sequence ?? 0) * 1e10;
    const tb = b.eta ? new Date(b.eta).getTime() : (b.sequence ?? 0) * 1e10;
    return ta - tb;
  });
  // Parallel fetches
  const serviceIdStr = String((voyage.serviceId as any)?._id ?? '');
  const [plansResult, bookingsResult, forecastsResult, contractsResult] = await Promise.all([
    getStowagePlansByVoyage(id),
    getBookingsByVoyage(id),
    getSpaceForecasts(id),
    serviceIdStr ? getContractsByService(serviceIdStr) : Promise.resolve({ success: false as const, data: [] as any[], error: '' }),
  ]);

  const plans          = plansResult.success    ? plansResult.data    : [];
  const bookings       = bookingsResult.success  ? bookingsResult.data  : [];
  const spaceForecasts = forecastsResult.success ? forecastsResult.data : [];
  const activeContracts = (contractsResult.success ? contractsResult.data : []).filter((c: any) => c.active);

  const role = (session?.user as any)?.role as string | undefined;
  const canEdit = role === 'ADMIN' || role === 'SHIPPING_PLANNER';
  const isClosed = voyage.status === 'CLOSED' || voyage.status === 'CANCELLED';

  // Last active port call — used by CloseVoyageButton
  const activePcs = portCalls.filter((pc: any) => pc.status !== 'CANCELLED' && pc.status !== 'SKIPPED');
  const lastPort = activePcs.length > 0
    ? [...activePcs].sort((a: any, b: any) => b.sequence - a.sequence)[0]
    : null;

  const vesselName = voyage.vesselId?.name || voyage.vesselName || '—';
  const vesselImo = (voyage.vesselId as any)?.imoNumber ?? null;
  const serviceCode = voyage.serviceId?.serviceCode || 'N/A';
  const servicePortRotation = ((voyage.serviceId as any)?.portRotation ?? []).map((p: any) => ({
    portCode: p.portCode as string,
    portName: p.portName as string,
    country: (p.country ?? '') as string,
  }));

  // Discharge ports for the Change Destination modal — derived from voyage's
  // own port calls so custom ports added post-creation are included
  const dischargePorts = portCalls
    .filter((pc: any) => pc.status !== 'CANCELLED' && pc.status !== 'SKIPPED' && (pc.operations ?? []).includes('DISCHARGE'))
    .map((pc: any) => ({ portCode: pc.portCode as string, portName: pc.portName as string }));

  return (
    <AppShell>
      <div className={styles.page}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <div className={styles.titleRow}>
              <Link href="/voyages" className={styles.backLink}>← Voyages</Link>
              <span className={styles.separator}>/</span>
              <h1 className={styles.pageTitle}>{voyage.voyageNumber}</h1>
              <StatusBadge status={voyage.status || 'PLANNED'} />
            </div>
            <p className={styles.pageSubtitle}>
              {vesselName}
              {vesselImo && (
                <a
                  href={`https://www.marinetraffic.com/en/ais/details/ships/imo:${vesselImo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.mtLink}
                  title={`Track ${vesselName} on MarineTraffic (IMO ${vesselImo})`}
                >
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 1h4v4" />
                    <path d="M11 1L5.5 6.5" />
                    <path d="M5 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V8" />
                  </svg>
                </a>
              )}
              {' · '}{serviceCode}
              {(voyage as any).weekNumber != null && ` · WK${String((voyage as any).weekNumber).padStart(2, '0')}`}
              {' · '}Departure {formatDate(voyage.departureDate)}
            </p>
          </div>
          <div className={styles.headerActions}>
            {plans.length > 0 && (
              <Link href={`/stowage-plans/${plans[0]._id}`} className={styles.btnPrimary}>
                Open Stowage Plan
              </Link>
            )}
            {!isClosed && (
              <Link href={`/stowage-plans/new?voyageId=${id}`} className={styles.btnSecondary}>
                + New Plan
              </Link>
            )}
            {voyage.status === 'COMPLETED' && canEdit && lastPort && (
              <CloseVoyageButton
                voyageId={id}
                voyageNumber={voyage.voyageNumber}
                lastPortName={lastPort.portName}
              />
            )}
          </div>
        </div>

        {/* Port Calls (editable) */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Port Calls</h2>
            <span className={styles.cardCount}>{portCalls.length} ports</span>
          </div>
          {portCalls.length === 0 ? (
            <p className={styles.cellMuted}>No port calls defined for this voyage.</p>
          ) : isClosed ? (
            <p className={styles.cellMuted}>
              This voyage is {voyage.status?.toLowerCase()} — port calls are read-only.
            </p>
          ) : (
            <PortCallsEditor
              voyageId={id}
              portCalls={portCalls.map((pc: any) => ({
                portCode: pc.portCode,
                portName: pc.portName,
                country: pc.country ?? '',
                sequence: pc.sequence ?? 0,
                eta: pc.eta ?? null,
                etd: pc.etd ?? null,
                ata: pc.ata ?? null,
                atd: pc.atd ?? null,
                operations: pc.operations ?? [],
                locked: pc.locked ?? false,
                status: pc.status ?? 'SCHEDULED',
              }))}
              servicePortRotation={servicePortRotation}
            />
          )}
        </div>

        {/* Stowage Plans Section */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Stowage Plans</h2>
            {!isClosed && (
              <Link href={`/stowage-plans/new?voyageId=${id}`} className={styles.btnSecondary}>
                + New Plan
              </Link>
            )}
          </div>
          {plans.length === 0 ? (
            <p className={styles.cellMuted}>No stowage plans for this voyage.</p>
          ) : (
            <div className={styles.planList}>
              {plans.map((plan: any, idx: number) => {
                const isLatest = idx === 0; // plans are sorted newest-first by getStowagePlansByVoyage
                return (
                  <div key={plan._id} className={styles.planRow}>
                    <div className={styles.planInfo}>
                      <span className={styles.planName}>{plan.planNumber || `Plan ${plan._id.slice(-6)}`}</span>
                      <span className={styles.planMeta}>
                        {plan.status || 'DRAFT'} · Created {formatDate(plan.createdAt)}
                      </span>
                    </div>
                    <div className={styles.planActions}>
                      <Link href={`/stowage-plans/${plan._id}`} className={styles.btnGhost}>
                        Open →
                      </Link>
                      {isLatest && (
                        <DeletePlanButton
                          planId={plan._id}
                          planNumber={plan.planNumber || plan._id.slice(-6)}
                          voyageId={id}
                          planStatus={plan.status || 'DRAFT'}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Contracts & Space — unified booking + forecast panel */}
        <UnifiedContractsPanel
          voyageId={id}
          voyageStatus={voyage.status || 'PLANNED'}
          activeContracts={activeContracts}
          bookings={bookings}
          spaceForecasts={spaceForecasts}
          canEdit={canEdit}
          dischargePorts={dischargePorts}
        />
      </div>
    </AppShell>
  );
}
