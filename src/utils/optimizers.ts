/**
 * Optimizer engine.
 *
 * Every optimizer is a pure step function over a generic state record, plus
 * the metadata the UI needs to render itself: a hyperparameter spec (sliders
 * are generated from it) and a LaTeX update rule (the Formulas panel shows
 * the math for whichever optimizer is selected).
 *
 * State convention — one record fits all seven methods:
 *   v: velocity (momentum family) or first-moment estimate (Adam)
 *   s: squared-gradient accumulator (AdaGrad) / EMA (RMSProp, Adam)
 *   t: step count (Adam bias correction)
 */

import type { ModelParameters } from '../types/types';

export type OptimizerId = 'gd' | 'momentum' | 'nesterov' | 'adagrad' | 'rmsprop' | 'adadelta' | 'adam' | 'nadam' | 'adamw' | 'radam' | 'lion';

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

// AdaDelta (Zeiler, 2012) — RMSProp's sibling, born the same year to fix the
// same AdaGrad flaw, but it goes one step further and removes the learning
// rate ENTIRELY. The trick is a units argument: a plain gradient step has the
// wrong units (∝ ∇, not θ). AdaDelta multiplies by RMS[Δθ]/RMS[g] — a running
// memory of its OWN past step sizes over the RMS gradient — so the ratio is
// dimensionless and the step inherits θ's units. There is nothing to tune but
// the decay ρ. We keep the app's γ as a plain global gain (leave it at 1).
// State reuse: s = E[g²] (running mean square of gradients), v = E[Δθ²]
// (running mean square of updates — there's no velocity here to collide with).
// ε also floors the very first step (when E[Δθ²]=0): the canonical 1e-6 is
// authentic but warms up too slowly for this toy's short runs, so we use 1e-4
// — still a legitimate AdaDelta ε, but it descends visibly within a run.
const ADADELTA_EPS = 1e-4;

const ADADELTA_RHO: HyperparamSpec = {
  key: 'rho',
  label: 'Decay',
  symbol: 'ρ',
  min: 0.5,
  max: 0.999,
  step: 0.001,
  default: 0.95,
  hint: 'How slowly both running averages — of squared gradients and squared updates — forget.'
};

