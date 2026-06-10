import { describe, it, expect } from 'vitest';
import { schedules } from './schedules';

const T = 300;

describe('learning-rate schedules', () => {
  it('constant is always 1', () => {
    expect(schedules.constant.factor(0, T)).toBe(1);
    expect(schedules.constant.factor(T, T)).toBe(1);
  });

  it('step decay drops ×0.3 at thirds', () => {
    const f = schedules.step.factor;
    expect(f(0, T)).toBe(1);
    expect(f(T / 3 - 1, T)).toBe(1);
    expect(f(T / 3, T)).toBeCloseTo(0.3, 10);
    expect(f((2 * T) / 3, T)).toBeCloseTo(0.09, 10);
    expect(f(T, T)).toBeCloseTo(0.09, 10); // capped at two drops
  });

  it('cosine starts at 1, anneals to the 5% floor, never below', () => {
    const f = schedules.cosine.factor;
    expect(f(0, T)).toBeCloseTo(1, 10);
    expect(f(T / 2, T)).toBeCloseTo(0.05 + 0.95 / 2, 10);
    expect(f(T, T)).toBeCloseTo(0.05, 10);
    for (let t = 0; t <= T; t += 10) {
      expect(f(t, T)).toBeGreaterThanOrEqual(0.05);
      expect(f(t, T)).toBeLessThanOrEqual(1);
    }
  });

  it('warmup ramps up then anneals down', () => {
    const f = schedules['warmup-cosine'].factor;
    const W = Math.round(T * 0.1);
    expect(f(0, T)).toBeLessThan(0.1); // tiny but nonzero
    expect(f(W / 2, T)).toBeCloseTo(0.5, 1);
    expect(f(W, T)).toBeCloseTo(1, 10);
    expect(f(T, T)).toBeCloseTo(0.05, 10);
    // Monotone decay after the peak
    let prev = f(W, T);
    for (let t = W + 1; t <= T; t += 7) {
      const v = f(t, T);
      expect(v).toBeLessThanOrEqual(prev + 1e-12);
      prev = v;
    }
  });

  it('degenerate T never divides by zero', () => {
    for (const s of Object.values(schedules)) {
      expect(Number.isFinite(s.factor(5, 0))).toBe(true);
    }
  });
});
