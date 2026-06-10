/**
 * Basin-map tests on surfaces with known basin structure.
 */

import { describe, it, expect } from 'vitest';
import { computeBasinMap } from './basinMap';
import { problemConfigs } from './problems';

describe('computeBasinMap', () => {
  it('finds exactly two basins on the 1D double well, split at the barrier', () => {
    const config = problemConfigs['double-well-1d'];
    const range = config.parameterRange!;
    const r = computeBasinMap(config, [], range, 0.1, 96, true);

    expect(r.minima.length).toBe(2);
    const sorted = [...r.minima].sort((a, b) => a.a - b.a);
    expect(sorted[0].a).toBeCloseTo(-2.14, 1); // global
    expect(sorted[1].a).toBeCloseTo(1.84, 1); // local trap

    // Far-left cell flows to the global min, far-right to the trap
    const span = range.max - range.min;
    const cellAt = (alpha: number) => r.cells[Math.floor(((alpha - range.min) / span) * r.res)];
    const left = cellAt(-3.2);
    const right = cellAt(3.2);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeGreaterThanOrEqual(0);
    expect(left).not.toBe(right);
    expect(r.minima[left].a).toBeCloseTo(sorted[0].a, 1);
    expect(r.minima[right].a).toBeCloseTo(sorted[1].a, 1);
  });

  it('finds all four Himmelblau minima', () => {
    const config = problemConfigs['himmelblau'];
    const r = computeBasinMap(config, [], config.parameterRange!, 0.002, 48, false);

    expect(r.minima.length).toBe(4);
    const known = [
      { a: 3, b: 2 },
      { a: -2.805, b: 3.131 },
      { a: -3.779, b: -3.283 },
      { a: 3.584, b: -1.848 }
    ];
    for (const k of known) {
      const hit = r.minima.some(m => Math.hypot(m.a - k.a, m.b - k.b) < 0.2);
      expect(hit, `minimum near (${k.a}, ${k.b})`).toBe(true);
    }
  });
});
