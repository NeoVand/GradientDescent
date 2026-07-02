/**
 * One-click experiments.
 *
 * Each experiment is a fully-configured scenario: a declarative `state`
 * (staged via applyScenario, and — because it is data — renderable as a deep
 * link or a printed QR code) plus a coach note explaining what to watch for.
 * They power the "Things to try" cards in the help modal.
 *
 * A couple of experiments do things ScenarioState can't describe yet (races,
 * coach-only tours); those keep a bespoke apply() and no state.
 */

import { raceConfigStore, showCoach } from '../stores/stores';
import { applyProblem, startRace } from './trainer';
import { applyScenario, type ScenarioState } from './scenario';

export interface Experiment {
  id: string;
  title: string;
  blurb: string;
  /** The staged situation, as data — the source of truth for apply() and links. */
  state?: ScenarioState;
  apply(): void;
}

/** The common shape: stage the declared state, then say what to watch for. */
function scenarioExperiment(exp: {
  id: string;
  title: string;
  blurb: string;
  state: ScenarioState;
  coach?: { kind: 'info' | 'warn' | 'success'; text: string; ttl: number };
}): Experiment {
  return {
    id: exp.id,
    title: exp.title,
    blurb: exp.blurb,
    state: exp.state,
    apply() {
      applyScenario(exp.state);
      if (exp.coach) showCoach(exp.coach.kind, exp.coach.text, exp.coach.ttl);
    }
  };
}

