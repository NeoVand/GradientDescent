/**
 * Type definitions for our Gradient Descent Learning App
 * These types help us maintain consistency across the application
 * and provide excellent IDE support with TypeScript.
 */

// Supported machine learning problems
export type ProblemType = 'linear-regression' | 'logistic-regression' | 'polynomial-regression';

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
}

// Training configuration
export interface TrainingConfig {
  learningRate: number;
  totalSteps: number;
  currentStep: number;
  isTraining: boolean;
}

// A single point in our training history
export interface TrainingHistoryPoint {
  step: number;
  trainLoss: number;
  testLoss: number;
  parameters: ModelParameters;
}

// Visualization modes for the loss landscape
export type LossLandscapeMode = '2d' | '3d';

// Visual elements that can be toggled on the loss landscape
export interface LossLandscapeVisuals {
  heatmap: boolean;
  gradientField: boolean;
  contours: boolean;
  trainingPath: boolean;
}

