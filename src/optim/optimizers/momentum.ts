/**
 * Momentum ("heavy ball") — Polyak, 1964.
 *
 * Idea: keep a velocity that accumulates past gradients, so the consistent
 * downhill push compounds while side-to-side ravine wobble cancels out.
 * State: v (velocity), t.
 * Deviations: none — this is the framework convention v ← μv + g with the
 * step −γv (γ is NOT folded into v, matching PyTorch; note the effective
 * steady-state step is γ/(1−μ), so raising μ also strengthens the push).
 */

import type { CoreOptimizer, Vec } from '../types';
import { zeros } from '../types';
import { MU_SPEC } from '../specs';

export interface MomentumState {
  v: Vec;
  t: number;
}

export const momentum: CoreOptimizer<MomentumState> = {
  id: 'momentum',
  name: 'Momentum',
  description: 'Heavy ball: velocity accumulates past gradients',
  updateRuleLatex: String.raw`\mathbf{v} \leftarrow \mu \mathbf{v} + \nabla \mathcal{L}, \quad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \mathbf{v}`,
  hyperparams: [MU_SPEC],
  init: (d) => ({ v: zeros(d), t: 0 }),
  step(p: Vec, g: Vec, st, lr, hyper) {
    const mu = hyper.mu ?? MU_SPEC.default;
    for (let i = 0; i < p.length; i++) {
      // [eq:v] velocity: an exponentially-weighted SUM of past gradients
      st.v[i] = mu * st.v[i] + g[i];
      // [eq:step] the ball rolls along the velocity, not the raw slope
      p[i] -= lr * st.v[i];
    }
    st.t++;
  }
};
