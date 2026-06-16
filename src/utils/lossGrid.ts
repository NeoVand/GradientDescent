/**
 * Central loss-landscape computation.
 *
 * One grid of loss values per (training data, problem) pair feeds every
 * consumer: the heatmap (rendered once to an offscreen canvas), the contour
 * lines, and — later — a 3D surface. The grid lives in *parameter space*,
 * so theme toggles and window resizes never trigger a recompute; only data
 * or problem changes do.
 *
 * The grid covers the visible range extended by 20% on each side so contour
 * lines run smoothly past the frame instead of closing along its edge.
 * Color/threshold normalization uses min/max over the *visible* subregion
 * only, so off-screen extremes (e.g. Exponential Decay blowing up outside
 * the frame) can't wash out the visible palette.
 */

import { rgb } from 'd3';
import {
  interpolateViridis,
  interpolateMagma,
  interpolateInferno,
  interpolatePlasma,
  interpolateCividis,
  interpolateTurbo
} from 'd3-scale-chromatic';
import type { DataPoint, ModelParameters, ProblemConfig } from '../types/types';
// Type-only import (erased at build time, so no runtime cycle with stores).
import type { Colormap } from '../stores/stores';

const INTERPOLATORS: Record<Colormap, (t: number) => string> = {
  viridis: interpolateViridis,
  magma: interpolateMagma,
  inferno: interpolateInferno,
  plasma: interpolatePlasma,
  cividis: interpolateCividis,
  turbo: interpolateTurbo
};

export interface ParameterRange {
  min: number;
  max: number;
}

export interface LossGrid {
  /** Cells per axis of the extended grid. */
  res: number;
  /** Extended parameter range actually covered by the grid. */
  extMin: number;
  extMax: number;
  /** Visible parameter range (what the axes show). */
  range: ParameterRange;
  /**
   * Loss values, values[j * res + i]; i indexes α ascending, j indexes β
   * ascending. Samples sit at *cell centers*: α(i) = extMin + ((i + 0.5) / res)
   * · span — the same convention d3-contour and a res×res canvas image use,
   * so heatmap pixels and contour lines align exactly.
   */
  values: Float64Array;
  /** Loss extrema over the visible subregion (drives color + contour levels). */
  visMin: number;
  visMax: number;
  logMin: number;
  logMax: number;
  /** Log-spaced contour levels between visMin and visMax. */
  thresholds: number[];
}

/** Matches the historical log(loss + 0.001) color mapping. */
const LOG_EPS = 0.001;
const NUM_CONTOURS = 12;

export function computeLossGrid(
  data: DataPoint[],
  config: ProblemConfig,
  range: ParameterRange,
  res: number = 110,
  extend: number = 0.2
): LossGrid {
  const span = range.max - range.min;
  const extMin = range.min - span * extend;
  const extMax = range.max + span * extend;
  const extSpan = extMax - extMin;

  const values = new Float64Array(res * res);
  let visMin = Infinity;
  let visMax = -Infinity;

  for (let j = 0; j < res; j++) {
    const b = extMin + ((j + 0.5) / res) * extSpan;
    const bVisible = b >= range.min && b <= range.max;
    for (let i = 0; i < res; i++) {
      const a = extMin + ((i + 0.5) / res) * extSpan;
      let loss = config.computeLoss(data, { a, b });
      // Keep the grid finite so contours and color mapping never see NaN/∞.
      if (!Number.isFinite(loss)) loss = 1e300;
      values[j * res + i] = loss;
      if (bVisible && a >= range.min && a <= range.max) {
        if (loss < visMin) visMin = loss;
        if (loss > visMax) visMax = loss;
      }
    }
  }

  if (!Number.isFinite(visMin) || visMin === Infinity) {
    visMin = 0;
    visMax = 1;
  }

  const logMin = Math.log(visMin + LOG_EPS);
  const logMax = Math.log(visMax + LOG_EPS);

  const thresholds: number[] = [];
  for (let k = 1; k < NUM_CONTOURS; k++) {
    thresholds.push(Math.exp(logMin + (k / NUM_CONTOURS) * (logMax - logMin)) - LOG_EPS);
  }

  return { res, extMin, extMax, range, values, visMin, visMax, logMin, logMax, thresholds };
}

// ---------- Heatmap rendering (offscreen canvas → data URL) ----------

const LUT_SIZE = 256;
// One 256-entry byte LUT per colormap, built on first use. Keyed by name so a
// colormap switch can't return stale bytes (the old single-cache bug).
const lutCache: Partial<Record<Colormap, Uint8ClampedArray>> = {};

function getLUT(cmap: Colormap = 'viridis'): Uint8ClampedArray {
  let lut = lutCache[cmap];
  if (!lut) {
    lut = new Uint8ClampedArray(LUT_SIZE * 3);
    const interp = INTERPOLATORS[cmap] ?? interpolateViridis;
    for (let k = 0; k < LUT_SIZE; k++) {
      const c = rgb(interp(k / (LUT_SIZE - 1)));
      lut[k * 3] = c.r;
      lut[k * 3 + 1] = c.g;
      lut[k * 3 + 2] = c.b;
    }
    lutCache[cmap] = lut;
  }
  return lut;
}

