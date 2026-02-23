// components/stowage/CoolingSectionTopDown.tsx
// Bird's eye / top-down view of a single cooling section floor.
// Shows a grid of individual pallet positions, colour-coded by cargo/booking.
// Click or drag to paint the selected booking onto positions (or clear them).
'use client';

import { useRef, useState } from 'react';
import styles from './CoolingSectionTopDown.module.css';

// ── Public types ──────────────────────────────────────────────────────────────

export interface SectionBookingSlot {
  bookingId: string;
  bookingNumber: string;
  cargoType: string;
  /** Pallets currently assigned to this section for this booking */
  quantity: number;
  /** Hex colour for this booking/cargo type */
  color: string;
}

interface Props {
  sectionId: string;
  capacity: number;      // total pallet positions in this section
  temperature: number;   // assigned °C
  zoneColor: string;     // colour swatch for the temperature zone
  /** All bookings for the voyage, each with the quantity already in this section (0 if none) */
  slots: SectionBookingSlot[];
  /** Booking currently selected in the plan editor (for painting) */
  selectedBookingId: string;
  isLocked: boolean;
  onSlotsChange: (newSlots: SectionBookingSlot[]) => void;
  onClose: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CELL = 18;   // px per pallet cell (SVG units)
const GAP  = 1;    // gap between cells
const STEP = CELL + GAP;

// ── Component ─────────────────────────────────────────────────────────────────

export default function CoolingSectionTopDown({
  sectionId,
  capacity,
  temperature,
  zoneColor,
  slots,
  selectedBookingId,
  isLocked,
  onSlotsChange,
  onClose,
}: Props) {
  // ── Grid dimensions ─────────────────────────────────────────────────────────
  // UPD sections are narrower/longer; lower holds are roughly 1.5:1 (W:H)
  const isUPD = sectionId.toUpperCase().includes('UPD');
  const aspectRatio = isUPD ? 4 : 1.5;
  const cols = Math.min(capacity, Math.round(Math.sqrt(capacity * aspectRatio)));
  const rows = Math.ceil(capacity / cols);
  const SVG_W = cols * STEP + 2;
  const SVG_H = rows * STEP + 2;

  // ── Cell array helpers ───────────────────────────────────────────────────────
  /** Build a flat array of bookingIds from slot quantities (deterministic order). */
  const buildCells = (s: SectionBookingSlot[]): string[] => {
    const c: string[] = new Array(capacity).fill('');
    let off = 0;
    for (const slot of s) {
      for (let i = 0; i < slot.quantity && off < capacity; i++) c[off++] = slot.bookingId;
    }
    return c;
  };

  /** Recompute slot quantities from a painted cell array. */
  const cellsToSlots = (c: string[]): SectionBookingSlot[] => {
    const counts: Record<string, number> = {};
    for (const bid of c) if (bid) counts[bid] = (counts[bid] ?? 0) + 1;
    return slots.map(s => ({ ...s, quantity: counts[s.bookingId] ?? 0 }));
  };

  // ── Drag / paint state ───────────────────────────────────────────────────────
  // workCells holds the in-progress painted state during a drag.
  // We use a ref (not useState) to avoid React re-render on every mouse move.
  // A lightweight integer tick triggers re-renders for visual feedback.
  const svgRef         = useRef<SVGSVGElement>(null);
  const isDraggingRef  = useRef(false);
  const paintModeRef   = useRef<'assign' | 'clear'>('assign');
  const workCells      = useRef<string[]>(buildCells(slots));
  const [tick, setTick] = useState(0);

  // Sync workCells from props whenever NOT mid-drag
  if (!isDraggingRef.current) {
    workCells.current = buildCells(slots);
  }
  const cells = workCells.current;

  // ── Hit testing ──────────────────────────────────────────────────────────────
  const clientToCell = (clientX: number, clientY: number): number => {
    const svg = svgRef.current;
    if (!svg) return -1;
    const rect = svg.getBoundingClientRect();
    const scaleX = SVG_W / rect.width;
    const scaleY = SVG_H / rect.height;
    const col = Math.floor(((clientX - rect.left) * scaleX) / STEP);
    const row = Math.floor(((clientY - rect.top)  * scaleY) / STEP);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return -1;
    const idx = row * cols + col;
    return idx < capacity ? idx : -1;
  };

  // ── Paint helpers ────────────────────────────────────────────────────────────
  const paintAt = (idx: number) => {
    if (idx < 0 || idx >= capacity) return;
    if (paintModeRef.current === 'assign' && selectedBookingId) {
      workCells.current[idx] = selectedBookingId;
    } else {
      workCells.current[idx] = '';
    }
  };

  // ── Mouse event handlers ──────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isLocked || !selectedBookingId) return;
    e.preventDefault();
    const idx = clientToCell(e.clientX, e.clientY);
    if (idx < 0) return;

    // Fresh copy from current slot state
    workCells.current = buildCells(slots);

    // Determine mode: clicking on own cell = erase, else = assign
    paintModeRef.current = cells[idx] === selectedBookingId ? 'clear' : 'assign';
    paintAt(idx);
    isDraggingRef.current = true;
    setTick(t => t + 1);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDraggingRef.current) return;
    const idx = clientToCell(e.clientX, e.clientY);
    paintAt(idx);
    setTick(t => t + 1);
  };

  const commit = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    onSlotsChange(cellsToSlots(workCells.current));
  };

  // ── Derived display values ────────────────────────────────────────────────────
  const loaded  = slots.reduce((s, a) => s + a.quantity, 0);
  const fillPct = capacity > 0 ? Math.min(100, (loaded / capacity) * 100) : 0;
  const colorMap: Record<string, string> = Object.fromEntries(slots.map(s => [s.bookingId, s.color]));

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.wrap}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.sectionTag}>{sectionId}</span>
          <span
            className={styles.tempTag}
            style={{ background: `${zoneColor}22`, color: zoneColor, borderColor: `${zoneColor}44` }}
          >
            {temperature > 0 ? '+' : ''}{temperature}°C
          </span>
          <span className={styles.palletCount}>{loaded} / {capacity} pallets</span>
          <div className={styles.fillBar}>
            <div
              className={styles.fillBarFill}
              style={{ width: `${fillPct}%`, background: zoneColor }}
            />
          </div>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.viewLabel}>Top-down view · Floor {cols}×{rows}</span>
          <button className={styles.closeBtn} onClick={onClose} title="Close detail view">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Hint ───────────────────────────────────────────────────────────── */}
      {!selectedBookingId && !isLocked && (
        <p className={styles.hint}>
          Select a booking above, then click or drag cells to assign pallet positions.
        </p>
      )}
      {isLocked && (
        <p className={styles.hint}>Plan is locked — read-only view.</p>
      )}

      {/* ── SVG grid ───────────────────────────────────────────────────────── */}
      <div className={styles.svgWrap}>
        {/* Row/col labels */}
        <div className={styles.colLabels}>
          {Array.from({ length: Math.min(cols, 8) }, (_, i) => (
            <span key={i} className={styles.colLabel}
              style={{ left: `${(i * STEP * (100 / SVG_W))}%` }}
            >{i + 1}</span>
          ))}
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className={styles.svg}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={commit}
          onMouseLeave={commit}
          style={{
            cursor: isLocked ? 'default'
              : selectedBookingId ? 'crosshair'
              : 'not-allowed',
          }}
          role="img"
          aria-label={`Pallet grid for cooling section ${sectionId}`}
        >
          {/* Suppress the 'tick is referenced in the closure' lint — we need the re-render */}
          <title>{`${sectionId} — ${loaded}/${capacity} pallets — tick:${tick}`}</title>

          {Array.from({ length: capacity }, (_, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const bid   = cells[idx];
            const color = bid ? (colorMap[bid] ?? '#64748b') : null;
            const isMine = bid === selectedBookingId;
            return (
              <rect
                key={idx}
                x={col * STEP + 1}
                y={row * STEP + 1}
                width={CELL}
                height={CELL}
                rx={2}
                fill={color ?? '#0f172a'}
                fillOpacity={color ? (isMine ? 0.9 : 0.5) : 0.15}
                stroke={isMine ? '#ffffff' : color ? color : '#334155'}
                strokeWidth={isMine ? 1.5 : 0.5}
                strokeOpacity={color ? (isMine ? 0.85 : 0.35) : 0.35}
              />
            );
          })}
        </svg>
      </div>

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <div className={styles.legend}>
        {slots.filter(s => s.quantity > 0).map(s => (
          <div
            key={s.bookingId}
            className={`${styles.legendItem} ${s.bookingId === selectedBookingId ? styles.legendActive : ''}`}
          >
            <span className={styles.legendDot} style={{ background: s.color }} />
            <span className={styles.legendNum}>{s.bookingNumber}</span>
            <span className={styles.legendType}>{s.cargoType.replace(/_/g, ' ')}</span>
            <span className={styles.legendQty}>{s.quantity} plt</span>
          </div>
        ))}
        {loaded < capacity && (
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#334155' }} />
            <span className={styles.legendNum}>Empty</span>
            <span className={styles.legendQty}>{capacity - loaded} plt</span>
          </div>
        )}
        {loaded > capacity && (
          <div className={`${styles.legendItem} ${styles.legendOver}`}>
            <span className={styles.legendNum}>Over capacity by {loaded - capacity}</span>
          </div>
        )}
      </div>
    </div>
  );
}
