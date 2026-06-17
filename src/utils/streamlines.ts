/**
 * Evenly-spaced streamline placement for a 2D flow field.
 *
 * The earlier version used Jobard & Lefebvre's 1997 queue seeding: each
 * accepted line spawned candidate seeds offset perpendicular to it. That is
 * cheap but leaves the field uneven — seeds bunch in some regions and starve
 * others, so coverage has clumps and gaps.
 *
 * This uses FARTHEST-POINT SEEDING (Mebarki, Alliez & Devillers, IEEE Vis
 * 2005): always start the next streamline in the *largest remaining void*, the
 * point farthest from every existing line and from the domain boundary. That
 * favours long lines and uniform spacing. Instead of the paper's Delaunay
 * triangulation we use a DISTANCE GRID (Mebarki 2016) — simpler, robust, and
 * it doubles as the proximity test during integration. Integration is RK4 for
 * accuracy.
 *
 * Specialised for a GRADIENT flow (−∇ℒ): every line runs downhill to a sink
 * (minimum) and uphill to a source / saddle. Near a critical point the
 * proximity test is relaxed, so converging lines are allowed to run all the
 * way *into* the sink instead of being cut short just outside it.
 */

import type { ModelParameters } from '../types/types';

export interface StreamlineField {
  min: number;
  max: number;
  /** The gradient ∇ℒ at (a, b). Streamlines flow along −∇ℒ (downhill). */
  gradient: (a: number, b: number) => ModelParameters;
}

export interface StreamlineOptions {
  /** Target separation between neighbouring lines (sets the density). */
  dSep: number;
  /** Stop a line when it comes this close to another (default 0.5·dSep). */
  dTest?: number;
  /** Arc-length step of the integrator (default 0.4·dSep). */
  step?: number;
  /** Safety cap on steps per half-line. */
  maxSteps?: number;
}

