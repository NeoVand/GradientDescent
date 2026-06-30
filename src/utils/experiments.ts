/**
 * One-click experiments.
 *
 * Each experiment is a fully-configured scenario: it sets the problem,
 * optimizer, and hyperparameters through the trainer, optionally seeds a
 * specific starting position, starts training, and leaves a coach note
 * explaining what to watch for. They power the "Things to try" cards in
 * the help modal.
 */

import {
  datasetStore,
  parametersStore,
  trainingStore,
  optimizerStore,
  divergenceStore,
  recordInitialHistory,
  resetOptimizerState,
  showCoach,
  landscapeViewStore
} from '../stores/stores';
import {
  applyProblem,
  applyOptimizer,
  startTraining,
  startRace,
  resolveLearningRate,
  hyperForProblem
} from './trainer';
import type { ProblemType } from '../types/types';
import type { OptimizerId } from './optimizers';

export interface Experiment {
  id: string;
  title: string;
  blurb: string;
  apply(): void;
}

export const experiments: Experiment[] = [
  {
    id: 'local-minimum',
    title: 'Watch a local minimum trap you',
    blurb:
      'Sine Wave with plain GD: frequency aliasing carves many basins, and the marker settles into whichever one it starts in.',
    apply() {
      applyProblem('sine-wave');
      applyOptimizer('gd');
      startTraining();
      showCoach(
        'info',
        'If the fit looks wrong, the marker is in a local minimum — a side ripple of the loss. Reset for a new start, or try Momentum 0.9.',
        14000
      );
    }
  },
  {
    id: 'symmetric-pair',
    title: 'Two equally good answers',
    blurb:
      'Gaussian Peak has mirror basins at β = ±1 (width enters as β²). Which one you reach depends only on where you start.',
    apply() {
      applyProblem('gaussian-peak');
      startTraining();
      showCoach(
        'info',
        'Two mirror basins at β = ±1. Hit Reset then Train a few times — the starting point decides the destination.',
        14000
      );
    }
  },
  {
    id: 'vanishing-gradient',
    title: 'The vanishing-gradient graveyard',
    blurb:
      'Far from a Gaussian peak the model is flat and ∇ℒ ≈ 0. Start out on the dead plateau and watch Train barely move.',
    apply() {
      applyProblem('gaussian-peak');
      // Drop the marker on the plateau where gradients have died out
      parametersStore.set({ a: 2.7, b: 2.7 });
      resetOptimizerState();
      recordInitialHistory();
      startTraining();
      showCoach(
        'warn',
        'You start on the dead plateau: ‖∇ℒ‖ ≈ 0, so steps go nowhere — the vanishing-gradient problem. Drag the marker inward or crank momentum.',
        14000
      );
    }
  },
  {
    id: 'narrow-valley',
    title: 'Crawl vs. fly through a narrow valley',
    blurb:
      'Power Law is a long, thin trench. Plain GD inches along the floor; momentum accumulates speed along the valley axis.',
    apply() {
      applyProblem('power-law');
      applyOptimizer('gd');
      startTraining();
      showCoach(
        'info',
        'Plain GD creeps along the trench. When it stops, switch Optimizer → Momentum and Train again from the same spot — feel the difference.',
        14000
      );
    }
  },
  {
    id: 'noisy-truth',
    title: 'Noise moves the minimum',
    blurb:
      'Crank the noise on Linear Regression: the basin shifts away from the true line. No optimizer can undo noisy data.',
    apply() {
      applyProblem('linear-regression');
      datasetStore.setNoiseLevel(2);
      datasetStore.regenerateData();
      recordInitialHistory();
      startTraining();
      showCoach(
        'info',
        'With noise at 2.0 the empirical minimum no longer matches the dashed true line — training is only as good as the data.',
        14000
      );
    }
  },
  {
    id: 'adam-vs-gd',
    title: 'Why Adam exists',
    blurb:
      'Exponential Decay has wildly different curvature per direction. Adam rescales each parameter and shrugs it off.',
    apply() {
      applyProblem('exponential-decay');
      applyOptimizer('adam');
      startTraining();
      showCoach(
        'info',
        'Adam normalizes each parameter’s step by its gradient history. Compare: Optimizer → Gradient Descent on this surface needs a microscopic γ.',
        14000
      );
    }
  },
  {
    id: 'banana-race',
    title: 'The banana-valley showdown',
    blurb:
      'Rosenbrock’s curved valley is the optimizer torture test. Race GD, Momentum, RMSProp, and Adam from the same start.',
    apply() {
      applyProblem('rosenbrock');
      // The valley crawl is slow by design — give the racers room to finish
      trainingStore.update(s => ({ ...s, totalSteps: 1000, stepsPerSecond: 60 }));
      startRace();
    }
  },
  {
    id: 'lion-schedule',
    title: 'Why a schedule matters — Lion that won’t settle',
    blurb:
      'Lion steps by the sign of its momentum, so every step is the same size and it never shrinks — on a Constant schedule it orbits the minimum forever. Switch to Cosine and watch the ring close to a point.',
    apply() {
      applyProblem('gaussian-mixture');
      applyOptimizer('lion');
      // A larger-than-default γ makes the fixed-step orbit clearly visible.
      // A FINITE run on Constant lets it ring around the minimum (the band never
      // flatlines); the learner then switches to Cosine, where the schedule —
      // which only applies to finite runs, not ∞ — bleeds γ away and lands it.
      // (applyOptimizer set Lion's γ; override it after.)
      trainingStore.update(s => ({
        ...s,
        learningRate: 0.15,
        schedule: 'constant',
        continuous: false,
        totalSteps: 300,
        stepsPerSecond: 60
      }));
      startTraining();
      showCoach(
        'info',
        'Lion’s step is always ±γ — it can’t get smaller near the bottom, so it buzzes around the minimum in a fixed ring. Open Schedule → Cosine and Train again: as γ bleeds to zero the ring closes to a point. That’s what a schedule is for.',
        16000
      );
    }
  },
  {
    id: 'marker-is-model',
    title: 'The marker IS the parameters',
    blurb:
      'On Circle Classifier the parameters (α, β) are the circle’s center — the marker appears on the data plot itself. Drag either marker.',
    apply() {
      applyProblem('circle-classifier');
      showCoach(
        'info',
        'Drag the orange marker on the LEFT plot — it is literally (α, β), the circle’s center. Both views move together.',
        14000
      );
    }
  }
];

