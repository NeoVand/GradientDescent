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
  recordInitialHistory,
  resetOptimizerState,
  showCoach,
  landscapeViewStore
} from '../stores/stores';
import { applyProblem, applyOptimizer, startTraining, startRace } from './trainer';

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
