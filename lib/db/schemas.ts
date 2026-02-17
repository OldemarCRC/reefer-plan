// ============================================================================
// MONGODB SCHEMAS - MONGOOSE (VOYAGE SIMPLIFICADO)
// ============================================================================

import mongoose, { Schema, Model } from 'mongoose';
// Type imports no longer needed for Schema generics — type safety lives in server actions

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

const ServiceSchema = new Schema({
  serviceCode: { type: String, required: true, unique: true },
  shortCode: { type: String, unique: true, sparse: true },
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
  country: { type: String },
  sequence: { type: Number, required: true },
  weekNumber: { type: Number, min: 1, max: 53 },
  eta: { type: Date },
  etd: { type: Date },
  ata: { type: Date },
  atd: { type: Date },
  operations: [{ type: String, enum: ['LOAD', 'DISCHARGE'] }],
  locked: { type: Boolean, default: false },
  lockedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  lockedAt: { type: Date },
  status: {
    type: String,
    enum: ['SCHEDULED', 'CANCELLED', 'COMPLETED', 'SKIPPED'],
    default: 'SCHEDULED',
  },
  addedPostCreation: { type: Boolean, default: false },
  cancelledAt: { type: Date },
  cancelledBy: { type: String },
  cancellationReason: { type: String },
}, { _id: false });

const PortCallChangelogEntrySchema = new Schema({
  changedAt: { type: Date, default: Date.now },
  changedBy: { type: String, default: 'SYSTEM' },
  action: { type: String, enum: ['CANCELLED', 'RESTORED', 'ADDED', 'REORDERED', 'DATE_CHANGED'], required: true },
  portCode: { type: String, required: true },
  portName: { type: String, required: true },
  previousValue: { type: String },
  newValue: { type: String },
  reason: { type: String },
}, { _id: false });

const VoyageSchema = new Schema({
  voyageNumber: { type: String, required: true, unique: true },
  vesselId: { type: Schema.Types.ObjectId, ref: 'Vessel' },
  vesselName: { type: String, required: true },
  serviceId: { type: Schema.Types.ObjectId, ref: 'Service' },

  // Campos opcionales (se pueden agregar después)
  serviceCode: { type: String },
  weekNumber: { type: Number, min: 1, max: 53 },
  year: { type: Number },
  startDate: { type: Date },
  departureDate: { type: Date },
  estimatedArrivalDate: { type: Date },
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
  portCallChangelog: [PortCallChangelogEntrySchema],
}, {
  timestamps: true,
});

VoyageSchema.index({ vesselId: 1 });
VoyageSchema.index({ serviceId: 1 });
VoyageSchema.index({ status: 1 });
VoyageSchema.index({ weekNumber: 1, year: 1 });

// ============================================================================
// OFFICE SCHEMA
// ============================================================================

const OfficeSchema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true, minlength: 3, maxlength: 3 },
  name: { type: String, required: true },
  country: { type: String, required: true },
  active: { type: Boolean, default: true },
}, {
  timestamps: true,
});

OfficeSchema.index({ active: 1 });

// ============================================================================
// CONTRACT SCHEMA
// ============================================================================

const CounterpartySchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true },
  weeklyEstimate: { type: Number, required: true, min: 0 },
  cargoTypes: [{ type: String }],
}, { _id: false });

