'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { getVoyagesForPlanWizard } from '@/app/actions/voyage';
import { savePythonPlan } from '@/app/actions/stowage-plan';
import { getPodColor } from '@/lib/constants/pod-colors';
import styles from './optimize.module.css';

const ENGINE_URL = process.env.NEXT_PUBLIC_PYTHON_ENGINE_URL ?? 'http://localhost:8001';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Voyage {
  _id: string;
  voyageNumber: string;
  vesselId?: { name: string };
  vesselName?: string;
  departureDate?: string;
  weekNumber?: number;
}

interface CargoPosition {
  bookingId: string;
  sectionId: string;
  holdNumber: number;
  level: string;
  quantity: number;
  polPortCode: string;
  podPortCode: string;
  cargoType: string;
  shipperName: string;
  consigneeName: string;
  confidence: string;
}

interface Solution {
  solutionIndex: number;
  label: string;
  status: string;
  metrics: {
    placedPallets?: number;
    totalPallets?: number;
    placedPct?: number;
    overstowViolations?: number;
    balanceDev?: number;
    compactnessPct?: number;
    sectionsUsed?: number;
    totalSections?: number;
  };
  cargoPositions: CargoPosition[];
}

type Phase = 'idle' | 'loading' | 'results' | 'error';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d?: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function groupBySection(positions: CargoPosition[]) {
  const holdMap = new Map<number, Map<string, CargoPosition[]>>();
  for (const pos of positions) {
    if (!holdMap.has(pos.holdNumber)) holdMap.set(pos.holdNumber, new Map());
    const secMap = holdMap.get(pos.holdNumber)!;
    if (!secMap.has(pos.sectionId)) secMap.set(pos.sectionId, []);
    secMap.get(pos.sectionId)!.push(pos);
  }
  return holdMap;
}

// ── Metrics display ───────────────────────────────────────────────────────────

function MetricsRow({ metrics }: { metrics: Solution['metrics'] }) {
  const ov   = metrics.overstowViolations ?? 0;
  const bal  = metrics.balanceDev ?? 0;
  const cmp  = metrics.compactnessPct ?? 0;
  const placed = metrics.placedPallets ?? 0;
  const total  = metrics.totalPallets ?? 0;
  const pct    = metrics.placedPct ?? 0;

  return (
    <div className={styles.metricsRow}>
      <div className={styles.metricItem}>
        <span className={styles.metricLabel}>Overstow</span>
        <span className={`${styles.metricValue} ${ov === 0 ? styles.metricGreen : styles.metricRed}`}>
          {ov === 0 ? '✓ 0 violations' : `✗ ${ov} violation${ov > 1 ? 's' : ''}`}
        </span>
      </div>
      <div className={styles.metricItem}>
        <span className={styles.metricLabel}>Balance dev</span>
        <span className={`${styles.metricValue} ${bal === 0 ? styles.metricGreen : bal < 100 ? styles.metricYellow : styles.metricRed}`}>
          {bal} pal
        </span>
      </div>
      <div className={styles.metricItem}>
        <span className={styles.metricLabel}>Compactness</span>
        <div className={styles.compactBar}>
          <div className={styles.compactFill} style={{ width: `${Math.min(100, cmp)}%` }} />
        </div>
        <span className={`${styles.metricValue} ${styles.metricNeutral}`}>{cmp.toFixed(1)}%</span>
      </div>
      <div className={styles.metricItem}>
        <span className={styles.metricLabel}>Placed</span>
        <span className={`${styles.metricValue} ${pct >= 100 ? styles.metricGreen : styles.metricYellow}`}>
          {placed}/{total} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className={styles.metricItem}>
        <span className={styles.metricLabel}>Sections used</span>
        <span className={`${styles.metricValue} ${styles.metricNeutral}`}>
          {metrics.sectionsUsed ?? '—'}/{metrics.totalSections ?? '—'}
        </span>
      </div>
    </div>
  );
}

// ── Cargo table ───────────────────────────────────────────────────────────────

