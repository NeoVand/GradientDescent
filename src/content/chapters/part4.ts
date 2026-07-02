import type { Block } from '../blocks';

/**
 * Part IV · The optimizer family tree. The prose of these chapters lives in
 * the story cards (optimizerCards.ts); the chapters themselves are thin —
 * the ravine opener carries the conditioning story and the race, the rest
 * are their card slices, and the last closes with the frontier box.
 */

/** Chapter 12 · The ravine, and the race — the part opener. */
export const chRavine: Block[] = [
  {
    kind: 'p',
    text: 'Plain gradient descent has one recurring nemesis: the **ravine** — a valley far steeper across than along. The $\\gamma$ that’s safe on the steep walls is hopeless along the gentle floor, so the marker rattles wall to wall. Every optimizer in the picker is a patch for that pain (or the new pain the last patch created) — 170 years of *fix what just broke*: a single trunk of fixes that, once it reaches Adam, finally splits into the branches still being explored today. The picker is grouped to match.'
  },
  {
    kind: 'p',
    text: 'That ravine has a precise name: **ill-conditioning**. A smooth bowl curves at two rates — gently along its floor ($\\lambda_{\\min}$) and steeply across it ($\\lambda_{\\max}$) — and their ratio is the **condition number** $\\kappa = \\lambda_{\\max}/\\lambda_{\\min}$. A round bowl has $\\kappa = 1$ and one good step reaches the bottom; a long, thin ravine has a huge $\\kappa$, and that one number sets how slowly you converge. Even with the best fixed step, $\\gamma = 2/(\\lambda_{\\min}+\\lambda_{\\max})$, each move closes the gap to the minimum by only a factor $(\\kappa-1)/(\\kappa+1)$ — which creeps toward 1 as $\\kappa$ grows, so a stretched valley crawls no matter how you tune $\\gamma$. Momentum sharpens that to roughly $(\\sqrt{\\kappa}-1)/(\\sqrt{\\kappa}+1)$, a $\\sqrt{\\kappa}$ speed-up — the first hint of why the whole family below exists.'
  },
  {
    kind: 'figure',
    id: 'ravine-heat',
    caption: 'The ravine: a valley far steeper across than along. One safe step size makes plain GD (white) rattle wall to wall while it crawls along the floor; momentum (violet) builds speed down the valley and glides to the minimum.'
  },
  {
    kind: 'p',
    text: 'Every fix that follows is a leaf on one tree. Here is the whole lineage at a glance — 170 years from Cauchy’s root to today’s canopy, each branch running parent → child:'
  },
  {
    kind: 'figure',
    id: 'family-tree',
    caption: 'Every leaf is an optimizer in the picker; branches run parent → child, and the dashed violet strand marks where momentum and the adaptive line merge into Adam. Colours match the race below, and new methods join the canopy as the field grows.'
  },
  {
    kind: 'p',
    text: 'Here they are racing on the same ravine from the same start — every one running its real update rule, the dots arriving in their true step counts. Click a name to add or remove it; hover one to pick it out of the pack:'
  },
  { kind: 'widget', id: 'ravine-race' },
  { kind: 'optcards', chapter: 'ch-ravine' }
];

/** Chapter 13 · Momentum & Nesterov. */
export const chMomentum: Block[] = [{ kind: 'optcards', chapter: 'ch-momentum' }];

/** Chapter 14 · A learning rate per parameter. */
export const chAdaptive: Block[] = [{ kind: 'optcards', chapter: 'ch-adaptive' }];

/** Chapter 15 · Adam — and the fork. */
export const chAdam: Block[] = [{ kind: 'optcards', chapter: 'ch-adam' }];

/** Chapter 16 · Second order: Newton & Sophia. */
export const chSecondOrder: Block[] = [{ kind: 'optcards', chapter: 'ch-second-order' }];

/** Chapter 17 · The last knob — Prodigy, and the frontier past the playground. */
export const chSelfTuning: Block[] = [
  { kind: 'optcards', chapter: 'ch-self-tuning' },
  {
    kind: 'frontier',
    title: 'The frontier — and why it isn’t in the picker',
    text: 'The optimizers winning 2025’s biggest training runs — **Muon** (used to train Kimi K2 and GLM), **Shampoo**, and **SOAP** — share a trick this playground can’t show. They treat a layer’s weights as a *matrix* and precondition *across* it: Muon (*momentum orthogonalized by Newton–Schulz*) straightens the momentum matrix, Shampoo and SOAP whiten it. With only two independent numbers, $\\alpha$ and $\\beta$, there is no matrix to exploit — strip the structure away and they collapse to methods already in the list. That matrix structure is exactly why they scale to billions of parameters, and exactly why a two-parameter sandbox is the wrong stage for them. To meet them you have to leave the playground — which is a fair note to end the tree on.'
  }
];
