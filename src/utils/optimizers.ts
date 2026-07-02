/**
 * The app-facing optimizer surface — now a thin adapter over the n-dim core
 * in src/optim. The core is the single source of truth for every update
 * rule (one readable file per optimizer — the same files the guide's
 * reveal-the-code shows); this module keeps the app's historical two-knob
 * API exactly as it was, so the trainer, stores, race, preview, and tests
 * are untouched:
 *
 *  - params/gradients stay {a, b} records; step() stays pure (inputs are
 *    never mutated — the core's in-place buffers are private copies here);
 *  - OptimizerState keeps its one-record-fits-all shape (v, s, t + the
 *    Prodigy extras), mapped to/from each optimizer's typed core state;
 *  - the UI convention that state.v holds the LAST GRADIENT for methods
 *    with no velocity of their own (gd, adagrad, rmsprop, newton) — the
 *    marker's step-arrow overlay reads it — lives HERE, not in the core;
 *  - hyperparameter hints are reassembled into the legacy HTML tooltip
 *    format from the core's plain-text hint + hintDetail.
 */

import type { ModelParameters } from '../types/types';
import type { Hessian2 } from './hessian';
import {
  coreOptimizers,
  coreOptimizerGroups,
  type CoreOptimizer,
  type StepContext,
  type HyperparamSpec as CoreHyperparamSpec
} from '../optim';

export type OptimizerId =
  | 'gd' | 'momentum' | 'nesterov' | 'adagrad' | 'rmsprop' | 'adadelta'
  | 'adam' | 'nadam' | 'adamw' | 'radam' | 'newton' | 'sophia' | 'lion' | 'prodigy';

export interface OptimizerState {
  v: ModelParameters;
  s: ModelParameters;
  t: number;
  // --- Prodigy (parameter-free) bookkeeping; untouched by every other method ---
  d?: number;
  rNum?: number;
  sDen?: ModelParameters;
  x0?: ModelParameters;
}

export interface OptimizerStepContext {
  hessian?: Hessian2;
  /** Parameter domain, so trust regions can size themselves to the landscape. */
  range?: { min: number; max: number };
}

