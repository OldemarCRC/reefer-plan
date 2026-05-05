'use client';

import { useState } from 'react';
import styles from './VesselProfile.module.css';
import {
  voyageTempAssignments as defaultAssignments,
  compartmentLayouts,
  LEVEL_DISPLAY_ORDER,
  type VoyageTempAssignment,
  type VesselLayout,
} from '@/lib/vessel-profile-data';

// ============================================================================
// LAYOUT CONSTANTS
// Longitudinal cross-section: BOW (left) → STERN (right)
// Levels: DECK/UPD (top) → D/E (bottom)
// ============================================================================

const SVG_W = 960;
const SVG_H = 500;
const MARGIN = { top: 60, right: 30, bottom: 50, left: 30 };

// Hull shape
const HULL_Y_TOP = MARGIN.top;           // Main deck line
const HULL_Y_BOTTOM = SVG_H - MARGIN.bottom; // Keel line
const HULL_X_BOW = MARGIN.left + 20;
const HULL_X_STERN = SVG_W - MARGIN.right;
const HULL_BOW_TIP = MARGIN.left;        // Bow point

// Hold positions
const HOLD_GAP = 8;           // Gap between holds (bulkheads)
const CARGO_AREA_X = HULL_X_BOW + 25;  // Start of cargo area
const CARGO_AREA_W = 820;     // Total width for cargo holds (~85% of SVG_W)
const SUPERSTRUCTURE_X = HULL_X_STERN - 110; // Bridge/superstructure

// Height budget for all levels in a hold (px)
const HOLD_HEIGHT_BUDGET = 340;
const MIN_LEVEL_H = 60;  // minimum height per level for readability

// Cell data-overlay layout constants
const CELL_HEADER_H = 16;    // top strip: capacity / loaded / available
const CELL_FOOTER_H = 15;    // bottom strip: factors / POL / temp
const CELL_FULL_THRESHOLD = 56;    // show header + footer when cell h >= this
const CELL_COMPACT_THRESHOLD = 34; // show header only when cell h >= this

// Temperature zone double-line indicators
const ZONE_LINE_THICKNESS = 3;

// ============================================================================
// FALLBACK: build default VesselLayout from hardcoded ACONCAGUA BAY data
// ============================================================================

function buildDefaultLayout(): VesselLayout {
  const holdMap = new Map<number, { sectionId: string; sqm: number }[]>();
  for (const c of compartmentLayouts) {
    if (!holdMap.has(c.holdNumber)) holdMap.set(c.holdNumber, []);
    // Use pallets as a proxy for sqm when real sqm isn't embedded in CompartmentLayout
    holdMap.get(c.holdNumber)!.push({ sectionId: c.id, sqm: c.pallets });
  }
  return {
    holds: [...holdMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([holdNumber, levels]) => ({
        holdNumber,
        levels: levels.sort((a, b) => {
          const la = a.sectionId.slice(1);
          const lb = b.sectionId.slice(1);
          const ia = LEVEL_DISPLAY_ORDER.indexOf(la);
          const ib = LEVEL_DISPLAY_ORDER.indexOf(lb);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        }),
      })),
  };
}

// ============================================================================
// DYNAMIC LAYOUT COMPUTATION
// ============================================================================

function computeHoldPositions(layout: VesselLayout): { x: number; w: number; holdNumber: number }[] {
  const n = layout.holds.length;
  const totalGaps = (n - 1) * HOLD_GAP;
  const holdW = (CARGO_AREA_W - totalGaps) / n;  // all holds equal width

  const positions: { x: number; w: number; holdNumber: number }[] = [];
  let x = CARGO_AREA_X;
  for (let i = 0; i < n; i++) {
    positions.push({ x, w: holdW, holdNumber: layout.holds[i].holdNumber });
    x += holdW + HOLD_GAP;
  }
  return positions;
}

// ============================================================================
// COMPARTMENT RECTS
// ============================================================================

interface CompartmentRect {
  id: string;
  holdNumber: number;
  level: string;
  x: number;
  y: number;
  w: number;
  h: number;
  zoneId?: string;           // from VesselHoldLevel (used for editable temp mode)
  assignment?: VoyageTempAssignment;
}