export const adadelta: Optimizer = {
  id: 'adadelta',
  name: 'AdaDelta',
  description: 'RMSProp with no learning rate — the units fix themselves',
  updateRuleLatex: String.raw`\mathbf{s} \leftarrow \rho \mathbf{s} + (1{-}\rho)(\nabla \mathcal{L})^2, \;\; \Delta\boldsymbol{\theta} = -\frac{\sqrt{\mathbf{u} + \varepsilon}}{\sqrt{\mathbf{s} + \varepsilon}}\,\nabla \mathcal{L}, \;\; \mathbf{u} \leftarrow \rho \mathbf{u} + (1{-}\rho)\Delta\boldsymbol{\theta}^2, \;\; \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} + \gamma\,\Delta\boldsymbol{\theta}`,
  hyperparams: [ADADELTA_RHO],
  // No learning rate of its own; γ is just a global gain. Default it to 1.
  fixedLearningRate: 1.0,
  init: initState,
  step(params, g, state, lr, hyper) {
    const rho = hyper.rho ?? ADADELTA_RHO.default;
    const s = {
      a: rho * state.s.a + (1 - rho) * g.a * g.a,
      b: rho * state.s.b + (1 - rho) * g.b * g.b
    };
    // u carries E[Δθ²] from the PREVIOUS step — the numerator's memory.
    const u = state.v;
    const da = -(Math.sqrt(u.a + ADADELTA_EPS) / Math.sqrt(s.a + ADADELTA_EPS)) * g.a;
    const db = -(Math.sqrt(u.b + ADADELTA_EPS) / Math.sqrt(s.b + ADADELTA_EPS)) * g.b;
    const v = {
      a: rho * u.a + (1 - rho) * da * da,
      b: rho * u.b + (1 - rho) * db * db
    };
    return {
      params: { a: params.a + lr * da, b: params.b + lr * db },
      state: { v, s, t: state.t + 1 }
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

// Nadam (Dozat, 2016) — Adam with Nesterov's look-ahead folded into the first
// moment. Adam steps along the bias-corrected momentum m̂; Nadam steps along a
// blend nudged toward where the momentum is HEADING — the same "measure ahead
// of yourself" trick Nesterov played on plain momentum, now inside Adam's
// adaptive scaling. Same two decays as Adam, same fixed γ.
export const nadam: Optimizer = {
  id: 'nadam',
  name: 'Nadam',
  description: 'Adam with Nesterov look-ahead on the momentum',
  updateRuleLatex: String.raw`\bar{\mathbf{m}} = \beta_1 \hat{\mathbf{m}} + \frac{(1{-}\beta_1)\nabla \mathcal{L}}{1-\beta_1^t}, \quad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \frac{\bar{\mathbf{m}}}{\sqrt{\hat{\mathbf{s}}} + \varepsilon}`,
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
    // Nesterov-blended first moment: the bias-corrected momentum m̂ = v/mc1,
    // leaned toward the fresh (bias-corrected) gradient.
    const mBarA = b1 * (v.a / mc1) + ((1 - b1) * g.a) / mc1;
    const mBarB = b1 * (v.b / mc1) + ((1 - b1) * g.b) / mc1;
    const sHatA = s.a / mc2;
    const sHatB = s.b / mc2;
    return {
      params: {
        a: params.a - (lr * mBarA) / (Math.sqrt(sHatA) + EPS),
        b: params.b - (lr * mBarB) / (Math.sqrt(sHatB) + EPS)
      },
      state: { v, s, t }
    };
  }
};

// AdamW (Loshchilov & Hutter, 2017) — the optimizer almost every large model
// actually trains with. "Weight decay" pulls parameters toward zero to curb
// overfitting. Plain Adam added that pull to the gradient, where the adaptive
// √ŝ scaling then warped it; AdamW DECOUPLES it — the λθ term hits θ directly,
// outside the scaling. Honest caveat for this playground: the toy losses have
// no overfitting to regularize, so λ shows up as a literal, visible pull of
// the marker toward the origin rather than a generalization aid. At λ=0 it is
// bit-for-bit Adam.
const ADAMW_WD: HyperparamSpec = {
  key: 'wd',
  label: 'Weight decay',
  symbol: 'λ',
  min: 0,
  max: 0.3,
  step: 0.005,
  default: 0.1,
  hint: 'Decoupled pull toward the origin each step, applied outside the adaptive scaling. 0 = plain Adam.'
};

export const adamw: Optimizer = {
  id: 'adamw',
  name: 'AdamW',
  description: 'Adam with decoupled weight decay — the real default',
  updateRuleLatex: String.raw`\boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\left(\frac{\hat{\mathbf{m}}}{\sqrt{\hat{\mathbf{s}}} + \varepsilon} + \lambda\,\boldsymbol{\theta}\right)`,
  hyperparams: [BETA1_SPEC, BETA2_SPEC, ADAMW_WD],
  fixedLearningRate: 0.1,
  init: initState,
  step(params, g, state, lr, hyper) {
    const b1 = hyper.beta1 ?? BETA1_SPEC.default;
    const b2 = hyper.beta2 ?? BETA2_SPEC.default;
    const wd = hyper.wd ?? ADAMW_WD.default;
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
        // Adam's adaptive step PLUS a decoupled decay γλθ toward the origin,
        // independent of the gradient — the whole point of the "W".
        a: params.a - lr * (mHatA / (Math.sqrt(sHatA) + EPS) + wd * params.a),
        b: params.b - lr * (mHatB / (Math.sqrt(sHatB) + EPS) + wd * params.b)
      },
      state: { v, s, t }
    };
  }
};

// RAdam (Liu et al., 2019) — "Rectified Adam". Adam's adaptive step has wild
// variance in the first handful of updates — too few squared-gradient samples
// to trust √ŝ — which is exactly why Adam usually needs a hand-tuned warmup.
// RAdam measures how trustworthy that variance is (ρ_t) and, until it crosses a
// threshold, skips the adaptive scaling entirely and takes a plain momentum
// step: an automatic warmup with nothing to tune. Once ρ_t is large enough it
// switches on a variance-rectified adaptive step (factor r_t) that ramps
// smoothly up to ordinary Adam. Same two decays, same fixed γ.
export const radam: Optimizer = {
  id: 'radam',
  name: 'RAdam',
  description: 'Adam with a built-in, automatic warmup',
  updateRuleLatex: String.raw`\rho_t = \rho_\infty - \frac{2t\,\beta_2^{t}}{1-\beta_2^{t}}, \quad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, r_t\,\frac{\hat{\mathbf{m}}}{\sqrt{\hat{\mathbf{s}}} + \varepsilon}\;\;(\rho_t > 4),\;\; \text{else}\; -\gamma\,\hat{\mathbf{m}}`,
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
    const mHatA = v.a / mc1;
    const mHatB = v.b / mc1;
    // ρ∞ = max length of the SMA approximated by the second moment; ρ_t is its
    // value at step t. Below ~4 the variance is untrustworthy → momentum SGD.
    const rhoInf = 2 / (1 - b2) - 1;
    const rhoT = rhoInf - (2 * t * Math.pow(b2, t)) / (1 - Math.pow(b2, t));
    let stepA: number;
    let stepB: number;
    if (rhoT > 4) {
      const mc2 = 1 - Math.pow(b2, t);
      const sHatA = Math.sqrt(s.a / mc2);
      const sHatB = Math.sqrt(s.b / mc2);
      // Variance-rectification factor: ramps from small toward 1 as ρ_t → ρ∞.
      const rt = Math.sqrt(
        ((rhoT - 4) * (rhoT - 2) * rhoInf) / ((rhoInf - 4) * (rhoInf - 2) * rhoT)
      );
      stepA = (rt * mHatA) / (sHatA + EPS);
      stepB = (rt * mHatB) / (sHatB + EPS);
    } else {
      // Warmup phase: plain momentum step, no adaptive scaling.
      stepA = mHatA;
      stepB = mHatB;
    }
    return {
      params: { a: params.a - lr * stepA, b: params.b - lr * stepB },
      state: { v, s, t }
    };
  }
};

