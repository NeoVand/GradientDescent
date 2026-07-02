import { describe, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimizers, defaultHyper, optimizerOrder, type OptimizerId } from '../utils/optimizers';
import type { ModelParameters } from '../types/types';
import type { Hessian2 } from '../utils/hessian';

/**
 * Golden-trajectory generator — run ONCE against a known-good implementation:
 *
 *   GEN_GOLDENS=1 npx vitest run src/optim/goldens.gen.test.ts
 *
 * Writes exact 60-step trajectories for every optimizer to
 * __goldens__/trajectories.json. The equivalence suite then holds any
 * reimplementation to these numbers at 1e-12. Without the env flag this
 * file is a no-op, so the goldens can never be overwritten by accident.
 */

// A smooth deterministic scenario with coupling between the two coordinates,
// so per-coordinate bugs and index swaps can't cancel out. Its Jacobian is the
// constant SPD matrix H below — exactly the Hessian handed to Newton/Sophia.
const grad = (p: ModelParameters): ModelParameters => ({
  a: 0.9 * p.a + 0.15 * p.b + 0.05,
  b: 0.15 * p.a + 1.7 * p.b - 0.03
});
const hess: Hessian2 = { h11: 0.9, h12: 0.15, h22: 1.7 };
const range = { min: -7, max: 7 };
const START: ModelParameters = { a: 3.2, b: -2.4 };
const STEPS = 60;

describe.runIf(process.env.GEN_GOLDENS === '1')('generate golden trajectories', () => {
  it('writes __goldens__/trajectories.json', () => {
    const out: Record<string, { lr: number; hyper: Record<string, number>; path: [number, number][] }> = {};
    for (const id of optimizerOrder as OptimizerId[]) {
      const opt = optimizers[id];
      const lr = opt.fixedLearningRate ?? 0.05;
      const hyper = defaultHyper(id);
      let params = { ...START };
      let state = opt.init();
      const path: [number, number][] = [[params.a, params.b]];
      for (let t = 0; t < STEPS; t++) {
        const g = grad(params);
        const ctx = opt.usesHessian ? { hessian: hess, range } : { range };
        const r = opt.step(params, g, state, lr, hyper, ctx);
        params = r.params;
        state = r.state;
        path.push([params.a, params.b]);
      }
      out[id] = { lr, hyper, path };
    }
    const dir = join(dirname(fileURLToPath(import.meta.url)), '__goldens__');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'trajectories.json'), JSON.stringify(out));
  });
});
