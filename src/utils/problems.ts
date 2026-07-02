/**
 * Machine Learning Problem Configurations
 * 
 * This file contains the implementations of different ML problems
 * that users can explore with gradient descent. Each problem includes:
 * - Data generation
 * - Prediction function
 * - Loss computation
 * - Gradient calculation
 */

import type { ProblemConfig, DataPoint, ModelParameters } from '../types/types';
import { rand, shuffle } from './rng';
import {
  regressionPredict, regressionLoss, regressionGrad,
  classificationLoss, classificationGrad
} from './customModel';

/**
 * ---------- One-parameter problems (oneParam) ----------
 * The first rung of the ladder: loss depends on α only, so the whole
 * landscape is a single curve and "gradient" is just the slope. β is
 * frozen at 0 (∂ℒ/∂β ≡ 0 everywhere).
 */

/**
 * Fit a Slope — y = αx through the origin. One parameter, one parabola:
 * the cleanest possible picture of step = −γ · slope.
 */
const slopeFit: ProblemConfig = {
  type: 'slope-1d',
  name: 'Fit a Slope',
  description: 'One parameter: the slope of a line through the origin',
  tagline: 'One parameter, one parabola — each step is literally −γ × slope.',
  oneParam: true,
  trueParameters: { a: 1.8, b: 0 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueA = slopeFit.trueParameters.a;
    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * 4 - 2 + (rand() - 0.5) * 0.2;
      const noise = (rand() - 0.5) * noiseLevel * 2;
      data.push({ x, y: trueA * x + noise, isTraining: i < numTrain });
    }

    return shuffle(data);
  },

  predict: (x: number, params: ModelParameters): number => params.a * x,

  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    if (data.length === 0) return 0;
    let total = 0;
    for (const p of data) {
      const err = params.a * p.x - p.y;
      total += err * err;
    }
    return total / data.length;
  },

  computeGradient: (data: DataPoint[], params: ModelParameters): ModelParameters => {
    if (data.length === 0) return { a: 0, b: 0 };
    let gA = 0;
    for (const p of data) {
      gA += 2 * (params.a * p.x - p.y) * p.x;
    }
    return { a: gA / data.length, b: 0 };
  },

  // Start near either edge of the curve so a full descent is visible.
  getInitialParameters: () => ({
    a: Math.random() < 0.5 ? -3.4 + Math.random() * 0.9 : 5.5 + Math.random() * 0.9,
    b: 0
  }),

  defaultLearningRate: 0.05,
  parameterRange: { min: -4, max: 7 }
};

/**
 * Double Well — f(α) = (α²−4)²/8 + 0.6α + 1.3. Two valleys, tilted so one
 * is deeper: the simplest possible local-minimum trap.
 * Stationary points: global min α ≈ −2.14, barrier α ≈ 0.31, local min α ≈ 1.84.
 */
const doubleWell1D: ProblemConfig = {
  type: 'double-well-1d',
  name: 'Double Well',
  description: 'Two valleys, one deeper — the simplest local-minimum trap',
  tagline: 'Two valleys, one deeper. Gradient descent only ever rolls downhill.',
  oneParam: true,
  noData: true,
  trueParameters: { a: -2.14, b: 0 },
  generateData: (_n: number, _r: number, _noise?: number): DataPoint[] => [],
  predict: () => 0,

  computeLoss: (_data: DataPoint[], p: ModelParameters): number => {
    const u = p.a * p.a - 4;
    return (u * u) / 8 + 0.6 * p.a + 1.3;
  },

  computeGradient: (_data: DataPoint[], p: ModelParameters): ModelParameters => {
    return { a: (p.a * (p.a * p.a - 4)) / 2 + 0.6, b: 0 };
  },

  // Either rim: from the right the marker falls into the shallow trap,
  // from the left it finds the true bottom.
  getInitialParameters: () => ({
    a: (Math.random() < 0.5 ? -1 : 1) * (2.6 + Math.random() * 0.7),
    b: 0
  }),

  defaultLearningRate: 0.1,
  parameterRange: { min: -3.5, max: 3.5 }
};

/**
 * Bumpy Valley — f(α) = 0.15α² + sin(2α) + 1.4. A parabola with ripples:
 * four local minima in view (global at α ≈ −0.73, where 0.3α + 2cos(2α) = 0),
 * so most starts get stuck partway down. Momentum can roll through the bumps.
 */
const bumpyValley1D: ProblemConfig = {
  type: 'bumpy-1d',
  name: 'Bumpy Valley',
  description: 'A rippled bowl with several local minima',
  tagline: 'Four dips, one true bottom — most starting points find the wrong one.',
  oneParam: true,
  noData: true,
  trueParameters: { a: -0.73, b: 0 },
  generateData: (_n: number, _r: number, _noise?: number): DataPoint[] => [],
  predict: () => 0,

  computeLoss: (_data: DataPoint[], p: ModelParameters): number => {
    return 0.15 * p.a * p.a + Math.sin(2 * p.a) + 1.4;
  },

  computeGradient: (_data: DataPoint[], p: ModelParameters): ModelParameters => {
    return { a: 0.3 * p.a + 2 * Math.cos(2 * p.a), b: 0 };
  },

  getInitialParameters: () => ({ a: -5.5 + Math.random() * 11, b: 0 }),

  defaultLearningRate: 0.05,
  parameterRange: { min: -6, max: 6 }
};

/**
 * Linear Regression
 * The simplest problem: fitting a line y = ax + b to data points
 * Loss function: Mean Squared Error (MSE)
 */
const linearRegression: ProblemConfig = {
  type: 'linear-regression',
  name: 'Linear Regression',
  description: 'Fit a line to data points using least squares',
  tagline: 'One convex bowl — gradient descent\'s home turf.',
  trueParameters: { a: 1.5, b: 0.5 },
  
  // Generate synthetic data with some noise
  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    // True underlying function: y = 1.5x + 0.5 + noise
    const trueA = linearRegression.trueParameters.a;
    const trueB = linearRegression.trueParameters.b;
    
    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);
    
    for (let i = 0; i < numPoints; i++) {
      // Generate x values evenly spaced with some jitter
      const x = (i / (numPoints - 1)) * 4 - 2 + (rand() - 0.5) * 0.2;
      // Generate y with noise
      const noise = (rand() - 0.5) * noiseLevel * 2;  // Scale noise
      const y = trueA * x + trueB + noise;
      
      data.push({
        x,
        y,
        isTraining: i < numTrain
      });
    }
    
    // Shuffle the data to mix training and test points
    return shuffle(data);
  },
  
  // Linear model prediction
  predict: (x: number, params: ModelParameters): number => {
    return params.a * x + params.b;
  },
  
  // Mean Squared Error loss
  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    if (data.length === 0) return 0;
    
    let totalError = 0;
    for (const point of data) {
      const prediction = params.a * point.x + params.b;
      const error = prediction - point.y;
      totalError += error * error;
    }
    
    return totalError / data.length;
  },
  
  // Gradient of MSE with respect to parameters
  computeGradient: (data: DataPoint[], params: ModelParameters): ModelParameters => {
    if (data.length === 0) return { a: 0, b: 0 };
    
    let gradA = 0;
    let gradB = 0;
    
    for (const point of data) {
      const prediction = params.a * point.x + params.b;
      const error = prediction - point.y;
      
      // Partial derivatives of MSE
      gradA += 2 * error * point.x;
      gradB += 2 * error;
    }
    
    // Average the gradients
    return {
      a: gradA / data.length,
      b: gradB / data.length
    };
  },

  defaultLearningRate: 0.01
};

/**
 * Logistic Regression
 * Binary classification using the sigmoid function
 * Loss function: Binary Cross-Entropy
 */
