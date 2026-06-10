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
  showCoach
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