const ContractSchema = new Schema({
  contractNumber: { type: String, required: true, unique: true },
  officeId: { type: Schema.Types.ObjectId, ref: 'Office', required: true },
  officeCode: { type: String, required: true },
  client: {
    type: { type: String, enum: ['SHIPPER', 'CONSIGNEE'], required: true },
    name: { type: String, required: true },
    clientNumber: { type: String, required: true },
    contact: { type: String, required: true },
    email: { type: String, required: true },
    country: { type: String, required: true },
  },
  shippers: [CounterpartySchema],
  consignees: [CounterpartySchema],
  serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
  serviceCode: { type: String, required: true },
  originPort: {
    portCode: { type: String, required: true },
    portName: { type: String, required: true },
    country: { type: String, required: true },
  },
  destinationPort: {
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

ContractSchema.index({ officeId: 1 });
ContractSchema.index({ serviceId: 1 });
ContractSchema.index({ active: 1 });
ContractSchema.index({ 'client.clientNumber': 1 });

// ============================================================================
// BOOKING SCHEMA
// ============================================================================

const BookingSchema = new Schema({
  bookingNumber: { type: String, required: true, unique: true },
  contractId: { type: Schema.Types.ObjectId, ref: 'Contract', required: true },
  voyageId: { type: Schema.Types.ObjectId, ref: 'Voyage', required: true },
  voyageNumber: { type: String, required: true },
  officeCode: { type: String, required: true },
  serviceCode: { type: String, required: true },
  client: {
    name: { type: String, required: true },
    clientNumber: { type: String, required: true },
    contact: { type: String },
    email: { type: String },
  },
  shipper: {
    name: { type: String, required: true },
    code: { type: String, required: true },
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
  requestedTemperature: { type: Number },
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
  estimateSource: {
    type: String,
    enum: ['CONTRACT_DEFAULT', 'SHIPPER_CONFIRMED'],
    default: 'CONTRACT_DEFAULT',
  },
  status: {
    type: String,
    required: true,
    enum: ['PENDING', 'CONFIRMED', 'PARTIAL', 'STANDBY', 'REJECTED', 'CANCELLED'],
    default: 'PENDING',
  },
  requestedDate: { type: Date },
  confirmedDate: { type: Date },
  approvedBy: { type: String },
  rejectionReason: { type: String },
}, {
  timestamps: true,
});

BookingSchema.index({ voyageId: 1 });
BookingSchema.index({ contractId: 1 });
BookingSchema.index({ status: 1 });
BookingSchema.index({ officeCode: 1 });

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

const ShipmentSchema = new Schema({
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

// Individual cooling section with physical specs (floor area, stowage factors)
const CoolingSectionDetailSchema = new Schema({
  sectionId: { type: String, required: true },       // "1A", "2UPD", "1FC"
  sqm: { type: Number, required: true },             // floor area in sqm (from vessel spec sheet)
  designStowageFactor: { type: Number, required: true, default: 1.32 }, // from spec sheet
  historicalStowageFactor: { type: Number },         // rolling average across completed voyages
  historicalVoyageCount: { type: Number, default: 0 }, // # voyages in historical average
  // maxPallets is CALCULATED (not stored): Math.floor(sqm * chosenFactor)
}, { _id: false });

// Temperature zone = group of cooling sections on the same refrigeration circuit
const CoolingSectionSchema = new Schema({
  zoneId: { type: String, required: true },          // "1AB", "2UPDAB", etc.
  coolingSections: [CoolingSectionDetailSchema],     // nested per-section specs
  temperatureRange: {
    min: { type: Number },
    max: { type: Number },
  },
  assignedTemperatureZone: { type: String },
  currentTemperature: { type: Number },
  locked: { type: Boolean, default: false },
}, { _id: false });

const CompartmentSchema = new Schema({
  id: { type: String, required: true },
  holdNumber: { type: Number, min: 1, max: 4 },
  level: {
    type: String,
    enum: ['DECK', 'UPD', 'FC', 'A', 'B', 'C', 'D']
  },
  capacityCbft: { type: Number },
  capacitySqm: { type: Number },
  maxPallets: { type: Number },
  dimensions: {
    length: { type: Number },
    width: { type: Number },
    height: { type: Number },
  },
  position: PositionSchema,
  maxStackWeight: { type: Number },
  coolingSectionId: { type: String },
  canLoadContainers: { type: Boolean, default: false },
  hatchSize: {
    length: { type: Number },
    width: { type: Number },
  },
}, { _id: false });

const HoldSchema = new Schema({
  holdNumber: { type: Number, required: true },
  compartments: [CompartmentSchema],
  totalCapacityCbft: { type: Number },
  totalCapacitySqm: { type: Number },
}, { _id: false });

const VesselSchema = new Schema({
  name: { type: String, required: true, unique: true },
  imoNumber: { type: String, required: true, unique: true },
  flag: { type: String, required: true },
  callSign: { type: String },
  dimensions: {
    loa: { type: Number },
    beam: { type: Number },
    depth: { type: Number },
    draft: {
      summer: { type: Number },
      winter: { type: Number },
      tropical: { type: Number },
    },
  },
  capacity: {
    gt: { type: Number },
    nt: { type: Number },
    dwat: {
      summer: { type: Number },
      winter: { type: Number },
      tropical: { type: Number },
    },
    totalCbft: { type: Number },
    totalSqm: { type: Number },
    totalPallets: { type: Number },
  },
  holds: [HoldSchema],
  temperatureZones: [CoolingSectionSchema],
  maxTemperatureZones: { type: Number },
  deckContainerCapacity: {
    maxReeferPlugs: { type: Number },
    maxTEU: { type: Number },
    maxFEU: { type: Number },
  },
  stability: {
    lightship: {
      weight: { type: Number },
      lcg: { type: Number },
      vcg: { type: Number },
      tcg: { type: Number },
    },
    referenceLimits: {
      minGM: { type: Number },
      maxGM: { type: Number },
      maxTrim: { type: Number },
      maxList: { type: Number },
      maxDraft: { type: Number },
    },
    approvalRequired: { type: Boolean, default: true },
  },
  classification: {
    society: { type: String },
    mainClass: { type: String },
    serviceNotations: { type: String },
  },
  built: { type: Date },
}, {
  timestamps: true,
});

VesselSchema.index({ name: 1 });
VesselSchema.index({ imoNumber: 1 });

// ============================================================================
// STOWAGE PLAN SCHEMA
// ============================================================================

const CargoPositionSchema = new Schema({
  shipmentId: { type: Schema.Types.ObjectId, ref: 'Shipment' }, // optional — not all positions come from formal shipments
  bookingId: { type: String },          // booking reference (string for flexibility)
  cargoUnitId: { type: String },
  cargoType: { type: String },          // e.g. 'BANANAS', 'TABLE_GRAPES' — used for temp-conflict checks
  quantity: { type: Number, default: 0 }, // pallets in this position
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
  weight: { type: Number, default: 0 },
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

const StowagePlanSchema = new Schema({
  planNumber: { type: String, required: true, unique: true },
  voyageId: { type: Schema.Types.ObjectId, ref: 'Voyage', required: true },
  voyageNumber: { type: String, required: true },
  vesselId: { type: Schema.Types.ObjectId, ref: 'Vessel', required: true },
  vesselName: { type: String, required: true },
  cargoPositions: [CargoPositionSchema],
  preliminaryStability: { type: PreliminaryStabilitySchema, default: undefined },
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
  coolingSectionStatus: [{
    zoneId: { type: String, required: true },
    coolingSectionIds: [{ type: String }],
    assignedTemperature: { type: Number },
    locked: { type: Boolean, default: false },
  }],
  temperatureChangelog: [{
    changedAt: { type: Date, required: true },
    changedBy: { type: String, required: true },
    reason: { type: String },
    changes: [{
      zoneId: { type: String, required: true },
      coolingSectionIds: [{ type: String }],
      fromTemp: { type: Number, required: true },
      toTemp: { type: Number, required: true },
      _id: false,
    }],
    affectedBookings: [{ type: String }],
  }],
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
  communicationLog: [{
    sentAt: { type: Date, required: true },
    sentBy: { type: String, default: 'SYSTEM' },
    recipients: [{
      name: { type: String },
      email: { type: String, required: true },
      role: { type: String, default: 'CAPTAIN' }, // CAPTAIN | CC
      _id: false,
    }],
    planStatus: { type: String },
    note: { type: String },
  }],
  createdBy: { type: String, default: 'SYSTEM' },
}, {
  timestamps: true,
});

StowagePlanSchema.index({ voyageId: 1 });
StowagePlanSchema.index({ vesselId: 1 });
StowagePlanSchema.index({ status: 1 });

// ============================================================================
// CAPTAIN CONTACT SCHEMA
// ============================================================================

const CaptainContactSchema = new Schema({
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

const UserSchema = new Schema({
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mongoose schemas are untyped; type safety lives in server actions
type AnyModel = Model<any>;

export const OfficeModel: AnyModel =
  mongoose.models.Office || mongoose.model('Office', OfficeSchema);

export const ServiceModel: AnyModel =
  mongoose.models.Service || mongoose.model('Service', ServiceSchema);

export const VoyageModel: AnyModel =
  mongoose.models.Voyage || mongoose.model('Voyage', VoyageSchema);

export const ContractModel: AnyModel =
  mongoose.models.Contract || mongoose.model('Contract', ContractSchema);

export const BookingModel: AnyModel =
  mongoose.models.Booking || mongoose.model('Booking', BookingSchema);

export const ShipmentModel: AnyModel =
  mongoose.models.Shipment || mongoose.model('Shipment', ShipmentSchema);

export const VesselModel: AnyModel =
  mongoose.models.Vessel || mongoose.model('Vessel', VesselSchema);

// Delete cached model so schema changes take effect without server restart
delete mongoose.models.StowagePlan;
export const StowagePlanModel: AnyModel = mongoose.model('StowagePlan', StowagePlanSchema);

export const CaptainContactModel: AnyModel =
  mongoose.models.CaptainContact || mongoose.model('CaptainContact', CaptainContactSchema);

export const UserModel: AnyModel =
  mongoose.models.User || mongoose.model('User', UserSchema);
