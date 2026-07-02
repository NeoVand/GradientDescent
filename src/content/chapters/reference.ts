import type { Block } from '../blocks';

/**
 * Part V · The zoo, and the reference pages. These chapters are thin by
 * design: the problem bestiary and the experiment cards are data
 * (problemCards.ts, experiments.ts) rendered by the chapter shell; the
 * keyboard map is app-only and drops from print.
 */

/** Chapter 18 · The landscape zoo. */
export const chProblems: Block[] = [
  {
    kind: 'p',
    text: 'Every problem here has at most two parameters — the three 1D warm-ups use just $\\alpha$ — and a loss surface you can see live. Each surface tells a different story, from a single clean bowl to four-way ties and exploding cliffs, and each ships with a curated default learning rate and view (and, where it helps, momentum).'
  },
  { kind: 'widget', id: 'problem-grid' }
];

/** Chapter 19 · Things to try. */
export const chExperiments: Block[] = [
  {
    kind: 'p',
    text: 'Each card is a ready-made scenario — one click sets everything up, starts training, and tells you what to watch for.'
  },
  { kind: 'widget', id: 'experiments-list' }
];

/** Reference · Reading the panels. */
export const chPanels: Block[] = [
  {
    kind: 'list',
    variant: 'viz',
    items: [
      '**Data plot** — the data points and the current model. For curve fits, blue solid is the current fit and green dashed is the truth. For 2D problems, the orange marker shows your parameters directly on the plot.',
      '**Loss & Gradient** — the loss landscape seen from above: the vivid end of the colour scale marks low loss (bright in night mode, deep in day mode — the colour bar shows which), thin contours join equal-loss points, and the field arrows are $-\\nabla\\mathcal{L}$. On the marker, the {blue:blue arrow} is steepest descent and the {red:red arrow} is the step actually taken. Drag the marker to teleport.',
      '**Loss History** — train and test loss versus step. A clean decline is healthy; spikes mean you’re overshooting (too much $\\gamma$ or $\\mu$); a persistent train/test gap hints at overfitting.'
    ]
  }
];

/** Reference · Keyboard — app-only; print drops it. */
export const chKeys: Block[] = [{ kind: 'widget', id: 'keyboard' }];