const logisticRegression: ProblemConfig = {
  type: 'logistic-regression',
  name: 'Logistic Regression',
  description: 'Classify points into two categories',
  tagline: 'Separable classes mean no finite minimum — watch ‖θ‖ keep growing.',
  trueParameters: { a: 1.2, b: 0.2 },
  
  // Generate linearly separable data with clear clusters
  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);
    const numClass0 = Math.floor(numPoints / 2);
    const numClass1 = numPoints - numClass0;
    
    // True decision boundary: a*x + b*y = 0
    // We'll generate data on opposite sides of this line
    const trueA = logisticRegression.trueParameters.a;
    const trueB = logisticRegression.trueParameters.b;
    
    // Base spread controlled by noise level
    const baseSpread = 0.4;
    const spread = baseSpread + noiseLevel * 0.5;
    
    // Generate Class 0 points (left/below the boundary)
    for (let i = 0; i < numClass0; i++) {
      // Generate points in a cluster
      const centerX = -0.8;
      const centerY = -0.5;
      
      const x = centerX + (rand() - 0.5) * spread;
      const y = centerY + (rand() - 0.5) * spread;
      
      data.push({
        x,
        y,
        isTraining: i < Math.floor(numClass0 * trainRatio),
        label: 0
      });
    }
    
    // Generate Class 1 points (right/above the boundary)
    for (let i = 0; i < numClass1; i++) {
      const centerX = 0.8;
      const centerY = 0.5;
      
      const x = centerX + (rand() - 0.5) * spread;
      const y = centerY + (rand() - 0.5) * spread;
      
      data.push({
        x,
        y,
        isTraining: i < Math.floor(numClass1 * trainRatio),
        label: 1
      });
    }
    
    return shuffle(data);
  },
  
  // Logistic model prediction (probability of class 1)
  // For 2D classification: decision boundary is a*x + b*y = 0
  predict: (x: number, params: ModelParameters): number => {
    // This is used for plotting lines - we return y value for given x on decision boundary
    // a*x + b*y = 0 => y = -a*x / b
    if (params.b === 0) return 0;
    return -params.a * x / params.b;
  },
  
  // Binary Cross-Entropy loss
  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    if (data.length === 0) return 0;
    
    let totalLoss = 0;
    const epsilon = 1e-7; // Small value to prevent log(0)
    
    for (const point of data) {
      // For 2D classification: decision function is a*x + b*y
      // Points where a*x + b*y > 0 are predicted as class 1
      const z = params.a * point.x + params.b * point.y;
      const prediction = 1 / (1 + Math.exp(-z));
      const clampedPred = Math.max(epsilon, Math.min(1 - epsilon, prediction));
      
      if (point.label === 1) {
        totalLoss -= Math.log(clampedPred);
      } else {
        totalLoss -= Math.log(1 - clampedPred);
      }
    }
    
    return totalLoss / data.length;
  },
  
  // Gradient of Binary Cross-Entropy
  computeGradient: (data: DataPoint[], params: ModelParameters): ModelParameters => {
    if (data.length === 0) return { a: 0, b: 0 };
    
    let gradA = 0;
    let gradB = 0;
    
    for (const point of data) {
      const z = params.a * point.x + params.b * point.y;
      const prediction = 1 / (1 + Math.exp(-z));
      const error = prediction - (point.label || 0);
      
      // Gradient with respect to parameters
      gradA += error * point.x;
      gradB += error * point.y;
    }
    
    return {
      a: gradA / data.length,
      b: gradB / data.length
    };
  },

  // With separable clusters BCE has no finite minimum — ‖θ‖ grows forever
  // toward the max-margin direction (the marker eventually pins to the
  // frame edge, which is itself a teachable moment). Init at a moderate
  // radius + γ=0.1 so the default 200-step run reaches a clean boundary
  // and still ends inside the visible range; the historical corner init
  // with γ=0.01 crawled and never got there.
  getInitialParameters: () => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 3.5 + Math.random() * 1.5;
    return { a: radius * Math.cos(angle), b: radius * Math.sin(angle) };
  },

  defaultLearningRate: 0.1
};

/**
 * Polynomial Regression
 * Fitting a quadratic function to demonstrate non-linear regression
 * We'll parameterize it as y = a*x² + b*x for simplicity (2 parameters)
 */
const polynomialRegression: ProblemConfig = {
  type: 'polynomial-regression',
  name: 'Polynomial Regression',
  description: 'Fit a polynomial curve to data',
  tagline: 'Still one bowl, but curvature differs by direction.',
  trueParameters: { a: 0.5, b: -0.3 },
  
  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    // True function: y = 0.5x² - 0.3x + noise
    const trueA = polynomialRegression.trueParameters.a;
    const trueB = polynomialRegression.trueParameters.b;
    
    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);
    
    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * 4 - 2;
      const noise = (rand() - 0.5) * noiseLevel * 2;  // Scale noise
      const y = trueA * x * x + trueB * x + noise;
      
      data.push({
        x,
        y,
        isTraining: i < numTrain
      });
    }
    
    return shuffle(data);
  },
  
  predict: (x: number, params: ModelParameters): number => {
    return params.a * x * x + params.b * x;
  },
  
  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    if (data.length === 0) return 0;
    
    let totalError = 0;
    for (const point of data) {
      const prediction = params.a * point.x * point.x + params.b * point.x;
      const error = prediction - point.y;
      totalError += error * error;
    }
    
    return totalError / data.length;
  },
  
  computeGradient: (data: DataPoint[], params: ModelParameters): ModelParameters => {
    if (data.length === 0) return { a: 0, b: 0 };
    
    let gradA = 0;
    let gradB = 0;
    
    for (const point of data) {
      const prediction = params.a * point.x * point.x + params.b * point.x;
      const error = prediction - point.y;
      
      gradA += 2 * error * point.x * point.x;
      gradB += 2 * error * point.x;
    }
    
    return {
      a: gradA / data.length,
      b: gradB / data.length
    };
  },

  defaultLearningRate: 0.01
};

/**
 * Sine Wave Fit
 * Fitting y = a * sin(b * x): amplitude a, angular frequency b.
 * Frequency aliasing creates many local minima along the b axis — a great
 * demonstration of why gradient descent can get stuck.
 */
const sineWave: ProblemConfig = {
  type: 'sine-wave',
  name: 'Sine Wave',
  description: 'Fit a sine wave: amplitude and frequency',
  tagline: 'Frequency aliasing carves many local minima along β.',
  trueParameters: { a: 1.5, b: 3 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueA = sineWave.trueParameters.a;
    const trueB = sineWave.trueParameters.b;

    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * 4 - 2 + (rand() - 0.5) * 0.05;
      const noise = (rand() - 0.5) * noiseLevel;
      const y = trueA * Math.sin(trueB * x) + noise;

      data.push({ x, y, isTraining: i < numTrain });
    }

    return shuffle(data);
  },

  predict: (x: number, params: ModelParameters): number => {
    return params.a * Math.sin(params.b * x);
  },

  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    if (data.length === 0) return 0;

    let totalError = 0;
    for (const point of data) {
      const prediction = params.a * Math.sin(params.b * point.x);
      const error = prediction - point.y;
      totalError += error * error;
    }

    return totalError / data.length;
  },

  computeGradient: (data: DataPoint[], params: ModelParameters): ModelParameters => {
    if (data.length === 0) return { a: 0, b: 0 };

    let gradA = 0;
    let gradB = 0;

    for (const point of data) {
      const s = Math.sin(params.b * point.x);
      const c = Math.cos(params.b * point.x);
      const prediction = params.a * s;
      const error = prediction - point.y;

      gradA += 2 * error * s;
      gradB += 2 * error * params.a * point.x * c;
    }

    return {
      a: gradA / data.length,
      b: gradB / data.length
    };
  },

  defaultLearningRate: 0.01
};

/**
 * Gaussian Peak Fit
 * Fitting y = exp(-(x - a)^2 / (2 b^2)): center a, width b.
 * Because the model depends on b only through b^2, the loss surface is
 * symmetric in b — two equivalent global minima at (a*, ±b*).
 */
