/**
 * AdaDelta — Zeiler, 2012 (arXiv:1212.5701).
 *
 * Idea: RMSProp's step g/RMS[g] is dimensionless, which is exactly why it
 * still needs a unit-carrying γ. AdaDelta multiplies by RMS of its OWN past
 * steps, handing the update θ's units — and the learning rate falls out of
 * the algorithm entirely. Nothing to tune but the decay ρ.
 * State: sG = E[g²], sX = E[Δθ²], t.
 * Deviations: ε = 1e-4 instead of Zeiler's 1e-6 — ε floors the very first
 * step (when E[Δθ²] = 0), and the canonical value warms up too slowly for
 * this lab's short runs. Still a legitimate AdaDelta ε. γ is kept as a plain
 * global gain (default 1 = the paper's algorithm).
 */

import type { CoreOptimizer, Vec } from '../types';
import { zeros } from '../types';
import type { HyperparamSpec } from '../types';

const ADADELTA_EPS = 1e-4;

const ADADELTA_RHO: HyperparamSpec = {
  key: 'rho',
  label: 'Decay',
  symbol: 'ρ',
  min: 0.5,
  max: 0.999,
  step: 0.001,
  default: 0.95,
  hint: 'How long it remembers recent gradient and step sizes — it scales each move from both.',
  hintDetail: 'Higher = smoother, steadier rates'
};

export interface AdadeltaState {
  /** E[g²] — running mean square of gradients (the denominator's memory). */
  sG: Vec;
  /** E[Δθ²] — running mean square of its own updates (the numerator's). */
  sX: Vec;
  t: number;
}

export const adadelta: CoreOptimizer<AdadeltaState> = {
  id: 'adadelta',
  name: 'AdaDelta',
  description: 'RMSProp with no learning rate — the units fix themselves',
  updateRuleLatex: String.raw`\begin{aligned}&\mathbf{s} \leftarrow \rho\,\mathbf{s} + (1-\rho)(\nabla \mathcal{L})^2 \\[2pt] &\Delta\boldsymbol{\theta} = -\frac{\sqrt{\mathbf{u}+\varepsilon}}{\sqrt{\mathbf{s}+\varepsilon}}\,\nabla \mathcal{L} \\[2pt] &\mathbf{u} \leftarrow \rho\,\mathbf{u} + (1-\rho)\,\Delta\boldsymbol{\theta}^2, \quad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} + \gamma\,\Delta\boldsymbol{\theta}\end{aligned}`,
  hyperparams: [ADADELTA_RHO],
  fixedLearningRate: 1.0,
  init: (d) => ({ sG: zeros(d), sX: zeros(d), t: 0 }),
  step(p: Vec, g: Vec, st, lr, hyper) {
    const rho = hyper.rho ?? ADADELTA_RHO.default;
    for (let i = 0; i < p.length; i++) {
      // [eq:s] denominator memory: E[g²], the RMSProp part
      st.sG[i] = rho * st.sG[i] + (1 - rho) * g[i] * g[i];
      // [eq:dx] the step, sized by the ratio of the two memories — RMS[Δθ]
      // over RMS[g] gives it θ's own units, so no γ is needed
      const dx = -(Math.sqrt(st.sX[i] + ADADELTA_EPS) / Math.sqrt(st.sG[i] + ADADELTA_EPS)) * g[i];
      // [eq:u] numerator memory: E[Δθ²] of the UNSCALED update
      st.sX[i] = rho * st.sX[i] + (1 - rho) * dx * dx;
      p[i] += lr * dx;
    }
    st.t++;
  }
};
