/**
 * Tests for the farthest-point streamline placement.
 *
 * We trace the −∇ℒ flow of a simple bowl ℒ = a² + b² (∇ℒ = (2a, 2b), one sink
 * at the origin) and check the three properties the visual relies on:
 *   1. lines stay finite and inside the domain,
 *   2. they actually run into the sink (a line reaches the origin), and
 *   3. coverage is even — no large empty regions.
 * A flat field must yield nothing.
 */
import { describe, it, expect } from 'vitest';
import { placeStreamlines, type StreamlineField } from './streamlines';

const bowl: StreamlineField = {
  min: -2,
  max: 2,
  gradient: (a, b) => ({ a: 2 * a, b: 2 * b }) // ∇(a² + b²)
};

describe('placeStreamlines', () => {
  const lines = placeStreamlines(bowl, { dSep: 0.2 });

  it('produces a healthy set of lines', () => {
    expect(lines.length).toBeGreaterThanOrEqual(5);
  });

  it('every point is finite and inside the domain', () => {
    for (const line of lines) {
      for (const p of line) {
        expect(Number.isFinite(p.a) && Number.isFinite(p.b)).toBe(true);
        expect(p.a).toBeGreaterThanOrEqual(-2.0001);
        expect(p.a).toBeLessThanOrEqual(2.0001);
        expect(p.b).toBeGreaterThanOrEqual(-2.0001);
        expect(p.b).toBeLessThanOrEqual(2.0001);
      }
    }
  });

  it('lines run all the way into the sink at the origin', () => {
    // The closest any line gets to the origin should be ~one step (≈0.08),
    // i.e. the flow is followed into the minimum, not cut short well outside it.
    let closest = Infinity;
    for (const line of lines) {
      for (const p of line) closest = Math.min(closest, Math.hypot(p.a, p.b));
    }
    expect(closest).toBeLessThan(0.12);
  });

  it('covers the domain evenly — no large gaps', () => {
    // Bin all points into an 8×8 grid over the interior; most cells should be hit.
    const N = 8, lo = -1.8, hi = 1.8, sp = hi - lo;
    const hit = new Set<number>();
    for (const line of lines) {
      for (const p of line) {
        if (p.a < lo || p.a > hi || p.b < lo || p.b > hi) continue;
        const i = Math.min(N - 1, Math.floor(((p.a - lo) / sp) * N));
        const j = Math.min(N - 1, Math.floor(((p.b - lo) / sp) * N));
        hit.add(j * N + i);
      }
    }
    expect(hit.size).toBeGreaterThanOrEqual(Math.round(0.7 * N * N));
  });

  it('returns nothing for a flat field', () => {
    const flat: StreamlineField = { min: -2, max: 2, gradient: () => ({ a: 0, b: 0 }) };
    expect(placeStreamlines(flat, { dSep: 0.2 })).toEqual([]);
  });
});
