// app/stowage-plans/[id]/page.tsx
'use client';

import { useState, useMemo, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AppShell from '@/components/layout/AppShell';
import VesselProfile from '@/components/vessel/VesselProfile';
import { getStowagePlanById, deleteStowagePlan, saveCargoAssignments, updatePlanStatus, copyStowagePlan, replanAfterTemperatureOverride } from '@/app/actions/stowage-plan';
import MarkSentModal from '@/components/stowage/MarkSentModal';
import { getConfirmedBookingsForVoyage } from '@/app/actions/booking';

import CoolingSectionTopDown, { type SectionBookingSlot } from '@/components/stowage/CoolingSectionTopDown';
import type { VoyageTempAssignment, VesselLayout } from '@/lib/vessel-profile-data';
import { LEVEL_DISPLAY_ORDER } from '@/lib/vessel-profile-data';
import styles from './page.module.css';

interface CargoAssignment {
  compartmentId: string;
  quantity: number;
}

interface CargoInPlan {
  bookingId: string;
  bookingNumber: string;
  cargoType: string;
  totalQuantity: number;
  pol: string;
  pod: string;
  consignee: string;
  shipperName: string;
  assignments: CargoAssignment[];
  isConfirmed: boolean;
}

export default function StowagePlanDetailPage() {
  const params = useParams();
  const planId = params.id as string;
  const router = useRouter();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [assigningBooking, setAssigningBooking] = useState<CargoInPlan | null>(null);
  const [selectedCompartment, setSelectedCompartment] = useState<string>('');
  const [assignQuantity, setAssignQuantity] = useState<number>(0);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [isCopying, startCopyTransition] = useTransition();
  const [showSentModal, setShowSentModal] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string>('');
  const [expandedValidation, setExpandedValidation] = useState<Record<string, boolean>>({});
  const [communicationLog, setCommunicationLog] = useState<any[]>([]);
  const [captainComm, setCaptainComm] = useState<any>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [engineConflicts, setEngineConflicts] = useState<any[]>([]);
  const [stabilityIndicators, setStabilityIndicators] = useState<any[]>([]);
  const [generationMethod, setGenerationMethod] = useState<string>('MANUAL');
  const [highlightedSectionIds, setHighlightedSectionIds] = useState<string[]>([]);
  const [showReplanBanner, setShowReplanBanner] = useState(false);
  const [isReplanning, startReplanTransition] = useTransition();

  // Plan header info — populated from DB on mount
  const [plan, setPlan] = useState({
    _id: planId,
    planNumber: '...',
    voyageNumber: '...',
    vesselName: '...',
    captainEmail: undefined as string | undefined,
    status: 'DRAFT',
  });

  const [tempZoneConfig, setTempZoneConfig] = useState<any[]>([]);

  const [bookings, setBookings] = useState<CargoInPlan[]>([]);
  // Raw cargoPositions from DB — source of truth for SVG rendering, independent of booking status.
  const [planCargoPositions, setPlanCargoPositions] = useState<any[]>([]);

  // Stowage factor data per compartment — extracted from the populated vessel
  const [sectionFactors, setSectionFactors] = useState<Record<string, {
    sqm: number;
    designStowageFactor: number;
    historicalStowageFactor?: number;
    isFull?: boolean;
  }>>({});

  // Vessel layout built from DB temperatureZones — drives VesselProfile SVG
  const [vesselLayout, setVesselLayout] = useState<VesselLayout | undefined>(undefined);

  useEffect(() => {
    getStowagePlanById(planId).then(async (result) => {
      if (result.success && result.data) {
        const p = result.data;
        // Persist raw cargoPositions immediately so vesselProfileData can render
        // regardless of booking status (PENDING / contract-estimate positions included).
        setPlanCargoPositions(p.cargoPositions ?? []);
        setPlan({
          _id: planId,
          planNumber: p.planNumber || `PLAN-${planId.slice(-6)}`,
          voyageNumber: p.voyageId?.voyageNumber || p.voyageNumber || 'N/A',
          vesselName: p.vesselId?.name || p.vesselName || 'Unknown Vessel',
          captainEmail: p.vesselId?.captainEmail ?? undefined,
          status: p.status || 'DRAFT',
        });
        // Extract stowage factor data from the populated vessel (vesselId is populate()'d)
        const temperatureZones: any[] = p.vesselId?.temperatureZones ?? [];
        if (temperatureZones.length > 0) {
          const factors: Record<string, { sqm: number; designStowageFactor: number; historicalStowageFactor?: number; isFull?: boolean }> = {};
          for (const zone of temperatureZones) {
            for (const section of zone.coolingSections ?? []) {
              factors[section.sectionId] = {
                sqm: section.sqm ?? 0,
                designStowageFactor: section.designStowageFactor ?? 1.32,
                historicalStowageFactor: section.historicalStowageFactor ?? undefined,
                isFull: section.isFull ?? false,
              };
            }
          }
          setSectionFactors(factors);

          // Build vessel layout from real DB data (holds + levels derived from sectionId)
          const allSections: { sectionId: string; sqm: number }[] = [];
          for (const zone of temperatureZones) {
            for (const section of zone.coolingSections ?? []) {
              if (section.sectionId) {
                allSections.push({ sectionId: section.sectionId, sqm: section.sqm ?? 100 });
              }
            }
          }
          if (allSections.length > 0) {
            const holdMap = new Map<number, { sectionId: string; sqm: number }[]>();
            for (const s of allSections) {
              const holdNum = parseInt(s.sectionId.match(/^\d+/)?.[0] ?? '0', 10);
              if (holdNum === 0) continue;
              if (!holdMap.has(holdNum)) holdMap.set(holdNum, []);
              holdMap.get(holdNum)!.push(s);
            }
            const layout: VesselLayout = {
              holds: [...holdMap.entries()]
                .sort(([a], [b]) => a - b)
                .map(([holdNumber, levels]) => ({
                  holdNumber,
                  levels: levels.sort((a, b) => {
                    const la = a.sectionId.replace(/^\d+/, '');
                    const lb = b.sectionId.replace(/^\d+/, '');
                    const ia = LEVEL_DISPLAY_ORDER.indexOf(la);
                    const ib = LEVEL_DISPLAY_ORDER.indexOf(lb);
                    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
                  }),
                })),
            };
            setVesselLayout(layout);
          }
        }

        // Use real cooling section temperatures from the plan if available,
        // otherwise fall back to the vessel's actual temperatureZones (never use hardcoded defaults).
        if (Array.isArray(p.coolingSectionStatus) && p.coolingSectionStatus.length > 0) {
          setTempZoneConfig(
            p.coolingSectionStatus.map((cs: any) => ({
              sectionId: cs.zoneId,
              zoneId: `ZONE_${cs.zoneId}`,
              temp: cs.assignedTemperature ?? 13,
              compartments: cs.coolingSectionIds ?? [],
            }))
          );
        } else if (temperatureZones.length > 0) {
          setTempZoneConfig(
            temperatureZones.map((zone: any) => ({
              sectionId: zone.zoneId,
              zoneId: `ZONE_${zone.zoneId}`,
              temp: 13,
              compartments: (zone.coolingSections ?? []).map((s: any) => s.sectionId),
            }))
          );
        }

        // Communication log + captain response
        setCommunicationLog(p.communicationLog ?? []);
        setCaptainComm(p.captainCommunication ?? null);

        // Engine output fields (conflicts, stability, generationMethod)
        setEngineConflicts((p as any).conflicts ?? []);
        setStabilityIndicators((p as any).stabilityIndicators ?? []);
        setGenerationMethod((p as any).generationMethod ?? 'MANUAL');

        // Load confirmed bookings for this voyage
        const voyageId = typeof p.voyageId === 'object' ? p.voyageId?._id : p.voyageId;
        if (voyageId) {
          const bookingsResult = await getConfirmedBookingsForVoyage(voyageId);
          if (bookingsResult.success && Array.isArray(bookingsResult.data)) {
            // Build assignment map from saved cargoPositions
            const positionsByBooking: Record<string, CargoAssignment[]> = {};
            for (const pos of (p.cargoPositions ?? [])) {
              const bid = String(pos.bookingId ?? pos.shipmentId ?? '');
              if (!bid) continue;
              if (!positionsByBooking[bid]) positionsByBooking[bid] = [];
              positionsByBooking[bid].push({
                compartmentId: pos.compartment?.id ?? '',
                quantity: pos.quantity ?? 0,
              });
            }

            const mapped = bookingsResult.data.map((b: any) => {
              // Use the snapshot quantity saved at plan-creation time if available,
              // so older plan versions show historical totals rather than current booking values.
              const savedSnapshot = (p.cargoPositions ?? []).find(
                (pos: any) => String(pos.bookingId ?? pos.shipmentId ?? '') === b._id
              );
              return {
                bookingId: b._id,
                bookingNumber: b.bookingNumber,
                cargoType: b.cargoType ?? '',
                totalQuantity: savedSnapshot?.snapshotTotalQuantity ?? b.confirmedQuantity ?? b.requestedQuantity ?? 0,
                pol: b.pol?.portCode ?? '',
                pod: b.pod?.portCode ?? '',
                consignee: b.consignee?.name ?? '',
                shipperName: b.shipper?.name ?? '',
                assignments: positionsByBooking[b._id] ?? [],
                isConfirmed: (b.confirmedQuantity ?? 0) > 0,
              };
            });

            setBookings(mapped);
            // Auto-select first booking
            if (mapped.length > 0) {
              setSelectedBookingId(mapped[0].bookingId);
            }
          }
        }
      }
    });
  }, [planId]);


  // Build compartment → section lookup once
  const compartmentToSection = useMemo(() => {
    const map: Record<string, { sectionId: string; temp: number }> = {};
    for (const zone of tempZoneConfig) {
      for (const compId of zone.compartments) {
        map[compId] = { sectionId: zone.sectionId, temp: zone.temp };
      }
    }
    return map;
  }, [tempZoneConfig]);

  // Compartment capacities (pallets) — derived from vessel DB data (sqm / designStowageFactor)
  const compartmentCapacities = useMemo(() => {
    const caps: Record<string, number> = {};
    for (const [sectionId, factors] of Object.entries(sectionFactors)) {
      const factor = factors.designStowageFactor ?? 1.32;
      caps[sectionId] = Math.floor(factors.sqm / factor);
    }
    return caps;
  }, [sectionFactors]);

  // Compute validation dynamically from current assignments
  const validation = useMemo(() => {
    const temperatureConflicts: { compartmentId: string; coolingSectionId: string; description: string; affectedBookings: string[]; userConfirmed: boolean; cargoType: string; bookingId: string; quantity: number }[] = [];
    const overstowViolations: { compartmentId: string; description: string; affectedBookings: string[] }[] = [];
    const capacityViolations: { compartmentId: string; description: string; affectedBookings: string[]; overBy: number }[] = [];

    // Group assignments by compartment
    const byCompartment: Record<string, { booking: CargoInPlan; quantity: number }[]> = {};
    for (const b of bookings) {
      for (const a of b.assignments) {
        if (!byCompartment[a.compartmentId]) byCompartment[a.compartmentId] = [];
        byCompartment[a.compartmentId].push({ booking: b, quantity: a.quantity });
      }
    }

    for (const [compId, entries] of Object.entries(byCompartment)) {
      const section = compartmentToSection[compId];
      if (!section) continue;

      // Overstow: more than one booking per compartment
      if (entries.length > 1) {
        overstowViolations.push({
          compartmentId: compId,
          description: `${entries.length} bookings share this compartment`,
          affectedBookings: entries.map(e => e.booking.bookingNumber),
        });
      }

      // Capacity check
      const cap = compartmentCapacities[compId];
      const used = entries.reduce((sum, e) => sum + e.quantity, 0);
      if (cap && used > cap) {
        capacityViolations.push({
          compartmentId: compId,
          description: `${used} pallets assigned but capacity is ${cap} — over by ${used - cap}`,
          affectedBookings: entries.map(e => e.booking.bookingNumber),
          overBy: used - cap,
        });
      }
    }

    return {
      temperatureConflicts,
      overstowViolations,
      capacityViolations,
      weightDistributionWarnings: ['Port list of 0.8° detected - consider redistributing cargo'],
    };
  }, [bookings, compartmentToSection]);

  // Auto-expand validation sections that have violations
  useEffect(() => {
    const expanded: Record<string, boolean> = {};
    if (validation.overstowViolations.length > 0) expanded.overstow = true;
    if (validation.capacityViolations.length > 0) expanded.capacity = true;
    if (validation.weightDistributionWarnings.length > 0) expanded.weight = true;
    setExpandedValidation(expanded);
  }, [validation]);

  // Zone colors (hue-based on temperature, matching wizard)
  const tempToColor = (temp: number) => {
    const hue = Math.round(240 - ((temp + 25) / 40) * 240);
    return `hsl(${hue}, 70%, 50%)`;
  };

  // POD color palette — one distinct color per unique port of destination
  const POD_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

  const podColorMap = useMemo(() => {
    // Read podPortCode directly from raw cargoPositions — populated by the engine for all
    // positions including contract-estimate entries. No booking-status filter needed.
    const pods = [...new Set(
      planCargoPositions.map((pos: any) => (pos.podPortCode as string | undefined) ?? '').filter(Boolean)
    )];
    const map: Record<string, string> = {};
    pods.forEach((pod, i) => { map[pod] = POD_COLORS[i % POD_COLORS.length]; });
    return map;
  }, [planCargoPositions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargo type abbreviation lookup for compartment labels
  const CARGO_ABBREV: Record<string, string> = {
    BANANAS: 'BAN', ORGANIC_BANANAS: 'OBAN', PLANTAINS: 'PLAN',
    FROZEN_FISH: 'FISH', TABLE_GRAPES: 'GRAP', CITRUS: 'CITR',
    AVOCADOS: 'AVOC', BERRIES: 'BERR', KIWIS: 'KIWI', PINEAPPLES: 'PINE',
    CHERRIES: 'CHER', BLUEBERRIES: 'BLUE', PLUMS: 'PLUM', PEACHES: 'PEAC',
    APPLES: 'APPL', PEARS: 'PEAR', PAPAYA: 'PAPA', MANGOES: 'MANG',
    OTHER_FROZEN: 'FRZN', OTHER_CHILLED: 'CHLD',
  };

  // Consignees keyed by section ID — passed to VesselProfile click panel.
  // Primary: pos.consigneeName (saved by engine for real bookings since schema v1.50).
  // Fallback: look up from bookings state (covers manually-assigned positions).
  // CONTRACT-ESTIMATE positions have no consignee data — skipped.
  const consigneesBySection = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const pos of planCargoPositions) {
      const sid = (pos.coolingSectionId ?? pos.compartment?.id ?? '') as string;
      if (!sid) continue;
      const name: string =
        (pos as any).consigneeName ??
        bookings.find(b => b.bookingId === String(pos.bookingId))?.consignee ??
        '';
      if (!name) continue;
      if (!map[sid]) map[sid] = [];
      if (!map[sid].includes(name)) map[sid].push(name);
    }
    return map;
  }, [planCargoPositions, bookings]);

  // Transform plan data to VesselProfile format
  const vesselProfileData = useMemo(() => {
    const result: VoyageTempAssignment[] = [];

    // Booking metadata for enriching display (pod, pol, bookingNumber, isConfirmed).
    // Only CONFIRMED/PARTIAL bookings are in this map — used for labels, not for quantities.
    const bookingById: Record<string, CargoInPlan> = {};
    for (const b of bookings) bookingById[b.bookingId] = b;

    // Group raw cargoPositions by section ID.
    // Handles both field formats: pos.coolingSectionId (if ever present) and pos.compartment.id.
    // This is the source-of-truth grouping — PENDING and contract-estimate positions included.
    const positionsBySectionId: Record<string, any[]> = {};
    for (const pos of planCargoPositions) {
      const sectionId = (pos.coolingSectionId ?? pos.compartment?.id ?? '') as string;
      if (!sectionId) continue;
      if (!positionsBySectionId[sectionId]) positionsBySectionId[sectionId] = [];
      positionsBySectionId[sectionId].push(pos);
    }

    for (const zone of tempZoneConfig) {
      const zoneColor = tempToColor(zone.temp);
      for (const compId of zone.compartments) {
        const positions = positionsBySectionId[compId] || [];
        const palletsLoaded = positions.reduce((sum: number, pos: any) => sum + (pos.quantity ?? 0), 0);

        // Capacity: prefer historicalStowageFactor (real voyage average) over designStowageFactor
        const factors = sectionFactors[compId];
        const sfactor = factors?.historicalStowageFactor ?? factors?.designStowageFactor ?? 1.32;
        const capacity = factors?.sqm ? Math.floor(factors.sqm / sfactor) : 0;

        // Cargo type: live booking type preferred; fall back to position snapshot
        const firstPos = positions[0];
        const firstBid = firstPos ? String(firstPos.bookingId ?? '') : '';
        const cargoType = firstPos
          ? (bookingById[firstBid]?.cargoType || (firstPos.cargoType as string) || '')
          : '';

        // POD: dominant position = one with most pallets; prefer podPortCode on position snapshot
        const dominantPos = positions.length > 0
          ? positions.reduce((a: any, b: any) => (a.quantity ?? 0) >= (b.quantity ?? 0) ? a : b)
          : null;
        const dominantBid = dominantPos ? String(dominantPos.bookingId ?? '') : '';
        const dominantPod = (dominantPos?.podPortCode as string | undefined) ?? bookingById[dominantBid]?.pod ?? '';
        const podColor = dominantPod ? (podColorMap[dominantPod] ?? '#64748b') : undefined;

        // Cargo short label
        const cargoShortLabel = cargoType
          ? (CARGO_ABBREV[cargoType] ?? cargoType.replace(/_/g, '').slice(0, 4))
          : undefined;

        // Unique POL codes — prefer polPortCode on position snapshot; booking pol as fallback
        const polPortCodes = [...new Set(
          positions
            .map((pos: any) => {
              const bid = String(pos.bookingId ?? '');
              return (pos.polPortCode as string | undefined) ?? bookingById[bid]?.pol ?? '';
            })
            .filter(Boolean)
        )];

        // isFull: computed from actual loaded vs capacity (not the DB flag)
        const isFull = capacity > 0 && palletsLoaded >= capacity;

        // Confidence: CONFIRMED if any position in this section belongs to a confirmed booking
        const isConfirmed = positions.some((pos: any) =>
          bookingById[String(pos.bookingId ?? '')]?.isConfirmed ?? false
        );

        result.push({
          compartmentId: compId,
          zoneId: zone.zoneId,
          zoneName: zone.sectionId,
          zoneColor,
          setTemperature: zone.temp,
          cargoType,
          palletsLoaded,
          palletsCapacity: capacity,
          shipments: positions
            .map((pos: any) => bookingById[String(pos.bookingId ?? '')]?.bookingNumber ?? '')
            .filter(Boolean),
          sqm: factors?.sqm,
          designStowageFactor: factors?.designStowageFactor,
          historicalStowageFactor: factors?.historicalStowageFactor,
          confidence: isConfirmed ? 'CONFIRMED' : 'ESTIMATED',
          podColor,
          cargoShortLabel,
          polPortCodes,
          isFull,
        });
      }
    }

    return result;
  }, [bookings, planCargoPositions, tempZoneConfig, sectionFactors, podColorMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compartment IDs with temperature conflicts — passed to SVG for red highlighting
  const conflictCompartmentIds = useMemo(
    () => [...new Set(validation.temperatureConflicts.map(c => c.compartmentId))],
    [validation.temperatureConflicts]
  );

  const stability = {
    displacement: 8450,
    estimatedGM: 2.8,
    estimatedTrim: 0.5,
    estimatedList: 0.8,
    estimatedDrafts: {
      forward: 7.2,
      aft: 7.7,
      mean: 7.45,
    },
    preliminaryCheck: {
      withinReferenceLimits: true,
      warnings: ['Port list detected'],
    },
  };

  const assignedQty = (b: CargoInPlan) => b.assignments.reduce((sum, a) => sum + a.quantity, 0);
  const remainingQty = (b: CargoInPlan) => b.totalQuantity - assignedQty(b);

  // Total pallets already assigned to a compartment across all bookings
  const usedInCompartment = useMemo(() => {
    const map: Record<string, number> = {};
    // Real bookings
    for (const b of bookings) {
      for (const a of b.assignments) {
        map[a.compartmentId] = (map[a.compartmentId] ?? 0) + a.quantity;
      }
    }
    // Engine estimate positions (FORECAST-* / CONTRACT-ESTIMATE-*)
    for (const pos of planCargoPositions) {
      const bid = String(pos.bookingId ?? '');
      if (!bid.startsWith('FORECAST-') && !bid.startsWith('CONTRACT-ESTIMATE-')) continue;
      const sectionId = pos.coolingSectionId ?? pos.compartment?.id ?? '';
      if (!sectionId) continue;
      map[sectionId] = (map[sectionId] ?? 0) + (pos.quantity ?? 0);
    }
    return map;
  }, [bookings, planCargoPositions]);

  const totalPallets = bookings.reduce((sum, b) => sum + b.totalQuantity, 0);
  const stowedPallets = bookings.reduce((sum, b) => sum + assignedQty(b), 0);

  const selectedBooking = bookings.find(b => b.bookingId === selectedBookingId) || null;

  // Section IDs assigned to a booking (used when clicking conflict booking chips)
  const sectionsForBooking = (bookingId: string): string[] =>
    bookings.find(b => b.bookingId === bookingId)?.assignments.map(a => a.compartmentId) ?? [];

  // Remap plan.cargoPositions back into per-booking assignments (after replan)
  const remapCargoPositions = (cargoPositions: any[]): Map<string, CargoAssignment[]> => {
    const map = new Map<string, CargoAssignment[]>();
    for (const pos of cargoPositions) {
      const bid = String(pos.bookingId ?? '');
      if (!bid) continue;
      if (!map.has(bid)) map.set(bid, []);
      map.get(bid)!.push({ compartmentId: pos.compartment?.id ?? '', quantity: pos.quantity ?? 0 });
    }
    return map;
  };

  const handleReplan = () => {
    const zoneOverrides = tempZoneConfig.map(z => ({ zoneId: z.sectionId, temperature: z.temp }));
    startReplanTransition(async () => {
      const result = await replanAfterTemperatureOverride(planId, zoneOverrides);
      if (result.success && result.data) {
        const posMap = remapCargoPositions(result.data.cargoPositions ?? []);
        setBookings(prev => prev.map(b => ({ ...b, assignments: posMap.get(b.bookingId) ?? [] })));
        setEngineConflicts(result.data.conflicts ?? []);
        setStabilityIndicators(result.data.stabilityIndicators ?? []);
        setGenerationMethod(result.data.generationMethod ?? 'REVISED');
        setShowReplanBanner(false);
        setSaveMsg({ type: 'success', text: `Replanned — ${(result as any).conflictCount ?? 0} hard conflict(s)` });
        setTimeout(() => setSaveMsg(null), 4000);
      } else {
        setSaveMsg({ type: 'error', text: (result as any).error ?? 'Replan failed' });
        setTimeout(() => setSaveMsg(null), 3000);
      }
    });
  };

  // ── Top-down view data ────────────────────────────────────────────────────────
  // Build the slot list for the currently selected section
  const selectedSectionSlots = useMemo((): SectionBookingSlot[] => {
    if (!selectedSectionId) return [];
    const slots: SectionBookingSlot[] = bookings.map(b => ({
      bookingId: b.bookingId,
      bookingNumber: b.bookingNumber,
      cargoType: b.cargoType,
      quantity: b.assignments.find(a => a.compartmentId === selectedSectionId)?.quantity ?? 0,
      color: podColorMap[b.pod] ?? '#64748b',
      shipperName: b.shipperName,
      consigneeName: b.consignee,
    }));

    // Add estimate slots (FORECAST-* / CONTRACT-ESTIMATE-*)
    const estimatePositions = planCargoPositions.filter((pos: any) => {
      const bid = String(pos.bookingId ?? '');
      const sid = pos.coolingSectionId ?? pos.compartment?.id ?? '';
      return sid === selectedSectionId &&
        (bid.startsWith('FORECAST-') || bid.startsWith('CONTRACT-ESTIMATE-'));
    });
    for (const pos of estimatePositions) {
      slots.push({
        bookingId: String(pos.bookingId),
        bookingNumber: pos.shipperName ?? 'Estimate',
        cargoType: pos.cargoType ?? '',
        quantity: pos.quantity ?? 0,
        color: podColorMap[pos.podPortCode ?? ''] ?? '#94a3b8',
        shipperName: (pos.shipperName ?? pos.shipperCode ?? '') as string,
        consigneeName: (pos.consigneeName ?? '') as string,
      });
    }
    return slots;
  }, [selectedSectionId, bookings, planCargoPositions, podColorMap]);

  // Resolve temperature + zone colour for the selected section
  const selectedSectionInfo = useMemo(() => {
    if (!selectedSectionId) return null;
    for (const zone of tempZoneConfig) {
      if (zone.compartments.includes(selectedSectionId)) {
        return { temperature: zone.temp, zoneColor: tempToColor(zone.temp) };
      }
    }
    return { temperature: 0, zoneColor: '#64748b' };
  }, [selectedSectionId, tempZoneConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle quantity changes from top-down paint interaction
  const handleTopDownChange = (newSlots: SectionBookingSlot[]) => {
    if (!selectedSectionId) return;
    setBookings(prev => prev.map(b => {
      const slot = newSlots.find(s => s.bookingId === b.bookingId);
      if (!slot) return b;
      if (slot.quantity === 0) {
        return { ...b, assignments: b.assignments.filter(a => a.compartmentId !== selectedSectionId) };
      }
      const existing = b.assignments.find(a => a.compartmentId === selectedSectionId);
      if (existing) {
        return { ...b, assignments: b.assignments.map(a => a.compartmentId === selectedSectionId ? { ...a, quantity: slot.quantity } : a) };
      }
      return { ...b, assignments: [...b.assignments, { compartmentId: selectedSectionId, quantity: slot.quantity }] };
    }));
  };

  const handleConfirmAssign = () => {
    if (!assigningBooking || !selectedCompartment || assignQuantity <= 0) return;

    setBookings(prev => prev.map(b => {
      if (b.bookingId !== assigningBooking.bookingId) return b;
      const existing = b.assignments.find(a => a.compartmentId === selectedCompartment);
      const updatedAssignments = existing
        ? b.assignments.map(a => a.compartmentId === selectedCompartment
            ? { ...a, quantity: a.quantity + assignQuantity }
            : a)
        : [...b.assignments, { compartmentId: selectedCompartment, quantity: assignQuantity }];
      return { ...b, assignments: updatedAssignments };
    }));
    setAssigningBooking(null);
    setSelectedCompartment('');
    setAssignQuantity(0);
  };

  const handleCancelAssign = () => {
    setAssigningBooking(null);
    setSelectedCompartment('');
    setAssignQuantity(0);
  };

  const handleRemoveAssignment = (bookingId: string, compartmentId: string) => {
    setBookings(prev => prev.map(b =>
      b.bookingId === bookingId
        ? { ...b, assignments: b.assignments.filter(a => a.compartmentId !== compartmentId) }
        : b
    ));
  };

  const handleAutoStow = () => {
    setBookings(prev => {
      const updated = prev.map(b => ({ ...b, assignments: [...b.assignments] }));
      const usedCompartments = new Set(updated.flatMap(b => b.assignments.map(a => a.compartmentId)));

      for (const booking of updated) {
        const rem = remainingQty(booking);
        if (rem <= 0) continue;

        for (const zone of tempZoneConfig) {
          const freeCompartment = zone.compartments.find(c => !usedCompartments.has(c));
          if (!freeCompartment) continue;

          booking.assignments.push({ compartmentId: freeCompartment, quantity: rem });
          usedCompartments.add(freeCompartment);
          break;
        }
      }

      return updated;
    });
  };

  const handleSavePlan = () => {
    const allAssignments = planCargoPositions.map((pos: any) => ({
      bookingId: pos.bookingId ?? undefined,
      bookingNumber: pos.bookingNumber ?? undefined,
      cargoType: pos.cargoType ?? '',
      quantity: pos.quantity ?? 0,
      snapshotTotalQuantity: pos.snapshotTotalQuantity ?? pos.quantity ?? 0,
      compartmentId: pos.coolingSectionId ?? pos.compartment?.id ?? '',
      polPortCode: pos.polPortCode ?? undefined,
      podPortCode: pos.podPortCode ?? undefined,
      consigneeName: pos.consigneeName ?? undefined,
    })).filter((a: any) => a.compartmentId && a.quantity > 0);
    startSaveTransition(async () => {
      const result = await saveCargoAssignments({ planId, assignments: allAssignments });
      setSaveMsg(
        result.success
          ? { type: 'success', text: 'Plan saved' }
          : { type: 'error', text: result.error ?? 'Failed to save' }
      );
      setTimeout(() => setSaveMsg(null), 3000);
      if (result.success) {
        setPlan(prev => ({ ...prev, status: 'DRAFT' }));
      }
    });
  };

  const handleSendToCaptain = () => {
    startSaveTransition(async () => {
      const allAssignments = planCargoPositions.map((pos: any) => ({
        bookingId: pos.bookingId ?? undefined,
        bookingNumber: pos.bookingNumber ?? undefined,
        cargoType: pos.cargoType ?? '',
        quantity: pos.quantity ?? 0,
        snapshotTotalQuantity: pos.snapshotTotalQuantity ?? pos.quantity ?? 0,
        compartmentId: pos.coolingSectionId ?? pos.compartment?.id ?? '',
        polPortCode: pos.polPortCode ?? undefined,
        podPortCode: pos.podPortCode ?? undefined,
        consigneeName: pos.consigneeName ?? undefined,
      })).filter((a: any) => a.compartmentId && a.quantity > 0);
      await saveCargoAssignments({ planId, assignments: allAssignments });

      const result = await updatePlanStatus(planId, 'READY_FOR_CAPTAIN');
      if (result.success) {
        setPlan(prev => ({ ...prev, status: 'READY_FOR_CAPTAIN' }));
        setSaveMsg({ type: 'success', text: 'Plan marked as Ready for Captain' });
      } else {
        setSaveMsg({ type: 'error', text: result.error ?? 'Failed to update status' });
      }
      setTimeout(() => setSaveMsg(null), 3000);
    });
  };

  // Plans are locked once sent — no further edits allowed
  const LOCKED_STATUSES = ['EMAIL_SENT', 'CAPTAIN_APPROVED', 'CAPTAIN_REJECTED', 'IN_REVISION', 'READY_FOR_EXECUTION', 'IN_EXECUTION', 'COMPLETED'];
  const isLocked = LOCKED_STATUSES.includes(plan.status);

  const { data: session } = useSession();
  const canEdit = ['ADMIN', 'SHIPPING_PLANNER'].includes(session?.user?.role ?? '');

  const handleMarkSent = () => {
    setShowSentModal(true);
  };

  const handleNewDraft = () => {
    startCopyTransition(async () => {
      const result = await copyStowagePlan(planId);
      if (result.success && result.planId) {
        router.push(`/stowage-plans/${result.planId}`);
      } else {
        setSaveMsg({ type: 'error', text: result.error ?? 'Failed to create new draft' });
        setTimeout(() => setSaveMsg(null), 3000);
      }
    });
  };

  const toggleValidationSection = (key: string) => {
    setExpandedValidation(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const totalViolations = validation.temperatureConflicts.length + validation.overstowViolations.length + validation.capacityViolations.length;

  const formatDate = (d: string | Date) => {
    if (!d) return '';
    return new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <AppShell activeVessel={plan.vesselName} activeVoyage={plan.voyageNumber}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
        <div className={styles.compactHeader}>
          <div className={styles.compactHeaderLeft}>
            <Link href="/stowage-plans" className={styles.backLink}>←</Link>
            <span className={styles.compactPlanNum}>{plan.planNumber}</span>
            <span className={`${styles.statusBadge} ${styles[plan.status.toLowerCase()]}`}>
              {plan.status.replace(/_/g, ' ')}
            </span>
            <span className={styles.compactSep}>·</span>
            <span className={styles.compactVoyage}>{plan.voyageNumber}</span>
          </div>
          <div className={styles.headerActions}>
            {saveMsg && (
              <span style={{
                fontSize: '0.8rem',
                color: saveMsg.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)',
                padding: '0.25rem 0.5rem',
                background: saveMsg.type === 'success' ? 'var(--color-success-muted)' : 'var(--color-danger-muted)',
                borderRadius: '4px',
              }}>
                {saveMsg.text}
              </span>
            )}
            {isLocked ? (
              <>
                <span style={{
                  fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em',
                  color: 'var(--color-warning)', background: 'var(--color-warning-muted)',
                  padding: '0.25rem 0.6rem', borderRadius: '4px',
                }}>
                  LOCKED
                </span>
                {canEdit && (
                  <button
                    className={styles.btnPrimary}
                    onClick={handleNewDraft}
                    disabled={isCopying}
                  >
                    {isCopying ? 'Creating...' : '+ New Draft'}
                  </button>
                )}
              </>
            ) : canEdit ? (
              <>
                <button className={styles.btnSecondary} onClick={handleSavePlan} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Draft'}
                </button>
                {plan.status === 'READY_FOR_CAPTAIN' ? (
                  <button className={styles.btnPrimary} onClick={handleMarkSent} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Mark as Sent'}
                  </button>
                ) : (
                  <button className={styles.btnPrimary} onClick={handleSendToCaptain} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Send to Captain'}
                  </button>
                )}
              </>
            ) : null}
            {canEdit && !isLocked && (
              <button
                className={styles.btnDanger}
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
              >
                Delete Plan
              </button>
            )}
          </div>
        </div>

        {/* Stats Bar — extended with stability data */}
        <div className={styles.statsBar}>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Total Cargo</div>
            <div className={styles.statValue}>{totalPallets} pallets</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Stowed</div>
            <div className={styles.statValue}>
              {stowedPallets} <span className={styles.statSubtext}>/ {totalPallets}</span>
            </div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Utilization</div>
            <div className={styles.statValue}>
              {Math.round((stowedPallets / 4840) * 100)}%
            </div>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <div className={styles.statLabel}>Displacement</div>
            <div className={styles.statValue}>{stability.displacement} <span className={styles.statSubtext}>MT</span></div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>GM</div>
            <div className={styles.statValue}>{stability.estimatedGM}m</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Trim</div>
            <div className={styles.statValue}>{stability.estimatedTrim > 0 ? '+' : ''}{stability.estimatedTrim}m</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>List</div>
            <div className={styles.statValue}>{stability.estimatedList}°</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Fwd Draft</div>
            <div className={styles.statValue}>{stability.estimatedDrafts.forward}m</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Aft Draft</div>
            <div className={styles.statValue}>{stability.estimatedDrafts.aft}m</div>
          </div>
          {stability.preliminaryCheck.warnings.length > 0 && (
            <div className={styles.stabilityWarningInline}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <path d="M10 2l8 16H2l8-16z" stroke="#eab308" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M10 8v4m0 3h.01" stroke="#eab308" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span>{stability.preliminaryCheck.warnings[0]}</span>
            </div>
          )}
        </div>

        {/* Stability Timeline — per-port discharge stability from engine */}
        {stabilityIndicators.length > 0 && (
          <div className={styles.stabilityTimeline}>
            <span className={styles.stabilityTimelineLabel}>
              Stability by Port
              {generationMethod !== 'MANUAL' && (
                <span className={styles.stabilityTimelineMethod}> · {generationMethod}</span>
              )}
            </span>
            <div className={styles.stabilityPorts}>
              {stabilityIndicators.map((s: any, i: number) => (
                <div
                  key={i}
                  className={styles.stabilityPort}
                  title={`Port ${s.portCode} (seq ${s.portSequence}) · Trim index: ${s.trimIndex.toFixed(3)} · List index: ${s.listIndex.toFixed(3)}`}
                >
                  <div className={`${styles.stabilityDot} ${
                    s.status === 'GREEN' ? styles.stabilityDotGreen :
                    s.status === 'YELLOW' ? styles.stabilityDotYellow :
                    styles.stabilityDotRed
                  }`} />
                  <div className={styles.stabilityBars}>
                    <div
                      className={styles.stabilityBar}
                      style={{
                        height: `${Math.min(100, Math.abs(s.trimIndex) * 800)}%`,
                        background: s.status === 'GREEN' ? '#22c55e' : s.status === 'YELLOW' ? '#eab308' : '#ef4444',
                      }}
                    />
                  </div>
                  <span className={styles.stabilityPortCode}>{s.portCode || `P${s.portSequence}`}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Booking Roster */}
      <div className={styles.cargoBar}>
        {/* Booking Roster — all bookings progress at a glance */}
        {bookings.length > 0 && (
          <div className={styles.bookingRoster}>
            {bookings.map(b => {
              const assigned = assignedQty(b);
              const remaining = b.totalQuantity - assigned;
              const pct = b.totalQuantity > 0 ? Math.min(100, (assigned / b.totalQuantity) * 100) : 0;
              const isDone = remaining <= 0;
              const isNone = assigned === 0;
              return (
                <button
                  key={b.bookingId}
                  className={`${styles.rosterCard} ${isDone ? styles.rosterDone : isNone ? styles.rosterNone : styles.rosterPartial} ${b.bookingId === selectedBookingId ? styles.rosterActive : ''}`}
                  onClick={() => setSelectedBookingId(b.bookingId)}
                  title={`${b.bookingNumber} · ${b.cargoType.replace(/_/g, ' ')} · ${b.consignee} · ${assigned}/${b.totalQuantity} pallets`}
                  disabled={isLocked && !isDone}
                >
                  <span className={styles.rosterDot} style={{ background: podColorMap[b.pod] ?? '#64748b' }} />
                  <span className={styles.rosterNum}>{b.bookingNumber}</span>
                  <div className={styles.rosterBar}>
                    <div className={styles.rosterFill} style={{ width: `${pct}%`, background: podColorMap[b.pod] ?? '#64748b' }} />
                  </div>
                  <span className={`${styles.rosterCount} ${isDone ? styles.rosterCountDone : isNone ? styles.rosterCountNone : styles.rosterCountPartial}`}>
                    {isDone ? '✓' : `${remaining} left`}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Assignment tags for selected booking */}
        {selectedBooking && selectedBooking.assignments.length > 0 && (
          <div className={styles.assignmentTags}>
            {selectedBooking.assignments.map(a => (
              <span key={a.compartmentId} className={styles.assignmentTag}>
                <span className={styles.compartmentTag}>{a.compartmentId}</span>
                <span className={styles.assignmentQty}>{a.quantity} pal</span>
                {!isLocked && canEdit && (
                  <button
                    className={styles.btnRemoveSmall}
                    onClick={() => handleRemoveAssignment(selectedBooking.bookingId, a.compartmentId)}
                  >✕</button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Replan Banner — shown after zone temperature changes */}
      {showReplanBanner && !isLocked && canEdit && (
        <div className={styles.replanBanner}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
            <path d="M10 2l8 16H2l8-16z" stroke="#eab308" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M10 8v4m0 3h.01" stroke="#eab308" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span className={styles.replanBannerMsg}>
            Zone temperatures updated. Run Auto-Reassign to recalculate cargo assignments with the new temperatures.
          </span>
          <button
            className={styles.btnReplan}
            onClick={handleReplan}
            disabled={isReplanning}
          >
            {isReplanning ? 'Reassigning…' : '⚡ Auto-Reassign Bookings'}
          </button>
          <button className={styles.modalClose} onClick={() => setShowReplanBanner(false)} title="Dismiss">✕</button>
        </div>
      )}

      {/* Vessel Profile SVG — full width; click a section to drill into top-down view */}
      <div className={styles.svgContainer}>
        <VesselProfile
          vesselName={plan.vesselName}
          voyageNumber={plan.voyageNumber}
          tempAssignments={vesselProfileData}
          conflictCompartmentIds={conflictCompartmentIds}
          highlightedCompartmentIds={highlightedSectionIds}
          vesselLayout={vesselLayout}
          consigneesBySection={consigneesBySection}
          onCompartmentClick={(id) => {
            setSelectedSectionId(prev => prev === id ? null : id);
            setHighlightedSectionIds([]);
          }}
        />
        {/* POD color legend */}
        {Object.keys(podColorMap).length > 0 && (
          <div className={styles.podLegend}>
            {Object.entries(podColorMap).map(([pod, color]) => (
              <div key={pod} className={styles.podLegendItem}>
                <span className={styles.podLegendDot} style={{ background: color }} />
                <span className={styles.podLegendLabel}>{pod}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cell Booking Panel — section info + consignees always; eligible bookings when editable */}
      {selectedSectionId && (() => {
        const zone = tempZoneConfig.find(z => z.compartments.includes(selectedSectionId));
        const zoneTemp = zone?.temp;
        const sectionCap = compartmentCapacities[selectedSectionId] ?? 0;
        const sectionUsed = usedInCompartment[selectedSectionId] ?? 0;
        const sectionFree = Math.max(0, sectionCap - sectionUsed);

        // Consignees from saved cargo positions for this section
        const sectionPositions = planCargoPositions.filter(
          pos => (pos.coolingSectionId ?? pos.compartment?.id) === selectedSectionId
        );
        const consigneeNames = [...new Set(
          sectionPositions.map((pos: any) => {
            // 1. Consignee name saved directly on the position (real bookings, engine output)
            if (pos.consigneeName) return pos.consigneeName as string;
            // 2. Shipper name as fallback for estimate positions
            if (pos.shipperName) return pos.shipperName as string;
            // 3. Look up in confirmed bookings state
            return bookings.find(b => b.bookingId === String(pos.bookingId ?? ''))?.consignee ?? '';
          }).filter(Boolean)
        )] as string[];

        // For estimate positions, build descriptive labels (shipper · qty · POL→POD)
        const estimateLabels = sectionPositions
          .filter((pos: any) => {
            const bid = String(pos.bookingId ?? '');
            return bid.startsWith('FORECAST-') || bid.startsWith('CONTRACT-ESTIMATE-');
          })
          .map((pos: any) => {
            const qty = pos.quantity ?? 0;
            const shipper = pos.shipperName ?? '';
            const pol = pos.polPortCode ?? '';
            const pod = pos.podPortCode ?? '';
            return `${shipper || 'Estimate'} · ${qty} pal${pol ? ` · ${pol}→${pod}` : ''}`;
          });

        const eligibleBookings = canEdit && !isLocked ? bookings.filter(b => {
          if (remainingQty(b) <= 0) return false;
          return true;
        }) : [];

        return (
          <div className={styles.cellPanel}>
            <div className={styles.cellPanelHeader}>
              <span className={styles.cellPanelSection}>{selectedSectionId}</span>
              {zone && (
                <span className={styles.cellPanelTemp}>
                  {zone.temp > 0 ? '+' : ''}{zone.temp}°C{canEdit && !isLocked ? ` · ${sectionFree} free of ${sectionCap}` : ''}
                </span>
              )}
              {canEdit && !isLocked && <span className={styles.cellPanelTitle}>Eligible Bookings</span>}
              <button className={styles.cellPanelClose} onClick={() => setSelectedSectionId(null)}>✕</button>
            </div>
            {/* Consignees row */}
            <div style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', marginRight: '0.4rem' }}>Consignees:</span>
              {consigneeNames.length > 0
                ? consigneeNames.map((name, i) => (
                    <span key={name} style={{ display: 'inline-block', background: 'var(--surface-base)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0 0.4rem', marginRight: i < consigneeNames.length - 1 ? '0.3rem' : 0, fontSize: '0.75rem' }}>{name}</span>
                  ))
                : estimateLabels.length > 0
                ? (
                  <>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--surface-muted)', border: '1px solid var(--border-color)', borderRadius: '3px', padding: '0 0.3rem', marginRight: '0.4rem' }}>Est.</span>
                    {estimateLabels.map((label, i) => (
                      <span key={i} style={{ display: 'inline-block', color: 'var(--text-muted)', fontSize: '0.75rem', marginRight: i < estimateLabels.length - 1 ? '0.5rem' : 0 }}>{label}</span>
                    ))}
                  </>
                )
                : <span style={{ color: 'var(--text-muted)' }}>No cargo assigned</span>
              }
            </div>
            {canEdit && !isLocked && (
              eligibleBookings.length === 0 ? (
                <p className={styles.cellPanelEmpty}>No eligible bookings for this temperature zone.</p>
              ) : (
                <div className={styles.cellPanelList}>
                  {eligibleBookings.map(b => {
                    const remaining = remainingQty(b);
                    return (
                      <div
                        key={b.bookingId}
                        className={`${styles.cellPanelRow} ${b.bookingId === selectedBookingId ? styles.cellPanelRowActive : ''}`}
                      >
                        <span className={styles.cellPanelDot} style={{ background: podColorMap[b.pod] ?? '#64748b' }} />
                        <span className={styles.cellPanelBookingNum}>{b.bookingNumber}</span>
                        <span className={styles.cellPanelCargo}>{b.cargoType.replace(/_/g, ' ')}</span>
                        <span className={styles.cellPanelShipper}>{b.shipperName || b.consignee}</span>
                        <span className={styles.cellPanelRoute}>{b.pol} → {b.pod}</span>
                        <span className={styles.cellPanelPallets}>{remaining} pal left</span>
                        <button
                          className={styles.cellPanelAssign}
                          onClick={() => {
                            setSelectedBookingId(b.bookingId);
                            setAssigningBooking(b);
                            setSelectedCompartment(selectedSectionId);
                            setAssignQuantity(Math.min(remaining, sectionFree) || 1);
                          }}
                        >
                          Assign
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        );
      })()}

      {/* Top-down cooling section view — rendered when a section is selected */}
      {selectedSectionId && selectedSectionInfo && (
        <CoolingSectionTopDown
          sectionId={selectedSectionId}
          capacity={compartmentCapacities[selectedSectionId] ?? 0}
          temperature={selectedSectionInfo.temperature}
          zoneColor={selectedSectionInfo.zoneColor}
          slots={selectedSectionSlots}
          selectedBookingId={selectedBookingId}
          isLocked={isLocked || !canEdit}
          onSlotsChange={handleTopDownChange}
          onClose={() => setSelectedSectionId(null)}
        />
      )}

      {/* Validation Panel — below SVG, collapsible sections */}
      <div className={styles.validationCollapsible}>

        {/* Engine Analysis — conflicts from auto-generated plan */}
        {engineConflicts.length > 0 && (
          <div className={styles.validationSection}>
            <button
              className={styles.validationSectionHeader}
              onClick={() => toggleValidationSection('engine')}
            >
              <span>Engine Analysis</span>
              {engineConflicts.filter((c: any) => c.type !== 'STABILITY_WARNING').length > 0 ? (
                <span className={styles.badge}>
                  {engineConflicts.filter((c: any) => c.type !== 'STABILITY_WARNING').length}
                </span>
              ) : (
                <span className={styles.badgeWarning}>{engineConflicts.length}</span>
              )}
              <svg
                className={`${styles.chevron} ${expandedValidation.engine ? styles.chevronOpen : ''}`}
                width="16" height="16" viewBox="0 0 16 16" fill="none"
              >
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            {expandedValidation.engine && (
              <div className={styles.validationSectionContent}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  Generated by stowage engine ·{' '}
                  <strong style={{ color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    {generationMethod}
                  </strong>
                </p>
                {engineConflicts.map((conflict: any, idx: number) => (
                  <div
                    key={idx}
                    className={conflict.type === 'STABILITY_WARNING' ? styles.conflictCardWarning : styles.conflictCard}
                  >
                    <div className={styles.conflictHeader}>
                      <span className={styles[`engineConflict${conflict.type}`] ?? styles.engineConflictDefault}>
                        {conflict.type.replace(/_/g, ' ')}
                      </span>
                      {conflict.palletsAffected > 0 && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                          {conflict.palletsAffected} plt affected
                        </span>
                      )}
                    </div>
                    <p>{conflict.message}</p>
                    {conflict.bookingIds?.length > 0 && (
                      <div className={styles.conflictBookingChips}>
                        {conflict.bookingIds.map((bid: string) => {
                          const b = bookings.find(bk => bk.bookingId === bid);
                          const secs = sectionsForBooking(bid);
                          const isActive = secs.length > 0 && secs.every(s => highlightedSectionIds.includes(s));
                          return (
                            <button
                              key={bid}
                              className={`${styles.conflictChip} ${isActive ? styles.conflictChipActive : ''}`}
                              onClick={() => setHighlightedSectionIds(isActive ? [] : secs)}
                              title={`Highlight sections for ${b?.bookingNumber ?? bid}`}
                            >
                              {b?.bookingNumber ?? bid.slice(-6)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {conflict.suggestedActions?.length > 0 && (
                      <div className={styles.conflictSuggestions}>
                        <span className={styles.conflictSuggestLabel}>Suggested:</span>
                        {conflict.suggestedActions.map((action: string, i: number) => (
                          <span key={i} className={styles.conflictSuggestChip}>{action}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Temperature Conflicts */}
        <div className={styles.validationSection}>
          <button
            className={styles.validationSectionHeader}
            onClick={() => toggleValidationSection('temperature')}
          >
            <span>Temperature Conflicts</span>
            {validation.temperatureConflicts.length > 0 && (
              <span className={styles.badge}>{validation.temperatureConflicts.length}</span>
            )}
            <svg
              className={`${styles.chevron} ${expandedValidation.temperature ? styles.chevronOpen : ''}`}
              width="16" height="16" viewBox="0 0 16 16" fill="none"
            >
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          {expandedValidation.temperature && (
            <div className={styles.validationSectionContent}>
              <div className={styles.successBox}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="2"/>
                  <path d="M8 12l3 3 5-6" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span>No temperature conflicts</span>
              </div>
            </div>
          )}
        </div>

        {/* Overstow Violations */}
        <div className={styles.validationSection}>
          <button
            className={styles.validationSectionHeader}
            onClick={() => toggleValidationSection('overstow')}
          >
            <span>Overstow Violations</span>
            {validation.overstowViolations.length > 0 && (
              <span className={styles.badge}>{validation.overstowViolations.length}</span>
            )}
            <svg
              className={`${styles.chevron} ${expandedValidation.overstow ? styles.chevronOpen : ''}`}
              width="16" height="16" viewBox="0 0 16 16" fill="none"
            >
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          {expandedValidation.overstow && (
            <div className={styles.validationSectionContent}>
              {validation.overstowViolations.length === 0 ? (
                <div className={styles.successBox}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="2"/>
                    <path d="M8 12l3 3 5-6" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <span>No overstow violations</span>
                </div>
              ) : (
                validation.overstowViolations.map((v, idx) => (
                  <div key={idx} className={styles.conflictCard}>
                    <div className={styles.conflictHeader}>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <circle cx="10" cy="10" r="8" stroke="#ef4444" strokeWidth="2"/>
                        <path d="M10 6v4m0 4h.01" stroke="#ef4444" strokeWidth="2"/>
                      </svg>
                      <span>{v.compartmentId}</span>
                    </div>
                    <p>{v.description}</p>
                    <div className={styles.affectedShipments}>
                      Affected: {v.affectedBookings.join(', ')}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Capacity Warnings */}
        <div className={styles.validationSection}>
          <button
            className={styles.validationSectionHeader}
            onClick={() => toggleValidationSection('capacity')}
          >
            <span>Capacity Warnings</span>
            {validation.capacityViolations.length > 0 && (
              <span className={styles.badge}>{validation.capacityViolations.length}</span>
            )}
            <svg
              className={`${styles.chevron} ${expandedValidation.capacity ? styles.chevronOpen : ''}`}
              width="16" height="16" viewBox="0 0 16 16" fill="none"
            >
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          {expandedValidation.capacity && (
            <div className={styles.validationSectionContent}>
              {validation.capacityViolations.length === 0 ? (
                <div className={styles.successBox}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="2"/>
                    <path d="M8 12l3 3 5-6" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <span>All compartments within capacity</span>
                </div>
              ) : (
                validation.capacityViolations.map((v, idx) => (
                  <div key={idx} className={styles.conflictCard}>
                    <div className={styles.conflictHeader}>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <circle cx="10" cy="10" r="8" stroke="#ef4444" strokeWidth="2"/>
                        <path d="M10 6v4m0 4h.01" stroke="#ef4444" strokeWidth="2"/>
                      </svg>
                      <span>{v.compartmentId}</span>
                      <span className={styles.overCapacityBadge}>+{v.overBy} over</span>
                    </div>
                    <p>{v.description}</p>
                    <div className={styles.affectedShipments}>
                      Affected: {v.affectedBookings.join(', ')}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Weight Distribution */}
        <div className={styles.validationSection}>
          <button
            className={styles.validationSectionHeader}
            onClick={() => toggleValidationSection('weight')}
          >
            <span>Weight Distribution</span>
            {validation.weightDistributionWarnings.length > 0 && (
              <span className={styles.badgeWarning}>{validation.weightDistributionWarnings.length}</span>
            )}
            <svg
              className={`${styles.chevron} ${expandedValidation.weight ? styles.chevronOpen : ''}`}
              width="16" height="16" viewBox="0 0 16 16" fill="none"
            >
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          {expandedValidation.weight && (
            <div className={styles.validationSectionContent}>
              {validation.weightDistributionWarnings.map((warning, idx) => (
                <div key={idx} className={styles.warningCard}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2l8 16H2l8-16z" stroke="#eab308" strokeWidth="1.5"/>
                    <path d="M10 8v4m0 3h.01" stroke="#eab308" strokeWidth="2"/>
                  </svg>
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {totalViolations === 0 && validation.weightDistributionWarnings.length === 0 && (
          <div className={styles.successBox}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="2"/>
              <path d="M8 12l3 3 5-6" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span>No validation issues found. Plan is ready for captain review.</span>
          </div>
        )}
      </div>

      {/* Communication Log */}
      {(communicationLog.length > 0 || captainComm?.responseType) && (
        <div className={styles.commLog}>
          <h3 className={styles.commLogTitle}>Communication Log</h3>

          {communicationLog.map((entry: any, idx: number) => (
            <div key={idx} className={styles.commLogEntry}>
              <div className={styles.commLogEntryHeader}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={styles.commLogIcon}>
                  <path d="M4 4h16v12H4V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M4 4l8 8 8-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span className={styles.commLogDate}>{formatDate(entry.sentAt)}</span>
                <span className={styles.commLogSentBy}>by {entry.sentBy || 'system'}</span>
                {entry.planStatus && (
                  <span className={styles.commLogStatusBadge}>{entry.planStatus.replace(/_/g, ' ')}</span>
                )}
              </div>

              <div className={styles.commLogRecipients}>
                {entry.recipients?.map((r: any, i: number) => (
                  <span key={i} className={r.role === 'CAPTAIN' ? styles.recipientCaptain : styles.recipientCC}>
                    {r.role === 'CAPTAIN' ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M3 18l9-13 9 13H3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <span className={styles.ccLabel}>CC</span>
                    )}
                    {r.name ? `${r.name} <${r.email}>` : r.email}
                  </span>
                ))}
              </div>

              {entry.note && (
                <p className={styles.commLogNote}>"{entry.note}"</p>
              )}
            </div>
          ))}

          {captainComm?.responseType && captainComm.responseType !== 'PENDING' && (
            <div className={captainComm.responseType === 'APPROVED' ? styles.captainApproved : styles.captainRejected}>
              <div className={styles.captainResponseHeader}>
                {captainComm.responseType === 'APPROVED' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="2"/>
                    <path d="M8 12l3 3 5-6" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="2"/>
                    <path d="M9 9l6 6M15 9l-6 6" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                )}
                <span className={styles.captainResponseLabel}>
                  Captain {captainComm.responseType === 'APPROVED' ? 'Approved' : 'Rejected'}
                </span>
                {captainComm.captainName && (
                  <span className={styles.captainName}>{captainComm.captainName}</span>
                )}
                {captainComm.responseReceivedAt && (
                  <span className={styles.commLogDate}>{formatDate(captainComm.responseReceivedAt)}</span>
                )}
              </div>

              {captainComm.captainComments && (
                <p className={styles.captainComments}>"{captainComm.captainComments}"</p>
              )}

              {captainComm.rejectionReasons && captainComm.rejectionReasons.length > 0 && (
                <ul className={styles.rejectionReasons}>
                  {captainComm.rejectionReasons.map((reason: string, i: number) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Assign to Compartment Modal */}
      {assigningBooking && (
        <div className={styles.modalOverlay} onClick={handleCancelAssign}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Assign {assigningBooking.bookingNumber}</h3>
              <button className={styles.modalClose} onClick={handleCancelAssign}>✕</button>
            </div>

            <div className={styles.modalMeta}>
              <span
                className={styles.cargoDot}
                style={{ backgroundColor: podColorMap[assigningBooking.pod] ?? '#64748b' }}
              />
              <span>{assigningBooking.cargoType.replace('_', ' ')}</span>
              <span className={styles.separator}>·</span>
              <span>{assignedQty(assigningBooking)}/{assigningBooking.totalQuantity} pallets assigned</span>
              <span className={styles.separator}>·</span>
              <span>{assigningBooking.consignee}</span>
            </div>

            <div className={styles.compartmentList}>
              {tempZoneConfig.map(zone => (
                <div key={zone.sectionId} className={styles.zoneGroup}>
                  <div className={styles.zoneGroupLabel}>
                    {zone.sectionId}
                    <span className={styles.zoneGroupTemp}>
                      {zone.temp > 0 ? '+' : ''}{zone.temp}°C
                    </span>
                  </div>
                  {zone.compartments.map(compId => {
                    const cap = compartmentCapacities[compId] ?? 0;
                    const used = usedInCompartment[compId] ?? 0;
                    const free = cap - used;
                    const isFull = cap > 0 && free <= 0;
                    const fillPct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
                    const fillColor = fillPct >= 100 ? '#ef4444' : fillPct >= 80 ? '#eab308' : '#22c55e';
                    return (
                      <label
                        key={compId}
                        className={`${styles.compartmentOption} ${selectedCompartment === compId ? styles.selected : ''} ${isFull ? styles.compartmentFull : ''}`}
                      >
                        <input
                          type="radio"
                          name="compartment"
                          value={compId}
                          checked={selectedCompartment === compId}
                          onChange={() => {
                            setSelectedCompartment(compId);
                            // Auto-cap qty to compartment free capacity
                            if (assigningBooking && free > 0) {
                              setAssignQuantity(Math.min(remainingQty(assigningBooking), free));
                            }
                          }}
                        />
                        <span className={styles.compartmentId}>{compId}</span>
                        {cap > 0 && (
                          <>
                            <div className={styles.compartmentFillBar}>
                              <div className={styles.compartmentFillInner} style={{ width: `${fillPct}%`, background: fillColor }} />
                            </div>
                            <span className={isFull ? styles.capacityFull : styles.capacityFree}>
                              {isFull ? 'full' : `${free} free`}
                            </span>
                          </>
                        )}
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className={styles.quantityRow}>
              <label className={styles.quantityLabel}>
                Pallets to assign:
              </label>
              <input
                type="number"
                className={styles.quantityInput}
                value={assignQuantity}
                min={1}
                max={remainingQty(assigningBooking)}
                onChange={e => { setAssignQuantity(parseInt(e.target.value) || 0); }}
              />
              <span className={styles.quantityMax}>/ {remainingQty(assigningBooking)} remaining</span>
            </div>

            {selectedCompartment && assignQuantity > 0 && (() => {
              const cap = compartmentCapacities[selectedCompartment];
              const used = usedInCompartment[selectedCompartment] ?? 0;
              if (!cap) return null;
              const wouldUse = used + assignQuantity;
              if (wouldUse <= cap) return null;
              return (
                <div className={styles.capacityWarning}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2l8 16H2l8-16z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M10 8v4m0 3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <div>
                    <strong>Capacity Warning</strong>
                    <p>
                      {selectedCompartment} holds {cap} pallets max. Already used: {used}.<br />
                      Assigning {assignQuantity} would exceed capacity by <strong>{wouldUse - cap} pallets</strong>.
                    </p>
                  </div>
                </div>
              );
            })()}

            <div className={styles.modalActions}>
              <button className={styles.btnSecondary} onClick={handleCancelAssign}>
                Cancel
              </button>
              <button
                className={styles.btnPrimary}
                disabled={!selectedCompartment || assignQuantity <= 0}
                onClick={handleConfirmAssign}
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Mark as Sent Modal */}
      {showSentModal && (
        <MarkSentModal
          planId={planId}
          planNumber={plan.planNumber}
          vesselName={plan.vesselName}
          captainEmail={plan.captainEmail}
          onClose={() => setShowSentModal(false)}
          onSuccess={() => {
            setShowSentModal(false);
            setPlan(prev => ({ ...prev, status: 'EMAIL_SENT' }));
            setSaveMsg({ type: 'success', text: 'Plan locked — marked as sent to captain' });
            setTimeout(() => setSaveMsg(null), 4000);
          }}
        />
      )}

      {/* Delete Plan Confirmation Modal */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
            borderRadius: '12px', padding: '2rem', maxWidth: '400px', width: '90%',
          }}>
            <h3 style={{ margin: '0 0 1rem', color: 'var(--color-text-primary)', fontSize: '1.1rem', fontWeight: 600 }}>
              Delete Stowage Plan
            </h3>
            <p style={{ margin: '0 0 1.5rem', color: 'var(--color-text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
              Delete plan <strong style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>{plan.planNumber}</strong>?
              This cannot be undone.
            </p>
            {deleteError && (
              <p style={{ margin: '0 0 1rem', color: 'var(--color-danger)', fontSize: '0.8rem' }}>{deleteError}</p>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                style={{
                  padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer',
                  border: '1px solid var(--color-border)', background: 'transparent',
                  color: 'var(--color-text-secondary)', fontSize: '0.875rem',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  startDeleteTransition(async () => {
                    const result = await deleteStowagePlan(planId);
                    if (result.success) {
                      router.push('/stowage-plans');
                    } else {
                      setDeleteError(result.error ?? 'Failed to delete plan');
                      setShowDeleteConfirm(false);
                    }
                  });
                }}
                disabled={isDeleting}
                style={{
                  padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer',
                  border: 'none', background: 'var(--color-danger)', color: 'white', fontSize: '0.875rem',
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </AppShell>
  );
}
