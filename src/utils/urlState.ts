/**
 * Shareable URL state (schema v1 — `ver` param; unversioned links predate it
 * and decode identically).
 *
 * The full scenario — problem, optimizer + hyperparameters, learning rate,
 * batch size, steps, dataset settings + seed, marker position, view — is
 * encoded in the location hash. Because data generation is seeded, a shared
 * link reproduces the exact same dataset, landscape, and starting point.
 *
 * v1 additions, all optional and backwards-compatible:
 *   - overlay state (`f` field, `c` contours, `cm` colormap, `bas` basins,
 *     `lens` curvature lens) so "look at this" links show the same layers —
 *     hydrated without persisting, so a link never overwrites the visitor's
 *     saved preferences;
 *   - `th` theme (decode-only: casual shares don't re-theme the recipient,
 *     but a printed figure link can pin the theme it was typeset in);
 *   - `run=1` — start training on arrival (living-figure links);
 *   - `ch=<chapter-slug>` — open the guide at a chapter;
 *   - `lesson=<lesson-id>` — drop straight into a course lesson.
 */

import { get } from 'svelte/store';
import {
  selectedProblem,
  datasetStore,
  trainingStore,
  parametersStore,
  optimizerStore,
  landscapeViewStore,
  vizLayersStore,
  basinsEnabledStore,
  lensStore,
  themeStore,
  COLORMAPS,
  type Colormap,
  type FieldMode
} from '../stores/stores';
import { problemConfigs } from './problems';
import { defaultHyper, optimizers, type OptimizerId } from './optimizers';
import { isChapterSlug, resolveChapterSlug } from '../content/registry';
import type { ModelParameters, ProblemType, ScheduleId } from '../types/types';

export function encodeStateUrl(goalSteps?: number): string {
  const t = get(trainingStore);
  const o = get(optimizerStore);
  const d = get(datasetStore);
  const p = get(parametersStore);
  const viz = get(vizLayersStore);

  const q = new URLSearchParams();
  q.set('ver', '1');
  // Challenge goal: recipient must reach the basin within this many steps
  if (goalSteps && goalSteps > 0) q.set('g', String(Math.round(goalSteps)));
  q.set('p', get(selectedProblem));
  q.set('o', o.id);
  for (const [k, v] of Object.entries(o.hyper)) q.set('h_' + k, String(v));
  q.set('lr', t.learningRate.toPrecision(3));
  q.set('bs', String(t.batchSize));
  q.set('st', String(t.totalSteps));
  if (t.schedule !== 'constant') {
    q.set('sch', t.schedule);
    if (t.scheduleSpeed !== 1) q.set('scs', t.scheduleSpeed.toFixed(1));
  }
  q.set('n', String(d.numPoints));
  q.set('no', d.noiseLevel.toFixed(2));
  q.set('tr', d.trainRatio.toFixed(1));
  q.set('rs', d.randomSplit ? '1' : '0');
  q.set('sd', String(d.seed));
  q.set('a', p.a.toFixed(4));
  q.set('b', p.b.toFixed(4));
  q.set('v', get(landscapeViewStore));
  // Overlays: what the sender is looking at, the recipient sees too.
  q.set('f', viz.field);
  q.set('c', viz.contours ? '1' : '0');
  q.set('cm', viz.colormap);
  if (get(basinsEnabledStore)) q.set('bas', '1');
  if (get(lensStore)) q.set('lens', '1');

  return location.origin + location.pathname + '#' + q.toString();
}

export interface UrlStateResult {
  /** Marker + challenge from a full scenario link; null for ch/lesson-only links. */
  scenario: { params: ModelParameters; goal: number | null } | null;
  /** Start training as soon as the scenario is staged. */
  run: boolean;
  /** Open the guide at this chapter slug. */
  chapter: string | null;
  /** Jump straight into this course lesson (validated by the caller). */
  lesson: string | null;
}

/**
 * Apply a shared scenario from the location hash, if present. Stores are
 * hydrated but data is NOT generated here — the caller regenerates (so the
 * seed takes effect) and then applies the returned marker position, goal,
 * and navigation intents.
 */
export function applyUrlState(): UrlStateResult | null {
  const hash = location.hash.slice(1);
  if (!hash) return null;
  const q = new URLSearchParams(hash);

  // Old slugs from shared links resolve to their new homes (chapter splits).
  const chRaw = q.get('ch') && resolveChapterSlug(q.get('ch')!);
  const chapter = chRaw && isChapterSlug(chRaw) ? chRaw : null;
  const lesson = q.get('lesson');
  const run = q.get('run') === '1';

  // Theme and overlays apply to any link kind — never persisted, so the
  // visitor's own saved preferences survive the visit.
  const th = q.get('th');
  if (th === 'light' || th === 'dark') themeStore.hydrate(th);

  const problem = q.get('p');
  if (!problem || !(problem in problemConfigs)) {
    // Not a scenario link — but it may still navigate (guide chapter/lesson).
    return chapter || lesson ? { scenario: null, run: false, chapter, lesson } : null;
  }
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
    schedule,
    scheduleSpeed: num('scs', 0.5, 10, 1)
  }));

  if (q.get('v') === '3d') landscapeViewStore.set('3d');

  // Overlays (v1): only what the link carries changes; absent params leave
  // the visitor's persisted layers alone.
  const f = q.get('f');
  const cm = q.get('cm');
  const c = q.get('c');
  const overlay: Partial<{ field: FieldMode; contours: boolean; colormap: Colormap }> = {};
  if (f === 'arrows' || f === 'streamlines' || f === 'off') overlay.field = f;
  if (c === '1' || c === '0') overlay.contours = c === '1';
  if (cm && (COLORMAPS as string[]).includes(cm)) overlay.colormap = cm as Colormap;
  if (Object.keys(overlay).length) vizLayersStore.hydrate(overlay);
  if (q.get('bas') === '1') basinsEnabledStore.hydrate(true);
  if (q.get('lens') === '1') lensStore.hydrate(true);

  const goalRaw = parseInt(q.get('g') ?? '', 10);

  return {
    scenario: {
      params: {
        a: num('a', -1e4, 1e4, 0),
        b: num('b', -1e4, 1e4, 0)
      },
      goal: Number.isFinite(goalRaw) && goalRaw > 0 ? Math.min(10000, goalRaw) : null
    },
    run,
    chapter,
    lesson
  };
}
