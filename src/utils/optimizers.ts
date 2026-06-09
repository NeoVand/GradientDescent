/**
 * Optimizer engine.
 *
 * Every optimizer is a pure step function over a generic state record, plus
 * the metadata the UI needs to render itself: a hyperparameter spec (sliders
 * are generated from it) and a LaTeX update rule (the Formulas panel shows
 * the math for whichever optimizer is selected).
 *
 * State convention — one record fits all six methods:
 *   v: velocity (momentum family) or first-moment estimate (Adam)
 *   s: squared-gradient accumulator (AdaGrad) / EMA (RMSProp, Adam)
 *   t: step count (Adam bias correction)
 */

import type { ModelParameters } from '../types/types';

export type OptimizerId = 'gd' | 'momentum' | 'nesterov' | 'adagrad' | 'rmsprop' | 'adam';

export interface OptimizerState {
  v: ModelParameters;
  s: ModelParameters;
  t: number;
}

export interface HyperparamSpec {
  key: string;
  /** Short display label, e.g. "Momentum". */
  label: string;
  /** Greek/short symbol shown next to the label, e.g. "μ". */
  symbol: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** One-line tooltip explanation. */
  hint: string;
}

export interface Optimizer {
  id: OptimizerId;
  name: string;
  /** One-line description for the picker. */
  description: string;
  /** KaTeX source for the update rule, shown in the Formulas panel. */
  updateRuleLatex: string;
  /** Teachable hyperparameters; ε-style constants stay internal. */
  hyperparams: HyperparamSpec[];
  /**
   * Adaptive methods normalize the gradient away, so one learning rate
   * works across all problems; when set, it overrides the per-problem γ
   * default on optimizer/problem switches. Momentum-family methods leave
   * this unset and inherit the problem's curated γ.
   */
  fixedLearningRate?: number;
  init(): OptimizerState;
  step(
    params: ModelParameters,
    gradient: ModelParameters,
    state: OptimizerState,
    learningRate: number,
    hyper: Record<string, number>
  ): { params: ModelParameters; state: OptimizerState };
}

const EPS = 1e-8;

const zero = (): ModelParameters => ({ a: 0, b: 0 });
const initState = (): OptimizerState => ({ v: zero(), s: zero(), t: 0 });

const MU_SPEC: HyperparamSpec = {
  key: 'mu',
  label: 'Momentum',
  symbol: 'μ',
  min: 0,
  max: 0.99,
  step: 0.01,
  default: 0.9,
  hint: 'Fraction of the previous velocity kept each step. 0 = plain GD.'
};

export const gradientDescent: Optimizer = {
  id: 'gd',
  name: 'Gradient Descent',
  description: 'Step straight down the gradient',
  updateRuleLatex: String.raw`\boldsymbol{\theta}^{(t+1)} \leftarrow \boldsymbol{\theta}^{(t)} - \gamma\, \nabla \mathcal{L}`,
  hyperparams: [],
  init: initState,
  step(params, g, state, lr) {
    return {
      params: { a: params.a - lr * g.a, b: params.b - lr * g.b },
      state: { ...state, v: { ...g }, t: state.t + 1 }
    };
  }
};

export const momentum: Optimizer = {
  id: 'momentum',
  name: 'Momentum',
  description: 'Heavy ball: velocity accumulates past gradients',
  updateRuleLatex: String.raw`\mathbf{v} \leftarrow \mu \mathbf{v} + \nabla \mathcal{L}, \quad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \mathbf{v}`,
  hyperparams: [MU_SPEC],
  init: initState,
  step(params, g, state, lr, hyper) {
    const mu = hyper.mu ?? MU_SPEC.default;
    const v = { a: mu * state.v.a + g.a, b: mu * state.v.b + g.b };
    return {
      params: { a: params.a - lr * v.a, b: params.b - lr * v.b },
      state: { ...state, v, t: state.t + 1 }
    };
  }
};

export const nesterov: Optimizer = {
  id: 'nesterov',
  name: 'Nesterov',
  description: 'Momentum with a look-ahead correction',
  // The framework-style reformulation (as in PyTorch): the parameter step
  // blends the current gradient with the updated velocity, approximating
  // a gradient evaluated at the look-ahead point.
  updateRuleLatex: String.raw`\mathbf{v} \leftarrow \mu \mathbf{v} + \nabla \mathcal{L}, \quad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma (\nabla \mathcal{L} + \mu \mathbf{v})`,
  hyperparams: [MU_SPEC],
  init: initState,
  step(params, g, state, lr, hyper) {
    const mu = hyper.mu ?? MU_SPEC.default;
    const v = { a: mu * state.v.a + g.a, b: mu * state.v.b + g.b };
    return {
      params: {
        a: params.a - lr * (g.a + mu * v.a),
        b: params.b - lr * (g.b + mu * v.b)
      },
      state: { ...state, v, t: state.t + 1 }
    };
  }
};

