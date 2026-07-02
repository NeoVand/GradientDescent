import type { Block } from '../blocks';

/** Chapter 10 · Mini-batches & the S in SGD — noisy arrows, √n, the noise ball. */
export const chNoise: Block[] = [
  {
    kind: 'p',
    text: 'Every gradient so far has been the **true** one — measured on all your data at once. That is **full-batch** descent: the **Batch size** dial set to *All*. It gives the cleanest possible arrow, and it is the most expensive thing you can do, because every single step has to read every single data point.'
  },
  {
    kind: 'p',
    text: 'Real datasets are far too large for that, so instead you *estimate* the gradient from a small random **batch** — a handful of points, freshly resampled each step. The arrow you get back is **noisy**: it jitters around the true downhill, because a different handful would have pulled in a slightly different direction. But it is cheap, and — this is the quiet miracle that makes modern training possible — it still points the right way *on average*. Averaging your way downhill through that noise is the **S** (stochastic) in **SGD**, stochastic gradient descent. (Two words of vocabulary while we are here: one batch update is an **iteration** or step; one full sweep through the whole dataset is an **epoch**.)'
  },
  {
    kind: 'p',
    text: 'Slide the **Batch size** down from *All* toward *1* and a faint **fan** of arrows opens at the marker: each ray is the gradient a different random batch would have handed you, so the *width of the fan is the noise itself.* The fewer points in the batch, the wider it spreads — and it spreads in a very specific way — the same law that steadies dice: average four rolls and the result wobbles about half as much as a single roll. The error of an average shrinks only with the *square root* of how many samples go into it, so a batch of 4 is roughly twice as steady as a batch of 1, and you need 16 to halve the noise again. That is the law of diminishing returns behind every batch-size choice: a batch of 32 already looks almost as calm as the full dataset, for a fraction of the cost.'
  },
  {
    kind: 'hd',
    text: 'At scale this √n law becomes an economic one. The useful ratio is noise to signal: below a problem-specific *critical batch size*, doubling the batch lets you (roughly) double $\\gamma$ for the same trajectory — the linear-scaling rule behind giant training runs; above it, extra data per step buys calm the run no longer needs (Goyal et al., 2017; McCandlish et al., 2018). Bigger is not better — bigger is *quieter*, and quiet has a price and a ceiling.'
  },
  {
    kind: 'p',
    text: 'And the noise is not pure cost. A little jitter is genuinely **useful**: a noisy step can rattle the marker out of a shallow dip or a flat saddle that a perfectly smooth step would have settled into and never left, and the constant restlessness tends to steer a run toward *wide, gentle* basins — the forgiving kind that generalize to new data — rather than narrow, brittle cracks. This is why a touch of stochasticity is often kept on purpose, even when the full gradient is affordable.'
  },
  {
    kind: 'hd',
    text: 'The fan tells the truth in 2-D, but up there it would look strange: two random directions among a million axes are almost always nearly *perpendicular* — there are countless ways to be orthogonal and only one way to agree. So gradient noise mostly pushes *sideways*, at right angles to the true downhill, rather than backwards against it. A noisy run drifts and wanders far more than it backtracks — one reason SGD keeps making progress even when individual arrows look hopeless.'
  },
  {
    kind: 'p',
    text: 'The bill comes due at the *end*. Because the gradient never goes quiet, SGD never fully stops: near the bottom it stops descending and starts **orbiting**, buzzing around the minimum inside a small **noise ball** whose radius grows with both the step size $\\gamma$ and the width of the fan. On the loss curve it shows up as a fuzzy *band* rather than a clean line that flatlines — the run has arrived, but it can’t hold still. This is where the **schedule** from the last chapter earns its keep: a $\\gamma$ bled toward zero draws that ball in tight, turning the restless buzz into a soft landing. Under noise, decay isn’t a luxury — it is *how a stochastic run converges at all.*'
  },
  {
    kind: 'figure',
    id: 'noise-ball',
    caption: 'Under noisy gradients the run never quite stops — it orbits the minimum in a cloud whose radius grows with $\\gamma$ (left). Bleed $\\gamma$ toward zero and the cloud draws in to a point (right): the schedule, doing its quiet job.'
  },
  {
    kind: 'look',
    text: 'Watch it: set a small **Batch size** so the loss settles into a fuzzy band on **Const**, then switch the schedule to **Cosine** and see the band pinch shut over the final steps.'
  }
];
