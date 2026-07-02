/**
 * RMSProp — Tieleman & Hinton, 2012 (Coursera lecture 6.5; never formally
 * published — the world cites a slide).
 *
 * Idea: AdaGrad's ever-growing memory chokes long runs. Let it FORGET: swap
 * the growing sum for an exponential moving average of squared gradients,
 * and the per-parameter step size stays alive on long non-convex problems.
 * State: s (EMA of squared gradients), t.
 * Deviations: ε outside the root (PyTorch placement).
 */

import type { CoreOptimizer, Vec } from '../types';
import { EPS, zeros } from '../types';
import { RHO_SPEC } from '../specs';

export interface RmspropState {
  s: Vec;
  t: number;
}

export const rmsprop: CoreOptimizer<RmspropState> = {
  id: 'rmsprop',
  name: 'RMSProp',
  description: 'AdaGrad with a forgetting average — rates recover',
  updateRuleLatex: String.raw`\mathbf{s} \leftarrow \rho \mathbf{s} + (1-\rho)(\nabla \mathcal{L})^2, \quad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \frac{\gamma}{\sqrt{\mathbf{s}} + \varepsilon} \nabla \mathcal{L}`,
  hyperparams: [RHO_SPEC],
  fixedLearningRate: 0.1,
  init: (d) => ({ s: zeros(d), t: 0 }),
  step(p: Vec, g: Vec, st, lr, hyper) {
    const rho = hyper.rho ?? RHO_SPEC.default;
    for (let i = 0; i < p.length; i++) {
      // [eq:s] the leaky memory: old sizes fade at rate ρ
      st.s[i] = rho * st.s[i] + (1 - rho) * g[i] * g[i];
      // [eq:step] same per-parameter division as AdaGrad — now it can recover
      p[i] -= (lr * g[i]) / (Math.sqrt(st.s[i]) + EPS);
    }
    st.t++;
  }
};
