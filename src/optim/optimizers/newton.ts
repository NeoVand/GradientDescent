/**
 * Newton's method — the root-finding idea (1669) pointed at optimization
 * centuries later: fit a quadratic bowl to the surface right here (the
 * Hessian H) and jump straight to that bowl's bottom, −H⁻¹∇ℒ.
 *
 * Pure Newton is unusable on wild non-convex landscapes: on a plateau H ≈ 0
 * explodes the step, and on a saddle −H⁻¹∇ points at the stationary point —
 * uphill. With guards ON (the default) this runs the textbook robust form
 * instead, damped Newton (Levenberg–Marquardt style): lift the smallest
 * eigenvalue of H to a floor via a +τI shift so the step is always descent,
 * and cap it to a trust region. With ctx.guards === false you get the pure
 * −γH⁻¹∇ℒ jump — and everything the papers warn about.
 *
 * State: only the step counter.
 * Deviations: the guard constants below (floor, condition cap, trust
 * fraction) are classroom-tuned for this lab's landscapes — see
 * DEVIATIONS.md. Damped mode is implemented for d = 2 (a closed-form
 * eigenvalue pair); pure mode solves any small d by Gaussian elimination.
 */

import type { CoreOptimizer, Vec } from '../types';
import { guardsOn, spanOf, trustRegionClip } from '../guards';

// ⚠ CLASSROOM GUARD constants (not in any paper):
const NEWTON_CURV_FLOOR = 0.5; // floor on the smallest eigenvalue; 1/floor is the flat-region GD rate
const NEWTON_COND_CAP = 1e-3; // relative floor, scaled by the steepest curvature, to cap anisotropy
const NEWTON_TRUST_FRAC = 0.28; // trust-region radius as a fraction of the domain span

/** Solve A·x = b for small dense A (row-major d×d), Gaussian elimination. */
function solveDense(A: Float64Array, b: Vec, d: number): Vec {
  const M = Float64Array.from(A);
  const x = Float64Array.from(b);
  for (let col = 0; col < d; col++) {
    let piv = col;
    for (let r = col + 1; r < d; r++) if (Math.abs(M[r * d + col]) > Math.abs(M[piv * d + col])) piv = r;
    if (piv !== col) {
      for (let c = 0; c < d; c++) { const tmp = M[col * d + c]; M[col * d + c] = M[piv * d + c]; M[piv * d + c] = tmp; }
      const tb = x[col]; x[col] = x[piv]; x[piv] = tb;
    }
    const diag = M[col * d + col];
    for (let r = col + 1; r < d; r++) {
      const f = M[r * d + col] / diag;
      for (let c = col; c < d; c++) M[r * d + c] -= f * M[col * d + c];
      x[r] -= f * x[col];
    }
  }
  for (let r = d - 1; r >= 0; r--) {
    for (let c = r + 1; c < d; c++) x[r] -= M[r * d + c] * x[c];
    x[r] /= M[r * d + r];
  }
  return x;
}

export interface NewtonState {
  t: number;
}

export const newton: CoreOptimizer<NewtonState> = {
  id: 'newton',
  name: 'Newton',
  description: 'Second order: jump using local curvature',
  updateRuleLatex: String.raw`\boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \mathbf{H}^{-1} \nabla \mathcal{L}`,
  hyperparams: [],
  fixedLearningRate: 1.0,
  usesHessian: true,
  init: () => ({ t: 0 }),
  step(p: Vec, g: Vec, st, lr, _hyper, ctx) {
    const d = p.length;
    const H = ctx?.hessian;
    const step = new Float64Array(d);

    if (!H) {
      // No curvature supplied: behave like (damped) gradient descent.
      for (let i = 0; i < d; i++) step[i] = -lr * g[i];
    } else if (!guardsOn(ctx)) {
      // [eq:pure] the paper-faithful jump: δ = −γ·H⁻¹∇ℒ. No floor, no trust
      // region — on a saddle this walks UPHILL toward the stationary point.
      const delta = solveDense(H, g, d);
      for (let i = 0; i < d; i++) step[i] = -lr * delta[i];
    } else {
      // ⚠ CLASSROOM GUARD — damped (Levenberg–Marquardt-style) Newton.
      if (d !== 2) throw new Error('newton: damped mode is implemented for d = 2; pass ctx.guards = false for the pure solve');
      const h11 = H[0], h12 = H[1], h22 = H[3];
      // [eq:eig] the 2×2 eigenvalue pair, in closed form
      const mean = (h11 + h22) / 2;
      const rad = Math.hypot((h11 - h22) / 2, h12);
      const lo = mean - rad, hi = mean + rad;
      const scale = Math.max(Math.abs(lo), Math.abs(hi));
      const floor = Math.max(NEWTON_CURV_FLOOR, scale * NEWTON_COND_CAP);
      // [eq:shift] lift the smallest eigenvalue to the floor: H + τI is PD,
      // so −(H+τI)⁻¹∇ is always a descent step, even on a saddle
      const tau = Math.max(0, floor - Math.min(lo, hi));
      const a11 = h11 + tau, a22 = h22 + tau;
      const det = a11 * a22 - h12 * h12;
      // [eq:solve] the damped jump, via the 2×2 inverse
      step[0] = (lr * -(a22 * g[0] - h12 * g[1])) / det;
      step[1] = (lr * -(-h12 * g[0] + a11 * g[1])) / det;
      // ⚠ CLASSROOM GUARD — never leap more than a fraction of the domain.
      trustRegionClip(step, NEWTON_TRUST_FRAC * spanOf(ctx));
    }

    for (let i = 0; i < d; i++) p[i] += step[i];
    st.t++;
  }
};