const gaussianPeak: ProblemConfig = {
  type: 'gaussian-peak',
  name: 'Gaussian Peak',
  description: 'Fit a Gaussian: center and width',
  tagline: 'Gradients vanish far from the peak — and two mirror basins at ±β.',
  trueParameters: { a: 0, b: 1 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueA = gaussianPeak.trueParameters.a;
    const trueB = gaussianPeak.trueParameters.b;

    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * 4 - 2 + (rand() - 0.5) * 0.05;
      const peak = Math.exp(-((x - trueA) ** 2) / (2 * trueB * trueB));
      const noise = (rand() - 0.5) * noiseLevel * 0.5;
      data.push({ x, y: peak + noise, isTraining: i < numTrain });
    }

    return shuffle(data);
  },

  predict: (x: number, params: ModelParameters): number => {
    const b2 = Math.max(params.b * params.b, 1e-6);
    return Math.exp(-((x - params.a) ** 2) / (2 * b2));
  },

  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    if (data.length === 0) return 0;
    const b2 = Math.max(params.b * params.b, 1e-6);

    let total = 0;
    for (const p of data) {
      const dx = p.x - params.a;
      const pred = Math.exp(-(dx * dx) / (2 * b2));
      const err = pred - p.y;
      total += err * err;
    }
    return total / data.length;
  },

  computeGradient: (data: DataPoint[], params: ModelParameters): ModelParameters => {
    if (data.length === 0) return { a: 0, b: 0 };
    const b2 = Math.max(params.b * params.b, 1e-6);
    // Preserve sign of b in b^3 so the gradient flips correctly across b = 0
    const bSafe = Math.abs(params.b) < 1e-3 ? (params.b >= 0 ? 1e-3 : -1e-3) : params.b;
    const b3 = bSafe * b2;

    let gA = 0, gB = 0;
    for (const p of data) {
      const dx = p.x - params.a;
      const pred = Math.exp(-(dx * dx) / (2 * b2));
      const err = pred - p.y;
      // d(pred)/d(a) = pred * (x - a) / b^2
      gA += 2 * err * pred * dx / b2;
      // d(pred)/d(b) = pred * (x - a)^2 / b^3
      gB += 2 * err * pred * (dx * dx) / b3;
    }
    return { a: gA / data.length, b: gB / data.length };
  },

  // Far from the optimum the Gaussian's gradient vanishes (model is ~constant),
  // so we initialize inside the basin of attraction. We always start with
  // β > 0 so the marker converges to the labeled true minimum (0, +1); the
  // symmetric copy at (0, -1) is still visible in the landscape and reachable
  // by dragging the marker manually.
  getInitialParameters: () => ({
    a: (Math.random() - 0.5) * 2,
    b: 1.5 + Math.random()
  }),

  // Gradients near the basin are small (model already nearly fits), so we
  // need a much bigger step than the global 0.01 default for visible
  // convergence within a couple hundred steps.
  defaultLearningRate: 0.5,

  // Outside |α|, |β| ≈ 3 the model becomes effectively constant and gradients
  // vanish — anything wider would just be flat dead space the user can drag
  // into and get permanently stuck.
  parameterRange: { min: -3, max: 3 }
};

/**
 * Exponential Decay Fit
 * Fitting y = α · exp(-β · x): amplitude α, rate β.
 * Loss is sharply anisotropic — one direction is gentle, the other steep —
 * which makes this a natural showcase for momentum (try μ ≈ 0.9).
 * Outside roughly |α|, |β| < 2 the model explodes and gradients are
 * astronomical, so the visible range is tightened.
 */
const exponentialDecay: ProblemConfig = {
  type: 'exponential-decay',
  name: 'Exponential Decay',
  description: 'Fit y = α·exp(−β·X): amplitude and rate',
  tagline: 'A steep curved valley — momentum\'s favorite demo.',
  trueParameters: { a: 1, b: 0.5 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueA = exponentialDecay.trueParameters.a;
    const trueB = exponentialDecay.trueParameters.b;

    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * 4 - 2 + (rand() - 0.5) * 0.05;
      const noise = (rand() - 0.5) * noiseLevel * 0.5;
      const y = trueA * Math.exp(-trueB * x) + noise;
      data.push({ x, y, isTraining: i < numTrain });
    }

    return shuffle(data);
  },

  predict: (x: number, params: ModelParameters): number => {
    return params.a * Math.exp(-params.b * x);
  },

  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    if (data.length === 0) return 0;
    let total = 0;
    for (const p of data) {
      const pred = params.a * Math.exp(-params.b * p.x);
      const err = pred - p.y;
      total += err * err;
    }
    return total / data.length;
  },

  computeGradient: (data: DataPoint[], params: ModelParameters): ModelParameters => {
    if (data.length === 0) return { a: 0, b: 0 };
    let gA = 0, gB = 0;
    for (const p of data) {
      const e = Math.exp(-params.b * p.x);
      const pred = params.a * e;
      const err = pred - p.y;
      // d(pred)/d(α) = exp(-β·x)
      gA += 2 * err * e;
      // d(pred)/d(β) = -x · α · exp(-β·x) = -x · pred
      gB += -2 * err * p.x * pred;
    }
    return { a: gA / data.length, b: gB / data.length };
  },

  // Init from one of the four corners of the visible square so the descent
  // path is long and visible. lr=0.002 + μ=0.9 reliably converges from any.
  getInitialParameters: () => {
    const corners = [
      () => ({ a: -1.2 - Math.random() * 0.3, b: -1.2 - Math.random() * 0.3 }),
      () => ({ a: -1.2 - Math.random() * 0.3, b: 1.2 + Math.random() * 0.3 }),
      () => ({ a: 1.2 + Math.random() * 0.3, b: -1.2 - Math.random() * 0.3 }),
      () => ({ a: 1.2 + Math.random() * 0.3, b: 1.2 + Math.random() * 0.3 })
    ];
    return corners[Math.floor(Math.random() * 4)]();
  },

  defaultLearningRate: 0.002,
  defaultMomentum: 0.9,
  parameterRange: { min: -2, max: 2 }
};

/**
 * Damped Oscillator
 * y = exp(-α·t)·cos(β·t) — physics-y waveform with both decay and ringing.
 * α controls how fast the envelope shrinks; β is angular frequency.
 * Model is even in β so the loss surface has a symmetric pair of global
 * minima at (α*, ±β*). Loss in β is also multimodal from cos aliasing.
 * Time t ∈ [0, 4] so the envelope decays left→right, the canonical look.
 */
const dampedOscillator: ProblemConfig = {
  type: 'damped-oscillator',
  name: 'Damped Oscillator',
  description: 'Fit y = e^(−α·t)·cos(β·t): damping and frequency',
  tagline: 'Multimodal in β, with a symmetric twin at −β.',
  trueParameters: { a: 0.5, b: 3 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueA = dampedOscillator.trueParameters.a;
    const trueB = dampedOscillator.trueParameters.b;

    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      // t in [0, 4]: standard damped-oscillator time-axis appearance
      const x = (i / (numPoints - 1)) * 4 + (rand() - 0.5) * 0.05;
      const noise = (rand() - 0.5) * noiseLevel * 0.5;
      const y = Math.exp(-trueA * x) * Math.cos(trueB * x) + noise;
      data.push({ x, y, isTraining: i < numTrain });
    }

    return shuffle(data);
  },

  predict: (x: number, params: ModelParameters): number => {
    return Math.exp(-params.a * x) * Math.cos(params.b * x);
  },

  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    if (data.length === 0) return 0;
    let total = 0;
    for (const p of data) {
      const env = Math.exp(-params.a * p.x);
      const pred = env * Math.cos(params.b * p.x);
      const err = pred - p.y;
      total += err * err;
    }
    return total / data.length;
  },

  computeGradient: (data: DataPoint[], params: ModelParameters): ModelParameters => {
    if (data.length === 0) return { a: 0, b: 0 };
    let gA = 0, gB = 0;
    for (const p of data) {
      const env = Math.exp(-params.a * p.x);
      const c = Math.cos(params.b * p.x);
      const s = Math.sin(params.b * p.x);
      const pred = env * c;
      const err = pred - p.y;
      // d(pred)/d(α) = -t · pred
      gA += 2 * err * (-p.x * pred);
      // d(pred)/d(β) = -t · env · sin(β·t)
      gB += 2 * err * (-p.x * env * s);
    }
    return { a: gA / data.length, b: gB / data.length };
  },

  // α stays positive (decay) so exp(-α·t) doesn't blow up; β is given a
  // random sign so the symmetric pair of minima at (α*, ±β*) both surface.
  getInitialParameters: () => ({
    a: 1 + Math.random() * 1.2,
    b: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 1.3)
  }),

  defaultLearningRate: 0.05,
  defaultMomentum: 0.9,
  parameterRange: { min: -3, max: 5 }
};

