/**
 * Seeded random number generation for data synthesis.
 *
 * All dataset randomness flows through this module so a dataset is fully
 * reproducible from its seed: the same seed regenerates the same x-positions,
 * the same noise draws, and the same train/test shuffle. That makes the
 * noise/points/split sliders smooth deformations of one realization (instead
 * of a jarring re-roll on every tick) and is the foundation for shareable
 * URL state later.
 *
 * Parameter initialization (the marker's random start) intentionally does
 * NOT use this module — fresh random starts on every reset are the point.
 */

// mulberry32: tiny, fast, good-enough statistical quality for visualization.
let state = 0x9e3779b9;

export function setSeed(seed: number): void {
  state = seed >>> 0;
}

/** Uniform in [0, 1), from the seeded stream. */
export function rand(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A fresh, unseeded 32-bit seed (for "give me new data" actions). */
export function newSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

/** In-place Fisher–Yates shuffle using the seeded stream. Returns the array. */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
