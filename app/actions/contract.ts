// ============================================================================
// CONTRACT SERVER ACTIONS
// Manages annual contracts with shippers
//
// CHANGE #5: Multiple Consignees per Shipper
// Each contract can have multiple consignees with different POL/POD
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { ContractModel } from '@/lib/db/schemas';
import type { Contract } from '@/types/models';

// ----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

const ContractIdSchema = z.string().min(1, 'Contract ID is required');

const ContractNumberSchema = z.string()
  .regex(/^CT-\d{4}-\d{4}$/, 'Contract number format: CT-YYYY-NNNN');

const ConsigneeSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().min(1),
  country: z.string().min(1),
  contact: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
});

const CreateContractSchema = z.object({
  contractNumber: ContractNumberSchema.optional(), // Auto-generated if not provided
  serviceId: z.string().min(1, 'Service ID is required'),
  
  shipper: z.object({
    name: z.string().min(1).max(200),
    address: z.string().min(1),
    country: z.string().min(1),
    contact: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
  }),
  
  // CHANGE #5: Multiple consignees
  consignees: z.array(ConsigneeSchema).min(1, 'At least one consignee is required'),
  
  terms: z.object({
    startDate: z.date(),
    endDate: z.date(),
    annualVolume: z.number().int().positive(),
    pricePerUnit: z.number().positive(),
    currency: z.string().length(3).default('USD'),
    paymentTerms: z.string().min(1),
  }),
  
  cargoType: z.enum([
    'BANANAS',
    'FROZEN_FISH',
    'TABLE_GRAPES',
    'CITRUS',
    'AVOCADOS',
    'BERRIES',
    'OTHER_FROZEN',
    'OTHER_CHILLED',
  ]),
  
  status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED']).default('DRAFT'),
});

const UpdateContractSchema = CreateContractSchema.partial();

// ----------------------------------------------------------------------------
// CREATE CONTRACT
// ----------------------------------------------------------------------------

export async function createContract(data: unknown) {
  try {
    const validated = CreateContractSchema.parse(data);
    
    await connectDB();
    
    // Generate contract number if not provided
    let contractNumber = validated.contractNumber;
    if (!contractNumber) {
      const year = new Date().getFullYear();
      const count = await ContractModel.countDocuments();
      contractNumber = `CT-${year}-${String(count + 1).padStart(4, '0')}`;
    } else {
      // Check if contract number already exists
      const existing = await ContractModel.findOne({ contractNumber });
      if (existing) {
        return {
          success: false,
          error: `Contract number ${contractNumber} already exists`,
        };
      }
    }
    
    // Validate dates
    if (validated.terms.endDate <= validated.terms.startDate) {
      return {
        success: false,
        error: 'End date must be after start date',
      };
    }
    
    const contract = await ContractModel.create({
      ...validated,
      contractNumber,
    });
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(contract)),
      message: `Contract ${contractNumber} created successfully`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors[0].message}`,
      };
    }
    console.error('Error creating contract:', error);
    return {
      success: false,
      error: 'Failed to create contract',
    };
  }
}

// ----------------------------------------------------------------------------
// UPDATE CONTRACT
// ----------------------------------------------------------------------------

export async function updateContract(
  contractId: unknown,
  updates: unknown
) {
  try {
    const id = ContractIdSchema.parse(contractId);
    const validated = UpdateContractSchema.parse(updates);
    
    await connectDB();
    
    // Validate dates if both provided
    if (validated.terms?.startDate && validated.terms?.endDate) {
      if (validated.terms.endDate <= validated.terms.startDate) {
        return {
          success: false,
          error: 'End date must be after start date',
        };
      }
    }
    
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
      return {
        success: false,
        error: `Validation error: ${error.errors[0].message}`,
      };
    }
    console.error('Error updating contract:', error);
    return {
      success: false,
      error: 'Failed to update contract',
    };
  }
}

// ----------------------------------------------------------------------------
// TERMINATE CONTRACT
// Sets contract status to TERMINATED
// ----------------------------------------------------------------------------

export async function terminateContract(contractId: unknown, reason?: string) {
  try {
    const id = ContractIdSchema.parse(contractId);
    
    await connectDB();
    
    const contract = await ContractModel.findByIdAndUpdate(
      id,
      { 
        status: 'TERMINATED',
        terminatedAt: new Date(),
        terminationReason: reason,
      },
      { new: true }
    );
    
    if (!contract) {
      return { success: false, error: 'Contract not found' };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(contract)),
      message: `Contract ${contract.contractNumber} terminated`,
    };
  } catch (error) {
    console.error('Error terminating contract:', error);
    return {
      success: false,
      error: 'Failed to terminate contract',
    };
  }
}

// ----------------------------------------------------------------------------
// GET ALL CONTRACTS
// ----------------------------------------------------------------------------

export async function getContracts() {
  try {
    await connectDB();
    
    const contracts = await ContractModel.find()
      .populate('serviceId', 'serviceCode serviceName')
      .sort({ 'terms.startDate': -1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(contracts)),
    };
  } catch (error) {
    console.error('Error fetching contracts:', error);
    return {
      success: false,
      error: 'Failed to fetch contracts',
    };
  }
}

// ----------------------------------------------------------------------------
// GET ACTIVE CONTRACTS
// Returns contracts with ACTIVE status
// ----------------------------------------------------------------------------

export async function getActiveContracts() {
  try {
    await connectDB();
    
    const contracts = await ContractModel.find({ status: 'ACTIVE' })
      .populate('serviceId', 'serviceCode serviceName')
      .sort({ 'terms.startDate': -1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(contracts)),
    };
  } catch (error) {
    console.error('Error fetching active contracts:', error);
    return {
      success: false,
      error: 'Failed to fetch active contracts',
    };
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
      .lean();
    
    if (!contract) {
      return { success: false, error: 'Contract not found' };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(contract)),
    };
  } catch (error) {
    console.error('Error fetching contract:', error);
    return {
      success: false,
      error: 'Failed to fetch contract',
    };
  }
}

// ----------------------------------------------------------------------------
// GET CONTRACT BY NUMBER
// ----------------------------------------------------------------------------

export async function getContractByNumber(contractNumber: unknown) {
  try {
    const number = ContractNumberSchema.parse(contractNumber);
    
    await connectDB();
    
    const contract = await ContractModel.findOne({ contractNumber: number })
      .populate('serviceId')
      .lean();
    
    if (!contract) {
      return { success: false, error: 'Contract not found' };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(contract)),
    };
  } catch (error) {
    console.error('Error fetching contract by number:', error);
    return {
      success: false,
      error: 'Failed to fetch contract',
    };
  }
}

// ----------------------------------------------------------------------------
// GET CONTRACTS BY SHIPPER
// ----------------------------------------------------------------------------

export async function getContractsByShipper(shipperName: unknown) {
  try {
    const name = z.string().min(1).parse(shipperName);
    
    await connectDB();
    
    const contracts = await ContractModel.find({
      'shipper.name': { $regex: new RegExp(name, 'i') },
    })
      .populate('serviceId', 'serviceCode serviceName')
      .sort({ 'terms.startDate': -1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(contracts)),
    };
  } catch (error) {
    console.error('Error fetching contracts by shipper:', error);
    return {
      success: false,
      error: 'Failed to fetch contracts',
    };
  }
}

// ----------------------------------------------------------------------------
// GET CONTRACTS BY SERVICE
// ----------------------------------------------------------------------------

export async function getContractsByService(serviceId: unknown) {
  try {
    const id = z.string().parse(serviceId);
    
    await connectDB();
    
    const contracts = await ContractModel.find({ serviceId: id })
      .sort({ 'terms.startDate': -1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(contracts)),
    };
  } catch (error) {
    console.error('Error fetching contracts by service:', error);
    return {
      success: false,
      error: 'Failed to fetch contracts',
    };
  }
}

// ----------------------------------------------------------------------------
// ADD CONSIGNEE TO CONTRACT
// CHANGE #5: Support for multiple consignees
// ----------------------------------------------------------------------------

export async function addConsigneeToContract(
  contractId: unknown,
  consigneeData: unknown
) {
  try {
    const id = ContractIdSchema.parse(contractId);
    const consignee = ConsigneeSchema.parse(consigneeData);
    
    await connectDB();
    
    const contract = await ContractModel.findById(id);
    
    if (!contract) {
      return { success: false, error: 'Contract not found' };
    }
    
    // Check if consignee already exists (by email)
    if (contract.consignees.some(c => c.email === consignee.email)) {
      return {
        success: false,
        error: 'Consignee with this email already exists in contract',
      };
    }
    
    contract.consignees.push(consignee);
    await contract.save();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(contract)),
      message: `Consignee ${consignee.name} added to contract`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors[0].message}`,
      };
    }
    console.error('Error adding consignee to contract:', error);
    return {
      success: false,
      error: 'Failed to add consignee',
    };
  }
}

