/**
 * The γ-sweep instrument: run the CURRENT scenario headlessly across a
 * log-spaced grid of learning rates and record how many steps each takes to
 * reach the basin — the canonical steps-vs-γ U-curve, measured rather than
 * asserted. Full-batch gradients, no animation, same optimizer/hyper/start
 * as the live marker, so the chart answers exactly "what if I only changed
 * γ?". The theoretical stability edge 2/λmax (at the problem's minimum) is
 * computed alongside, so theory and experiment share one picture.
 */

import { get } from 'svelte/store';
import {
  selectedProblem,
  datasetStore,
  parametersStore,
  optimizerStore,
  lossSceneStore
} from '../stores/stores';
import { problemConfigs } from './problems';
import { optimizers } from './optimizers';
import { computeHessian, eigenSym2 } from './hessian';
import { normalizedLogLoss } from './lossGrid';
import { BASIN_LOG_THRESHOLD } from './trainer';
import type { ModelParameters } from '../types/types';

export interface SweepPoint {
  gamma: number;
  /** Steps to first reach the basin; null = never (stalled or out of budget). */
  steps: number | null;
  /** The run blew up (non-finite or fled the domain). */
  diverged: boolean;
}

export interface SweepResult {
  points: SweepPoint[];
  /** Theoretical plain-GD stability edge 2/λmax at the minimum, if computable. */
  edge: number | null;
  optimizerName: string;
  maxSteps: number;
}

const GAMMAS = 44; // log-spaced samples across the slider's range
const LR_MIN = 1e-4;
const LR_MAX = 1;
const MAX_STEPS = 400;

export function sweepLearningRates(): SweepResult | null {
  const problem = get(selectedProblem);
  const config = problemConfigs[problem];
  const optState = get(optimizerStore);
  const opt = optimizers[optState.id];
  const hyper = { ...optState.hyper };
  const start: ModelParameters = { ...get(parametersStore) };
  const data = get(datasetStore).data.filter((d) => d.isTraining);
  const range = config.parameterRange ?? { min: -7, max: 7 };
  // The exact criterion the coach's "converged" verdict uses: loss within
  // the bottom 5% of the landscape's log-space range.
  const scene = get(lossSceneStore);
  if (!scene || (data.length === 0 && !config.noData)) return null;
  const grid = scene.grid;
  const inBasin = (loss: number) => normalizedLogLoss(grid, loss) <= BASIN_LOG_THRESHOLD;

  const lossAt = (p: ModelParameters) => config.computeLoss(data, p);
  const target = config.trueParameters ?? { a: 0, b: 0 };

  // Theoretical edge (plain-GD): 2/λmax at the minimum, like the slider tick.
  let edge: number | null = null;
  try {
    const eig = eigenSym2(computeHessian(config, data, target));
    const lmax = Math.max(Math.abs(eig.lambda1), Math.abs(eig.lambda2));
    if (Number.isFinite(lmax) && lmax > 0) edge = 2 / lmax;
  } catch {
    edge = null;
  }

  const points: SweepPoint[] = [];
  for (let k = 0; k < GAMMAS; k++) {
    const gamma = LR_MIN * Math.pow(LR_MAX / LR_MIN, k / (GAMMAS - 1));
    let params = { ...start };
    let state = opt.init();
    let steps: number | null = null;
    let diverged = false;
    for (let t = 1; t <= MAX_STEPS; t++) {
      const g = config.computeGradient(data, params);
      const ctx = opt.usesHessian
        ? { hessian: computeHessian(config, data, params), range }
        : { range };
      const r = opt.step(params, g, state, gamma, hyper, ctx);
      params = r.params;
      state = r.state;
      if (
        !Number.isFinite(params.a) || !Number.isFinite(params.b) ||
        Math.abs(params.a) > 1e4 || Math.abs(params.b) > 1e4
      ) {
        diverged = true;
        break;
      }
      if (inBasin(lossAt(params))) {
        steps = t;
        break;
      }
    }
    points.push({ gamma, steps, diverged });
  }

  return { points, edge, optimizerName: opt.name, maxSteps: MAX_STEPS };
}
