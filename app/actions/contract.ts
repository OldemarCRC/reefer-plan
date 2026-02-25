// ============================================================================
// CONTRACT SERVER ACTIONS
// Phase 9A — Redesigned for SHIPPER/CONSIGNEE model with counterparties,
// offices, and auto-generated contract numbers.
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { ContractModel, ServiceModel, OfficeModel, ShipperModel, BookingModel } from '@/lib/db/schemas';

// ----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

const ContractIdSchema = z.string().min(1, 'Contract ID is required');

const CargoTypeSchema = z.enum([
  'BANANAS', 'ORGANIC_BANANAS', 'PLANTAINS', 'FROZEN_FISH', 'TABLE_GRAPES',
  'CITRUS', 'AVOCADOS', 'BERRIES', 'KIWIS', 'PINEAPPLES', 'CHERRIES',
  'BLUEBERRIES', 'PLUMS', 'PEACHES', 'APPLES', 'PEARS', 'PAPAYA',
  'MANGOES', 'OTHER_FROZEN', 'OTHER_CHILLED',
]);

const CounterpartySchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(20),
  weeklyEstimate: z.number().int().min(0),
  cargoTypes: z.array(CargoTypeSchema).min(1),
});

const PortInfoSchema = z.object({
  portCode: z.string().min(4).max(6),
  portName: z.string().min(1),
  country: z.string().min(1),
});

const ContractCounterpartyInputSchema = z.object({
  shipperId:      z.string().min(1),
  shipperName:    z.string().min(1).max(200),
  shipperCode:    z.string().min(1).max(20),
  weeklyEstimate: z.number().int().min(0),
  cargoTypes:     z.array(CargoTypeSchema).min(1),
});

const CreateContractSchema = z.object({
  officeId: z.string().min(1, 'Office ID is required'),
  client: z.object({
    type: z.enum(['SHIPPER', 'CONSIGNEE']),
    name: z.string().min(1).max(200),
    contact: z.string().min(1),
    email: z.string().email(),
    country: z.string().min(1),
  }),
  shippers:       z.array(CounterpartySchema).default([]),
  consignees:     z.array(CounterpartySchema).default([]),
  counterparties: z.array(ContractCounterpartyInputSchema).default([]),
  serviceId: z.string().min(1, 'Service ID is required'),
  originPort: PortInfoSchema,
  destinationPort: PortInfoSchema,
  validFrom: z.coerce.date(),
  validTo: z.coerce.date(),
});

const UpdateContractSchema = z.object({
  client: z.object({
    type: z.enum(['SHIPPER', 'CONSIGNEE']),
    name: z.string().min(1).max(200),
    contact: z.string().min(1),
    email: z.string().email(),
    country: z.string().min(1),
  }).partial().optional(),
  shippers: z.array(CounterpartySchema).optional(),
  consignees: z.array(CounterpartySchema).optional(),
  originPort: PortInfoSchema.optional(),
  destinationPort: PortInfoSchema.optional(),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
  active: z.boolean().optional(),
});

// ----------------------------------------------------------------------------
// AUTO-NUMBERING HELPERS
// ----------------------------------------------------------------------------

async function resolveClientNumber(clientName: string): Promise<string> {
  // If this client already has a number, reuse it
  const existing = await ContractModel.findOne({ 'client.name': clientName }).select('client.clientNumber').lean();
  if (existing?.client?.clientNumber) {
    return existing.client.clientNumber;
  }

  // Otherwise generate the next sequential client number
  const allNumbers = await ContractModel.distinct('client.clientNumber');
  const nextSeq = allNumbers.length + 1;
  return `C${String(nextSeq).padStart(3, '0')}`;
}