/**
 * Per-chapter presets for the guide. Each one closes the book and sets up
 * the live app to match what the chapter just explained — the right problem,
 * optimizer, marker, and a coach note pointing at the thing to watch. Kept
 * separate from `experiments` so the "Things to try" list stays curated;
 * the guide looks these up by chapter id.
 */
export const chapterPresets: Record<string, Experiment> = {
  'ch-generalize': {
    id: 'preset-generalize',
    title: 'Watch a model fit the noise',
    blurb: '',
    apply() {
      applyProblem('linear-regression');
      datasetStore.setNoiseLevel(2);
      datasetStore.regenerateData();
      recordInitialHistory();
      startTraining();
      showCoach(
        'info',
        'With the noise cranked up, training drives the loss down by bending the fit toward the random scatter — but the basin no longer sits on the dashed true line. Driving training loss to zero here means memorizing noise, not learning the signal. That gap is overfitting.',
        17000
      );
    }
  },
  'ch-shapes': {
    id: 'preset-shapes',
    title: 'Fall into a local minimum',
    blurb: '',
    apply() {
      applyProblem('double-well-1d');
      applyOptimizer('gd');
      startTraining();
      showCoach(
        'info',
        'Two valleys, one deeper than the other. Gradient descent only feels the local slope, so it settles into whichever basin it started in — hit Reset then Train a few times and watch where you start decide where you land.',
        16000
      );
    }
  },
  'ch-bowl': {
    id: 'preset-bowl',
    title: 'Roll into the bowl',
    blurb: '',
    apply() {
      applyProblem('linear-regression');
      applyOptimizer('gd');
      startTraining();
      showCoach(
        'info',
        'One clean bowl. The loss falls as the marker rolls to the single lowest point — that is all of training, in miniature.',
        13000
      );
    }
  },
  'ch-landscape': {
    id: 'preset-landscape',
    title: 'Lift the map into 3D',
    blurb: '',
    apply() {
      applyProblem('polynomial-regression');
      landscapeViewStore.set('3d');
      showCoach(
        'info',
        'The flat contour map lifts into real hills and valleys — drag to rotate it. Bright and low is a good model, dark and high is a bad one. Press D to flip back to 2D.',
        15000
      );
    }
  },
  'ch-downhill': {
    id: 'preset-downhill',
    title: 'Show the downhill arrows',
    blurb: '',
    apply() {
      applyProblem('linear-regression');
      applyOptimizer('gd');
      parametersStore.set({ a: -4, b: 3.5 });
      resetOptimizerState();
      recordInitialHistory();
      showCoach(
        'info',
        'Don’t train yet — read the Loss & Gradient panel. The faint arrows are −∇ℒ everywhere; the blue arrow on the marker is the steepest way down from where you stand. Notice they all cut straight across the white contours.',
        16000
      );
    }
  },
  'ch-step': {
    id: 'preset-step',
    title: 'Take one step at a time',
    blurb: '',
    apply() {
      applyProblem('linear-regression');
      applyOptimizer('gd');
      parametersStore.set({ a: -3.5, b: 3 });
      resetOptimizerState();
      recordInitialHistory();
      showCoach(
        'info',
        'Press Step (or the S key) to take exactly one −γ∇ℒ move, and watch the marker hop. The red arrow is the step actually taken; the blue arrow is pure downhill — early on they nearly agree.',
        16000
      );
    }
  },
  'ch-gamma': {
    id: 'preset-gamma',
    title: 'Push γ past the edge',
    blurb: '',
    apply() {
      applyProblem('linear-regression');
      applyOptimizer('gd');
      parametersStore.set({ a: -3, b: 2.5 });
      resetOptimizerState();
      recordInitialHistory();
      trainingStore.update(s => ({ ...s, learningRate: 1.3, totalSteps: 80 }));
      startTraining();
      showCoach(
        'warn',
        'γ is cranked past the stable 2/λmax limit — watch the steps grow instead of shrink until the run blows up. Drop γ back down and Train again for a smooth glide.',
        16000
      );
    }
  },
  'ch-noise': {
    id: 'preset-noise',
    title: 'Watch the noise ball',
    blurb: '',
    apply() {
      applyProblem('linear-regression');
      applyOptimizer('gd');
      trainingStore.update(s => ({ ...s, batchSize: 1, totalSteps: 300, stepsPerSecond: 40 }));
      startTraining();
      showCoach(
        'info',
        'A batch of 1 turns every gradient into a noisy estimate. The loss falls, then can’t hold still — it settles into a fuzzy band, the noise ball. Slide the batch size up and the band calms down.',
        16000
      );
    }
  }
};