function buildCompartmentRects(
  layout: VesselLayout,
  holdPositions: { x: number; w: number; holdNumber: number }[],
  assignments: VoyageTempAssignment[],
): CompartmentRect[] {
  const rects: CompartmentRect[] = [];
  const assignMap = new Map(assignments.map((a) => [a.compartmentId, a]));

  // FC/UPD are "special" levels: narrower and shorter than normal levels.
  // FC: 60% hold width, centered — only in Hold 1 (T4A/T4B)
  // UPD: 50% hold width, centered — only in Holds 2+ (T1)
  const SPECIAL_LEVELS = new Set(['FC', 'UPD']);
  const SPECIAL_HEIGHT_RATIO = 0.6;
  const FC_WIDTH_RATIO = 0.6;
  const UPD_WIDTH_RATIO = 0.5;

  for (const hold of layout.holds) {
    const pos = holdPositions.find(p => p.holdNumber === hold.holdNumber);
    if (!pos) continue;

    const levels = hold.levels; // already sorted top-to-bottom by LEVEL_DISPLAY_ORDER
    const nSpecial = levels.filter(l => SPECIAL_LEVELS.has(l.sectionId.slice(1))).length;
    const nNormal = levels.length - nSpecial;
    const gaps = (levels.length - 1) * 1;
    const budget = HOLD_HEIGHT_BUDGET - gaps;
    // Solve: normalH * (nNormal + nSpecial * SPECIAL_HEIGHT_RATIO) = budget
    const normalH = budget / (nNormal + nSpecial * SPECIAL_HEIGHT_RATIO);
    const specialH = normalH * SPECIAL_HEIGHT_RATIO;

    let y = HULL_Y_TOP + 4;

    for (const section of levels) {
      const level = section.sectionId.slice(1); // "A", "B", "UPD", "FC", "E", etc.
      const isFC = level === 'FC';
      const isUPD = level === 'UPD';
      const h = (isFC || isUPD) ? specialH : normalH;
      const w = isFC ? pos.w * FC_WIDTH_RATIO
              : isUPD ? pos.w * UPD_WIDTH_RATIO
              : pos.w;
      const xPos = (isFC || isUPD) ? pos.x + (pos.w - w) / 2 : pos.x;

      rects.push({
        id: section.sectionId,
        holdNumber: hold.holdNumber,
        level,
        x: xPos,
        y,
        w,
        h,
        zoneId: section.zoneId,
        assignment: assignMap.get(section.sectionId),
      });

      y += h + 1;
    }
  }

  return rects;
}

// ============================================================================
// COMPONENT
// ============================================================================

interface VesselProfileProps {
  vesselName?: string;
  voyageNumber?: string;
  onCompartmentClick?: (compartmentId: string) => void;
  tempAssignments?: VoyageTempAssignment[];
  vesselLayout?: VesselLayout;
  conflictCompartmentIds?: string[];
  highlightedCompartmentIds?: string[];
  /** When provided, makes the temperature slot in each cell footer an editable number input */
  editableZoneTemps?: Record<string, number>;
  /** Called when user changes a zone temperature; all cells in the same zone sync automatically */
  onZoneTempChange?: (zoneId: string, temp: number) => void;
  /** When false, the hover/click detail panel is not rendered. Defaults to true. */
  showCompartmentTooltip?: boolean;
  /** Consignee names keyed by section ID — shown in the click panel. Not passed from vessels/[id]. */
  consigneesBySection?: Record<string, string[]>;
}

