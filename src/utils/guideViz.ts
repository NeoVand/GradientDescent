/**
 * Layered visualization for the guide's two landscape figures (the ravine and
 * the 14-optimizer race), mirroring the app's Loss & Gradient "Layers" control:
 * a selectable colormap density, iso-loss contours, and an optional gradient
 * field of −∇ℒ arrows. The figures own analytic loss/gradient functions, so
 * these helpers work off a raw value grid + a screen-mapping pair rather than
 * the app's data-driven LossGrid.
 */
import { rgb, geoPath } from 'd3';
import { contours } from 'd3-contour';
import {
  interpolateViridis, interpolateMagma, interpolateInferno,
  interpolatePlasma, interpolateCividis, interpolateCubehelixDefault
} from 'd3-scale-chromatic';
import type { Colormap, FieldDensity, FieldMode } from '../stores/stores';

export { colormapStops } from './lossGrid';
export type { Colormap, FieldDensity, FieldMode };

export type VizState = { field: FieldMode; contours: boolean; colormap: Colormap; density: FieldDensity };
/** The guide's defaults: same as Loss & Gradient but with the field OFF. */
export const GUIDE_VIZ_DEFAULT: VizState = { field: 'off', contours: true, colormap: 'cubehelix', density: 'normal' };

export const COLORMAPS: Colormap[] = ['viridis', 'magma', 'inferno', 'plasma', 'cividis', 'cubehelix'];
const INTERP: Record<Colormap, (t: number) => string> = {
  viridis: interpolateViridis, magma: interpolateMagma, inferno: interpolateInferno,
  plasma: interpolatePlasma, cividis: interpolateCividis, cubehelix: interpolateCubehelixDefault
};
/** Colormap colors low→high as an array (for an in-SVG <linearGradient>). */
export function cmapStopColors(cmap: Colormap, n = 8): string[] {
  const interp = INTERP[cmap] ?? interpolateViridis;
  const out: string[] = [];
  for (let k = 0; k <= n; k++) out.push(interp(k / n));
  return out;
}

// Density drives contour-ring count and field resolution together (app parity).
export const CONTOUR_N: Record<FieldDensity, number> = { sparse: 9, normal: 16, dense: 28 };
export const FIELD_RES: Record<FieldDensity, number> = { sparse: 10, normal: 15, dense: 22 };

const EPS = 0.001;

/** Re-tint a value grid to a PNG data URL with the chosen colormap (log loss,
 *  reversed so bright = low loss, faintly translucent like the app). */
export function tintGridURL(
  vals: number[], gw: number, gh: number, logMin: number, logMax: number, cmap: Colormap
): string {
  const interp = INTERP[cmap] ?? interpolateViridis;
  const canvas = document.createElement('canvas');
  canvas.width = gw; canvas.height = gh;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(gw, gh);
  const span = logMax - logMin || 1;
  for (let k = 0; k < vals.length; k++) {
    const t = Math.min(1, Math.max(0, (Math.log(vals[k] + EPS) - logMin) / span));
    const c = rgb(interp(1 - t));
    img.data[k * 4] = c.r; img.data[k * 4 + 1] = c.g; img.data[k * 4 + 2] = c.b; img.data[k * 4 + 3] = 220;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/** Log-spaced contour paths (in grid space; scale to screen at render). */
export function contourPathsFor(
  vals: number[], gw: number, gh: number, logMin: number, logMax: number, count: number
): { d: string; o: number }[] {
  const levels: number[] = [];
  for (let k = 1; k < count; k++) levels.push(Math.exp(logMin + (k / count) * (logMax - logMin)) - EPS);
  const toPath = geoPath();
  return contours().size([gw, gh]).thresholds(levels)(vals)
    .map((poly, idx) => ({ d: toPath(poly) ?? '', o: 0.1 + 0.02 * idx }));
}

export type Grad = (x: number, y: number) => [number, number];
export type Mapper = { px: (x: number) => number; py: (y: number) => number };
export type Domain = { x0: number; x1: number; y0: number; y1: number };

export type FieldArrow = { x1: number; y1: number; x2: number; y2: number; o: number; w: number };

/** Evenly-spaced −∇ℒ arrows in screen space; length ∝ |∇ℒ| (steep = bold). */
export function fieldArrows(grad: Grad, dom: Domain, map: Mapper, res: number): FieldArrow[] {
  const { x0, x1, y0, y1 } = dom;
  const sxs = (map.px(x1) - map.px(x0)) / (x1 - x0);
  const sys = (map.py(y1) - map.py(y0)) / (y1 - y0); // negative (y flips)
  const cols = res;
  const rows = Math.max(3, Math.round(res * Math.abs((y1 - y0) * sys) / Math.abs((x1 - x0) * sxs)));
  const cellW = Math.abs((x1 - x0) * sxs) / cols, cellH = Math.abs((y1 - y0) * sys) / rows;
  const maxLen = Math.min(cellW, cellH) * 0.62;
  let maxMag = 0;
  const raw: { sx: number; sy: number; dsx: number; dsy: number; mag: number }[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = x0 + (x1 - x0) * ((i + 0.5) / cols), y = y0 + (y1 - y0) * ((j + 0.5) / rows);
    const [gx, gy] = grad(x, y), mag = Math.hypot(gx, gy);
    if (Number.isFinite(mag) && mag > maxMag) maxMag = mag;
    raw.push({ sx: map.px(x), sy: map.py(y), dsx: -gx * sxs, dsy: -gy * sys, mag });
  }
  if (!(maxMag > 0)) return [];
  const out: FieldArrow[] = [];
  for (const r of raw) {
    if (!(r.mag > 1e-9)) continue;
    const norm = r.mag / maxMag;
    const len = maxLen * (0.3 + 0.7 * norm);
    const dm = Math.hypot(r.dsx, r.dsy) || 1;
    out.push({
      x1: r.sx, y1: r.sy,
      x2: r.sx + (r.dsx / dm) * len, y2: r.sy + (r.dsy / dm) * len,
      o: 0.3 + 0.5 * norm, w: 0.6 + 0.5 * norm
    });
  }
  return out;
}
