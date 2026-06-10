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
  raceStore,
  landscapeViewStore,
  showCoach,
  clearCoach,
  courseStore,
  challengeStore,
  type Racer
} from '../stores/stores';
import { problemConfigs } from './problems';
import { optimizers, defaultHyper, type OptimizerId } from './optimizers';
import { normalizedLogLoss } from './lossGrid';
import { schedules } from './schedules';
import type { DataPoint, ProblemType } from '../types/types';

/**
 * "In the basin" means the bright region of the heatmap: the bottom slice
 * of the normalized log-loss range. Log space makes this scale-free —
 * 3%-of-linear-span would count half of Rosenbrock as converged because
 * its corners tower five orders of magnitude over the valley.
 */
const BASIN_LOG_THRESHOLD = 0.05;

/** History step the current run started from — drives the progress fill. */
export const runStartStep = writable(0);

/**
 * Signal posted when a run finishes naturally — what happened and in how
 * many steps. The course panel uses it to flip from "running" to "reveal".
 */
export type RunVerdict = 'converged' | 'stalled' | 'descending';
export const runEndStore = writable<{ steps: number; verdict: RunVerdict } | null>(null);

const courseActive = () => get(courseStore).active;

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
  const config = problemConfigs[get(selectedProblem)];
  const trainData = get(datasetStore).data.filter(point => point.isTraining);
  if (trainData.length === 0 && !config.noData) return false;
  const testData = get(datasetStore).data.filter(point => !point.isTraining);
  const sel = get(optimizerStore);
  const opt = optimizers[sel.id];

  const params = get(parametersStore);
  const gradient = config.computeGradient(sampleBatch(trainData), params);

  // Effective γ under the schedule, measured by progress through this run.
  const t = get(trainingStore);
  const tInRun = Math.max(0, t.currentStep - get(runStartStep));
  const effLr = t.learningRate * schedules[t.schedule].factor(tInRun, t.totalSteps);

  const result = opt.step(params, gradient, get(optimizerStateStore), effLr, sel.hyper);

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

  stopRace();
  clearCoach();
  runEndStore.set(null);
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
  stopRace();
  parametersStore.reset();
  resetOptimizerState();
  divergenceStore.set(null);
  clearCoach();
  runStartStep.set(0);
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
  // A challenge is bound to its exact scenario; switching problems ends it.
  challengeStore.set(null);
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
    // of 1 can blast a momentum run out of a narrow basin. The schedule
    // resets too — curated defaults assume a constant γ.
    batchSize: 'all',
    schedule: 'constant'
  }));
  // Regenerate data for the new problem, then reset on top of it so the
  // initial history point reflects the new dataset.
  datasetStore.regenerateData();
  resetRun();
  // During the course, the lesson card does the introducing.
  if (cfg?.tagline && !courseActive()) {
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
  const config = problemConfigs[get(selectedProblem)];
  const data = get(datasetStore).data;
  const trainData = data.filter(d => d.isTraining);
  if (trainData.length === 0 && !config.noData) return;
  const params = get(parametersStore);
  const g = config.computeGradient(trainData, params);
  const mag = Math.hypot(g.a, g.b);
  const loss = config.computeLoss(trainData, params);
  const scene = get(lossSceneStore);
  const fmtMag = mag >= 0.01 ? mag.toFixed(3) : mag.toExponential(1);

  // Classify first, then report: the course panel consumes the verdict
  // silently (its reveal step does the talking); the coach narrates
  // otherwise.
  let verdict: RunVerdict = 'descending';
  if (scene && normalizedLogLoss(scene.grid, loss) <= BASIN_LOG_THRESHOLD) {
    verdict = 'converged';
  } else if (scene && mag < 0.004 * (scene.field.maxMag || 1)) {
    verdict = 'stalled';
  }

  // "Steps to the basin" = when the run FIRST entered it, not the run's
  // length — a 200-step run that arrived at step 70 scored a 70. A run
  // that STARTED inside the basin isn't an arrival at all.
  let basinSteps = steps;
  let startedInBasin = false;
  if (scene) {
    const start = get(runStartStep);
    for (const pt of get(historyStore)) {
      if (pt.step === start) {
        startedInBasin = normalizedLogLoss(scene.grid, pt.trainLoss) <= BASIN_LOG_THRESHOLD;
      }
      if (verdict === 'converged' && pt.step > start && normalizedLogLoss(scene.grid, pt.trainLoss) <= BASIN_LOG_THRESHOLD) {
        basinSteps = pt.step - start;
        break;
      }
    }
  }

  runEndStore.set({ steps: basinSteps, verdict });
  if (courseActive()) return;

  const stepWord = (n: number) => (n === 1 ? 'step' : 'steps');

  // An open challenge gets judged before the generic coach verdicts —
  // but only for honest attempts that started outside the basin.
  const challenge = get(challengeStore);
  if (challenge) {
    if (startedInBasin) {
      showCoach('info', 'This run started inside the basin — hit Reset for a fresh start, then try to beat the target.');
    } else if (verdict === 'converged' && basinSteps <= challenge.target) {
      challengeStore.set({ ...challenge, status: 'beaten' });
      showCoach('success', `🏆 Challenge beaten — basin in ${basinSteps} ${stepWord(basinSteps)} (target ≤ ${challenge.target}).`, 0);
    } else if (verdict === 'converged') {
      challengeStore.set({ ...challenge, status: 'missed' });
      showCoach('warn', `Reached the basin in ${basinSteps} ${stepWord(basinSteps)} — the target is ≤ ${challenge.target}. Tune γ, μ, or the optimizer and try again.`);
    } else {
      challengeStore.set({ ...challenge, status: 'missed' });
      showCoach('warn', `No convergence within ${steps} steps — the challenge wants the basin in ≤ ${challenge.target}. Try a different setup.`);
    }
    return;
  }

  if (verdict === 'converged') {
    showCoach('success', `Converged — entered the basin after ${basinSteps} steps (‖∇ℒ‖ = ${fmtMag} at the end).`);
    return;
  }
  if (verdict === 'stalled') {
    showCoach(
      'warn',
      `Stalled after ${steps} steps: ‖∇ℒ‖ ≈ ${fmtMag} but the loss is still high — a local minimum or flat plateau. Momentum, a larger γ, or a new start can help.`
    );
    return;
  }

  const h = get(historyStore);
  if (h.length >= 2 && h[h.length - 1].trainLoss < h[h.length - 2].trainLoss - 1e-12) {
    showCoach('info', 'Out of steps while still descending — Train again to continue, or raise γ.');
  }
}