// ----------------------------------------------------------------------------
// REMOVE CONSIGNEE FROM CONTRACT
// ----------------------------------------------------------------------------

export async function removeConsigneeFromContract(
  contractId: unknown,
  consigneeEmail: unknown
) {
  try {
    const id = ContractIdSchema.parse(contractId);
    const email = z.string().email().parse(consigneeEmail);
    
    await connectDB();
    
    const contract = await ContractModel.findById(id);
    
    if (!contract) {
      return { success: false, error: 'Contract not found' };
    }
    
    // Must have at least one consignee
    if (contract.consignees.length <= 1) {
      return {
        success: false,
        error: 'Cannot remove last consignee. Contract must have at least one consignee.',
      };
    }
    
    const initialLength = contract.consignees.length;
    contract.consignees = contract.consignees.filter(c => c.email !== email);
    
    if (contract.consignees.length === initialLength) {
      return {
        success: false,
        error: 'Consignee not found in contract',
      };
    }
    
    await contract.save();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(contract)),
      message: 'Consignee removed from contract',
    };
  } catch (error) {
    console.error('Error removing consignee from contract:', error);
    return {
      success: false,
      error: 'Failed to remove consignee',
    };
  }
}

// ----------------------------------------------------------------------------
// CHECK CONTRACT EXPIRATION
// Returns contracts expiring soon
// ----------------------------------------------------------------------------

export async function getExpiringContracts(daysAhead: number = 30) {
  try {
    await connectDB();
    
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + daysAhead);
    
    const contracts = await ContractModel.find({
      status: 'ACTIVE',
      'terms.endDate': { $lte: expirationDate },
    })
      .populate('serviceId', 'serviceCode serviceName')
      .sort({ 'terms.endDate': 1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(contracts)),
      count: contracts.length,
    };
  } catch (error) {
    console.error('Error fetching expiring contracts:', error);
    return {
      success: false,
      error: 'Failed to fetch expiring contracts',
    };
  }
}
