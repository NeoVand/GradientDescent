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
import { interpolateViridis } from 'd3-scale-chromatic';
import type { DataPoint, ModelParameters, ProblemConfig } from '../types/types';

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
let viridisLUT: Uint8ClampedArray | null = null;

function getViridisLUT(): Uint8ClampedArray {
  if (!viridisLUT) {
    viridisLUT = new Uint8ClampedArray(LUT_SIZE * 3);
    for (let k = 0; k < LUT_SIZE; k++) {
      const c = rgb(interpolateViridis(k / (LUT_SIZE - 1)));
      viridisLUT[k * 3] = c.r;
      viridisLUT[k * 3 + 1] = c.g;
      viridisLUT[k * 3 + 2] = c.b;
    }
  }
  return viridisLUT;
}

/**
 * Render the grid to a PNG data URL — one pixel per cell; the SVG <image>
 * scales it up with smoothing, which reads far better than 3,600 discrete
 * <rect>s and costs a single DOM node. Bright = low loss (viridis reversed),
 * with slight transparency so the theme background tints the surface like
 * the old per-rect opacity did.
 */
export function gridToImageURL(grid: LossGrid): string {
  const { res, values, logMin, logMax } = grid;
  const canvas = document.createElement('canvas');
  canvas.width = res;
  canvas.height = res;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(res, res);
  const lut = getViridisLUT();
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
