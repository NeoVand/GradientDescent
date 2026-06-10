/**
 * Curvature math tests: the FD Hessian against known closed forms, the 2×2
 * eigendecomposition, and the Newton step's one-jump property on quadratics.
 */

import { describe, it, expect } from 'vitest';
import { computeHessian, eigenSym2, conditionNumber, newtonStep, isPositiveDefinite } from './hessian';
import { problemConfigs } from './problems';
import type { DataPoint } from '../types/types';

describe('computeHessian', () => {
  it('matches the known Rosenbrock Hessian at the minimum (1, 1)', () => {
    // H = [[2 − 400(β − 3α²), −400α], [−400α, 200]] → [[802, −400], [−400, 200]]
    const h = computeHessian(problemConfigs['rosenbrock'], [], { a: 1, b: 1 });
    expect(h.h11).toBeCloseTo(802, 1);
    expect(h.h12).toBeCloseTo(-400, 1);
    expect(h.h22).toBeCloseTo(200, 1);
  });

  it('matches the closed-form MSE Hessian for linear regression', () => {
    const data: DataPoint[] = [
      { x: -1.5, y: -2, isTraining: true },
      { x: 0.5, y: 1.2, isTraining: true },
      { x: 2, y: 3.4, isTraining: true }
    ];
    // H = (2/n) Σ [[x², x], [x, 1]] — independent of the evaluation point.
    const n = data.length;
    const sxx = data.reduce((s, d) => s + d.x * d.x, 0);
    const sx = data.reduce((s, d) => s + d.x, 0);
    const h = computeHessian(problemConfigs['linear-regression'], data, { a: 0.3, b: -0.7 });
    expect(h.h11).toBeCloseTo((2 / n) * sxx, 4);
    expect(h.h12).toBeCloseTo((2 / n) * sx, 4);
    expect(h.h22).toBeCloseTo(2, 4);
  });
});

describe('eigenSym2', () => {
  it('recovers eigenvalues and axes of a diagonal matrix', () => {
    const e = eigenSym2({ h11: 4, h12: 0, h22: 1 });
    expect(e.lambda1).toBeCloseTo(4, 10);
    expect(e.lambda2).toBeCloseTo(1, 10);
    expect(Math.abs(e.v1[0])).toBeCloseTo(1, 6);
    expect(Math.abs(e.v1[1])).toBeCloseTo(0, 6);
    expect(conditionNumber(e)).toBeCloseTo(4, 10);
  });

  it('satisfies Hv = λv for an off-diagonal matrix', () => {
    const H = { h11: 3, h12: 1.2, h22: -2 };
    const e = eigenSym2(H);
    for (const [lambda, v] of [
      [e.lambda1, e.v1],
      [e.lambda2, e.v2]
    ] as const) {
      const hv = [H.h11 * v[0] + H.h12 * v[1], H.h12 * v[0] + H.h22 * v[1]];
      expect(hv[0]).toBeCloseTo(lambda * v[0], 8);
      expect(hv[1]).toBeCloseTo(lambda * v[1], 8);
    }
    expect(isPositiveDefinite(H)).toBe(false); // det < 0: a saddle
  });
});

describe('newtonStep', () => {
  it('jumps to the exact minimum of a quadratic in one step', () => {
    const data: DataPoint[] = [
      { x: -1.2, y: -1.9, isTraining: true },
      { x: 0.4, y: 1.0, isTraining: true },
      { x: 1.8, y: 3.2, isTraining: true },
      { x: -0.3, y: 0.1, isTraining: true }
    ];
    const config = problemConfigs['linear-regression'];
    const p = { a: -2.5, b: 3.1 };
    const hess = computeHessian(config, data, p);
    const grad = config.computeGradient(data, p);
    const step = newtonStep(hess, grad)!;
    const landed = { a: p.a + step.a, b: p.b + step.b };
    // MSE is exactly quadratic: at the landing point the gradient is ~0.
    const gAfter = config.computeGradient(data, landed);
    expect(Math.hypot(gAfter.a, gAfter.b)).toBeLessThan(1e-6);
    expect(isPositiveDefinite(hess)).toBe(true);
  });

  it('returns null for a singular Hessian', () => {
    expect(newtonStep({ h11: 1, h12: 1, h22: 1 }, { a: 1, b: 1 })).toBeNull();
  });
});