/**
 * Logistic Growth (sigmoid regression)
 * y = 1 / (1 + exp(-(α·X + β))) — continuous y in (0, 1).
 * α is steepness, β is horizontal shift. Different from logistic regression
 * (which is 2D classification): here y is a continuous target.
 */
const logisticGrowth: ProblemConfig = {
  type: 'logistic-growth',
  name: 'Logistic Growth',
  description: 'Fit a sigmoid: steepness and shift',
  tagline: 'Sigmoid saturation flattens the loss at the edges.',
  trueParameters: { a: 2, b: 0 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueA = logisticGrowth.trueParameters.a;
    const trueB = logisticGrowth.trueParameters.b;

    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * 4 - 2 + (rand() - 0.5) * 0.05;
      const noise = (rand() - 0.5) * noiseLevel * 0.3;
      const z = trueA * x + trueB;
      const y = 1 / (1 + Math.exp(-z)) + noise;
      data.push({ x, y, isTraining: i < numTrain });
    }

    return shuffle(data);
  },

  predict: (x: number, params: ModelParameters): number => {
    const z = params.a * x + params.b;
    return 1 / (1 + Math.exp(-z));
  },

  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    if (data.length === 0) return 0;
    let total = 0;
    for (const p of data) {
      const z = params.a * p.x + params.b;
      const pred = 1 / (1 + Math.exp(-z));
      const err = pred - p.y;
      total += err * err;
    }
    return total / data.length;
  },

  computeGradient: (data: DataPoint[], params: ModelParameters): ModelParameters => {
    if (data.length === 0) return { a: 0, b: 0 };
    let gA = 0, gB = 0;
    for (const p of data) {
      const z = params.a * p.x + params.b;
      const pred = 1 / (1 + Math.exp(-z));
      const err = pred - p.y;
      const dPredDz = pred * (1 - pred);
      // d(pred)/d(α) = σ(1-σ) · x;   d(pred)/d(β) = σ(1-σ)
      gA += 2 * err * dPredDz * p.x;
      gB += 2 * err * dPredDz;
    }
    return { a: gA / data.length, b: gB / data.length };
  },

  // α negative is a separate local-minimum basin (inverted sigmoid), so we
  // initialize with α > 0 to land in the correct one. Sigmoid saturates at
  // large |α·x+β| which kills the gradient, so we keep init non-saturating.
  getInitialParameters: () => ({
    a: 0.3 + Math.random() * 1.2,
    b: -1.5 + Math.random() * 3
  }),

  defaultLearningRate: 1,
  defaultMomentum: 0.5
};

/**
 * Power Law
 * y = α · x^β  (x > 0). Scale α and exponent β.
 * Loss is sharply ill-conditioned because β lives in an exponent — cranking
 * up momentum is the natural fix to escape the long, narrow valley.
 */
const powerLaw: ProblemConfig = {
  type: 'power-law',
  name: 'Power Law',
  description: 'Fit y = α·X^β: scale and exponent',
  tagline: 'A long narrow trench: plain GD crawls, momentum flies.',
  trueParameters: { a: 1, b: 1.5 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueA = powerLaw.trueParameters.a;
    const trueB = powerLaw.trueParameters.b;

    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      // x in [0.3, 3.5] — strictly positive
      const x = 0.3 + (i / (numPoints - 1)) * 3.2 + (rand() - 0.5) * 0.05;
      const noise = (rand() - 0.5) * noiseLevel * 0.6;
      const y = trueA * Math.pow(x, trueB) + noise;
      data.push({ x, y, isTraining: i < numTrain });
    }

    return shuffle(data);
  },

  predict: (x: number, params: ModelParameters): number => {
    if (x <= 0) return 0;
    return params.a * Math.pow(x, params.b);
  },

  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    if (data.length === 0) return 0;
    let total = 0;
    for (const p of data) {
      if (p.x <= 0) continue;
      const pred = params.a * Math.pow(p.x, params.b);
      const err = pred - p.y;
      total += err * err;
    }
    return total / data.length;
  },

  computeGradient: (data: DataPoint[], params: ModelParameters): ModelParameters => {
    if (data.length === 0) return { a: 0, b: 0 };
    let gA = 0, gB = 0;
    for (const p of data) {
      if (p.x <= 0) continue;
      const xb = Math.pow(p.x, params.b);
      const pred = params.a * xb;
      const err = pred - p.y;
      // d(pred)/d(α) = x^β
      gA += 2 * err * xb;
      // d(pred)/d(β) = α·x^β·ln(x) = pred · ln(x)
      gB += 2 * err * pred * Math.log(p.x);
    }
    return { a: gA / data.length, b: gB / data.length };
  },

  // Stay inside the basin where model values don't explode for x ≤ 3.5.
  // High α with high β makes y huge and gradients overflow.
  getInitialParameters: () => ({
    a: 0.3 + Math.random() * 1.5,
    b: 0.3 + Math.random() * 1.4
  }),

  defaultLearningRate: 0.005,
  defaultMomentum: 0.9,
  parameterRange: { min: -2, max: 3 }
};

/**
 * Two-Gaussian Mixture
 * y = exp(-(X-α)²) + exp(-(X-β)²) — two unit-width peaks.
 * The model is symmetric in α↔β, so the loss surface has *two* equivalent
 * global minima (true peaks at -1, +1, so basins at (-1, +1) and (+1, -1)).
 * A textbook identifiability / label-switching demo.
 */
