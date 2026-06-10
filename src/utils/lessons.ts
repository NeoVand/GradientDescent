/**
 * The course: ten predict-then-run lessons.
 *
 * Each lesson configures a deterministic scenario (fixed data seed where
 * data matters), asks the learner to PREDICT what will happen, runs it,
 * and then explains — predict-observe-explain, the best-evidenced way to
 * teach with a demo. Flow state lives in courseStore; the card renders in
 * CoursePanel on the landscape.
 */

import { get } from 'svelte/store';
import {
  courseStore,
  datasetStore,
  parametersStore,
  trainingStore,
  recordInitialHistory,
  resetOptimizerState,
  clearCoach
} from '../stores/stores';
import {
  applyProblem,
  applyOptimizer,
  startTraining,
  startRace,
  stopTraining,
  stopRace,
  runEndStore
} from './trainer';
import type { ProblemType } from '../types/types';
import type { OptimizerId } from './optimizers';

export interface Lesson {
  id: string;
  title: string;
  question: string;
  options: string[];
  correctIndex: number;
  explain: string;
  /** What answering launches: a training run (default) or a race. */
  kind?: 'train' | 'race';
  setup: () => void;
}

/**
 * Shared setup plumbing: problem with its curated defaults, then a fixed
 * seed (reproducible data), a fixed marker, and per-lesson overrides.
 */
function scenario(opts: {
  problem: ProblemType;
  optimizer?: OptimizerId;
  seed?: number;
  marker?: { a: number; b: number };
  learningRate?: number;
  totalSteps?: number;
  stepsPerSecond?: number;
  batchSize?: number | 'all';
}) {
  applyProblem(opts.problem);
  if (opts.optimizer) applyOptimizer(opts.optimizer);
  if (opts.seed !== undefined) {
    datasetStore.hydrate({ seed: opts.seed });
    datasetStore.regenerateData();
  }
  if (opts.marker) parametersStore.set({ ...opts.marker });
  trainingStore.update(s => ({
    ...s,
    learningRate: opts.learningRate ?? s.learningRate,
    totalSteps: opts.totalSteps ?? 200,
    stepsPerSecond: opts.stepsPerSecond ?? 40,
    batchSize: opts.batchSize ?? 'all'
  }));
  resetOptimizerState();
  recordInitialHistory();
}

