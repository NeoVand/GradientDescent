/**
 * Tests for the blue-noise (Poisson-disk) sampler used to place the arrows.
 * The properties that matter: points stay ≥ radius apart (no overlap), the
 * layout is deterministic (so arrows don't reshuffle on redraw), points stay
 * in-bounds, and coverage is even.
 */
import { describe, it, expect } from 'vitest';
import { poissonDiskSample } from './poisson';

describe('poissonDiskSample', () => {
  const min = -2, max = 2, radius = 0.35;
  const pts = poissonDiskSample(min, max, radius);

  it('produces a healthy number of points', () => {
    expect(pts.length).toBeGreaterThanOrEqual(20);
  });

  it('keeps every point inside the domain', () => {
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(min);
      expect(p.x).toBeLessThanOrEqual(max);
      expect(p.y).toBeGreaterThanOrEqual(min);
      expect(p.y).toBeLessThanOrEqual(max);
    }
  });

  it('keeps every pair at least `radius` apart', () => {
    let minDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        minDist = Math.min(minDist, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
      }
    }
    expect(minDist).toBeGreaterThanOrEqual(radius * 0.999);
  });

  it('is deterministic — same arguments give the same layout', () => {
    const again = poissonDiskSample(min, max, radius);
    expect(again).toEqual(pts);
  });

  it('covers the domain evenly', () => {
    const N = 6, lo = -1.7, hi = 1.7, sp = hi - lo;
    const hit = new Set<number>();
    for (const p of pts) {
      if (p.x < lo || p.x > hi || p.y < lo || p.y > hi) continue;
      const i = Math.min(N - 1, Math.floor(((p.x - lo) / sp) * N));
      const j = Math.min(N - 1, Math.floor(((p.y - lo) / sp) * N));
      hit.add(j * N + i);
    }
    expect(hit.size).toBeGreaterThanOrEqual(Math.round(0.85 * N * N));
  });

  it('returns nothing for a degenerate domain', () => {
    expect(poissonDiskSample(0, 0, 0.1)).toEqual([]);
    expect(poissonDiskSample(-1, 1, 0)).toEqual([]);
  });
});
