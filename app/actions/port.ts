// ============================================================================
// PORT SERVER ACTIONS
// CRUD for the Port master list (no delete — ports are kept for history)
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { PortModel } from '@/lib/db/schemas';

// ----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

const PortIdSchema = z.string().min(1, 'Port ID is required');

const CreatePortSchema = z.object({
  code:       z.string().min(2).max(6).toUpperCase().regex(/^[A-Z0-9]+$/, 'Code must be uppercase letters/digits (UNLOCODE)'),
  name:       z.string().min(2).max(100, 'Name too long'),
  country:    z.string().length(2).toUpperCase().regex(/^[A-Z]+$/, '2-letter ISO country code'),
  city:       z.string().min(1).max(100, 'City name too long'),
  puerto:     z.string().max(200).optional(),
  pais_sigla: z.string().max(5).toUpperCase().optional(),
  unlocode:   z.string().max(10).toUpperCase().optional(),
  latitud:    z.number().min(-90).max(90).optional(),
  longitud:   z.number().min(-180).max(180).optional(),
});

const UpdatePortSchema = z.object({
  name:       z.string().min(2).max(100).optional(),
  country:    z.string().length(2).toUpperCase().regex(/^[A-Z]+$/).optional(),
  city:       z.string().min(1).max(100).optional(),
  active:     z.boolean().optional(),
  puerto:     z.string().max(200).optional(),
  pais_sigla: z.string().max(5).toUpperCase().optional(),
  unlocode:   z.string().max(10).toUpperCase().optional(),
  latitud:    z.number().min(-90).max(90).optional(),
  longitud:   z.number().min(-180).max(180).optional(),
});

// ----------------------------------------------------------------------------
// GET ALL PORTS
// ----------------------------------------------------------------------------

export async function getPorts() {
  try {
    await connectDB();
    const ports = await PortModel.find().sort({ code: 1 }).lean();
    return {
      success: true,
      data: (ports as any[]).map((p: any) => ({
        _id:        p._id.toString(),
        code:       p.code,
        name:       p.name,
        country:    p.country,
        city:       p.city,
        puerto:     p.puerto,
        pais_sigla: p.pais_sigla,
        unlocode:   p.unlocode,
        latitud:    p.latitud,
        longitud:   p.longitud,
        active:     p.active ?? true,
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

    const exists = await PortModel.findOne({ code: data.code });
    if (exists) return { success: false, error: `Port ${data.code} already exists` };

    const port = await PortModel.create({
      code:       data.code,
      name:       data.name.trim(),
      country:    data.country,
      city:       data.city.trim(),
      puerto:     data.puerto?.trim(),
      pais_sigla: data.pais_sigla,
      unlocode:   data.unlocode,
      latitud:    data.latitud,
      longitud:   data.longitud,
      active:     true,
    });

    return {
      success: true,
      data: {
        _id:        port._id.toString(),
        code:       port.code,
        name:       port.name,
        country:    port.country,
        city:       port.city,
        puerto:     port.puerto,
        pais_sigla: port.pais_sigla,
        unlocode:   port.unlocode,
        latitud:    port.latitud,
        longitud:   port.longitud,
        active:     port.active,
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
    if (data.name       !== undefined) update.name       = data.name.trim();
    if (data.country    !== undefined) update.country    = data.country;
    if (data.city       !== undefined) update.city       = data.city.trim();
    if (data.active     !== undefined) update.active     = data.active;
    if (data.puerto     !== undefined) update.puerto     = data.puerto.trim();
    if (data.pais_sigla !== undefined) update.pais_sigla = data.pais_sigla;
    if (data.unlocode   !== undefined) update.unlocode   = data.unlocode;
    if (data.latitud    !== undefined) update.latitud    = data.latitud;
    if (data.longitud   !== undefined) update.longitud   = data.longitud;

    const port = await PortModel.findByIdAndUpdate(portId, update, { new: true }).lean() as any;
    if (!port) return { success: false, error: 'Port not found' };

    return {
      success: true,
      data: {
        _id:        port._id.toString(),
        code:       port.code,
        name:       port.name,
        country:    port.country,
        city:       port.city,
        puerto:     port.puerto,
        pais_sigla: port.pais_sigla,
        unlocode:   port.unlocode,
        latitud:    port.latitud,
        longitud:   port.longitud,
        active:     port.active ?? true,
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
