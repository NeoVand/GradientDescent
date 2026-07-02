/**
 * Figures that have taken the compute/render split: one function returns the
 * SVG string for either target. The app's chapter shell renders these via
 * {@html}; the book pipeline writes them to files. Ids match the figure
 * blocks in src/content/chapters/.
 */

import type { FigTheme } from './theme';
import { secantSvg } from './derivative';
import { bendSvg, regimesSvg } from './curvature';
import { proofCosineSvg } from './proofCosine';

export type { FigTheme } from './theme';

export const figureSvgs: Record<string, (theme: FigTheme) => string> = {
  'derivative-secant': secantSvg,
  'curvature-bend': bendSvg,
  'curvature-regimes': regimesSvg,
  'downhill-proof': proofCosineSvg
};
