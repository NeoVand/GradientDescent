/**
 * Gradient Descent — Cauchy, 1847.
 *
 * Idea: measure the slope, step the other way. The move everything else in
 * this library is built on, repaired, or reacting to.
 * State: only the step counter.
 * Deviations from the textbook update: none.
 */

import type { CoreOptimizer, Vec } from '../types';

export interface GdState {
  t: number;
}

export const gd: CoreOptimizer<GdState> = {
  id: 'gd',
  name: 'Gradient Descent',
  description: 'Step straight down the gradient',
  updateRuleLatex: String.raw`\boldsymbol{\theta}^{(t+1)} \leftarrow \boldsymbol{\theta}^{(t)} - \gamma\, \nabla \mathcal{L}`,
  hyperparams: [],
  init: () => ({ t: 0 }),
  step(p: Vec, g: Vec, st, lr) {
    // [eq:step] θ ← θ − γ∇ℒ — the whole algorithm.
    for (let i = 0; i < p.length; i++) {
      p[i] -= lr * g[i];
    }
    st.t++;
  }
};
