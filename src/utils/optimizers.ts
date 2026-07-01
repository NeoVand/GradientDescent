/**
 * Optimizer engine.
 *
 * Every optimizer is a pure step function over a generic state record, plus
 * the metadata the UI needs to render itself: a hyperparameter spec (sliders
 * are generated from it) and a LaTeX update rule (the Formulas panel shows
 * the math for whichever optimizer is selected).
 *
 * State convention — one record fits all fourteen methods:
 *   v: velocity (momentum family) or first-moment estimate (Adam)
 *   s: squared-gradient accumulator (AdaGrad) / EMA (RMSProp, Adam)
 *   t: step count (Adam bias correction)
 * plus optional Prodigy-only bookkeeping (d, rNum, sDen, x0) documented on
 * OptimizerState below; every other method leaves those untouched.
 */

import type { ModelParameters } from '../types/types';
import { eigenSym2, type Hessian2 } from './hessian';

export type OptimizerId = 'gd' | 'momentum' | 'nesterov' | 'adagrad' | 'rmsprop' | 'adadelta' | 'adam' | 'nadam' | 'adamw' | 'radam' | 'newton' | 'sophia' | 'lion' | 'prodigy';

export interface OptimizerState {
  v: ModelParameters;
  s: ModelParameters;
  t: number;
  // --- Prodigy (parameter-free) bookkeeping; untouched by every other method ---
  d?: number; // running distance-to-solution estimate (its self-tuned rate)
  rNum?: number; // scalar numerator accumulator for d̂
  sDen?: ModelParameters; // vector denominator accumulator for d̂
  x0?: ModelParameters; // reference starting point, anchored on the first step
}

/**
 * Extra per-step context for optimizers that need more than the gradient.
 * Second-order methods (Newton, Sophia) read the local Hessian from here; the
 * trainer computes it only for optimizers that flag `usesHessian`, so the
 * first-order methods pay nothing.
 */
