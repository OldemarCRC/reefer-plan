// ============================================================================
// PORT SERVER ACTIONS
// CRUD for the Port master list (no delete — ports are kept for history)
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { PortModel, UnecePortModel } from '@/lib/db/schemas';

// ----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

const PortIdSchema = z.string().min(1, 'Port ID is required');

const CreatePortSchema = z.object({
  unlocode:    z.string().min(2).max(10).toUpperCase().regex(/^[A-Z0-9]+$/, 'UNLOCODE must be uppercase letters/digits'),
  countryCode: z.string().length(2).toUpperCase().regex(/^[A-Z]+$/, '2-letter ISO country code required'),
  country:     z.string().min(1).max(100, 'Country name too long'),
  portName:    z.string().min(2).max(100, 'Port name too long'),
  weatherCity: z.string().min(1).max(100, 'City name too long'),
  latitude:    z.number().min(-90).max(90).optional(),
  longitude:   z.number().min(-180).max(180).optional(),
});

const UpdatePortSchema = z.object({
  portName:    z.string().min(2).max(100).optional(),
  country:     z.string().min(1).max(100).optional(),
  countryCode: z.string().length(2).toUpperCase().regex(/^[A-Z]+$/).optional(),
  weatherCity: z.string().min(1).max(100).optional(),
  latitude:    z.number().min(-90).max(90).optional(),
  longitude:   z.number().min(-180).max(180).optional(),
  active:      z.boolean().optional(),
});

// ----------------------------------------------------------------------------
// GET ALL PORTS
// ----------------------------------------------------------------------------

export async function getPorts() {
  try {
    await connectDB();
    const ports = await PortModel.find().sort({ unlocode: 1 }).lean();
    return {
      success: true,
      data: (ports as any[]).map((p: any) => ({
        _id:         p._id.toString(),
        unlocode:    p.unlocode,
        countryCode: p.countryCode,
        country:     p.country,
        portName:    p.portName,
        weatherCity: p.weatherCity,
        latitude:    p.latitude,
        longitude:   p.longitude,
        active:      p.active ?? true,
      })),
    };
  } catch (error) {
    console.error('Error fetching ports:', error);
    return { success: false, data: [], error: 'Failed to fetch ports' };
  }
}

// ----------------------------------------------------------------------------
// CREATE PORT
// ----------------------------------------------------------------------------

export async function createPort(input: unknown) {
  try {
    const data = CreatePortSchema.parse(input);
    await connectDB();

    const exists = await PortModel.findOne({ unlocode: data.unlocode });
    if (exists) return { success: false, error: `Port ${data.unlocode} already exists` };

    const port = await PortModel.create({
      unlocode:    data.unlocode,
      countryCode: data.countryCode,
      country:     data.country.trim(),
      portName:    data.portName.trim(),
      weatherCity: data.weatherCity.trim(),
      latitude:    data.latitude,
      longitude:   data.longitude,
      active:      true,
    });

    return {
      success: true,
      data: {
        _id:         port._id.toString(),
        unlocode:    port.unlocode,
        countryCode: port.countryCode,
        country:     port.country,
        portName:    port.portName,
        weatherCity: port.weatherCity,
        latitude:    port.latitude,
        longitude:   port.longitude,
        active:      port.active,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    console.error('Error creating port:', error);
    return { success: false, error: 'Failed to create port' };
  }
}

// ----------------------------------------------------------------------------
// UPDATE PORT (no delete — ports are kept for historical referential integrity)
// ----------------------------------------------------------------------------

export async function updatePort(id: unknown, input: unknown) {
  try {
    const portId = PortIdSchema.parse(id);
    const data   = UpdatePortSchema.parse(input);
    await connectDB();

    const update: Record<string, any> = {};
    if (data.portName    !== undefined) update.portName    = data.portName.trim();
    if (data.country     !== undefined) update.country     = data.country.trim();
    if (data.countryCode !== undefined) update.countryCode = data.countryCode;
    if (data.weatherCity !== undefined) update.weatherCity = data.weatherCity.trim();
    if (data.latitude    !== undefined) update.latitude    = data.latitude;
    if (data.longitude   !== undefined) update.longitude   = data.longitude;
    if (data.active      !== undefined) update.active      = data.active;

    const port = await PortModel.findByIdAndUpdate(portId, update, { new: true }).lean() as any;
    if (!port) return { success: false, error: 'Port not found' };

    return {
      success: true,
      data: {
        _id:         port._id.toString(),
        unlocode:    port.unlocode,
        countryCode: port.countryCode,
        country:     port.country,
        portName:    port.portName,
        weatherCity: port.weatherCity,
        latitude:    port.latitude,
        longitude:   port.longitude,
        active:      port.active ?? true,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message };
    }
    console.error('Error updating port:', error);
    return { success: false, error: 'Failed to update port' };
  }
}

// ----------------------------------------------------------------------------
// GET ALL UNECE REFERENCE PORTS (for the Add Port form dropdowns)
// ----------------------------------------------------------------------------

export async function getUnecePorts() {
  try {
    await connectDB();
    const ports = await UnecePortModel.find().sort({ countryCode: 1, portName: 1 }).lean();
    return {
      success: true,
      data: (ports as any[]).map((p: any) => ({
        _id:         p._id.toString(),
        unlocode:    p.unlocode,
        countryCode: p.countryCode,
        country:     p.country,
        portName:    p.portName,
        latitude:    p.latitude,
        longitude:   p.longitude,
      })),
    };
  } catch (error) {
    console.error('Error fetching UNECE ports:', error);
    return { success: false, data: [], error: 'Failed to fetch UNECE ports' };
  }
}
