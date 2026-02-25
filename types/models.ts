// ============================================================================
// REEFER STOWAGE PLANNER - TYPESCRIPT INTERFACES FINAL
// Modelo completo actualizado con todos los cambios del negocio real
// 
// IMPORTANTE: Esta aplicación NO sustituye los sistemas de estabilidad a bordo.
// ============================================================================

// ----------------------------------------------------------------------------
// CARGO TYPES + WEIGHT LOOKUP
// ----------------------------------------------------------------------------

export type CargoType =
  | 'BANANAS'
  | 'ORGANIC_BANANAS'
  | 'PLANTAINS'
  | 'FROZEN_FISH'
  | 'TABLE_GRAPES'
  | 'CITRUS'
  | 'AVOCADOS'
  | 'BERRIES'
  | 'KIWIS'
  | 'PINEAPPLES'
  | 'CHERRIES'
  | 'BLUEBERRIES'
  | 'PLUMS'
  | 'PEACHES'
  | 'APPLES'
  | 'PEARS'
  | 'PAPAYA'
  | 'MANGOES'
  | 'OTHER_FROZEN'
  | 'OTHER_CHILLED';

export const CARGO_WEIGHT_PER_UNIT: Partial<Record<CargoType, number>> = {
  BANANAS: 1100, ORGANIC_BANANAS: 1100, PLANTAINS: 950,
  TABLE_GRAPES: 950, CITRUS: 1000, AVOCADOS: 1000,
  BERRIES: 900, KIWIS: 950, PINEAPPLES: 1050,
  FROZEN_FISH: 1200, CHERRIES: 850, BLUEBERRIES: 900,
  PLUMS: 950, PEACHES: 1000, APPLES: 1000, PEARS: 1000,
  PAPAYA: 1050, MANGOES: 1050, OTHER_FROZEN: 1200, OTHER_CHILLED: 1000,
};

// ----------------------------------------------------------------------------
// SERVICE (Servicio de Línea Naviera)
// ----------------------------------------------------------------------------

export interface PortRotation {
  portCode: string; // "NLRTM", "CLRMOB", "COTUB", "COSMA"
  portName: string;
  country: string;
  sequence: number; // 1, 2, 3, 4...
  weeksFromStart: number; // 0 (inicio), 1, 2, 3...
  operations: ('LOAD' | 'DISCHARGE')[];
}

export interface Service {
  _id: string;
  serviceCode: string; // "CARIBANEX" "RAYO"
  shortCode: string;   // "CBX", "RAY", "ANX" — used in contract/booking numbers
  serviceName: string;
  description: string;
  active: boolean;
  portRotation: PortRotation[];
  cycleDurationWeeks: number;
  vesselPool: string[]; // Array de vessel IDs
  cargoTypes: CargoType[];
  createdAt: Date;
  updatedAt: Date;
}

// ----------------------------------------------------------------------------
// VOYAGE (Viaje - cada "vuelta" de un barco)
// ----------------------------------------------------------------------------

export type VoyageStatus = 
  | 'PLANNED'
  | 'ESTIMATED'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CLOSED'      // Para estadísticas - no más cambios
  | 'CANCELLED';

export type PortCallStatus = 'SCHEDULED' | 'CANCELLED' | 'COMPLETED' | 'SKIPPED';

export interface VoyagePortCall {
  portCode: string;
  portName: string;
  country: string;
  sequence: number;
  weekNumber?: number;
  eta?: Date;
  etd?: Date;
  ata?: Date;
  atd?: Date;
  operations: ('LOAD' | 'DISCHARGE')[];
  locked: boolean;
  lockedBy?: string;
  lockedAt?: Date;
  status: PortCallStatus;
  addedPostCreation?: boolean;
  cancelledAt?: Date;
  cancelledBy?: string;
  cancellationReason?: string;
}

export interface PortCallChangelogEntry {
  changedAt: Date;
  changedBy: string;
  action: 'CANCELLED' | 'RESTORED' | 'ADDED' | 'REORDERED' | 'DATE_CHANGED';
  portCode: string;
  portName: string;
  previousValue?: string;
  newValue?: string;
  reason?: string;
}