/**
 * One-click demos for the optimizer chapter — one per method in the family
 * tree, each staged on the surface that shows off (or exposes) that optimizer:
 * GD rattling a ravine, Adam striding off a plateau, Newton snapping to a
 * bowl's bottom, Lion orbiting a minimum. Each stages the scenario, runs it,
 * and leaves a coach note naming what to watch. Keyed by the optimizer's
 * display name (matching the optTree cards in the guide).
 */
interface OptDemo {
  problem: ProblemType;
  optimizer: OptimizerId;
  /** Override the resolved learning rate (defaults to the curated one). */
  lr?: number;
  /** Override specific hyperparameters on top of the curated defaults. */
  hyper?: Record<string, number>;
  marker?: { a: number; b: number };
  steps?: number;
  speed?: number;
  coach: string;
  coachKind?: 'info' | 'warn';
}

function runOptimizerDemo(o: OptDemo) {
  applyProblem(o.problem);
  // Force the exact optimizer + hyper (applyProblem may have auto-picked a
  // momentum default that we want to override, e.g. for the plain-GD demo).
  optimizerStore.set({
    id: o.optimizer,
    hyper: { ...hyperForProblem(o.optimizer, o.problem), ...(o.hyper ?? {}) }
  });
  divergenceStore.set(null);
  trainingStore.update(s => ({
    ...s,
    learningRate: o.lr ?? resolveLearningRate(o.optimizer, o.problem),
    totalSteps: o.steps ?? 300,
    stepsPerSecond: o.speed ?? 55,
    batchSize: 'all',
    schedule: 'constant'
  }));
  if (o.marker) parametersStore.set({ ...o.marker });
  resetOptimizerState();
  recordInitialHistory();
  startTraining();
  showCoach(o.coachKind ?? 'info', o.coach, 16000);
}

const RAVINE = { a: -1.35, b: 1.35 };   // high on a wall of the exp-decay ravine
const BOWL_FAR = { a: -6, b: 5 };        // well off the minimum of a clean bowl