// Lion (Chen et al., 2023) — "EvoLved Sign Momentum". The update direction is
// the SIGN of a momentum/gradient blend, so every step has the SAME magnitude γ
// on each axis no matter how steep the slope. That makes it strikingly distinct
// on the landscape — a constant-stride staircase rather than the smooth, slope-
// scaled curves of the other methods — and very light (one momentum buffer, no
// squared-gradient term). Two decays: β₁ sets the step DIRECTION (mostly
// momentum, a little fresh gradient), β₂ is the slower memory of the momentum
// buffer itself. We drop the paper's decoupled weight decay — this app's loss
// has no regularizer for it to act on.
const LION_BETA1: HyperparamSpec = {
  key: 'beta1',
  label: 'Direction blend',
  symbol: 'β₁',
  min: 0,
  max: 0.999,
  step: 0.001,
  default: 0.9,
  hint: 'Momentum vs. fresh gradient that sets the step direction (only its sign is used).'
};

const LION_BETA2: HyperparamSpec = {
  key: 'beta2',
  label: 'Momentum decay',
  symbol: 'β₂',
  min: 0.9,
  max: 0.9999,
  step: 0.0001,
  default: 0.99,
  hint: 'How slowly the momentum buffer forgets past gradients.'
};

export const lion: Optimizer = {
  id: 'lion',
  name: 'Lion',
  description: 'Sign of momentum: fixed-size steps, very light',
  updateRuleLatex: String.raw`\mathbf{c} \leftarrow \beta_1 \mathbf{m} + (1{-}\beta_1)\nabla\mathcal{L}, \;\; \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\,\operatorname{sign}(\mathbf{c}), \;\; \mathbf{m} \leftarrow \beta_2 \mathbf{m} + (1{-}\beta_2)\nabla\mathcal{L}`,
  hyperparams: [LION_BETA1, LION_BETA2],
  fixedLearningRate: 0.05,
  init: initState,
  step(params, g, state, lr, hyper) {
    const b1 = hyper.beta1 ?? LION_BETA1.default;
    const b2 = hyper.beta2 ?? LION_BETA2.default;
    const m = state.v;
    // Step direction: sign of the (mostly-momentum) blend — magnitude is always γ.
    const ca = b1 * m.a + (1 - b1) * g.a;
    const cb = b1 * m.b + (1 - b1) * g.b;
    // Momentum buffer updates with its own, slower decay and the fresh gradient.
    const v = {
      a: b2 * m.a + (1 - b2) * g.a,
      b: b2 * m.b + (1 - b2) * g.b
    };
    return {
      params: {
        a: params.a - lr * Math.sign(ca),
        b: params.b - lr * Math.sign(cb)
      },
      state: { ...state, v, t: state.t + 1 }
    };
  }
};

export const optimizers: Record<OptimizerId, Optimizer> = {
  gd: gradientDescent,
  momentum,
  nesterov,
  adagrad,
  rmsprop,
  adadelta,
  adam,
  nadam,
  adamw,
  radam,
  lion
};

/**
 * Presentation taxonomy for the optimizer picker: short section labels that
 * also drive the dropdown's labelled dividers (mirroring the problem picker).
 * `optimizerOrder` is derived from this, so the flat order and the grouped
 * view can never drift apart.
 */
export const optimizerGroups: { label: string; ids: OptimizerId[] }[] = [
  { label: 'Baseline', ids: ['gd'] },
  { label: 'Momentum', ids: ['momentum', 'nesterov'] },
  { label: 'Adaptive rates', ids: ['adagrad', 'rmsprop', 'adadelta'] },
  { label: 'Adam family', ids: ['adam', 'nadam', 'adamw', 'radam'] },
  { label: 'Sign-based', ids: ['lion'] }
];

export const optimizerOrder: OptimizerId[] = optimizerGroups.flatMap(g => g.ids);

/** Default hyperparameter values for an optimizer, keyed by spec key. */
export function defaultHyper(id: OptimizerId): Record<string, number> {
  const out: Record<string, number> = {};
  for (const spec of optimizers[id].hyperparams) {
    out[spec.key] = spec.default;
  }
  return out;
}
