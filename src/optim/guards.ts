/**
 * ⚠ CLASSROOM GUARDS
 *
 * Safety rails that keep exotic optimizers teachable on wild two-knob toy
 * landscapes — NOT part of the published algorithms. Every use site carries
 * the same ⚠ CLASSROOM GUARD banner, every deviation is listed in
 * DEVIATIONS.md, and passing ctx.guards === false runs the paper-faithful
 * update instead.
 */

import type { StepContext, Vec } from './types';

/** Guards default ON; only an explicit false disables them. */
export const guardsOn = (ctx?: StepContext): boolean => ctx?.guards !== false;

/**
 * The landscape's width, for sizing trust regions relative to the world the
 * marker lives in. Falls back to the app's historical ±7 domain.
 */
export const spanOf = (ctx?: StepContext): number =>
  ctx?.range ? ctx.range.max - ctx.range.min : 14;

/**
 * Cap a step vector to a trust region: if it is longer than `radius`,
 * rescale it (in place) to exactly `radius`, preserving direction.
 */
export function trustRegionClip(step: Vec, radius: number): void {
  let sq = 0;
  for (let i = 0; i < step.length; i++) sq += step[i] * step[i];
  const mag = Math.sqrt(sq);
  if (mag > radius) {
    const k = radius / mag;
    for (let i = 0; i < step.length; i++) step[i] *= k;
  }
}
