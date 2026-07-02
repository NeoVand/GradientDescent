import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coreOptimizers } from './index';

/**
 * The core must reproduce the golden trajectories captured from the app's
 * original hand-written 2-parameter implementation — every optimizer, every
 * step, to near machine precision. This is the contract that let the n-dim
 * rewrite happen at all.
 */

const goldens: Record<string, { lr: number; hyper: Record<string, number>; path: [number, number][] }> =
  JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '__goldens__', 'trajectories.json'), 'utf8'));

// The goldens' scenario (see goldens.gen.test.ts): SPD-coupled gradient whose
// Jacobian is the constant Hessian below.
const gradOf = (p: Float64Array): Float64Array =>
  Float64Array.of(0.9 * p[0] + 0.15 * p[1] + 0.05, 0.15 * p[0] + 1.7 * p[1] - 0.03);
const HESSIAN = Float64Array.of(0.9, 0.15, 0.15, 1.7);
const RANGE = { min: -7, max: 7 };

describe('n-dim core reproduces the golden trajectories', () => {
  for (const [id, gold] of Object.entries(goldens)) {
    it(`${id} matches all ${gold.path.length - 1} steps`, () => {
      const opt = coreOptimizers[id];
      expect(opt, `core optimizer ${id} missing`).toBeDefined();
      const p = Float64Array.of(gold.path[0][0], gold.path[0][1]);
      const state = opt.init(2);
      for (let t = 1; t < gold.path.length; t++) {
        const g = gradOf(p);
        opt.step(p, g, state, gold.lr, gold.hyper, opt.usesHessian ? { hessian: HESSIAN, range: RANGE } : { range: RANGE });
        expect(Math.abs(p[0] - gold.path[t][0]), `${id} step ${t} coord a`).toBeLessThan(1e-12);
        expect(Math.abs(p[1] - gold.path[t][1]), `${id} step ${t} coord b`).toBeLessThan(1e-12);
      }
    });
  }
});
