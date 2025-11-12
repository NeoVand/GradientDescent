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

// Export all problem configurations
export const problemConfigs: Record<string, ProblemConfig> = {
  'linear-regression': linearRegression,
  'logistic-regression': logisticRegression,
  'polynomial-regression': polynomialRegression
};

