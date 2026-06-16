/**
 * Custom-dataset model math.
 *
 * The two "Custom" problems (custom-regression, custom-classification) let the
 * learner bring their own data and pick which 2-parameter model fits it. The
 * pure ProblemConfig methods in problems.ts delegate here; the active model is
 * held in this module-level `customModel` object and kept in sync with
 * `customModelStore` (so the config functions stay pure — no store import).
 *
 * Closed-form models carry analytic gradients. The user-typed "custom" formula
 * is differentiated by central finite differences of the loss — the same
 * technique the app already trusts (its gradient tests are FD checks).
 */

import type { DataPoint, ModelParameters } from '../types/types';

export type RegressionModel = 'line' | 'quadratic' | 'exponential' | 'power' | 'custom';
export type ClassificationModel = 'linear' | 'circle';

/** Live model selection, mutated synchronously by customModelStore.patch. */
export const customModel = {
  regression: 'line' as RegressionModel,
  classification: 'linear' as ClassificationModel,
  /** User expression in x, a (α), b (β) — only used when regression === 'custom'. */
  formula: 'a * x + b'
};

/** Human-readable model labels for the picker/formula strip. */
export const REGRESSION_LABELS: Record<RegressionModel, string> = {
  line: 'Line  ŷ = αx + β',
  quadratic: 'Quadratic  ŷ = αx² + βx',
  exponential: 'Exponential  ŷ = α·e^(βx)',
  power: 'Power  ŷ = α·|x|^β',
  custom: 'Custom formula…'
};
export const CLASSIFICATION_LABELS: Record<ClassificationModel, string> = {
  linear: 'Linear boundary  z = αx₁ + βx₂',
  circle: 'Circle  center (α, β)'
};

// ---------- custom formula evaluator ----------
// Compiled once per distinct source string. Only a small alphabet is allowed,
// and only Math helpers are in scope, so a stray expression can't reach globals.
const ALLOWED = /^[\d\s+\-*/^().,xabeEpiPI\sA-Za-z_]*$/;
let compiledSrc = '';
let compiledFn: ((x: number, a: number, b: number) => number) | null = null;

export function compileFormula(src: string): (x: number, a: number, b: number) => number {
  if (compiledFn && compiledSrc === src) return compiledFn;
  compiledSrc = src;
  try {
    if (!ALLOWED.test(src)) throw new Error('disallowed characters');
    const js = src.replace(/\^/g, '**'); // ^ as exponent
    // eslint-disable-next-line no-new-func
    compiledFn = new Function(
      'x', 'a', 'b',
      `"use strict"; const {sin,cos,tan,asin,acos,atan,exp,log,sqrt,abs,sign,tanh,sinh,cosh,pow,min,max,PI,E}=Math; return (${js});`
    ) as (x: number, a: number, b: number) => number;
    compiledFn(0, 1, 1); // smoke test (throws on syntax error)
  } catch {
    compiledFn = () => NaN;
  }
  return compiledFn;
}

/** True if the formula compiles and yields a finite number at a sample point. */
export function formulaIsValid(src: string): boolean {
  const fn = compileFormula(src);
  const v = fn(0.5, 1, 0.5);
  return Number.isFinite(v);
}

// ---------- regression ----------

export function regressionPredict(x: number, p: ModelParameters): number {
  switch (customModel.regression) {
    case 'line': return p.a * x + p.b;
    case 'quadratic': return p.a * x * x + p.b * x;
    case 'exponential': return p.a * Math.exp(p.b * x);
    case 'power': return p.a * Math.sign(x) * Math.pow(Math.abs(x), p.b);
    case 'custom': return compileFormula(customModel.formula)(x, p.a, p.b);
  }
}

export function regressionLoss(data: DataPoint[], p: ModelParameters): number {
  if (data.length === 0) return 0;
  let s = 0;
  for (const d of data) {
    const e = regressionPredict(d.x, p) - d.y;
    s += e * e;
  }
  const v = s / data.length;
  return Number.isFinite(v) ? v : 1e12; // keep the grid finite for color/contours
}

export function regressionGrad(data: DataPoint[], p: ModelParameters): ModelParameters {
  if (data.length === 0) return { a: 0, b: 0 };

  // Custom formula: no symbolic derivative — finite-difference the loss.
  if (customModel.regression === 'custom') {
    const h = 1e-4;
    const dA = (regressionLoss(data, { a: p.a + h, b: p.b }) - regressionLoss(data, { a: p.a - h, b: p.b })) / (2 * h);
    const dB = (regressionLoss(data, { a: p.a, b: p.b + h }) - regressionLoss(data, { a: p.a, b: p.b - h })) / (2 * h);
    return { a: Number.isFinite(dA) ? dA : 0, b: Number.isFinite(dB) ? dB : 0 };
  }

  let ga = 0, gb = 0;
  for (const d of data) {
    const e = regressionPredict(d.x, p) - d.y;
    let dA: number, dB: number;
    switch (customModel.regression) {
      case 'line': dA = d.x; dB = 1; break;
      case 'quadratic': dA = d.x * d.x; dB = d.x; break;
      case 'exponential': { const ex = Math.exp(p.b * d.x); dA = ex; dB = p.a * d.x * ex; break; }
      case 'power': {
        const sgn = Math.sign(d.x), ax = Math.abs(d.x);
        dA = sgn * Math.pow(ax, p.b);
        dB = ax > 0 ? p.a * sgn * Math.pow(ax, p.b) * Math.log(ax) : 0;
        break;
      }
      default: dA = 0; dB = 0;
    }
    ga += 2 * e * dA;
    gb += 2 * e * dB;
  }
  return { a: ga / data.length, b: gb / data.length };
}

// ---------- classification ----------
// Points carry their two features in (x, y) and the class in label (0 | 1),
// exactly as logistic-regression / circle-classifier already do.

const EPS = 1e-7;
const CIRCLE_R = 1.0;
const CIRCLE_TAU = 0.4;
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function classificationProb(d: DataPoint, p: ModelParameters): number {
  if (customModel.classification === 'circle') {
    const dist2 = (d.x - p.a) ** 2 + (d.y - p.b) ** 2;
    return sigmoid((CIRCLE_R * CIRCLE_R - dist2) / CIRCLE_TAU);
  }
  return sigmoid(p.a * d.x + p.b * d.y); // linear boundary through the origin
}

export function classificationLoss(data: DataPoint[], p: ModelParameters): number {
  if (data.length === 0) return 0;
  let s = 0;
  for (const d of data) {
    const prob = Math.min(1 - EPS, Math.max(EPS, classificationProb(d, p)));
    const y = d.label ?? 0;
    s += -(y * Math.log(prob) + (1 - y) * Math.log(1 - prob));
  }
  return s / data.length;
}

export function classificationGrad(data: DataPoint[], p: ModelParameters): ModelParameters {
  if (data.length === 0) return { a: 0, b: 0 };
  let ga = 0, gb = 0;
  for (const d of data) {
    const err = classificationProb(d, p) - (d.label ?? 0);
    if (customModel.classification === 'circle') {
      ga += err * (2 * (d.x - p.a)) / CIRCLE_TAU;
      gb += err * (2 * (d.y - p.b)) / CIRCLE_TAU;
    } else {
      ga += err * d.x;
      gb += err * d.y;
    }
  }
  return { a: ga / data.length, b: gb / data.length };
}
