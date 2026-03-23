// ============================================================================
// CUSTOMER SERVER ACTIONS
// CRUD for the Customer collection (consignees, shippers, agents)
// ============================================================================

'use server';

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { CustomerModel } from '@/lib/db/schemas';
import { auth } from '@/auth';
import { toTitleCase, toLower } from '@/lib/utils/normalize';

// ----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

const CustomerIdSchema = z.string().min(1, 'Customer ID is required');

const CreateCustomerSchema = z.object({
  name:         z.string().min(1).max(200),
  type:         z.enum(['CONSIGNEE', 'SHIPPER', 'AGENT']),
  countryCode:  z.string().length(2),
  country:      z.string().min(1).max(100),
  contactName:  z.string().max(150).optional(),
  contactEmail: z.string().email().max(200).optional().or(z.literal('')),
  contactPhone: z.string().max(30).optional(),
  address:      z.string().max(500).optional(),
  notes:        z.string().max(1000).optional(),
});

const UpdateCustomerSchema = z.object({
  name:         z.string().min(1).max(200).optional(),
  type:         z.enum(['CONSIGNEE', 'SHIPPER', 'AGENT']).optional(),
  countryCode:  z.string().length(2).optional(),
  country:      z.string().min(1).max(100).optional(),
  contactName:  z.string().max(150).optional(),
  contactEmail: z.string().email().max(200).optional().or(z.literal('')),
  contactPhone: z.string().max(30).optional(),
  address:      z.string().max(500).optional(),
  notes:        z.string().max(1000).optional(),
  active:       z.boolean().optional(),
});

// ----------------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------------

function serializeCustomer(c: any) {
  return {
    _id:            c._id.toString(),
    customerNumber: c.customerNumber,
    name:           c.name,
    type:           c.type,
    countryCode:    c.countryCode,
    country:        c.country,
    contactName:    c.contactName ?? '',
    contactEmail:   c.contactEmail ?? '',
    contactPhone:   c.contactPhone ?? '',
    address:        c.address ?? '',
    notes:          c.notes ?? '',
    active:         c.active ?? true,
    createdBy:      c.createdBy ?? '',
    createdAt:      c.createdAt?.toISOString() ?? null,
    updatedAt:      c.updatedAt?.toISOString() ?? null,
  };
}

async function generateCustomerNumber(): Promise<string> {
  const count = await CustomerModel.countDocuments();
  return `CUST-${String(count + 1).padStart(4, '0')}`;
}

// ----------------------------------------------------------------------------
// GET CUSTOMERS — all authenticated users
// ----------------------------------------------------------------------------

export async function getCustomers(filter?: { type?: string; active?: boolean }) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, data: [], error: 'Unauthorized' };

    await connectDB();
    const query: Record<string, any> = {};
    if (filter?.type)              query.type = filter.type;
    if (filter?.active !== undefined) query.active = filter.active;

    const customers = await CustomerModel.find(query).sort({ name: 1 }).lean();
    return { success: true, data: (customers as any[]).map(serializeCustomer) };
  } catch (error) {
    console.error('Error fetching customers:', error);
    return { success: false, data: [], error: 'Failed to fetch customers' };
  }
}

// ----------------------------------------------------------------------------
// CREATE CUSTOMER — ADMIN only
// ----------------------------------------------------------------------------

export async function createCustomer(input: unknown) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    if ((session.user as any).role !== 'ADMIN') return { success: false, error: 'Forbidden' };

    const data = CreateCustomerSchema.parse(input);
    await connectDB();

    const customerNumber = await generateCustomerNumber();

    const customer = await CustomerModel.create({
      customerNumber,
      name:         toTitleCase(data.name),
      type:         data.type,
      countryCode:  data.countryCode.toUpperCase(),
      country:      toTitleCase(data.country),
      contactName:  data.contactName ? toTitleCase(data.contactName) : undefined,
      contactEmail: data.contactEmail ? toLower(data.contactEmail) : undefined,
      contactPhone: data.contactPhone?.trim() || undefined,
      address:      data.address?.trim() || undefined,
      notes:        data.notes?.trim() || undefined,
      active:       true,
      createdBy:    (session.user as any).name ?? (session.user as any).email ?? 'SYSTEM',
    });

    return { success: true, customer: serializeCustomer(customer.toObject()) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    if ((error as any)?.code === 11000) {
      return { success: false, error: 'A customer with this number already exists' };
    }
    console.error('Error creating customer:', error);
    return { success: false, error: 'Failed to create customer' };
  }
}

// ----------------------------------------------------------------------------
// UPDATE CUSTOMER — ADMIN only
// ----------------------------------------------------------------------------

export async function updateCustomer(id: unknown, input: unknown) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    if ((session.user as any).role !== 'ADMIN') return { success: false, error: 'Forbidden' };

    const customerId = CustomerIdSchema.parse(id);
    const data = UpdateCustomerSchema.parse(input);
    await connectDB();

    const update: Record<string, any> = {};
    if (data.name         !== undefined) update.name         = toTitleCase(data.name);
    if (data.type         !== undefined) update.type         = data.type;
    if (data.countryCode  !== undefined) update.countryCode  = data.countryCode.toUpperCase();
    if (data.country      !== undefined) update.country      = toTitleCase(data.country);
    if (data.contactName  !== undefined) update.contactName  = data.contactName ? toTitleCase(data.contactName) : '';
    if (data.contactEmail !== undefined) update.contactEmail = data.contactEmail ? toLower(data.contactEmail) : '';
    if (data.contactPhone !== undefined) update.contactPhone = data.contactPhone?.trim() ?? '';
    if (data.address      !== undefined) update.address      = data.address?.trim() ?? '';
    if (data.notes        !== undefined) update.notes        = data.notes?.trim() ?? '';
    if (data.active       !== undefined) update.active       = data.active;

    const customer = await CustomerModel.findByIdAndUpdate(customerId, update, { new: true }).lean() as any;
    if (!customer) return { success: false, error: 'Customer not found' };

    return { success: true, customer: serializeCustomer(customer) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    console.error('Error updating customer:', error);
    return { success: false, error: 'Failed to update customer' };
  }
}

// ----------------------------------------------------------------------------
// DEACTIVATE CUSTOMER — ADMIN only
// ----------------------------------------------------------------------------

export async function deactivateCustomer(id: unknown) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: 'Unauthorized' };
    if ((session.user as any).role !== 'ADMIN') return { success: false, error: 'Forbidden' };

    const customerId = CustomerIdSchema.parse(id);
    await connectDB();

    const customer = await CustomerModel.findByIdAndUpdate(
      customerId,
      { active: false },
      { new: true }
    ).lean() as any;
    if (!customer) return { success: false, error: 'Customer not found' };

    return { success: true };
  } catch (error) {
    console.error('Error deactivating customer:', error);
    return { success: false, error: 'Failed to deactivate customer' };
  }
}
