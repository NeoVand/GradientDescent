/**
 * Gradient Descent Algorithm Implementation
 * 
 * This file contains the core gradient descent logic and utilities
 * for computing loss landscapes and optimization paths.
 */

import type { DataPoint, ModelParameters, ProblemConfig } from '../types/types';

/**
 * Perform one step of gradient descent
 * Returns the updated parameters
 */
export function gradientDescentStep(
  data: DataPoint[],
  currentParams: ModelParameters,
  learningRate: number,
  problemConfig: ProblemConfig
): ModelParameters {
  // Compute the gradient at current parameters
  const gradient = problemConfig.computeGradient(data, currentParams);
  
  // Update parameters in the negative gradient direction
  // This is the core of gradient descent: params = params - learningRate * gradient
  return {
    a: currentParams.a - learningRate * gradient.a,
    b: currentParams.b - learningRate * gradient.b
  };
}

/**
 * Compute the loss landscape over a grid of parameter values
 * This is used for visualization in both 2D and 3D
 */
export interface LossLandscapePoint {
  a: number;
  b: number;
  loss: number;
  gradientA?: number;
  gradientB?: number;
}

export function computeLossLandscape(
  data: DataPoint[],
  problemConfig: ProblemConfig,
  gridSize: number = 50,
  paramRange: { min: number; max: number } = { min: -3, max: 3 }
): LossLandscapePoint[][] {
  const landscape: LossLandscapePoint[][] = [];
  const step = (paramRange.max - paramRange.min) / (gridSize - 1);
  
  for (let i = 0; i < gridSize; i++) {
    const row: LossLandscapePoint[] = [];
    const a = paramRange.min + i * step;
    
    for (let j = 0; j < gridSize; j++) {
      const b = paramRange.min + j * step;
      const params = { a, b };
      
      // Compute loss at this point
      const loss = problemConfig.computeLoss(data, params);
      
      // Optionally compute gradient for vector field visualization
      const gradient = problemConfig.computeGradient(data, params);
      
      row.push({
        a,
        b,
        loss,
        gradientA: gradient.a,
        gradientB: gradient.b
      });
    }
    
    landscape.push(row);
  }
  
  return landscape;
}

/**
 * Generate contour levels for loss landscape visualization
 * Returns an array of loss values that represent contour lines
 */
export function generateContourLevels(
  landscape: LossLandscapePoint[][],
  numLevels: number = 10
): number[] {
  // Find min and max loss values
  let minLoss = Infinity;
  let maxLoss = -Infinity;
  
  for (const row of landscape) {
    for (const point of row) {
      minLoss = Math.min(minLoss, point.loss);
      maxLoss = Math.max(maxLoss, point.loss);
    }
  }
  
  // Generate evenly spaced contour levels
  const levels: number[] = [];
  const step = (maxLoss - minLoss) / (numLevels - 1);
  
  for (let i = 0; i < numLevels; i++) {
    levels.push(minLoss + i * step);
  }
  
  return levels;
}

/**
 * Normalize gradient vectors for visualization
 * This ensures arrows in the gradient field have consistent size
 */
export function normalizeGradient(
  gradientA: number,
  gradientB: number,
  maxMagnitude: number = 0.1
): { a: number; b: number } {
  const magnitude = Math.sqrt(gradientA * gradientA + gradientB * gradientB);
  
  if (magnitude === 0) {
    return { a: 0, b: 0 };
  }
  
  // Scale to maximum magnitude
  const scale = Math.min(maxMagnitude / magnitude, 1);
  
  return {
    a: gradientA * scale,
    b: gradientB * scale
  };
}

/**
 * Check if gradient descent has converged
 * Returns true if the change in parameters is below threshold
 */
export function hasConverged(
  oldParams: ModelParameters,
  newParams: ModelParameters,
  threshold: number = 1e-6
): boolean {
  const deltaA = Math.abs(newParams.a - oldParams.a);
  const deltaB = Math.abs(newParams.b - oldParams.b);
  
  return deltaA < threshold && deltaB < threshold;
}

/**
 * Compute the learning rate that would cause divergence
 * This helps users understand the stability of gradient descent
 */
export function estimateDivergenceLearningRate(
  data: DataPoint[],
  currentParams: ModelParameters,
  problemConfig: ProblemConfig
): number {
  // For simple problems, we can estimate using the Lipschitz constant
  // This is a simplified heuristic
  const gradient = problemConfig.computeGradient(data, currentParams);
  const gradientMagnitude = Math.sqrt(gradient.a ** 2 + gradient.b ** 2);
  
  // Rough estimate: learning rate should be less than 2/L where L is Lipschitz constant
  // We approximate L based on the gradient magnitude and data range
  const dataRange = Math.max(...data.map(p => Math.abs(p.x))) || 1;
  const approximateLipschitz = gradientMagnitude * dataRange * data.length;
  
  return approximateLipschitz > 0 ? 2 / approximateLipschitz : 1;
}