export interface Voyage {
  _id: string;
  voyageNumber: string; // "ACON-2024-W14"
  vesselId: string;
  vesselName: string;
  serviceId: string;
  serviceCode: string;
  weekNumber?: number;
  year: number;
  startDate: Date;
  estimatedEndDate: Date;
  actualEndDate?: Date;
  portCalls: VoyagePortCall[];
  portCallChangelog: PortCallChangelogEntry[];
  status: VoyageStatus;
  stowagePlanId?: string;
  notes?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ----------------------------------------------------------------------------
// OFFICE (Oficina de operaciones)
// ----------------------------------------------------------------------------

export interface Office {
  _id: string;
  code: string;       // "RTM", "SMR", "GYE" — 3-letter unique
  name: string;       // "Rotterdam", "Santa Marta"
  country: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ----------------------------------------------------------------------------
// CONTRACT (Contrato Anual)
// ----------------------------------------------------------------------------

export interface ContractCounterparty {
  name: string;
  code: string;
  weeklyEstimate: number;
  cargoTypes: CargoType[];
}

// New counterparty format that references the Shipper collection
export interface ShipperCounterparty {
  shipperId: string;
  shipperName: string;
  shipperCode: string;
  weeklyEstimate: number;
  cargoTypes: CargoType[];
}

export interface Contract {
  _id: string;
  contractNumber: string;  // "RTMCBX2026C012001"
  officeId: string;
  officeCode: string;
  client: {
    type: 'SHIPPER' | 'CONSIGNEE';
    name: string;
    clientNumber: string;  // "C001"
    contact: string;
    email: string;
    country: string;
  };
  shippers: ContractCounterparty[];     // legacy: kept for backward compat
  consignees: ContractCounterparty[];   // legacy: kept for backward compat
  counterparties: ShipperCounterparty[]; // new: refs Shipper collection
  serviceId: string;
  serviceCode: string;
  originPort: { portCode: string; portName: string; country: string };
  destinationPort: { portCode: string; portName: string; country: string };
  validFrom: Date;
  validTo: Date;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ----------------------------------------------------------------------------
// BOOKING (Solicitud de Espacio)
// ----------------------------------------------------------------------------

export type BookingStatus = 
  | 'PENDING'
  | 'CONFIRMED'
  | 'PARTIAL'      // CAMBIO #3: Confirmación parcial
  | 'STANDBY'      // CAMBIO #3: En espera
  | 'REJECTED'
  | 'CANCELLED';

export interface Booking {
  _id: string;
  bookingNumber: string;  // "RTMCBXACON062026001"
  contractId: string;     // required
  voyageId: string;
  voyageNumber: string;
  officeCode: string;
  serviceCode: string;
  client: { name: string; clientNumber: string; contact: string; email: string };
  shipper: { name: string; code: string };
  consignee: { name: string; code: string };
  cargoType: CargoType;
  requestedQuantity: number;
  confirmedQuantity: number;
  standbyQuantity?: number;
  rejectedQuantity?: number;
  requestedTemperature?: number;
  pol: { portCode: string; portName: string; country: string };
  pod: { portCode: string; portName: string; country: string };
  estimateSource: 'CONTRACT_DEFAULT' | 'SHIPPER_CONFIRMED';
  // New fields (Phase 10 refactor)
  shipperId?: string;
  cargoMode: 'HOLD' | 'CONTAINER';
  weekNumber?: number;
  estimatedWeightPerUnit?: number;
  totalEstimatedWeight?: number;
  containerType?: '20FT' | '40FT' | '40HC';
  shipperEmailDate?: Date;
  shipperEmailNotes?: string;
  status: BookingStatus;
  requestedDate: Date;
  confirmedDate?: Date;
  approvedBy?: string;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ----------------------------------------------------------------------------
// SHIPMENT (Embarque específico)
// ----------------------------------------------------------------------------

export type ShipmentStatus = 
  | 'ESTIMATED'
  | 'CONFIRMED'
  | 'PLANNED'
  | 'LOADED'
  | 'IN_TRANSIT'
  | 'DISCHARGED'
  | 'DELIVERED'
  | 'CANCELLED';

// Embedded shipper info inside a Shipment document
export interface ShipmentShipper {
  name: string;
  code: string;
  contact: string;
  email: string;
  address?: string;
}

// Top-level Shipper collection document
export interface Shipper {
  _id: string;
  name: string;
  code: string;
  contact: string;
  email: string;
  phone?: string;
  country: string;
  portCode?: string;
  portName?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CargoUnit {
  unitId: string;
  type: 'PALLET' | 'CONTAINER';
  weight: number; // kg
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
  containerType?: '20FT' | '40FT' | '40HC';
}

export interface Shipment {
  _id: string;
  shipmentNumber: string;
  voyageId: string;
  voyageNumber: string;
  bookingId: string;
  contractId: string;
  
