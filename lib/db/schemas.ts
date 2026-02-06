// ============================================================================
// MONGODB SCHEMAS - MONGOOSE (VOYAGE SIMPLIFICADO)
// ============================================================================

import mongoose, { Schema, Model } from 'mongoose';
import type {
  Vessel,
  Service,
  Voyage,
  Contract,
  Booking,
  Shipment,
  StowagePlan,
  User,
  CaptainContact,
} from '@/types/models';

// ============================================================================
// SERVICE SCHEMA
// ============================================================================

const PortRotationSchema = new Schema({
  portCode: { type: String, required: true },
  portName: { type: String, required: true },
  country: { type: String, required: true },
  sequence: { type: Number, required: true },
  weeksFromStart: { type: Number, required: true },
  operations: [{ type: String, enum: ['LOAD', 'DISCHARGE'], required: true }],
}, { _id: false });

const ServiceSchema = new Schema<Service>({
  serviceCode: { type: String, required: true, unique: true },
  serviceName: { type: String, required: true },
  description: { type: String },
  active: { type: Boolean, default: true },
  portRotation: [PortRotationSchema],
  cycleDurationWeeks: { type: Number, required: true },
  vesselPool: [{ type: Schema.Types.ObjectId, ref: 'Vessel' }],
  cargoTypes: [{ type: String }],
}, {
  timestamps: true,
});

ServiceSchema.index({ active: 1 });

// ============================================================================
// VOYAGE SCHEMA (SIMPLIFICADO - Solo campos esenciales required)
// ============================================================================

const VoyagePortCallSchema = new Schema({
  portCode: { type: String, required: true },
  portName: { type: String, required: true },
  country: { type: String, required: true },
  sequence: { type: Number, required: true },
  weekNumber: { type: Number, required: true, min: 1, max: 53 },
  eta: { type: Date, required: true },
  etd: { type: Date, required: true },
  ata: { type: Date },
  atd: { type: Date },
  operations: [{ type: String, enum: ['LOAD', 'DISCHARGE'], required: true }],
  locked: { type: Boolean, default: false },
  lockedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  lockedAt: { type: Date },
}, { _id: false });

const VoyageSchema = new Schema<Voyage>({
  voyageNumber: { type: String, required: true, unique: true },
  vesselId: { type: Schema.Types.ObjectId, ref: 'Vessel', required: true },
  vesselName: { type: String, required: true },
  serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
  
  // Campos opcionales (se pueden agregar después)
  serviceCode: { type: String },
  startWeek: { type: Number, min: 1, max: 53 },
  year: { type: Number, required: true },
  startDate: { type: Date },
  estimatedEndDate: { type: Date },
  actualEndDate: { type: Date },
  
  portCalls: [VoyagePortCallSchema],
  status: {
    type: String,
    required: true,
    enum: ['PLANNED', 'ESTIMATED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'CANCELLED'],
    default: 'PLANNED',
  },
  stowagePlanId: { type: Schema.Types.ObjectId, ref: 'StowagePlan' },
  notes: { type: String },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

VoyageSchema.index({ vesselId: 1 });
VoyageSchema.index({ serviceId: 1 });
VoyageSchema.index({ status: 1 });
VoyageSchema.index({ startWeek: 1, year: 1 });

// ============================================================================
// CONTRACT SCHEMA
// ============================================================================

const ContractSchema = new Schema<Contract>({
  contractNumber: { type: String, required: true, unique: true },
  client: {
    name: { type: String, required: true },
    type: { type: String, enum: ['IMPORTER', 'EXPORTER'], required: true },
    contact: { type: String, required: true },
    email: { type: String, required: true },
    country: { type: String, required: true },
  },
  consignee: {
    name: { type: String },
    code: { type: String },
    country: { type: String },
  },
  serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
  serviceCode: { type: String, required: true },
  cargoType: { type: String, required: true },
  contractedSpace: {
    pallets: { type: Number },
    containers: { type: Number },
    frequency: { type: String, enum: ['WEEKLY', 'BIWEEKLY', 'MONTHLY'], required: true },
  },
  origin: {
    portCode: { type: String, required: true },
    portName: { type: String, required: true },
    country: { type: String, required: true },
  },
  destination: {
    portCode: { type: String, required: true },
    portName: { type: String, required: true },
    country: { type: String, required: true },
  },
  validFrom: { type: Date, required: true },
  validTo: { type: Date, required: true },
  active: { type: Boolean, default: true },
}, {
  timestamps: true,
});

ContractSchema.index({ serviceId: 1 });
ContractSchema.index({ active: 1 });

// ============================================================================
// BOOKING SCHEMA
// ============================================================================

const BookingSchema = new Schema<Booking>({
  bookingNumber: { type: String, required: true, unique: true },
  voyageId: { type: Schema.Types.ObjectId, ref: 'Voyage', required: true },
  voyageNumber: { type: String, required: true },
  contractId: { type: Schema.Types.ObjectId, ref: 'Contract', required: true },
  client: {
    name: { type: String, required: true },
    contact: { type: String, required: true },
    email: { type: String, required: true },
  },
  consignee: {
    name: { type: String, required: true },
    code: { type: String, required: true },
  },
  cargoType: { type: String, required: true },
  requestedQuantity: { type: Number, required: true, min: 1 },
  confirmedQuantity: { type: Number, default: 0, min: 0 },
  standbyQuantity: { type: Number, default: 0, min: 0 },
  rejectedQuantity: { type: Number, default: 0, min: 0 },
  pol: {
    portCode: { type: String, required: true },
    portName: { type: String, required: true },
    country: { type: String, required: true },
  },
  pod: {
    portCode: { type: String, required: true },
    portName: { type: String, required: true },
    country: { type: String, required: true },
  },
  status: {
    type: String,
    required: true,
    enum: ['PENDING', 'CONFIRMED', 'PARTIAL', 'STANDBY', 'REJECTED', 'CANCELLED'],
    default: 'PENDING',
  },
  requestedDate: { type: Date, required: true },
  confirmedDate: { type: Date },
  confirmationEmailSent: { type: Boolean, default: false },
  confirmationEmailSentAt: { type: Date },
  confirmationNotes: { type: String },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String },
}, {
  timestamps: true,
});

BookingSchema.index({ voyageId: 1 });
BookingSchema.index({ contractId: 1 });
BookingSchema.index({ status: 1 });

// ============================================================================
// SHIPMENT SCHEMA
// ============================================================================

const ShipperSchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true },
  contact: { type: String, required: true },
  email: { type: String, required: true },
  address: { type: String },
}, { _id: false });

