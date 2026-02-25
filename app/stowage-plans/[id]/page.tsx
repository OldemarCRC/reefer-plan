// app/stowage-plans/[id]/page.tsx
'use client';

import { useState, useMemo, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AppShell from '@/components/layout/AppShell';
import VesselProfile from '@/components/vessel/VesselProfile';
import { getStowagePlanById, deleteStowagePlan, saveCargoAssignments, updatePlanStatus, copyStowagePlan } from '@/app/actions/stowage-plan';
import MarkSentModal from '@/components/stowage/MarkSentModal';
import { getConfirmedBookingsForVoyage } from '@/app/actions/booking';
import ConfigureZonesModal, { type ZoneConfig } from '@/components/vessel/ConfigureZonesModal';
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
  const [showConflictWarning, setShowConflictWarning] = useState(false);
  const [confirmedConflicts, setConfirmedConflicts] = useState<Set<string>>(new Set());
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [isCopying, startCopyTransition] = useTransition();
  const [showSentModal, setShowSentModal] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string>('');
  const [expandedValidation, setExpandedValidation] = useState<Record<string, boolean>>({});
  const [communicationLog, setCommunicationLog] = useState<any[]>([]);
  const [captainComm, setCaptainComm] = useState<any>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  // Plan header info — populated from DB on mount
  const [plan, setPlan] = useState({
    _id: planId,
    planNumber: '...',
    voyageNumber: '...',
    vesselName: '...',
    captainEmail: undefined as string | undefined,
    status: 'DRAFT',
  });

  const defaultTempZoneConfig = [
    { sectionId: '1AB',    zoneId: 'ZONE_1AB',    temp: 13, compartments: ['1A', '1B'] },
    { sectionId: '1CD',    zoneId: 'ZONE_1CD',    temp: 13, compartments: ['1C', '1D'] },
    { sectionId: '2UPDAB', zoneId: 'ZONE_2UPDAB', temp: 13, compartments: ['2UPD', '2A', '2B'] },
    { sectionId: '2CD',    zoneId: 'ZONE_2CD',    temp: 13, compartments: ['2C', '2D'] },
    { sectionId: '3UPDAB', zoneId: 'ZONE_3UPDAB', temp: 13, compartments: ['3UPD', '3A', '3B'] },
    { sectionId: '3CD',    zoneId: 'ZONE_3CD',    temp: 13, compartments: ['3C', '3D'] },
    { sectionId: '4UPDAB', zoneId: 'ZONE_4UPDAB', temp: 13, compartments: ['4UPD', '4A', '4B'] },
    { sectionId: '4CD',    zoneId: 'ZONE_4CD',    temp: 13, compartments: ['4C', '4D'] },
  ];

  const [tempZoneConfig, setTempZoneConfig] = useState(defaultTempZoneConfig);

  const [bookings, setBookings] = useState<CargoInPlan[]>([]);

  // Stowage factor data per compartment — extracted from the populated vessel
  const [sectionFactors, setSectionFactors] = useState<Record<string, {
    sqm: number;
    designStowageFactor: number;
    historicalStowageFactor?: number;
  }>>({});

  // Vessel layout built from DB temperatureZones — drives VesselProfile SVG
  const [vesselLayout, setVesselLayout] = useState<VesselLayout | undefined>(undefined);

  useEffect(() => {
    getStowagePlanById(planId).then(async (result) => {
      if (result.success && result.data) {
        const p = result.data;
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
          const factors: Record<string, { sqm: number; designStowageFactor: number; historicalStowageFactor?: number }> = {};
          for (const zone of temperatureZones) {
            for (const section of zone.coolingSections ?? []) {
              factors[section.sectionId] = {
                sqm: section.sqm ?? 0,
                designStowageFactor: section.designStowageFactor ?? 1.32,
                historicalStowageFactor: section.historicalStowageFactor ?? undefined,
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

        // Use real cooling section temperatures from the plan if available
        if (Array.isArray(p.coolingSectionStatus) && p.coolingSectionStatus.length > 0) {
          setTempZoneConfig(
            p.coolingSectionStatus.map((cs: any) => ({
              sectionId: cs.zoneId,
              zoneId: `ZONE_${cs.zoneId}`,
              temp: cs.assignedTemperature ?? 13,
              compartments: cs.coolingSectionIds ?? [],
            }))
          );
        }

        // Communication log + captain response
        setCommunicationLog(p.communicationLog ?? []);
        setCaptainComm(p.captainCommunication ?? null);

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

            const mapped = bookingsResult.data.map((b: any) => ({
              bookingId: b._id,
              bookingNumber: b.bookingNumber,
              cargoType: b.cargoType ?? '',
              totalQuantity: b.confirmedQuantity ?? b.requestedQuantity ?? 0,
              pol: b.pol?.portCode ?? '',
              pod: b.pod?.portCode ?? '',
              consignee: b.consignee?.name ?? '',
              shipperName: b.shipper?.name ?? '',
              assignments: positionsByBooking[b._id] ?? [],
            }));

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


  // Required temperature range per cargo type (shared by validation + auto-stow)
  const cargoTempRequirements: Record<string, { min: number; max: number }> = {
    BANANAS:       { min: 12, max: 14 },
    TABLE_GRAPES:  { min: -1, max:  1 },
    AVOCADOS:      { min:  5, max:  8 },
    CITRUS:        { min:  4, max:  8 },
    BERRIES:       { min:  0, max:  2 },
    PINEAPPLES:    { min: 10, max: 13 },
    KIWIS:         { min:  0, max:  2 },
    FROZEN_FISH:   { min: -25, max: -18 },
    OTHER_FROZEN:  { min: -25, max: -15 },
    OTHER_CHILLED: { min:  0, max: 10 },
  };

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

  // Compartment capacities (pallets) — from vessel spec
  const compartmentCapacities: Record<string, number> = {
    '1A': 480, '1B': 278, '1C': 191, '1D': 186,
    '2UPD': 143, '2A': 565, '2B': 499, '2C': 485, '2D': 375,
    '3UPD': 136, '3A': 604, '3B': 577, '3C': 608, '3D': 543,
    '4UPD': 136, '4A': 583, '4B': 544, '4C': 502, '4D': 336,
  };

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

      // Temperature conflict check
      for (const { booking, quantity } of entries) {
        const req = cargoTempRequirements[booking.cargoType];
        if (req && (section.temp < req.min || section.temp > req.max)) {
          const userConfirmed = confirmedConflicts.has(`${booking.bookingId}-${compId}`);
          temperatureConflicts.push({
            compartmentId: compId,
            coolingSectionId: section.sectionId,
            description: `${booking.cargoType.replace('_', ' ')} (${quantity} pallets) requires ${req.min}–${req.max}°C but ${section.sectionId} is set to ${section.temp > 0 ? '+' : ''}${section.temp}°C`,
            affectedBookings: [booking.bookingNumber],
            userConfirmed,
            cargoType: booking.cargoType,
            bookingId: booking.bookingId,
            quantity,
          });
        }
      }

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
  }, [bookings, compartmentToSection, confirmedConflicts]);

  // Auto-expand validation sections that have violations
  useEffect(() => {
    const expanded: Record<string, boolean> = {};
    if (validation.temperatureConflicts.length > 0) expanded.temperature = true;
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

  // Transform plan data to VesselProfile format
  const vesselProfileData = useMemo(() => {
    const result: VoyageTempAssignment[] = [];

    // Build assignment lookup
    const byCompartment: Record<string, { booking: CargoInPlan; quantity: number }[]> = {};
    for (const b of bookings) {
      for (const a of b.assignments) {
        if (!byCompartment[a.compartmentId]) byCompartment[a.compartmentId] = [];
        byCompartment[a.compartmentId].push({ booking: b, quantity: a.quantity });
      }
    }

    for (const zone of tempZoneConfig) {
      const zoneColor = tempToColor(zone.temp);
      for (const compId of zone.compartments) {
        const entries = byCompartment[compId] || [];
        const palletsLoaded = entries.reduce((sum, e) => sum + e.quantity, 0);
        const capacity = compartmentCapacities[compId] || 0;

        // Determine cargo type: use first booking's type if any, otherwise empty
        const cargoType = entries.length > 0 ? entries[0].booking.cargoType : '';

        const factors = sectionFactors[compId];
        result.push({
          compartmentId: compId,
          zoneId: zone.zoneId,
          zoneName: zone.sectionId,
          zoneColor,
          setTemperature: zone.temp,
          cargoType,
          palletsLoaded,
          palletsCapacity: capacity,
          shipments: entries.map(e => e.booking.bookingNumber),
          sqm: factors?.sqm,
          designStowageFactor: factors?.designStowageFactor,
          historicalStowageFactor: factors?.historicalStowageFactor,
        });
      }
    }

    return result;
  }, [bookings, tempZoneConfig, sectionFactors]);

  // Compartment IDs with temperature conflicts — passed to SVG for red highlighting
  const conflictCompartmentIds = useMemo(
    () => [...new Set(validation.temperatureConflicts.map(c => c.compartmentId))],
    [validation.temperatureConflicts]
  );

  // For each conflict, find compartments in zones with compatible temperature
  const conflictSuggestions = useMemo(() => {
    return validation.temperatureConflicts.map(conflict => {
      const req = cargoTempRequirements[conflict.cargoType];
      if (!req) return { ...conflict, suggestions: [] };

      // Compute how many pallets are already in each compartment
      const loadedByComp: Record<string, number> = {};
      for (const b of bookings) {
        for (const a of b.assignments) {
          loadedByComp[a.compartmentId] = (loadedByComp[a.compartmentId] ?? 0) + a.quantity;
        }
      }

      const suggestions: { compartmentId: string; sectionId: string; temp: number; free: number }[] = [];
      for (const zone of tempZoneConfig) {
        if (zone.temp < req.min || zone.temp > req.max) continue;
        for (const compId of zone.compartments) {
          if (compId === conflict.compartmentId) continue;
          const capacity = compartmentCapacities[compId] ?? 0;
          const loaded = loadedByComp[compId] ?? 0;
          const free = capacity - loaded;
          if (free > 0) {
            suggestions.push({ compartmentId: compId, sectionId: zone.sectionId, temp: zone.temp, free });
          }
        }
      }
      // Sort by most free space first, cap at 4
      suggestions.sort((a, b) => b.free - a.free);
      return { ...conflict, suggestions: suggestions.slice(0, 4) };
    });
  }, [validation.temperatureConflicts, bookings, tempZoneConfig]);

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
    for (const b of bookings) {
      for (const a of b.assignments) {
        map[a.compartmentId] = (map[a.compartmentId] ?? 0) + a.quantity;
      }
    }
    return map;
  }, [bookings]);

  const totalPallets = bookings.reduce((sum, b) => sum + b.totalQuantity, 0);
  const stowedPallets = bookings.reduce((sum, b) => sum + assignedQty(b), 0);

  const selectedBooking = bookings.find(b => b.bookingId === selectedBookingId) || null;

  const getCargoTypeColor = (cargoType: string) => {
    const colors: Record<string, string> = {
      BANANAS: '#eab308',
      TABLE_GRAPES: '#8b5cf6',
      AVOCADOS: '#22c55e',
      CITRUS: '#f97316',
      BERRIES: '#ec4899',
      FROZEN_FISH: '#06b6d4',
    };
    return colors[cargoType] || '#64748b';
  };

  // ── Top-down view data ────────────────────────────────────────────────────────
  // Build the slot list for the currently selected section
  const selectedSectionSlots = useMemo((): SectionBookingSlot[] => {
    if (!selectedSectionId) return [];
    return bookings.map(b => ({
      bookingId: b.bookingId,
      bookingNumber: b.bookingNumber,
      cargoType: b.cargoType,
      quantity: b.assignments.find(a => a.compartmentId === selectedSectionId)?.quantity ?? 0,
      color: getCargoTypeColor(b.cargoType),
    }));
  }, [selectedSectionId, bookings]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const section = compartmentToSection[selectedCompartment];
    const req = cargoTempRequirements[assigningBooking.cargoType];
    const hasConflict = req && section && (section.temp < req.min || section.temp > req.max);

    if (hasConflict && !showConflictWarning) {
      setShowConflictWarning(true);
      return;
    }

    if (hasConflict) {
      setConfirmedConflicts(prev => new Set([...prev, `${assigningBooking.bookingId}-${selectedCompartment}`]));
    }

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
    setShowConflictWarning(false);
  };

  const handleCancelAssign = () => {
    setAssigningBooking(null);
    setSelectedCompartment('');
    setAssignQuantity(0);
    setShowConflictWarning(false);
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

        const req = cargoTempRequirements[booking.cargoType];
        if (!req) continue;

        for (const zone of tempZoneConfig) {
          if (zone.temp < req.min || zone.temp > req.max) continue;

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
    const allAssignments = bookings.flatMap(b =>
      b.assignments.map(a => ({
        bookingId: b.bookingId,
        cargoType: b.cargoType,
        quantity: a.quantity,
        compartmentId: a.compartmentId,
      }))
    );
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
      const allAssignments = bookings.flatMap(b =>
        b.assignments.map(a => ({
          bookingId: b.bookingId,
          cargoType: b.cargoType,
          quantity: a.quantity,
          compartmentId: a.compartmentId,
        }))
      );
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
        <div className={styles.titleRow}>
          <div>
            <div className={styles.breadcrumb}>
              <Link href="/stowage-plans">Stowage Plans</Link>
              <span>/</span>
              <span>{plan.planNumber}</span>
            </div>
            <h1>{plan.planNumber}</h1>
            <div className={styles.meta}>
              <span>{plan.voyageNumber}</span>
              <span>•</span>
              <span>{plan.vesselName}</span>
              <span>•</span>
              <span className={`${styles.statusBadge} ${styles[plan.status.toLowerCase()]}`}>
                {plan.status}
              </span>
            </div>
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
                <button className={styles.btnSecondary} onClick={() => setShowZoneModal(true)}>
                  Configure Zones
                </button>
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
      </div>

      {/* Cargo Assignment Bar */}
      <div className={styles.cargoBar}>
        <div className={styles.cargoBarTop}>
          <select
            className={styles.cargoSelect}
            value={selectedBookingId}
            onChange={e => setSelectedBookingId(e.target.value)}
            disabled={isLocked}
          >
            <option value="">Select booking...</option>
            {bookings.map(b => (
              <option key={b.bookingId} value={b.bookingId}>
                {b.bookingNumber} — {b.consignee} — {b.cargoType.replace('_', ' ')} — {remainingQty(b)} pal remaining
              </option>
            ))}
          </select>

          {selectedBooking && (
            <div className={styles.cargoDetail}>
              <span
                className={styles.cargoDot}
                style={{ backgroundColor: getCargoTypeColor(selectedBooking.cargoType) }}
              />
              <span className={styles.cargoType}>
                {selectedBooking.cargoType.replace('_', ' ')}
              </span>
              <span className={styles.cargoDetailSep}>·</span>
              <span>{assignedQty(selectedBooking)}/{selectedBooking.totalQuantity} pallets assigned</span>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${selectedBooking.totalQuantity > 0 ? Math.min(100, (assignedQty(selectedBooking) / selectedBooking.totalQuantity) * 100) : 0}%` }}
                />
              </div>
              <span className={styles.cargoDetailSep}>·</span>
              <span>{selectedBooking.pol} → {selectedBooking.pod}</span>
              <span className={styles.cargoDetailSep}>·</span>
              <span>{selectedBooking.consignee}</span>
            </div>
          )}

          {!isLocked && canEdit && selectedBooking && (
            <div className={styles.cargoBarActions}>
              <button
                className={styles.btnAssign}
                onClick={() => {
                  setAssigningBooking(selectedBooking);
                  setSelectedCompartment('');
                  setAssignQuantity(remainingQty(selectedBooking) || 1);
                }}
                disabled={remainingQty(selectedBooking) <= 0}
              >
                Assign to Compartment
              </button>
              <button className={styles.btnAuto} onClick={handleAutoStow}>
                Auto-Stow
              </button>
            </div>
          )}
        </div>

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
                  <span className={styles.rosterDot} style={{ background: getCargoTypeColor(b.cargoType) }} />
                  <span className={styles.rosterNum}>{b.bookingNumber}</span>
                  <div className={styles.rosterBar}>
                    <div className={styles.rosterFill} style={{ width: `${pct}%`, background: getCargoTypeColor(b.cargoType) }} />
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

      {/* Vessel Profile SVG — full width; click a section to drill into top-down view */}
      <div className={styles.svgContainer}>
        <VesselProfile
          vesselName={plan.vesselName}
          voyageNumber={plan.voyageNumber}
          tempAssignments={vesselProfileData}
          conflictCompartmentIds={conflictCompartmentIds}
          vesselLayout={vesselLayout}
          onCompartmentClick={(id) => setSelectedSectionId(prev => prev === id ? null : id)}
        />
      </div>

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
              {conflictSuggestions.length === 0 ? (
                <div className={styles.successBox}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="2"/>
                    <path d="M8 12l3 3 5-6" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <span>No temperature conflicts</span>
                </div>
              ) : (
                conflictSuggestions.map((conflict, idx) => (
                  <div key={idx} className={conflict.userConfirmed ? styles.conflictCardWarning : styles.conflictCard}>
                    <div className={styles.conflictHeader}>
                      {conflict.userConfirmed ? (
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path d="M10 2l8 16H2l8-16z" stroke="#eab308" strokeWidth="1.5"/>
                          <path d="M10 8v4m0 3h.01" stroke="#eab308" strokeWidth="2"/>
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <circle cx="10" cy="10" r="8" stroke="#ef4444" strokeWidth="2"/>
                          <path d="M10 6v4m0 4h.01" stroke="#ef4444" strokeWidth="2"/>
                        </svg>
                      )}
                      <span>{conflict.compartmentId}</span>
                      {conflict.userConfirmed && <span className={styles.confirmedBadge}>user accepted</span>}
                    </div>
                    <p>{conflict.description}</p>
                    <div className={styles.affectedShipments}>
                      Affected: {conflict.affectedBookings.join(', ')}
                    </div>
                    {conflict.suggestions.length > 0 && (
                      <div className={styles.conflictSuggestions}>
                        <span className={styles.conflictSuggestLabel}>Move to:</span>
                        {conflict.suggestions.map(s => (
                          <span key={s.compartmentId} className={styles.conflictSuggestChip} title={`${s.free} pallets free`}>
                            {s.compartmentId}
                            <span className={styles.conflictSuggestMeta}>
                              {s.sectionId} · {s.temp > 0 ? '+' : ''}{s.temp}°C · {s.free}↑
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                    {conflict.suggestions.length === 0 && !conflict.userConfirmed && (
                      <div className={styles.conflictNoAlt}>
                        No compatible compartments with free capacity — reassign cargo or adjust zone temperature.
                      </div>
                    )}
                  </div>
                ))
              )}
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
                style={{ backgroundColor: getCargoTypeColor(assigningBooking.cargoType) }}
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
                            setShowConflictWarning(false);
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
                onChange={e => { setAssignQuantity(parseInt(e.target.value) || 0); setShowConflictWarning(false); }}
              />
              <span className={styles.quantityMax}>/ {remainingQty(assigningBooking)} remaining</span>
            </div>

            {showConflictWarning && selectedCompartment && (() => {
              const section = compartmentToSection[selectedCompartment];
              const req = cargoTempRequirements[assigningBooking.cargoType];
              return (
                <div className={styles.conflictWarning}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2l8 16H2l8-16z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M10 8v4m0 3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <div>
                    <strong>Temperature Conflict</strong>
                    <p>
                      {assigningBooking.cargoType.replace('_', ' ')} requires {req?.min}–{req?.max}°C<br />
                      {selectedCompartment} (section {section?.sectionId}) is set to {section?.temp > 0 ? '+' : ''}{section?.temp}°C
                    </p>
                    <p>Assigning here may damage the product.</p>
                  </div>
                </div>
              );
            })()}

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
                className={showConflictWarning ? styles.btnWarning : styles.btnPrimary}
                disabled={!selectedCompartment || assignQuantity <= 0}
                onClick={handleConfirmAssign}
              >
                {showConflictWarning ? 'Assign Anyway' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Configure Zones Modal */}
      {showZoneModal && (() => {
        // Build cargo summary per zone from current booking assignments
        const cargoByZone: Record<string, { cargoType: string; palletsLoaded: number }> = {};
        for (const zone of tempZoneConfig) {
          let totalPalletsInZone = 0;
          let dominantCargo = '';
          for (const b of bookings) {
            for (const a of b.assignments) {
              if (zone.compartments.includes(a.compartmentId)) {
                totalPalletsInZone += a.quantity;
                if (!dominantCargo) dominantCargo = b.cargoType;
              }
            }
          }
          cargoByZone[zone.sectionId] = { cargoType: dominantCargo, palletsLoaded: totalPalletsInZone };
        }

        const zoneConfigs: ZoneConfig[] = tempZoneConfig.map((zone) => ({
          zoneId: zone.sectionId,
          zoneName: zone.sectionId.replace(/(\d+)(UPD)?([A-Z]+)/, (_, hold, upd, levels) =>
            `Hold ${hold}${upd ? ' UPD|' : ' '}${levels.split('').join('|')}`
          ),
          coolingSectionIds: zone.compartments,
          currentTemp: zone.temp,
          assignedCargoType: cargoByZone[zone.sectionId]?.cargoType || undefined,
          palletsLoaded: cargoByZone[zone.sectionId]?.palletsLoaded ?? 0,
        }));

        return (
          <ConfigureZonesModal
            planId={planId}
            zones={zoneConfigs}
            isOpen={showZoneModal}
            onClose={() => setShowZoneModal(false)}
            onSuccess={(updatedSections) => {
              // Update tempZoneConfig directly from the server response
              if (Array.isArray(updatedSections) && updatedSections.length > 0) {
                setTempZoneConfig(
                  updatedSections.map((cs: any) => ({
                    sectionId: cs.zoneId,
                    zoneId: `ZONE_${cs.zoneId}`,
                    temp: cs.assignedTemperature ?? 13,
                    compartments: cs.coolingSectionIds ?? [],
                  }))
                );
              }
              setShowZoneModal(false);
            }}
          />
        );
      })()}

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
