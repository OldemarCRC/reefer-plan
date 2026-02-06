// ============================================================================
// SERVICE SERVER ACTIONS
// Manages shipping line services (routes and schedules)
// 
// Examples: SEABAN (South America - Europe Banana Service)
//           SEAMED (South America - Mediterranean Service)
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { ServiceModel } from '@/lib/db/schemas';
import type { Service } from '@/types/models';

// ----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

const ServiceIdSchema = z.string().min(1, 'Service ID is required');

const ServiceCodeSchema = z.string()
  .min(3, 'Service code must be at least 3 characters')
  .max(10, 'Service code must be at most 10 characters')
  .regex(/^[A-Z0-9]+$/, 'Service code must be uppercase alphanumeric');

const RoutePortSchema = z.object({
  portCode: z.string().min(4).max(6).regex(/^[A-Z]{4,6}$/, 'Invalid port code format'),
  portName: z.string().min(1).max(200),
  country: z.string().min(1).max(100),
  sequence: z.number().int().positive(),
  estimatedDays: z.number().int().min(0).optional(),
});

const CreateServiceSchema = z.object({
  serviceCode: ServiceCodeSchema,
  serviceName: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']),
  route: z.array(RoutePortSchema).min(2, 'Route must have at least 2 ports'),
  vessels: z.array(z.string()).optional().default([]),
  active: z.boolean().optional().default(true),
});

const UpdateServiceSchema = CreateServiceSchema.partial();

// ----------------------------------------------------------------------------
// CREATE SERVICE
// Creates a new shipping line service with route
// ----------------------------------------------------------------------------

export async function createService(data: unknown) {
  try {
    // Validate input
    const validated = CreateServiceSchema.parse(data);
    
    await connectDB();
    
    // Check if service code already exists
    const existing = await ServiceModel.findOne({ 
      serviceCode: validated.serviceCode 
    });
    
    if (existing) {
      return {
        success: false,
        error: `Service code ${validated.serviceCode} already exists`,
      };
    }
    
    // Validate port sequence (must be consecutive)
    const sequences = validated.route.map(p => p.sequence).sort((a, b) => a - b);
    for (let i = 0; i < sequences.length; i++) {
      if (sequences[i] !== i + 1) {
        return {
          success: false,
          error: 'Port sequence must be consecutive starting from 1',
        };
      }
    }
    
    // Create service
    const service = await ServiceModel.create(validated);
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(service)),
      message: `Service ${validated.serviceCode} created successfully`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors[0].message}`,
      };
    }
    console.error('Error creating service:', error);
    return {
      success: false,
      error: 'Failed to create service',
    };
  }
}

// ----------------------------------------------------------------------------
// UPDATE SERVICE
// Updates an existing service
// ----------------------------------------------------------------------------

export async function updateService(
  serviceId: unknown,
  updates: unknown
) {
  try {
    const id = ServiceIdSchema.parse(serviceId);
    const validated = UpdateServiceSchema.parse(updates);
    
    await connectDB();
    
    // If updating service code, check for duplicates
    if (validated.serviceCode) {
      const existing = await ServiceModel.findOne({
        serviceCode: validated.serviceCode,
        _id: { $ne: id },
      });
      
      if (existing) {
        return {
          success: false,
          error: `Service code ${validated.serviceCode} already exists`,
        };
      }
    }
    
    // If updating route, validate sequence
    if (validated.route) {
      const sequences = validated.route.map(p => p.sequence).sort((a, b) => a - b);
      for (let i = 0; i < sequences.length; i++) {
        if (sequences[i] !== i + 1) {
          return {
            success: false,
            error: 'Port sequence must be consecutive starting from 1',
          };
        }
      }
    }
    
    const service = await ServiceModel.findByIdAndUpdate(
      id,
      { $set: validated },
      { new: true, runValidators: true }
    );
    
    if (!service) {
      return { success: false, error: 'Service not found' };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(service)),
      message: 'Service updated successfully',
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors[0].message}`,
      };
    }
    console.error('Error updating service:', error);
    return {
      success: false,
      error: 'Failed to update service',
    };
  }
}