const CargoUnitSchema = new Schema({
  unitId: { type: String, required: true },
  type: { type: String, enum: ['PALLET', 'CONTAINER'], required: true },
  weight: { type: Number, required: true, min: 0 },
  dimensions: {
    length: { type: Number },
    width: { type: Number },
    height: { type: Number },
  },
  containerType: { type: String, enum: ['20FT', '40FT', '40HC'] },
}, { _id: false });

const ShipmentSchema = new Schema<Shipment>({
  shipmentNumber: { type: String, required: true, unique: true },
  voyageId: { type: Schema.Types.ObjectId, ref: 'Voyage', required: true },
  voyageNumber: { type: String, required: true },
  bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
  contractId: { type: Schema.Types.ObjectId, ref: 'Contract', required: true },
  shipper: ShipperSchema,
  consignee: {
    name: { type: String, required: true },
    code: { type: String, required: true },
  },
  cargoType: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  estimatedWeight: { type: Number, required: true, min: 0 },
  actualWeight: { type: Number, min: 0 },
  pol: {
    portCode: { type: String, required: true },
    portName: { type: String, required: true },
    sequence: { type: Number, required: true },
  },
  pod: {
    portCode: { type: String, required: true },
    portName: { type: String, required: true },
    sequence: { type: Number, required: true },
  },
  status: {
    type: String,
    required: true,
    enum: ['ESTIMATED', 'CONFIRMED', 'PLANNED', 'LOADED', 'IN_TRANSIT', 'DISCHARGED', 'DELIVERED', 'CANCELLED'],
    default: 'ESTIMATED',
  },
  cargoUnits: [CargoUnitSchema],
  estimatedDate: { type: Date, required: true },
  confirmedDate: { type: Date },
  loadedDate: { type: Date },
  dischargedDate: { type: Date },
  specialInstructions: { type: String },
}, {
  timestamps: true,
});

ShipmentSchema.index({ voyageId: 1 });
ShipmentSchema.index({ bookingId: 1 });
ShipmentSchema.index({ status: 1 });

// ============================================================================
// VESSEL SCHEMA
// ============================================================================

const PositionSchema = new Schema({
  lcg: { type: Number, required: true },
  tcg: { type: Number, required: true },
  vcg: { type: Number, required: true },
}, { _id: false });

const CoolingSectionSchema = new Schema({
  sectionId: { type: String, required: true },
  compartmentIds: [{ type: String, required: true }],
  assignedTemperatureZone: { type: String },
  currentTemperature: { type: Number },
  locked: { type: Boolean, default: false },
}, { _id: false });

