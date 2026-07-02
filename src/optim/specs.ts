/**
 * Hyperparameter specs shared across optimizer families, so Momentum and
 * Nesterov (or the four Adams) can't drift apart. Specs unique to one method
 * live in that method's own file.
 */

import type { HyperparamSpec } from './types';

export const MU_SPEC: HyperparamSpec = {
  key: 'mu',
  label: 'Momentum',
  symbol: 'μ',
  min: 0,
  max: 0.99,
  step: 0.01,
  default: 0.9,
  hint: 'How much of the last step’s velocity carries into this one — inertia.',
  hintDetail: '0 = plain gradient descent · 0.9 = heavy glide'
};

export const RHO_SPEC: HyperparamSpec = {
  key: 'rho',
  label: 'Decay',
  symbol: 'ρ',
  min: 0.5,
  max: 0.999,
  step: 0.001,
  default: 0.9,
  hint: 'How long it remembers recent gradient sizes when scaling each parameter’s step.',
  hintDetail: 'Higher = smoother, steadier per-parameter rates'
};

export const BETA1_SPEC: HyperparamSpec = {
  key: 'beta1',
  label: 'Momentum decay',
  symbol: 'β₁',
  min: 0,
  max: 0.999,
  step: 0.001,
  default: 0.9,
  hint: 'How much past gradient direction is blended in — Adam’s momentum.',
  hintDetail: 'Higher = smoother, more inertia (0.9 is typical)'
};

export const BETA2_SPEC: HyperparamSpec = {
  key: 'beta2',
  label: 'Scale decay',
  symbol: 'β₂',
  min: 0.8,
  max: 0.9999,
  step: 0.0001,
  default: 0.999,
  hint: 'How steadily each parameter’s step size adapts to recent gradient sizes.',
  hintDetail: 'Higher = slower, smoother rate changes (0.999 is typical)'
};
