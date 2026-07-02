/**
 * Nesterov accelerated gradient — Nesterov, 1983.
 *
 * Idea: momentum overshoots because it measures the slope where it STANDS;
 * Nesterov measures where the velocity is about to carry it — look before
 * you leap.
 * State: v (velocity), t.
 * Deviations: none — this is the framework-style reformulation (as in
 * PyTorch): the parameter step blends the current gradient with the updated
 * velocity, equivalent to evaluating the gradient at the look-ahead point
 * under a change of variables.
 */

import type { CoreOptimizer, Vec } from '../types';
import { zeros } from '../types';
import { MU_SPEC } from '../specs';

export interface NesterovState {
  v: Vec;
  t: number;
}

export const nesterov: CoreOptimizer<NesterovState> = {
  id: 'nesterov',
  name: 'Nesterov',
  description: 'Momentum with a look-ahead correction',
  updateRuleLatex: String.raw`\mathbf{v} \leftarrow \mu \mathbf{v} + \nabla \mathcal{L}, \quad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma (\nabla \mathcal{L} + \mu \mathbf{v})`,
  hyperparams: [MU_SPEC],
  init: (d) => ({ v: zeros(d), t: 0 }),
  step(p: Vec, g: Vec, st, lr, hyper) {
    const mu = hyper.mu ?? MU_SPEC.default;
    for (let i = 0; i < p.length; i++) {
      // [eq:v] same velocity as plain momentum
      st.v[i] = mu * st.v[i] + g[i];
      // [eq:step] the look-ahead: step along gradient PLUS μ·(new velocity)
      p[i] -= lr * (g[i] + mu * st.v[i]);
    }
    st.t++;
  }
};