  shipper: ShipmentShipper;

  // CAMBIO #5: Consignee
  consignee: {
    name: string;
    code: string;
  };
  
  cargoType: CargoType;
  quantity: number;
  estimatedWeight: number;
  actualWeight?: number;
  
  // CAMBIO #5: POL/POD con sequence
  pol: {
    portCode: string;
    portName: string;
    sequence: number;
  };
  pod: {
    portCode: string;
    portName: string;
    sequence: number;
  };
  
  status: ShipmentStatus;
  cargoUnits: CargoUnit[];
  
  estimatedDate: Date;
  confirmedDate?: Date;
  loadedDate?: Date;
  dischargedDate?: Date;
  specialInstructions?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

// ----------------------------------------------------------------------------
// VESSEL (Buque) - ACTUALIZADO CON COOLING SECTIONS
// ----------------------------------------------------------------------------

export interface VesselDimensions {
  loa: number;
  beam: number;
  depth: number;
  draft: {
    summer: number;
    winter: number;
    tropical: number;
  };
}

export interface VesselCapacity {
  gt: number;
  nt: number;
  dwat: {
    summer: number;
    winter: number;
    tropical: number;
  };
  totalCbft: number;
  totalSqm: number;
  totalPallets: number;
}

// Individual cooling section with physical specs
export interface CoolingSectionDetail {
  sectionId: string;              // "1A", "2UPD", "1FC", etc.
  sqm: number;                    // floor area in sqm (from vessel spec sheet)
  designStowageFactor: number;    // from vessel spec sheet (e.g. 1.32)
  historicalStowageFactor?: number; // rolling average across completed voyages
  historicalVoyageCount?: number; // # voyages in historical average
  // maxPallets is CALCULATED: Math.floor(sqm * chosenFactor)
}

// CoolingSection = one temperature zone entry on the Vessel document.
// zoneId = "1AB", "2UPDAB", etc. — a group of sections on the same refrigeration circuit
export interface CoolingSection {
  zoneId: string;                 // "1AB", "1CD", "2UPDAB", etc.
  coolingSections: CoolingSectionDetail[]; // nested per-section physical specs
  assignedTemperatureZone?: string;
  currentTemperature?: number;
  locked: boolean;
}

export interface Compartment {
  id: string;
  holdNumber: number;
  level: 'DECK' | 'UPD' | 'A' | 'B' | 'C' | 'D';
  capacityCbft: number;
  capacitySqm: number;
  maxPallets: number;
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
  position: {
    lcg: number;
    tcg: number;
    vcg: number;
  };
  maxStackWeight: number;
  
  // CAMBIO #6: Pertenece a una cooling section
  coolingSectionId: string;
  
  // CAMBIO #7: Para contenedores en cubierta
  canLoadContainers: boolean;
  
  hatchSize: {
    length: number;
    width: number;
  };
}

export interface Hold {
  holdNumber: number;
  compartments: Compartment[];
  totalCapacityCbft: number;
  totalCapacitySqm: number;
}

export interface VesselStability {
  lightship: {
    weight: number;
    lcg: number;
    vcg: number;
    tcg: number;
  };
  referenceLimits: {
    minGM: number;
    maxGM: number;
    maxTrim: number;
    maxList: number;
    maxDraft: number;
  };
  approvalRequired: true;
}

export interface Vessel {
  _id: string;
  name: string;
  imoNumber: string;
  flag: string;
  callSign: string;
  dimensions: VesselDimensions;
  capacity: VesselCapacity;
  holds: Hold[];
  // temperatureZones: one entry per temperature zone (e.g. "1AB", "2UPDAB")
  // Each zone groups the individual cooling sections that share a refrigeration circuit.
  temperatureZones: CoolingSection[];
  maxTemperatureZones: number; // = temperatureZones.length
  
  // CAMBIO #7: Capacidad de contenedores en cubierta
  deckContainerCapacity: {
    maxReeferPlugs: number; // 19 para ACONCAGUA BAY
    maxTEU: number;
    maxFEU: number;
  };
  
