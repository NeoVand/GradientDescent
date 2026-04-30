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

/**
 * Linear Regression
 * The simplest problem: fitting a line y = ax + b to data points
 * Loss function: Mean Squared Error (MSE)
 */
const linearRegression: ProblemConfig = {
  type: 'linear-regression',
  name: 'Linear Regression',
  description: 'Fit a line to data points using least squares',
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
      const x = (i / (numPoints - 1)) * 4 - 2 + (Math.random() - 0.5) * 0.2;
      // Generate y with noise
      const noise = (Math.random() - 0.5) * noiseLevel * 2;  // Scale noise
      const y = trueA * x + trueB + noise;
      
      data.push({
        x,
        y,
        isTraining: i < numTrain
      });
    }
    
    // Shuffle the data to mix training and test points
    return data.sort(() => Math.random() - 0.5);
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
  }
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
      
      const x = centerX + (Math.random() - 0.5) * spread;
      const y = centerY + (Math.random() - 0.5) * spread;
      
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
      
      const x = centerX + (Math.random() - 0.5) * spread;
      const y = centerY + (Math.random() - 0.5) * spread;
      
      data.push({
        x,
        y,
        isTraining: i < Math.floor(numClass1 * trainRatio),
        label: 1
      });
    }
    
    return data.sort(() => Math.random() - 0.5);
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
  }
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
  trueParameters: { a: 0.5, b: -0.3 },
  
  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    // True function: y = 0.5x² - 0.3x + noise
    const trueA = polynomialRegression.trueParameters.a;
    const trueB = polynomialRegression.trueParameters.b;
    
    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);
    
    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * 4 - 2;
      const noise = (Math.random() - 0.5) * noiseLevel * 2;  // Scale noise
      const y = trueA * x * x + trueB * x + noise;
      
      data.push({
        x,
        y,
        isTraining: i < numTrain
      });
    }
    
    return data.sort(() => Math.random() - 0.5);
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
  }
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
  trueParameters: { a: 1.5, b: 3 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueA = sineWave.trueParameters.a;
    const trueB = sineWave.trueParameters.b;

    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * 4 - 2 + (Math.random() - 0.5) * 0.05;
      const noise = (Math.random() - 0.5) * noiseLevel;
      const y = trueA * Math.sin(trueB * x) + noise;

      data.push({ x, y, isTraining: i < numTrain });
    }

    return data.sort(() => Math.random() - 0.5);
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
  }
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
  trueParameters: { a: 0, b: 1 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueA = gaussianPeak.trueParameters.a;
    const trueB = gaussianPeak.trueParameters.b;

    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * 4 - 2 + (Math.random() - 0.5) * 0.05;
      const peak = Math.exp(-((x - trueA) ** 2) / (2 * trueB * trueB));
      const noise = (Math.random() - 0.5) * noiseLevel * 0.5;
      data.push({ x, y: peak + noise, isTraining: i < numTrain });
    }

    return data.sort(() => Math.random() - 0.5);
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
  trueParameters: { a: 1, b: 0.5 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueA = exponentialDecay.trueParameters.a;
    const trueB = exponentialDecay.trueParameters.b;

    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * 4 - 2 + (Math.random() - 0.5) * 0.05;
      const noise = (Math.random() - 0.5) * noiseLevel * 0.5;
      const y = trueA * Math.exp(-trueB * x) + noise;
      data.push({ x, y, isTraining: i < numTrain });
    }

    return data.sort(() => Math.random() - 0.5);
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
  trueParameters: { a: 0.5, b: 3 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueA = dampedOscillator.trueParameters.a;
    const trueB = dampedOscillator.trueParameters.b;

    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      // t in [0, 4]: standard damped-oscillator time-axis appearance
      const x = (i / (numPoints - 1)) * 4 + (Math.random() - 0.5) * 0.05;
      const noise = (Math.random() - 0.5) * noiseLevel * 0.5;
      const y = Math.exp(-trueA * x) * Math.cos(trueB * x) + noise;
      data.push({ x, y, isTraining: i < numTrain });
    }

    return data.sort(() => Math.random() - 0.5);
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
  trueParameters: { a: 2, b: 0 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueA = logisticGrowth.trueParameters.a;
    const trueB = logisticGrowth.trueParameters.b;

    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * 4 - 2 + (Math.random() - 0.5) * 0.05;
      const noise = (Math.random() - 0.5) * noiseLevel * 0.3;
      const z = trueA * x + trueB;
      const y = 1 / (1 + Math.exp(-z)) + noise;
      data.push({ x, y, isTraining: i < numTrain });
    }

    return data.sort(() => Math.random() - 0.5);
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
  trueParameters: { a: 1, b: 1.5 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueA = powerLaw.trueParameters.a;
    const trueB = powerLaw.trueParameters.b;

    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      // x in [0.3, 3.5] — strictly positive
      const x = 0.3 + (i / (numPoints - 1)) * 3.2 + (Math.random() - 0.5) * 0.05;
      const noise = (Math.random() - 0.5) * noiseLevel * 0.6;
      const y = trueA * Math.pow(x, trueB) + noise;
      data.push({ x, y, isTraining: i < numTrain });
    }

    return data.sort(() => Math.random() - 0.5);
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
  trueParameters: { a: -1, b: 1 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueA = gaussianMixture.trueParameters.a;
    const trueB = gaussianMixture.trueParameters.b;

    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * 4 - 2 + (Math.random() - 0.5) * 0.05;
      const noise = (Math.random() - 0.5) * noiseLevel * 0.4;
      const y = Math.exp(-Math.pow(x - trueA, 2)) + Math.exp(-Math.pow(x - trueB, 2)) + noise;
      data.push({ x, y, isTraining: i < numTrain });
    }

    return data.sort(() => Math.random() - 0.5);
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

  // Initialize off-diagonal so the marker isn't on the saddle a=b. Random
  // sign pairing surfaces the symmetric pair of global minima.
  getInitialParameters: () => {
    const flip = Math.random() < 0.5;
    const aMag = 1.8 + Math.random() * 0.6;
    const bMag = 1.8 + Math.random() * 0.6;
    return flip
      ? { a: -aMag, b: bMag }
      : { a: aMag, b: -bMag };
  },

  defaultLearningRate: 0.3,
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
  trueParameters: { a: 0, b: 0 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const trueCx = circleClassifier.trueParameters.a;
    const trueCy = circleClassifier.trueParameters.b;
    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      // Random 2D position in [-2, 2]²
      const x = (Math.random() - 0.5) * 4;
      const y = (Math.random() - 0.5) * 4;
      const dist = Math.sqrt((x - trueCx) ** 2 + (y - trueCy) ** 2);
      // Noisy classification near the boundary
      const noisyR = CIRCLE_RADIUS + (Math.random() - 0.5) * noiseLevel * 0.4;
      const label = dist < noisyR ? 1 : 0;
      data.push({ x, y, isTraining: i < numTrain, label });
    }

    return data.sort(() => Math.random() - 0.5);
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
  trueParameters: { a: 0.5, b: -0.5 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const sx = sourceLocalization.trueParameters.a;
    const sy = sourceLocalization.trueParameters.b;
    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);

    for (let i = 0; i < numPoints; i++) {
      const x = (Math.random() - 0.5) * 4;
      const y = (Math.random() - 0.5) * 4;
      const dist2 = (x - sx) ** 2 + (y - sy) ** 2;
      const trueSignal = SOURCE_K / (dist2 + SOURCE_EPS);
      const signal = trueSignal + (Math.random() - 0.5) * noiseLevel * 0.5;
      // Stash signal in DataPoint.label (just a numeric scalar field).
      data.push({ x, y, isTraining: i < numTrain, label: signal });
    }

    return data.sort(() => Math.random() - 0.5);
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
  trueParameters: { a: -1, b: 1 },

  generateData: (numPoints: number, trainRatio: number, noiseLevel: number = 0.3): DataPoint[] => {
    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);
    const c1 = { x: -1, y: 1 };
    const c2 = { x: 1, y: -1 };
    const spread = 0.25 + noiseLevel * 0.3;

    for (let i = 0; i < numPoints; i++) {
      const c = i < numPoints / 2 ? c1 : c2;
      const x = c.x + (Math.random() - 0.5) * spread;
      const y = c.y + (Math.random() - 0.5) * spread;
      data.push({ x, y, isTraining: i < numTrain });
    }

    return data.sort(() => Math.random() - 0.5);
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

// Export all problem configurations
export const problemConfigs: Record<string, ProblemConfig> = {
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
  'mean-shift': meanShift
};

