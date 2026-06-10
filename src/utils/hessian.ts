/**
 * Local curvature at a point of the loss surface.
 *
 * The Hessian is computed by central finite differences of each problem's
 * *analytic* gradient (no per-problem code needed), then eigendecomposed in
 * closed form. This powers the curvature lens: the local quadratic's
 * ellipse, the condition number κ = |λ₁|/|λ₂|, and the Newton step
 * −H⁻¹∇ℒ — the "what a second-order method would do" ghost.
 */

import type { DataPoint, ModelParameters, ProblemConfig } from '../types/types';

export interface Hessian2 {
  h11: number;
  h12: number;
  h22: number;
}

export interface Eigen2 {
  /** Eigenvalues ordered by |λ₁| ≥ |λ₂|. */
  lambda1: number;
  lambda2: number;
  /** Matching unit eigenvectors in (α, β) space. */
  v1: [number, number];
  v2: [number, number];
}

const FD_H = 1e-4;

/** Central FD of the analytic gradient; symmetrized. */
export function computeHessian(
  config: ProblemConfig,
  data: DataPoint[],
  p: ModelParameters,
  h: number = FD_H
): Hessian2 {
  const gaP = config.computeGradient(data, { a: p.a + h, b: p.b });
  const gaM = config.computeGradient(data, { a: p.a - h, b: p.b });
  const gbP = config.computeGradient(data, { a: p.a, b: p.b + h });
  const gbM = config.computeGradient(data, { a: p.a, b: p.b - h });

  const h11 = (gaP.a - gaM.a) / (2 * h);
  const h21 = (gaP.b - gaM.b) / (2 * h);
  const h12 = (gbP.a - gbM.a) / (2 * h);
  const h22 = (gbP.b - gbM.b) / (2 * h);

  // ∂²ℒ/∂α∂β = ∂²ℒ/∂β∂α analytically; average out FD noise.
  const off = (h12 + h21) / 2;
  return { h11, h12: off, h22 };
}

/** Closed-form eigendecomposition of a symmetric 2×2 matrix. */
export function eigenSym2({ h11, h12, h22 }: Hessian2): Eigen2 {
  const mean = (h11 + h22) / 2;
  const disc = Math.hypot((h11 - h22) / 2, h12);
  let lambdaA = mean + disc;
  let lambdaB = mean - disc;

  const vecFor = (lambda: number): [number, number] => {
    // (H − λI)v = 0 → v ∝ (h12, λ − h11) or (λ − h22, h12)
    let vx = h12;
    let vy = lambda - h11;
    if (Math.hypot(vx, vy) < 1e-12) {
      vx = lambda - h22;
      vy = h12;
    }
    const m = Math.hypot(vx, vy);
    return m < 1e-12 ? [1, 0] : [vx / m, vy / m];
  };

  let vA = vecFor(lambdaA);
  let vB = vecFor(lambdaB);

  if (Math.abs(lambdaB) > Math.abs(lambdaA)) {
    [lambdaA, lambdaB] = [lambdaB, lambdaA];
    [vA, vB] = [vB, vA];
  }

  return { lambda1: lambdaA, lambda2: lambdaB, v1: vA, v2: vB };
}

/** κ = |λ₁|/|λ₂| — how stretched the local bowl is. Infinity when flat. */
export function conditionNumber(e: Eigen2): number {
  const lo = Math.abs(e.lambda2);
  if (lo < 1e-12) return Infinity;
  return Math.abs(e.lambda1) / lo;
}

/**
 * Newton step δ = −H⁻¹∇ℒ. Returns null when H is singular (no unique
 * quadratic minimum). Note: only meaningful as a *minimizing* step when H
 * is positive-definite; at saddles it walks toward the stationary point.
 */
export function newtonStep(hess: Hessian2, grad: ModelParameters): ModelParameters | null {
  const { h11, h12, h22 } = hess;
  const det = h11 * h22 - h12 * h12;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return {
    a: -(h22 * grad.a - h12 * grad.b) / det,
    b: -(-h12 * grad.a + h11 * grad.b) / det
  };
}

export function isPositiveDefinite(hess: Hessian2): boolean {
  // Sylvester: leading minors positive.
  return hess.h11 > 0 && hess.h11 * hess.h22 - hess.h12 * hess.h12 > 0;
}
