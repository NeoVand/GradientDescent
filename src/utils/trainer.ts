/**
 * Training engine.
 *
 * Owns the animated training loop and every state transition around it
 * (problem/optimizer switches, resets, single steps), so that ANY part of
 * the app — the sidebar, one-click experiments, a future race mode — can
 * drive training through one API. Components stay pure UI.
 *
 * After a run finishes naturally, the coach reports a verdict: converged,
 * stalled (vanishing gradient away from the basin), or out of steps while
 * still descending. Divergence is detected per-step and never commits
 * non-finite values to the stores.
 */

import { get, writable } from 'svelte/store';
import {
  selectedProblem,
  datasetStore,
  trainingStore,
  parametersStore,
  historyStore,
  optimizerStore,
  optimizerStateStore,
  resetOptimizerState,
  divergenceStore,
  recordInitialHistory,
  lossSceneStore,
  showCoach,
  clearCoach
} from '../stores/stores';
import { problemConfigs } from './problems';
import { optimizers, defaultHyper, type OptimizerId } from './optimizers';
import type { DataPoint, ProblemType } from '../types/types';

/** History step the current run started from — drives the progress fill. */
export const runStartStep = writable(0);

// Parameters this far outside any visible range mean the run has blown up.
const DIVERGENCE_LIMIT = 1e4;

let interval: number | null = null;
let stepsToTrain = 0;
let stepsCompleted = 0;
let runningSps = 0;

function hasDiverged(params: { a: number; b: number }, loss: number): boolean {
  return (
    !Number.isFinite(params.a) ||
    !Number.isFinite(params.b) ||
    !Number.isFinite(loss) ||
    Math.abs(params.a) > DIVERGENCE_LIMIT ||
    Math.abs(params.b) > DIVERGENCE_LIMIT
  );
}

/**
 * Sample a minibatch for this step. Full batch ('all' or batch ≥ n) returns
 * the data as-is; otherwise a uniform sample without replacement.
 * Deliberately unseeded — per-step SGD noise is the phenomenon on display.
 */
function sampleBatch(trainData: DataPoint[]): DataPoint[] {
  const bs = get(trainingStore).batchSize;
  if (bs === 'all' || bs >= trainData.length) return trainData;
  const idx = trainData.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, bs).map(i => trainData[i]);
}

/**
 * One optimizer update: gradient on the (mini)batch, step via the selected
 * optimizer, record full-batch losses. Returns false when the step diverged
 * (nothing is committed and the run should stop).
 */
function doOneStep(): boolean {
  const trainData = get(datasetStore).data.filter(point => point.isTraining);
  if (trainData.length === 0) return false;
  const testData = get(datasetStore).data.filter(point => !point.isTraining);
  const config = problemConfigs[get(selectedProblem)];
  const sel = get(optimizerStore);
  const opt = optimizers[sel.id];

  const params = get(parametersStore);
  const gradient = config.computeGradient(sampleBatch(trainData), params);
  const result = opt.step(params, gradient, get(optimizerStateStore), get(trainingStore).learningRate, sel.hyper);

  // The chart always shows the loss over the full training set, so curve
  // wobble under small batches reflects parameter noise, not measurement.
  const trainLoss = config.computeLoss(trainData, result.params);
  const history = get(historyStore);
  const nextStepNumber = (history.length > 0 ? history[history.length - 1].step : 0) + 1;

  // Divergence check BEFORE committing anything: the marker stays at its
  // last sane position and the loss chart never sees NaN.
  if (hasDiverged(result.params, trainLoss)) {
    divergenceStore.set({ step: nextStepNumber });
    return false;
  }

  parametersStore.set(result.params);
  optimizerStateStore.set(result.state);
  trainingStore.update(store => ({ ...store, currentStep: nextStepNumber }));
  historyStore.addPoint({
    step: nextStepNumber,
    trainLoss,
    testLoss: config.computeLoss(testData, result.params),
    parameters: result.params
  });
  return true;
}

function startLoop() {
  if (interval !== null) clearInterval(interval);
  runningSps = get(trainingStore).stepsPerSecond;
  const intervalMs = Math.max(8, Math.round(1000 / runningSps));
  interval = window.setInterval(() => {
    if (stepsCompleted >= stepsToTrain) {
      finishRun();
      return;
    }
    if (!doOneStep()) {
      stopTraining();
      return;
    }
    stepsCompleted++;
  }, intervalMs);
}

// Live speed changes rebuild the ticker mid-run.
trainingStore.subscribe(t => {
  if (interval !== null && t.isTraining && t.stepsPerSecond !== runningSps) {
    startLoop();
  }
});

export function startTraining() {
  const t = get(trainingStore);
  if (t.isTraining) return;

  clearCoach();
  divergenceStore.set(null);
  trainingStore.update(store => ({ ...store, isTraining: true }));

  stepsToTrain = t.totalSteps;
  stepsCompleted = 0;

  const history = get(historyStore);
  runStartStep.set(history.length > 0 ? history[history.length - 1].step : 0);

  startLoop();
}

export function stopTraining() {
  if (interval !== null) {
    clearInterval(interval);
    interval = null;
  }
  runningSps = 0;
  trainingStore.update(store => ({ ...store, isTraining: false }));
}