  stability: VesselStability;
  classification: {
    society: string;
    mainClass: string;
    serviceNotations: string;
  };
  built: Date;
  captainEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ----------------------------------------------------------------------------
// STOWAGE PLAN
// ----------------------------------------------------------------------------

export interface TemperatureChangelogEntry {
  changedAt: Date;
  changedBy: string;
  reason?: string;
  changes: Array<{
    zoneId: string;
    coolingSectionIds: string[];
    fromTemp: number;
    toTemp: number;
  }>;
  affectedBookings: string[];
}

export interface CargoPosition {
  shipmentId?: string;
  bookingId?: string;
  cargoUnitId?: string;
  cargoType?: string;   // e.g. 'BANANAS', 'TABLE_GRAPES' — drives temp-conflict checks
  quantity?: number;    // pallets in this position
  compartment: {
    id: string;
    holdNumber: number;
    level: string;
  };
  stackPosition?: {
    row: number;
    tier: number;
    bay: number;
  };
  weight?: number;
  position?: {
    lcg: number;
    tcg: number;
    vcg: number;
  };
}

export interface PreliminaryStabilityEstimate {
  calculatedAt: Date;
  displacement: number;
  estimatedKG: number;
  estimatedLCG: number;
  estimatedTCG: number;
  estimatedGM: number;
  estimatedTrim: number;
  estimatedList: number;
  estimatedDrafts: {
    forward: number;
    aft: number;
    mean: number;
  };
  preliminaryCheck: {
    withinReferenceLimits: boolean;
    warnings: string[];
    notes: string[];
  };
  disclaimer: string;
}

export type StowagePlanStatus = 
  | 'ESTIMATED'     // CAMBIO #1: Basado solo en estimaciones
  | 'DRAFT'
  | 'READY_FOR_CAPTAIN'
  | 'EMAIL_SENT'
  | 'CAPTAIN_APPROVED'
  | 'CAPTAIN_REJECTED'
  | 'IN_REVISION'
  | 'READY_FOR_EXECUTION'
  | 'IN_EXECUTION'
  | 'COMPLETED'
  | 'CANCELLED';

export interface StowagePlan {
  _id: string;
  planNumber: string;
  voyageId: string; // Asociado a UN viaje específico
  voyageNumber: string;
  vesselId: string;
  vesselName: string;
  cargoPositions: CargoPosition[];
  preliminaryStability: PreliminaryStabilityEstimate;
  status: StowagePlanStatus;
  
  // Validaciones
  overstowViolations: Array<{
    compartmentId: string;
    description: string;
    affectedShipments: string[];
  }>;
  
  temperatureConflicts: Array<{
    compartmentId: string;
    coolingSectionId: string; // CAMBIO #6: Ahora por cooling section
    description: string;
    affectedShipments: string[];
  }>;
  
  weightDistributionWarnings: string[];

  coolingSectionStatus?: Array<{
    zoneId: string;
    coolingSectionIds: string[];
    assignedTemperature?: number;
    locked: boolean;
  }>;

  temperatureChangelog?: TemperatureChangelogEntry[];

  // Comunicación con capitán
  captainCommunication?: {
    emailSentAt: Date;
    captainName: string;
    captainEmail: string;
    responseReceivedAt?: Date;
    responseType?: 'APPROVED' | 'REJECTED' | 'PENDING';
    captainComments?: string;
    rejectionReasons?: string[];
    processedBy?: string;
  };
  
  generatedDocuments?: {
    stowagePlanPDF?: string;
    stabilityDataPDF?: string;
    cargoManifestPDF?: string;
    loadingSequencePDF?: string;
  };
  
  communicationLog?: {
    sentAt: Date;
    sentBy: string;
    recipients: { name?: string; email: string; role: 'CAPTAIN' | 'CC' }[];
    planStatus?: string;
    note?: string;
  }[];

  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ----------------------------------------------------------------------------
// USER
// ----------------------------------------------------------------------------

export type UserRole = 
  | 'ADMIN'
  | 'SHIPPING_PLANNER'
  | 'STEVEDORE'
  | 'CHECKER'
  | 'EXPORTER'
  | 'VIEWER';

export interface User {
  _id: string;
  email: string;
  name: string;
  role: UserRole;
  company?: string;
  port?: string;
  canSendEmailsToCaptains?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ----------------------------------------------------------------------------
// API RESPONSES
// ----------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}