const gaussianMixture: ProblemConfig = {
  type: 'gaussian-mixture',
  name: 'Gaussian Mixture',
  description: 'Fit two Gaussian peaks: locations α and β',
  tagline: 'Two interchangeable peaks — two equally good answers.',
  trueParameters: { a: -1, b: 1 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueA = gaussianMixture.trueParameters.a;
    const trueB = gaussianMixture.trueParameters.b;

    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * 4 - 2 + (rand() - 0.5) * 0.05;
      const noise = (rand() - 0.5) * noiseLevel * 0.4;
      const y = Math.exp(-Math.pow(x - trueA, 2)) + Math.exp(-Math.pow(x - trueB, 2)) + noise;
      data.push({ x, y, isTraining: i < numTrain });
    }

    return shuffle(data);
  },

  predict: (x: number, params: ModelParameters): number => {
    return Math.exp(-Math.pow(x - params.a, 2)) + Math.exp(-Math.pow(x - params.b, 2));
  },

  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    if (data.length === 0) return 0;
    let total = 0;
    for (const p of data) {
      const pred =
        Math.exp(-Math.pow(p.x - params.a, 2)) +
        Math.exp(-Math.pow(p.x - params.b, 2));
      const err = pred - p.y;
      total += err * err;
    }
    return total / data.length;
  },

  computeGradient: (data: DataPoint[], params: ModelParameters): ModelParameters => {
    if (data.length === 0) return { a: 0, b: 0 };
    let gA = 0, gB = 0;
    for (const p of data) {
      const eA = Math.exp(-Math.pow(p.x - params.a, 2));
      const eB = Math.exp(-Math.pow(p.x - params.b, 2));
      const err = eA + eB - p.y;
      // d(pred)/d(α) = 2·(x-α)·exp(-(x-α)²)
      gA += 2 * err * 2 * (p.x - params.a) * eA;
      // d(pred)/d(β) = 2·(x-β)·exp(-(x-β)²)
      gB += 2 * err * 2 * (p.x - params.b) * eB;
    }
    return { a: gA / data.length, b: gB / data.length };
  },

  // Start up in the top-right (≈ 2.5, 1.1): well off the a=b saddle and a
  // good distance from the (1, −1) minimum, so the descent traces a long,
  // satisfying diagonal trajectory down into the basin. (This is also the
  // app's default landing problem.) A little jitter keeps re-rolls lively.
  getInitialParameters: () => ({
    a: 2.5 + (Math.random() - 0.5) * 0.4,
    b: 1.1 + (Math.random() - 0.5) * 0.4
  }),

  // The app's default landing problem runs on Momentum: γ tuned so the
  // heavy ball curves down from (2.5, 1.1) into the (1, −1) minimum in
  // ~30 steps without overshooting out of the basin.
  defaultLearningRate: 0.1,
  defaultMomentum: 0.9,
  parameterRange: { min: -3, max: 3 }
};

/**
 * Circle Classifier
 * Each data point is a 2D position; label = 1 if inside a circle of fixed
 * radius around the *true* center, 0 otherwise. The model learns the
 * center (α, β). Soft boundary p = σ((R² − dist²)/τ) — smooth so gradients
 * flow even when boundary is far from points.
 */
const CIRCLE_RADIUS = 1.0;
const CIRCLE_TAU = 0.4; // boundary softness
const circleClassifier: ProblemConfig = {
  type: 'circle-classifier',
  name: 'Circle Classifier',
  description: 'Find a circle center to separate inside / outside points',
  tagline: 'The marker IS the circle\'s center — watch it mirror your moves on the left plot.',
  trueParameters: { a: 0, b: 0 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueCx = circleClassifier.trueParameters.a;
    const trueCy = circleClassifier.trueParameters.b;
    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      // Random 2D position in [-2, 2]²
      const x = (rand() - 0.5) * 4;
      const y = (rand() - 0.5) * 4;
      const dist = Math.sqrt((x - trueCx) ** 2 + (y - trueCy) ** 2);
      // Noisy classification near the boundary
      const noisyR = CIRCLE_RADIUS + (rand() - 0.5) * noiseLevel * 0.4;
      const label = dist < noisyR ? 1 : 0;
      data.push({ x, y, isTraining: i < numTrain, label });
    }

    return shuffle(data);
  },

  predict: (_x: number, _params: ModelParameters): number => 0,

  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    if (data.length === 0) return 0;
    const eps = 1e-7;
    let loss = 0;
    for (const p of data) {
      const dist2 = (p.x - params.a) ** 2 + (p.y - params.b) ** 2;
      const z = (CIRCLE_RADIUS * CIRCLE_RADIUS - dist2) / CIRCLE_TAU;
      const pred = 1 / (1 + Math.exp(-z));
      const c = Math.max(eps, Math.min(1 - eps, pred));
      const y = p.label ?? 0;
      loss -= y * Math.log(c) + (1 - y) * Math.log(1 - c);
    }
    return loss / data.length;
  },

  computeGradient: (data: DataPoint[], params: ModelParameters): ModelParameters => {
    if (data.length === 0) return { a: 0, b: 0 };
    let gA = 0, gB = 0;
    for (const p of data) {
      const dx = p.x - params.a, dy = p.y - params.b;
      const dist2 = dx * dx + dy * dy;
      const z = (CIRCLE_RADIUS * CIRCLE_RADIUS - dist2) / CIRCLE_TAU;
      const pred = 1 / (1 + Math.exp(-z));
      const err = pred - (p.label ?? 0);
      // ∂z/∂α = 2(x-α)/τ, ∂z/∂β = 2(y-β)/τ
      gA += err * 2 * dx / CIRCLE_TAU;
      gB += err * 2 * dy / CIRCLE_TAU;
    }
    return { a: gA / data.length, b: gB / data.length };
  },

  // Init away from the true center so descent is visible.
  getInitialParameters: () => ({
    a: -1.5 + Math.random() * 3,
    b: -1.5 + Math.random() * 3
  }),

  defaultLearningRate: 0.5,
  defaultMomentum: 0.5,
  parameterRange: { min: -2, max: 2 }
};

/**
 * Source Localization
 * Sensors at known 2D positions report a signal strength S = K / (d² + ε)
 * proportional to inverse-square distance to a hidden source. The model
 * learns where the source is (α, β) given (sensor position, signal) pairs.
 */
const SOURCE_K = 1.0;
// Larger ε softens the singularity at sensor positions so the loss surface
// has a single broad basin instead of many sharp local minima.
const SOURCE_EPS = 0.5;
const sourceLocalization: ProblemConfig = {
  type: 'source-localization',
  name: 'Source Localization',
  description: 'Find a hidden source from sensor signal strengths',
  tagline: 'Triangulate a hidden source from sensor strengths.',
  trueParameters: { a: 0.5, b: -0.5 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const sx = sourceLocalization.trueParameters.a;
    const sy = sourceLocalization.trueParameters.b;
    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      const x = (rand() - 0.5) * 4;
      const y = (rand() - 0.5) * 4;
      const dist2 = (x - sx) ** 2 + (y - sy) ** 2;
      const trueSignal = SOURCE_K / (dist2 + SOURCE_EPS);
      const signal = trueSignal + (rand() - 0.5) * noiseLevel * 0.5;
      // Stash signal in DataPoint.label (just a numeric scalar field).
      data.push({ x, y, isTraining: i < numTrain, label: signal });
    }

    return shuffle(data);
  },

  predict: (_x: number, _params: ModelParameters): number => 0,

  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    if (data.length === 0) return 0;
    let loss = 0;
    for (const p of data) {
      const dx = p.x - params.a, dy = p.y - params.b;
      const denom = dx * dx + dy * dy + SOURCE_EPS;
      const pred = SOURCE_K / denom;
      const err = pred - (p.label ?? 0);
      loss += err * err;
    }
    return loss / data.length;
  },

  computeGradient: (data: DataPoint[], params: ModelParameters): ModelParameters => {
    if (data.length === 0) return { a: 0, b: 0 };
    let gA = 0, gB = 0;
    for (const p of data) {
      const dx = p.x - params.a, dy = p.y - params.b;
      const denom = dx * dx + dy * dy + SOURCE_EPS;
      const pred = SOURCE_K / denom;
      const err = pred - (p.label ?? 0);
      // ∂pred/∂α = 2·(x-α)·pred / denom
      gA += 2 * err * 2 * dx * pred / denom;
      gB += 2 * err * 2 * dy * pred / denom;
    }
    return { a: gA / data.length, b: gB / data.length };
  },

  // Loss surface is broad; needs a fairly aggressive step to reach the basin
  // within 200 iterations.
  getInitialParameters: () => ({
    a: -1.5 + Math.random() * 3,
    b: -1.5 + Math.random() * 3
  }),

  defaultLearningRate: 0.02,
  defaultMomentum: 0.9,
  parameterRange: { min: -2, max: 2 }
};