// ====================== Race mode ======================
// Four contrasting optimizers descend from the marker's current position,
// each with its own curated γ/μ for the active problem. First to the basin
// wins; the coach posts the finishing order.

const RACE_LINEUP: Array<{ id: OptimizerId; color: string }> = [
  { id: 'gd', color: '#94a3b8' },       // slate
  { id: 'momentum', color: '#a855f7' }, // purple
  { id: 'rmsprop', color: '#22d3ee' },  // cyan
  { id: 'adam', color: '#f43f5e' }      // rose
];

let raceInterval: number | null = null;

export function startRace() {
  stopTraining();
  stopRace();
  runEndStore.set(null);
  divergenceStore.set(null);
  // Trails render in the 2D view
  landscapeViewStore.set('2d');

  const start = get(parametersStore);
  const racers: Racer[] = RACE_LINEUP.map(({ id, color }) => ({
    id,
    color,
    params: { ...start },
    state: optimizers[id].init(),
    trail: [{ ...start }],
    steps: 0,
    finished: false,
    diverged: false
  }));
  raceStore.set({ racers, running: true });
  if (!courseActive()) {
    showCoach('info', 'Racing GD, Momentum, RMSProp, and Adam from the same start — each with its own γ. First to the basin wins.', 0);
  }

  const cap = Math.max(get(trainingStore).totalSteps, 100);
  const intervalMs = Math.max(8, Math.round(1000 / get(trainingStore).stepsPerSecond));
  raceInterval = window.setInterval(() => stepRace(cap), intervalMs);
}

function stepRace(cap: number) {
  const rs = get(raceStore);
  if (!rs) {
    stopRace();
    return;
  }

  const problem = get(selectedProblem);
  const config = problemConfigs[problem];
  const trainData = get(datasetStore).data.filter(p => p.isTraining);
  if (trainData.length === 0 && !config.noData) {
    stopRace();
    return;
  }
  const scene = get(lossSceneStore);

  let anyActive = false;
  for (const r of rs.racers) {
    if (r.finished || r.diverged || r.steps >= cap) continue;

    const gradient = config.computeGradient(trainData, r.params);
    const out = optimizers[r.id].step(
      r.params,
      gradient,
      r.state,
      resolveLearningRate(r.id, problem),
      hyperForProblem(r.id, problem)
    );
    const loss = config.computeLoss(trainData, out.params);

    if (hasDiverged(out.params, loss)) {
      r.diverged = true;
      continue;
    }

    r.params = out.params;
    r.state = out.state;
    r.steps++;
    r.trail.push({ ...out.params });

    if (scene && normalizedLogLoss(scene.grid, loss) <= BASIN_LOG_THRESHOLD) {
      r.finished = true;
    }

    if (!r.finished && r.steps < cap) anyActive = true;
  }

  raceStore.set({ ...rs }); // racers mutated in place; new wrapper triggers redraws

  if (!anyActive) {
    if (raceInterval !== null) {
      clearInterval(raceInterval);
      raceInterval = null;
    }
    raceStore.update(s => (s ? { ...s, running: false } : null));
    const parts = rs.racers.map(r => {
      const name = optimizers[r.id].name;
      if (r.diverged) return `${name}: diverged`;
      if (r.finished) return `${name}: ${r.steps} steps`;
      return `${name}: >${cap}`;
    });
    const nobodyFinished = rs.racers.every(r => !r.finished);
    if (!courseActive()) {
      showCoach(
        'success',
        `🏁 Finish line — ${parts.join('  ·  ')}` +
          (nobodyFinished ? '. Nobody reached the basin within the step budget — some surfaces are just that hard.' : ''),
        0
      );
    }
  }
}

/** Stop and clear the race (trails disappear). */
export function stopRace() {
  if (raceInterval !== null) {
    clearInterval(raceInterval);
    raceInterval = null;
  }
  if (get(raceStore)) raceStore.set(null);
}
