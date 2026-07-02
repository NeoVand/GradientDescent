/**
 * Chapters that have migrated to the block schema, keyed by registry slug.
 * The rest still live as markup in HelpModal.svelte — they move here one at
 * a time (the emitter and the app both read this map).
 */

import type { Block } from '../blocks';
import { chBowl } from './ch-bowl';
import { chLandscape } from './ch-landscape';
import { chShapes } from './ch-shapes';
import { chDerivative } from './ch-derivative';
import { chDownhill } from './ch-downhill';
import { chStep } from './ch-step';
import { chGamma } from './ch-gamma';
import { chCurvature } from './ch-curvature';
import { chSchedule } from './ch-schedule';

export const chapterBlocks: Record<string, Block[]> = {
  'ch-bowl': chBowl,
  'ch-landscape': chLandscape,
  'ch-shapes': chShapes,
  'ch-derivative': chDerivative,
  'ch-downhill': chDownhill,
  'ch-step': chStep,
  'ch-gamma': chGamma,
  'ch-curvature': chCurvature,
  'ch-schedule': chSchedule
};
