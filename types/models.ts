// ============================================================================
// REEFER STOWAGE PLANNER - TYPESCRIPT INTERFACES FINAL
// Modelo completo actualizado con todos los cambios del negocio real
// 
// IMPORTANTE: Esta aplicación NO sustituye los sistemas de estabilidad a bordo.
// ============================================================================

// ----------------------------------------------------------------------------
// CARGO TYPES
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
  serviceCode: string; // "SEABAN", "SEAMED", "CARIBANEX"
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

export interface VoyagePortCall {
  portCode: string;
  portName: string;
  country: string;
  sequence: number;
  weekNumber: number; // Semana del año (1-52)
  eta: Date;
  etd: Date;
  ata?: Date;
  atd?: Date;
  operations: ('LOAD' | 'DISCHARGE')[];
  
  // CAMBIO #2: Cierre por puerto (no del viaje completo)
  locked: boolean; // true cuando el barco zarpa
  lockedBy?: string;
  lockedAt?: Date;
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
  status: VoyageStatus;
  stowagePlanId?: string;
  notes?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ----------------------------------------------------------------------------
// CONTRACT (Contrato Anual)
// ----------------------------------------------------------------------------

export interface Contract {
  _id: string;
  contractNumber: string;
  
  client: {
    name: string;
    type: 'IMPORTER' | 'EXPORTER';
    contact: string;
    email: string;
    country: string;
  };
  
  // CAMBIO #5: Consignee (cliente final)
  consignee: {
    name: string; // COBANA, FYFFES, Del Monte
    code: string;
    country: string;
  };
  
  serviceId: string;
  serviceCode: string;
  cargoType: CargoType;
  
  contractedSpace: {
    pallets?: number;
    containers?: number;
    frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  };
  
  origin: {
    portCode: string;
    portName: string;
    country: string;
  };
  destination: {
    portCode: string;
    portName: string;
    country: string;
  };
  
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
  bookingNumber: string;
  voyageId: string;
  voyageNumber: string;
  contractId: string;
  
  client: {
    name: string;
    contact: string;
    email: string;
  };
  
  // CAMBIO #5: Consignee
  consignee: {
    name: string;
    code: string;
  };
  
  cargoType: CargoType;
  
  // CAMBIO #3: Cantidades solicitadas vs confirmadas
  requestedQuantity: number;
  confirmedQuantity: number;
  standbyQuantity?: number;
  rejectedQuantity?: number;
  
  // CAMBIO #5: POL/POD
  pol: {
    portCode: string;
    portName: string;
    country: string;
  };
  pod: {
    portCode: string;
    portName: string;
    country: string;
  };
  
  status: BookingStatus;
  requestedDate: Date;
  confirmedDate?: Date;
  
  // Email de confirmación
  confirmationEmailSent?: boolean;
  confirmationEmailSentAt?: Date;
  confirmationNotes?: string;
  
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

export interface Shipper {
  name: string;
  code: string;
  contact: string;
  email: string;
  address?: string;
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
  
  shipper: Shipper;
  
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
  
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ----------------------------------------------------------------------------
// CAPTAIN CONTACT
// ----------------------------------------------------------------------------

export interface CaptainContact {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  vesselId: string;
  vesselName: string;
  preferredLanguage?: 'en' | 'es' | 'pt';
  ccEmails?: string[];
  notes?: string;
  active: boolean;
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