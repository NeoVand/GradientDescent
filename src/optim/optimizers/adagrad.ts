/**
 * AdaGrad — Duchi, Hazan & Singer, 2011 (JMLR 12).
 *
 * Idea: give every parameter its own learning rate by dividing its step by
 * the size of its own gradient history — busy coordinates calm down, quiet
 * ones stay bold. The history is a SUM, so it only grows: AdaGrad's gift on
 * sparse problems and its slow strangulation everywhere else.
 * State: s (sum of squared gradients), t.
 * Deviations: ε sits outside the root (γ·g/(√s + ε), PyTorch placement).
 */

import type { CoreOptimizer, Vec } from '../types';
import { EPS, zeros } from '../types';

export interface AdagradState {
  s: Vec;
  t: number;
}

export const adagrad: CoreOptimizer<AdagradState> = {
  id: 'adagrad',
  name: 'AdaGrad',
  description: 'Per-parameter rates shrink with accumulated gradient',
  updateRuleLatex: String.raw`\mathbf{s} \leftarrow \mathbf{s} + (\nabla \mathcal{L})^2, \quad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \frac{\gamma}{\sqrt{\mathbf{s}} + \varepsilon} \nabla \mathcal{L}`,
  hyperparams: [],
  fixedLearningRate: 0.1,
  init: (d) => ({ s: zeros(d), t: 0 }),
  step(p: Vec, g: Vec, st, lr) {
    for (let i = 0; i < p.length; i++) {
      // [eq:s] the ever-growing memory: sum of squared gradients
      st.s[i] += g[i] * g[i];
      // [eq:step] each coordinate divided by ITS OWN history
      p[i] -= (lr * g[i]) / (Math.sqrt(st.s[i]) + EPS);
    }
    st.t++;
  }
};