export const experiments: Experiment[] = [
  scenarioExperiment({
    id: 'local-minimum',
    title: 'Watch a local minimum trap you',
    blurb:
      'Sine Wave with plain GD: frequency aliasing carves many basins, and the marker settles into whichever one it starts in.',
    state: { problem: 'sine-wave', optimizer: 'gd', run: true },
    coach: {
      kind: 'info',
      text: 'If the fit looks wrong, the marker is in a local minimum — a side ripple of the loss. Reset for a new start, or try Momentum 0.9.',
      ttl: 14000
    }
  }),
  scenarioExperiment({
    id: 'symmetric-pair',
    title: 'Two equally good answers',
    blurb:
      'Gaussian Peak has mirror basins at β = ±1 (width enters as β²). Which one you reach depends only on where you start.',
    state: { problem: 'gaussian-peak', optimizer: 'gd', run: true },
    coach: {
      kind: 'info',
      text: 'Two mirror basins at β = ±1. Fresh starts always land above β = 0, so to see the twin: drag the marker below the β = 0 line, then Train — same loss, mirror answer.',
      ttl: 14000
    }
  }),
  scenarioExperiment({
    id: 'vanishing-gradient',
    title: 'The vanishing-gradient graveyard',
    blurb:
      'Far from a Gaussian peak the model is flat and ∇ℒ ≈ 0. Start out on the dead plateau and watch Train barely move.',
    // Plain GD is the point here — an adaptive optimizer left over from a
    // previous experiment would walk off the plateau and spoil the lesson.
    state: { problem: 'gaussian-peak', optimizer: 'gd', marker: { a: 2.7, b: 2.7 }, run: true },
    coach: {
      kind: 'warn',
      text: 'You start on the dead plateau: ‖∇ℒ‖ ≈ 0, so steps go nowhere — the vanishing-gradient problem. Drag the marker inward or crank momentum.',
      ttl: 14000
    }
  }),
  scenarioExperiment({
    id: 'narrow-valley',
    title: 'Crawl vs. fly through a narrow valley',
    blurb:
      'Power Law is a long, thin trench. Plain GD inches along the floor; momentum accumulates speed along the valley axis.',
    state: { problem: 'power-law', optimizer: 'gd', run: true },
    coach: {
      kind: 'info',
      text: 'Plain GD creeps along the trench. When it stops, switch Optimizer → Momentum and Train again from the same spot — feel the difference.',
      ttl: 14000
    }
  }),
  scenarioExperiment({
    id: 'noisy-truth',
    title: 'Noise moves the minimum',
    blurb:
      'Crank the noise on Linear Regression: the basin shifts away from the true line. No optimizer can undo noisy data.',
    state: { problem: 'linear-regression', optimizer: 'gd', noiseLevel: 2, run: true },
    coach: {
      kind: 'info',
      text: 'With noise at 2.0 the empirical minimum no longer matches the dashed true line — training is only as good as the data.',
      ttl: 14000
    }
  }),
  scenarioExperiment({
    id: 'adam-vs-gd',
    title: 'Why Adam exists',
    blurb:
      'Exponential Decay has wildly different curvature per direction. Adam rescales each parameter and shrugs it off.',
    state: { problem: 'exponential-decay', optimizer: 'adam', run: true },
    coach: {
      kind: 'info',
      text: 'Adam normalizes each parameter’s step by its gradient history. Compare: Optimizer → Gradient Descent on this surface needs a microscopic γ.',
      ttl: 14000
    }
  }),
  {
    id: 'banana-race',
    title: 'The banana-valley showdown',
    blurb:
      'Rosenbrock’s curved valley is the optimizer torture test. Race GD, Momentum, RMSProp, and Adam from the same start.',
    apply() {
      applyProblem('rosenbrock');
      // The valley crawl is slow by design — give the racers room to finish.
      // Races read raceConfigStore (not trainingStore), so configure it there.
      raceConfigStore.setMaxSteps(1000);
      raceConfigStore.setSpeed(60);
      startRace();
    }
  },
  scenarioExperiment({
    id: 'lion-schedule',
    title: 'Why a schedule matters — Lion that won’t settle',
    blurb:
      'Lion steps by the sign of its momentum, so every step is the same size and it never shrinks — on a Constant schedule it orbits the minimum forever. Switch to Cosine and watch the ring close to a point.',
    // A larger-than-default γ makes the fixed-step orbit clearly visible.
    // A FINITE run on Constant lets it ring around the minimum (the band never
    // flatlines); the learner then switches to Cosine, where the schedule —
    // which only applies to finite runs, not ∞ — bleeds γ away and lands it.
    state: {
      problem: 'gaussian-mixture',
      optimizer: 'lion',
      learningRate: 0.15,
      schedule: 'constant',
      continuous: false,
      totalSteps: 300,
      stepsPerSecond: 60,
      run: true
    },
    coach: {
      kind: 'info',
      text: 'Lion’s step is always ±γ — it can’t get smaller near the bottom, so it buzzes around the minimum in a fixed ring. Open Schedule → Cosine and Train again: as γ bleeds to zero the ring closes to a point. That’s what a schedule is for.',
      ttl: 16000
    }
  }),
  scenarioExperiment({
    id: 'marker-is-model',
    title: 'The marker IS the parameters',
    blurb:
      'On Circle Classifier the parameters (α, β) are the circle’s center — the marker appears on the data plot itself, mirroring the one on the loss map.',
    state: { problem: 'circle-classifier' },
    coach: {
      kind: 'info',
      text: 'The orange marker on the LEFT plot is literally (α, β) — the circle’s center. Drag the marker on the Loss & Gradient panel and watch the circle follow: they are the same two numbers.',
      ttl: 14000
    }
  })
];

/**
 * Per-chapter presets for the guide. Each one closes the book and sets up
 * the live app to match what the chapter just explained — the right problem,
 * optimizer, marker, and a coach note pointing at the thing to watch. Kept
 * separate from `experiments` so the "Things to try" list stays curated;
 * the guide looks these up by chapter id.
 */