/**
 * Mean-Shift / Cluster-Center finder
 * 2D point cloud with two clusters. Loss is the negative kernel-density
 * estimate at the marker — equivalent to mean-shift mode-finding. Each
 * cluster is its own local minimum, so depending on init the marker
 * converges to whichever cluster mode is nearest.
 *
 * (We chose the kernel form over plain Σ‖p−c‖² because the latter is a
 * single convex bowl with optimum at the *overall* mean — the marker
 * just sits between clusters, which is pedagogically dull.)
 */
const MEAN_SHIFT_SIGMA2 = 0.2;
const meanShift: ProblemConfig = {
  type: 'mean-shift',
  name: 'Mean-Shift Cluster',
  description: 'Find a cluster mode in a 2D point cloud',
  tagline: 'Each cluster is its own basin; the start decides which mode you find.',
  trueParameters: { a: -1, b: 1 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);
    const c1 = { x: -1, y: 1 };
    const c2 = { x: 1, y: -1 };
    const spread = 0.25 + noiseLevel * 0.3;

    for (let i = 0; i < numPoints; i++) {
      const c = i < numPoints / 2 ? c1 : c2;
      const x = c.x + (rand() - 0.5) * spread;
      const y = c.y + (rand() - 0.5) * spread;
      data.push({ x, y, isTraining: i < numTrain });
    }

    return shuffle(data);
  },

  predict: (_x: number, _params: ModelParameters): number => 0,

  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    if (data.length === 0) return 0;
    // L = (1/n) Σ (1 − k_i) — always ≥ 0 (so the log-color heatmap doesn't
    // blow up). Same minima as -k since the constant 1 has zero gradient.
    let loss = 0;
    for (const p of data) {
      const dx = p.x - params.a, dy = p.y - params.b;
      const d2 = dx * dx + dy * dy;
      loss += 1 - Math.exp(-d2 / (2 * MEAN_SHIFT_SIGMA2));
    }
    return loss / data.length;
  },

  computeGradient: (data: DataPoint[], params: ModelParameters): ModelParameters => {
    if (data.length === 0) return { a: 0, b: 0 };
    let gA = 0, gB = 0;
    for (const p of data) {
      const dx = p.x - params.a, dy = p.y - params.b;
      const d2 = dx * dx + dy * dy;
      const k = Math.exp(-d2 / (2 * MEAN_SHIFT_SIGMA2));
      // ∂(-k)/∂α = -k · (x-α) / σ²   (chain rule on -exp(-d²/2σ²))
      gA += -k * dx / MEAN_SHIFT_SIGMA2;
      gB += -k * dy / MEAN_SHIFT_SIGMA2;
    }
    return { a: gA / data.length, b: gB / data.length };
  },

  // Init biased toward one of the two cluster regions (off-diagonal) so
  // the run lands in a basin and the symmetric pair both surface.
  getInitialParameters: () => {
    const flip = Math.random() < 0.5;
    return flip
      ? { a: -1.7 - Math.random() * 0.2, b: 1.5 + Math.random() * 0.3 }
      : { a: 1.5 + Math.random() * 0.3, b: -1.7 - Math.random() * 0.2 };
  },

  defaultLearningRate: 0.3,
  defaultMomentum: 0.5,
  parameterRange: { min: -2, max: 2 }
};

/**
 * AR(2) — an autoregressive time series: each value is a weighted blend of
 * the two before it, X_t = α·X_{t−1} + β·X_{t−2} + noise. Scoring one-step
 * predictions is least squares on lagged copies of the series, so the loss
 * is a clean quadratic valley shaped by the series' own autocorrelation —
 * the gentle introduction; its rollout sibling below is the wild one.
 */
const ar2: ProblemConfig = {
  type: 'ar2',
  name: 'AR(2) Time Series',
  description: 'Predict each value from the two before it',
  tagline: 'Fit yesterday to predict tomorrow — least squares on the series’ own past.',
  trueParameters: { a: 1.2, b: -0.5 },

  // x is the time index t (kept integer so lagged neighbors are exact);
  // y is the series value, built by running the true recursion forward.
  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueA = ar2.trueParameters.a;
    const trueB = ar2.trueParameters.b;
    const numTrain = Math.floor(numPoints * trainRatio);
    const ys: number[] = [0.4 + (rand() - 0.5) * 0.6, 1.0 + (rand() - 0.5) * 0.6];
    for (let t = 2; t < numPoints; t++) {
      ys.push(trueA * ys[t - 1] + trueB * ys[t - 2] + (rand() - 0.5) * noiseLevel * 0.8);
    }
    return ys.map((y, t) => ({ x: t, y, isTraining: t < numTrain }));
  },

  // One-step prediction needs the series' past, not a closed form of t —
  // the data plot draws its own AR overlays instead of using this.
  predict: (_x: number, _params: ModelParameters): number => 0,

  // Teacher-forced one-step MSE over every triple (t−2, t−1, t) that is
  // fully present in the given subset (train/test splits leave gaps).
  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    const byT = new Map<number, number>();
    for (const p of data) byT.set(p.x, p.y);
    let total = 0;
    let m = 0;
    for (const p of data) {
      const y1 = byT.get(p.x - 1);
      const y2 = byT.get(p.x - 2);
      if (y1 === undefined || y2 === undefined) continue;
      const e = p.y - params.a * y1 - params.b * y2;
      total += e * e;
      m++;
    }
    return m > 0 ? total / m : 0;
  },

  computeGradient: (data: DataPoint[], params: ModelParameters): ModelParameters => {
    const byT = new Map<number, number>();
    for (const p of data) byT.set(p.x, p.y);
    let gA = 0;
    let gB = 0;
    let m = 0;
    for (const p of data) {
      const y1 = byT.get(p.x - 1);
      const y2 = byT.get(p.x - 2);
      if (y1 === undefined || y2 === undefined) continue;
      const e = p.y - params.a * y1 - params.b * y2;
      gA += -2 * e * y1;
      gB += -2 * e * y2;
      m++;
    }
    return m > 0 ? { a: gA / m, b: gB / m } : { a: 0, b: 0 };
  },

  // Start across the valley from the minimum at (1.2, −0.5) so the
  // descent gets to ride the autocorrelation valley. Lagged copies of one
  // series are correlated features, so the valley is ill-conditioned:
  // plain GD descends honestly but slowly — switching to Momentum (μ=0.9)
  // converges 20/20 simulated datasets in under 200 steps.
  getInitialParameters: () => ({
    a: -(0.8 + Math.random() * 0.6),
    b: 0.7 + Math.random() * 0.5
  }),

  defaultLearningRate: 0.3,
  defaultMomentum: 0.9,
  parameterRange: { min: -2, max: 2 }
};

/**
 * AR(2) Rollout — same model, same series, harsher question: instead of
 * predicting one step with the true past in hand (teacher forcing), roll
 * the model forward HORIZON steps on its OWN predictions and score the
 * whole forecast. Forecast errors compound through the recursion, which
 * does two things to the landscape:
 *  - inside the stationarity triangle (β > −1, β < 1 ± α) sits a curved,
 *    non-convex valley — the loss is now a degree-2k polynomial, not a
 *    quadratic;
 *  - outside it the model's own dynamics amplify every step, so the loss
 *    rises like ρ^2k and the triangle's edge becomes a literal cliff.
 * This is exploding gradients, the classic hazard of training recurrent
 * networks (Bengio et al. 1994; Pascanu et al. 2013), in two parameters.
 * The gradient is exact backprop-through-time, run in forward mode.
 */
const AR2_HORIZON = 6;

