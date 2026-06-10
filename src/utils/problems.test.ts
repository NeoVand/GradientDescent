/**
 * Gradient correctness tests.
 *
 * Every problem ships a hand-derived analytic gradient. These tests compare
 * each one against a central finite difference of its own computeLoss on a
 * small deterministic dataset, at two parameter points inside the problem's
 * useful basin. If a future edit breaks a derivative, this fails loudly.
 */

import { describe, it, expect } from 'vitest';
import { problemConfigs } from './problems';
import type { DataPoint, ModelParameters, ProblemConfig } from '../types/types';

const H = 1e-5;

function finiteDifferenceGradient(
  config: ProblemConfig,
  data: DataPoint[],
  p: ModelParameters
): ModelParameters {
  return {
    a:
      (config.computeLoss(data, { a: p.a + H, b: p.b }) -
        config.computeLoss(data, { a: p.a - H, b: p.b })) /
      (2 * H),
    b:
      (config.computeLoss(data, { a: p.a, b: p.b + H }) -
        config.computeLoss(data, { a: p.a, b: p.b - H })) /
      (2 * H)
  };
}

function expectClose(actual: number, expected: number, label: string) {
  const tol = Math.max(1e-5, 1e-3 * Math.abs(expected));
  expect(Math.abs(actual - expected), `${label}: analytic=${actual} fd=${expected}`).toBeLessThan(
    tol
  );
}

/**
 * Deterministic fixtures. 1D-curve problems get x-grids matched to their
 * data-generation domain, with y = trueModel(x) + a small fixed offset so
 * the residual (and hence the gradient) is nonzero.
 */
const OFFSETS = [0.04, -0.03, 0.05, -0.04, 0.02, -0.05];

function curveData(config: ProblemConfig, xs: number[]): DataPoint[] {
  return xs.map((x, i) => ({
    x,
    y: config.predict(x, config.trueParameters) + OFFSETS[i % OFFSETS.length],
    isTraining: true
  }));
}

const XS_CENTERED = [-1.6, -0.8, -0.1, 0.6, 1.4, 1.9]; // x ∈ [-2, 2]
const XS_POSITIVE = [0.4, 0.9, 1.5, 2.1, 2.8, 3.3];    // power law: x > 0
const XS_TIME = [0.2, 0.9, 1.7, 2.5, 3.2, 3.9];        // damped oscillator: t ∈ [0, 4]

function fixtureFor(type: string): DataPoint[] {
  const config = problemConfigs[type];
  if (config.noData) return []; // analytic surfaces ignore data entirely
  switch (type) {
    case 'power-law':
      return curveData(config, XS_POSITIVE);
    case 'damped-oscillator':
      return curveData(config, XS_TIME);
    case 'logistic-regression':
      return [
        { x: -0.9, y: -0.5, isTraining: true, label: 0 },
        { x: -0.7, y: -0.6, isTraining: true, label: 0 },
        { x: -0.8, y: -0.3, isTraining: true, label: 0 },
        { x: 0.8, y: 0.5, isTraining: true, label: 1 },
        { x: 0.7, y: 0.6, isTraining: true, label: 1 },
        { x: 0.9, y: 0.4, isTraining: true, label: 1 }
      ];
    case 'circle-classifier':
      // Labels follow the true circle (radius 1 around the origin)
      return [
        { x: 0.3, y: 0.2, isTraining: true, label: 1 },
        { x: 0.5, y: -0.4, isTraining: true, label: 1 },
        { x: -0.2, y: 0.6, isTraining: true, label: 1 },
        { x: 1.5, y: 0.8, isTraining: true, label: 0 },
        { x: -1.2, y: -0.9, isTraining: true, label: 0 },
        { x: -1.8, y: 1.2, isTraining: true, label: 0 }
      ];
    case 'source-localization': {
      // Signal computed from the true source (0.5, -0.5), K=1, ε=0.5
      const signal = (x: number, y: number) =>
        1 / ((x - 0.5) ** 2 + (y + 0.5) ** 2 + 0.5);
      return [
        { x: -1.2, y: 0.8 },
        { x: 0.9, y: -1.1 },
        { x: 1.4, y: 0.3 },
        { x: -0.4, y: -1.5 },
        { x: 0.1, y: 0.2 },
        { x: -1.6, y: -0.7 }
      ].map(p => ({ ...p, isTraining: true, label: signal(p.x, p.y) }));
    }
    case 'ar2':
    case 'ar2-rollout':
      // A short series with integer time indices; values are arbitrary
      // but fixed — gradient correctness doesn't need the series to
      // follow the model.
      return [0.8, 0.5, 0.3, -0.1, -0.35, -0.3, -0.05, 0.2].map((y, t) => ({
        x: t,
        y,
        isTraining: true
      }));
    case 'mean-shift':
      return [
        { x: -1.1, y: 0.9, isTraining: true },
        { x: -0.8, y: 1.2, isTraining: true },
        { x: -1.2, y: 1.1, isTraining: true },
        { x: 0.9, y: -1.1, isTraining: true },
        { x: 1.2, y: -0.8, isTraining: true },
        { x: 1.0, y: -1.2, isTraining: true }
      ];
    default:
      return curveData(config, XS_CENTERED);
  }
}

/**
 * Two test points per problem: trueParameters nudged by fixed offsets.
 * Offsets are small enough to stay inside each problem's sane region
 * (e.g. Gaussian Peak's |β| ≥ 0.3 clamp, Power Law's bounded exponent).
 */
const PARAM_OFFSETS = [
  { da: 0.4, db: -0.3 },
  { da: -0.5, db: 0.6 }
];

describe('analytic gradients match finite differences', () => {
  for (const [type, config] of Object.entries(problemConfigs)) {
    describe(type, () => {
      const data = fixtureFor(type);

      for (const { da, db } of PARAM_OFFSETS) {
        const p = { a: config.trueParameters.a + da, b: config.trueParameters.b + db };

        it(`at (α=${p.a.toFixed(2)}, β=${p.b.toFixed(2)})`, () => {
          const analytic = config.computeGradient(data, p);
          const fd = finiteDifferenceGradient(config, data, p);
          expectClose(analytic.a, fd.a, `${type} ∂L/∂α`);
          expectClose(analytic.b, fd.b, `${type} ∂L/∂β`);
        });
      }

      if (!config.noData) {
        it('returns zero gradient for empty data', () => {
          expect(config.computeGradient([], config.trueParameters)).toEqual({ a: 0, b: 0 });
        });
      }

      it('loss is finite and non-negative at test points', () => {
        for (const { da, db } of PARAM_OFFSETS) {
          const p = { a: config.trueParameters.a + da, b: config.trueParameters.b + db };
          const loss = config.computeLoss(data, p);
          expect(Number.isFinite(loss)).toBe(true);
          expect(loss).toBeGreaterThanOrEqual(0);
        }
      });
    });
  }
});
