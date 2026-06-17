/**
 * Deterministic blue-noise point sampling (Bridson, "Fast Poisson Disk
 * Sampling in Arbitrary Dimensions", SIGGRAPH 2007).
 *
 * Used to place the gradient-field arrows. A regular grid of arrows shows
 * "hedgehog" artifacts — the rows and columns read as structure that isn't in
 * the field. Blue noise spreads the arrows evenly with no two closer than
 * `radius` and no visible alignment, the same way farthest-point seeding fixed
 * the streamlines.
 *
 * The RNG is seeded with a fixed constant so the layout is STABLE: the same
 * (domain, radius) always returns the same points, so dragging the marker or
 * changing the data updates the vectors without the arrows reshuffling.
 */

/** Small, fast, deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Poisson-disk samples over the square [min, max]², no two closer than
 * `radius`. Returns blue-noise points {x, y}.
 */
export function poissonDiskSample(
  min: number,
  max: number,
  radius: number,
  k = 30,
  seed = 0x9e3779b1
): { x: number; y: number }[] {
  const span = max - min;
  if (span <= 0 || radius <= 0) return [];

  const rng = mulberry32(seed);
  const cell = radius / Math.SQRT2; // ≤ 1 sample per cell → O(1) neighbour test
  const n = Math.max(1, Math.ceil(span / cell));
  const grid = new Int32Array(n * n).fill(-1); // sample index per cell, or −1
  const samples: { x: number; y: number }[] = [];
  const active: number[] = [];
  const r2 = radius * radius;
  const gi = (v: number) => {
    const i = Math.floor((v - min) / cell);
    return i < 0 ? 0 : i >= n ? n - 1 : i;
  };

  const push = (x: number, y: number) => {
    const idx = samples.length;
    samples.push({ x, y });
    grid[gi(y) * n + gi(x)] = idx;
    active.push(idx);
  };

  // A candidate is valid if it is in-bounds and ≥ radius from every neighbour.
  const fits = (x: number, y: number): boolean => {
    if (x < min || x > max || y < min || y > max) return false;
    const ci = gi(x), cj = gi(y);
    for (let dj = -2; dj <= 2; dj++) {
      const j = cj + dj;
      if (j < 0 || j >= n) continue;
      for (let di = -2; di <= 2; di++) {
        const i = ci + di;
        if (i < 0 || i >= n) continue;
        const s = grid[j * n + i];
        if (s < 0) continue;
        const dx = samples[s].x - x, dy = samples[s].y - y;
        if (dx * dx + dy * dy < r2) return false;
      }
    }
    return true;
  };

  push(min + span / 2, min + span / 2); // start at the centre (deterministic)

  let guard = 0;
  const cap = n * n + 16;
  while (active.length && guard++ < cap * 8) {
    const ai = (rng() * active.length) | 0;
    const s = samples[active[ai]];
    let placed = false;
    for (let t = 0; t < k; t++) {
      const ang = rng() * Math.PI * 2;
      const rad = radius * (1 + rng()); // uniform-ish in the annulus [r, 2r]
      const x = s.x + Math.cos(ang) * rad;
      const y = s.y + Math.sin(ang) * rad;
      if (fits(x, y)) {
        push(x, y);
        placed = true;
        break;
      }
    }
    if (!placed) {
      active[ai] = active[active.length - 1];
      active.pop();
    }
  }

  return samples;
}