export interface HyperparamSpec {
  key: string;
  label: string;
  symbol: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** Tooltip text (legacy HTML format, reassembled from the core's spec). */
  hint: string;
}

export interface Optimizer {
  id: OptimizerId;
  name: string;
  description: string;
  updateRuleLatex: string;
  hyperparams: HyperparamSpec[];
  fixedLearningRate?: number;
  usesHessian?: boolean;
  init(): OptimizerState;
  step(
    params: ModelParameters,
    gradient: ModelParameters,
    state: OptimizerState,
    learningRate: number,
    hyper: Record<string, number>,
    ctx?: OptimizerStepContext
  ): { params: ModelParameters; state: OptimizerState };
}

const zero = (): ModelParameters => ({ a: 0, b: 0 });
const toVec = (p: ModelParameters) => Float64Array.of(p.a, p.b);
const toAB = (v: Float64Array): ModelParameters => ({ a: v[0], b: v[1] });

const legacyHint = (s: CoreHyperparamSpec): string =>
  s.hintDetail
    ? `${s.hint}<br/><span style="opacity:0.8;font-size:0.7rem">${s.hintDetail}</span>`
    : s.hint;

/**
 * How each optimizer's typed core state maps into the app's one-record
 * shape. `pack` builds the core state from the app record; `unpack` writes
 * it back (merging over the previous record so unused slots survive).
 * `gradInV` marks the methods whose app-state v carries the last gradient
 * purely for the UI's arrow overlay.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
interface StateMap {
  pack(s: OptimizerState): any;
  unpack(cs: any, prev: OptimizerState): OptimizerState;
  gradInV?: boolean;
}

const momentumLike: StateMap = {
  pack: (s) => ({ v: toVec(s.v), t: s.t }),
  unpack: (cs, prev) => ({ ...prev, v: toAB(cs.v), t: cs.t })
};
const sumLike: StateMap = {
  gradInV: true,
  pack: (s) => ({ s: toVec(s.s), t: s.t }),
  unpack: (cs, prev) => ({ ...prev, s: toAB(cs.s), t: cs.t })
};
const adamLike: StateMap = {
  pack: (s) => ({ m: toVec(s.v), v: toVec(s.s), t: s.t }),
  unpack: (cs, prev) => ({ ...prev, v: toAB(cs.m), s: toAB(cs.v), t: cs.t })
};

const STATE_MAPS: Record<OptimizerId, StateMap> = {
  gd: {
    gradInV: true,
    pack: (s) => ({ t: s.t }),
    unpack: (cs, prev) => ({ ...prev, t: cs.t })
  },
  momentum: momentumLike,
  nesterov: momentumLike,
  adagrad: sumLike,
  rmsprop: sumLike,
  adadelta: {
    // app: s = E[g²], v = E[Δθ²]
    pack: (s) => ({ sG: toVec(s.s), sX: toVec(s.v), t: s.t }),
    unpack: (cs, prev) => ({ ...prev, s: toAB(cs.sG), v: toAB(cs.sX), t: cs.t })
  },
  adam: adamLike,
  nadam: adamLike,
  adamw: adamLike,
  radam: adamLike,
  newton: {
    gradInV: true,
    pack: (s) => ({ t: s.t }),
    unpack: (cs, prev) => ({ ...prev, t: cs.t })
  },
  sophia: {
    pack: (s) => ({ m: toVec(s.v), h: toVec(s.s), t: s.t }),
    unpack: (cs, prev) => ({ ...prev, v: toAB(cs.m), s: toAB(cs.h), t: cs.t })
  },
  lion: {
    pack: (s) => ({ m: toVec(s.v), t: s.t }),
    unpack: (cs, prev) => ({ ...prev, v: toAB(cs.m), t: cs.t })
  },
  prodigy: {
    pack: (s) => ({
      m: toVec(s.v),
      v: toVec(s.s),
      t: s.t,
      dEst: s.d ?? NaN, // NaN = unseeded; the core seeds it on first step
      rNum: s.rNum ?? 0,
      sDen: toVec(s.sDen ?? zero()),
      x0: s.x0 ? toVec(s.x0) : null
    }),
    unpack: (cs, prev) => ({
      ...prev,
      v: toAB(cs.m),
      s: toAB(cs.v),
      t: cs.t,
      d: cs.dEst,
      rNum: cs.rNum,
      sDen: toAB(cs.sDen),
      x0: cs.x0 ? toAB(cs.x0) : undefined
    })
  }
};

function wrap(core: CoreOptimizer<any>, id: OptimizerId): Optimizer {
  const map = STATE_MAPS[id];
  return {
    id,
    name: core.name,
    description: core.description,
    updateRuleLatex: core.updateRuleLatex,
    hyperparams: core.hyperparams.map((h) => ({
      key: h.key, label: h.label, symbol: h.symbol,
      min: h.min, max: h.max, step: h.step, default: h.default,
      hint: legacyHint(h)
    })),
    fixedLearningRate: core.fixedLearningRate,
    usesHessian: core.usesHessian,
    init: () => ({ v: zero(), s: zero(), t: 0 }),
    step(params, g, state, lr, hyper, ctx) {
      const p = toVec(params);
      const gv = toVec(g);
      const coreState = map.pack(state);
      const coreCtx: StepContext | undefined = ctx
        ? {
            range: ctx.range,
            hessian: ctx.hessian
              ? Float64Array.of(ctx.hessian.h11, ctx.hessian.h12, ctx.hessian.h12, ctx.hessian.h22)
              : undefined
          }
        : undefined;
      core.step(p, gv, coreState, lr, hyper, coreCtx);
      let next = map.unpack(coreState, state);
      if (map.gradInV) next = { ...next, v: { ...g } };
      return { params: toAB(p), state: next };
    }
  };
}

export const gradientDescent = wrap(coreOptimizers.gd, 'gd');
export const momentum = wrap(coreOptimizers.momentum, 'momentum');
export const nesterov = wrap(coreOptimizers.nesterov, 'nesterov');
export const adagrad = wrap(coreOptimizers.adagrad, 'adagrad');
export const rmsprop = wrap(coreOptimizers.rmsprop, 'rmsprop');
export const adadelta = wrap(coreOptimizers.adadelta, 'adadelta');
export const adam = wrap(coreOptimizers.adam, 'adam');
export const nadam = wrap(coreOptimizers.nadam, 'nadam');
export const adamw = wrap(coreOptimizers.adamw, 'adamw');
export const radam = wrap(coreOptimizers.radam, 'radam');
export const newton = wrap(coreOptimizers.newton, 'newton');
export const sophia = wrap(coreOptimizers.sophia, 'sophia');
export const lion = wrap(coreOptimizers.lion, 'lion');
export const prodigy = wrap(coreOptimizers.prodigy, 'prodigy');

export const optimizers: Record<OptimizerId, Optimizer> = {
  gd: gradientDescent,
  momentum,
  nesterov,
  adagrad,
  rmsprop,
  adadelta,
  adam,
  nadam,
  adamw,
  radam,
  newton,
  sophia,
  lion,
  prodigy
};

/** Presentation taxonomy for the optimizer picker (mirrors the core's). */
export const optimizerGroups: { label: string; ids: OptimizerId[] }[] =
  coreOptimizerGroups.map((g) => ({ label: g.label, ids: g.ids as OptimizerId[] }));

export const optimizerOrder: OptimizerId[] = optimizerGroups.flatMap((g) => g.ids);

/** Default hyperparameter values for an optimizer, keyed by spec key. */
export function defaultHyper(id: OptimizerId): Record<string, number> {
  const out: Record<string, number> = {};
  for (const spec of optimizers[id].hyperparams) {
    out[spec.key] = spec.default;
  }
  return out;
}