// ----------------------------------------------------------------------------
// DELETE SERVICE
// Soft delete - sets active to false
// ----------------------------------------------------------------------------

export async function deleteService(serviceId: unknown) {
  try {
    const id = ServiceIdSchema.parse(serviceId);
    
    await connectDB();
    
    // Check if service has associated voyages
    // TODO: Add check when voyage model is implemented
    
    const service = await ServiceModel.findByIdAndUpdate(
      id,
      { active: false },
      { new: true }
    );
    
    if (!service) {
      return { success: false, error: 'Service not found' };
    }
    
    return {
      success: true,
      message: `Service ${service.serviceCode} deactivated successfully`,
    };
  } catch (error) {
    console.error('Error deleting service:', error);
    return {
      success: false,
      error: 'Failed to delete service',
    };
  }
}

// ----------------------------------------------------------------------------
// GET ALL SERVICES
// Returns all services (active and inactive)
// ----------------------------------------------------------------------------

export async function getServices() {
  try {
    await connectDB();
    
    const services = await ServiceModel.find()
      .sort({ serviceCode: 1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(services)),
    };
  } catch (error) {
    console.error('Error fetching services:', error);
    return {
      success: false,
      error: 'Failed to fetch services',
    };
  }
}

// ----------------------------------------------------------------------------
// GET ACTIVE SERVICES
// Returns only active services
// ----------------------------------------------------------------------------

export async function getActiveServices() {
  try {
    await connectDB();
    
    const services = await ServiceModel.find({ active: true })
      .sort({ serviceCode: 1 })
      .lean();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(services)),
    };
  } catch (error) {
    console.error('Error fetching active services:', error);
    return {
      success: false,
      error: 'Failed to fetch active services',
    };
  }
}

// ----------------------------------------------------------------------------
// GET SERVICE BY ID
// ----------------------------------------------------------------------------

export async function getServiceById(serviceId: unknown) {
  try {
    const id = ServiceIdSchema.parse(serviceId);
    
    await connectDB();
    
    const service = await ServiceModel.findById(id).lean();
    
    if (!service) {
      return { success: false, error: 'Service not found' };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(service)),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors[0].message}`,
      };
    }
    console.error('Error fetching service:', error);
    return {
      success: false,
      error: 'Failed to fetch service',
    };
  }
}

// ----------------------------------------------------------------------------
// GET SERVICE BY CODE
// ----------------------------------------------------------------------------

export async function getServiceByCode(code: unknown) {
  try {
    const serviceCode = ServiceCodeSchema.parse(code);
    
    await connectDB();
    
    const service = await ServiceModel.findOne({ serviceCode }).lean();
    
    if (!service) {
      return { success: false, error: 'Service not found' };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(service)),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors[0].message}`,
      };
    }
    console.error('Error fetching service by code:', error);
    return {
      success: false,
      error: 'Failed to fetch service',
    };
  }
}

// ----------------------------------------------------------------------------
// GET SERVICE ROUTE
// Returns the port sequence for a service
// ----------------------------------------------------------------------------

export async function getServiceRoute(serviceId: unknown) {
  try {
    const id = ServiceIdSchema.parse(serviceId);
    
    await connectDB();
    
    const service = await ServiceModel.findById(id)
      .select('serviceCode route')
      .lean();
    
    if (!service) {
      return { success: false, error: 'Service not found' };
    }
    
    // Sort ports by sequence
    const sortedRoute = service.route.sort((a, b) => a.sequence - b.sequence);
    
    return {
      success: true,
      data: {
        serviceCode: service.serviceCode,
        route: JSON.parse(JSON.stringify(sortedRoute)),
      },
    };
  } catch (error) {
    console.error('Error fetching service route:', error);
    return {
      success: false,
      error: 'Failed to fetch service route',
    };
  }
}

// ----------------------------------------------------------------------------
// ADD PORT TO SERVICE
// Adds a new port to the service route
// ----------------------------------------------------------------------------