export interface OptimizerStepContext {
  hessian?: Hessian2;
  /** Parameter domain, so Newton can size its trust region to the landscape. */
  range?: { min: number; max: number };
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
  /** Second-order methods set this so the trainer computes a Hessian for them. */
  usesHessian?: boolean;
  init(): OptimizerState;
  step(
    params: ModelParameters,
    gradient: ModelParameters,
    state: OptimizerState,
    learningRate: number,
    hyper: Record<string, number>,
    ctx?: OptimizerStepContext
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
  hint: 'How much of the last step’s velocity carries into this one — inertia.<br/><span style="opacity:0.8;font-size:0.7rem">0 = plain gradient descent · 0.9 = heavy glide</span>'
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
  hint: 'How long it remembers recent gradient sizes when scaling each parameter’s step.<br/><span style="opacity:0.8;font-size:0.7rem">Higher = smoother, steadier per-parameter rates</span>'
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
  hint: 'How long it remembers recent gradient and step sizes — it scales each move from both.<br/><span style="opacity:0.8;font-size:0.7rem">Higher = smoother, steadier rates</span>'
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
  hint: 'How much past gradient direction is blended in — Adam’s momentum.<br/><span style="opacity:0.8;font-size:0.7rem">Higher = smoother, more inertia (0.9 is typical)</span>'
};

const BETA2_SPEC: HyperparamSpec = {
  key: 'beta2',
  label: 'Scale decay',
  symbol: 'β₂',
  min: 0.8,
  max: 0.9999,
  step: 0.0001,
  default: 0.999,
  hint: 'How steadily each parameter’s step size adapts to recent gradient sizes.<br/><span style="opacity:0.8;font-size:0.7rem">Higher = slower, smoother rate changes (0.999 is typical)</span>'
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
  hint: 'A gentle pull of every parameter toward zero each step — discourages large weights.<br/><span style="opacity:0.8;font-size:0.7rem">0 = plain Adam · acts separately from the step scaling</span>'
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

// Pure Newton, −H⁻¹∇, is unusable on the non-convex landscapes here: on a flat
// plateau H≈0 makes the step explode, and on a saddle (indefinite H) it points
// UPHILL toward the stationary point. We use the textbook robust form instead —
// a regularized / damped Newton (Levenberg–Marquardt style):
//   • shift the Hessian by τI so its smallest eigenvalue is at least `floor`.
//     H+τI is then positive-definite, so −(H+τI)⁻¹∇ is always a descent step,
//     even on a saddle, and tiny curvature can't blow it up (the step degrades
//     to gradient descent at rate 1/floor in a flat region);
//   • cap the whole step to a trust region (a fraction of the domain), so it can
//     never leap off the map even when γ = 1.
// Solving the 2×2 system directly (rather than via eigenvectors) also avoids the
// degenerate-eigenvector case when curvature is isotropic. On a convex bowl whose
// smallest curvature already exceeds the floor, τ = 0 and (trust region permitting)
// it is exactly −H⁻¹∇ again, reaching the minimum in essentially one step; on a
// shallower bowl (λmin below the floor) the shift still damps the jump.
const NEWTON_CURV_FLOOR = 0.5; // floor on the smallest eigenvalue; 1/floor is the flat-region GD rate
const NEWTON_COND_CAP = 1e-3; // relative floor, scaled by the steepest curvature, to cap anisotropy
const NEWTON_TRUST_FRAC = 0.28; // trust-region radius as a fraction of the domain span

export const newton: Optimizer = {
  id: 'newton',
  name: 'Newton',
  description: 'Second order: jump using local curvature',
  updateRuleLatex: String.raw`\boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \mathbf{H}^{-1} \nabla \mathcal{L}`,
  hyperparams: [],
  fixedLearningRate: 1.0,
  usesHessian: true,
  init: initState,
  step(params, g, state, lr, _hyper, ctx) {
    const hess = ctx?.hessian;
    let dirA: number;
    let dirB: number;
    if (hess) {
      const eig = eigenSym2(hess);
      const scale = Math.max(Math.abs(eig.lambda1), Math.abs(eig.lambda2));
      const floor = Math.max(NEWTON_CURV_FLOOR, scale * NEWTON_COND_CAP);
      // Regularize: lift the smallest eigenvalue up to `floor` so H+τI is PD.
      const tau = Math.max(0, floor - Math.min(eig.lambda1, eig.lambda2));
      const h11 = hess.h11 + tau;
      const h22 = hess.h22 + tau;
      const h12 = hess.h12;
      const det = h11 * h22 - h12 * h12; // > 0: H+τI is positive-definite
      // δ = −(H+τI)⁻¹ ∇ — a guaranteed descent step.
      dirA = -(h22 * g.a - h12 * g.b) / det;
      dirB = -(-h12 * g.a + h11 * g.b) / det;
    } else {
      // No curvature supplied: behave like (damped) gradient descent.
      dirA = -g.a;
      dirB = -g.b;
    }
    let stepA = lr * dirA;
    let stepB = lr * dirB;
    // Trust region: never move more than a fraction of the domain in one step.
    const span = ctx?.range ? ctx.range.max - ctx.range.min : 14;
    const radius = NEWTON_TRUST_FRAC * span;
    const mag = Math.hypot(stepA, stepB);
    if (mag > radius) {
      const k = radius / mag;
      stepA *= k;
      stepB *= k;
    }
    return {
      params: { a: params.a + stepA, b: params.b + stepB },
      state: { ...state, v: { ...g }, t: state.t + 1 }
    };
  }
};

// Sophia (Liu et al., 2023) — Newton's curvature idea, cut down until it fits a
// real training loop. The full N×N Hessian is hopeless at scale, so Sophia
// keeps only its DIAGONAL — one curvature number per parameter, no matrix to
// invert — and preconditions the momentum by it. The trick that makes that
// safe is the CLIP: every coordinate's update is capped at ±ρ, so where the
// diagonal curvature is tiny or noisy (and m/h would explode) the step is
// bounded, while trustworthy directions stay curvature-scaled. It trained
// GPT-class models ~2× faster than Adam by step count. State: v = momentum,
// s = EMA of the diagonal Hessian.
const SOPHIA_EPS = 1e-2;
const SOPHIA_BETA2 = 0.99; // Hessian-EMA decay — kept internal, rarely tuned

const SOPHIA_BETA1: HyperparamSpec = {
  key: 'beta1',
  label: 'Momentum decay',
  symbol: 'β₁',
  min: 0,
  max: 0.999,
  step: 0.001,
  default: 0.9,
  hint: 'How much past gradient direction is blended in — the momentum.<br/><span style="opacity:0.8;font-size:0.7rem">Higher = smoother, more inertia</span>'
};

const SOPHIA_RHO: HyperparamSpec = {
  key: 'rho',
  label: 'Clip',
  symbol: 'ρ',
  min: 0.02,
  max: 2,
  step: 0.01,
  default: 0.5,
  hint: 'Caps how far any one step can move, so a bad curvature estimate can’t throw it off.<br/><span style="opacity:0.8;font-size:0.7rem">Smaller = more cautious</span>'
};

export const sophia: Optimizer = {
  id: 'sophia',
  name: 'Sophia',
  description: 'Diagonal curvature, with clipped steps',
  updateRuleLatex: String.raw`\mathbf{m} \leftarrow \beta_1\mathbf{m} + (1{-}\beta_1)\nabla \mathcal{L}, \;\; \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\,\operatorname{clip}\!\left(\frac{\mathbf{m}}{\max(\mathbf{h},\varepsilon)},\,\rho\right)`,
  hyperparams: [SOPHIA_BETA1, SOPHIA_RHO],
  fixedLearningRate: 0.1,
  usesHessian: true,
  init: initState,
  step(params, g, state, lr, hyper, ctx) {
    const b1 = hyper.beta1 ?? SOPHIA_BETA1.default;
    const rho = hyper.rho ?? SOPHIA_RHO.default;
    const hess = ctx?.hessian;
    // Diagonal Hessian, clamped non-negative (negative curvature is no bowl to
    // descend). With no Hessian supplied, fall back to gradient² ≈ a crude
    // diagonal estimate so the method still moves.
    const hDiagA = hess ? Math.max(hess.h11, 0) : g.a * g.a;
    const hDiagB = hess ? Math.max(hess.h22, 0) : g.b * g.b;
    const m = {
      a: b1 * state.v.a + (1 - b1) * g.a,
      b: b1 * state.v.b + (1 - b1) * g.b
    };
    const h = {
      a: SOPHIA_BETA2 * state.s.a + (1 - SOPHIA_BETA2) * hDiagA,
      b: SOPHIA_BETA2 * state.s.b + (1 - SOPHIA_BETA2) * hDiagB
    };
    const clip = (z: number) => Math.max(-rho, Math.min(rho, z));
    const ua = clip(m.a / Math.max(h.a, SOPHIA_EPS));
    const ub = clip(m.b / Math.max(h.b, SOPHIA_EPS));
    return {
      params: { a: params.a - lr * ua, b: params.b - lr * ub },
      state: { v: m, s: h, t: state.t + 1 }
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
  hint: 'Balances stored momentum against the fresh gradient to pick the step direction.<br/><span style="opacity:0.8;font-size:0.7rem">Lion then steps a fixed size along that direction’s sign</span>'
};

const LION_BETA2: HyperparamSpec = {
  key: 'beta2',
  label: 'Momentum decay',
  symbol: 'β₂',
  min: 0.9,
  max: 0.9999,
  step: 0.0001,
  default: 0.99,
  hint: 'How long the momentum buffer remembers past gradients.<br/><span style="opacity:0.8;font-size:0.7rem">Higher = more inertia</span>'
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

// Prodigy (Mishchenko & Defazio, 2024) — the parameter-FREE branch: an Adam
// that estimates its OWN learning rate, so there is nothing to tune. The idea
// (from D-Adaptation) is to track d, a running lower bound on the distance from
// where you started to the solution; the right step size is about that
// distance, so once you know d you know your rate. Prodigy ramps d up from a
// tiny seed using how the gradients correlate with how far you've already
// travelled (⟨g, x₀−x⟩), and scales an Adam step by it. Watch the marker creep,
// then accelerate as d finds its level — the learning rate, discovered live.
// State: v = momentum m, s = second moment, plus d / r / s-accumulator / x₀.
//
// Two toy-scale safeguards, because d only ever GROWS: on these small non-convex
// surfaces its estimate can overshoot, and with nothing to pull it back the run
// would explode and never recover. We seed and cap d relative to the domain so
// the warmup isn't glacial (the paper's 1e-6 is tuned for billion-parameter
// nets, not two), and clip each step to a trust region so a bad ramp can't fling
// the marker off the map.
const PRODIGY_D0_FRAC = 1e-4; // seed distance as a fraction of the domain span
const PRODIGY_D_MAX_FRAC = 1.5; // cap the distance estimate at 1.5× the span
const PRODIGY_TRUST_FRAC = 0.18; // per-step cap as a fraction of the domain span

const PRODIGY_BETA1: HyperparamSpec = {
  key: 'beta1',
  label: 'Momentum decay',
  symbol: 'β₁',
  min: 0,
  max: 0.999,
  step: 0.001,
  default: 0.9,
  hint: 'How much past gradient direction is blended in — the momentum.<br/><span style="opacity:0.8;font-size:0.7rem">Higher = smoother, more inertia</span>'
};

const PRODIGY_BETA2: HyperparamSpec = {
  key: 'beta2',
  label: 'Scale decay',
  symbol: 'β₂',
  min: 0.8,
  max: 0.9999,
  step: 0.0001,
  default: 0.999,
  hint: 'How steadily the step scaling adapts — Prodigy also uses it to size its auto learning rate.<br/><span style="opacity:0.8;font-size:0.7rem">Higher = smoother, slower changes</span>'
};

export const prodigy: Optimizer = {
  id: 'prodigy',
  name: 'Prodigy',
  description: 'Parameter-free: estimates its own learning rate',
  updateRuleLatex: String.raw`d_{t+1} = \max\!\left(d_t,\, \frac{r_{t+1}}{\lVert \mathbf{s}_{t+1}\rVert_1}\right), \;\; \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, d_t\,\frac{\mathbf{m}}{\sqrt{\mathbf{v}} + d_t\varepsilon}`,
  hyperparams: [PRODIGY_BETA1, PRODIGY_BETA2],
  // Prodigy supplies its own rate via d; γ is just a base multiplier (leave 1).
  fixedLearningRate: 1.0,
  init: initState,
  step(params, g, state, lr, hyper, ctx) {
    const b1 = hyper.beta1 ?? PRODIGY_BETA1.default;
    const b2 = hyper.beta2 ?? PRODIGY_BETA2.default;
    const sb2 = Math.sqrt(b2);
    const span = ctx?.range ? ctx.range.max - ctx.range.min : 14;
    const d = state.d ?? PRODIGY_D0_FRAC * span;
    const x0 = state.x0 ?? params; // first step after a reset anchors the start
    const rPrev = state.rNum ?? 0;
    const sPrev = state.sDen ?? zero();
    // Adam-style moments, but each gradient is weighted by the distance d.
    const m = {
      a: b1 * state.v.a + (1 - b1) * d * g.a,
      b: b1 * state.v.b + (1 - b1) * d * g.b
    };
    const vv = {
      a: b2 * state.s.a + (1 - b2) * d * d * g.a * g.a,
      b: b2 * state.s.b + (1 - b2) * d * d * g.b * g.b
    };
    // Distance estimate: numerator from ⟨g, x₀−x⟩ (how far we've travelled),
    // denominator from the accumulated gradient. d only ever grows — capped here
    // at a multiple of the domain so a non-convex overshoot can't run away.
    const dot = g.a * (x0.a - params.a) + g.b * (x0.b - params.b);
    const rNum = sb2 * rPrev + (1 - sb2) * lr * d * d * dot;
    const sDen = {
      a: sb2 * sPrev.a + (1 - sb2) * lr * d * d * g.a,
      b: sb2 * sPrev.b + (1 - sb2) * lr * d * d * g.b
    };
    const sL1 = Math.abs(sDen.a) + Math.abs(sDen.b);
    const dNext = Math.min(PRODIGY_D_MAX_FRAC * span, Math.max(d, sL1 > 0 ? rNum / sL1 : d));
    // The step uses the CURRENT d (per the algorithm); the d's in m/√v cancel.
    let stepA = (lr * d * m.a) / (Math.sqrt(vv.a) + d * EPS);
    let stepB = (lr * d * m.b) / (Math.sqrt(vv.b) + d * EPS);
    // Trust region: never fling the marker more than a fraction of the domain.
    const radius = PRODIGY_TRUST_FRAC * span;
    const mag = Math.hypot(stepA, stepB);
    if (mag > radius) {
      const k = radius / mag;
      stepA *= k;
      stepB *= k;
    }
    return {
      params: { a: params.a - stepA, b: params.b - stepB },
      state: { v: m, s: vv, t: state.t + 1, d: dNext, rNum, sDen, x0 }
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
  newton,
  sophia,
  lion,
  prodigy
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
  { label: 'Sign-based', ids: ['lion'] },
  { label: 'Second-order', ids: ['newton', 'sophia'] },
  { label: 'Parameter-free', ids: ['prodigy'] }
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