export const chapterPresets: Record<string, Experiment> = {
  'ch-generalize': scenarioExperiment({
    id: 'preset-generalize',
    title: 'Watch a model fit the noise',
    blurb: '',
    state: { problem: 'linear-regression', optimizer: 'gd', noiseLevel: 2, run: true },
    coach: {
      kind: 'info',
      text: 'With the noise cranked up, the basin no longer sits on the dashed true line — training now chases this particular noisy sample, not the truth. That gap between “best on the training data” and “best on reality” is the seed of overfitting; give a model enough knobs and it grows into memorizing the scatter outright.',
      ttl: 17000
    }
  }),
  'ch-shapes': scenarioExperiment({
    id: 'preset-shapes',
    title: 'Fall into a local minimum',
    blurb: '',
    state: { problem: 'double-well-1d', optimizer: 'gd', run: true },
    coach: {
      kind: 'info',
      text: 'Two valleys, one deeper than the other. Gradient descent only feels the local slope, so it settles into whichever basin it started in — hit Reset then Train a few times and watch where you start decide where you land.',
      ttl: 16000
    }
  }),
  'ch-bowl': scenarioExperiment({
    id: 'preset-bowl',
    title: 'Roll into the bowl',
    blurb: '',
    state: { problem: 'linear-regression', optimizer: 'gd', run: true },
    coach: {
      kind: 'info',
      text: 'One clean bowl. The loss falls as the marker rolls to the single lowest point — that is all of training, in miniature.',
      ttl: 13000
    }
  }),
  'ch-landscape': scenarioExperiment({
    id: 'preset-landscape',
    title: 'Lift the map into 3D',
    blurb: '',
    state: { problem: 'polynomial-regression', view: '3d' },
    coach: {
      kind: 'info',
      text: 'The flat contour map lifts into real hills and valleys — drag to rotate it. Low ground is a good model, high ground a bad one (the colour bar shows which shade means low). Press D to flip back to 2D.',
      ttl: 15000
    }
  }),
  'ch-derivative': scenarioExperiment({
    id: 'preset-derivative',
    title: 'Feel the slope settle',
    blurb: '',
    state: { problem: 'slope-1d', optimizer: 'gd', marker: { a: 2.0, b: 0 } },
    coach: {
      kind: 'info',
      text: 'Don’t train yet — read the curve. The dashed line under the marker is the tangent: the derivative made visible. Nudge α with the ← → keys and watch the slope change; walk toward the bottom and it flattens toward zero.',
      ttl: 16000
    }
  }),
  'ch-curvature': scenarioExperiment({
    id: 'preset-curvature',
    title: 'Read κ off the lens',
    blurb: '',
    state: { problem: 'stretched-bowl', optimizer: 'gd', lens: true, run: true },
    coach: {
      kind: 'info',
      text: 'The lens ellipse IS the local bowl: long axis the gentle bend (λ = 0.4), short axis the sharp one (λ = 4), so κ = 10. Watch β snap to the floor while α crawls. Then find the edge: γ = 0.45 bounces in, γ = 0.55 blows up — the theory says the line is at exactly 0.5.',
      ttl: 18000
    }
  }),
  'ch-downhill': scenarioExperiment({
    id: 'preset-downhill',
    title: 'Show the downhill arrows',
    blurb: '',
    state: { problem: 'linear-regression', optimizer: 'gd', marker: { a: -4, b: 3.5 } },
    coach: {
      kind: 'info',
      text: 'Don’t train yet — read the Loss & Gradient panel. The faint arrows are −∇ℒ everywhere; the blue arrow on the marker is the steepest way down from where you stand. Notice they all cut straight across the contour loops.',
      ttl: 16000
    }
  }),
  'ch-step': scenarioExperiment({
    id: 'preset-step',
    title: 'Take one step at a time',
    blurb: '',
    state: { problem: 'linear-regression', optimizer: 'gd', marker: { a: -3.5, b: 3 } },
    coach: {
      kind: 'info',
      text: 'Press Step (or the S key) to take exactly one −γ∇ℒ move, and watch the marker hop. The red arrow is the step actually taken; the blue arrow is pure downhill — early on they nearly agree.',
      ttl: 16000
    }
  }),
  'ch-gamma': scenarioExperiment({
    id: 'preset-gamma',
    title: 'Push γ past the edge',
    blurb: '',
    state: {
      problem: 'linear-regression',
      optimizer: 'gd',
      marker: { a: -3, b: 2.5 },
      learningRate: 1.3,
      totalSteps: 80,
      run: true
    },
    coach: {
      kind: 'warn',
      text: 'γ is cranked past the stable 2/λmax limit — watch the steps grow instead of shrink until the run blows up. Drop γ back down and Train again for a smooth glide.',
      ttl: 16000
    }
  }),
  'ch-noise': scenarioExperiment({
    id: 'preset-noise',
    title: 'Watch the noise ball',
    blurb: '',
    state: {
      problem: 'linear-regression',
      optimizer: 'gd',
      batchSize: 1,
      totalSteps: 300,
      stepsPerSecond: 40,
      run: true
    },
    coach: {
      kind: 'info',
      text: 'A batch of 1 turns every gradient into a noisy estimate. The loss falls, then can’t hold still — it settles into a fuzzy band, the noise ball. Slide the batch size up and the band calms down.',
      ttl: 16000
    }
  })
};
