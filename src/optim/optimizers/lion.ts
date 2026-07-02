/**
 * Lion ("EvoLved Sign Momentum") — Chen et al., 2023 (arXiv:2302.06675);
 * found by program search, not designed.
 *
 * Idea: throw out the adaptive rescaling everyone had been copying. Blend
 * momentum with the fresh gradient, keep only the SIGN — every step has the
 * same magnitude γ on each axis no matter how steep the slope. One buffer,
 * no squared-gradient term, strikingly light.
 * State: m (momentum buffer), t.
 * Deviations: the paper's decoupled weight decay is dropped — this lab's
 * losses carry no regularizer for it to act on.
 */

import type { CoreOptimizer, HyperparamSpec, Vec } from '../types';
import { zeros } from '../types';

const LION_BETA1: HyperparamSpec = {
  key: 'beta1',
  label: 'Direction blend',
  symbol: 'β₁',
  min: 0,
  max: 0.999,
  step: 0.001,
  default: 0.9,
  hint: 'Balances stored momentum against the fresh gradient to pick the step direction.',
  hintDetail: 'Lion then steps a fixed size along that direction’s sign'
};

const LION_BETA2: HyperparamSpec = {
  key: 'beta2',
  label: 'Momentum decay',
  symbol: 'β₂',
  min: 0.9,
  max: 0.9999,
  step: 0.0001,
  default: 0.99,
  hint: 'How long the momentum buffer remembers past gradients.',
  hintDetail: 'Higher = more inertia'
};

export interface LionState {
  m: Vec;
  t: number;
}

export const lion: CoreOptimizer<LionState> = {
  id: 'lion',
  name: 'Lion',
  description: 'Sign of momentum: fixed-size steps, very light',
  updateRuleLatex: String.raw`\mathbf{c} \leftarrow \beta_1 \mathbf{m} + (1{-}\beta_1)\nabla\mathcal{L}, \;\; \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\,\operatorname{sign}(\mathbf{c}), \;\; \mathbf{m} \leftarrow \beta_2 \mathbf{m} + (1{-}\beta_2)\nabla\mathcal{L}`,
  hyperparams: [LION_BETA1, LION_BETA2],
  fixedLearningRate: 0.05,
  init: (d) => ({ m: zeros(d), t: 0 }),
  step(p: Vec, g: Vec, st, lr, hyper) {
    const b1 = hyper.beta1 ?? LION_BETA1.default;
    const b2 = hyper.beta2 ?? LION_BETA2.default;
    for (let i = 0; i < p.length; i++) {
      // [eq:c] the step direction: a momentum-heavy blend…
      const c = b1 * st.m[i] + (1 - b1) * g[i];
      // [eq:step] …of which only the SIGN survives — magnitude is always γ
      p[i] -= lr * Math.sign(c);
      // [eq:m] the buffer itself updates with its own, slower decay
      st.m[i] = b2 * st.m[i] + (1 - b2) * g[i];
    }
    st.t++;
  }
};