const ar2Rollout: ProblemConfig = {
  type: 'ar2-rollout',
  name: 'AR(2) Rollout',
  description: 'Roll the forecast forward on its own predictions',
  tagline: 'Score the whole forecast: errors compound, and the stability edge becomes a cliff.',
  trueParameters: { a: 1.2, b: -0.5 },

  // The same process as AR(2): the two problems share a data story and
  // differ only in the loss you descend.
  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] =>
    ar2.generateData(numPoints, trainRatio, noiseLevel),

  predict: (_x: number, _params: ModelParameters): number => 0,

  // Every observed pair (X_t, X_{t+1}) seeds a rollout; each rolled step
  // with an observed target contributes one squared error. The recursion
  // keeps rolling across gaps (test points missing from the train subset)
  // but only scores steps it can check.
  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    const byT = new Map<number, number>();
    let maxT = -Infinity;
    for (const p of data) {
      byT.set(p.x, p.y);
      if (p.x > maxT) maxT = p.x;
    }
    let total = 0;
    let m = 0;
    for (const p of data) {
      const t = p.x;
      const next = byT.get(t + 1);
      if (next === undefined) continue;
      let s2 = p.y;
      let s1 = next;
      for (let j = 1; j <= AR2_HORIZON && t + 1 + j <= maxT; j++) {
        const pred = params.a * s1 + params.b * s2;
        if (!Number.isFinite(pred)) break;
        const target = byT.get(t + 1 + j);
        if (target !== undefined) {
          const e = pred - target;
          total += e * e;
          m++;
        }
        s2 = s1;
        s1 = pred;
      }
    }
    return m > 0 ? total / m : 0;
  },

  // Forward-mode BPTT: carry ∂(state)/∂α and ∂(state)/∂β through the
  // recursion alongside the states themselves. Exact, and FD-verified.
  computeGradient: (data: DataPoint[], params: ModelParameters): ModelParameters => {
    const byT = new Map<number, number>();
    let maxT = -Infinity;
    for (const p of data) {
      byT.set(p.x, p.y);
      if (p.x > maxT) maxT = p.x;
    }
    let gA = 0;
    let gB = 0;
    let m = 0;
    for (const p of data) {
      const t = p.x;
      const next = byT.get(t + 1);
      if (next === undefined) continue;
      let s2 = p.y, s1 = next;
      let d2a = 0, d2b = 0, d1a = 0, d1b = 0; // sensitivities of s2, s1
      for (let j = 1; j <= AR2_HORIZON && t + 1 + j <= maxT; j++) {
        const pred = params.a * s1 + params.b * s2;
        if (!Number.isFinite(pred)) break;
        const dpa = s1 + params.a * d1a + params.b * d2a;
        const dpb = s2 + params.a * d1b + params.b * d2b;
        const target = byT.get(t + 1 + j);
        if (target !== undefined) {
          const e = pred - target;
          gA += 2 * e * dpa;
          gB += 2 * e * dpb;
          m++;
        }
        s2 = s1; d2a = d1a; d2b = d1b;
        s1 = pred; d1a = dpa; d1b = dpb;
      }
    }
    return m > 0 ? { a: gA / m, b: gB / m } : { a: 0, b: 0 };
  },

  // Start INSIDE the triangle (with margin — its left edge is β < 1 + α,
  // and a start past the cliff diverges in a handful of steps) but on the
  // wrong side of the valley: the fitted dynamics alternate sign (α < 0),
  // so the descent travels the whole curved valley to (1.2, −0.5). Plain
  // GD stalls along the shallow direction — like Rosenbrock, this valley
  // is momentum's home turf (γ/μ tuned by simulation: 0 divergences in 20
  // random datasets, 15/20 drop the loss 4×+ within 200 steps).
  getInitialParameters: () => ({
    a: -(0.6 + Math.random() * 0.4),
    b: -0.3 + Math.random() * 0.2
  }),

  defaultLearningRate: 0.1,
  defaultMomentum: 0.85,
  parameterRange: { min: -2, max: 2 }
};

/**
 * Tiny Neural Net
 * ŷ = β · tanh(α · X): a REAL neural network with one hidden tanh unit —
 * α is the input weight, β the output weight. Tiny, but it already shows
 * the genuine pathologies of deep learning in miniature:
 *  - (α, β) ↔ (−α, −β) symmetry → two mirror-image global minima
 *  - the origin is an exact saddle: zero-init produces zero gradient
 *    (the classic "why we randomly initialize" lesson)
 *  - large |α| saturates the tanh and its gradient vanishes
 */
const tinyNet: ProblemConfig = {
  type: 'tiny-net',
  name: 'Tiny Neural Net',
  description: 'A real neural network with one hidden tanh unit',
  tagline: 'A real neural net in miniature — mirror minima, and a dead saddle at zero-init.',
  trueParameters: { a: 1.2, b: 1.5 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueA = tinyNet.trueParameters.a;
    const trueB = tinyNet.trueParameters.b;
    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * 4 - 2 + (rand() - 0.5) * 0.05;
      const noise = (rand() - 0.5) * noiseLevel * 0.5;
      data.push({ x, y: trueB * Math.tanh(trueA * x) + noise, isTraining: i < numTrain });
    }

    return shuffle(data);
  },

  predict: (x: number, params: ModelParameters): number => {
    return params.b * Math.tanh(params.a * x);
  },

  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    if (data.length === 0) return 0;
    let total = 0;
    for (const p of data) {
      const err = params.b * Math.tanh(params.a * p.x) - p.y;
      total += err * err;
    }
    return total / data.length;
  },

  computeGradient: (data: DataPoint[], params: ModelParameters): ModelParameters => {
    if (data.length === 0) return { a: 0, b: 0 };
    let gA = 0, gB = 0;
    for (const p of data) {
      const t = Math.tanh(params.a * p.x);
      const err = params.b * t - p.y;
      // d(pred)/d(α) = β·(1−tanh²(αx))·x;  d(pred)/d(β) = tanh(αx)
      gA += 2 * err * params.b * (1 - t * t) * p.x;
      gB += 2 * err * t;
    }
    return { a: gA / data.length, b: gB / data.length };
  },

  // Random angle at a healthy radius: away from the dead saddle at the
  // origin and from the saturated rim, landing in either mirror basin.
  getInitialParameters: () => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.0 + Math.random() * 0.7;
    return { a: radius * Math.cos(angle), b: radius * Math.sin(angle) };
  },

  defaultLearningRate: 0.1,
  parameterRange: { min: -3, max: 3 }
};

/**
 * ---------- Pure analytic surfaces (noData) ----------
 * The classic optimizer test functions: no dataset, the loss IS f(α, β).
 * They slot into the same ProblemConfig shape — generateData returns
 * nothing and loss/gradient ignore the data argument.
 */

const NO_DATA = (_numPoints: number, _trainRatio: number, _noiseLevel?: number): DataPoint[] => [];

/**
 * Stretched Bowl: f = 0.2α² + 2β² — an EXACT quadratic, the curvature
 * chapter's laboratory. The Hessian is constant: λ = 0.4 along α, 4.0
 * along β, so κ = 10 everywhere and the gradient-descent stability edge
 * sits at exactly γ = 2/λmax = 0.5 — a number the reader can find by
 * bisection and then verify against the formula. Below the edge, β snaps
 * in while α crawls (the ravine in miniature); past it, β grows each hop.
 */
const stretchedBowl: ProblemConfig = {
  type: 'stretched-bowl',
  name: 'Stretched Bowl',
  description: 'An exact quadratic with κ = 10 — the cleanest view of curvature',
  tagline: 'Ten times steeper across than along. The stability edge is at exactly γ = 0.5 — find it.',
  trueParameters: { a: 0, b: 0 },
  noData: true,
  generateData: NO_DATA,
  predict: () => 0,

  computeLoss: (_data: DataPoint[], p: ModelParameters): number => {
    return 0.2 * p.a * p.a + 2 * p.b * p.b;
  },

  computeGradient: (_data: DataPoint[], p: ModelParameters): ModelParameters => {
    return { a: 0.4 * p.a, b: 4 * p.b };
  },

  // Start far out along the gentle axis with some height in β, so a run
  // shows both phases: β snaps to the floor fast, then α crawls home.
  getInitialParameters: () => ({
    a: -5.2 + Math.random() * 0.8,
    b: 1.6 + Math.random() * 0.6
  }),

  // Comfortably under the γ = 0.5 edge: β contracts hard, α at 0.88/step.
  defaultLearningRate: 0.3,
  parameterRange: { min: -6, max: 6 }
};

