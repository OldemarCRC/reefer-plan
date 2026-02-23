// components/stowage/CoolingSectionTopDown.tsx
// Bird's eye / top-down view of a single cooling section floor.
//
// TWO interaction modes (no library, pure mouse events):
//
//   PAINT mode — requires a booking to be selected in the plan:
//     • Drag across empty cells  → assign selected booking
//     • Drag across own cells    → erase (clear) them
//
//   MOVE/SWAP mode — works even with no booking selected:
//     • Mousedown on another booking's cell → "pick it up"
//     • Drag to an empty cell              → pallet moves there
//     • Drag to a different booking's cell → pallets swap
//     • Drag back to source or release outside → cancel
//
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
  /** All voyage bookings; quantity = pallets already in this section (0 if none) */
  slots: SectionBookingSlot[];
  /** Booking currently selected in the plan editor (for paint mode) */
  selectedBookingId: string;
  isLocked: boolean;
  onSlotsChange: (newSlots: SectionBookingSlot[]) => void;
  onClose: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CELL = 18;   // SVG units per pallet cell
const GAP  = 1;
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

  // ── Grid dimensions ──────────────────────────────────────────────────────────
  const isUPD = sectionId.toUpperCase().includes('UPD');
  const aspectRatio = isUPD ? 4 : 1.5;
  const cols = Math.min(capacity, Math.round(Math.sqrt(capacity * aspectRatio)));
  const rows = Math.ceil(capacity / cols);
  const SVG_W = cols * STEP + 2;
  const SVG_H = rows * STEP + 2;

  // ── Cell-array helpers ───────────────────────────────────────────────────────

  /** Flat array: index = pallet position, value = bookingId ('') = empty */
  const buildCells = (s: SectionBookingSlot[]): string[] => {
    const c: string[] = new Array(capacity).fill('');
    let off = 0;
    for (const slot of s) {
      for (let i = 0; i < slot.quantity && off < capacity; i++) c[off++] = slot.bookingId;
    }
    return c;
  };

  /** Recompute quantities from a painted / mutated cell array. */
  const cellsToSlots = (c: string[]): SectionBookingSlot[] => {
    const counts: Record<string, number> = {};
    for (const bid of c) if (bid) counts[bid] = (counts[bid] ?? 0) + 1;
    return slots.map(s => ({ ...s, quantity: counts[s.bookingId] ?? 0 }));
  };

  // ── Interaction refs (updated on every event, no re-render cost) ─────────────

  const svgRef = useRef<SVGSVGElement>(null);

  // Current drag type  ('paint' | 'move' | null)
  const dragTypeRef   = useRef<'paint' | 'move' | null>(null);
  // Paint sub-mode
  const paintModeRef  = useRef<'assign' | 'clear'>('assign');
  // Move source
  const moveSrcRef    = useRef<{ idx: number; bid: string } | null>(null);
  // Cell index currently under the cursor (updated on every mousemove)
  const hoverIdxRef   = useRef<number>(-1);
  // Working cell array during drag (avoids touching parent state on every move)
  const workCells     = useRef<string[]>(buildCells(slots));

  // Increment to force a re-render for visual feedback
  const [tick, setTick] = useState(0);
  const redraw = () => setTick(t => t + 1);

  // Sync workCells from props when not mid-gesture
  if (dragTypeRef.current === null) {
    workCells.current = buildCells(slots);
  }
  const cells = workCells.current;

  // ── Hit testing ──────────────────────────────────────────────────────────────

  const clientToCell = (clientX: number, clientY: number): number => {
    const svg = svgRef.current;
    if (!svg) return -1;
    const r = svg.getBoundingClientRect();
    const col = Math.floor(((clientX - r.left) * (SVG_W / r.width))  / STEP);
    const row = Math.floor(((clientY - r.top)  * (SVG_H / r.height)) / STEP);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return -1;
    const idx = row * cols + col;
    return idx < capacity ? idx : -1;
  };

  // ── Mouse handlers ───────────────────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isLocked) return;
    e.preventDefault();
    const idx = clientToCell(e.clientX, e.clientY);
    if (idx < 0) return;

    workCells.current = buildCells(slots);   // fresh snapshot
    const currentBid = cells[idx];

    // ── Decide mode ──────────────────────────────────────────────────────────
    if (currentBid && currentBid !== selectedBookingId) {
      // Occupied cell that belongs to a DIFFERENT booking → MOVE/SWAP mode
      dragTypeRef.current = 'move';
      moveSrcRef.current  = { idx, bid: currentBid };
      hoverIdxRef.current  = idx;
    } else if (selectedBookingId) {
      // Empty cell, or selected booking's own cell → PAINT mode
      dragTypeRef.current = 'paint';
      paintModeRef.current = currentBid === selectedBookingId ? 'clear' : 'assign';
      applyPaint(idx);
    } else {
      return;   // nothing to do
    }

    redraw();
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const idx = clientToCell(e.clientX, e.clientY);

    if (dragTypeRef.current === null) {
      // No active gesture — just update hover for cursor/highlight feedback
      if (hoverIdxRef.current !== idx) {
        hoverIdxRef.current = idx;
        redraw();
      }
      return;
    }

    if (dragTypeRef.current === 'move') {
      if (hoverIdxRef.current !== idx) {
        hoverIdxRef.current = idx;
        redraw();
      }
    } else {
      // Paint — apply to every new cell entered
      applyPaint(idx);
      redraw();
    }
  };

  const commit = (e?: React.MouseEvent<SVGSVGElement>) => {
    if (dragTypeRef.current === null) return;

    if (dragTypeRef.current === 'move' && moveSrcRef.current) {
      const destIdx  = e ? clientToCell(e.clientX, e.clientY) : hoverIdxRef.current;
      const { idx: srcIdx, bid: srcBid } = moveSrcRef.current;

      if (destIdx >= 0 && destIdx !== srcIdx) {
        const newCells = [...workCells.current];
        const destBid  = newCells[destIdx];
        newCells[destIdx] = srcBid;    // pallet lands here
        newCells[srcIdx]  = destBid;   // swap ('' if destination was empty)
        onSlotsChange(cellsToSlots(newCells));
      }
      // else: cancel (dropped on source or outside the grid)
      moveSrcRef.current = null;

    } else if (dragTypeRef.current === 'paint') {
      onSlotsChange(cellsToSlots(workCells.current));
    }

    dragTypeRef.current = null;
    redraw();
  };

  // ── Paint helper ─────────────────────────────────────────────────────────────

  const applyPaint = (idx: number) => {
    if (idx < 0 || idx >= capacity) return;
    workCells.current[idx] = paintModeRef.current === 'assign' ? selectedBookingId : '';
  };

  // ── Display-state helpers ─────────────────────────────────────────────────────

  const isSource     = (idx: number) => dragTypeRef.current === 'move' && moveSrcRef.current?.idx === idx;
  const isDropTarget = (idx: number) => (
    dragTypeRef.current === 'move' &&
    hoverIdxRef.current === idx &&
    hoverIdxRef.current !== moveSrcRef.current?.idx
  );
  const isHoverGrab  = (idx: number) => (
    dragTypeRef.current === null &&
    hoverIdxRef.current === idx &&
    !!cells[idx] &&
    cells[idx] !== selectedBookingId
  );

  const getCursor = (): string => {
    if (isLocked) return 'default';
    if (dragTypeRef.current === 'move')  return 'grabbing';
    if (dragTypeRef.current === 'paint') return 'crosshair';
    // Idle — what's under cursor?
    const hi = hoverIdxRef.current;
    if (hi >= 0) {
      if (cells[hi] && cells[hi] !== selectedBookingId) return 'grab';
    }
    return selectedBookingId ? 'crosshair' : 'default';
  };

  // ── Derived values ────────────────────────────────────────────────────────────

  const loaded   = slots.reduce((s, a) => s + a.quantity, 0);
  const fillPct  = capacity > 0 ? Math.min(100, (loaded / capacity) * 100) : 0;
  const colorMap = Object.fromEntries(slots.map(s => [s.bookingId, s.color]));

  // ── Instruction text ─────────────────────────────────────────────────────────

  const hint = isLocked
    ? 'Plan is locked — read-only view.'
    : !selectedBookingId
    ? 'Select a booking to paint positions. Drag any occupied cell to move or swap it.'
    : 'Click/drag empty cells to assign · Click/drag own cells to erase · Drag other cells to move/swap.';

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.wrap}>

      {/* Header */}
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
            <div className={styles.fillBarFill} style={{ width: `${fillPct}%`, background: zoneColor }} />
          </div>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.viewLabel}>Top-down · {cols}×{rows}</span>
          <button className={styles.closeBtn} onClick={onClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Hint bar */}
      <p className={styles.hint}>{hint}</p>

      {/* SVG grid */}
      <div className={styles.svgWrap}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className={styles.svg}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={commit}
          onMouseLeave={commit}
          style={{ cursor: getCursor() }}
          role="img"
          aria-label={`Pallet grid for cooling section ${sectionId} — ${loaded}/${capacity} pallets`}
        >
          {/* Hidden title for screen readers + React key for tick */}
          <title>{`${sectionId} – tick ${tick}`}</title>

          {Array.from({ length: capacity }, (_, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const bid   = cells[idx];
            const color = bid ? (colorMap[bid] ?? '#64748b') : null;
            const isMine   = bid === selectedBookingId;
            const isSrc    = isSource(idx);
            const isDrop   = isDropTarget(idx);
            const isGrab   = isHoverGrab(idx);

            // Visual state overrides
            let fill        = color ?? '#0f172a';
            let fillOpacity = color ? (isMine ? 0.9 : 0.5) : 0.15;
            let stroke      = isMine ? '#ffffff' : color ? color : '#334155';
            let strokeW     = isMine ? 1.5 : 0.5;
            let strokeOpacity = color ? (isMine ? 0.85 : 0.35) : 0.35;
            let strokeDash  = 'none';

            if (isSrc) {
              // "Picked up" — ghost (dim + dashed)
              fillOpacity   = 0.2;
              stroke        = '#ffffff';
              strokeW       = 1.5;
              strokeDash    = '3,2';
              strokeOpacity = 0.5;
            } else if (isDrop) {
              // Drop target — bright ring
              stroke        = '#ffffff';
              strokeW       = 2;
              strokeOpacity = 1;
              fillOpacity   = color ? 0.65 : 0.3;
            } else if (isGrab) {
              // Hoverable (can pick up) — subtle glow
              stroke        = color ?? '#64748b';
              strokeW       = 1.5;
              strokeOpacity = 0.75;
              fillOpacity   = color ? 0.7 : 0.15;
            }

            return (
              <rect
                key={idx}
                x={col * STEP + 1}
                y={row * STEP + 1}
                width={CELL}
                height={CELL}
                rx={2}
                fill={fill}
                fillOpacity={fillOpacity}
                stroke={stroke}
                strokeWidth={strokeW}
                strokeOpacity={strokeOpacity}
                strokeDasharray={strokeDash}
              />
            );
          })}

          {/* Move-drag ghost: solid dot follows cursor to show what's being moved */}
          {dragTypeRef.current === 'move' && moveSrcRef.current && hoverIdxRef.current >= 0 && (
            (() => {
              const hi  = hoverIdxRef.current;
              const src = moveSrcRef.current!;
              const destBid = cells[hi] !== undefined ? cells[hi] : '';
              const col = hi % cols;
              const row = Math.floor(hi / cols);
              const cx  = col * STEP + 1 + CELL / 2;
              const cy  = row * STEP + 1 + CELL / 2;
              const srcColor = colorMap[src.bid] ?? '#64748b';
              return (
                <g>
                  {/* Arrow from source to destination */}
                  {hi !== src.idx && (() => {
                    const sc = src.idx % cols;
                    const sr = Math.floor(src.idx / cols);
                    const sx = sc * STEP + 1 + CELL / 2;
                    const sy = sr * STEP + 1 + CELL / 2;
                    return (
                      <line
                        x1={sx} y1={sy} x2={cx} y2={cy}
                        stroke="#ffffff"
                        strokeWidth={1}
                        strokeOpacity={0.3}
                        strokeDasharray="3,3"
                        markerEnd="url(#arrowhead)"
                        pointerEvents="none"
                      />
                    );
                  })()}
                  {/* Floating ghost circle on destination */}
                  <circle
                    cx={cx} cy={cy} r={CELL / 2 - 1}
                    fill={srcColor}
                    fillOpacity={0.7}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    pointerEvents="none"
                  />
                  {/* Swap indicator when dropping on occupied cell */}
                  {destBid && destBid !== src.bid && (
                    <text
                      x={cx} y={cy + 1}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={8} fill="#ffffff" fillOpacity={0.9}
                      pointerEvents="none"
                    >
                      ⇄
                    </text>
                  )}
                </g>
              );
            })()
          )}

          <defs>
            <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 Z" fill="white" opacity={0.4} />
            </marker>
          </defs>
        </svg>
      </div>

      {/* Legend */}
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
