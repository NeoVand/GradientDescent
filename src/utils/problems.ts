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
  generateData: (numPoints: number, trainRatio: number): DataPoint[] => {
    // True underlying function: y = 1.5x + 0.5 + noise
    const trueA = linearRegression.trueParameters.a;
    const trueB = linearRegression.trueParameters.b;
    const noiseLevel = 0.3;
    
    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);
    
    for (let i = 0; i < numPoints; i++) {
      // Generate x values evenly spaced with some jitter
      const x = (i / (numPoints - 1)) * 4 - 2 + (Math.random() - 0.5) * 0.2;
      // Generate y with noise
      const noise = (Math.random() - 0.5) * noiseLevel;
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
  trueParameters: { a: 0.7, b: 0.3 },
  
  // Generate linearly separable data
  generateData: (numPoints: number, trainRatio: number): DataPoint[] => {
    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);
    
    // True decision boundary: y = 0.7x + 0.3 (we'll use x as feature)
    const trueA = logisticRegression.trueParameters.a;
    const trueB = logisticRegression.trueParameters.b;
    const margin = 0.5;
    const noise = 0.3;
    
    for (let i = 0; i < numPoints; i++) {
      // Generate x uniformly
      const x = (i / (numPoints - 1)) * 4 - 2 + (Math.random() - 0.5) * 0.2;
      
      // Decide class based on true boundary with some margin
      const trueBoundary = trueA * x + trueB;
      const randomOffset = (Math.random() - 0.5) * 2 * margin;
      
      // Add some noise to make it more realistic
      let label: number;
      if (randomOffset > 0) {
        label = 1;
      } else {
        label = 0;
      }
      
      // Generate y based on the label with some scatter
      let y: number;
      if (label === 1) {
        y = trueBoundary + margin/2 + (Math.random() - 0.5) * noise;
      } else {
        y = trueBoundary - margin/2 + (Math.random() - 0.5) * noise;
      }
      
      data.push({
        x,
        y,
        isTraining: i < numTrain,
        label
      });
    }
    
    return data.sort(() => Math.random() - 0.5);
  },
  
  // Logistic model prediction (probability of class 1)
  predict: (x: number, params: ModelParameters): number => {
    const z = params.a * x + params.b;
    return 1 / (1 + Math.exp(-z));  // Sigmoid function
  },
  
  // Binary Cross-Entropy loss
  computeLoss: (data: DataPoint[], params: ModelParameters): number => {
    if (data.length === 0) return 0;
    
    let totalLoss = 0;
    const epsilon = 1e-7; // Small value to prevent log(0)
    
    for (const point of data) {
      // For visualization, we use x as the feature
      // The decision boundary is where ax + b = 0, so points where ax + b > 0 are class 1
      const z = params.a * point.x + params.b;
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
      const z = params.a * point.x + params.b;
      const prediction = 1 / (1 + Math.exp(-z));
      const error = prediction - (point.label || 0);
      
      // Gradient with respect to parameters
      gradA += error * point.x;
      gradB += error;
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
  
  generateData: (numPoints: number, trainRatio: number): DataPoint[] => {
    // True function: y = 0.5x² - 0.3x + noise
    const trueA = polynomialRegression.trueParameters.a;
    const trueB = polynomialRegression.trueParameters.b;
    const noiseLevel = 0.2;
    
    const data: DataPoint[] = [];
    const numTrain = Math.floor(numPoints * trainRatio);
    
    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * 4 - 2;
      const noise = (Math.random() - 0.5) * noiseLevel;
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

