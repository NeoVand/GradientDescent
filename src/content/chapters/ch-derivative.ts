import type { Block } from '../blocks';

/** Chapter 4 · How steep, exactly? — the derivative built from nudge-and-divide. */
export const chDerivative: Block[] = [
  {
    kind: 'p',
    text: 'Part I kept saying *slope* and trusted your legs to know what it meant. Before the walking starts in earnest, let’s put a number on it — because the number is the whole trick, and you can build it yourself with nothing but a subtraction and a division.'
  },
  {
    kind: 'p',
    text: 'Here is the move. Stand somewhere on a 1-D loss curve — say $\\alpha = 2$ on **Fit a Slope**, whose loss happens to be $\\mathcal{L}(\\alpha)=\\alpha^2$, so $\\mathcal{L}(2)=4$. **Nudge** the knob by some small amount *h*, and divide the loss’s response by the nudge. Nudge by *h* = 0.1 and the loss climbs from 4 to 4.41 — a rise of 0.41 over a run of 0.1: ratio **4.1**. Try *h* = 0.01: the ratio comes out 4.01. Try 0.001: **4.001**. The nudges are vanishing, but the ratio isn’t wandering — it is *settling*, and the number it settles on is 4.'
  },
  {
    kind: 'recipe',
    text: 'Nudge. Measure the response. Divide. Then let the nudge shrink — the number the ratio settles on is the **derivative**: the slope of the loss *at a point*.'
  },
  { kind: 'display', formula: 'derivativeLimit', center: true },
  {
    kind: 'p',
    text: 'Read it slowly, once: the fraction is exactly the nudge-and-divide you just did, and $\\lim_{h \\to 0}$ (“the limit as *h* goes to zero”) is the settling you just watched. Nothing else is hiding in there. The settling also tells you something about the ground itself: zoom in far enough on any smooth curve and it straightens into a line — the derivative is that line’s slope. Two chapters from now, that “zoom until straight” picture carries a real proof on its back; and its fine print — *the line only speaks for the ground right under you* — grows up to become the learning rate’s whole story.'
  },
  {
    kind: 'figure',
    id: 'derivative-secant',
    caption: 'The limit, drawn: each grey chord leans on the curve a nudge *h* away — slope $2\\alpha + h$ on this parabola — and as *h* shrinks, the chords tilt into the one blue line whose slope is exactly $2\\alpha$: the tangent. The derivative is where the chords were heading all along.'
  },
  {
    kind: 'p',
    text: 'Two knobs, same recipe, one new courtesy: with $\\alpha$ and $\\beta$ both live, nudge **one and freeze the other**. The ratio you get is a **partial derivative**, written with a curly $\\partial$ — say it “partial”, and yes, it is the symbol on this lab’s front door:'
  },
  { kind: 'display', formula: 'partialDef', center: true },
  {
    kind: 'p',
    text: '$\\partial \\mathcal{L}/\\partial \\alpha$ reads: *nudge $\\alpha$, hold $\\beta$ still, divide the response by the nudge.* Do it once per knob and you are holding two numbers. Stacking those two numbers into a single arrow is exactly where the next chapter begins.'
  },
  {
    kind: 'figure',
    id: 'derivative-slices-3d',
    caption: '“Hold the other knob still,” made literal: each translucent plane freezes one knob, and the surface passes through it as an *ordinary curve*. The blue cut’s slope at the marker is $\\partial\\mathcal{L}/\\partial\\alpha$, the amber cut’s is $\\partial\\mathcal{L}/\\partial\\beta$ — two ordinary derivatives, at right angles, on one surface. Drag to spin it.'
  },
  {
    kind: 'aside',
    text: '**How the app really does it:** you could compute every slope by literal nudging (the finite-difference recipe above — it’s how the curvature lens works). But nudging carries a whisper of error, so each problem here ships a hand-derived exact formula for its gradient instead — and the test suite trusts nothing: every formula is re-checked against nudge-and-divide at many random points. *Differentiate by hand, verify by nudge* — a professional habit worth stealing.'
  }
];