export const optimizerDemos: Record<string, () => void> = {
  'Gradient Descent': () =>
    runOptimizerDemo({
      problem: 'rosenbrock',
      optimizer: 'gd',
      lr: 0.0002,
      marker: { a: -1.4, b: -0.6 },
      steps: 400,
      speed: 60,
      coach:
        'Plain GD on Rosenbrock’s banana valley — the optimizer torture test. With one γ for both axes it must keep γ tiny so the steep walls don’t explode, which makes progress along the shallow floor microscopic: it drops in fast, then barely crawls. This is the baseline every later method is built to beat.'
    }),
  Momentum: () =>
    runOptimizerDemo({
      problem: 'exponential-decay',
      optimizer: 'momentum',
      hyper: { mu: 0.9 },
      marker: RAVINE,
      steps: 350,
      speed: 60,
      coach:
        'Same ravine, now with momentum: a moving average of gradients cancels the side-to-side wobble and compounds the steady downhill push, so it glides along the valley floor. Watch the small overshoot as it settles.'
    }),
  Nesterov: () =>
    runOptimizerDemo({
      problem: 'exponential-decay',
      optimizer: 'nesterov',
      hyper: { mu: 0.9 },
      marker: RAVINE,
      steps: 350,
      speed: 60,
      coach:
        'Nesterov is momentum with foresight: it measures the slope a step ahead, so it glides down the ravine like momentum but brakes into the turn — reining in the end-of-run overshoot plain momentum suffers.'
    }),
  AdaGrad: () =>
    runOptimizerDemo({
      problem: 'exponential-decay',
      optimizer: 'adagrad',
      marker: RAVINE,
      steps: 400,
      speed: 60,
      coach:
        'AdaGrad gives each axis a step from its own gradient history — quick at first. But that history only grows, so watch the steps shrink toward a crawl before it reaches the bottom: it slowly strangles itself.'
    }),
  RMSProp: () =>
    runOptimizerDemo({
      problem: 'exponential-decay',
      optimizer: 'rmsprop',
      marker: RAVINE,
      steps: 350,
      speed: 60,
      coach:
        'RMSProp forgets old gradients with a moving average, so its per-axis step never decays to zero like AdaGrad’s — it keeps adapting all the way down the ill-conditioned valley.'
    }),
  AdaDelta: () =>
    runOptimizerDemo({
      problem: 'exponential-decay',
      optimizer: 'adadelta',
      marker: RAVINE,
      steps: 400,
      speed: 60,
      coach:
        'AdaDelta sets its own step size from the RMS of its recent moves — there is no learning rate to tune at all. It works its way down the valley without you ever choosing γ.'
    }),
  Adam: () =>
    runOptimizerDemo({
      problem: 'exponential-decay',
      optimizer: 'adam',
      marker: RAVINE,
      steps: 300,
      speed: 60,
      coach:
        'Adam = Momentum + RMSProp. On this ill-conditioned ravine — where plain GD needs a microscopic γ to avoid exploding — it rescales each axis by its own gradient history and descends fast and stably. This is the workhorse of modern deep learning.'
    }),
  Nadam: () =>
    runOptimizerDemo({
      problem: 'exponential-decay',
      optimizer: 'nadam',
      marker: RAVINE,
      steps: 300,
      speed: 60,
      coach:
        'Nadam is Adam with Nesterov’s look-ahead folded into its momentum — a touch less overshoot and a slightly quicker settle than plain Adam on the same valley.'
    }),
  AdamW: () =>
    runOptimizerDemo({
      problem: 'linear-regression',
      optimizer: 'adamw',
      hyper: { wd: 0.2 },
      marker: BOWL_FAR,
      steps: 220,
      speed: 50,
      coach:
        'AdamW decouples weight decay: λ pulls every weight toward 0, outside the adaptive scaling. With no overfitting to fight in this toy bowl, you can see the fit drift inward — set λ to 0 in the sidebar and it is exact Adam again.'
    }),
  RAdam: () =>
    runOptimizerDemo({
      problem: 'exponential-decay',
      optimizer: 'radam',
      marker: RAVINE,
      steps: 320,
      speed: 60,
      coach:
        'RAdam derives Adam’s warmup: in the first steps, before the squared-gradient estimate can be trusted, it takes plain momentum steps, then eases the adaptive scaling in — a warmup with nothing to hand-tune.'
    }),
  Lion: () =>
    runOptimizerDemo({
      problem: 'linear-regression',
      optimizer: 'lion',
      marker: BOWL_FAR,
      steps: 260,
      speed: 45,
      coach:
        'Lion steps by the sign of its momentum — every hop the same size on each axis, on a cliff or a flat. It descends fast, then can’t settle: a fixed-size step circles the minimum in a ring. Switch Schedule to Cosine to bleed γ down and close the ring to a point.'
    }),
  Newton: () =>
    runOptimizerDemo({
      problem: 'linear-regression',
      optimizer: 'newton',
      marker: BOWL_FAR,
      steps: 40,
      speed: 8,
      coach:
        'Newton reads curvature, not just slope: it fits a quadratic bowl and jumps straight to its bottom — on this clean bowl, essentially in one step. Turn on the curvature lens (the hexagon on the Loss & Gradient panel) to see its violet ghost arrow.'
    }),
  Sophia: () =>
    runOptimizerDemo({
      problem: 'exponential-decay',
      optimizer: 'sophia',
      marker: RAVINE,
      steps: 300,
      speed: 60,
      coach:
        'Sophia keeps Newton’s curvature idea on a budget — just the diagonal (one curvature number per axis) plus a clip for safety. Second-order behaviour down the ill-conditioned valley without inverting a full Hessian.'
    }),
  Prodigy: () =>
    runOptimizerDemo({
      problem: 'linear-regression',
      optimizer: 'prodigy',
      marker: BOWL_FAR,
      steps: 320,
      speed: 55,
      coach:
        'Prodigy removes the last knob, γ. It estimates how far the start is from the solution and ramps the step up live — watch it creep at first, then accelerate as it finds its own scale. Nothing to set.'
    })
};