export async function addPortToService(
  serviceId: unknown,
  portData: unknown
) {
  try {
    const id = ServiceIdSchema.parse(serviceId);
    const port = RoutePortSchema.parse(portData);
    
    await connectDB();
    
    const service = await ServiceModel.findById(id);
    
    if (!service) {
      return { success: false, error: 'Service not found' };
    }
    
    // Check if sequence already exists
    if (service.route.some(p => p.sequence === port.sequence)) {
      return {
        success: false,
        error: `Sequence ${port.sequence} already exists in route`,
      };
    }
    
    // Check if port code already exists
    if (service.route.some(p => p.portCode === port.portCode)) {
      return {
        success: false,
        error: `Port ${port.portCode} already exists in route`,
      };
    }
    
    service.route.push(port);
    await service.save();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(service)),
      message: `Port ${port.portName} added to service ${service.serviceCode}`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors[0].message}`,
      };
    }
    console.error('Error adding port to service:', error);
    return {
      success: false,
      error: 'Failed to add port to service',
    };
  }
}

// ----------------------------------------------------------------------------
// REMOVE PORT FROM SERVICE
// Removes a port from the service route and resequences remaining ports
// ----------------------------------------------------------------------------

export async function removePortFromService(
  serviceId: unknown,
  portCode: unknown
) {
  try {
    const id = ServiceIdSchema.parse(serviceId);
    const code = z.string().parse(portCode);
    
    await connectDB();
    
    const service = await ServiceModel.findById(id);
    
    if (!service) {
      return { success: false, error: 'Service not found' };
    }
    
    // Check minimum ports requirement
    if (service.route.length <= 2) {
      return {
        success: false,
        error: 'Cannot remove port. Service must have at least 2 ports.',
      };
    }
    
    // Remove port
    const portIndex = service.route.findIndex(p => p.portCode === code);
    
    if (portIndex === -1) {
      return { success: false, error: 'Port not found in service route' };
    }
    
    service.route.splice(portIndex, 1);
    
    // Resequence remaining ports
    service.route.forEach((port, index) => {
      port.sequence = index + 1;
    });
    
    await service.save();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(service)),
      message: `Port ${code} removed from service`,
    };
  } catch (error) {
    console.error('Error removing port from service:', error);
    return {
      success: false,
      error: 'Failed to remove port from service',
    };
  }
}

// ----------------------------------------------------------------------------
// ASSIGN VESSEL TO SERVICE
// Adds a vessel to the service's vessel pool
// ----------------------------------------------------------------------------

export async function assignVesselToService(
  serviceId: unknown,
  vesselId: unknown
) {
  try {
    const id = ServiceIdSchema.parse(serviceId);
    const vId = z.string().parse(vesselId);
    
    await connectDB();
    
    const service = await ServiceModel.findById(id);
    
    if (!service) {
      return { success: false, error: 'Service not found' };
    }
    
    // Check if vessel already assigned
    if (service.vessels.includes(vId)) {
      return {
        success: false,
        error: 'Vessel already assigned to this service',
      };
    }
    
    service.vessels.push(vId);
    await service.save();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(service)),
      message: 'Vessel assigned to service successfully',
    };
  } catch (error) {
    console.error('Error assigning vessel to service:', error);
    return {
      success: false,
      error: 'Failed to assign vessel to service',
    };
  }
}

// ----------------------------------------------------------------------------
// REMOVE VESSEL FROM SERVICE
// ----------------------------------------------------------------------------

export async function removeVesselFromService(
  serviceId: unknown,
  vesselId: unknown
) {
  try {
    const id = ServiceIdSchema.parse(serviceId);
    const vId = z.string().parse(vesselId);
    
    await connectDB();
    
    const service = await ServiceModel.findById(id);
    
    if (!service) {
      return { success: false, error: 'Service not found' };
    }
    
    service.vessels = service.vessels.filter(v => v !== vId);
    await service.save();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(service)),
      message: 'Vessel removed from service',
    };
  } catch (error) {
    console.error('Error removing vessel from service:', error);
    return {
      success: false,
      error: 'Failed to remove vessel from service',
    };
  }
}
