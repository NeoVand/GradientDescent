/**
 * Optimizer correctness tests on the 1D-per-axis quadratic f(θ) = a² + b²,
 * whose gradient is (2a, 2b). Every method must descend; the momentum
 * family must reduce exactly to GD at μ = 0; Adam's bias-corrected first
 * step must have magnitude ≈ γ regardless of gradient scale.
 */

import { describe, it, expect } from 'vitest';
import { optimizers, defaultHyper, type OptimizerId } from './optimizers';
import type { ModelParameters } from '../types/types';

const grad = (p: ModelParameters): ModelParameters => ({ a: 2 * p.a, b: 2 * p.b });

function run(id: OptimizerId, steps: number, lr: number, hyper?: Record<string, number>) {
  const opt = optimizers[id];
  let params: ModelParameters = { a: 1.5, b: -2.0 };
  let state = opt.init();
  const h = hyper ?? defaultHyper(id);
  for (let i = 0; i < steps; i++) {
    const out = opt.step(params, grad(params), state, lr, h);
    params = out.params;
    state = out.state;
  }
  return params;
}

describe('optimizers', () => {
  it('every optimizer descends on a convex bowl', () => {
    const f = (p: ModelParameters) => p.a * p.a + p.b * p.b;
    const start = f({ a: 1.5, b: -2.0 });
    for (const id of Object.keys(optimizers) as OptimizerId[]) {
      const end = f(run(id, 50, id === 'gd' || id === 'momentum' || id === 'nesterov' ? 0.05 : 0.1));
      expect(end, `${id} should reduce loss`).toBeLessThan(start * 0.2);
    }
  });

  it('momentum with μ=0 equals plain GD exactly', () => {
    const gd = run('gd', 10, 0.05);
    const mom = run('momentum', 10, 0.05, { mu: 0 });
    expect(mom.a).toBeCloseTo(gd.a, 12);
    expect(mom.b).toBeCloseTo(gd.b, 12);
  });

  it('nesterov with μ=0 equals plain GD exactly', () => {
    const gd = run('gd', 10, 0.05);
    const nes = run('nesterov', 10, 0.05, { mu: 0 });
    expect(nes.a).toBeCloseTo(gd.a, 12);
    expect(nes.b).toBeCloseTo(gd.b, 12);
  });

  it('adam first step has magnitude ≈ γ per axis, independent of gradient scale', () => {
    const opt = optimizers.adam;
    for (const scale of [0.001, 1, 1000]) {
      const params = { a: 5, b: -5 };
      const g = { a: scale, b: -scale };
      const out = opt.step(params, g, opt.init(), 0.1, defaultHyper('adam'));
      // Bias correction makes m̂/√ŝ = sign(g) on the first step
      expect(Math.abs(out.params.a - params.a)).toBeCloseTo(0.1, 5);
      expect(Math.abs(out.params.b - params.b)).toBeCloseTo(0.1, 5);
      expect(Math.sign(out.params.a - params.a)).toBe(-1);
      expect(Math.sign(out.params.b - params.b)).toBe(1);
    }
  });

  it('adagrad steps shrink as gradient history accumulates', () => {
    const opt = optimizers.adagrad;
    let params = { a: 10, b: 10 };
    let state = opt.init();
    const sizes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const g = { a: 4, b: 4 }; // constant gradient
      const out = opt.step(params, g, state, 0.1, {});
      sizes.push(Math.abs(out.params.a - params.a));
      params = out.params;
      state = out.state;
    }
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeLessThan(sizes[i - 1]);
    }
  });

  it('rmsprop recovers step size after a burst of large gradients', () => {
    const opt = optimizers.rmsprop;
    let state = opt.init();
    let params = { a: 0, b: 0 };
    // Burst of large gradients inflates s...
    for (let i = 0; i < 10; i++) {
      const out = opt.step(params, { a: 100, b: 100 }, state, 0.1, { rho: 0.5 });
      params = out.params;
      state = out.state;
    }
    const sAfterBurst = state.s.a;
    // ...then small gradients let s decay (AdaGrad never would)
    for (let i = 0; i < 10; i++) {
      const out = opt.step(params, { a: 0.1, b: 0.1 }, state, 0.1, { rho: 0.5 });
      params = out.params;
      state = out.state;
    }
    expect(state.s.a).toBeLessThan(sAfterBurst / 100);
  });

  it('lion steps have fixed magnitude γ per axis, independent of gradient scale', () => {
    const opt = optimizers.lion;
    for (const scale of [0.001, 1, 1000]) {
      const params = { a: 5, b: -5 };
      // From a fresh state, m=0 so the sign follows the gradient's sign.
      const out = opt.step(params, { a: scale, b: -scale }, opt.init(), 0.05, defaultHyper('lion'));
      expect(Math.abs(out.params.a - params.a)).toBeCloseTo(0.05, 12);
      expect(Math.abs(out.params.b - params.b)).toBeCloseTo(0.05, 12);
      expect(Math.sign(out.params.a - params.a)).toBe(-1); // downhill on +g
      expect(Math.sign(out.params.b - params.b)).toBe(1);
    }
  });

  it('state is not mutated in place', () => {
    for (const id of Object.keys(optimizers) as OptimizerId[]) {
      const opt = optimizers[id];
      const state = opt.init();
      const frozen = JSON.parse(JSON.stringify(state));
      opt.step({ a: 1, b: 1 }, { a: 2, b: 2 }, state, 0.1, defaultHyper(id));
      expect(state, `${id} mutated its input state`).toEqual(frozen);
    }
  });
});
