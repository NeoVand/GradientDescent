/**
 * AdamW — Loshchilov & Hutter, 2019 (arXiv:1711.05101).
 *
 * Idea: weight decay pulls parameters toward zero to curb overfitting.
 * Plain Adam folded that pull into the gradient, where the adaptive √v̂
 * scaling warped it; AdamW DECOUPLES it — the λθ term hits θ directly,
 * outside the scaling. At λ = 0 it is bit-for-bit Adam.
 * State: m, v, t.
 * Deviations: PyTorch semantics — the decay is multiplied by γ (θ ← θ −
 * γ(… + λθ)), so effective decay scales with the learning rate; the paper's
 * schedule-normalized form differs by that factor.
 */

import type { CoreOptimizer, HyperparamSpec, Vec } from '../types';
import { EPS, zeros } from '../types';
import { BETA1_SPEC, BETA2_SPEC } from '../specs';

const ADAMW_WD: HyperparamSpec = {
  key: 'wd',
  label: 'Weight decay',
  symbol: 'λ',
  min: 0,
  max: 0.3,
  step: 0.005,
  default: 0.1,
  hint: 'A gentle pull of every parameter toward zero each step — discourages large weights.',
  hintDetail: '0 = plain Adam · acts separately from the step scaling'
};

export interface AdamwState {
  m: Vec;
  v: Vec;
  t: number;
}

export const adamw: CoreOptimizer<AdamwState> = {
  id: 'adamw',
  name: 'AdamW',
  description: 'Adam with decoupled weight decay — the real default',
  updateRuleLatex: String.raw`\begin{aligned}&\mathbf{m} \leftarrow \beta_1 \mathbf{m} + (1-\beta_1)\,\nabla \mathcal{L} \\[2pt] &\mathbf{s} \leftarrow \beta_2 \mathbf{s} + (1-\beta_2)(\nabla \mathcal{L})^2 \\[2pt] &\boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\left(\frac{\hat{\mathbf{m}}}{\sqrt{\hat{\mathbf{s}}} + \varepsilon} + \lambda\,\boldsymbol{\theta}\right)\end{aligned}`,
  hyperparams: [BETA1_SPEC, BETA2_SPEC, ADAMW_WD],
  fixedLearningRate: 0.1,
  init: (d) => ({ m: zeros(d), v: zeros(d), t: 0 }),
  step(p: Vec, g: Vec, st, lr, hyper) {
    const b1 = hyper.beta1 ?? BETA1_SPEC.default;
    const b2 = hyper.beta2 ?? BETA2_SPEC.default;
    const wd = hyper.wd ?? ADAMW_WD.default;
    const t = ++st.t;
    const mc1 = 1 - Math.pow(b1, t);
    const mc2 = 1 - Math.pow(b2, t);
    for (let i = 0; i < p.length; i++) {
      // [eq:m] Adam's moments, untouched by the decay — that's the point
      st.m[i] = b1 * st.m[i] + (1 - b1) * g[i];
      st.v[i] = b2 * st.v[i] + (1 - b2) * g[i] * g[i];
      const mHat = st.m[i] / mc1;
      const vHat = st.v[i] / mc2;
      // [eq:step] the adaptive step PLUS a decoupled γλθ pull toward zero,
      // independent of the gradient — the whole meaning of the "W"
      p[i] -= lr * (mHat / (Math.sqrt(vHat) + EPS) + wd * p[i]);
    }
  }
};
