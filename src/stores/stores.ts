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
import { setSeed, newSeed, shuffle } from '../utils/rng';
import { optimizers, defaultHyper, type OptimizerId, type OptimizerState } from '../utils/optimizers';
import {
  computeLossGrid,
  gridToImageURL,
  computeVectorField,
  type LossGrid,
  type VectorField,
  type ParameterRange
} from '../utils/lossGrid';

// ========== Problem Selection Store ==========
// Controls which ML problem we're currently exploring
export const selectedProblem = writable<ProblemType>('linear-regression');

// ========== Dataset Store ==========
// Manages our data points and train/test split.
// The dataset is fully determined by (problem, seed, numPoints, trainRatio,
// randomSplit, noiseLevel) — tweaking a slider re-rolls *nothing*: the same
// seed replays the same randomness, so noise/points changes deform the
// current dataset smoothly. The dice button draws a fresh seed.
interface DatasetState {
  numPoints: number;
  trainRatio: number;  // Value between 0 and 1
  randomSplit: boolean;  // Whether to randomly split or use first N for training
  noiseLevel: number;  // Noise level for data generation (0 to 1)
  seed: number;  // RNG seed for reproducible data
  data: DataPoint[];
}

function buildData(state: DatasetState): DataPoint[] {
  const problemConfig = problemConfigs[get(selectedProblem)];
  setSeed(state.seed);
  const data = problemConfig.generateData(state.numPoints, state.trainRatio, state.noiseLevel);

  // Random split: shuffle and reassign training flags
  if (state.randomSplit) {
    shuffle(data);
    const numTrain = Math.floor(state.numPoints * state.trainRatio);
    data.forEach((point, idx) => {
      point.isTraining = idx < numTrain;
    });
  }

  return data;
}

function createDatasetStore() {
  const { subscribe, update } = writable<DatasetState>({
    numPoints: 20,
    trainRatio: 0.8,
    randomSplit: true,
    noiseLevel: 0.3,
    seed: newSeed(),
    data: []
  });

  return {
    subscribe,
    setNumPoints: (numPoints: number) => update(state => ({ ...state, numPoints })),
    setTrainRatio: (trainRatio: number) => update(state => ({ ...state, trainRatio })),
    setRandomSplit: (randomSplit: boolean) => update(state => ({ ...state, randomSplit })),
    setNoiseLevel: (noiseLevel: number) => update(state => ({ ...state, noiseLevel })),
    /** Rebuild the dataset from the current seed and settings. */
    regenerateData: () => update(state => ({ ...state, data: buildData(state) })),
    /** Draw a fresh seed and rebuild — the "give me new data" action. */
    reroll: () =>
      update(state => {
        const next = { ...state, seed: newSeed() };
        return { ...next, data: buildData(next) };
      }),
    /** Hand-edit: append a point (click-to-add on the data plot). */
    addPoint: (point: DataPoint) =>
      update(state => ({ ...state, data: [...state.data, point] })),
    /** Hand-edit: remove the point at an index (click-to-remove). */
    removePoint: (index: number) =>
      update(state =>
        state.data.length > 3
          ? { ...state, data: state.data.filter((_, i) => i !== index) }
          : state
      ),
    /** Restore settings from a shared URL (data rebuilt separately). */
    hydrate: (partial: Partial<Omit<DatasetState, 'data'>>) =>
      update(state => ({ ...state, ...partial }))
  };
}

export const datasetStore = createDatasetStore();

