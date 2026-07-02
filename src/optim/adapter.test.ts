import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimizers, type OptimizerId } from '../utils/optimizers';
import type { ModelParameters } from '../types/types';

/**
 * The app-facing adapter must ALSO reproduce the goldens bit-for-bit — the
 * state round-trip (app record ↔ typed core state) is where a mapping bug
 * would hide, and this is the test that catches it.
 */

const goldens: Record<string, { lr: number; hyper: Record<string, number>; path: [number, number][] }> =
  JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '__goldens__', 'trajectories.json'), 'utf8'));

const grad = (p: ModelParameters): ModelParameters => ({
  a: 0.9 * p.a + 0.15 * p.b + 0.05,
  b: 0.15 * p.a + 1.7 * p.b - 0.03
});
const hess = { h11: 0.9, h12: 0.15, h22: 1.7 };
const range = { min: -7, max: 7 };

describe('the d=2 adapter reproduces the golden trajectories', () => {
  for (const [id, gold] of Object.entries(goldens)) {
    it(`${id} matches all ${gold.path.length - 1} steps through the app API`, () => {
      const opt = optimizers[id as OptimizerId];
      let params: ModelParameters = { a: gold.path[0][0], b: gold.path[0][1] };
      let state = opt.init();
      for (let t = 1; t < gold.path.length; t++) {
        const g = grad(params);
        const ctx = opt.usesHessian ? { hessian: hess, range } : { range };
        const r = opt.step(params, g, state, gold.lr, gold.hyper, ctx);
        params = r.params;
        state = r.state;
        expect(Math.abs(params.a - gold.path[t][0]), `${id} step ${t} coord a`).toBeLessThan(1e-12);
        expect(Math.abs(params.b - gold.path[t][1]), `${id} step ${t} coord b`).toBeLessThan(1e-12);
      }
    });
  }
});
