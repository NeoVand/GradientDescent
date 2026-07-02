import type { Block } from '../blocks';

/** Chapter 8 · The bend of the bowl — curvature, the Hessian, κ, and the 2. */
export const chCurvature: Block[] = [
  {
    kind: 'p',
    text: 'The last chapter ended on a formula pulled out of a hat: stay under $2/\\lambda_{\\max}$. This chapter earns it. What we need is one more number at every point of the landscape — not how tilted the ground is, but how quickly the tilt itself changes as you walk. The slope of the slope: the **curvature**.'
  },
  {
    kind: 'p',
    text: 'Feel the difference first. A wine glass and a soup bowl can be equally steep where you stand — same slope — but descend a little and the glass *tightens* while the bowl *relaxes*. Curvature is the rate of that tightening, and you already own the tool that measures it: nudge $\\alpha$ and divide — only this time, watch how the *slope* answers, not the loss. The derivative of the derivative, written $\\partial^2 \\mathcal{L}/\\partial \\alpha^2$ and, for the rest of this chapter, called $\\lambda$: big $\\lambda$, sharp bend; small $\\lambda$, gentle one; zero, flat as a board.'
  },
  {
    kind: 'figure',
    id: 'curvature-bend',
    caption: 'Same slope underfoot — the dashed tangent is shared — but two different futures: the red curve tightens, the green one relaxes. The first derivative can’t tell them apart at the marker; the second one, $\\lambda$, is exactly what does.'
  },
  {
    kind: 'proof',
    title: 'Where the 2 comes from — in four lines',
    blocks: [
      {
        kind: 'p',
        text: 'Take the cleanest bowl there is: $\\mathcal{L} = \\tfrac{1}{2}\\lambda\\alpha^2$, curvature $\\lambda$ everywhere, minimum at zero. Its slope at $\\alpha$ is $\\lambda\\alpha$, so one step of gradient descent is'
      },
      { kind: 'display', formula: 'contraction', center: true },
      {
        kind: 'p',
        text: 'Every step *multiplies the distance to the bottom* by the same factor $(1-\\gamma\\lambda)$ — and that one multiplier is the whole story. While $\\gamma\\lambda < 1$ the factor sits between 0 and 1: a smooth glide in. At $\\gamma\\lambda = 1$ the factor is 0 — you land at the bottom in *one hop* ($\\gamma = 1/\\lambda$ is this bowl’s own perfect learning rate). Between 1 and 2 the factor is negative but small: overshoot to the far wall, yet closer each bounce. At exactly 2, you bounce between two mirror points forever. And past 2 every bounce lands *higher* than the last — divergence. There is the edge, and there is the 2.'
      }
    ]
  },
  {
    kind: 'figure',
    id: 'curvature-regimes',
    caption: 'The multiplier, run for real: amber dots are actual gradient-descent iterates on $\\mathcal{L} = \\tfrac{1}{2}\\lambda\\alpha^2$, starting from the ringed point. Glide, one-hop, shrinking bounce, growing bounce — four values of $\\gamma\\lambda$, one factor $(1-\\gamma\\lambda)$.'
  },
  {
    kind: 'p',
    text: 'Now open the second knob. At any point of a real landscape the surface bends by a *different amount in different directions* — along a valley’s floor, barely; across it, sharply. The honest bookkeeping is a small table of bendings called the **Hessian**:'
  },
  { kind: 'display', formula: 'hessianMatrix', center: true },
  {
    kind: 'p',
    text: 'Don’t let the box intimidate you. The two diagonal entries are exactly the $\\partial^2$ curvatures you just built, one per knob; the corner entry (the same number twice) records the *twist* — how nudging one knob changes the *other* knob’s slope. Four numbers, and together they pin down the little bowl that best fits the surface right where you stand. Zoom in on any smooth landscape and that fitted bowl *is* the landscape — the same way the fitted line was, one derivative ago.'
  },
  {
    kind: 'aside',
    text: '**Meet the whole family.** Stack one output’s slopes into a column and you have the **gradient**. Give the machine *many* outputs — a network predicting a hundred things at once — and each output brings its own row of slopes; the full table is the **Jacobian**, the gradient’s big sibling. And the Hessian you just met? Differentiate each entry of the gradient and stack the results: *the Hessian is exactly the Jacobian of the gradient.* One move — nudge, divide, tabulate — wearing three sizes.'
  },
  {
    kind: 'p',
    text: 'A stretched or twisted bowl still has a **gentlest** direction and a **sharpest** one — turn it in your hands until you face them. Their two bendings are called $\\lambda_{\\min}$ and $\\lambda_{\\max}$, and the last chapter’s speed limit can now be read honestly: the *sharpest* bend polices $\\gamma$ — that is $\\gamma < 2/\\lambda_{\\max}$ — while your progress along the *gentlest* direction is paid at the rate $(1 - \\gamma\\lambda_{\\min})$ per step. One $\\gamma$, two masters.'
  },
  {
    kind: 'p',
    text: 'How badly can the two masters disagree? Take their ratio:'
  },
  { kind: 'display', formula: 'kappa', center: true },
  {
    kind: 'p',
    text: 'the **condition number**. $\\kappa = 1$ is a perfectly round bowl: any safe $\\gamma$ lands you in a few hops. $\\kappa = 10$ means the sharp direction forces a $\\gamma$ so timid that the gentle direction keeps about 80% of its remaining distance *every step*. Ravines, trenches, the long crawl — they are all this one number wearing different landscapes, and Part IV’s entire optimizer family tree is organised around outwitting it.'
  },
  {
    kind: 'look',
    text: 'The app will show you the Hessian live. In the Loss & Gradient panel’s header, switch on the **curvature lens**: the ellipse drawn at the marker *is* the fitted bowl seen from above — long axis the gentle bend, short axis the sharp one — with $\\kappa$ read out beside it. On a saddle, the direction that curves *down* turns red and dashed: the escape route.'
  },
  {
    kind: 'hd',
    text: 'Up there the ravine doesn’t just stretch — it multiplies. A real network’s loss has millions of curvature directions, and measured spectra show a vast, nearly flat bulk hugging zero plus a handful of steep outliers: less a valley than a canyon system with a few sheer walls and endless soft floor. Condition numbers in the wild reach 10⁵ and beyond, so the crawl this chapter proved isn’t a corner case — it is the default condition of deep learning. That is why every method in Part IV ships in every deep-learning library.'
  }
];
