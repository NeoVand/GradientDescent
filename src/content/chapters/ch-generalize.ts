import type { Block } from '../blocks';

/** Chapter 11 · Training loss isn’t the goal — generalization, the whole point. */
export const chGeneralize: Block[] = [
  {
    kind: 'p',
    text: 'Every chapter so far has worked to drive the *training* loss down. But that number is only a stand-in for what we actually want. We don’t care about fitting the data we already have — we care about predicting data we **haven’t seen**. Doing well on new data is **generalization**, and it is the whole point.'
  },
  {
    kind: 'p',
    text: 'The loss we minimize is the average error over the training set — the **empirical risk** — but the real target is the average error over *all* future data, the **true risk**. With limited or noisy data the two come apart. Push the training loss too low and the model starts memorizing the quirks and noise of *this* sample: training loss keeps falling while error on held-out data turns and climbs. That divergence is **overfitting**.'
  },
  {
    kind: 'figure',
    id: 'generalize-curves',
    caption: 'Training loss (green) keeps falling; test loss (amber), measured on held-out data, bottoms out and then rises as the model begins fitting noise. The dip is where you’d want to stop.'
  },
  {
    kind: 'p',
    text: 'Two fixes follow directly. The first is to *measure* the gap: hold out part of the data as a **test** (or validation) set, and watch its loss alongside the training loss — that is the second curve in the **Loss History** panel. The second is **early stopping**: end training at the test-loss minimum rather than the training-loss minimum. It is the simplest regularizer there is, and — for a run started near zero — in the quadratic case it is provably close to an explicit weight penalty (Bishop, 1995; Goodfellow et al., 2016, §7.8).'
  },
  {
    kind: 'p',
    text: 'That penalty is **regularization**: instead of minimizing the loss alone, add a term that prefers smaller, simpler parameters,'
  },
  { kind: 'display', formula: 'regularizedLoss', center: true },
  {
    kind: 'p',
    text: 'where $\\lambda$ sets how hard to pull toward zero. (An unrelated $\\lambda$, by the way — not the curvature $\\lambda_{\\max}$ from the learning-rate chapter. The alphabet is small and the field is greedy.) For plain SGD the gradient of that penalty is exactly **weight decay** — $\\boldsymbol{\\theta} \\leftarrow (1-\\gamma\\lambda)\\,\\boldsymbol{\\theta} - \\gamma\\nabla\\mathcal{L}$ — shrinking every weight a touch each step (Krogh & Hertz, 1991). Keep this $\\lambda$ in mind: you will meet it again on **AdamW** in the family tree, which decouples the decay from the adaptive scaling so it behaves like a true penalty again.'
  },
  {
    kind: 'p',
    text: 'Geometry has the last word, and it loops back to the noise chapter. Not all minima generalize equally: a *wide, flat* basin is forgiving — small shifts in the data barely move the loss — while a *sharp* one is brittle. Flat minima tend to generalize better (Hochreiter & Schmidhuber, 1997), the restless noise of small-batch SGD tends to settle into them, and very large batches tend to find sharper minima with a measurable generalization gap (Keskar et al., 2017). So the real target was never the exact bottom of the training bowl — it is a low, *wide* region that also sits low on data you will never see. Optimization gets you down; generalization decides whether down was worth reaching.'
  },
  {
    kind: 'hd',
    text: 'Two honest asterisks on this tidy story. First, “flat” is slippery: a network can be rescaled — same function, same predictions — while its measured sharpness changes arbitrarily, so naive flatness can’t be the whole answer (Dinh et al., 2017). Second, at scale good minima aren’t isolated dips like the ones drawn here: they connect into long low-loss valleys you can walk between without climbing (Garipov et al., 2018). The intuition survives — restless SGD prefers forgiving regions — but hold it as a compass, not a theorem.'
  }
];
