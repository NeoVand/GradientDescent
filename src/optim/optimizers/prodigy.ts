/**
 * Prodigy — Mishchenko & Defazio, 2024 (arXiv:2306.06101).
 *
 * Idea: the parameter-free branch. The right learning rate is set by the
 * distance from your start to the solution — a number d you don't know, so
 * Prodigy estimates it live: a running lower bound ramped up from how the
 * gradients correlate with how far you've already travelled, ⟨g, x₀ − x⟩,
 * scaling an Adam-style step. The rate, discovered rather than tuned.
 * State: m, v (d-weighted Adam moments), t, dEst, rNum, sDen, x0.
 * Deviations (guards ON — see DEVIATIONS.md): d is seeded and capped
 * relative to the domain span (the paper's absolute 1e-6 seed is tuned for
 * billion-parameter nets and warms up glacially on two), and each step is
 * clipped to a trust region — d only ever GROWS, and on these small
 * non-convex surfaces an overshoot would otherwise never recover. With
 * ctx.guards === false: the paper's seed, no cap, no clip.
 */

import type { CoreOptimizer, HyperparamSpec, Vec } from '../types';
import { EPS, zeros } from '../types';
import { guardsOn, spanOf, trustRegionClip } from '../guards';

// ⚠ CLASSROOM GUARD constants (not in the paper):
const PRODIGY_D0_FRAC = 1e-4; // seed distance as a fraction of the domain span
const PRODIGY_D_MAX_FRAC = 1.5; // cap the distance estimate at 1.5× the span
const PRODIGY_TRUST_FRAC = 0.18; // per-step cap as a fraction of the domain span
const PAPER_D0 = 1e-6; // the paper's absolute seed (guards off)

const PRODIGY_BETA1: HyperparamSpec = {
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

const PRODIGY_BETA2: HyperparamSpec = {
  key: 'beta2',
  label: 'Scale decay',
  symbol: 'β₂',
  min: 0.8,
  max: 0.9999,
  step: 0.0001,
  default: 0.999,
  hint: 'How steadily the step scaling adapts — Prodigy also uses it to size its auto learning rate.',
  hintDetail: 'Higher = smoother, slower changes'
};

export interface ProdigyState {
  m: Vec;
  v: Vec;
  t: number;
  /** The running distance estimate — Prodigy's self-tuned learning rate. */
  dEst: number;
  rNum: number;
  sDen: Vec;
  x0: Vec | null;
}

export const prodigy: CoreOptimizer<ProdigyState> = {
  id: 'prodigy',
  name: 'Prodigy',
  description: 'Parameter-free: estimates its own learning rate',
  updateRuleLatex: String.raw`\begin{aligned}&\mathbf{m} \leftarrow \beta_1 \mathbf{m} + (1-\beta_1)\, d\,\nabla \mathcal{L} \\[2pt] &\mathbf{s} \leftarrow \beta_2 \mathbf{s} + (1-\beta_2)\, d^2 (\nabla \mathcal{L})^2 \\[2pt] &d \leftarrow \max\!\left(d,\, \frac{r}{\lVert \mathbf{w}\rVert_1}\right) \\[2pt] &\boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, d\,\frac{\mathbf{m}}{\sqrt{\mathbf{s}} + d\,\varepsilon}\end{aligned}`,
  hyperparams: [PRODIGY_BETA1, PRODIGY_BETA2],
  fixedLearningRate: 1.0,
  init: (d) => ({ m: zeros(d), v: zeros(d), t: 0, dEst: NaN, rNum: 0, sDen: zeros(d), x0: null }),
  step(p: Vec, g: Vec, st, lr, hyper, ctx) {
    const b1 = hyper.beta1 ?? PRODIGY_BETA1.default;
    const b2 = hyper.beta2 ?? PRODIGY_BETA2.default;
    const sb2 = Math.sqrt(b2);
    const n = p.length;
    const guarded = guardsOn(ctx);
    const span = spanOf(ctx);
    // ⚠ CLASSROOM GUARD — the domain-scaled seed (paper: absolute 1e-6).
    if (Number.isNaN(st.dEst)) st.dEst = guarded ? PRODIGY_D0_FRAC * span : PAPER_D0;
    if (!st.x0) st.x0 = Float64Array.from(p); // anchor the start on first step
    const d = st.dEst;

    // [eq:m] Adam-style moments, but each gradient is weighted by d
    let dot = 0;
    for (let i = 0; i < n; i++) {
      st.m[i] = b1 * st.m[i] + (1 - b1) * d * g[i];
      st.v[i] = b2 * st.v[i] + (1 - b2) * d * d * g[i] * g[i];
      // [eq:dot] how much the gradients agree with the path travelled so far
      dot += g[i] * (st.x0[i] - p[i]);
    }
    // [eq:d] the distance estimate: numerator vs the accumulated gradient's
    // L1 size — d only ever grows (⚠ CLASSROOM GUARD: capped vs the domain)
    st.rNum = sb2 * st.rNum + (1 - sb2) * lr * d * d * dot;
    let sL1 = 0;
    for (let i = 0; i < n; i++) {
      st.sDen[i] = sb2 * st.sDen[i] + (1 - sb2) * lr * d * d * g[i];
      sL1 += Math.abs(st.sDen[i]);
    }
    const grown = Math.max(d, sL1 > 0 ? st.rNum / sL1 : d);
    st.dEst = guarded ? Math.min(PRODIGY_D_MAX_FRAC * span, grown) : grown;

    // [eq:step] an Adam step scaled by the CURRENT d (the d's in m/√v cancel)
    const step = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      step[i] = (lr * d * st.m[i]) / (Math.sqrt(st.v[i]) + d * EPS);
    }
    // ⚠ CLASSROOM GUARD — a bad early ramp must not fling the marker away.
    if (guarded) trustRegionClip(step, PRODIGY_TRUST_FRAC * span);
    for (let i = 0; i < n; i++) p[i] -= step[i];
    st.t++;
  }
};
