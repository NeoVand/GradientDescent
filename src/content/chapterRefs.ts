// "Further reading" per concept chapter — Wikipedia for the idea, the
// landmark paper where there is one. (Optimizer cards carry their own
// citations via OPT_CITE.) Verified canonical URLs.
export type ChRef = { kind: 'wiki' | 'paper'; label: string; href: string };
export const chRefs: Record<string, ChRef[]> = {
  'ch-bowl': [
    { kind: 'wiki', label: 'Mathematical optimization', href: 'https://en.wikipedia.org/wiki/Mathematical_optimization' },
    { kind: 'wiki', label: 'Mean squared error', href: 'https://en.wikipedia.org/wiki/Mean_squared_error' },
    { kind: 'wiki', label: 'Cross-entropy', href: 'https://en.wikipedia.org/wiki/Cross-entropy' }
  ],
  'ch-shapes': [
    { kind: 'wiki', label: 'Maxima and minima', href: 'https://en.wikipedia.org/wiki/Maxima_and_minima' },
    { kind: 'wiki', label: 'Saddle point', href: 'https://en.wikipedia.org/wiki/Saddle_point' },
    { kind: 'paper', label: 'Saddle points in high dimensions — Dauphin et al., 2014', href: 'https://arxiv.org/abs/1406.2572' }
  ],
  'ch-landscape': [
    { kind: 'wiki', label: 'Level set', href: 'https://en.wikipedia.org/wiki/Level_set' },
    { kind: 'paper', label: 'Visualizing loss landscapes — Li et al., 2018', href: 'https://arxiv.org/abs/1712.09913' }
  ],
  'ch-downhill': [
    { kind: 'wiki', label: 'Gradient', href: 'https://en.wikipedia.org/wiki/Gradient' },
    { kind: 'wiki', label: 'Directional derivative', href: 'https://en.wikipedia.org/wiki/Directional_derivative' },
    { kind: 'wiki', label: 'Backpropagation', href: 'https://en.wikipedia.org/wiki/Backpropagation' },
    { kind: 'paper', label: 'Automatic differentiation: a survey — Baydin et al., 2018', href: 'https://arxiv.org/abs/1502.05767' }
  ],
  'ch-step': [
    { kind: 'wiki', label: 'Gradient descent', href: 'https://en.wikipedia.org/wiki/Gradient_descent' }
  ],
  'ch-gamma': [
    { kind: 'wiki', label: 'Learning rate', href: 'https://en.wikipedia.org/wiki/Learning_rate' },
    { kind: 'wiki', label: 'Condition number', href: 'https://en.wikipedia.org/wiki/Condition_number' },
    { kind: 'paper', label: 'Gradient clipping (exploding gradients) — Pascanu et al., 2013', href: 'https://arxiv.org/abs/1211.5063' }
  ],
  'ch-schedule': [
    { kind: 'wiki', label: 'Learning-rate schedule', href: 'https://en.wikipedia.org/wiki/Learning_rate#Learning_rate_schedule' },
    { kind: 'paper', label: 'Cosine annealing / SGDR — Loshchilov & Hutter, 2017', href: 'https://arxiv.org/abs/1608.03983' },
    { kind: 'paper', label: 'Warmup — Goyal et al., 2017', href: 'https://arxiv.org/abs/1706.02677' }
  ],
  'ch-noise': [
    { kind: 'wiki', label: 'Stochastic gradient descent', href: 'https://en.wikipedia.org/wiki/Stochastic_gradient_descent' },
    { kind: 'paper', label: 'Stochastic approximation — Robbins & Monro, 1951', href: 'https://doi.org/10.1214/aoms/1177729586' }
  ],
  'ch-optimizers': [
    { kind: 'wiki', label: 'Condition number', href: 'https://en.wikipedia.org/wiki/Condition_number' },
    { kind: 'paper', label: 'Why momentum really works — Goh, Distill 2017', href: 'https://distill.pub/2017/momentum/' },
    { kind: 'paper', label: 'An overview of gradient-descent optimizers — Ruder, 2016', href: 'https://arxiv.org/abs/1609.04747' }
  ],
  'ch-generalize': [
    { kind: 'wiki', label: 'Overfitting', href: 'https://en.wikipedia.org/wiki/Overfitting' },
    { kind: 'paper', label: 'Sharp minima & the generalization gap — Keskar et al., 2017', href: 'https://arxiv.org/abs/1609.04836' },
    { kind: 'paper', label: 'Early stopping (Deep Learning, §7.8) — Goodfellow et al., 2016', href: 'https://www.deeplearningbook.org/contents/regularization.html' }
  ]
};