async function generateContractNumber(
  officeCode: string,
  serviceShortCode: string,
  year: number,
  clientNumber: string
): Promise<string> {
  const prefix = `${officeCode}${serviceShortCode}${year}${clientNumber}`;
  const count = await ContractModel.countDocuments({
    contractNumber: { $regex: `^${prefix}` },
  });
  const seq = String(count + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

// ----------------------------------------------------------------------------
// CREATE CONTRACT
// ----------------------------------------------------------------------------

export async function createContract(data: unknown) {
  try {
    const validated = CreateContractSchema.parse(data);
    await connectDB();

    // Validate dates
    if (validated.validTo <= validated.validFrom) {
      return { success: false, error: 'validTo must be after validFrom' };
    }

    // Look up office
    const office = await OfficeModel.findById(validated.officeId).lean();
    if (!office) {
      return { success: false, error: 'Office not found' };
    }

    // Look up service
    const service = await ServiceModel.findById(validated.serviceId).lean();
    if (!service) {
      return { success: false, error: 'Service not found' };
    }
    if (!service.shortCode) {
      return { success: false, error: `Service ${service.serviceCode} has no shortCode configured` };
    }

    // Auto-generate client number
    const clientNumber = await resolveClientNumber(validated.client.name);

    // Auto-generate contract number
    const year = new Date().getFullYear();
    const contractNumber = await generateContractNumber(
      office.code,
      service.shortCode,
      year,
      clientNumber
    );

    const contract = await ContractModel.create({
      contractNumber,
      officeId: validated.officeId,
      officeCode: office.code,
      client: {
        ...validated.client,
        clientNumber,
      },
      shippers: validated.shippers,
      consignees: validated.consignees,
      counterparties: validated.counterparties,
      serviceId: validated.serviceId,
      serviceCode: service.serviceCode,
      originPort: validated.originPort,
      destinationPort: validated.destinationPort,
      validFrom: validated.validFrom,
      validTo: validated.validTo,
    });

    return {
      success: true,
      data: JSON.parse(JSON.stringify(contract)),
      message: `Contract ${contractNumber} created successfully`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    console.error('Error creating contract:', error);
    return { success: false, error: 'Failed to create contract' };
  }
}

// ----------------------------------------------------------------------------
// UPDATE CONTRACT
// ----------------------------------------------------------------------------

export async function updateContract(contractId: unknown, updates: unknown) {
  try {
    const id = ContractIdSchema.parse(contractId);
    const validated = UpdateContractSchema.parse(updates);
    await connectDB();

    const contract = await ContractModel.findByIdAndUpdate(
      id,
      { $set: validated },
      { new: true, runValidators: true }
    );

    if (!contract) {
      return { success: false, error: 'Contract not found' };
    }

    return {
      success: true,
      data: JSON.parse(JSON.stringify(contract)),
      message: 'Contract updated successfully',
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    console.error('Error updating contract:', error);
    return { success: false, error: 'Failed to update contract' };
  }
}

// ----------------------------------------------------------------------------
// DEACTIVATE CONTRACT (soft delete)
// ----------------------------------------------------------------------------

export async function deactivateContract(contractId: unknown) {
  try {
    const id = ContractIdSchema.parse(contractId);
    await connectDB();

    const contract = await ContractModel.findByIdAndUpdate(
      id,
      { $set: { active: false } },
      { new: true }
    );

    if (!contract) {
      return { success: false, error: 'Contract not found' };
    }

    return {
      success: true,
      data: JSON.parse(JSON.stringify(contract)),
      message: `Contract ${contract.contractNumber} deactivated`,
    };
  } catch (error) {
    console.error('Error deactivating contract:', error);
    return { success: false, error: 'Failed to deactivate contract' };
  }
}

// ----------------------------------------------------------------------------
// GET ALL CONTRACTS
// ----------------------------------------------------------------------------

export async function getContracts() {
  try {
    await connectDB();

    const contracts = await ContractModel.find()
      .populate('serviceId', 'serviceCode serviceName shortCode')
      .populate('officeId', 'code name country')
      .sort({ createdAt: -1 })
      .lean();

    return { success: true, data: JSON.parse(JSON.stringify(contracts)) };
  } catch (error) {
    console.error('Error fetching contracts:', error);
    return { success: false, error: 'Failed to fetch contracts' };
  }
}

// ----------------------------------------------------------------------------
// GET ACTIVE CONTRACTS
// ----------------------------------------------------------------------------

export async function getActiveContracts() {
  try {
    await connectDB();

    const contracts = await ContractModel.find({ active: true })
      .populate('serviceId', 'serviceCode serviceName shortCode')
      .populate('officeId', 'code name country')
      .sort({ createdAt: -1 })
      .lean();

    return { success: true, data: JSON.parse(JSON.stringify(contracts)) };
  } catch (error) {
    console.error('Error fetching active contracts:', error);
    return { success: false, error: 'Failed to fetch active contracts' };
  }
}

// ----------------------------------------------------------------------------
// GET CONTRACT BY ID
// ----------------------------------------------------------------------------

export async function getContractById(contractId: unknown) {
  try {
    const id = ContractIdSchema.parse(contractId);
    await connectDB();

    const contract = await ContractModel.findById(id)
      .populate('serviceId')
      .populate('officeId')
      .lean();

    if (!contract) {
      return { success: false, error: 'Contract not found' };
    }

    return { success: true, data: JSON.parse(JSON.stringify(contract)) };
  } catch (error) {
    console.error('Error fetching contract:', error);
    return { success: false, error: 'Failed to fetch contract' };
  }
}

// ----------------------------------------------------------------------------
// GET CONTRACTS BY OFFICE
// ----------------------------------------------------------------------------

export async function getContractsByOffice(officeCode: unknown) {
  try {
    const code = z.string().min(1).parse(officeCode);
    await connectDB();

    const contracts = await ContractModel.find({ officeCode: code })
      .populate('serviceId', 'serviceCode serviceName shortCode')
      .sort({ createdAt: -1 })
      .lean();

    return { success: true, data: JSON.parse(JSON.stringify(contracts)) };
  } catch (error) {
    console.error('Error fetching contracts by office:', error);
    return { success: false, error: 'Failed to fetch contracts' };
  }
}

// ----------------------------------------------------------------------------
// GET CONTRACTS BY SERVICE
// ----------------------------------------------------------------------------

export async function getContractsByService(serviceId: unknown) {
  try {
    const id = z.string().min(1).parse(serviceId);
    await connectDB();

    const contracts = await ContractModel.find({ serviceId: id })
      .sort({ createdAt: -1 })
      .lean();

    return { success: true, data: JSON.parse(JSON.stringify(contracts)) };
  } catch (error) {
    console.error('Error fetching contracts by service:', error);
    return { success: false, error: 'Failed to fetch contracts' };
  }
}

// ----------------------------------------------------------------------------
// GET SHIPPER CODES
// Returns {code, name} pairs — pulls from Shipper collection first, then
// falls back to scanning contracts for legacy shippers.
// Used by admin when assigning shipperCode to EXPORTER users.
// ----------------------------------------------------------------------------

export async function getShipperCodes(): Promise<{ success: boolean; data: { code: string; name: string }[]; error?: string }> {
  try {
    await connectDB();

    const map = new Map<string, string>();

    // Primary source: Shipper collection
    const shippers = await ShipperModel.find({ active: true }).select('code name').lean();
    for (const s of shippers as any[]) {
      if (s.code && s.name) map.set(s.code, s.name);
    }

    // Fallback: scan active contracts for legacy shippers arrays
    const contracts = await ContractModel.find({ active: true })
      .select('client shippers consignees counterparties')
      .lean();

    for (const c of contracts as any[]) {
      if (c.client?.type === 'SHIPPER' && c.client?.name) {
        const code = c.client?.clientNumber ?? c.client?.name.slice(0, 10).toUpperCase().replace(/\s/g, '');
        if (!map.has(code)) map.set(code, c.client.name);
      }
      for (const s of c.shippers ?? []) {
        if (s.code && s.name && !map.has(s.code)) map.set(s.code, s.name);
      }
      for (const s of c.consignees ?? []) {
        if (s.code && s.name && !map.has(s.code)) map.set(s.code, s.name);
      }
      for (const s of c.counterparties ?? []) {
        if (s.shipperCode && s.shipperName && !map.has(s.shipperCode)) map.set(s.shipperCode, s.shipperName);
      }
    }

    const data = Array.from(map.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { success: true, data };
  } catch (error) {
    console.error('Error fetching shipper codes:', error);
    return { success: false, data: [], error: 'Failed to fetch shipper codes' };
  }
}

// ----------------------------------------------------------------------------
// ADD SHIPPER TO CONTRACT
// Appends a new entry to contract.counterparties[] after verifying the shipper
// exists in the Shipper collection and is not already assigned.
// ----------------------------------------------------------------------------

const AddContractShipperSchema = z.object({
  shipperId:      z.string().min(1, 'Shipper is required'),
  weeklyEstimate: z.number().int().min(0),
  cargoTypes:     z.array(CargoTypeSchema).min(1, 'At least one cargo type is required'),
});

export async function addShipperToContract(contractId: unknown, data: unknown) {
  try {
    const id = ContractIdSchema.parse(contractId);
    const validated = AddContractShipperSchema.parse(data);
    await connectDB();

    const contract = await ContractModel.findById(id).lean();
    if (!contract) return { success: false, error: 'Contract not found' };
    if (!contract.active) return { success: false, error: 'Contract is not active' };

    const shipper = await ShipperModel.findById(validated.shipperId).lean();
    if (!shipper) return { success: false, error: 'Shipper not found' };

    // Prevent duplicates (by shipperId or shipperCode)
    const alreadyIn = (contract.counterparties as any[])?.find(
      (cp: any) => cp.shipperId?.toString() === validated.shipperId || cp.shipperCode === (shipper as any).code
    );
    if (alreadyIn) {
      return { success: false, error: `${(shipper as any).name} is already assigned to this contract` };
    }

    const updated = await ContractModel.findByIdAndUpdate(
      id,
      {
        $push: {
          counterparties: {
            shipperId: validated.shipperId,
            shipperName: (shipper as any).name,
            shipperCode: (shipper as any).code,
            weeklyEstimate: validated.weeklyEstimate,
            cargoTypes: validated.cargoTypes,
            active: true,
          },
        },
      },
      { new: true }
    );

    return {
      success: true,
      data: JSON.parse(JSON.stringify(updated)),
      message: `${(shipper as any).name} added to contract`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: `Validation error: ${error.issues[0].message}` };
    }
    console.error('Error adding shipper to contract:', error);
    return { success: false, error: 'Failed to add shipper to contract' };
  }
}

// ----------------------------------------------------------------------------
// TOGGLE SHIPPER ACTIVE ON CONTRACT
// Deactivates or reactivates a shipper within a specific contract without
// removing them. Deactivated shippers cannot create new bookings on this
// contract but their existing bookings are preserved.
// ----------------------------------------------------------------------------

export async function toggleContractShipperActive(
  contractId: unknown,
  shipperCode: unknown,
  active: unknown
) {
  try {
    const id = ContractIdSchema.parse(contractId);
    const code = z.string().min(1).parse(shipperCode);
    const isActive = z.boolean().parse(active);
    await connectDB();

    const updated = await ContractModel.findByIdAndUpdate(
      id,
      { $set: { 'counterparties.$[elem].active': isActive } },
      { arrayFilters: [{ 'elem.shipperCode': code }], new: true }
    );

    if (!updated) return { success: false, error: 'Contract not found' };

    return {
      success: true,
      data: JSON.parse(JSON.stringify(updated)),
      message: `Shipper ${code} ${isActive ? 'reactivated' : 'deactivated'} on this contract`,
    };
  } catch (error) {
    console.error('Error toggling shipper active status:', error);
    return { success: false, error: 'Failed to update shipper status' };
  }
}

// ----------------------------------------------------------------------------
// REMOVE SHIPPER FROM CONTRACT
// Permanently removes a shipper from contract.counterparties[].
// Blocked if any non-cancelled/non-rejected bookings exist for this shipper
// under this contract. Use toggleContractShipperActive to deactivate instead.
// ----------------------------------------------------------------------------

export async function removeShipperFromContract(contractId: unknown, shipperCode: unknown) {
  try {
    const id = ContractIdSchema.parse(contractId);
    const code = z.string().min(1).parse(shipperCode);
    await connectDB();

    // Block removal if active bookings exist for this contract + shipper
    const activeBookings = await BookingModel.countDocuments({
      contractId: id,
      'shipper.code': code,
      status: { $nin: ['CANCELLED', 'REJECTED'] },
    });

    if (activeBookings > 0) {
      return {
        success: false,
        error: `Cannot remove: ${activeBookings} active booking(s) exist for this shipper. Deactivate instead.`,
      };
    }

    const updated = await ContractModel.findByIdAndUpdate(
      id,
      { $pull: { counterparties: { shipperCode: code } } },
      { new: true }
    );

    if (!updated) return { success: false, error: 'Contract not found' };

    return {
      success: true,
      data: JSON.parse(JSON.stringify(updated)),
      message: `Shipper ${code} removed from contract`,
    };
  } catch (error) {
    console.error('Error removing shipper from contract:', error);
    return { success: false, error: 'Failed to remove shipper from contract' };
  }
}
