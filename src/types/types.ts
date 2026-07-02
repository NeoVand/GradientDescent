/**
 * Type definitions for Gradient Lab
 * These types help us maintain consistency across the application
 * and provide excellent IDE support with TypeScript.
 */

// Supported machine learning problems
export type ProblemType =
  | 'slope-1d'
  | 'double-well-1d'
  | 'bumpy-1d'
  | 'linear-regression'
  | 'logistic-regression'
  | 'polynomial-regression'
  | 'sine-wave'
  | 'gaussian-peak'
  | 'exponential-decay'
  | 'damped-oscillator'
  | 'logistic-growth'
  | 'power-law'
  | 'gaussian-mixture'
  | 'circle-classifier'
  | 'source-localization'
  | 'mean-shift'
  | 'ar2'
  | 'ar2-rollout'
  | 'tiny-net'
  | 'stretched-bowl'
  | 'rosenbrock'
  | 'saddle-point'
  | 'himmelblau'
  | 'custom-regression'
  | 'custom-classification';

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
  // One-line hook shown by the coach when the problem is selected — what
  // makes this loss surface interesting.
  tagline?: string;
  // Pure analytic surfaces: the loss is f(α, β) directly with no dataset.
  // The Data panel and dataset controls hide; loss/gradient ignore `data`.
  noData?: boolean;
  // One-parameter problems: the loss depends on α only (∂ℒ/∂β ≡ 0). The
  // landscape renders as a loss-vs-α curve — the first rung of the ladder
  // before 2D surfaces — and β is frozen at 0.
  oneParam?: boolean;
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

// Learning-rate schedules: γ_eff(t) = γ · factor(t, T) over a run.
export type ScheduleId = 'constant' | 'step' | 'cosine' | 'warmup-cosine';

// Training configuration
export interface TrainingConfig {
  learningRate: number;
  totalSteps: number;
  currentStep: number;
  isTraining: boolean;
  // Gradient is computed on a random sample of this many training points
  // per step ('all' = full batch). Small batches make the descent path
  // visibly stochastic — the "S" in SGD.
  batchSize: number | 'all';
  // Animation speed of the training loop.
  stepsPerSecond: number;
  // How γ evolves over the run (constant, step decay, cosine, warmup).
  schedule: ScheduleId;
  // Compresses the schedule's time axis: the decay completes in T / speed
  // steps instead of the full run T. 1 = anneal over the whole run; higher =
  // decay faster, so a schedule's effect is visible within a short run.
  scheduleSpeed: number;
  // When true the run never ends on its own — it loops until paused (the
  // Steps slider pulled past its max). γ stays constant (no schedule decay)
  // so dragging the marker always springs it back toward a minimum.
  continuous: boolean;
}

// A single point in our training history
export interface TrainingHistoryPoint {
  step: number;
  trainLoss: number;
  testLoss: number;
  parameters: ModelParameters;
}

// Removed old loss landscape types - simplified to gradient field only

