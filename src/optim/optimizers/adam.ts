/**
 * Adam — Kingma & Ba, 2015 (arXiv:1412.6980).
 *
 * Idea: the merger. Momentum's moving average of gradients (β₁) AND
 * RMSProp's moving average of squared gradients (β₂), used together. Both
 * averages start at zero and read too low at first, so each is divided by
 * (1 − βᵗ) — the bias correction.
 * State: m (first moment), v (second moment), t.
 * Deviations: ε outside the root (√v̂ + ε, as in the paper and PyTorch).
 */

import type { CoreOptimizer, Vec } from '../types';
import { EPS, zeros } from '../types';
import { BETA1_SPEC, BETA2_SPEC } from '../specs';

export interface AdamState {
  m: Vec;
  v: Vec;
  t: number;
}

export const adam: CoreOptimizer<AdamState> = {
  id: 'adam',
  name: 'Adam',
  description: 'Momentum + per-parameter scaling, bias-corrected',
  updateRuleLatex: String.raw`\begin{aligned}&\mathbf{m} \leftarrow \beta_1 \mathbf{m} + (1-\beta_1)\,\nabla \mathcal{L} \\[2pt] &\mathbf{s} \leftarrow \beta_2 \mathbf{s} + (1-\beta_2)(\nabla \mathcal{L})^2 \\[2pt] &\boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \frac{\hat{\mathbf{m}}}{\sqrt{\hat{\mathbf{s}}} + \varepsilon}\end{aligned}`,
  hyperparams: [BETA1_SPEC, BETA2_SPEC],
  fixedLearningRate: 0.1,
  init: (d) => ({ m: zeros(d), v: zeros(d), t: 0 }),
  step(p: Vec, g: Vec, st, lr, hyper) {
    const b1 = hyper.beta1 ?? BETA1_SPEC.default;
    const b2 = hyper.beta2 ?? BETA2_SPEC.default;
    const t = ++st.t;
    // [eq:corr] bias corrections: young averages read low by exactly (1 − βᵗ)
    const mc1 = 1 - Math.pow(b1, t);
    const mc2 = 1 - Math.pow(b2, t);
    for (let i = 0; i < p.length; i++) {
      // [eq:m] first moment — the momentum half
      st.m[i] = b1 * st.m[i] + (1 - b1) * g[i];
      // [eq:v] second moment — the per-parameter-scale half
      st.v[i] = b2 * st.v[i] + (1 - b2) * g[i] * g[i];
      // [eq:step] corrected momentum over corrected scale
      const mHat = st.m[i] / mc1;
      const vHat = st.v[i] / mc2;
      p[i] -= (lr * mHat) / (Math.sqrt(vHat) + EPS);
    }
  }
};
