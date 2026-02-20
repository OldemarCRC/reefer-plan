// ============================================================================
// STABILITY SERVER ACTIONS
// Preliminary stability calculations for stowage planning
//
// IMPORTANT: These are ESTIMATED calculations for planning purposes
// Captain must verify with onboard systems (LoadMaster, CargoSmart, etc.)
//
// Future: Will integrate with Python FastAPI microservice for accurate calculations
// ============================================================================

'use server'

import { z } from 'zod';
import connectDB from '@/lib/db/connect';
import { StowagePlanModel, VesselModel } from '@/lib/db/schemas';
import type { PreliminaryStabilityEstimate } from '@/types/models';

// ----------------------------------------------------------------------------
// VALIDATION SCHEMAS
// ----------------------------------------------------------------------------

const StowagePlanIdSchema = z.string().min(1, 'Plan ID is required');

// ----------------------------------------------------------------------------
// CALCULATE PRELIMINARY STABILITY
// Estimates GM, Trim, List, and Drafts for planning purposes
// ----------------------------------------------------------------------------

export async function calculatePreliminaryStability(planId: unknown) {
  try {
    const id = StowagePlanIdSchema.parse(planId);
    
    await connectDB();
    
    const plan = await StowagePlanModel.findById(id);
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }
    
    const vessel = await VesselModel.findById(plan.vesselId);
    if (!vessel) {
      return { success: false, error: 'Vessel not found' };
    }
    
    // Calculate total weight
    const totalCargoWeight = plan.cargoPositions.reduce(
      (sum: number, pos: any) => sum + (pos.weight ?? 0),
      0
    );
    
    // Simple preliminary calculations (will be replaced with Python microservice)
    const displacement = vessel.stability.lightship.weight + (totalCargoWeight / 1000); // Convert kg to tons
    
    // Estimate centers of gravity (simplified)
    const estimatedLCG = calculateWeightedLCG(plan, vessel);
    const estimatedVCG = calculateWeightedVCG(plan, vessel);
    const estimatedTCG = calculateWeightedTCG(plan, vessel);
    
    // Estimate GM (very simplified - proper calculation needs hydrostatic tables)
    const estimatedKG = estimatedVCG;
    const estimatedKM = 10.0; // Placeholder - should come from vessel's hydrostatic tables
    const estimatedGM = estimatedKM - estimatedKG;
    
    // Estimate trim (simplified)
    const lpp = vessel.dimensions.loa * 0.95; // Length between perpendiculars (approx)
    const estimatedTrim = (estimatedLCG * displacement) / (lpp * 100); // Very simplified
    
    // Estimate list (simplified)
    const estimatedList = Math.atan(estimatedTCG / estimatedGM) * (180 / Math.PI);
    
    // Estimate drafts (simplified)
    const meanDraft = displacement / (vessel.dimensions.loa * vessel.dimensions.beam * 0.7); // Very simplified
    const trimEffect = estimatedTrim / 2;
    
    const estimatedDrafts = {
      forward: meanDraft - trimEffect,
      aft: meanDraft + trimEffect,
      mean: meanDraft,
    };
    
    // Validate against reference limits
    const warnings: string[] = [];
    const notes: string[] = [];
    
    if (estimatedGM < vessel.stability.referenceLimits.minGM) {
      warnings.push(
        `GM below minimum reference (${estimatedGM.toFixed(2)}m < ${vessel.stability.referenceLimits.minGM}m)`
      );
    }
    
    if (Math.abs(estimatedTrim) > vessel.stability.referenceLimits.maxTrim) {
      warnings.push(
        `Trim exceeds reference limit (${Math.abs(estimatedTrim).toFixed(2)}m > ${vessel.stability.referenceLimits.maxTrim}m)`
      );
    }
    
    if (Math.abs(estimatedList) > vessel.stability.referenceLimits.maxList) {
      warnings.push(
        `List exceeds reference limit (${Math.abs(estimatedList).toFixed(2)}° > ${vessel.stability.referenceLimits.maxList}°)`
      );
    }
    
    if (estimatedDrafts.mean > vessel.stability.referenceLimits.maxDraft) {
      warnings.push(
        `Draft exceeds maximum (${estimatedDrafts.mean.toFixed(2)}m > ${vessel.stability.referenceLimits.maxDraft}m)`
      );
    }
    
    notes.push('Captain must verify with onboard stability system');
    notes.push('Use official hydrostatic tables for accurate calculations');
    
    const stabilityEstimate: PreliminaryStabilityEstimate = {
      calculatedAt: new Date(),
      displacement,
      estimatedKG,
      estimatedLCG,
      estimatedTCG,
      estimatedGM,
      estimatedTrim,
      estimatedList,
      estimatedDrafts,
      preliminaryCheck: {
        withinReferenceLimits: warnings.length === 0,
        warnings,
        notes,
      },
      disclaimer: 'Estos cálculos son estimaciones para planificación. El capitán debe aprobar y verificar con sistemas oficiales a bordo.',
    };
    
    // Update plan with stability estimate
    plan.preliminaryStability = stabilityEstimate;
    await plan.save();
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(stabilityEstimate)),
      withinLimits: warnings.length === 0,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.issues[0].message}`,
      };
    }
    console.error('Error calculating stability:', error);
    return {
      success: false,
      error: 'Failed to calculate stability',
    };
  }
}

// ----------------------------------------------------------------------------
// GET STABILITY REPORT
// Returns the stability estimate for a plan
// ----------------------------------------------------------------------------

export async function getStabilityReport(planId: unknown) {
  try {
    const id = StowagePlanIdSchema.parse(planId);
    
    await connectDB();
    
    const plan = await StowagePlanModel.findById(id)
      .select('preliminaryStability')
      .lean();
    
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }
    
    if (!plan.preliminaryStability) {
      return {
        success: false,
        error: 'Stability not calculated yet. Run calculatePreliminaryStability first.',
      };
    }
    
    return {
      success: true,
      data: JSON.parse(JSON.stringify(plan.preliminaryStability)),
    };
  } catch (error) {
    console.error('Error fetching stability report:', error);
    return {
      success: false,
      error: 'Failed to fetch stability report',
    };
  }
}

// ----------------------------------------------------------------------------
// VALIDATE STABILITY
// Quick check if plan is within reference limits
// ----------------------------------------------------------------------------

export async function validateStability(planId: unknown) {
  try {
    const id = StowagePlanIdSchema.parse(planId);
    
    await connectDB();
    
    const plan = await StowagePlanModel.findById(id);
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }
    
    if (!plan.preliminaryStability) {
      // Calculate if not done yet
      const result = await calculatePreliminaryStability(planId);
      if (!result.success) {
        return result;
      }
    }
    
    const stability = plan.preliminaryStability!;
    
    return {
      success: true,
      valid: stability.preliminaryCheck.withinReferenceLimits,
      warnings: stability.preliminaryCheck.warnings,
      summary: {
        gm: `${stability.estimatedGM.toFixed(2)}m`,
        trim: `${stability.estimatedTrim > 0 ? 'By Stern' : 'By Bow'} ${Math.abs(stability.estimatedTrim).toFixed(2)}m`,
        list: `${stability.estimatedList > 0 ? 'Starboard' : 'Port'} ${Math.abs(stability.estimatedList).toFixed(2)}°`,
        draft: `${stability.estimatedDrafts.mean.toFixed(2)}m`,
      },
    };
  } catch (error) {
    console.error('Error validating stability:', error);
    return {
      success: false,
      error: 'Failed to validate stability',
    };
  }
}

// ----------------------------------------------------------------------------
// CALL PYTHON MICROSERVICE (Future Implementation)
// This will replace the simplified calculations above
// ----------------------------------------------------------------------------

export async function calculateStabilityWithPython(planId: unknown) {
  try {
    const id = StowagePlanIdSchema.parse(planId);
    
    // TODO: Implement when Python FastAPI microservice is ready
    // const response = await fetch('http://localhost:8000/calculate-stability', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ planId: id }),
    // });
    
    return {
      success: false,
      error: 'Python microservice not implemented yet. Use calculatePreliminaryStability instead.',
    };
  } catch (error) {
    console.error('Error calling Python microservice:', error);
    return {
      success: false,
      error: 'Failed to call Python microservice',
    };
  }
}

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS
// Simplified calculations - will be replaced with proper hydrostatic calculations
// ----------------------------------------------------------------------------

function calculateWeightedLCG(plan: any, vessel: any): number {
  // Simplified: weighted average of cargo positions
  let totalMoment = 0;
  let totalWeight = 0;
  
  for (const position of plan.cargoPositions) {
    // Find compartment in vessel
    const compartment = findCompartment(vessel, position.compartment.id);
    if (compartment) {
      totalMoment += position.weight * compartment.position.lcg;
      totalWeight += position.weight;
    }
  }
  
  // Add lightship
  totalMoment += vessel.stability.lightship.weight * 1000 * vessel.stability.lightship.lcg;
  totalWeight += vessel.stability.lightship.weight * 1000;
  
  return totalWeight > 0 ? totalMoment / totalWeight : 0;
}

function calculateWeightedVCG(plan: any, vessel: any): number {
  // Simplified: weighted average of cargo positions
  let totalMoment = 0;
  let totalWeight = 0;
  
  for (const position of plan.cargoPositions) {
    const compartment = findCompartment(vessel, position.compartment.id);
    if (compartment) {
      totalMoment += position.weight * compartment.position.vcg;
      totalWeight += position.weight;
    }
  }
  
  // Add lightship
  totalMoment += vessel.stability.lightship.weight * 1000 * vessel.stability.lightship.vcg;
  totalWeight += vessel.stability.lightship.weight * 1000;
  
  return totalWeight > 0 ? totalMoment / totalWeight : 0;
}

function calculateWeightedTCG(plan: any, vessel: any): number {
  // Simplified: weighted average of cargo positions
  let totalMoment = 0;
  let totalWeight = 0;
  
  for (const position of plan.cargoPositions) {
    const compartment = findCompartment(vessel, position.compartment.id);
    if (compartment) {
      totalMoment += position.weight * compartment.position.tcg;
      totalWeight += position.weight;
    }
  }
  
  // Add lightship
  totalMoment += vessel.stability.lightship.weight * 1000 * vessel.stability.lightship.tcg;
  totalWeight += vessel.stability.lightship.weight * 1000;
  
  return totalWeight > 0 ? totalMoment / totalWeight : 0;
}

function findCompartment(vessel: any, compartmentId: string): any {
  for (const hold of vessel.holds) {
    const comp = hold.compartments.find((c: any) => (c as any).id === compartmentId);
    if (comp) return comp;
  }
  return null;
}
