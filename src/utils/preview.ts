/**
 * Next-step preview: a dry run of the selected optimizer's next update —
 * the SAME pure step function the trainer uses, fed the live momentum
 * velocity / adaptive state and the schedule-adjusted γ. Shared by the
 * 1D, 2D, and 3D views so the ghost always means exactly one thing.
 */

import { optimizers, type OptimizerState } from './optimizers';
import { schedules } from './schedules';
import { computeHessian } from './hessian';
import type { DataPoint, ModelParameters, ProblemConfig, TrainingConfig } from '../types/types';
import type { OptimizerSelection } from '../stores/stores';

export function previewNextStep(
  params: ModelParameters,
  grad: ModelParameters | null,
  sel: OptimizerSelection,
  state: OptimizerState,
  t: TrainingConfig,
  runStart: number,
  // Second-order methods (Newton, Sophia) need the local Hessian for an honest
  // ghost; callers that have the problem config and data pass them so we can
  // build it here. Omitted → those methods fall back to their gradient path.
  config?: ProblemConfig,
  data?: DataPoint[]
): ModelParameters | null {
  if (!grad || !Number.isFinite(grad.a) || !Number.isFinite(grad.b)) return null;
  const tInRun = Math.max(0, t.currentStep - runStart);
  const effLr = t.learningRate * schedules[t.schedule].factor(tInRun, t.totalSteps);
  const opt = optimizers[sel.id];
  const ctx =
    opt.usesHessian && config
      ? { hessian: computeHessian(config, data ?? [], params), range: config.parameterRange ?? { min: -7, max: 7 } }
      : undefined;
  const out = opt.step(params, grad, state, effLr, sel.hyper, ctx);
  if (!Number.isFinite(out.params.a) || !Number.isFinite(out.params.b)) return null;
  return out.params;
}