/** Place evenly-spaced streamlines; returns each as a polyline in (a, b). */
export function placeStreamlines(
  field: StreamlineField,
  opts: StreamlineOptions
): ModelParameters[][] {
  const { min, max, gradient } = field;
  const span = max - min;
  if (span <= 0) return [];

  const dSep = opts.dSep;
  // dTest a little under half d_sep lets lines integrate closer to their
  // neighbours before stopping — longer lines, tighter packing, fewer gaps
  // (which is what hurt most at low density). A smaller step lands closer to
  // the sinks before the last overshoot, so lines converge cleanly.
  const dTest = opts.dTest ?? dSep * 0.45;
  const step = opts.step ?? dSep * 0.33;
  const maxSteps = opts.maxSteps ?? 1500;

  // ---------- distance grid ----------
  // dist[k] = distance from cell centre k to the nearest streamline so far
  // (∞ until a line passes nearby). bdist[k] = distance to the domain edge,
  // precomputed once. A cell is seedable while min(dist, bdist) > dSep.
  const cs = dSep * 0.5; // cell size: half the separation keeps the grid crisp
  const n = Math.max(8, Math.ceil(span / cs));
  const step0 = span / n;
  const BIG = 1e9;
  const dist = new Float64Array(n * n).fill(BIG);
  const bdist = new Float64Array(n * n);
  const coord = (i: number) => min + (i + 0.5) * step0;

  // Sample the field on the grid: gives the boundary distances AND the max
  // gradient magnitude (the scale for "near a critical point").
  let maxMag = 0;
  for (let j = 0; j < n; j++) {
    const y = coord(j);
    for (let i = 0; i < n; i++) {
      const x = coord(i);
      bdist[j * n + i] = Math.min(x - min, max - x, y - min, max - y);
      const g = gradient(x, y);
      const m = Math.hypot(g.a, g.b);
      if (Number.isFinite(m) && m > maxMag) maxMag = m;
    }
  }
  if (!(maxMag > 0)) return []; // flat field (e.g. no data): nothing to trace

  const idxOf = (a: number, b: number) => {
    const i = Math.floor((a - min) / step0);
    const j = Math.floor((b - min) / step0);
    return i < 0 || i >= n || j < 0 || j >= n ? -1 : j * n + i;
  };
  const nearDist = (a: number, b: number) => {
    const k = idxOf(a, b);
    return k < 0 ? 0 : dist[k];
  };

  // Stamp a point into the grid: lower dist for every cell within dSep.
  const R = Math.ceil(dSep / step0);
  const stamp = (a: number, b: number) => {
    const ci = Math.floor((a - min) / step0);
    const cj = Math.floor((b - min) / step0);
    for (let dj = -R; dj <= R; dj++) {
      const j = cj + dj;
      if (j < 0 || j >= n) continue;
      for (let di = -R; di <= R; di++) {
        const i = ci + di;
        if (i < 0 || i >= n) continue;
        const d = Math.hypot(coord(i) - a, coord(j) - b);
        const k = j * n + i;
        if (d < dist[k]) dist[k] = d;
      }
    }
  };

  // ---------- the downhill unit-direction field ----------
  const CRIT_EPS = 1e-4 * maxMag; // below this |∇| we've reached a critical point
  const CRIT_NEAR = 0.13 * maxMag; // below this we're converging in: ignore dTest
  //   (bigger than before, so lines push into the basins and "come together"
  //    at the sink even at low density, instead of stopping in a ring around it)
  const flow = (a: number, b: number): { dx: number; dy: number; mag: number } | null => {
    const g = gradient(a, b);
    const m = Math.hypot(g.a, g.b);
    if (!Number.isFinite(m) || m < CRIT_EPS) return null;
    return { dx: -g.a / m, dy: -g.b / m, mag: m }; // −∇ℒ, unit length
  };

  // ---------- RK4 integration of one half-line ----------
  const march = (a0: number, b0: number, sign: 1 | -1): ModelParameters[] => {
    const pts: ModelParameters[] = [];
    let a = a0, b = b0;
    for (let s = 0; s < maxSteps; s++) {
      const k1 = flow(a, b);
      if (!k1) break; // hit a critical point — stop exactly here
      const h = step * sign;
      const k2 = flow(a + 0.5 * h * k1.dx, b + 0.5 * h * k1.dy) ?? k1;
      const k3 = flow(a + 0.5 * h * k2.dx, b + 0.5 * h * k2.dy) ?? k2;
      const k4 = flow(a + h * k3.dx, b + h * k3.dy) ?? k3;
      const na = a + (h / 6) * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx);
      const nb = b + (h / 6) * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy);
      if (na < min || na > max || nb < min || nb > max) break;
      // Too close to an existing line? Stop — UNLESS we're spiralling into a
      // sink/source, where lines are meant to converge.
      if (k1.mag > CRIT_NEAR && nearDist(na, nb) < dTest) break;
      a = na;
      b = nb;
      pts.push({ a, b });
    }
    return pts;
  };

  // ---------- seeding loop: always fill the biggest void ----------
  const lines: ModelParameters[][] = [];
  let guard = 0;
  const cap = n * n + 8; // at most one accepted seed per cell, plus slack
  while (guard++ < cap) {
    // Farthest point = cell maximising min(distance-to-lines, distance-to-edge).
    let best = -1;
    let bestScore = dSep; // must beat dSep to be worth seeding
    for (let k = 0; k < dist.length; k++) {
      const sc = dist[k] < bdist[k] ? dist[k] : bdist[k];
      if (sc > bestScore) {
        bestScore = sc;
        best = k;
      }
    }
    if (best < 0) break; // saturated — every void is smaller than dSep

    const sa = coord(best % n);
    const sb = coord(Math.floor(best / n));
    const back = march(sa, sb, -1).reverse();
    const fwd = march(sa, sb, 1);
    const line = back.concat([{ a: sa, b: sb }], fwd);

    // Always stamp the seed so it can't be chosen again, even if the line is
    // degenerate (seed landed on a critical point).
    if (line.length < 3) {
      stamp(sa, sb);
      continue;
    }
    for (const p of line) stamp(p.a, p.b);
    lines.push(line);
  }

  return lines;
}