/** CSS color stops for a colormap, low→high — for the legend bar. */
export function colormapStops(cmap: Colormap = 'viridis', steps = 8): string {
  const interp = INTERPOLATORS[cmap] ?? interpolateViridis;
  const parts: string[] = [];
  for (let k = 0; k <= steps; k++) parts.push(interp(k / steps));
  return parts.join(', ');
}

/**
 * Render the grid to a PNG data URL — one pixel per cell; the SVG <image>
 * scales it up with smoothing, which reads far better than 3,600 discrete
 * <rect>s and costs a single DOM node. Bright = low loss (viridis reversed),
 * with slight transparency so the theme background tints the surface like
 * the old per-rect opacity did.
 */
export function gridToImageURL(grid: LossGrid, cmap: Colormap = 'viridis'): string {
  const { res, values, logMin, logMax } = grid;
  const canvas = document.createElement('canvas');
  canvas.width = res;
  canvas.height = res;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(res, res);
  const lut = getLUT(cmap);
  const logSpan = logMax - logMin || 1;

  for (let j = 0; j < res; j++) {
    const row = res - 1 - j; // canvas y points down; β points up
    for (let i = 0; i < res; i++) {
      let t = (Math.log(values[j * res + i] + LOG_EPS) - logMin) / logSpan;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const k = Math.round((1 - t) * (LUT_SIZE - 1));
      const o = (row * res + i) * 4;
      img.data[o] = lut[k * 3];
      img.data[o + 1] = lut[k * 3 + 1];
      img.data[o + 2] = lut[k * 3 + 2];
      img.data[o + 3] = 217; // ≈ 0.85
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/**
 * Bilinear sample of the loss at parameter point (a, b), clamped to the
 * grid. Used by the 3D surface to place the marker and descent path at the
 * exact surface height.
 */
export function sampleLoss(grid: LossGrid, a: number, b: number): number {
  const { res, extMin, extMax, values } = grid;
  const span = extMax - extMin;
  // Invert the cell-center convention: sample i sits at extMin + (i+0.5)/res·span
  const fi = ((a - extMin) / span) * res - 0.5;
  const fj = ((b - extMin) / span) * res - 0.5;
  const i0 = Math.max(0, Math.min(res - 1, Math.floor(fi)));
  const j0 = Math.max(0, Math.min(res - 1, Math.floor(fj)));
  const i1 = Math.min(res - 1, i0 + 1);
  const j1 = Math.min(res - 1, j0 + 1);
  const tx = Math.max(0, Math.min(1, fi - i0));
  const ty = Math.max(0, Math.min(1, fj - j0));

  const v00 = values[j0 * res + i0];
  const v10 = values[j0 * res + i1];
  const v01 = values[j1 * res + i0];
  const v11 = values[j1 * res + i1];
  const top = v00 + (v10 - v00) * tx;
  const bot = v01 + (v11 - v01) * tx;
  return top + (bot - top) * ty;
}

/**
 * Normalized log-height t ∈ [0, 1] for a loss value — the SAME mapping the
 * heatmap colors use, so 3D height and 2D color always agree.
 */
export function normalizedLogLoss(grid: LossGrid, loss: number): number {
  const span = grid.logMax - grid.logMin || 1;
  const t = (Math.log(loss + LOG_EPS) - grid.logMin) / span;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Colormap RGB for normalized t ∈ [0, 1] as 0–1 floats (bright = t high). */
export function viridisRGB(t: number, cmap: Colormap = 'viridis'): [number, number, number] {
  const lut = getLUT(cmap);
  const k = Math.max(0, Math.min(LUT_SIZE - 1, Math.round(t * (LUT_SIZE - 1))));
  return [lut[k * 3] / 255, lut[k * 3 + 1] / 255, lut[k * 3 + 2] / 255];
}

// ---------- Gradient vector field ----------

export interface FieldArrow {
  a: number;
  b: number;
  ga: number;
  gb: number;
  mag: number;
}

export interface VectorField {
  arrows: FieldArrow[];
  maxMag: number;
}

export function computeVectorField(
  data: DataPoint[],
  config: ProblemConfig,
  range: ParameterRange,
  res: number = 24
): VectorField {
  const arrows: FieldArrow[] = [];
  let maxMag = 0;

  for (let i = 0; i < res; i++) {
    for (let j = 0; j < res; j++) {
      const a = range.min + (i / (res - 1)) * (range.max - range.min);
      const b = range.min + (j / (res - 1)) * (range.max - range.min);
      const g: ModelParameters = config.computeGradient(data, { a, b });
      const mag = Math.hypot(g.a, g.b);
      if (Number.isFinite(mag) && mag > 0.001) {
        arrows.push({ a, b, ga: g.a, gb: g.b, mag });
        if (mag > maxMag) maxMag = mag;
      }
    }
  }

  return { arrows, maxMag };
}
