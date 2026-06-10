/**
 * Shareable URL state.
 *
 * The full scenario — problem, optimizer + hyperparameters, learning rate,
 * batch size, steps, dataset settings + seed, marker position, view — is
 * encoded in the location hash. Because data generation is seeded, a shared
 * link reproduces the exact same dataset, landscape, and starting point.
 */

import { get } from 'svelte/store';
import {
  selectedProblem,
  datasetStore,
  trainingStore,
  parametersStore,
  optimizerStore,
  landscapeViewStore
} from '../stores/stores';
import { problemConfigs } from './problems';
import { defaultHyper, optimizers, type OptimizerId } from './optimizers';
import type { ModelParameters, ProblemType, ScheduleId } from '../types/types';

export function encodeStateUrl(goalSteps?: number): string {
  const t = get(trainingStore);
  const o = get(optimizerStore);
  const d = get(datasetStore);
  const p = get(parametersStore);

  const q = new URLSearchParams();
  // Challenge goal: recipient must reach the basin within this many steps
  if (goalSteps && goalSteps > 0) q.set('g', String(Math.round(goalSteps)));
  q.set('p', get(selectedProblem));
  q.set('o', o.id);
  for (const [k, v] of Object.entries(o.hyper)) q.set('h_' + k, String(v));
  q.set('lr', t.learningRate.toPrecision(3));
  q.set('bs', String(t.batchSize));
  q.set('st', String(t.totalSteps));
  if (t.schedule !== 'constant') q.set('sch', t.schedule);
  q.set('n', String(d.numPoints));
  q.set('no', d.noiseLevel.toFixed(2));
  q.set('tr', d.trainRatio.toFixed(1));
  q.set('rs', d.randomSplit ? '1' : '0');
  q.set('sd', String(d.seed));
  q.set('a', p.a.toFixed(4));
  q.set('b', p.b.toFixed(4));
  q.set('v', get(landscapeViewStore));

  return location.origin + location.pathname + '#' + q.toString();
}

/**
 * Apply a shared scenario from the location hash, if present. Stores are
 * hydrated but data is NOT generated here — the caller regenerates (so the
 * seed takes effect) and then applies the returned marker position and
 * challenge goal (if any).
 */
export function applyUrlState(): { params: ModelParameters; goal: number | null } | null {
  const hash = location.hash.slice(1);
  if (!hash) return null;
  const q = new URLSearchParams(hash);

  const problem = q.get('p');
  if (!problem || !(problem in problemConfigs)) return null;
  selectedProblem.set(problem as ProblemType);

  const oid = (q.get('o') ?? 'gd') as OptimizerId;
  const optimizerId: OptimizerId = oid in optimizers ? oid : 'gd';
  const hyper = defaultHyper(optimizerId);
  for (const spec of optimizers[optimizerId].hyperparams) {
    const raw = q.get('h_' + spec.key);
    const v = raw === null ? NaN : parseFloat(raw);
    if (Number.isFinite(v)) hyper[spec.key] = Math.max(spec.min, Math.min(spec.max, v));
  }
  optimizerStore.set({ id: optimizerId, hyper });

  const num = (key: string, lo: number, hi: number, fallback: number) => {
    const v = parseFloat(q.get(key) ?? '');
    return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
  };

  datasetStore.hydrate({
    numPoints: Math.round(num('n', 10, 100, 20)),
    noiseLevel: num('no', 0, 2, 0.3),
    trainRatio: num('tr', 0.1, 0.9, 0.8),
    randomSplit: q.get('rs') !== '0',
    seed: Math.round(num('sd', 0, 0xffffffff, 1))
  });

  const bsRaw = q.get('bs');
  const batchSize = bsRaw === 'all' || bsRaw === null ? ('all' as const) : Math.max(1, parseInt(bsRaw) || 1);
  const schRaw = q.get('sch');
  const schedule: ScheduleId =
    schRaw === 'step' || schRaw === 'cosine' || schRaw === 'warmup-cosine' ? schRaw : 'constant';
  trainingStore.update(s => ({
    ...s,
    learningRate: num('lr', 1e-4, 1, 0.01),
    totalSteps: Math.round(num('st', 10, 1000, 200)),
    batchSize,
    schedule
  }));

  if (q.get('v') === '3d') landscapeViewStore.set('3d');

  const goalRaw = parseInt(q.get('g') ?? '', 10);

  return {
    params: {
      a: num('a', -1e4, 1e4, 0),
      b: num('b', -1e4, 1e4, 0)
    },
    goal: Number.isFinite(goalRaw) && goalRaw > 0 ? Math.min(10000, goalRaw) : null
  };
}
