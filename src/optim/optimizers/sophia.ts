/**
 * Sophia — Liu et al., 2023 (arXiv:2305.14342).
 *
 * Idea: keep Newton's curvature but only what a training loop can afford —
 * the DIAGONAL, one bending per parameter, no matrix to invert. Precondition
 * the momentum by it, then CLIP each coordinate's move at ±ρ so a tiny or
 * noisy curvature estimate can't explode the step.
 * State: m (momentum), h (EMA of diagonal curvature), t.
 * Deviations: the caller supplies exact curvature (this lab hands it the
 * finite-difference Hessian every step); the paper estimates the diagonal
 * stochastically (Hutchinson / Gauss–Newton–Bartlett) and refreshes it only
 * every k ≈ 10 steps. ε = 1e-2 and the internal β₂ = 0.99 follow the paper's
 * scale of magnitude. With neither ctx.hessian nor ctx.hessianDiag, falls
 * back to g² as a crude diagonal estimate so the method still moves.
 */

import type { CoreOptimizer, HyperparamSpec, Vec } from '../types';
import { zeros } from '../types';

const SOPHIA_EPS = 1e-2;
const SOPHIA_BETA2 = 0.99; // Hessian-EMA decay — kept internal, rarely tuned

const SOPHIA_BETA1: HyperparamSpec = {
  key: 'beta1',
  label: 'Momentum decay',
  symbol: 'β₁',
  min: 0,
  max: 0.999,
  step: 0.001,
  default: 0.9,
  hint: 'How much past gradient direction is blended in — the momentum.',
  hintDetail: 'Higher = smoother, more inertia'
};

const SOPHIA_RHO: HyperparamSpec = {
  key: 'rho',
  label: 'Clip',
  symbol: 'ρ',
  min: 0.02,
  max: 2,
  step: 0.01,
  default: 0.5,
  hint: 'Caps how far any one step can move, so a bad curvature estimate can’t throw it off.',
  hintDetail: 'Smaller = more cautious'
};

export interface SophiaState {
  m: Vec;
  h: Vec;
  t: number;
}

export const sophia: CoreOptimizer<SophiaState> = {
  id: 'sophia',
  name: 'Sophia',
  description: 'Diagonal curvature, with clipped steps',
  updateRuleLatex: String.raw`\begin{aligned}&\mathbf{m} \leftarrow \beta_1 \mathbf{m} + (1-\beta_1)\,\nabla \mathcal{L} \\[2pt] &\mathbf{h} \leftarrow \beta_2 \mathbf{h} + (1-\beta_2)\,\operatorname{diag}(\mathbf{H}) \\[2pt] &\boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\,\operatorname{clip}\!\left(\frac{\mathbf{m}}{\max(\mathbf{h},\varepsilon)},\,\rho\right)\end{aligned}`,
  hyperparams: [SOPHIA_BETA1, SOPHIA_RHO],
  fixedLearningRate: 0.1,
  usesHessian: true,
  init: (d) => ({ m: zeros(d), h: zeros(d), t: 0 }),
  step(p: Vec, g: Vec, st, lr, hyper, ctx) {
    const b1 = hyper.beta1 ?? SOPHIA_BETA1.default;
    const rho = hyper.rho ?? SOPHIA_RHO.default;
    const d = p.length;
    const dense = ctx?.hessian;
    const diag = ctx?.hessianDiag;
    for (let i = 0; i < d; i++) {
      // Diagonal curvature, clamped non-negative (negative curvature is no
      // bowl to descend); g² as the crude stand-in when none is supplied.
      const hRaw = diag ? diag[i] : dense ? dense[i * d + i] : g[i] * g[i];
      const hi = dense || diag ? Math.max(hRaw, 0) : hRaw;
      // [eq:m] the momentum being preconditioned
      st.m[i] = b1 * st.m[i] + (1 - b1) * g[i];
      // [eq:h] a slow EMA of the diagonal curvature
      st.h[i] = SOPHIA_BETA2 * st.h[i] + (1 - SOPHIA_BETA2) * hi;
      // [eq:step] curvature-scaled move, clipped at ±ρ per coordinate —
      // the clip is what makes the cheap diagonal safe to trust
      const u = st.m[i] / Math.max(st.h[i], SOPHIA_EPS);
      p[i] -= lr * Math.max(-rho, Math.min(rho, u));
    }
    st.t++;
  }
};
