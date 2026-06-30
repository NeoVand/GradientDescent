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
  /** The setup step: what was staged and where to look before predicting. */
  intro: string;
  question: string;
  options: string[];
  correctIndex: number;
  explain: string;
  /** What the Run step launches: a training run (default) or a race. */
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
    intro:
      "I've dropped the marker high on the right wall of a 1D parabola — the simplest loss landscape there is. The dashed tangent line shows the slope under it.",
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
    intro:
      "Same parabola, same start — but γ is cranked from 0.05 to 0.9. Look at the amber 'next step' ghost: the predicted jump is now enormous.",
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
    intro:
      'A double well: two valleys, the left one deeper — the map button in the landscape header colors their two territories. The marker starts on the right rim.',
    question: 'Two valleys; the left one is deeper. Starting on the RIGHT rim, gradient descent ends up…',
    options: ['In the deep left valley — it finds the best', 'In the shallow right valley', 'Bouncing between both'],
    correctIndex: 1,
    explain:
      'GD only ever rolls downhill, so it commits to whichever valley it starts above — it cannot climb the barrier to check the other one. Where you start decides where you finish. (The map button in the landscape header shows the two territories.)',
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
    intro:
      "The marker sits far out on the Gaussian peak's flat shoulder. Check the readout: ‖∇ℒ‖ is essentially zero out here.",
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
    intro:
      'A steep, curved valley — and a four-way race staged from one start: GD, Momentum, RMSProp, and Adam, each with its tuned γ.',
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
    intro:
      'Batch size is set to 2 of 20 points. See the faint blue fan at the marker — every ray is the gradient according to a different random pair.',
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
    intro:
      "Rosenbrock's banana valley: the classic torture test. The walls are ~2500× steeper than the floor — the curvature-lens button in the landscape header reads out κ.",
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
    intro:
      'The same dead plateau as lesson 4 — same start, same surface — but the optimizer is now Adam. Watch the amber ghost: it already disagrees with plain GD.',
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
    intro:
      'Dead center of this surface is a saddle point. The marker starts just beside it, where the gradient is almost — but not exactly — zero.',
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
    intro:
      'This is a real neural network with two weights, and the surface shows its twin mirror basins. The marker starts in the lower-left.',
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

/** Resolve a lesson id to its index (0 if unknown). */
export function lessonIndexById(id: string): number {
  const i = lessons.findIndex(l => l.id === id);
  return i < 0 ? 0 : i;
}

/**
 * Open the course on its welcome screen — what's coming and how the
 * predict → run → learn loop works — WITHOUT staging anything yet, so the
 * live app keeps whatever the reader was looking at until they press Start.
 */
export function startCourseIntro() {
  stopTraining();
  stopRace();
  clearCoach();
  courseStore.set({ active: true, idx: loadProgress(), phase: 'welcome', answer: null });
}

/** Leave the welcome screen and stage the first/resumed lesson. */
export function beginCourse() {
  const s = get(courseStore);
  if (!s.active || s.phase !== 'welcome') return;
  enterLesson(s.idx);
}

/** Launch the course straight into the lesson tied to a guide chapter. */
export function enterCourseFromChapter(lessonId: string) {
  enterLesson(lessonIndexById(lessonId));
}

/** Stage lesson idx from its setup step. The one entry point for all
 *  navigation: next, previous, and jumping via the progress dots. */
export function enterLesson(idx: number) {
  const clamped = Math.max(0, Math.min(lessons.length - 1, idx));
  stopTraining();
  stopRace();
  clearCoach();
  saveProgress(clamped);
  courseStore.set({ active: true, idx: clamped, phase: 'setup', answer: null });
  lessons[clamped].setup();
}

export function closeCourse() {
  courseStore.set({ active: false, idx: get(courseStore).idx, phase: 'setup', answer: null });
}

/** Setup step acknowledged — show the question. */
export function beginPredict() {
  const s = get(courseStore);
  if (!s.active || s.phase !== 'setup') return;
  courseStore.set({ ...s, phase: 'predict' });
}

/** Select an answer (no side effects — Run is its own explicit step). */
export function answerLesson(answer: number) {
  const s = get(courseStore);
  if (!s.active || s.phase !== 'predict') return;
  courseStore.set({ ...s, answer });
}

/** Launch the run for the committed answer. */
export function launchLesson() {
  const s = get(courseStore);
  if (!s.active || s.phase !== 'predict' || s.answer === null) return;
  courseStore.set({ ...s, phase: 'running' });
  const lesson = lessons[s.idx];
  if (lesson.kind === 'race') startRace();
  else startTraining();
}

/** Reveal → next lesson (or the completion card after the last one). */
export function nextLesson() {
  const s = get(courseStore);
  if (!s.active) return;
  if (s.idx + 1 >= lessons.length) {
    saveProgress(0); // a finished course restarts from the top next time
    courseStore.set({ ...s, phase: 'done' });
    return;
  }
  enterLesson(s.idx + 1);
}

export function prevLesson() {
  const s = get(courseStore);
  if (!s.active) return;
  enterLesson(s.idx - 1);
}

/** From the completion card: run it again from lesson one. */
export function restartCourse() {
  enterLesson(0);
}