/**
 * Rosenbrock banana: f = (1−α)² + 100(β−α²)².
 * The minimum hides at the end of a curved, nearly-flat valley — easy to
 * reach the valley, brutal to traverse it. THE optimizer benchmark.
 */
const rosenbrock: ProblemConfig = {
  type: 'rosenbrock',
  name: 'Rosenbrock Valley',
  description: 'The classic banana-shaped optimizer benchmark',
  tagline: 'The banana valley: reaching it is easy, traversing it is the test.',
  trueParameters: { a: 1, b: 1 },
  noData: true,
  generateData: NO_DATA,
  predict: () => 0,

  computeLoss: (_data: DataPoint[], p: ModelParameters): number => {
    const u = 1 - p.a;
    const v = p.b - p.a * p.a;
    return u * u + 100 * v * v;
  },

  computeGradient: (_data: DataPoint[], p: ModelParameters): ModelParameters => {
    const v = p.b - p.a * p.a;
    return {
      a: -2 * (1 - p.a) - 400 * p.a * v,
      b: 200 * v
    };
  },

  // Start on the far side of the valley so the run shows both phases:
  // the quick drop INTO the valley, then the slow crawl ALONG it.
  getInitialParameters: () => ({
    a: -1.7 + Math.random() * 0.6,
    b: -1.2 + Math.random() * 1.4
  }),

  // Valley-floor curvature is huge (the 100·(...)² term), so γ must be tiny;
  // momentum makes progress along the floor bearable.
  defaultLearningRate: 0.0002,
  defaultMomentum: 0.9,
  parameterRange: { min: -2, max: 2 }
};

/**
 * Saddle point: f = α² − β² + β⁴/8 + 2.
 * Bowl-shaped in α, double-well in β: a true saddle sits at the origin
 * where the gradient vanishes while the loss is far from minimal. The two
 * minima live at (0, ±2) with f = 0.
 */
const saddlePoint: ProblemConfig = {
  type: 'saddle-point',
  name: 'Saddle Point',
  description: 'Downhill in α, uphill-then-down in β',
  tagline: 'Gradients die at the dead-center saddle — escape depends on where you start.',
  trueParameters: { a: 0, b: 2 },
  noData: true,
  generateData: NO_DATA,
  predict: () => 0,

  computeLoss: (_data: DataPoint[], p: ModelParameters): number => {
    return p.a * p.a - p.b * p.b + Math.pow(p.b, 4) / 8 + 2;
  },

  computeGradient: (_data: DataPoint[], p: ModelParameters): ModelParameters => {
    return {
      a: 2 * p.a,
      b: -2 * p.b + Math.pow(p.b, 3) / 2
    };
  },

  // Start close to the β = 0 ridge so the slow saddle escape is visible:
  // α collapses fast, then the marker lingers before sliding off to ±2.
  getInitialParameters: () => ({
    a: (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random()),
    b: (Math.random() - 0.5) * 0.8
  }),

  defaultLearningRate: 0.05,
  parameterRange: { min: -3, max: 3 }
};

/**
 * Himmelblau: f = (α²+β−11)² + (α+β²−7)².
 * Four equally deep global minima — the canonical "your destination
 * depends on your start" surface.
 */
const himmelblau: ProblemConfig = {
  type: 'himmelblau',
  name: 'Himmelblau',
  description: 'Four equal minima in one surface',
  tagline: 'Four equally deep minima — a different one for every start.',
  trueParameters: { a: 3, b: 2 },
  noData: true,
  generateData: NO_DATA,
  predict: () => 0,

  computeLoss: (_data: DataPoint[], p: ModelParameters): number => {
    const u = p.a * p.a + p.b - 11;
    const v = p.a + p.b * p.b - 7;
    return u * u + v * v;
  },

  computeGradient: (_data: DataPoint[], p: ModelParameters): ModelParameters => {
    const u = p.a * p.a + p.b - 11;
    const v = p.a + p.b * p.b - 7;
    return {
      a: 4 * p.a * u + 2 * v,
      b: 2 * u + 4 * p.b * v
    };
  },

  // Anywhere in the frame: every start belongs to one of the four basins.
  getInitialParameters: () => ({
    a: (Math.random() - 0.5) * 9,
    b: (Math.random() - 0.5) * 9
  }),

  defaultLearningRate: 0.002,
  defaultMomentum: 0.5,
  parameterRange: { min: -5, max: 5 }
};

/**
 * Custom Regression — bring your own (x, y) points and pick the model (line,
 * quadratic, exponential, power, or a typed formula). predict/loss/gradient
 * delegate to utils/customModel, which reads the live model selection.
 */
const customRegression: ProblemConfig = {
  type: 'custom-regression',
  name: 'Custom Regression',
  description: 'Bring your own data and choose the model that fits it',
  tagline: 'Your data, your model — place points or paste a dataset.',
  trueParameters: { a: 1, b: 0 }, // no ground truth; the true-line overlay is hidden
  // Start blank — the learner places (or pastes) their own points.
  generateData: (): DataPoint[] => [],
  predict: (x, params) => regressionPredict(x, params),
  computeLoss: (data, params) => regressionLoss(data, params),
  computeGradient: (data, params) => regressionGrad(data, params),
  // Start at the origin — a neutral, in-range flat line the learner trains to
  // fit, instead of a random far corner that reads as "fitting to nothing".
  getInitialParameters: () => ({ a: 0, b: 0 }),
  defaultLearningRate: 0.02
};

/**
 * Custom Classification — place two classes of 2D points and pick a
 * 2-parameter boundary (linear through the origin, or a fixed-radius circle).
 * Features live in (x, y); the class is in label, like the built-in classifiers.
 */
const customClassification: ProblemConfig = {
  type: 'custom-classification',
  name: 'Custom Classification',
  description: 'Place two classes and choose a 2-parameter boundary',
  tagline: 'Two classes, one boundary you control.',
  trueParameters: { a: 1, b: 1 },
  // Start blank — the learner places (or pastes) their own labelled points.
  generateData: (): DataPoint[] => [],
  predict: () => 0, // the data plot draws the decision boundary itself
  computeLoss: (data, params) => classificationLoss(data, params),
  computeGradient: (data, params) => classificationGrad(data, params),
  getInitialParameters: () => {
    const ang = rand() * Math.PI * 2;
    const r = 1.5 + rand();
    return { a: Math.cos(ang) * r, b: Math.sin(ang) * r };
  },
  defaultLearningRate: 0.1,
  parameterRange: { min: -4, max: 4 }
};

// Export all problem configurations
export const problemConfigs: Record<string, ProblemConfig> = {
  'slope-1d': slopeFit,
  'double-well-1d': doubleWell1D,
  'bumpy-1d': bumpyValley1D,
  'linear-regression': linearRegression,
  'logistic-regression': logisticRegression,
  'polynomial-regression': polynomialRegression,
  'sine-wave': sineWave,
  'gaussian-peak': gaussianPeak,
  'exponential-decay': exponentialDecay,
  'damped-oscillator': dampedOscillator,
  'logistic-growth': logisticGrowth,
  'power-law': powerLaw,
  'gaussian-mixture': gaussianMixture,
  'circle-classifier': circleClassifier,
  'source-localization': sourceLocalization,
  'mean-shift': meanShift,
  'ar2': ar2,
  'ar2-rollout': ar2Rollout,
  'tiny-net': tinyNet,
  'stretched-bowl': stretchedBowl,
  'rosenbrock': rosenbrock,
  'saddle-point': saddlePoint,
  'himmelblau': himmelblau,
  'custom-regression': customRegression,
  'custom-classification': customClassification
};

