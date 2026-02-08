// ============================================================================
// MOCK DATA - For UI prototyping (aligned with seed data structure)
// Replace with Server Action calls when connecting to MongoDB
// ============================================================================

import type {
  VoyageStatus,
  BookingStatus,
  StowagePlanStatus,
  CargoType,
} from '@/types/models';

// --- Dashboard Stats ---

export const dashboardStats = {
  activeVoyages: 4,
  pendingBookings: 3,
  plansInDraft: 2,
  awaitingCaptain: 1,
};

// --- Voyages ---

export interface MockVoyage {
  _id: string;
  voyageNumber: string;
  vesselName: string;
  serviceCode: string;
  status: VoyageStatus;
  startDate: string;
  estimatedEndDate: string;
  portCalls: Array<{
    portCode: string;
    portName: string;
    sequence: number;
    operations: ('LOAD' | 'DISCHARGE')[];
    eta: string;
    locked: boolean;
  }>;
  bookingsCount: number;
  palletsBooked: number;
  palletsCapacity: number;
}

export const mockVoyages: MockVoyage[] = [
  {
    _id: 'v1',
    voyageNumber: 'ACON-062026',
    vesselName: 'ACONCAGUA BAY',
    serviceCode: 'SEABAN',
    status: 'IN_PROGRESS',
    startDate: '2026-02-02',
    estimatedEndDate: '2026-03-09',
    portCalls: [
      { portCode: 'CLSAI', portName: 'San Antonio', sequence: 1, operations: ['LOAD'], eta: '2026-02-02', locked: true },
      { portCode: 'CLVAP', portName: 'Valparaíso', sequence: 2, operations: ['LOAD'], eta: '2026-02-04', locked: true },
      { portCode: 'PAPLP', portName: 'Paita', sequence: 3, operations: ['LOAD'], eta: '2026-02-10', locked: false },
      { portCode: 'NLRTM', portName: 'Rotterdam', sequence: 4, operations: ['DISCHARGE'], eta: '2026-03-02', locked: false },
      { portCode: 'DEHAM', portName: 'Hamburg', sequence: 5, operations: ['DISCHARGE'], eta: '2026-03-05', locked: false },
      { portCode: 'GBFXT', portName: 'Felixstowe', sequence: 6, operations: ['DISCHARGE'], eta: '2026-03-09', locked: false },
    ],
    bookingsCount: 6,
    palletsBooked: 3840,
    palletsCapacity: 4840,
  },
  {
    _id: 'v2',
    voyageNumber: 'ACON-072026',
    vesselName: 'ACONCAGUA BAY',
    serviceCode: 'SEABAN',
    status: 'PLANNED',
    startDate: '2026-03-16',
    estimatedEndDate: '2026-04-20',
    portCalls: [
      { portCode: 'CLSAI', portName: 'San Antonio', sequence: 1, operations: ['LOAD'], eta: '2026-03-16', locked: false },
      { portCode: 'ECGYE', portName: 'Guayaquil', sequence: 2, operations: ['LOAD'], eta: '2026-03-22', locked: false },
      { portCode: 'NLRTM', portName: 'Rotterdam', sequence: 3, operations: ['DISCHARGE'], eta: '2026-04-12', locked: false },
      { portCode: 'DEHAM', portName: 'Hamburg', sequence: 4, operations: ['DISCHARGE'], eta: '2026-04-16', locked: false },
    ],
    bookingsCount: 2,
    palletsBooked: 1200,
    palletsCapacity: 4840,
  },
  {
    _id: 'v3',
    voyageNumber: 'STAR-062026',
    vesselName: 'STAR ENDURANCE',
    serviceCode: 'SEAMED',
    status: 'PLANNED',
    startDate: '2026-02-09',
    estimatedEndDate: '2026-03-15',
    portCalls: [
      { portCode: 'CLSAI', portName: 'San Antonio', sequence: 1, operations: ['LOAD'], eta: '2026-02-09', locked: false },
      { portCode: 'ITGOA', portName: 'Genova', sequence: 2, operations: ['DISCHARGE'], eta: '2026-03-08', locked: false },
      { portCode: 'ESVLC', portName: 'Valencia', sequence: 3, operations: ['DISCHARGE'], eta: '2026-03-12', locked: false },
    ],
    bookingsCount: 0,
    palletsBooked: 0,
    palletsCapacity: 3600,
  },
  {
    _id: 'v4',
    voyageNumber: 'ACON-082026',
    vesselName: 'ACONCAGUA BAY',
    serviceCode: 'SEABAN',
    status: 'ESTIMATED',
    startDate: '2026-04-27',
    estimatedEndDate: '2026-06-01',
    portCalls: [
      { portCode: 'CLSAI', portName: 'San Antonio', sequence: 1, operations: ['LOAD'], eta: '2026-04-27', locked: false },
      { portCode: 'NLRTM', portName: 'Rotterdam', sequence: 2, operations: ['DISCHARGE'], eta: '2026-05-24', locked: false },
    ],
    bookingsCount: 0,
    palletsBooked: 0,
    palletsCapacity: 4840,
  },
];

