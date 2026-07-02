/**
 * Nadam — Dozat, 2016 ("Incorporating Nesterov Momentum into Adam").
 *
 * Idea: play Nesterov's look-ahead trick INSIDE Adam — step along a blend
 * leaned toward where the momentum is heading, then divide by the same
 * adaptive scale.
 * State: m, v, t (identical to Adam's).
 * Deviations: the simplified Dozat form without the μₜ product schedule —
 * the common framework variant. Its very first step is ≈ (1+β₁)γ, nearly
 * double Adam's.
 */

import type { CoreOptimizer, Vec } from '../types';
import { EPS, zeros } from '../types';
import { BETA1_SPEC, BETA2_SPEC } from '../specs';

export interface NadamState {
  m: Vec;
  v: Vec;
  t: number;
}

export const nadam: CoreOptimizer<NadamState> = {
  id: 'nadam',
  name: 'Nadam',
  description: 'Adam with Nesterov look-ahead on the momentum',
  updateRuleLatex: String.raw`\bar{\mathbf{m}} = \beta_1 \hat{\mathbf{m}} + \frac{(1{-}\beta_1)\nabla \mathcal{L}}{1-\beta_1^t}, \quad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \frac{\bar{\mathbf{m}}}{\sqrt{\hat{\mathbf{s}}} + \varepsilon}`,
  hyperparams: [BETA1_SPEC, BETA2_SPEC],
  fixedLearningRate: 0.1,
  init: (d) => ({ m: zeros(d), v: zeros(d), t: 0 }),
  step(p: Vec, g: Vec, st, lr, hyper) {
    const b1 = hyper.beta1 ?? BETA1_SPEC.default;
    const b2 = hyper.beta2 ?? BETA2_SPEC.default;
    const t = ++st.t;
    const mc1 = 1 - Math.pow(b1, t);
    const mc2 = 1 - Math.pow(b2, t);
    for (let i = 0; i < p.length; i++) {
      // [eq:m] Adam's two moments, unchanged
      st.m[i] = b1 * st.m[i] + (1 - b1) * g[i];
      st.v[i] = b2 * st.v[i] + (1 - b2) * g[i] * g[i];
      // [eq:blend] the look-ahead: corrected momentum leaned toward the
      // fresh (also corrected) gradient — Nesterov, inside Adam
      const mBar = b1 * (st.m[i] / mc1) + ((1 - b1) * g[i]) / mc1;
      const vHat = st.v[i] / mc2;
      // [eq:step]
      p[i] -= (lr * mBar) / (Math.sqrt(vHat) + EPS);
    }
  }
};
