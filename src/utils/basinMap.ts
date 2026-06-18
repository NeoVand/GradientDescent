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
// Laggards (cells still drifting at the real γ when the budget runs out) get a
// second "resolve" pass that follows the NORMALIZED gradient at a constant
// spatial pace — it crosses flat plateaus in a bounded number of steps where
// the tiny real-γ step would crawl forever. Same flow lines as gradient
// descent, so it lands in the same basin; only the speed differs.
const RESOLVE_STEPS = 1200;
// Raw cap on discovered destinations BEFORE the merge/de-speckle cleanup.
// Generous, because multimodal fits (e.g. the sine wave's frequency aliasing)
// genuinely have dozens of minima, and the resolve walk briefly spawns extra
// orbit points that merge away — we'd rather over-discover and consolidate
// than cap early and leave the tail gray. The final basins drive coloring;
// the 12-color palette repeats across them, which reads fine since neighboring
// basins land on different palette indices.
const MAX_CLUSTERS = 128;

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
  // Cells still drifting when the step budget runs out (slow shallow valleys
  // / broad plateaus): remember where they got to and resolve their basin in
  // a second normalized-gradient pass, so a plateau reads as the basin it
  // flows into instead of a sea of "unsettled" gray.
  const laggards: { idx: number; a: number; b: number }[] = [];

  // Nearest centroid to (a,b) within radiusSq, or −1. Used both to assign
  // settled cells and to early-capture a trajectory the moment it enters a
  // basin already discovered — no need to grind all the way to stepTol.
  const nearestCentroid = (a: number, b: number, radiusSq: number): number => {
    let best = -1;
    let bestD = radiusSq;
    for (let c = 0; c < centroids.length; c++) {
      const dx = centroids[c].a - a;
      const dy = centroids[c].b - b;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  };

  // ---- Pass 1: integrate at the real learning rate. ----
  // This is what keeps the map an honest function of γ — cells that overshoot
  // and diverge, or shatter into many tiny basins at high γ, show up here.
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
        continue; // resolved in pass 2 (or stays −1 if genuinely lost)
      }

      // Assign to the nearest existing destination, or open a new one.
      let best = nearestCentroid(a, b, epsSq);
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
    // Pass 1 owns the first 70% of the progress bar; pass 2 the rest.
    if (onProgress && (j & 7) === 0) onProgress((j / rows) * 0.7);
  }

  // ---- Pass 2: resolve the laggards by following the NORMALIZED gradient. ----
  // Each laggard is still descending (none diverged), so its basin is well
  // defined by the flow line it sits on. Stepping along −∇ℒ/‖∇ℒ‖ at a fixed
  // spatial pace crosses plateaus in a bounded number of steps where the tiny
  // real-γ step would crawl — the same flow line as ordinary descent, so it
  // lands in (or discovers) the same minimum. A fixed step ORBITS the minimum
  // rather than settling, so endpoints scatter within ~resolveStep of the true
  // center; the single merge pass afterwards (mergeEps ≫ resolveStep) folds
  // those orbit points back into one basin. New finds append to `centroids`.
  const resolveStep = 0.5 * eps;             // constant spatial step length
  const captureSq = epsSq;                    // "arrived at a known minimum"
  const tinyGrad = 1e-12 * span;              // stationary point (flat/saddle)
  const probeDelta = 0.01 * span;            // neighborhood radius for the min test

  // Is (a,b) a genuine local minimum, not a saddle/ridge the normalized walk
  // stalled on? Probe the loss in 8 directions; a real minimum is ≤ every
  // neighbor, while a saddle always has at least one strictly-downhill way out.
  // This is what lets pass 2 DISCOVER new minima (the sine wave's many basins)
  // without minting phantom basins at Himmelblau-style saddles.
  const isLocalMin = (a: number, b: number): boolean => {
    const L0 = config.computeLoss(data, { a, b });
    const tol = 1e-9 * (Math.abs(L0) + 1e-12);
    const dirs: [number, number][] = oneParam
      ? [[1, 0], [-1, 0]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [da, db] of dirs) {
      const L = config.computeLoss(data, { a: a + da * probeDelta, b: b + db * probeDelta });
      if (L < L0 - tol) return false;
    }
    return true;
  };

  for (let l = 0; l < laggards.length; l++) {
    const lag = laggards[l];
    let a = lag.a;
    let b = lag.b;
    let dest = -1;

    for (let s = 0; s < RESOLVE_STEPS; s++) {
      dest = nearestCentroid(a, b, captureSq);
      if (dest >= 0) break; // arrived at a known minimum
      const g = config.computeGradient(data, { a, b });
      const ga = g.a;
      const gb = oneParam ? 0 : g.b;
      const mag = Math.hypot(ga, gb);
      if (!Number.isFinite(mag) || mag < tinyGrad) break; // stuck (flat/saddle)
      a -= (resolveStep * ga) / mag;
      b -= oneParam ? 0 : (resolveStep * gb) / mag;
      if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > blowUp || Math.abs(b) > blowUp) {
        break; // ran off to infinity — genuinely diverges, leave it gray
      }
    }

    if (dest === -1) {
      // The walk didn't reach a known basin. Damp the fixed-step orbit with a
      // few shrinking steps so we settle onto the actual stationary point,
      // then decide what it is.
      let h = resolveStep;
      for (let s = 0; s < 24; s++) {
        const g = config.computeGradient(data, { a, b });
        const ga = g.a;
        const gb = oneParam ? 0 : g.b;
        const mag = Math.hypot(ga, gb);
        if (!Number.isFinite(mag) || mag < tinyGrad) break;
        a -= (h * ga) / mag;
        b -= oneParam ? 0 : (h * gb) / mag;
        if (!Number.isFinite(a) || !Number.isFinite(b)) break;
        h *= 0.8;
      }
      // It may have polished into a basin we already have.
      dest = nearestCentroid(a, b, captureSq);
      // Otherwise register it only if it is a genuine new minimum — never a
      // saddle/ridge, which would invent a phantom basin.
      if (dest === -1 && centroids.length < MAX_CLUSTERS && isLocalMin(a, b)) {
        centroids.push({ a, b, n: 1 });
        dest = centroids.length - 1;
      }
      // Saddle-stalled and genuinely undecided: hand it to the nearest known
      // basin by where its flow line ended up (already well downhill).
      if (dest === -1) dest = nearestCentroid(a, b, Infinity);
    }
    if (dest >= 0) cells[lag.idx] = dest;

    if (onProgress && (l & 255) === 0) onProgress(0.7 + (l / laggards.length) * 0.3);
  }

  // ---- Merge near-duplicate destinations across BOTH passes. ----
  // Long shallow valleys fragment in pass 1, and the resolve walk leaves a
  // little orbit of endpoints around each minimum in pass 2; both collapse
  // here. Compacting also keeps the basin indices dense for stable coloring.
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

  // ---- De-speckle: fold tiny basins into their nearest surviving neighbor. ----
  // Following the normalized gradient across a saturated, near-flat region can
  // strand a few cells on their own little "minimum" (a numerical plateau, not
  // a real attractor). Any basin holding a negligible share of the grid is
  // treated as such noise: its cells are reassigned to the closest real basin,
  // so the map reads as clean regions and the destination dots aren't littered
  // with specks. Real minima — even genuinely small ones — clear the bar.
  const counts = new Array(merged.length).fill(0);
  for (let k = 0; k < cells.length; k++) {
    if (cells[k] >= 0) counts[cells[k]]++;
  }
  const minSupport = Math.max(4, Math.floor(cells.length * 0.0008));
  const keptRemap = new Int16Array(merged.length).fill(-1);
  const kept: { a: number; b: number }[] = [];
  for (let m = 0; m < merged.length; m++) {
    if (counts[m] >= minSupport) {
      keptRemap[m] = kept.length;
      kept.push({ a: merged[m].a, b: merged[m].b });
    }
  }
  // Degenerate guard: if the threshold would erase everything (tiny grids,
  // pathological inputs), keep all basins rather than blanking the map.
  if (kept.length === 0) {
    for (let m = 0; m < merged.length; m++) {
      keptRemap[m] = kept.length;
      kept.push({ a: merged[m].a, b: merged[m].b });
    }
  }

  const nearestKept = (a: number, b: number): number => {
    let best = 0;
    let bestD = Infinity;
    for (let m = 0; m < kept.length; m++) {
      const dx = kept[m].a - a;
      const dy = kept[m].b - b;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  };

  for (let k = 0; k < cells.length; k++) {
    const id = cells[k];
    if (id < 0) continue;
    if (keptRemap[id] >= 0) {
      cells[k] = keptRemap[id];
      continue;
    }
    // A speck cell: hand it to the nearest surviving basin by its own location.
    const i = k % res;
    const j = oneParam ? 0 : Math.floor(k / res);
    const a = range.min + ((i + 0.5) / res) * span;
    const b = oneParam ? 0 : range.min + ((j + 0.5) / res) * span;
    cells[k] = nearestKept(a, b);
  }

  return {
    res,
    cells,
    minima: kept,
    oneParam
  };
}
