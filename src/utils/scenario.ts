/**
 * Declarative scenarios — the bridge between presets, lessons, and links.
 *
 * A ScenarioState describes a complete staged situation as plain data:
 * problem, optimizer, dials, dataset seed, marker, view. applyScenario()
 * stages it on the live app; scenarioUrl() renders the SAME state as a
 * shareable deep link — so a "Try it" button in the guide and a QR code in
 * the printed book are two renderings of one object, and can never drift.
 *
 * Anything a scenario leaves unspecified falls back to the problem's curated
 * defaults (both here and in the URL decoder). Scenarios meant for print
 * should specify the optimizer explicitly rather than lean on the curated
 * gd↔momentum auto-selection.
 */

import {
  datasetStore,
  parametersStore,
  trainingStore,
  optimizerStore,
  landscapeViewStore,
  recordInitialHistory,
  resetOptimizerState
} from '../stores/stores';
import { applyProblem, applyOptimizer, startTraining, resolveLearningRate } from './trainer';
import type { ModelParameters, ProblemType, ScheduleId } from '../types/types';
import type { OptimizerId } from './optimizers';

export interface ScenarioState {
  problem: ProblemType;
  optimizer?: OptimizerId;
  /** Merged over the optimizer's (problem-curated) defaults. */
  hyper?: Record<string, number>;
  learningRate?: number;
  batchSize?: number | 'all';
  totalSteps?: number;
  stepsPerSecond?: number;
  schedule?: ScheduleId;
  scheduleSpeed?: number;
  continuous?: boolean;
  /** Dataset seed — a seeded scenario reproduces its exact data. */
  seed?: number;
  noiseLevel?: number;
  /** Starting marker; omitted = the problem's own initial point. */
  marker?: ModelParameters;
  view?: '2d' | '3d';
  /** Start training the moment the scenario is staged. */
  run?: boolean;
}

/** Stage a scenario on the live app (the one entry point presets share). */
export function applyScenario(s: ScenarioState): void {
  applyProblem(s.problem);
  if (s.optimizer) applyOptimizer(s.optimizer);
  if (s.hyper) optimizerStore.update(o => ({ ...o, hyper: { ...o.hyper, ...s.hyper } }));

  if (s.seed !== undefined || s.noiseLevel !== undefined) {
    datasetStore.hydrate({
      ...(s.seed !== undefined ? { seed: s.seed } : {}),
      ...(s.noiseLevel !== undefined ? { noiseLevel: s.noiseLevel } : {})
    });
    datasetStore.regenerateData();
  }

  if (s.marker) parametersStore.set({ ...s.marker });

  trainingStore.update(t => ({
    ...t,
    ...(s.learningRate !== undefined ? { learningRate: s.learningRate } : {}),
    ...(s.batchSize !== undefined ? { batchSize: s.batchSize } : {}),
    ...(s.totalSteps !== undefined ? { totalSteps: s.totalSteps } : {}),
    ...(s.stepsPerSecond !== undefined ? { stepsPerSecond: s.stepsPerSecond } : {}),
    ...(s.schedule !== undefined ? { schedule: s.schedule } : {}),
    ...(s.scheduleSpeed !== undefined ? { scheduleSpeed: s.scheduleSpeed } : {}),
    ...(s.continuous !== undefined ? { continuous: s.continuous } : {})
  }));

  if (s.view) landscapeViewStore.set(s.view);

  resetOptimizerState();
  recordInitialHistory();
  if (s.run) startTraining();
}

/**
 * Render a scenario as a shareable URL (location-hash encoding, matching
 * urlState.ts). Only what the scenario specifies is encoded — the decoder
 * fills the rest with the same defaults applyScenario would use.
 */
export function scenarioUrl(s: ScenarioState, origin?: string): string {
  const q = new URLSearchParams();
  q.set('ver', '1'); // schema version ('v' was already taken by the 2d/3d view)
  q.set('p', s.problem);
  const optimizer = s.optimizer ?? 'gd';
  if (s.optimizer) q.set('o', s.optimizer);
  for (const [k, val] of Object.entries(s.hyper ?? {})) q.set('h_' + k, String(val));
  q.set('lr', (s.learningRate ?? resolveLearningRate(optimizer, s.problem)).toPrecision(3));
  if (s.batchSize !== undefined) q.set('bs', String(s.batchSize));
  if (s.totalSteps !== undefined) q.set('st', String(s.totalSteps));
  if (s.schedule && s.schedule !== 'constant') {
    q.set('sch', s.schedule);
    if (s.scheduleSpeed !== undefined && s.scheduleSpeed !== 1) q.set('scs', s.scheduleSpeed.toFixed(1));
  }
  if (s.seed !== undefined) q.set('sd', String(s.seed));
  if (s.noiseLevel !== undefined) q.set('no', s.noiseLevel.toFixed(2));
  if (s.marker) {
    q.set('a', s.marker.a.toFixed(4));
    q.set('b', s.marker.b.toFixed(4));
  }
  if (s.view) q.set('v', s.view);
  if (s.run) q.set('run', '1');

  const base = origin ?? (typeof location !== 'undefined' ? location.origin + location.pathname : 'https://gradientlab.ai/');
  return base + '#' + q.toString();
}