export const lessons: Lesson[] = [
  {
    id: 'downhill',
    title: 'Which way is down?',
    question:
      'The marker sits on the right wall of the parabola, where the slope dℒ/dα is positive. One gradient-descent step moves α…',
    options: ['Left — toward smaller α', 'Right — toward larger α', 'Nowhere — it needs the minimum first'],
    correctIndex: 0,
    explain:
      'The update is α ← α − γ·(dℒ/dα). A positive slope means subtracting something positive: α decreases — always opposite the slope, always downhill. GD never needs to know where the minimum is.',
    setup: () =>
      scenario({
        problem: 'slope-1d',
        optimizer: 'gd',
        seed: 7,
        marker: { a: 5.8, b: 0 },
        learningRate: 0.05,
        totalSteps: 120
      })
  },
  {
    id: 'step-size',
    title: 'Step size',
    question: 'Same parabola, but γ cranked from 0.05 to 0.9. The run will…',
    options: ['Converge much faster', 'Overshoot harder each step and blow up', 'End in the same place, same speed'],
    correctIndex: 1,
    explain:
      'Past a critical γ (about 2/curvature), each step overshoots the minimum by MORE than it came in with — the error compounds and the run diverges. Fast and stable pull in opposite directions; that tension is learning-rate tuning.',
    setup: () =>
      scenario({
        problem: 'slope-1d',
        optimizer: 'gd',
        seed: 7,
        marker: { a: 5.8, b: 0 },
        learningRate: 0.9,
        totalSteps: 120
      })
  },
  {
    id: 'trap',
    title: 'The trap',
    question: 'Two valleys; the left one is deeper. Starting on the RIGHT rim, gradient descent ends up…',
    options: ['In the deep left valley — it finds the best', 'In the shallow right valley', 'Bouncing between both'],
    correctIndex: 1,
    explain:
      'GD only ever rolls downhill, so it commits to whichever valley it starts above — it cannot climb the barrier to check the other one. Where you start decides where you finish. (Toggle Basins to see the two territories.)',
    setup: () =>
      scenario({
        problem: 'double-well-1d',
        optimizer: 'gd',
        marker: { a: 3.0, b: 0 },
        learningRate: 0.1,
        totalSteps: 120
      })
  },
  {
    id: 'dead-gradient',
    title: 'The dead plateau',
    question: 'Far from the Gaussian peak the surface is almost flat: ‖∇ℒ‖ ≈ 0. Training from out here will…',
    options: ['Reach the peak anyway — slowly but surely', 'Barely move at all', 'Diverge'],
    correctIndex: 1,
    explain:
      'Steps are γ × gradient, and the gradient out here is effectively zero — so the steps are too, no matter how many you take. This is the vanishing-gradient problem, and it is why initialization (and activation saturation) matters so much in deep learning.',
    setup: () =>
      scenario({
        problem: 'gaussian-peak',
        optimizer: 'gd',
        seed: 11,
        marker: { a: 2.7, b: 2.7 },
        learningRate: 0.5,
        totalSteps: 150
      })
  },
  {
    id: 'momentum-race',
    title: 'Momentum',
    question: 'A steep, curved valley. Four optimizers race from the same start, each with its tuned γ. Plain GD finishes…',
    options: ['First — simplest is fastest', 'Last (or not at all) — it zig-zags and crawls', 'Exactly tied with Momentum'],
    correctIndex: 1,
    explain:
      'On stretched valleys GD bounces between the steep walls while inching along the floor. Momentum accumulates velocity along the consistent direction and damps the zig-zag; the adaptive methods rescale each parameter. Watch who crosses the line.',
    kind: 'race',
    setup: () =>
      scenario({
        problem: 'exponential-decay',
        seed: 23,
        marker: { a: -1.35, b: 1.35 },
        totalSteps: 500,
        stepsPerSecond: 60
      })
  },
  {
    id: 'sgd-noise',
    title: 'The S in SGD',
    question: 'Batch size 2 instead of all 20 points: each step sees a random sliver of the data. The descent path becomes…',
    options: ['Identical — same data overall', 'Wobbly, but downhill on average', 'A random walk going nowhere'],
    correctIndex: 1,
    explain:
      'Each minibatch gives a noisy estimate of the true gradient (the faint blue fan at the marker is that spread). Individual steps wander, but their average points downhill — so the path wobbles its way to the basin. Cheap noisy steps beat expensive perfect ones.',
    setup: () =>
      scenario({
        problem: 'linear-regression',
        optimizer: 'gd',
        seed: 42,
        marker: { a: -5.5, b: 5.5 },
        learningRate: 0.01,
        totalSteps: 250,
        batchSize: 2
      })
  },
  {
    id: 'narrow-valley',
    title: 'The banana valley',
    question:
      'Rosenbrock: reaching the curved valley is easy, but its floor is ~2500× shallower than its walls. Plain GD with a safe γ will…',
    options: ['March straight down the floor to the minimum', 'Drop in fast, then crawl along the floor', 'Refuse to enter the valley'],
    correctIndex: 1,
    explain:
      'γ must be tiny so the steep walls don\'t explode — which makes progress along the shallow floor microscopic. That mismatch is ill-conditioning (turn on the Curvature lens and read κ). It is THE reason momentum and adaptive methods exist.',
    setup: () =>
      scenario({
        problem: 'rosenbrock',
        optimizer: 'gd',
        marker: { a: -1.4, b: -0.6 },
        learningRate: 0.0002,
        totalSteps: 400,
        stepsPerSecond: 60
      })
  },
  {
    id: 'adam',
    title: 'Adaptive steps',
    question: 'Back on the dead plateau from lesson 4 — but now with Adam instead of plain GD. This time the marker…',
    options: ['Still barely moves — flat is flat', 'Walks out briskly', 'Teleports straight to the peak'],
    correctIndex: 1,
    explain:
      'Adam divides each step by the running RMS of that parameter\'s gradients — so a tiny gradient gets a proportionally bigger step. Plateaus stop being graveyards. (The red Δθ arrow now visibly disagrees with the blue −∇ℒ.)',
    setup: () =>
      scenario({
        problem: 'gaussian-peak',
        optimizer: 'adam',
        seed: 11,
        marker: { a: 2.7, b: 2.7 },
        totalSteps: 250
      })
  },
  {
    id: 'saddle',
    title: 'The saddle',
    question: 'At the dead center of this surface the gradient is exactly zero. Is that point a minimum?',
    options: ['Yes — zero gradient means done', 'No — it curves DOWN in one direction', 'Impossible to tell from gradients'],
    correctIndex: 1,
    explain:
      'It is a saddle: uphill along α, downhill along β. Zero gradient only means "flat right here". GD lingers (watch the slow start), then any nudge along β grows until it slides off to a true minimum. In high dimensions, saddles vastly outnumber minima.',
    setup: () =>
      scenario({
        problem: 'saddle-point',
        optimizer: 'gd',
        marker: { a: 1.4, b: 0.02 },
        learningRate: 0.05,
        totalSteps: 300,
        stepsPerSecond: 60
      })
  },
  {
    id: 'tiny-net',
    title: 'You\'ve been doing deep learning',
    question:
      'This is a real neural network: ŷ = β·tanh(αX), twin minima at ±(1.2, 1.5). Starting from the lower-left, training finds…',
    options: ['The + copy at (1.2, 1.5)', 'The mirror copy at (−1.2, −1.5)', 'The dead saddle at the origin'],
    correctIndex: 1,
    explain:
      'Flipping the signs of both weights leaves the network\'s output unchanged — two parameter settings, one identical function. Real networks have astronomically many such equivalent minima, and which one you land in is decided by the random init. Everything in this course was deep learning all along — just with two weights instead of billions.',
    setup: () =>
      scenario({
        problem: 'tiny-net',
        optimizer: 'gd',
        seed: 5,
        marker: { a: -2.1, b: -2.3 },
        learningRate: 0.1,
        totalSteps: 250
      })
  }
];

