/**
 * Basins of attraction: from every cell of a grid, run plain gradient
 * descent and see WHERE it ends up. Cells that settle into the same
 * stationary point form one basin; coloring cells by destination turns
 * "your start decides your fate" into a literal map.
 *
 * Pure compute — no DOM — so it runs inside the Web Worker and directly
 * under vitest. The simulation uses plain GD with the supplied γ, which
 * makes the map an honest function of the learning rate: crank γ and
 * basins genuinely shatter.
 */

import type { DataPoint, ProblemConfig } from '../types/types';

export interface BasinResult {
  res: number;
  /** Per-cell basin index (row-major, j*res+i, β ascending like LossGrid), −1 = diverged/unsettled. */
  cells: Int16Array;
  /** One representative minimum (cluster centroid) per basin. */
  minima: { a: number; b: number }[];
  oneParam: boolean;
}

const MAX_STEPS = 400;
const MAX_CLUSTERS = 12;

export function computeBasinMap(
  config: ProblemConfig,
  data: DataPoint[],
  range: { min: number; max: number },
  learningRate: number,
  res: number,
  oneParam: boolean,
  onProgress?: (frac: number) => void
): BasinResult {
  const span = range.max - range.min;
  const blowUp = 50 * span;
  // "Settled" = the step got tiny relative to the landscape's size.
  const stepTol = 1e-6 * span;
  const rows = oneParam ? 1 : res;

  const cells = new Int16Array(res * rows).fill(-1);
  const centroids: { a: number; b: number; n: number }[] = [];
  const eps = 0.03 * span;
  const epsSq = eps * eps;
  // Cells still drifting when the step budget runs out (slow shallow
  // valleys): remember where they got to and assign them to the nearest
  // discovered minimum afterwards, so a convex bowl reads as ONE basin
  // instead of a fast-core surrounded by "unsettled" gray.
  const laggards: { idx: number; a: number; b: number }[] = [];

  for (let j = 0; j < rows; j++) {
    const b0 = oneParam ? 0 : range.min + ((j + 0.5) / res) * span;
    for (let i = 0; i < res; i++) {
      let a = range.min + ((i + 0.5) / res) * span;
      let b = b0;
      let settled = false;
      let alive = true;

      for (let s = 0; s < MAX_STEPS; s++) {
        const g = config.computeGradient(data, { a, b });
        const da = -learningRate * g.a;
        const db = oneParam ? 0 : -learningRate * g.b;
        a += da;
        b += db;
        if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > blowUp || Math.abs(b) > blowUp) {
          alive = false;
          break; // diverged
        }
        if (Math.hypot(da, db) < stepTol) {
          settled = true;
          break;
        }
      }

      if (!settled) {
        if (alive) laggards.push({ idx: j * res + i, a, b });
        continue; // stays −1 for now
      }

      // Assign to the nearest existing destination, or open a new one.
      let best = -1;
      let bestD = epsSq;
      for (let c = 0; c < centroids.length; c++) {
        const dx = centroids[c].a - a;
        const dy = centroids[c].b - b;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (best === -1) {
        if (centroids.length >= MAX_CLUSTERS) continue; // overflow → unsettled gray
        centroids.push({ a, b, n: 1 });
        best = centroids.length - 1;
      } else {
        const c = centroids[best];
        c.a += (a - c.a) / (c.n + 1);
        c.b += (b - c.b) / (c.n + 1);
        c.n++;
      }
      cells[j * res + i] = best;
    }
    if (onProgress && (j & 7) === 0) onProgress(j / rows);
  }

  // Merge near-duplicate destinations (long shallow valleys can fragment),
  // then compact indices so colors stay stable and dense.
  const mergeEps = 0.05 * span;
  const remap = new Int16Array(centroids.length);
  const merged: { a: number; b: number; n: number }[] = [];
  for (let c = 0; c < centroids.length; c++) {
    let target = -1;
    for (let m = 0; m < merged.length; m++) {
      if (Math.hypot(merged[m].a - centroids[c].a, merged[m].b - centroids[c].b) < mergeEps) {
        target = m;
        break;
      }
    }
    if (target === -1) {
      merged.push({ ...centroids[c] });
      target = merged.length - 1;
    } else {
      const t = merged[target];
      const total = t.n + centroids[c].n;
      t.a = (t.a * t.n + centroids[c].a * centroids[c].n) / total;
      t.b = (t.b * t.n + centroids[c].b * centroids[c].n) / total;
      t.n = total;
    }
    remap[c] = target as number;
  }
  for (let k = 0; k < cells.length; k++) {
    if (cells[k] >= 0) cells[k] = remap[cells[k]];
  }

  // Late assignment for the slow drifters: close enough to a discovered
  // minimum counts as being in its basin. Genuinely lost cells stay −1.
  const lateEps = 0.1 * span;
  for (const lag of laggards) {
    let best = -1;
    let bestD = lateEps * lateEps;
    for (let m = 0; m < merged.length; m++) {
      const dx = merged[m].a - lag.a;
      const dy = merged[m].b - lag.b;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    if (best >= 0) cells[lag.idx] = best;
  }

  return {
    res,
    cells,
    minima: merged.map(m => ({ a: m.a, b: m.b })),
    oneParam
  };
}
