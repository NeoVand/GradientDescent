/**
 * Type definitions for our Gradient Descent Learning App
 * These types help us maintain consistency across the application
 * and provide excellent IDE support with TypeScript.
 */

// Supported machine learning problems
export type ProblemType = 'linear-regression' | 'logistic-regression' | 'polynomial-regression' | 'sine-wave' | 'gaussian-peak' | 'exponential-decay';

// A single data point in our dataset
export interface DataPoint {
  x: number;           // Input feature
  y: number;           // Target value
  isTraining: boolean; // Whether this point is in the training set
  label?: number;      // For classification problems (0 or 1)
}

// Model parameters - we use A and B for slope and intercept
// This keeps things simple and visual for learning
export interface ModelParameters {
  a: number; // Slope (or first coefficient)
  b: number; // Intercept (or second coefficient)
}

// Configuration for each problem type
export interface ProblemConfig {
  type: ProblemType;
  name: string;
  description: string;
  trueParameters: ModelParameters; // The true underlying model parameters
  generateData: (numPoints: number, trainRatio: number, noiseLevel?: number) => DataPoint[];
  predict: (x: number, params: ModelParameters) => number;
  computeLoss: (data: DataPoint[], params: ModelParameters) => number;
  computeGradient: (data: DataPoint[], params: ModelParameters) => ModelParameters;
  // Optional per-problem initial parameter sampler. Used when the default
  // corner-based init is outside the basin of attraction for a problem
  // (e.g. Gaussian peak suffers from vanishing gradients far from the optimum).
  getInitialParameters?: () => ModelParameters;
  // Optional per-problem default learning rate. Some problems (e.g. Gaussian
  // peak) need a much larger step than the global default to converge in a
  // reasonable number of steps.
  defaultLearningRate?: number;
  // Optional per-problem default momentum. Problems with anisotropic loss
  // surfaces (e.g. exponential decay) converge much faster with momentum.
  defaultMomentum?: number;
  // Optional per-problem visible parameter range for the loss landscape.
  // Used for problems whose useful basin is much smaller than the default
  // [-7, 7]; e.g. Gaussian peak's basin sits in roughly |α|, |β| < 3 and
  // outside it gradients vanish so a wider view is just dead space.
  parameterRange?: { min: number; max: number };
}

// Training configuration
export interface TrainingConfig {
  learningRate: number;
  totalSteps: number;
  currentStep: number;
  isTraining: boolean;
  momentum: number;  // Heavy-ball momentum coefficient (μ). 0 = plain GD.
}

// A single point in our training history
export interface TrainingHistoryPoint {
  step: number;
  trainLoss: number;
  testLoss: number;
  parameters: ModelParameters;
}

// Removed old loss landscape types - simplified to gradient field only

