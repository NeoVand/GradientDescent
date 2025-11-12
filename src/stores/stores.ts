/**
 * Svelte stores for managing application state
 * 
 * Stores in Svelte are reactive data containers that allow multiple
 * components to share and react to state changes. When a store value
 * changes, all components subscribed to it automatically update.
 */

import { writable, derived, get } from 'svelte/store';
import type { 
  ProblemType, 
  DataPoint, 
  ModelParameters, 
  TrainingConfig, 
  TrainingHistoryPoint
} from '../types/types';
import { problemConfigs } from '../utils/problems';

// ========== Problem Selection Store ==========
// Controls which ML problem we're currently exploring
export const selectedProblem = writable<ProblemType>('linear-regression');

// ========== Dataset Store ==========
// Manages our data points and train/test split
interface DatasetState {
  numPoints: number;
  trainRatio: number;  // Value between 0 and 1
  randomSplit: boolean;  // Whether to randomly split or use first N for training
  noiseLevel: number;  // Noise level for data generation (0 to 1)
  data: DataPoint[];
}

function createDatasetStore() {
  const { subscribe, set, update } = writable<DatasetState>({
    numPoints: 20,
    trainRatio: 0.8,
    randomSplit: true,  // Default to random split
    noiseLevel: 0.3,  // Default noise level
    data: []
  });

  return {
    subscribe,
    setNumPoints: (numPoints: number) => update(state => ({ ...state, numPoints })),
    setTrainRatio: (trainRatio: number) => update(state => ({ ...state, trainRatio })),
    setRandomSplit: (randomSplit: boolean) => update(state => ({ ...state, randomSplit })),
    setNoiseLevel: (noiseLevel: number) => update(state => ({ ...state, noiseLevel })),
    regenerateData: () => update(state => {
      const currentProblem = get(selectedProblem);
      const problemConfig = problemConfigs[currentProblem];
      let data = problemConfig.generateData(state.numPoints, state.trainRatio, state.noiseLevel);
      
      // Apply random split if enabled
      if (state.randomSplit) {
        // Shuffle and reassign training flags
        const shuffled = [...data].sort(() => Math.random() - 0.5);
        const numTrain = Math.floor(state.numPoints * state.trainRatio);
        shuffled.forEach((point, idx) => {
          point.isTraining = idx < numTrain;
        });
        data = shuffled;
      }
      
      return { ...state, data };
    }),
    setData: (data: DataPoint[]) => update(state => ({ ...state, data })),
    initialize: () => {
      const state = get(datasetStore);
      const currentProblem = get(selectedProblem);
      const problemConfig = problemConfigs[currentProblem];
      let data = problemConfig.generateData(state.numPoints, state.trainRatio, state.noiseLevel);
      
      // Apply random split if enabled
      if (state.randomSplit) {
        const shuffled = [...data].sort(() => Math.random() - 0.5);
        const numTrain = Math.floor(state.numPoints * state.trainRatio);
        shuffled.forEach((point, idx) => {
          point.isTraining = idx < numTrain;
        });
        data = shuffled;
      }
      
      update(s => ({ ...s, data }));
    }
  };
}

export const datasetStore = createDatasetStore();

// ========== Model Parameters Store ==========
// Tracks the current model parameters (A and B)
function createParametersStore() {
  const { subscribe, set, update } = writable<ModelParameters>({
    a: Math.random() * 2 - 1,  // Random initialization between -1 and 1
    b: Math.random() * 2 - 1
  });

  return {
    subscribe,
    set,
    update,
    reset: () => set({
      a: Math.random() * 2 - 1,
      b: Math.random() * 2 - 1
    })
  };
}

export const parametersStore = createParametersStore();

// ========== Training Configuration Store ==========
// Manages training hyperparameters and state
export const trainingStore = writable<TrainingConfig>({
  learningRate: 0.01,
  totalSteps: 200,
  currentStep: 0,
  isTraining: false
});

// ========== Training History Store ==========
// Keeps track of all parameter updates and losses during training
function createHistoryStore() {
  const { subscribe, set, update } = writable<TrainingHistoryPoint[]>([]);

  return {
    subscribe,
    addPoint: (point: TrainingHistoryPoint) => update(history => [...history, point]),
    reset: () => set([]),
    set
  };
}

export const historyStore = createHistoryStore();

// Removed old loss landscape visualization stores - now just a simple gradient field

// ========== Derived Stores ==========
// These automatically update when their dependencies change

// Current problem configuration
export const currentProblemConfig = derived(
  selectedProblem,
  $selectedProblem => problemConfigs[$selectedProblem]
);

// Split data into training and test sets
export const trainingData = derived(
  datasetStore,
  $dataset => $dataset.data.filter(point => point.isTraining)
);

export const testData = derived(
  datasetStore,
  $dataset => $dataset.data.filter(point => !point.isTraining)
);

// Current losses
export const currentLosses = derived(
  [datasetStore, parametersStore, currentProblemConfig],
  ([$dataset, $parameters, $config]) => {
    const trainData = $dataset.data.filter(point => point.isTraining);
    const testData = $dataset.data.filter(point => !point.isTraining);
    
    return {
      trainLoss: trainData.length > 0 ? $config.computeLoss(trainData, $parameters) : 0,
      testLoss: testData.length > 0 ? $config.computeLoss(testData, $parameters) : 0
    };
  }
);

// ========== Theme Store ==========
// Manages the current theme (light or dark)
export type Theme = 'light' | 'dark';

function createThemeStore() {
  // Check if user has a saved preference, otherwise use system preference
  const getInitialTheme = (): Theme => {
    if (typeof window === 'undefined') return 'light';
    
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved) return saved;
    
    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    
    return 'light';
  };

  const { subscribe, set, update } = writable<Theme>(getInitialTheme());

  return {
    subscribe,
    toggle: () => update(theme => {
      const newTheme = theme === 'light' ? 'dark' : 'light';
      if (typeof window !== 'undefined') {
        localStorage.setItem('theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
      }
      return newTheme;
    }),
    set: (theme: Theme) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
      }
      set(theme);
    }
  };
}

export const themeStore = createThemeStore();

// ========== Utility Functions ==========
// Helper function to perform one gradient descent step
export function performGradientDescentStep() {
  const dataset = datasetStore.subscribe(ds => ds);
  const params = parametersStore.subscribe(p => p);
  const training = trainingStore.subscribe(t => t);
  const config = currentProblemConfig.subscribe(c => c);
  
  // Get current values (note: in real app, we'd handle this more elegantly)
  let currentDataset: DatasetState;
  let currentParams: ModelParameters;
  let currentTraining: TrainingConfig;
  let currentConfig: any;
  
  dataset(ds => currentDataset = ds);
  params(p => currentParams = p);
  training(t => currentTraining = t);
  config(c => currentConfig = c);
  
  // Compute gradient
  const trainData = currentDataset!.data.filter(point => point.isTraining);
  const gradient = currentConfig!.computeGradient(trainData, currentParams!);
  
  // Update parameters
  parametersStore.update(params => ({
    a: params.a - currentTraining!.learningRate * gradient.a,
    b: params.b - currentTraining!.learningRate * gradient.b
  }));
  
  // Update training step
  trainingStore.update(t => ({
    ...t,
    currentStep: t.currentStep + 1
  }));
  
  // Clean up subscriptions
  dataset();
  params();
  training();
  config();
}

