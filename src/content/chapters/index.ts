/**
 * Chapters that have migrated to the block schema, keyed by registry slug.
 * The rest still live as markup in HelpModal.svelte — they move here one at
 * a time (the emitter and the app both read this map).
 */

import type { Block } from '../blocks';
import { chBowl } from './ch-bowl';
import { chLandscape } from './ch-landscape';
import { chShapes } from './ch-shapes';

export const chapterBlocks: Record<string, Block[]> = {
  'ch-bowl': chBowl,
  'ch-landscape': chLandscape,
  'ch-shapes': chShapes
};
