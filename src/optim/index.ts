/**
 * Public surface of the optimizer core. One import site for the fourteen
 * methods, their registry, and the presentation taxonomy — plus the types
 * and guards a consumer needs to drive them.
 */

export * from './types';
export { guardsOn, spanOf, trustRegionClip } from './guards';
export { MU_SPEC, RHO_SPEC, BETA1_SPEC, BETA2_SPEC } from './specs';

export { gd, type GdState } from './optimizers/gd';
export { momentum, type MomentumState } from './optimizers/momentum';
export { nesterov, type NesterovState } from './optimizers/nesterov';
export { adagrad, type AdagradState } from './optimizers/adagrad';
export { rmsprop, type RmspropState } from './optimizers/rmsprop';
export { adadelta, type AdadeltaState } from './optimizers/adadelta';
export { adam, type AdamState } from './optimizers/adam';
export { nadam, type NadamState } from './optimizers/nadam';
export { adamw, type AdamwState } from './optimizers/adamw';
export { radam, type RadamState } from './optimizers/radam';
export { newton, type NewtonState } from './optimizers/newton';
export { sophia, type SophiaState } from './optimizers/sophia';
export { lion, type LionState } from './optimizers/lion';
export { prodigy, type ProdigyState } from './optimizers/prodigy';

import type { CoreOptimizer } from './types';
import { gd } from './optimizers/gd';
import { momentum } from './optimizers/momentum';
import { nesterov } from './optimizers/nesterov';
import { adagrad } from './optimizers/adagrad';
import { rmsprop } from './optimizers/rmsprop';
import { adadelta } from './optimizers/adadelta';
import { adam } from './optimizers/adam';
import { nadam } from './optimizers/nadam';
import { adamw } from './optimizers/adamw';
import { radam } from './optimizers/radam';
import { newton } from './optimizers/newton';
import { sophia } from './optimizers/sophia';
import { lion } from './optimizers/lion';
import { prodigy } from './optimizers/prodigy';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const coreOptimizers: Record<string, CoreOptimizer<any>> = {
  gd, momentum, nesterov, adagrad, rmsprop, adadelta,
  adam, nadam, adamw, radam, newton, sophia, lion, prodigy
};

/**
 * Presentation taxonomy: short section labels that drive picker dividers.
 * The flat order is derived, so the two can never drift apart.
 */
export const coreOptimizerGroups: { label: string; ids: string[] }[] = [
  { label: 'Baseline', ids: ['gd'] },
  { label: 'Momentum', ids: ['momentum', 'nesterov'] },
  { label: 'Adaptive rates', ids: ['adagrad', 'rmsprop', 'adadelta'] },
  { label: 'Adam family', ids: ['adam', 'nadam', 'adamw', 'radam'] },
  { label: 'Sign-based', ids: ['lion'] },
  { label: 'Second-order', ids: ['newton', 'sophia'] },
  { label: 'Parameter-free', ids: ['prodigy'] }
];
