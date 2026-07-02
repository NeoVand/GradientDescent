import type { Block } from '../blocks';

/** Chapter 7 · The learning rate γ — the Goldilocks dial and its exact edge. */
export const chGamma: Block[] = [
  {
    kind: 'p',
    text: 'There is one number you’ll reach for more than any other: {g:$\\gamma$} (gamma), the **learning rate** — how big each step is. It’s a Goldilocks dial.'
  },
  {
    kind: 'list',
    items: [
      '**Too small:** the marker creeps; it never reaches the bottom before the steps run out.',
      '**Too big:** it overshoots the valley floor and bounces up the far wall — loss leaps around, or rockets off to infinity. (The app catches this, stops, and explains what happened.)',
      '**Just right:** a smooth glide into the basin. Every problem ships with a sane default — but the fastest way to *feel* $\\gamma$ is to break it on purpose.'
    ]
  },
  {
    kind: 'p',
    text: 'And “too big” is not vague — it has an exact edge. For a smooth bowl, gradient descent settles only while $\\gamma$ stays below **two divided by the sharpest bend of the surface**, a number written $\\lambda_{\\max}$. Careful with the word: this is *not* the steepness you’ve been reading off the arrows (how tilted the ground is) but a genuinely new quantity — how fast the tilt *itself* changes as you walk. That is the **curvature**.'
  },
  { kind: 'display', formula: 'stability' },
  {
    kind: 'p',
    text: 'Stay under that line and each step lands closer to the bottom than the last, so the run converges. Cross it and the opposite compounds: every step overshoots a little more than the one before, and the loss runs off to infinity. Where does the 2 come from, and what exactly is bending? The *next chapter* builds curvature with your own hands — the same nudge-and-divide trick, aimed at the slope this time — and derives this edge in four honest lines.'
  },
  {
    kind: 'hd',
    text: 'For the clean bowls here, $\\gamma > 2/\\lambda_{\\max}$ means certain divergence — a theorem you can verify with a slider. The modern surprise: full-batch training of real networks was found to hover *right at* that edge — the curvature itself rises until $2/\\lambda_{\\max}$ meets whatever $\\gamma$ you chose, and the loss then falls raggedly along the knife’s edge (Cohen et al., 2021, “edge of stability”). The law you can check on this bowl becomes, at scale, a strange equilibrium the theory is still catching up to.'
  },
  {
    kind: 'aside',
    text: 'Sometimes the blow-up comes not from $\\gamma$ but from a freak gradient — a cliff in the surface, or the deep, recurrent networks where gradients can **explode**. The standard guard is **gradient clipping**: if the gradient’s length exceeds a threshold $c$, rescale it back to that length before stepping, $\\nabla\\mathcal{L} \\leftarrow c\\,\\nabla\\mathcal{L}/\\lVert\\nabla\\mathcal{L}\\rVert$, keeping its direction but capping its size (Pascanu et al., 2013). The opposite failure — gradients that **vanish** on a flat plateau — just stalls a run, the quiet trap from the landscape chapter.'
  },
  {
    kind: 'figure',
    id: 'gamma-regimes',
    caption: 'Gradient descent from the same start (orange) at three step sizes, on one bowl. Below the stability limit it settles — sluggishly, or briskly; cross the limit and every step overshoots a little more than the last.'
  }
];
