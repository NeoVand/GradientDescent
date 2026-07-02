import type { Block } from '../blocks';

/** Chapter 3 · When the bowl isn’t a bowl — minima, saddles, plateaus, basins. */
export const chShapes: Block[] = [
  {
    kind: 'p',
    text: 'So far the landscape has been one tidy bowl with a single lowest point. That is the exception, not the rule. A real loss surface can ripple with many dips, rise into ridges, and stretch into near-flat plains — and each of those features changes what gradient descent does.'
  },
  {
    kind: 'p',
    text: 'A dip lower than everything around it is a **local minimum**; the single lowest dip anywhere is the **global minimum** — the answer we actually want. Gradient descent only ever feels the slope *under its feet*, so it cannot tell the two apart: it rolls into whatever valley it is already in and stops. Each minimum owns a **basin of attraction** — the starting points that drain into it — and the ridge between two basins is the watershed. That is why *where you start* can matter as much as how you step: move the first guess across a ridge and the run ends somewhere else entirely, which is what makes **initialization** a real design choice.'
  },
  {
    kind: 'hd',
    text: 'Up there, “where you start” changes meaning. Set a million knobs to small random numbers and every start lands on a thin shell, almost exactly the same distance from the origin — and any two random starts are nearly perpendicular to each other. So real initialization science is not about picking the right basin; it is about picking the right *scale* (the Xavier and He rules), so the first gradients come out neither vanishing nor explosive.'
  },
  {
    kind: 'figure',
    id: 'shapes-basins-saddle',
    caption: 'Left: a 1-D loss with a shallow local minimum and a deep global one, split by a ridge — the amber start drains into the shallow basin, the emerald start (just across the ridge) into the deep one. Right: a 2-D saddle, downhill *into* the centre along one axis and *out* along the other — the gradient is zero there, yet it is no minimum.'
  },
  {
    kind: 'p',
    text: 'There is a subtler trap than a local minimum. A **saddle point** is a spot where the ground curves *down* one way and *up* another — a mountain pass. The gradient there is zero, exactly as at a minimum ($\\nabla\\mathcal{L} = \\mathbf{0}$), so a method that watches only the slope can grind almost to a halt even though one step sideways would keep it falling. Broad, gentle **plateaus**, where the gradient nearly vanishes, slow a run the same way — more quietly.'
  },
  {
    kind: 'p',
    text: 'In two dimensions, bad local minima look like the main hazard. In the millions of dimensions a real model lives in, the reverse holds: critical points are *overwhelmingly* saddles, and almost every true minimum sits close to the global one in value. The hard part of training a large network is escaping saddles and plateaus, not dodging bad valleys — a finding (Dauphin et al., 2014; Choromanska et al., 2015) that reshaped how the field thinks about non-convex optimization. A confession about this playground, then: with two knobs, dodging the wrong valley really *is* the game, and several landscapes in the zoo are built to punish a bad start. Keep the basin picture — just know that at scale the enemy is the long flat crawl, not the wrong valley.'
  },
  {
    kind: 'aside',
    text: '**“Convex”?** A surface is **convex** when it is one bowl everywhere: stretch a straight rope between any two points on it and the rope never dips below the surface. One basin, no traps — the world where optimization comes with clean guarantees, and the word you’ll meet on several optimizer cards. This chapter is about what happens when that promise breaks (*non-convex*) — which is where deep learning lives.'
  },
  {
    kind: 'hd',
    text: 'Here is *why* saddles take over up there. At a flat spot the surface curves independently along each of the *d* directions, and a minimum needs every single one to curve *up*. With two knobs that’s two coin flips; with a million it’s a million — so a random flat spot is all but certain to curve down somewhere, and “somewhere down” is exactly a saddle. The mountain pass isn’t the rare case at scale; it’s nearly the only case.'
  },
  {
    kind: 'p',
    text: 'This is the backdrop for Parts III and IV. Plain descent stalls on saddles, crawls across plateaus, and settles in the first basin it finds. The momentum, noise, and curvature tricks ahead are, in large part, ways to keep moving when the slope alone is no longer enough to go on.'
  }
];