// ========== Model Parameters Store ==========
// Tracks the current model parameters (A and B)
function createParametersStore() {
  // Default corner/edge init — works for problems whose basin of attraction
  // covers most of the visible parameter range (linear, polynomial, sine, ...).
  // Deliberately unseeded: every reset should explore a fresh starting point.
  const initializeDefault = (): ModelParameters => {
    const regions = [
      () => ({ a: -6 + Math.random() * 2, b: -6 + Math.random() * 2 }), // Bottom-left corner
      () => ({ a: -6 + Math.random() * 2, b: 4 + Math.random() * 2 }),  // Top-left corner
      () => ({ a: 4 + Math.random() * 2, b: -6 + Math.random() * 2 }),  // Bottom-right corner
      () => ({ a: -6 + Math.random() * 8, b: -6 + Math.random() }),     // Bottom edge
      () => ({ a: -6 + Math.random(), b: -6 + Math.random() * 8 })      // Left edge
    ];
    return regions[Math.floor(Math.random() * regions.length)]();
  };

  // Resolve init for the current problem (uses problem-specific override if any).
  const initializeForCurrentProblem = (): ModelParameters => {
    const config = problemConfigs[get(selectedProblem)];
    return config?.getInitialParameters ? config.getInitialParameters() : initializeDefault();
  };

  const { subscribe, set, update } = writable<ModelParameters>(initializeDefault());

  return {
    subscribe,
    set,
    update,
    reset: () => set(initializeForCurrentProblem())
  };
}

export const parametersStore = createParametersStore();

// ========== Training Configuration Store ==========
// Manages training hyperparameters and state
export const trainingStore = writable<TrainingConfig>({
  learningRate: 0.01,
  totalSteps: 200,
  currentStep: 0,
  isTraining: false,
  batchSize: 'all',
  stepsPerSecond: 20,
  schedule: 'constant'
});

// ========== Optimizer Stores ==========
// Which optimizer is selected, with its current hyperparameter values
// (rendered as sliders from the optimizer's spec).
export interface OptimizerSelection {
  id: OptimizerId;
  hyper: Record<string, number>;
}

export const optimizerStore = writable<OptimizerSelection>({
  id: 'gd',
  hyper: defaultHyper('gd')
});

// Mutable per-run optimizer state (velocity / moment estimates / step
// count). Kept separate so it can be reset independently: training reset,
// problem or optimizer switch, hyperparameter change, manual marker drag.
export const optimizerStateStore = writable<OptimizerState>(optimizers.gd.init());

export function resetOptimizerState() {
  optimizerStateStore.set(optimizers[get(optimizerStore).id].init());
}

// ========== Divergence Store ==========
// Set when training blows up (non-finite or absurd parameters). The
// landscape shows an explainer banner; cleared on reset, drag, problem
// switch, or the next training attempt.
export const divergenceStore = writable<{ step: number } | null>(null);

// ========== Coach Store ==========
// One-line observations about what just happened — "converged in N steps",
// "stalled on a plateau", a problem's tagline on switch, an experiment's
// narration. Rendered in the same overlay slot as the divergence banner
// (divergence wins when both are set).
export type CoachKind = 'success' | 'info' | 'warn';

export interface CoachMessage {
  kind: CoachKind;
  text: string;
}

export const coachStore = writable<CoachMessage | null>(null);

let coachTimer: ReturnType<typeof setTimeout> | undefined;

/** Show a coach message; auto-dismisses after ttlMs (0 = sticky). */
export function showCoach(kind: CoachKind, text: string, ttlMs = 9000) {
  if (coachTimer) clearTimeout(coachTimer);
  coachStore.set({ kind, text });
  if (ttlMs > 0) {
    coachTimer = setTimeout(() => coachStore.set(null), ttlMs);
  }
}

export function clearCoach() {
  if (coachTimer) clearTimeout(coachTimer);
  coachStore.set(null);
}

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

// Current losses (analytic surfaces ignore data, so empty arrays are fine)
export const currentLosses = derived(
  [datasetStore, parametersStore, currentProblemConfig],
  ([$dataset, $parameters, $config]) => {
    const trainData = $dataset.data.filter(point => point.isTraining);
    const testData = $dataset.data.filter(point => !point.isTraining);
    const noData = $config.noData ?? false;

    return {
      trainLoss: trainData.length > 0 || noData ? $config.computeLoss(trainData, $parameters) : 0,
      testLoss: testData.length > 0 || noData ? $config.computeLoss(testData, $parameters) : 0
    };
  }
);