/** Natural end of a run: stop, then let the coach explain what happened. */
function finishRun() {
  const steps = stepsCompleted;
  stopTraining();
  evaluateRun(steps);
}

/** Single step: same code path as the loop, one click at a time. */
export function stepOnce() {
  if (get(trainingStore).isTraining) return;
  divergenceStore.set(null);
  clearCoach();
  doOneStep();
}

export function resetRun() {
  stopTraining();
  parametersStore.reset();
  resetOptimizerState();
  divergenceStore.set(null);
  clearCoach();
  trainingStore.update(store => ({ ...store, currentStep: 0, isTraining: false }));
  // Restart history at the new initial position (step 0)
  recordInitialHistory();
}

/**
 * Resolve the learning rate for a (optimizer, problem) pair: adaptive
 * optimizers carry their own γ (they're scale-robust); everyone else uses
 * the problem's curated default. Always applied on switch so a rate tuned
 * for one surface never silently carries to another where it diverges.
 */
export function resolveLearningRate(optimizerId: OptimizerId, problemType: ProblemType): number {
  return optimizers[optimizerId].fixedLearningRate
    ?? problemConfigs[problemType]?.defaultLearningRate
    ?? 0.01;
}

/** Hyper defaults for an optimizer, honoring the problem's curated μ. */
export function hyperForProblem(optimizerId: OptimizerId, problemType: ProblemType): Record<string, number> {
  const hyper = defaultHyper(optimizerId);
  const mu = problemConfigs[problemType]?.defaultMomentum;
  if ((optimizerId === 'momentum' || optimizerId === 'nesterov') && mu) {
    hyper.mu = mu;
  }
  return hyper;
}

/**
 * Switch problem with its curated defaults. Problems curated around
 * momentum auto-select the Momentum optimizer — but only when the user is
 * on a momentum-family/plain method; a deliberate Adam/RMSProp/AdaGrad
 * choice is respected.
 */
export function applyProblem(type: ProblemType) {
  selectedProblem.set(type);
  const cfg = problemConfigs[type];
  let optimizerId = get(optimizerStore).id;
  if (optimizerId === 'gd' || optimizerId === 'momentum') {
    optimizerId = (cfg?.defaultMomentum ?? 0) > 0 ? 'momentum' : 'gd';
  }
  optimizerStore.set({ id: optimizerId, hyper: hyperForProblem(optimizerId, type) });
  trainingStore.update(store => ({
    ...store,
    learningRate: resolveLearningRate(optimizerId, type),
    // Per-problem γ/μ are curated for full-batch gradients; a sticky batch
    // of 1 can blast a momentum run out of a narrow basin.
    batchSize: 'all'
  }));
  // Regenerate data for the new problem, then reset on top of it so the
  // initial history point reflects the new dataset.
  datasetStore.regenerateData();
  resetRun();
  if (cfg?.tagline) {
    showCoach('info', `${cfg.name} — ${cfg.tagline}`);
  }
}

/**
 * Switch optimizer, keeping the marker where it is — comparing optimizers
 * from the same start is the whole point. Only internal state and γ reset.
 */
export function applyOptimizer(id: OptimizerId) {
  if (id === get(optimizerStore).id) return;
  optimizerStore.set({ id, hyper: hyperForProblem(id, get(selectedProblem)) });
  resetOptimizerState();
  divergenceStore.set(null);
  trainingStore.update(store => ({
    ...store,
    learningRate: resolveLearningRate(id, get(selectedProblem))
  }));
}

/** Post-run verdict: what should the learner take away from this run? */
function evaluateRun(steps: number) {
  if (get(divergenceStore)) return;
  const data = get(datasetStore).data;
  const trainData = data.filter(d => d.isTraining);
  if (trainData.length === 0) return;

  const config = problemConfigs[get(selectedProblem)];
  const params = get(parametersStore);
  const g = config.computeGradient(trainData, params);
  const mag = Math.hypot(g.a, g.b);
  const loss = config.computeLoss(trainData, params);
  const scene = get(lossSceneStore);
  const fmtMag = mag >= 0.01 ? mag.toFixed(3) : mag.toExponential(1);

  if (scene) {
    const span = Math.max(scene.grid.visMax - scene.grid.visMin, 1e-12);
    const nearBasin = loss <= scene.grid.visMin + 0.03 * span;
    if (nearBasin) {
      showCoach('success', `Converged — reached the basin in ${steps} steps (‖∇ℒ‖ = ${fmtMag}).`);
      return;
    }
    const fieldMax = scene.field.maxMag || 1;
    if (mag < 0.004 * fieldMax) {
      showCoach(
        'warn',
        `Stalled after ${steps} steps: ‖∇ℒ‖ ≈ ${fmtMag} but the loss is still high — a local minimum or flat plateau. Momentum, a larger γ, or a new start can help.`
      );
      return;
    }
  }

  const h = get(historyStore);
  if (h.length >= 2 && h[h.length - 1].trainLoss < h[h.length - 2].trainLoss - 1e-12) {
    showCoach('info', 'Out of steps while still descending — Train again to continue, or raise γ.');
  }
}