const PROGRESS_KEY = 'gd-course-idx';

function loadProgress(): number {
  if (typeof window === 'undefined') return 0;
  const v = parseInt(localStorage.getItem(PROGRESS_KEY) ?? '0', 10);
  return Number.isFinite(v) ? Math.max(0, Math.min(lessons.length - 1, v)) : 0;
}

function saveProgress(idx: number) {
  if (typeof window !== 'undefined') localStorage.setItem(PROGRESS_KEY, String(idx));
}

/** Open the course at the saved lesson and stage its scenario. */
export function startCourse() {
  stopTraining();
  stopRace();
  clearCoach();
  const idx = loadProgress();
  courseStore.set({ active: true, idx, phase: 'predict', answer: null });
  lessons[idx].setup();
}

export function closeCourse() {
  courseStore.set({ active: false, idx: get(courseStore).idx, phase: 'predict', answer: null });
}

/** Lock in a prediction and launch the run. */
export function answerLesson(answer: number) {
  const s = get(courseStore);
  if (!s.active || s.phase !== 'predict') return;
  courseStore.set({ ...s, answer, phase: 'running' });
  const lesson = lessons[s.idx];
  if (lesson.kind === 'race') startRace();
  else startTraining();
}

/** Reveal → next lesson (or the completion card after the last one). */
export function nextLesson() {
  const s = get(courseStore);
  if (!s.active) return;
  const idx = s.idx + 1;
  if (idx >= lessons.length) {
    saveProgress(0); // a finished course restarts from the top next time
    courseStore.set({ ...s, phase: 'done' });
    return;
  }
  saveProgress(idx);
  courseStore.set({ active: true, idx, phase: 'predict', answer: null });
  lessons[idx].setup();
}

/** From the completion card: run it again from lesson one. */
export function restartCourse() {
  saveProgress(0);
  courseStore.set({ active: true, idx: 0, phase: 'predict', answer: null });
  lessons[0].setup();
}
