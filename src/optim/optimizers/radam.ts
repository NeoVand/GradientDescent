/**
 * RAdam ("Rectified Adam") — Liu et al., 2020 (arXiv:1908.03265).
 *
 * Idea: Adam's adaptive scale is pure noise in the first handful of steps —
 * too few squared-gradient samples to trust — which is why Adam usually
 * needs a hand-tuned warmup. RAdam computes how trustworthy the variance is
 * (ρ_t, with ρ_∞ = 2/(1−β₂) − 1) and, below the threshold ρ_t ≤ 4, takes a
 * plain momentum step; above it, a variance-rectified adaptive step (r_t)
 * that ramps smoothly up to ordinary Adam. Warmup, derived instead of
 * guessed.
 * State: m, v, t.
 * Deviations: none.
 */

import type { CoreOptimizer, Vec } from '../types';
import { EPS, zeros } from '../types';
import { BETA1_SPEC, BETA2_SPEC } from '../specs';

export interface RadamState {
  m: Vec;
  v: Vec;
  t: number;
}

export const radam: CoreOptimizer<RadamState> = {
  id: 'radam',
  name: 'RAdam',
  description: 'Adam with a built-in, automatic warmup',
  updateRuleLatex: String.raw`\begin{aligned}&\mathbf{m} \leftarrow \beta_1 \mathbf{m} + (1-\beta_1)\,\nabla \mathcal{L} \\[2pt] &\mathbf{s} \leftarrow \beta_2 \mathbf{s} + (1-\beta_2)(\nabla \mathcal{L})^2 \\[2pt] &\boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, r_t\,\frac{\hat{\mathbf{m}}}{\sqrt{\hat{\mathbf{s}}} + \varepsilon}\end{aligned}`,
  hyperparams: [BETA1_SPEC, BETA2_SPEC],
  fixedLearningRate: 0.1,
  init: (d) => ({ m: zeros(d), v: zeros(d), t: 0 }),
  step(p: Vec, g: Vec, st, lr, hyper) {
    const b1 = hyper.beta1 ?? BETA1_SPEC.default;
    const b2 = hyper.beta2 ?? BETA2_SPEC.default;
    const t = ++st.t;
    const mc1 = 1 - Math.pow(b1, t);
    // [eq:rho] how many effective samples the variance estimate holds so far
    const rhoInf = 2 / (1 - b2) - 1;
    const rhoT = rhoInf - (2 * t * Math.pow(b2, t)) / (1 - Math.pow(b2, t));
    const adaptive = rhoT > 4;
    let rt = 1;
    let mc2 = 1;
    if (adaptive) {
      mc2 = 1 - Math.pow(b2, t);
      // [eq:rect] the rectification factor: ramps toward 1 as ρ_t → ρ_∞
      rt = Math.sqrt(((rhoT - 4) * (rhoT - 2) * rhoInf) / ((rhoInf - 4) * (rhoInf - 2) * rhoT));
    }
    for (let i = 0; i < p.length; i++) {
      st.m[i] = b1 * st.m[i] + (1 - b1) * g[i];
      st.v[i] = b2 * st.v[i] + (1 - b2) * g[i] * g[i];
      const mHat = st.m[i] / mc1;
      if (adaptive) {
        // [eq:step] variance is trustworthy: rectified adaptive step
        const sHat = Math.sqrt(st.v[i] / mc2);
        p[i] -= (lr * rt * mHat) / (sHat + EPS);
      } else {
        // [eq:warmup] too early to trust √v̂ — plain momentum, no scaling
        p[i] -= lr * mHat;
      }
    }
  }
};
