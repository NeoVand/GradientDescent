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

// Finite-difference Hessian of `grad` at p (the trainer supplies the real one
// at run time; second-order optimizers can't step without it).
function fdHessian(p: ModelParameters) {
  const e = 1e-4;
  const gaP = grad({ a: p.a + e, b: p.b });
  const gaM = grad({ a: p.a - e, b: p.b });
  const gbP = grad({ a: p.a, b: p.b + e });
  const gbM = grad({ a: p.a, b: p.b - e });
  return {
    h11: (gaP.a - gaM.a) / (2 * e),
    h12: (gbP.a - gbM.a) / (2 * e),
    h22: (gbP.b - gbM.b) / (2 * e)
  };
}

function run(id: OptimizerId, steps: number, lr: number, hyper?: Record<string, number>) {
  const opt = optimizers[id];
  let params: ModelParameters = { a: 1.5, b: -2.0 };
  let state = opt.init();
  const h = hyper ?? defaultHyper(id);
  for (let i = 0; i < steps; i++) {
    const ctx = opt.usesHessian ? { hessian: fdHessian(params) } : undefined;
    const out = opt.step(params, grad(params), state, lr, h, ctx);
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
      // Each optimizer is tested at the γ it actually ships with: the momentum
      // family at 0.05, AdaDelta at its self-scaling gain of 1, the rest at 0.1.
      const lr =
        id === 'gd' || id === 'momentum' || id === 'nesterov'
          ? 0.05
          : id === 'adadelta' || id === 'prodigy'
            ? 1.0
            : 0.1;
      const end = f(run(id, 50, lr));
      expect(end, `${id} should reduce loss`).toBeLessThan(start * 0.2);
    }
  });

  it('adadelta is learning-rate-free and eases in from a cold start', () => {
    const opt = optimizers.adadelta;
    // No learning rate among its knobs — the decay ρ is the only one.
    expect(opt.fixedLearningRate).toBe(1);
    expect(opt.hyperparams.map((h) => h.key)).toEqual(['rho']);
    // E[Δθ²] = 0 at the start floors the first step near √ε, far below a raw
    // gradient step (|γ·∇| = 5 here) — AdaDelta eases in rather than leaping.
    const out = opt.step({ a: 1.5, b: -2 }, { a: 3, b: -4 }, opt.init(), 1.0, defaultHyper('adadelta'));
    const stepMag = Math.hypot(out.params.a - 1.5, out.params.b - -2);
    expect(stepMag).toBeGreaterThan(0);
    expect(stepMag).toBeLessThan(0.2);
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

  it('nadam takes a larger first step than adam — the Nesterov look-ahead', () => {
    // From the same cold start and inputs, Nadam's blended first moment leans
    // toward the fresh gradient, so its very first step overshoots Adam's.
    const p = { a: 5, b: -5 };
    const g = { a: 1, b: -1 };
    const ad = optimizers.adam.step(p, g, optimizers.adam.init(), 0.1, defaultHyper('adam'));
    const na = optimizers.nadam.step(p, g, optimizers.nadam.init(), 0.1, defaultHyper('nadam'));
    expect(Math.abs(na.params.a - p.a)).toBeGreaterThan(Math.abs(ad.params.a - p.a));
    // Still downhill on both axes.
    expect(Math.sign(na.params.a - p.a)).toBe(-1);
    expect(Math.sign(na.params.b - p.b)).toBe(1);
  });

  it('adamw with λ=0 is exactly adam', () => {
    const a = run('adam', 12, 0.1);
    const w = run('adamw', 12, 0.1, { ...defaultHyper('adamw'), wd: 0 });
    expect(w.a).toBeCloseTo(a.a, 12);
    expect(w.b).toBeCloseTo(a.b, 12);
  });

  it('adamw decay pulls toward the origin even with zero gradient', () => {
    // No gradient means the adaptive term vanishes; the only motion is the
    // decoupled decay γλθ, shrinking |θ| without overshooting past 0.
    const opt = optimizers.adamw;
    const out = opt.step({ a: 5, b: -5 }, { a: 0, b: 0 }, opt.init(), 0.1, defaultHyper('adamw'));
    expect(Math.abs(out.params.a)).toBeLessThan(5);
    expect(Math.abs(out.params.b)).toBeLessThan(5);
    expect(Math.sign(out.params.a)).toBe(1);
    expect(Math.sign(out.params.b)).toBe(-1);
  });

  it('radam warms up as momentum SGD: its first step scales with the gradient', () => {
    // Early on (ρ_t ≤ 4) RAdam skips adaptive scaling and steps along γ·m̂ = γ·g.
    // So doubling the gradient doubles the first step — the opposite of Adam's
    // scale-invariant first step, and the signature of the automatic warmup.
    const opt = optimizers.radam;
    const s1 = opt.step({ a: 5, b: -5 }, { a: 1, b: -1 }, opt.init(), 0.1, defaultHyper('radam'));
    const s2 = opt.step({ a: 5, b: -5 }, { a: 2, b: -2 }, opt.init(), 0.1, defaultHyper('radam'));
    expect(Math.abs(s2.params.a - 5)).toBeCloseTo(2 * Math.abs(s1.params.a - 5), 9);
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

  it('newton lands on the minimum of a quadratic bowl in a single step', () => {
    // f(θ)=a²+b² has H=2I; in a convex bowl the saddle-free step is exactly
    // −H⁻¹∇, the vector to the origin. A range generous enough that the trust
    // region doesn't bind lets the full γ=1 step reach the minimum at once.
    const opt = optimizers.newton;
    const p = { a: 1.5, b: -2.0 };
    const out = opt.step(p, grad(p), opt.init(), 1.0, defaultHyper('newton'), {
      hessian: fdHessian(p),
      range: { min: -20, max: 20 }
    });
    expect(out.params.a).toBeCloseTo(0, 6);
    expect(out.params.b).toBeCloseTo(0, 6);
  });

  it('newton descends (not climbs) on a saddle, bounded by the trust region', () => {
    // Indefinite Hessian: pure −H⁻¹∇ would climb toward the saddle. The
    // saddle-free form steps by 1/|λ|, so it goes downhill on both axes, and
    // the trust region caps the move to a fraction of the domain span.
    const opt = optimizers.newton;
    const p = { a: 2, b: 2 };
    const g = { a: 4, b: 4 };
    const range = { min: -7, max: 7 };
    const out = opt.step(p, g, opt.init(), 1.0, defaultHyper('newton'), { hessian: { h11: 1, h12: 0, h22: -1 }, range });
    expect(out.params.a).toBeLessThan(p.a); // downhill on both axes
    expect(out.params.b).toBeLessThan(p.b);
    const stepMag = Math.hypot(out.params.a - p.a, out.params.b - p.b);
    expect(stepMag).toBeLessThanOrEqual(0.28 * (range.max - range.min) + 1e-9); // within trust region
  });

  it('newton never leaps outside its trust region, even on near-flat curvature', () => {
    // Tiny curvature would make −H⁻¹∇ explode; the floor + trust region keep
    // the step bounded to NEWTON_TRUST_FRAC · span regardless.
    const opt = optimizers.newton;
    const range = { min: -7, max: 7 };
    const out = opt.step({ a: 3, b: -3 }, { a: 50, b: -50 }, opt.init(), 1.0, defaultHyper('newton'), {
      hessian: { h11: 1e-4, h12: 0, h22: 1e-4 },
      range
    });
    const stepMag = Math.hypot(out.params.a - 3, out.params.b - -3);
    expect(stepMag).toBeLessThanOrEqual(0.28 * (range.max - range.min) + 1e-9);
    expect(out.params.a).toBeLessThan(3); // still downhill
  });

  it('sophia clips each coordinate step to γ·ρ when curvature is small', () => {
    // With a large gradient over modest curvature, m/h blows past ρ, so the clip
    // caps the per-axis move at γ·ρ no matter how big the gradient is.
    const opt = optimizers.sophia;
    const hyper = defaultHyper('sophia');
    for (const scale of [10, 100, 1000]) {
      const out = opt.step({ a: 5, b: -5 }, { a: scale, b: -scale }, opt.init(), 0.1, hyper, {
        hessian: { h11: 2, h12: 0, h22: 2 }
      });
      expect(Math.abs(out.params.a - 5)).toBeCloseTo(0.1 * hyper.rho, 9);
      expect(Math.sign(out.params.a - 5)).toBe(-1); // still downhill
    }
  });

  it('prodigy tunes its own rate: tiny first steps that grow as d ramps up', () => {
    // From d ≈ 1e-6 the first step is microscopic; as Prodigy estimates the
    // distance to the solution, d climbs and the steps grow — a learning rate
    // discovered at run time, with no γ to set.
    const opt = optimizers.prodigy;
    let p: ModelParameters = { a: 1.5, b: -2.0 };
    let state = opt.init();
    const mags: number[] = [];
    for (let i = 0; i < 20; i++) {
      const prev = p;
      const out = opt.step(p, grad(p), state, 1.0, defaultHyper('prodigy'));
      p = out.params;
      state = out.state;
      mags.push(Math.hypot(p.a - prev.a, p.b - prev.b));
    }
    expect(mags[0]).toBeLessThan(1e-3); // d0 ≈ 1e-6 → microscopic opening step
    expect(mags[19]).toBeGreaterThan(mags[0]); // steps grew as d ramped
    expect(state.d).toBeGreaterThan(1e-3); // d climbed off its seed
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
