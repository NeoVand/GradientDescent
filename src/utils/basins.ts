/**
 * Basin-map orchestration: debounces requests, runs computeBasinMap in a
 * Web Worker, renders the categorical result to a PNG data URL, and caches
 * per (problem, dataset, γ, range) so toggling is instant after the first
 * computation. Consumers just read basinStore.
 */

import { writable } from 'svelte/store';
import type { DataPoint } from '../types/types';
import type { BasinResult } from './basinMap';

export interface BasinScene {
  key: string;
  imageURL: string;
  minima: { a: number; b: number }[];
  res: number;
  oneParam: boolean;
}

export interface BasinState {
  status: 'idle' | 'computing' | 'ready';
  progress: number;
  scene: BasinScene | null;
}

export const basinStore = writable<BasinState>({ status: 'idle', progress: 0, scene: null });

/** Distinct destination colors — deliberately NOT viridis, so the basin
 *  map reads as categories, never as loss values. */
export const BASIN_COLORS = [
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#38bdf8', // sky
  '#f43f5e', // rose
  '#a3e635', // lime
  '#d946ef', // fuchsia
  '#fb923c', // orange
  '#818cf8', // indigo
  '#2dd4bf', // teal
  '#facc15', // yellow
  '#22d3ee'  // cyan
];

const cache = new Map<string, BasinScene>();
const CACHE_MAX = 12;

let worker: Worker | null = null;
let requestCounter = 0;
let pendingKey: string | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function fingerprint(data: DataPoint[]): string {
  let sx = 0;
  let sy = 0;
  for (const p of data) {
    sx += p.x;
    sy += p.y;
  }
  return `${data.length}:${sx.toFixed(4)}:${sy.toFixed(4)}`;
}

export function basinKey(
  problemType: string,
  data: DataPoint[],
  range: { min: number; max: number },
  learningRate: number,
  oneParam: boolean
): string {
  return [
    problemType,
    fingerprint(data),
    learningRate.toPrecision(3),
    range.min,
    range.max,
    oneParam ? '1d' : '2d'
  ].join('|');
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function renderToURL(result: BasinResult): string {
  const { res, cells, oneParam } = result;
  const rows = oneParam ? 1 : res;
  const canvas = document.createElement('canvas');
  canvas.width = res;
  canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(res, rows);
  const palette = BASIN_COLORS.map(hexToRgb);

  for (let j = 0; j < rows; j++) {
    const row = rows - 1 - j; // canvas y down, β up — same flip as the heatmap
    for (let i = 0; i < res; i++) {
      const id = cells[j * res + i];
      const o = (row * res + i) * 4;
      if (id < 0) {
        // Diverged / never settled: muted slate, mostly transparent
        img.data[o] = 100;
        img.data[o + 1] = 116;
        img.data[o + 2] = 139;
        img.data[o + 3] = 70;
      } else {
        const [r, g, b] = palette[id % palette.length];
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 200;
      }
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./basins.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.requestId !== requestCounter) return; // stale response
      if (msg.type === 'progress') {
        basinStore.update(s => ({ ...s, progress: msg.frac }));
      } else if (msg.type === 'done') {
        const scene: BasinScene = {
          key: pendingKey!,
          imageURL: renderToURL(msg.result),
          minima: msg.result.minima,
          res: msg.result.res,
          oneParam: msg.result.oneParam
        };
        cache.set(scene.key, scene);
        if (cache.size > CACHE_MAX) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        pendingKey = null;
        basinStore.set({ status: 'ready', progress: 1, scene });
      } else if (msg.type === 'error') {
        pendingKey = null;
        basinStore.set({ status: 'idle', progress: 0, scene: null });
      }
    };
  }
  return worker;
}

/**
 * Make sure the basin map for this exact scenario exists (or is being
 * computed). Debounced: slider scrubbing only fires the trailing edge.
 */
export function ensureBasins(
  problemType: string,
  trainData: DataPoint[],
  range: { min: number; max: number },
  learningRate: number,
  oneParam: boolean,
  res: number = 96
): void {
  const key = basinKey(problemType, trainData, range, learningRate, oneParam);

  const cached = cache.get(key);
  if (cached) {
    pendingKey = null;
    basinStore.update(s =>
      s.scene?.key === key && s.status === 'ready' ? s : { status: 'ready', progress: 1, scene: cached }
    );
    return;
  }
  if (pendingKey === key) return; // already in flight

  // A different scenario than the visible scene: drop the stale map now so
  // the landscape falls back to the loss heatmap while we compute.
  basinStore.set({ status: 'computing', progress: 0, scene: null });
  pendingKey = key;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (pendingKey !== key) return; // superseded while debouncing
    requestCounter++;
    getWorker().postMessage({
      requestId: requestCounter,
      problemType,
      data: trainData,
      range,
      learningRate,
      res,
      oneParam
    });
  }, 300);
}