export const adagrad: Optimizer = {
  id: 'adagrad',
  name: 'AdaGrad',
  description: 'Per-parameter rates shrink with accumulated gradient',
  updateRuleLatex: String.raw`\mathbf{s} \leftarrow \mathbf{s} + (\nabla \mathcal{L})^2, \quad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \frac{\gamma}{\sqrt{\mathbf{s}} + \varepsilon} \nabla \mathcal{L}`,
  hyperparams: [],
  fixedLearningRate: 0.1,
  init: initState,
  step(params, g, state, lr) {
    const s = { a: state.s.a + g.a * g.a, b: state.s.b + g.b * g.b };
    return {
      params: {
        a: params.a - (lr * g.a) / (Math.sqrt(s.a) + EPS),
        b: params.b - (lr * g.b) / (Math.sqrt(s.b) + EPS)
      },
      state: { ...state, s, v: { ...g }, t: state.t + 1 }
    };
  }
};

const RHO_SPEC: HyperparamSpec = {
  key: 'rho',
  label: 'Decay',
  symbol: 'ρ',
  min: 0.5,
  max: 0.999,
  step: 0.001,
  default: 0.9,
  hint: 'How slowly the squared-gradient average forgets. Higher = smoother.'
};

export const rmsprop: Optimizer = {
  id: 'rmsprop',
  name: 'RMSProp',
  description: 'AdaGrad with a forgetting average — rates recover',
  updateRuleLatex: String.raw`\mathbf{s} \leftarrow \rho \mathbf{s} + (1-\rho)(\nabla \mathcal{L})^2, \quad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \frac{\gamma}{\sqrt{\mathbf{s}} + \varepsilon} \nabla \mathcal{L}`,
  hyperparams: [RHO_SPEC],
  fixedLearningRate: 0.1,
  init: initState,
  step(params, g, state, lr, hyper) {
    const rho = hyper.rho ?? RHO_SPEC.default;
    const s = {
      a: rho * state.s.a + (1 - rho) * g.a * g.a,
      b: rho * state.s.b + (1 - rho) * g.b * g.b
    };
    return {
      params: {
        a: params.a - (lr * g.a) / (Math.sqrt(s.a) + EPS),
        b: params.b - (lr * g.b) / (Math.sqrt(s.b) + EPS)
      },
      state: { ...state, s, v: { ...g }, t: state.t + 1 }
    };
  }
};

const BETA1_SPEC: HyperparamSpec = {
  key: 'beta1',
  label: 'Momentum decay',
  symbol: 'β₁',
  min: 0,
  max: 0.999,
  step: 0.001,
  default: 0.9,
  hint: 'EMA rate of the gradient (first moment).'
};

const BETA2_SPEC: HyperparamSpec = {
  key: 'beta2',
  label: 'Scale decay',
  symbol: 'β₂',
  min: 0.8,
  max: 0.9999,
  step: 0.0001,
  default: 0.999,
  hint: 'EMA rate of the squared gradient (second moment).'
};

export const adam: Optimizer = {
  id: 'adam',
  name: 'Adam',
  description: 'Momentum + per-parameter scaling, bias-corrected',
  updateRuleLatex: String.raw`\mathbf{m} \leftarrow \beta_1 \mathbf{m} + (1{-}\beta_1) \nabla \mathcal{L}, \;\; \mathbf{s} \leftarrow \beta_2 \mathbf{s} + (1{-}\beta_2)(\nabla \mathcal{L})^2, \;\; \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \frac{\hat{\mathbf{m}}}{\sqrt{\hat{\mathbf{s}}} + \varepsilon}`,
  hyperparams: [BETA1_SPEC, BETA2_SPEC],
  fixedLearningRate: 0.1,
  init: initState,
  step(params, g, state, lr, hyper) {
    const b1 = hyper.beta1 ?? BETA1_SPEC.default;
    const b2 = hyper.beta2 ?? BETA2_SPEC.default;
    const t = state.t + 1;
    const v = {
      a: b1 * state.v.a + (1 - b1) * g.a,
      b: b1 * state.v.b + (1 - b1) * g.b
    };
    const s = {
      a: b2 * state.s.a + (1 - b2) * g.a * g.a,
      b: b2 * state.s.b + (1 - b2) * g.b * g.b
    };
    const mc1 = 1 - Math.pow(b1, t);
    const mc2 = 1 - Math.pow(b2, t);
    const mHatA = v.a / mc1;
    const mHatB = v.b / mc1;
    const sHatA = s.a / mc2;
    const sHatB = s.b / mc2;
    return {
      params: {
        a: params.a - (lr * mHatA) / (Math.sqrt(sHatA) + EPS),
        b: params.b - (lr * mHatB) / (Math.sqrt(sHatB) + EPS)
      },
      state: { v, s, t }
    };
  }
};

export const optimizers: Record<OptimizerId, Optimizer> = {
  gd: gradientDescent,
  momentum,
  nesterov,
  adagrad,
  rmsprop,
  adam
};

export const optimizerOrder: OptimizerId[] = [
  'gd',
  'momentum',
  'nesterov',
  'adagrad',
  'rmsprop',
  'adam'
];

/** Default hyperparameter values for an optimizer, keyed by spec key. */
export function defaultHyper(id: OptimizerId): Record<string, number> {
  const out: Record<string, number> = {};
  for (const spec of optimizers[id].hyperparams) {
    out[spec.key] = spec.default;
  }
  return out;
}