// --- Bookings ---

export interface MockBooking {
  _id: string;
  bookingNumber: string;
  voyageNumber: string;
  clientName: string;
  consigneeName: string;
  cargoType: CargoType;
  requestedQuantity: number;
  confirmedQuantity: number;
  standbyQuantity: number;
  polCode: string;
  podCode: string;
  status: BookingStatus;
  requestedDate: string;
}

export const mockBookings: MockBooking[] = [
  {
    _id: 'b1',
    bookingNumber: 'BKG-20260201-001',
    voyageNumber: 'ACON-062026',
    clientName: 'Frutera del Pacífico',
    consigneeName: 'COBANA',
    cargoType: 'BANANAS',
    requestedQuantity: 800,
    confirmedQuantity: 800,
    standbyQuantity: 0,
    polCode: 'CLSAI',
    podCode: 'NLRTM',
    status: 'CONFIRMED',
    requestedDate: '2026-01-15',
  },
  {
    _id: 'b2',
    bookingNumber: 'BKG-20260201-002',
    voyageNumber: 'ACON-062026',
    clientName: 'Chilean Frozen Foods',
    consigneeName: 'FYFFES',
    cargoType: 'FROZEN_FISH',
    requestedQuantity: 600,
    confirmedQuantity: 500,
    standbyQuantity: 100,
    polCode: 'CLSAI',
    podCode: 'DEHAM',
    status: 'PARTIAL',
    requestedDate: '2026-01-18',
  },
  {
    _id: 'b3',
    bookingNumber: 'BKG-20260202-001',
    voyageNumber: 'ACON-062026',
    clientName: 'Exportadora Valle Central',
    consigneeName: 'Del Monte',
    cargoType: 'TABLE_GRAPES',
    requestedQuantity: 1200,
    confirmedQuantity: 1200,
    standbyQuantity: 0,
    polCode: 'CLVAP',
    podCode: 'NLRTM',
    status: 'CONFIRMED',
    requestedDate: '2026-01-20',
  },
  {
    _id: 'b4',
    bookingNumber: 'BKG-20260203-001',
    voyageNumber: 'ACON-062026',
    clientName: 'Peruvian Avocados SAC',
    consigneeName: 'COBANA',
    cargoType: 'AVOCADOS',
    requestedQuantity: 400,
    confirmedQuantity: 0,
    standbyQuantity: 400,
    polCode: 'PAPLP',
    podCode: 'GBFXT',
    status: 'STANDBY',
    requestedDate: '2026-01-25',
  },
  {
    _id: 'b5',
    bookingNumber: 'BKG-20260203-002',
    voyageNumber: 'ACON-062026',
    clientName: 'Frutera del Pacífico',
    consigneeName: 'COBANA',
    cargoType: 'CITRUS',
    requestedQuantity: 500,
    confirmedQuantity: 500,
    standbyQuantity: 0,
    polCode: 'CLSAI',
    podCode: 'DEHAM',
    status: 'CONFIRMED',
    requestedDate: '2026-01-26',
  },
  {
    _id: 'b6',
    bookingNumber: 'BKG-20260205-001',
    voyageNumber: 'ACON-062026',
    clientName: 'South Pacific Berries',
    consigneeName: 'FYFFES',
    cargoType: 'BERRIES',
    requestedQuantity: 350,
    confirmedQuantity: 0,
    standbyQuantity: 0,
    polCode: 'CLSAI',
    podCode: 'NLRTM',
    status: 'PENDING',
    requestedDate: '2026-02-05',
  },
  {
    _id: 'b7',
    bookingNumber: 'BKG-20260205-002',
    voyageNumber: 'ACON-072026',
    clientName: 'Ecuador Banana Corp',
    consigneeName: 'Del Monte',
    cargoType: 'BANANAS',
    requestedQuantity: 1000,
    confirmedQuantity: 1000,
    standbyQuantity: 0,
    polCode: 'ECGYE',
    podCode: 'NLRTM',
    status: 'CONFIRMED',
    requestedDate: '2026-02-05',
  },
  {
    _id: 'b8',
    bookingNumber: 'BKG-20260206-001',
    voyageNumber: 'ACON-072026',
    clientName: 'Frutera del Pacífico',
    consigneeName: 'COBANA',
    cargoType: 'KIWIS',
    requestedQuantity: 200,
    confirmedQuantity: 0,
    standbyQuantity: 0,
    polCode: 'CLSAI',
    podCode: 'DEHAM',
    status: 'PENDING',
    requestedDate: '2026-02-06',
  },
];