function CargoTable({ positions }: { positions: CargoPosition[] }) {
  const holdMap = groupBySection(positions);
  const holds   = Array.from(holdMap.keys()).sort((a, b) => a - b);

  if (positions.length === 0) {
    return <p className={styles.infeasibleBanner}>No cargo positions — solver returned no feasible solution.</p>;
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Shipper</th>
            <th>Consignee</th>
            <th>Route</th>
            <th>Cargo</th>
            <th>Qty</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {holds.map(holdNum => {
            const secMap = holdMap.get(holdNum)!;
            const secs   = Array.from(secMap.keys()).sort();
            return secs.map(secId => {
              const rows = secMap.get(secId)!;
              return [
                <tr key={`${holdNum}-${secId}-hdr`} className={styles.sectionRow}>
                  <td colSpan={6}>Hold {holdNum} · Section {secId}</td>
                </tr>,
                ...rows.map((pos, i) => {
                  const podColor = getPodColor(pos.podPortCode);
                  return (
                    <tr key={`${holdNum}-${secId}-${i}`}>
                      <td>{pos.shipperName || '—'}</td>
                      <td>{pos.consigneeName || '—'}</td>
                      <td className={styles.routeCell}>
                        {pos.polPortCode}
                        <span style={{ margin: '0 4px', color: 'var(--color-text-muted)' }}>→</span>
                        <span className={styles.podCell} style={{ background: podColor }}>
                          {pos.podPortCode}
                        </span>
                      </td>
                      <td>{pos.cargoType.replace(/_/g, ' ')}</td>
                      <td className={styles.qtyCell}>{pos.quantity}</td>
                      <td>
                        <span className={`${styles.badge} ${
                          pos.confidence === 'CONFIRMED' ? styles.badgeConfirmed : styles.badgeEstimated
                        }`}>
                          {pos.confidence}
                        </span>
                      </td>
                    </tr>
                  );
                }),
              ];
            });
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OptimizePage() {
  const router = useRouter();

  const [phase, setPhase]         = useState<Phase>('idle');
  const [voyages, setVoyages]     = useState<Voyage[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [voyageNumber, setVoyageNumber] = useState('');
  const [vesselName, setVesselName]     = useState('');
  const [errorMsg, setErrorMsg]   = useState('');
  const [healthOk, setHealthOk]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState('');

  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef   = useRef<AbortController | null>(null);

  // Load voyages on mount
  useEffect(() => {
    getVoyagesForPlanWizard().then(res => {
      if (res.success && res.data) {
        setVoyages(res.data as Voyage[]);
        if (res.data.length > 0) setSelectedId((res.data[0] as Voyage)._id);
      }
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    abortRef.current?.abort();
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const runOptimizer = useCallback(async () => {
    if (!selectedId) return;
    setPhase('loading');
    setHealthOk(false);
    setSaveError('');

    abortRef.current = new AbortController();

    // Poll /health every 2 s while waiting
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${ENGINE_URL}/health`);
        setHealthOk(r.ok);
      } catch {
        setHealthOk(false);
      }
    }, 2000);

    try {
      const res = await fetch(`${ENGINE_URL}/optimize`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ voyageId: selectedId }),
        signal:  abortRef.current.signal,
      });

      stopPolling();

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }

      const result = await res.json();
      setSolutions(result.solutions ?? []);
      setVoyageNumber(result.voyageNumber ?? '');
      setVesselName(result.vesselName ?? '');
      setCurrentIdx(0);
      setPhase('results');
    } catch (err: unknown) {
      stopPolling();
      if ((err as Error).name === 'AbortError') return;
      const isNetwork = err instanceof TypeError;
      setErrorMsg(
        isNetwork
          ? 'Python optimizer service not running. Start it with:\n  cd stowage-optimizer && uvicorn api:app --port 8001'
          : (err as Error).message,
      );
      setPhase('error');
    }
  }, [selectedId, stopPolling]);

  const handleSave = useCallback(async () => {
    const sol = solutions[currentIdx];
    if (!sol || saving) return;
    setSaving(true);
    setSaveError('');
    const result = await savePythonPlan(selectedId, {
      solutionIndex:  sol.solutionIndex,
      label:          sol.label,
      metrics:        sol.metrics as Record<string, number>,
      cargoPositions: sol.cargoPositions,
    });
    setSaving(false);
    if (result.success && result.planId) {
      router.push(`/stowage-plans/${result.planId}`);
    } else {
      setSaveError(result.error ?? 'Failed to save plan');
    }
  }, [solutions, currentIdx, selectedId, saving, router]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const currentSol = solutions[currentIdx];

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>🔬 Advanced Optimize</h1>
          <p className={styles.pageSubtitle}>
            OR-Tools CP-SAT solver · 5 alternative plans · up to 2–3 min
          </p>
        </div>

        {/* Voyage selector — always visible */}
        {phase !== 'results' && (
          <div className={styles.selectorCard}>
            <div>
              <label className={styles.label}>Select voyage</label>
              <select
                className={`${styles.select} ${phase === 'loading' ? styles.selectDisabled : ''}`}
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                disabled={phase === 'loading'}
              >
                {voyages.length === 0 && <option value="">Loading…</option>}
                {voyages.map(v => {
                  const vessel = (v.vesselId as any)?.name ?? v.vesselName ?? '—';
                  const dep    = fmtDate(v.departureDate);
                  return (
                    <option key={v._id} value={v._id}>
                      {v.voyageNumber} · {vessel}{dep ? ` · ${dep}` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <p className={styles.hint}>
              Runs all 5 objective configurations (Balanced, Max Balance, Max Compactness,
              POD-Friendly, Max Utilization) with a 30 s solver limit each.
            </p>
            <button
              className={styles.runBtn}
              onClick={runOptimizer}
              disabled={!selectedId || phase === 'loading'}
            >
              {phase === 'loading' ? 'Running…' : 'Run Optimizer'}
            </button>
          </div>
        )}

        {/* Loading */}
        {phase === 'loading' && (
          <div className={styles.loadingCard}>
            <div className={styles.spinner} />
            <p className={styles.loadingTitle}>Running OR-Tools optimizer — generating 5 alternative plans…</p>
            <p className={styles.loadingSubtitle}>This may take up to 2–3 minutes</p>
            <span className={`${styles.healthBadge} ${healthOk ? styles.healthOk : styles.healthChecking}`}>
              {healthOk ? '● Service responding' : '○ Connecting to service…'}
            </span>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className={styles.errorCard}>
            <p className={styles.errorTitle}>Optimizer error</p>
            {errorMsg.includes('uvicorn') ? (
              <>
                <p className={styles.errorMsg}>Python optimizer service not running.</p>
                <pre className={styles.errorCmd}>cd stowage-optimizer{'\n'}venv\Scripts\activate{'\n'}uvicorn api:app --port 8001</pre>
              </>
            ) : (
              <p className={styles.errorMsg}>{errorMsg}</p>
            )}
            <button className={styles.retryBtn} onClick={() => setPhase('idle')}>← Back</button>
          </div>
        )}

        {/* Carousel */}
        {phase === 'results' && solutions.length > 0 && currentSol && (
          <div className={styles.carouselCard}>
            {/* Header */}
            <div className={styles.carouselHeader}>
              <div className={styles.carouselTitle}>
                <span className={styles.solutionLabel}>{currentSol.label}</span>
                <span className={styles.solutionIndex}>
                  Solution {currentSol.solutionIndex} / {solutions.length}
                  &nbsp;·&nbsp;{voyageNumber}&nbsp;·&nbsp;{vesselName}
                  &nbsp;·&nbsp;{currentSol.status}
                </span>
              </div>
              <div className={styles.carouselNav}>
                <button
                  className={styles.navBtn}
                  onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                  disabled={currentIdx === 0}
                >
                  ← Prev
                </button>
                <div className={styles.navDots}>
                  {solutions.map((_, i) => (
                    <div
                      key={i}
                      className={`${styles.dot} ${i === currentIdx ? styles.dotActive : ''}`}
                    />
                  ))}
                </div>
                <button
                  className={styles.navBtn}
                  onClick={() => setCurrentIdx(i => Math.min(solutions.length - 1, i + 1))}
                  disabled={currentIdx === solutions.length - 1}
                >
                  Next →
                </button>
              </div>
            </div>

            {/* Metrics */}
            {Object.keys(currentSol.metrics).length > 0
              ? <MetricsRow metrics={currentSol.metrics} />
              : <p className={styles.infeasibleBanner}>This configuration was INFEASIBLE — no solution found.</p>
            }

            {/* Cargo table */}
            <CargoTable positions={currentSol.cargoPositions} />

            {/* Footer actions */}
            <div className={styles.carouselFooter}>
              {saveError && <span className={styles.saveStatus} style={{ color: 'var(--color-danger)' }}>{saveError}</span>}
              <button className={styles.discardBtn} onClick={() => setPhase('idle')}>
                ← New search
              </button>
              <button
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={saving || !currentSol.cargoPositions.length}
              >
                {saving ? 'Saving…' : 'Save this Plan'}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
