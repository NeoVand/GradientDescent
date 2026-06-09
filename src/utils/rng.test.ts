/**
 * Seeded RNG determinism tests: the same seed must replay the same data,
 * which is what makes the noise/points sliders smooth deformations and
 * (later) URLs shareable.
 */

import { describe, it, expect } from 'vitest';
import { setSeed, rand, shuffle } from './rng';
import { problemConfigs } from './problems';

describe('seeded rng', () => {
  it('same seed replays the same sequence', () => {
    setSeed(42);
    const first = [rand(), rand(), rand(), rand()];
    setSeed(42);
    const second = [rand(), rand(), rand(), rand()];
    expect(second).toEqual(first);
  });

  it('different seeds give different sequences', () => {
    setSeed(1);
    const a = [rand(), rand(), rand()];
    setSeed(2);
    const b = [rand(), rand(), rand()];
    expect(a).not.toEqual(b);
  });

  it('values stay in [0, 1)', () => {
    setSeed(7);
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('shuffle is a seed-deterministic permutation', () => {
    setSeed(99);
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    setSeed(99);
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(b).toEqual(a);
    expect([...a].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('generateData is fully reproducible from a seed', () => {
    for (const config of Object.values(problemConfigs)) {
      setSeed(1234);
      const first = config.generateData(12, 0.8, 0.3);
      setSeed(1234);
      const second = config.generateData(12, 0.8, 0.3);
      expect(second, config.type).toEqual(first);
    }
  });
});