// ========== Loss Scene Store ==========
// The expensive landscape computation, done once per (data, problem) pair:
// loss grid + pre-rendered heatmap image + gradient vector field. Theme
// toggles and resizes re-render from this cache without recomputing.
// Training and marker drags don't touch it at all (data doesn't change).
export interface LossScene {
  grid: LossGrid;
  imageURL: string;
  field: VectorField;
  range: ParameterRange;
}

const DEFAULT_PARAMETER_RANGE: ParameterRange = { min: -7, max: 7 };

export const lossSceneStore = derived(
  [datasetStore, currentProblemConfig],
  ([$dataset, $config]): LossScene | null => {
    const trainData = $dataset.data.filter(point => point.isTraining);
    if (trainData.length === 0 && !$config.noData) return null;

    const range = $config.parameterRange ?? DEFAULT_PARAMETER_RANGE;
    const grid = computeLossGrid(trainData, $config, range);
    return {
      grid,
      imageURL: gridToImageURL(grid),
      field: computeVectorField(trainData, $config, range),
      range
    };
  }
);

// ========== History Helpers ==========
// Start a run's history with the current position (step 0). Used on app
// mount and on every training reset so the loss chart always has an anchor.
export function recordInitialHistory() {
  const { data } = get(datasetStore);
  const config = get(currentProblemConfig);
  if (data.length === 0 && !config.noData) return;

  const parameters = get(parametersStore);
  const trainData = data.filter(d => d.isTraining);
  const testData = data.filter(d => !d.isTraining);

  historyStore.set([
    {
      step: 0,
      trainLoss: config.computeLoss(trainData, parameters),
      testLoss: config.computeLoss(testData, parameters),
      parameters
    }
  ]);
}

// ========== Race Store ==========
// Several optimizers descending from the same start, each with its own
// parameters, internal state, and trail. Owned by the trainer's race loop;
// the 2D landscape renders the trails.
export interface Racer {
  id: import('../utils/optimizers').OptimizerId;
  color: string;
  params: ModelParameters;
  state: OptimizerState;
  trail: ModelParameters[];
  steps: number;
  finished: boolean;
  diverged: boolean;
}

export interface RaceState {
  racers: Racer[];
  running: boolean;
}

export const raceStore = writable<RaceState | null>(null);

// ========== Landscape View Store ==========
// Which rendering of the loss landscape is active. Persisted so returning
// visitors keep their preferred view.
export type LandscapeView = '2d' | '3d';

function createLandscapeViewStore() {
  const initial = (): LandscapeView => {
    if (typeof window === 'undefined') return '2d';
    return localStorage.getItem('landscape-view') === '3d' ? '3d' : '2d';
  };

  const { subscribe, set } = writable<LandscapeView>(initial());

  return {
    subscribe,
    set: (view: LandscapeView) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('landscape-view', view);
      }
      set(view);
    }
  };
}

export const landscapeViewStore = createLandscapeViewStore();

// ========== Challenge Store ==========
// A shared link can carry a goal: "reach the basin in ≤ N steps". The
// landscape shows the target pill; the trainer judges each finished run.
export interface ChallengeState {
  target: number;
  status: 'open' | 'beaten' | 'missed';
}

export const challengeStore = writable<ChallengeState | null>(null);

// ========== Course Store ==========
// Guided lessons in four explicit steps — setup (look here) → predict
// (commit to an answer) → run (watch it happen) → learn (the explanation).
// The panel lives on the landscape; lesson content and flow helpers live
// in utils/lessons.ts.
export type CoursePhase = 'setup' | 'predict' | 'running' | 'reveal' | 'done';

export interface CourseState {
  active: boolean;
  idx: number;
  phase: CoursePhase;
  answer: number | null;
}

export const courseStore = writable<CourseState>({
  active: false,
  idx: 0,
  phase: 'predict',
  answer: null
});

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
