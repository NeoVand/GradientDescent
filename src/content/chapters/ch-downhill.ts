import type { Block } from '../blocks';

/** Chapter 5 · Which way is downhill? — the gradient, the field, and the proof. */
export const chDownhill: Block[] = [
  {
    kind: 'p',
    text: 'Standing on a hillside in fog, you can still feel which way is down — the ground tilts under your feet. That tilt is the **slope**. With two knobs there are two slopes at once: how the loss changes as you nudge $\\alpha$, and how it changes as you nudge $\\beta$. Bundle those two together and you get the **gradient**, written **$\\nabla\\mathcal{L}$** (say “grad L”).'
  },
  {
    kind: 'p',
    text: 'The gradient is an arrow, and it always points in the direction of *steepest increase* — straight uphill. So to go **down**, you walk the **opposite** way, along **$-\\nabla\\mathcal{L}$**. That negative gradient is the single most important arrow in this whole app.'
  },
  {
    kind: 'p',
    text: 'Why *steepest*? Picture standing on the slope and trying every direction you could step. Each heading has its own rate of climb, and the gradient is simply the one whose climb is fastest. Every other direction is a watered-down version of it: its steepness is the gradient’s shadow cast onto that heading — full strength straight along $\\nabla\\mathcal{L}$, and fading to *nothing* at a right angle to it. Those flat, right-angle directions are exactly the **contour lines** on the map: walk along a contour and the loss never changes, so the steepest way off it has to be square across it. *The gradient is always perpendicular to the contours* — which is why the field arrows below cut straight through the white loops rather than running along them.'
  },
  {
    kind: 'conceptOverlay',
    title: 'The field of downhill arrows',
    fig: 'downhill-field',
    paras: [
      'Every faint arrow on the loss map is **$-\\nabla\\mathcal{L}$** at that spot — the steepest way down — and they all stream toward the basin. They are longer where the surface is steeper.',
      'On the marker itself, the {blue:blue arrow} is this same $-\\nabla\\mathcal{L}$: the steepest descent from exactly where you stand. (Its red partner arrives in the next chapter.)'
    ]
  },
  {
    kind: 'hd',
    text: 'A quiet upgrade for later. With two knobs a contour is a loop — one thin line of “no change”. With $d$ knobs it is a whole $(d-1)$-dimensional sheet: at any point there is a single steepest way up, and a vast flat wall of sideways directions that change nothing at all. The gradient’s job gets lonelier as $d$ grows — one needle of change in a haystack of directions that don’t.'
  },
  {
    kind: 'p',
    text: 'Formally, the gradient is a column of **partial derivatives** — one slope per parameter. Each entry answers a single, narrow question: *if I wiggle only this knob and hold the other still, how fast does the loss change?* There is nothing mystical in measuring one: nudge $\\alpha$ by a hair, see how far the loss moved, and divide the change by the nudge. Do that once for $\\alpha$ and once for $\\beta$ and you have the two numbers the gradient is built from.'
  },
  {
    kind: 'aside',
    text: 'Two knobs make that easy — but a real model has millions or billions, and nudging each one in turn would be hopeless. They use **backpropagation** (reverse-mode automatic differentiation): one backward sweep of the chain rule that hands back the derivative for *every* parameter at once, at about the cost of a single forward pass (Rumelhart, Hinton & Williams, 1986; Baydin et al., 2018). The meaning is exactly the $\\nabla\\mathcal{L}$ here — it is just computed without ever nudging anything.'
  },
  { kind: 'display', formula: 'gradientDefinition' },
  {
    kind: 'p',
    text: 'Stack those two answers into a little arrow and you have $\\nabla\\mathcal{L}$. Its **direction** is the steepest way uphill; its **length** is how steep. That is why the field arrows stretch long on the steep walls and shrink to almost nothing at the basin floor — at the very bottom there is no downhill left, so the gradient, and the step it drives, fades to zero. The marker arriving and going still *is* the gradient vanishing.'
  },
  {
    kind: 'p',
    text: 'We keep calling $-\\nabla\\mathcal{L}$ the *steepest* way down. That is not loose talk — and it is worth seeing why, first in three dimensions, then in one short line of proof.'
  },
  {
    kind: 'figure',
    id: 'downhill-3d',
    caption: 'The same idea in three dimensions: on the wall of the bowl, $\\nabla\\mathcal{L}$ (amber) points straight up the steepest rise and −$\\nabla\\mathcal{L}$ (emerald) straight down toward the basin — both perpendicular to the green level ring they sit on. Drag to spin it.'
  },
  {
    kind: 'concept',
    title: 'An arrow is two numbers',
    fig: 'downhill-vector',
    text: 'Three tools before the proof. An arrow on the $(\\alpha, \\beta)$ plane *is* its two components stacked — how far along $\\alpha$, how far along $\\beta$; that is all the bracket notation means. Its **length**, written $\\lVert\\mathbf{v}\\rVert$, is Pythagoras on those legs: for $\\mathbf{v} = [3, 2]$, $\\lVert\\mathbf{v}\\rVert = \\sqrt{3^2 + 2^2} = \\sqrt{13}$. A **unit vector** has length exactly 1 — pure direction, no size. And the **dot product** multiplies matching components and adds: $\\mathbf{v}\\cdot\\mathbf{u} = v_1 u_1 + v_2 u_2$ — one number, and for a unit $\\mathbf{u}$ it is precisely the length of $\\mathbf{v}$’s *shadow* on $\\mathbf{u}$. That shadow is the whole proof below.'
  },
  {
    kind: 'proof',
    title: 'Why the negative gradient is exactly the steepest descent',
    blocks: [
      {
        kind: 'p',
        text: 'Take a unit step in some direction $\\mathbf{u}$. The loss changes at a rate equal to the gradient’s *shadow* on that direction — their dot product $\\nabla\\mathcal{L}\\cdot\\mathbf{u}$. Writing $\\varphi$ (“phi”) for the angle between $\\mathbf{u}$ and $\\nabla\\mathcal{L}$, that shadow has length $\\lVert\\nabla\\mathcal{L}\\rVert\\cos\\varphi$:'
      },
      { kind: 'display', formula: 'directional', center: true },
      {
        kind: 'figure',
        id: 'downhill-proof',
        caption: 'Left: the rate is $\\nabla\\mathcal{L}$’s shadow on **u**. Right: sweep **u** around and that shadow traces a cosine — biggest along $\\nabla\\mathcal{L}$, zero across a contour, most negative along $-\\nabla\\mathcal{L}$.'
      },
      {
        kind: 'p',
        text: 'Because $\\cos\\varphi$ only ever runs from +1 to −1, that rate is largest when $\\mathbf{u}$ lines up with $\\nabla\\mathcal{L}$ (the fastest *rise*), exactly zero at a right angle (walking a contour — the loss holds still), and most negative along $-\\nabla\\mathcal{L}$ (the fastest *fall*). No direction can beat it.'
      }
    ]
  },
  {
    kind: 'p',
    text: 'One honest caveat to carry forward: the gradient is only the truth *right where you stand.* Zoom in close enough and any smooth surface flattens into a tilted plane, and $\\nabla\\mathcal{L}$ is exactly that tilt — but step too far and the real ground curves away from the plane you trusted. That gap between the slope underfoot and the surface a stride away is the whole reason a step can be *too big*, and taming it is what the learning rate exists to do.'
  }
];