// --- Stowage Plans ---

export interface MockStowagePlan {
  _id: string;
  planNumber: string;
  voyageNumber: string;
  vesselName: string;
  status: StowagePlanStatus;
  palletsAssigned: number;
  palletsTotal: number;
  overstowViolations: number;
  temperatureConflicts: number;
  updatedAt: string;
}

export const mockStowagePlans: MockStowagePlan[] = [
  {
    _id: 'test-123',
    planNumber: 'SP-ACON-062026',
    voyageNumber: 'ACON-062026',
    vesselName: 'ACONCAGUA BAY',
    status: 'READY_FOR_CAPTAIN',
    palletsAssigned: 3000,
    palletsTotal: 4840,
    overstowViolations: 0,
    temperatureConflicts: 0,
    updatedAt: '2026-02-05',
  },
  {
    _id: 'sp2',
    planNumber: 'SP-ACON-072026',
    voyageNumber: 'ACON-072026',
    vesselName: 'ACONCAGUA BAY',
    status: 'DRAFT',
    palletsAssigned: 600,
    palletsTotal: 4840,
    overstowViolations: 1,
    temperatureConflicts: 0,
    updatedAt: '2026-02-06',
  },
];

// --- Vessels (summary for listings) ---

export interface MockVesselSummary {
  _id: string;
  name: string;
  imoNumber: string;
  flag: string;
  totalPallets: number;
  holds: number;
  compartments: number;
  coolingSections: number;
  temperatureZones: number;
  currentVoyage?: string;
}

export const mockVessels: MockVesselSummary[] = [
  {
    _id: 'vs1',
    name: 'ACONCAGUA BAY',
    imoNumber: '9019652',
    flag: 'Liberia',
    totalPallets: 4840,
    holds: 4,
    compartments: 19,
    coolingSections: 19,
    temperatureZones: 8,
    currentVoyage: 'ACON-062026',
  },
  {
    _id: 'vs2',
    name: 'STAR ENDURANCE',
    imoNumber: '9156789',
    flag: 'Panama',
    totalPallets: 3600,
    holds: 4,
    compartments: 16,
    coolingSections: 16,
    temperatureZones: 7,
    currentVoyage: 'STAR-062026',
  },
];
