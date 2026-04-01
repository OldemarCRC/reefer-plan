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
}

export default function VesselProfile({
  vesselName = 'ACONCAGUA BAY',
  voyageNumber = 'ACON-062026',
  onCompartmentClick,
  tempAssignments = defaultAssignments,
  vesselLayout,
  conflictCompartmentIds,
  highlightedCompartmentIds,
}: VesselProfileProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [factorMode, setFactorMode] = useState<'design' | 'historical'>('design');

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

            return (
              <g
                key={comp.id}
                onMouseEnter={() => setHoveredId(comp.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => {
                  setSelectedId(selectedId === comp.id ? null : comp.id);
                  onCompartmentClick?.(comp.id);
                }}
                style={{ cursor: 'pointer' }}
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
                {showFooter && comp.assignment && (
                  <>
                    <rect x={comp.x} y={footerY} width={comp.w} height={CELL_FOOTER_H}
                      fill="#070f1c" opacity={0.78} />
                    {[1, 2, 3, 4].map(i => (
                      <line key={`fd${i}`}
                        x1={comp.x + comp.w * i / 5} y1={footerY + 2}
                        x2={comp.x + comp.w * i / 5} y2={footerY + CELL_FOOTER_H - 2}
                        stroke="#1E3A5F" strokeWidth={0.5} />
                    ))}
                    {/* Design factor */}
                    <text x={comp.x + comp.w / 10} y={footerY + CELL_FOOTER_H / 2}
                      textAnchor="middle" dominantBaseline="middle"
                      style={{ fontSize: '7px', fill: '#475569' }}>
                      {dFactor}
                    </text>
                    {/* Historical factor */}
                    <text x={comp.x + comp.w * 3 / 10} y={footerY + CELL_FOOTER_H / 2}
                      textAnchor="middle" dominantBaseline="middle"
                      style={{ fontSize: '7px', fill: hFactor !== '—' ? '#94a3b8' : '#334155' }}>
                      {hFactor}
                    </text>
                    {/* Actual factor (shown in amber when isFull) */}
                    <text x={comp.x + comp.w / 2} y={footerY + CELL_FOOTER_H / 2}
                      textAnchor="middle" dominantBaseline="middle"
                      style={{ fontSize: '7px', fill: actualFactor !== '—' ? '#fbbf24' : '#334155' }}>
                      {actualFactor}
                    </text>
                    {/* POL codes */}
                    <text x={comp.x + comp.w * 7 / 10} y={footerY + CELL_FOOTER_H / 2}
                      textAnchor="middle" dominantBaseline="middle"
                      style={{ fontSize: '7px', fill: polCodes.length > 0 ? '#60a5fa' : '#334155' }}>
                      {polLabel}
                    </text>
                    {/* Temperature */}
                    <text x={comp.x + comp.w * 9 / 10} y={footerY + CELL_FOOTER_H / 2}
                      textAnchor="middle" dominantBaseline="middle"
                      style={{ fontSize: '7px', fill: '#d8b4fe' }}>
                      {tempLabel}
                    </text>
                  </>
                )}

                {/* Pallet count (when hovered or selected) — center area */}
                {(isHovered || isSelected) && comp.assignment && (
                  <text
                    x={comp.x + comp.w / 2}
                    y={centerY + centerH / 2 + (comp.assignment.cargoShortLabel ? 9 : 0)}
                    textAnchor="middle"
                    className={styles.compCount}
                  >
                    {loaded}/{displayCapacity}
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

        {/* Detail panel */}
        {detail && detail.assignment && (
          <div
            className={styles.detailPanel}
            style={{ borderLeftColor: detail.assignment.podColor ?? detail.assignment.zoneColor }}
          >
            <div className={styles.detailHeader}>
              <span className={styles.detailId}>{detail.id}</span>
              <span
                className={styles.detailZone}
                style={{
                  background: `${(detail.assignment.podColor ?? detail.assignment.zoneColor)}20`,
                  color: detail.assignment.podColor ?? detail.assignment.zoneColor,
                }}
              >
                {detail.assignment.zoneName}
              </span>
            </div>
            <div className={styles.detailGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Temperature</span>
                <span className={styles.detailValue}>
                  {detail.assignment.setTemperature !== 0
                    ? `${detail.assignment.setTemperature > 0 ? '+' : ''}${detail.assignment.setTemperature}°C`
                    : 'Not set'}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Cargo</span>
                <span className={styles.detailValue}>
                  {detail.assignment.cargoType
                    ? detail.assignment.cargoType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
                    : 'Empty'}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Loaded</span>
                <span className={styles.detailValue}>
                  {detail.assignment.palletsLoaded} / {(() => {
                    if (factorMode === 'historical' && detail.assignment.historicalStowageFactor && detail.assignment.sqm) {
                      return Math.round(detail.assignment.sqm * detail.assignment.historicalStowageFactor);
                    }
                    return detail.assignment.palletsCapacity;
                  })()} plt
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Utilization</span>
                <span className={styles.detailValue}>
                  {(() => {
                    const cap = factorMode === 'historical' && detail.assignment.historicalStowageFactor && detail.assignment.sqm
                      ? Math.round(detail.assignment.sqm * detail.assignment.historicalStowageFactor)
                      : detail.assignment.palletsCapacity;
                    return cap > 0 ? `${Math.round((detail.assignment.palletsLoaded / cap) * 100)}%` : '0%';
                  })()}
                </span>
              </div>
            </div>
            {/* Stowage factor section */}
            {detail.assignment.sqm != null && (
              <div className={styles.detailFactors}>
                <div className={styles.detailFactorRow}>
                  <span className={styles.detailFactorLabel}>Floor area</span>
                  <span className={styles.detailFactorValue}>{detail.assignment.sqm.toFixed(1)} m²</span>
                </div>
                <div className={styles.detailFactorRow}>
                  <span className={styles.detailFactorLabel}>Design factor</span>
                  <span className={styles.detailFactorValue}>{(detail.assignment.designStowageFactor ?? 1.32).toFixed(2)}</span>
                </div>
                <div className={styles.detailFactorRow}>
                  <span className={styles.detailFactorLabel}>Historical avg</span>
                  <span className={styles.detailFactorValue}>
                    {detail.assignment.historicalStowageFactor != null
                      ? detail.assignment.historicalStowageFactor.toFixed(2)
                      : '—'}
                  </span>
                </div>
                {detail.assignment.palletsLoaded > 0 && detail.assignment.sqm > 0 && (
                  <div className={styles.detailFactorRow}>
                    <span className={styles.detailFactorLabel}>This voyage</span>
                    <span className={styles.detailFactorValue}>
                      {(detail.assignment.palletsLoaded / detail.assignment.sqm).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}
            {detail.assignment.shipments.length > 0 && (
              <div className={styles.detailShipments}>
                Shipments: {detail.assignment.shipments.join(', ')}
              </div>
            )}
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