const CompartmentSchema = new Schema({
  id: { type: String, required: true },
  holdNumber: { type: Number, required: true, min: 1, max: 4 },
  level: { 
    type: String, 
    required: true,
    enum: ['DECK', 'UPD', 'FC', 'A', 'B', 'C', 'D']
  },
  capacityCbft: { type: Number, required: true },
  capacitySqm: { type: Number, required: true },
  maxPallets: { type: Number, required: true },
  dimensions: {
    length: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  position: PositionSchema,
  maxStackWeight: { type: Number, required: true },
  coolingSectionId: { type: String, required: true },
  canLoadContainers: { type: Boolean, default: false },
  hatchSize: {
    length: { type: Number, required: true },
    width: { type: Number, required: true },
  },
}, { _id: false });

const HoldSchema = new Schema({
  holdNumber: { type: Number, required: true },
  compartments: [CompartmentSchema],
  totalCapacityCbft: { type: Number, required: true },
  totalCapacitySqm: { type: Number, required: true },
}, { _id: false });

const TemperatureZoneSchema = new Schema({
  zoneId: { type: String, required: true },
  minTemp: { type: Number, required: true },
  maxTemp: { type: Number, required: true },
  color: { type: String, required: true },
  name: { type: String, required: true },
}, { _id: false });

const VesselSchema = new Schema<Vessel>({
  name: { type: String, required: true, unique: true },
  imoNumber: { type: String, required: true, unique: true },
  flag: { type: String, required: true },
  callSign: { type: String, required: true },
  dimensions: {
    loa: { type: Number, required: true },
    beam: { type: Number, required: true },
    depth: { type: Number, required: true },
    draft: {
      summer: { type: Number, required: true },
      winter: { type: Number, required: true },
      tropical: { type: Number, required: true },
    },
  },
  capacity: {
    gt: { type: Number, required: true },
    nt: { type: Number, required: true },
    dwat: {
      summer: { type: Number, required: true },
      winter: { type: Number, required: true },
      tropical: { type: Number, required: true },
    },
    totalCbft: { type: Number, required: true },
    totalSqm: { type: Number, required: true },
    totalPallets: { type: Number, required: true },
  },
  holds: [HoldSchema],
  temperatureZones: [TemperatureZoneSchema],
  coolingSections: [CoolingSectionSchema],
  maxTemperatureZones: { type: Number, required: true },
  deckContainerCapacity: {
    maxReeferPlugs: { type: Number, required: true },
    maxTEU: { type: Number, required: true },
    maxFEU: { type: Number, required: true },
  },
  stability: {
    lightship: {
      weight: { type: Number, required: true },
      lcg: { type: Number, required: true },
      vcg: { type: Number, required: true },
      tcg: { type: Number, required: true },
    },
    referenceLimits: {
      minGM: { type: Number, required: true },
      maxGM: { type: Number, required: true },
      maxTrim: { type: Number, required: true },
      maxList: { type: Number, required: true },
      maxDraft: { type: Number, required: true },
    },
    approvalRequired: { type: Boolean, default: true },
  },
  classification: {
    society: { type: String, required: true },
    mainClass: { type: String, required: true },
    serviceNotations: { type: String, required: true },
  },
  built: { type: Date, required: true },
}, {
  timestamps: true,
});

VesselSchema.index({ name: 1 });
VesselSchema.index({ imoNumber: 1 });

// ============================================================================
// STOWAGE PLAN SCHEMA
// ============================================================================

const CargoPositionSchema = new Schema({
  shipmentId: { type: Schema.Types.ObjectId, ref: 'Shipment', required: true },
  cargoUnitId: { type: String, required: true },
  compartment: {
    id: { type: String, required: true },
    holdNumber: { type: Number, required: true },
    level: { type: String, required: true },
  },
  stackPosition: {
    row: { type: Number },
    tier: { type: Number },
    bay: { type: Number },
  },
  weight: { type: Number, required: true },
  position: PositionSchema,
}, { _id: false });

const PreliminaryStabilitySchema = new Schema({
  calculatedAt: { type: Date, required: true },
  displacement: { type: Number, required: true },
  estimatedKG: { type: Number, required: true },
  estimatedLCG: { type: Number, required: true },
  estimatedTCG: { type: Number, required: true },
  estimatedGM: { type: Number, required: true },
  estimatedTrim: { type: Number, required: true },
  estimatedList: { type: Number, required: true },
  estimatedDrafts: {
    forward: { type: Number, required: true },
    aft: { type: Number, required: true },
    mean: { type: Number, required: true },
  },
  preliminaryCheck: {
    withinReferenceLimits: { type: Boolean, required: true },
    warnings: [{ type: String }],
    notes: [{ type: String }],
  },
  disclaimer: { 
    type: String, 
    default: 'Estos cálculos son estimaciones para planificación. El capitán debe aprobar y verificar con sistemas oficiales a bordo.'
  },
}, { _id: false });

const StowagePlanSchema = new Schema<StowagePlan>({
  planNumber: { type: String, required: true, unique: true },
  voyageId: { type: Schema.Types.ObjectId, ref: 'Voyage', required: true },
  voyageNumber: { type: String, required: true },
  vesselId: { type: Schema.Types.ObjectId, ref: 'Vessel', required: true },
  vesselName: { type: String, required: true },
  cargoPositions: [CargoPositionSchema],
  preliminaryStability: PreliminaryStabilitySchema,
  status: {
    type: String,
    required: true,
    enum: [
      'ESTIMATED',
      'DRAFT',
      'READY_FOR_CAPTAIN',
      'EMAIL_SENT',
      'CAPTAIN_APPROVED',
      'CAPTAIN_REJECTED',
      'IN_REVISION',
      'READY_FOR_EXECUTION',
      'IN_EXECUTION',
      'COMPLETED',
      'CANCELLED'
    ],
    default: 'DRAFT',
  },
  overstowViolations: [{
    compartmentId: { type: String, required: true },
    description: { type: String, required: true },
    affectedShipments: [{ type: String }],
  }],
  temperatureConflicts: [{
    compartmentId: { type: String, required: true },
    coolingSectionId: { type: String, required: true },
    description: { type: String, required: true },
    affectedShipments: [{ type: String }],
  }],
  weightDistributionWarnings: [{ type: String }],
  captainCommunication: {
    emailSentAt: { type: Date },
    captainName: { type: String },
    captainEmail: { type: String },
    responseReceivedAt: { type: Date },
    responseType: { type: String, enum: ['APPROVED', 'REJECTED', 'PENDING'] },
    captainComments: { type: String },
    rejectionReasons: [{ type: String }],
    processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  generatedDocuments: {
    stowagePlanPDF: { type: String },
    stabilityDataPDF: { type: String },
    cargoManifestPDF: { type: String },
    loadingSequencePDF: { type: String },
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, {
  timestamps: true,
});

StowagePlanSchema.index({ voyageId: 1 });
StowagePlanSchema.index({ vesselId: 1 });
StowagePlanSchema.index({ status: 1 });

// ============================================================================
// CAPTAIN CONTACT SCHEMA
// ============================================================================

const CaptainContactSchema = new Schema<CaptainContact>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  vesselId: { type: Schema.Types.ObjectId, ref: 'Vessel', required: true },
  vesselName: { type: String, required: true },
  preferredLanguage: {
    type: String,
    enum: ['en', 'es', 'pt'],
    default: 'en',
  },
  ccEmails: [{ type: String }],
  notes: { type: String },
  active: { type: Boolean, default: true },
}, {
  timestamps: true,
});

CaptainContactSchema.index({ vesselId: 1 });
CaptainContactSchema.index({ active: 1 });

// ============================================================================
// USER SCHEMA
// ============================================================================

const UserSchema = new Schema<User>({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  role: {
    type: String,
    required: true,
    enum: ['ADMIN', 'SHIPPING_PLANNER', 'STEVEDORE', 'CHECKER', 'EXPORTER', 'VIEWER'],
  },
  company: { type: String },
  port: { type: String },
  canSendEmailsToCaptains: { type: Boolean, default: false },
}, {
  timestamps: true,
});

UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });

// ============================================================================
// MODELS EXPORT
// ============================================================================

export const ServiceModel = 
  (mongoose.models.Service as Model<Service>) || 
  mongoose.model<Service>('Service', ServiceSchema);

export const VoyageModel = 
  (mongoose.models.Voyage as Model<Voyage>) || 
  mongoose.model<Voyage>('Voyage', VoyageSchema);

export const ContractModel = 
  (mongoose.models.Contract as Model<Contract>) || 
  mongoose.model<Contract>('Contract', ContractSchema);

export const BookingModel = 
  (mongoose.models.Booking as Model<Booking>) || 
  mongoose.model<Booking>('Booking', BookingSchema);

export const ShipmentModel = 
  (mongoose.models.Shipment as Model<Shipment>) || 
  mongoose.model<Shipment>('Shipment', ShipmentSchema);

export const VesselModel = 
  (mongoose.models.Vessel as Model<Vessel>) || 
  mongoose.model<Vessel>('Vessel', VesselSchema);

export const StowagePlanModel = 
  (mongoose.models.StowagePlan as Model<StowagePlan>) || 
  mongoose.model<StowagePlan>('StowagePlan', StowagePlanSchema);

export const CaptainContactModel = 
  (mongoose.models.CaptainContact as Model<CaptainContact>) || 
  mongoose.model<CaptainContact>('CaptainContact', CaptainContactSchema);

export const UserModel = 
  (mongoose.models.User as Model<User>) || 
  mongoose.model<User>('User', UserSchema);