export default function VesselProfile({
  vesselName = 'ACONCAGUA BAY',
  voyageNumber = 'ACON-062026',
  onCompartmentClick,
  tempAssignments = defaultAssignments,
  vesselLayout,
  conflictCompartmentIds,
  highlightedCompartmentIds,
  editableZoneTemps,
  onZoneTempChange,
  showCompartmentTooltip = true,
  consigneesBySection,
}: VesselProfileProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [factorMode, setFactorMode] = useState<'design' | 'historical'>('design');
  // Editable-temp mode: local in-progress strings, focused zone, flash set
  const [localTempStrings, setLocalTempStrings] = useState<Record<string, string>>({});
  const [focusedZoneId, setFocusedZoneId] = useState<string | null>(null);
  const [flashingZoneIds, setFlashingZoneIds] = useState<Record<string, boolean>>({});

  function triggerFlash(zoneId: string) {
    setFlashingZoneIds(prev => ({ ...prev, [zoneId]: true }));
    setTimeout(() => {
      setFlashingZoneIds(prev => {
        const next = { ...prev };
        delete next[zoneId];
        return next;
      });
    }, 200);
  }

  // Show the factor toggle only when at least one compartment has a historical factor
  const hasHistorical = tempAssignments.some(a => a.historicalStowageFactor != null);

  const layout = vesselLayout ?? buildDefaultLayout();
  const holdPositions = computeHoldPositions(layout);
  const compartments = buildCompartmentRects(layout, holdPositions, tempAssignments);

  const hovered = hoveredId ? compartments.find((c) => c.id === hoveredId) : null;
  const selected = selectedId ? compartments.find((c) => c.id === selectedId) : null;
  const detail = selected || hovered;
  const highlightZone = detail?.assignment?.zoneId || null;

  // Find hold with most levels to use as level-label reference
  const refHoldNumber = [...layout.holds].sort((a, b) => b.levels.length - a.levels.length)[0]?.holdNumber ?? 1;

  return (
    <div className={styles.container}>
      {/* Title bar */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Longitudinal Profile</h2>
          <span className={styles.subtitle}>
            {vesselName} · {voyageNumber}
          </span>
        </div>
        <div className={styles.headerRight}>
          {hasHistorical && (
            <div className={styles.factorToggle}>
              <span className={styles.factorLabel}>Capacity factor:</span>
              <button
                className={factorMode === 'design' ? styles.factorBtnActive : styles.factorBtn}
                onClick={() => setFactorMode('design')}
              >
                Design
              </button>
              <button
                className={factorMode === 'historical' ? styles.factorBtnActive : styles.factorBtn}
                onClick={() => setFactorMode('historical')}
              >
                Historical
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.svgWrap}>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className={styles.svg}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Hatched pattern for ESTIMATED (unconfirmed) cargo fills */}
            <pattern id="hatch-estimated" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5"/>
            </pattern>
            {/* Water pattern */}
            <pattern id="water" x="0" y="0" width="40" height="8" patternUnits="userSpaceOnUse">
              <path d="M0 4 Q5 0 10 4 Q15 8 20 4 Q25 0 30 4 Q35 8 40 4" stroke="#1E3A5F" fill="none" strokeWidth="0.8" opacity="0.3" />
            </pattern>
            {/* Hull gradient */}
            <linearGradient id="hullGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a2a3f" />
              <stop offset="100%" stopColor="#0e1825" />
            </linearGradient>
          </defs>

          {/* Water */}
          <rect x="0" y={SVG_H - 40} width={SVG_W} height="40" fill="url(#water)" />
          <line x1="0" y1={SVG_H - 40} x2={SVG_W} y2={SVG_H - 40} stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,5" opacity="0.5" />

          {/* Hull outline */}
          <path
            d={`
              M ${HULL_BOW_TIP} ${HULL_Y_TOP + 60}
              L ${HULL_X_BOW} ${HULL_Y_TOP}
              L ${HULL_X_STERN} ${HULL_Y_TOP}
              L ${HULL_X_STERN + 5} ${HULL_Y_TOP + 30}
              L ${HULL_X_STERN} ${HULL_Y_BOTTOM - 10}
              Q ${HULL_X_STERN - 10} ${HULL_Y_BOTTOM + 5} ${HULL_X_STERN - 30} ${HULL_Y_BOTTOM}
              L ${HULL_X_BOW + 5} ${HULL_Y_BOTTOM}
              Q ${HULL_X_BOW - 20} ${HULL_Y_BOTTOM - 5} ${HULL_BOW_TIP} ${HULL_Y_TOP + 60}
              Z
            `}
            fill="url(#hullGrad)"
            stroke="#2A4060"
            strokeWidth="1.5"
          />

          {/* Deck line */}
          <line
            x1={HULL_X_BOW}
            y1={HULL_Y_TOP}
            x2={HULL_X_STERN}
            y2={HULL_Y_TOP}
            stroke="#3B5070"
            strokeWidth="2"
          />

          {/* Superstructure / Bridge */}
          <rect
            x={SUPERSTRUCTURE_X}
            y={HULL_Y_TOP - 50}
            width={90}
            height={52}
            rx={3}
            fill="#0D1B2A"
            stroke="#2A4060"
            strokeWidth="1"
          />
          {/* Bridge windows */}
          {[0, 1, 2, 3, 4].map((i) => (
            <rect
              key={`win${i}`}
              x={SUPERSTRUCTURE_X + 8 + i * 16}
              y={HULL_Y_TOP - 44}
              width={10}
              height={6}
              rx={1}
              fill="#1E3A5F"
              stroke="#3B5070"
              strokeWidth="0.5"
            />
          ))}
          {/* Funnel */}
          <rect
            x={SUPERSTRUCTURE_X + 55}
            y={HULL_Y_TOP - 70}
            width={18}
            height={22}
            rx={2}
            fill="#1a2a3f"
            stroke="#2A4060"
            strokeWidth="1"
          />

          {/* Mast / Derricks */}
          <line x1={CARGO_AREA_X + 60} y1={HULL_Y_TOP - 30} x2={CARGO_AREA_X + 60} y2={HULL_Y_TOP} stroke="#2A4060" strokeWidth="1.5" />
          <line x1={CARGO_AREA_X + 60} y1={HULL_Y_TOP - 28} x2={CARGO_AREA_X + 100} y2={HULL_Y_TOP - 5} stroke="#2A4060" strokeWidth="0.8" />
          <line x1={CARGO_AREA_X + CARGO_AREA_W / 2} y1={HULL_Y_TOP - 25} x2={CARGO_AREA_X + CARGO_AREA_W / 2} y2={HULL_Y_TOP} stroke="#2A4060" strokeWidth="1.5" />

          {/* Hold labels */}
          {holdPositions.map((h) => (
            <text
              key={`label-h${h.holdNumber}`}
              x={h.x + h.w / 2}
              y={HULL_Y_TOP - 6}
              textAnchor="middle"
              className={styles.holdLabel}
            >
              Hold {h.holdNumber}
            </text>
          ))}

          {/* Bulkhead lines */}
          {holdPositions.slice(0, -1).map((h, i) => (
            <line
              key={`bh${i}`}
              x1={h.x + h.w + HOLD_GAP / 2}
              y1={HULL_Y_TOP + 2}
              x2={h.x + h.w + HOLD_GAP / 2}
              y2={HULL_Y_BOTTOM - 15}
              stroke="#3B5070"
              strokeWidth="2"
              strokeDasharray="4,3"
            />
          ))}

          {/* Temperature zone double lines */}
          {getZoneBoundaries(compartments, holdPositions).map((boundary, i) => (
            <g key={`zb${i}`}>
              <line
                x1={boundary.x}
                y1={boundary.y1}
                x2={boundary.x}
                y2={boundary.y2}
                stroke="#FCD34D"
                strokeWidth={ZONE_LINE_THICKNESS}
                opacity="0.6"
              />
            </g>
          ))}

          {/* Compartments */}
          {compartments.map((comp) => {
            const isHovered = hoveredId === comp.id;
            const isSelected = selectedId === comp.id;
            const inZone = highlightZone && comp.assignment?.zoneId === highlightZone;
            const isConflict = !isSelected && !isHovered && !!conflictCompartmentIds?.includes(comp.id);
            const isHighlighted = !isSelected && !isHovered && !isConflict && !!highlightedCompartmentIds?.includes(comp.id);
            const isEstimated = comp.assignment?.confidence === 'ESTIMATED';
            // POD color takes precedence over temperature-based zone color
            const effectiveColor = comp.assignment?.podColor || comp.assignment?.zoneColor || '#1E3A5F';

            // Header Box 1: capacity using historical factor if available, else design factor
            const preferredCap = (() => {
              if (!comp.assignment) return 0;
              const { sqm, historicalStowageFactor, designStowageFactor, palletsCapacity } = comp.assignment;
              if (sqm && historicalStowageFactor) return Math.floor(sqm / historicalStowageFactor);
              if (sqm && designStowageFactor) return Math.floor(sqm / designStowageFactor);
              return palletsCapacity;
            })();
            const loaded = comp.assignment?.palletsLoaded ?? 0;
            const available = preferredCap - loaded;

            // Fill bar capacity respects the factor-mode toggle (existing behaviour)
            const displayCapacity = (() => {
              if (!comp.assignment) return 0;
              if (factorMode === 'historical' && comp.assignment.historicalStowageFactor && comp.assignment.sqm) {
                return Math.round(comp.assignment.sqm * comp.assignment.historicalStowageFactor);
              }
              return comp.assignment.palletsCapacity;
            })();
            const fillPct = displayCapacity > 0 ? loaded / displayCapacity : 0;

            // Cell layout zones
            const showHeader = comp.h >= CELL_COMPACT_THRESHOLD;
            const showFooter = comp.h >= CELL_FULL_THRESHOLD;
            const centerY = comp.y + (showHeader ? CELL_HEADER_H : 0);
            const centerH = Math.max(1, comp.h - (showHeader ? CELL_HEADER_H : 0) - (showFooter ? CELL_FOOTER_H : 0));
            const footerY = comp.y + comp.h - CELL_FOOTER_H;

            // Footer values
            const dFactor = (comp.assignment?.designStowageFactor ?? 1.32).toFixed(2);
            const hFactor = comp.assignment?.historicalStowageFactor != null
              ? comp.assignment.historicalStowageFactor.toFixed(2) : '—';
            const actualFactor = (comp.assignment?.isFull && comp.assignment.sqm && loaded > 0)
              ? (comp.assignment.sqm / loaded).toFixed(2) : '—';
            const polCodes = comp.assignment?.polPortCodes ?? [];
            const polLabel = polCodes.length === 0 ? '—'
              : polCodes.length <= 2 ? polCodes.join(' ')
              : polCodes[0] + '+' + (polCodes.length - 1);
            const setTemp = comp.assignment?.setTemperature;
            const tempLabel = setTemp != null
              ? (setTemp === 0 ? '0°' : `${setTemp > 0 ? '+' : ''}${setTemp}°`)
              : '—°';
            // Zone ID for this cell: from layout (empty-vessel mode) or assignment
            const cellZoneId = comp.zoneId ?? comp.assignment?.zoneId;

            // ── Editable-temp per-cell state ────────────────────────────
            const isFocusedZone = !!editableZoneTemps && focusedZoneId === cellZoneId;
            const isFlashing = cellZoneId ? !!flashingZoneIds[cellZoneId] : false;
            const confirmedTemp = editableZoneTemps && cellZoneId ? editableZoneTemps[cellZoneId] : undefined;
            // When focused: show in-progress local string; otherwise show confirmed value
            const currentInputVal = (isFocusedZone && cellZoneId && localTempStrings[cellZoneId] !== undefined)
              ? localTempStrings[cellZoneId]
              : (confirmedTemp != null && !isNaN(confirmedTemp) ? String(confirmedTemp) : '');
            const parsedInputNum = parseFloat(currentInputVal);
            const isInvalidTemp = currentInputVal !== '' && (isNaN(parsedInputNum) || parsedInputNum < -25 || parsedInputNum > 15);
            const tempBorderColor = isInvalidTemp
              ? 'rgba(239,68,68,0.8)'
              : currentInputVal !== ''
                ? (isFocusedZone ? 'rgba(34,197,94,0.9)' : 'rgba(34,197,94,0.7)')
                : (isFocusedZone ? 'rgba(100,160,255,0.9)' : 'rgba(100,160,255,0.4)');
            // Cell body tint by temperature range
            const cellBodyTint = (editableZoneTemps && cellZoneId && confirmedTemp != null && !isNaN(confirmedTemp))
              ? confirmedTemp <= 0 ? 'rgba(147,197,253,0.08)'
                : confirmedTemp <= 8 ? 'rgba(134,239,172,0.08)'
                : confirmedTemp <= 15 ? 'rgba(253,224,132,0.08)'
                : null
              : null;

            return (
              <g
                key={comp.id}
                onMouseEnter={() => setHoveredId(comp.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => {
                  setSelectedId(selectedId === comp.id ? null : comp.id);
                  onCompartmentClick?.(comp.id);
                }}
                style={{
                  cursor: 'pointer',
                  filter: (editableZoneTemps && isFocusedZone) ? 'drop-shadow(0 0 4px rgba(59,130,246,0.4))' : undefined,
                }}
              >
                {/* Background — full cell */}
                <rect
                  x={comp.x}
                  y={comp.y}
                  width={comp.w}
                  height={comp.h}
                  rx={2}
                  fill={comp.assignment?.cargoType ? effectiveColor : '#111E33'}
                  opacity={
                    isSelected ? 0.5 :
                    isHovered ? 0.4 :
                    isConflict ? 0.35 :
                    isHighlighted ? 0.4 :
                    inZone ? 0.25 : 0.15
                  }
                  stroke={
                    isSelected ? '#FCD34D' :
                    isHighlighted ? '#22c55e' :
                    isHovered ? '#fff' :
                    isConflict ? '#ef4444' :
                    inZone ? effectiveColor : '#1E3A5F'
                  }
                  strokeWidth={isSelected ? 2 : isHighlighted ? 2 : isHovered ? 1.5 : isConflict ? 1.5 : 0.8}
                />

                {/* Conflict indicator — small red dot top-right */}
                {isConflict && (
                  <circle
                    cx={comp.x + comp.w - 4}
                    cy={comp.y + 4}
                    r={3}
                    fill="#ef4444"
                    opacity={0.9}
                  />
                )}

                {/* Temperature zone body tint (editable mode) */}
                {cellBodyTint && (
                  <rect
                    x={comp.x + 1}
                    y={centerY}
                    width={comp.w - 2}
                    height={centerH}
                    fill={cellBodyTint}
                    rx={1}
                  />
                )}

                {/* Flash overlay for zone sync feedback */}
                {isFlashing && (
                  <rect
                    x={comp.x}
                    y={comp.y}
                    width={comp.w}
                    height={comp.h}
                    fill="rgba(59,130,246,0.15)"
                    rx={2}
                  />
                )}

                {/* Cargo fill bar — bottom of CENTER area only */}
                {fillPct > 0 && (
                  <rect
                    x={comp.x + 1}
                    y={centerY + centerH * (1 - fillPct)}
                    width={comp.w - 2}
                    height={centerH * fillPct - 1}
                    rx={1}
                    fill={effectiveColor}
                    opacity={isSelected ? 0.7 : isHovered ? 0.6 : 0.35}
                  />
                )}

                {/* Hatch overlay for ESTIMATED (unconfirmed) cargo */}
                {fillPct > 0 && isEstimated && (
                  <rect
                    x={comp.x + 1}
                    y={centerY + centerH * (1 - fillPct)}
                    width={comp.w - 2}
                    height={centerH * fillPct - 1}
                    rx={1}
                    fill="url(#hatch-estimated)"
                    opacity={0.6}
                  />
                )}

                {/* HEADER STRIP — capacity / loaded / available */}
                {showHeader && comp.assignment && (
                  <>
                    <rect x={comp.x} y={comp.y} width={comp.w} height={CELL_HEADER_H}
                      fill="#070f1c" opacity={0.78} rx={2} />
                    <line x1={comp.x + comp.w / 3} y1={comp.y + 2}
                      x2={comp.x + comp.w / 3} y2={comp.y + CELL_HEADER_H - 2}
                      stroke="#1E3A5F" strokeWidth={0.5} />
                    <line x1={comp.x + comp.w * 2 / 3} y1={comp.y + 2}
                      x2={comp.x + comp.w * 2 / 3} y2={comp.y + CELL_HEADER_H - 2}
                      stroke="#1E3A5F" strokeWidth={0.5} />
                    {/* Box 1 — capacity (prefer historical factor) */}
                    <text x={comp.x + comp.w / 6} y={comp.y + CELL_HEADER_H / 2}
                      textAnchor="middle" dominantBaseline="middle"
                      style={{ fontSize: '8px', fill: '#64748b', fontFamily: 'monospace' }}>
                      {preferredCap}
                    </text>
                    {/* Box 2 — pallets loaded */}
                    <text x={comp.x + comp.w / 2} y={comp.y + CELL_HEADER_H / 2}
                      textAnchor="middle" dominantBaseline="middle"
                      style={{ fontSize: '8px', fontFamily: 'monospace',
                        fill: loaded > 0 ? '#e2e8f0' : '#475569',
                        fontWeight: loaded > 0 ? 'bold' : 'normal' }}>
                      {loaded}
                    </text>
                    {/* Box 3 — available (green / grey / red) */}
                    <text x={comp.x + comp.w * 5 / 6} y={comp.y + CELL_HEADER_H / 2}
                      textAnchor="middle" dominantBaseline="middle"
                      style={{ fontSize: '8px', fontFamily: 'monospace',
                        fill: available < 0 ? '#ef4444' : available === 0 ? '#94a3b8' : '#22c55e' }}>
                      {available}
                    </text>
                  </>
                )}

                {/* CENTER — cargo short label */}
                {comp.assignment?.cargoShortLabel && (
                  <text
                    x={comp.x + comp.w / 2}
                    y={centerY + centerH / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={styles.cargoShortLabel}
                    opacity={isHovered || isSelected || inZone ? 1 : 0.8}
                  >
                    {comp.assignment.cargoShortLabel}
                  </text>
                )}

                {/* FOOTER STRIP — design factor / historical / actual / POL / temp */}
                {/* Also shows in editable-temp mode even when no cargo assignment */}
                {showFooter && (comp.assignment || editableZoneTemps) && (
                  <>
                    <rect x={comp.x} y={footerY} width={comp.w} height={CELL_FOOTER_H}
                      fill="#070f1c" opacity={0.78} />
                    {/* Dividers at proportional positions */}
                    {(!editableZoneTemps || comp.assignment
                      ? [0.12, 0.24, 0.36, 0.62]
                      : [0.12]
                    ).map(pos => (
                      <line key={`fd${pos}`}
                        x1={comp.x + comp.w * pos} y1={footerY + 2}
                        x2={comp.x + comp.w * pos} y2={footerY + CELL_FOOTER_H - 2}
                        stroke="#1E3A5F" strokeWidth={0.5} />
                    ))}
                    {/* Design / historical / actual / POL — only when assignment exists */}
                    {comp.assignment && <>
                      {/* Col 1 — design factor */}
                      <text x={comp.x + comp.w * 0.06} y={footerY + CELL_FOOTER_H / 2}
                        textAnchor="middle" dominantBaseline="middle"
                        style={{ fontSize: '7px', fill: '#475569' }}>
                        {dFactor}
                      </text>
                      {/* Col 2 — historical factor */}
                      <text x={comp.x + comp.w * 0.18} y={footerY + CELL_FOOTER_H / 2}
                        textAnchor="middle" dominantBaseline="middle"
                        style={{ fontSize: '7px', fill: hFactor !== '—' ? '#94a3b8' : '#334155' }}>
                        {hFactor}
                      </text>
                      {/* Col 3 — actual factor */}
                      <text x={comp.x + comp.w * 0.30} y={footerY + CELL_FOOTER_H / 2}
                        textAnchor="middle" dominantBaseline="middle"
                        style={{ fontSize: '7px', fill: actualFactor !== '—' ? '#fbbf24' : '#334155' }}>
                        {actualFactor}
                      </text>
                      {/* Col 4 — POL codes */}
                      <text x={comp.x + comp.w * 0.57} y={footerY + CELL_FOOTER_H / 2}
                        textAnchor="middle" dominantBaseline="middle"
                        style={{ fontSize: '7px', fill: polCodes.length > 0 ? '#60a5fa' : '#334155' }}>
                        {polLabel}
                      </text>
                    </>}
                    {/* Temperature — editable input OR static label */}
                    {editableZoneTemps && cellZoneId ? (
                      <>
                        {/* Zone label above the input — links sibling cells visually */}
                        <text
                          x={comp.x + comp.w * 0.81}
                          y={footerY - 3}
                          textAnchor="middle"
                          style={{ fontSize: '7px', fill: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', pointerEvents: 'none' }}
                        >
                          {cellZoneId}
                        </text>
                        {/* foreignObject spanning last 38% of cell, extending into body */}
                        <foreignObject
                          x={comp.x + comp.w * 0.62}
                          y={footerY - 7}
                          width={Math.max(1, comp.w * 0.38 - 2)}
                          height={22}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', width: '100%', height: '100%', padding: '0 2px', boxSizing: 'border-box' }}>
                            <input
                              type="number"
                              step="1"
                              min="-25"
                              max="15"
                              value={currentInputVal}
                              placeholder="°C"
                              onChange={(e) => {
                                setLocalTempStrings(prev => ({ ...prev, [cellZoneId]: e.target.value }));
                              }}
                              onFocus={(e) => {
                                // seed local string with confirmed value on first focus
                                setFocusedZoneId(cellZoneId);
                                if (localTempStrings[cellZoneId] === undefined) {
                                  setLocalTempStrings(prev => ({
                                    ...prev,
                                    [cellZoneId]: confirmedTemp != null && !isNaN(confirmedTemp) ? String(confirmedTemp) : '',
                                  }));
                                }
                                e.stopPropagation();
                              }}
                              onBlur={(e) => {
                                setFocusedZoneId(null);
                                const rawVal = e.target.value;
                                const num = parseFloat(rawVal);
                                // Clear local string so display falls back to confirmed value
                                setLocalTempStrings(prev => { const n = { ...prev }; delete n[cellZoneId]; return n; });
                                if (rawVal === '') {
                                  onZoneTempChange?.(cellZoneId, NaN);
                                } else if (!isNaN(num) && num >= -25 && num <= 15) {
                                  onZoneTempChange?.(cellZoneId, num);
                                  triggerFlash(cellZoneId);
                                }
                                // Invalid: revert (local string already deleted, confirmed value stays)
                              }}
                              onClick={(e) => e.stopPropagation()}
                              title={isInvalidTemp ? 'Valid range: -25°C to +15°C' : undefined}
                              style={{
                                flex: '1',
                                minWidth: '0',
                                height: '100%',
                                background: 'rgba(255,255,255,0.08)',
                                border: `1px solid ${tempBorderColor}`,
                                borderRadius: '3px',
                                color: isInvalidTemp ? 'rgba(252,165,165,0.9)' : 'rgba(255,255,255,0.9)',
                                fontSize: '11px',
                                textAlign: 'center',
                                padding: '0 1px',
                                outline: 'none',
                                boxSizing: 'border-box',
                                display: 'block',
                              }}
                            />
                            <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.35)', flexShrink: 0, lineHeight: 1, userSelect: 'none', pointerEvents: 'none' }}>
                              °C
                            </span>
                          </div>
                        </foreignObject>
                      </>
                    ) : (
                      <text x={comp.x + comp.w * 0.89} y={footerY + CELL_FOOTER_H / 2}
                        textAnchor="middle" dominantBaseline="middle"
                        style={{ fontSize: '7px', fill: '#d8b4fe' }}>
                        {tempLabel}
                      </text>
                    )}
                  </>
                )}

                {/* Pallet count — center area, always visible when capacity known */}
                {comp.assignment && preferredCap > 0 && (
                  <text
                    x={comp.x + comp.w / 2}
                    y={centerY + centerH / 2 + (comp.assignment.cargoShortLabel ? 9 : 0)}
                    textAnchor="middle"
                    className={styles.compCount}
                  >
                    {loaded}/{preferredCap}
                  </text>
                )}
              </g>
            );
          })}

          {/* Level labels (left side — use hold with most levels as reference) */}
          {compartments
            .filter((c) => c.holdNumber === refHoldNumber)
            .map((c) => (
              <text
                key={`ll-${c.level}`}
                x={CARGO_AREA_X - 8}
                y={c.y + c.h / 2}
                textAnchor="end"
                dominantBaseline="middle"
                className={styles.levelLabel}
              >
                {c.level}
              </text>
            ))}

          {/* Bow / Stern labels */}
          <text x={HULL_BOW_TIP + 5} y={SVG_H - 20} className={styles.dirLabel}>
            BOW ◀
          </text>
          <text x={HULL_X_STERN - 5} y={SVG_H - 20} textAnchor="end" className={styles.dirLabel}>
            ▶ STERN
          </text>
        </svg>

        {/* Detail panel — absolutely positioned overlay inside svgWrap */}
        {showCompartmentTooltip && detail && detail.assignment && (
          <div
            className={styles.detailPanel}
            style={{
              borderLeftColor: detail.assignment.podColor ?? detail.assignment.zoneColor,
              position: 'absolute',
              top: '8px',
              right: '8px',
              zIndex: 10,
              minWidth: '200px',
              background: 'rgba(10,22,40,0.97)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px',
              padding: '12px 14px',
            }}
          >
            {/* Close button — only shown when panel is pinned by a click (selectedId set) */}
            {selectedId && (
              <button
                onClick={() => setSelectedId(null)}
                style={{
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: '1rem',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'absolute',
                  top: '6px',
                  right: '8px',
                  lineHeight: 1,
                  padding: 0,
                }}
                aria-label="Close"
              >
                ×
              </button>
            )}
            <div className={styles.detailHeader}>
              <span className={styles.detailId}>
                {detail.id}
                <span style={{
                  color: 'rgba(255,255,255,0.35)',
                  fontWeight: 400,
                  margin: '0 4px',
                }}>/</span>
                <span style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: detail.assignment.podColor ?? detail.assignment.zoneColor,
                  background: `${(detail.assignment.podColor ?? detail.assignment.zoneColor)}20`,
                  padding: '1px 6px',
                  borderRadius: '3px',
                }}>
                  {detail.assignment.zoneName}
                </span>
              </span>
            </div>
            {/* Consignees */}
            {(() => {
              const names = consigneesBySection?.[detail.id] ?? [];
              return (
                <div style={{ padding: '8px 12px', fontSize: '0.78rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.45)', marginRight: '6px' }}>Consignees</span>
                  {names.length > 0
                    ? names.map((name, i) => (
                        <span
                          key={name}
                          style={{
                            display: 'inline-block',
                            background: 'rgba(255,255,255,0.07)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '3px',
                            padding: '1px 6px',
                            marginRight: i < names.length - 1 ? '4px' : 0,
                            color: 'rgba(255,255,255,0.85)',
                            fontSize: '0.75rem',
                          }}
                        >
                          {name}
                        </span>
                      ))
                    : <span style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>No cargo assigned</span>
                  }
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function getUniqueZones(assignments: VoyageTempAssignment[]) {
  const seen = new Set<string>();
  return assignments.filter((a) => {
    if (seen.has(a.zoneId)) return false;
    seen.add(a.zoneId);
    return true;
  });
}

function getZoneBoundaries(
  compartments: CompartmentRect[],
  holdPositions: { x: number; w: number; holdNumber: number }[],
) {
  const boundaries: { x: number; y1: number; y2: number }[] = [];

  for (const hold of holdPositions) {
    const holdComps = compartments
      .filter((c) => c.holdNumber === hold.holdNumber)
      .sort((a, b) => a.y - b.y);

    for (let i = 0; i < holdComps.length - 1; i++) {
      const current = holdComps[i].assignment?.zoneId;
      const next = holdComps[i + 1].assignment?.zoneId;
      if (current && next && current !== next) {
        const y = holdComps[i].y + holdComps[i].h + 0.5;
        boundaries.push({
          x: hold.x + hold.w / 2,
          y1: y - 1,
          y2: y + 1,
        });
        boundaries.push({
          x: hold.x + 2,
          y1: y,
          y2: y,
        });
      }
    }
  }

  return boundaries;
}
