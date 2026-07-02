/**
 * The optimizer story cards — 170 years of "fix what just broke" — plus each
 * method's citations and inventor portraits. Pure content: prose strings may
 * carry $math$ (rendered by the guide's mathText) and light <em>/<strong>
 * markup, but nothing here knows about Svelte or the DOM.
 */

// ---------- The optimizer story ----------
// 170 years of "fix what just broke", told as cards: a main trunk (Acts I–IV,
// GD → Adam) that forks into branches after Adam (sign steps, and — as later
// chapters land — second-order and self-tuning). Each card leads with the
// failure it exists to fix.
export type OptChapter = {
  year: string;
  name: string;
  by: string;
  idea: string;
  formula: string;
  fix?: string;
  brk?: string;
  prereq?: boolean;
  lead?: string; // story transition rendered just before the card
  act?: { no: string; title: string; intro?: string };
};

export const optTree: OptChapter[] = [
  {
    act: { no: 'Act I', title: 'Follow the slope', intro: 'The whole story starts with a single move — and then spends 170 years repairing it. It helps to read what follows as a conversation between methods: <em>here is the flaw, here is the fix, here is the new flaw the fix introduced.</em>' },
    year: '1847',
    name: 'Gradient Descent',
    by: 'Augustin-Louis Cauchy',
    idea:
      'Cauchy, grinding through astronomical calculations by hand, writes down the move everything else builds on: measure the slope, step the other way. A century and a half later it is still the backbone of all of machine learning — and the baseline every later trick is trying to beat.',
    formula: String.raw`\boldsymbol{\theta} \;\leftarrow\; \boldsymbol{\theta} - \gamma\, \nabla \mathcal{L}`,
    fix: 'every step is locally downhill',
    brk: 'one $\\gamma$ for every parameter, so it zig-zags across ravines (the grey racer above)'
  },
  {
    act: { no: 'Act II', title: 'Add memory', intro: 'Plain descent is forgetful: every step is decided by the slope underfoot and nothing else. The next two fixes both come from giving the marker a <strong>memory</strong> of the steps before — starting with the small averaging tool they are both built from.' },
    prereq: true,
    year: 'tool',
    name: 'The moving average',
    by: 'the one tool Acts II and III are built from',
    idea:
      'Before the next two fixes, one small tool. An exponential moving average is a leaky memory: keep a fraction $\\beta$ of what you already believed, and mix in a fraction $1-\\beta$ of what you just saw. It smooths a jittery signal into a steady one. Roughly, it remembers the last $1/(1-\\beta)$ values — $\\beta = 0.9$ is about the last ten. Momentum averages gradients with it; RMSProp and Adam average squared gradients.',
    formula: String.raw`v \;\leftarrow\; \beta\, v + (1-\beta)\, x`
  },
  {
    year: '1964',
    name: 'Momentum',
    lead: 'Armed with that one little tool, the first cure almost designs itself. If a single gradient is a gust of wind, a moving average of them is the <em>prevailing</em> wind — exactly what a marker rattling across a ravine is missing: a memory of which way is consistently downhill.',
    by: 'Boris Polyak — the "heavy ball"',
    idea:
      'The failure to fix: plain descent bounces wall to wall in a ravine. The cure: give the marker mass. Keep a velocity — a moving average of past gradients — and let each new gradient nudge it. The side-to-side wobble averages out while the steady downhill push compounds into a tailwind, so it glides along the valley floor instead of rattling across it.',
    formula: String.raw`\mathbf{v} \leftarrow \mu \mathbf{v} + \nabla \mathcal{L}, \qquad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \mathbf{v}`,
    fix: 'damps the zig-zag, powers through plateaus',
    brk: 'all that inertia overshoots — it orbits the minimum before settling'
  },
  {
    year: '1983',
    name: 'Nesterov',
    lead: 'But a heavy ball has a temper. The very inertia that carries it along the valley floor also carries it clean past the bottom, so it has to double back and climb — momentum’s gift and its flaw are the same thing. The next fix is almost philosophical: <em>look before you leap.</em>',
    by: 'Yurii Nesterov — accelerated gradient',
    idea:
      'The failure to fix: momentum overshoots because it looks where it stands. The cure: look ahead. Measure the gradient where the velocity is about to carry you, not where you are — like braking into a corner instead of after it. The same heavy ball, now with foresight; it settles without the orbit. On a smooth convex bowl this look-ahead provably converges as fast as any method using only gradients ever can — you cannot do better with the slope alone.',
    formula: String.raw`\mathbf{v} \leftarrow \mu \mathbf{v} + \nabla \mathcal{L}(\boldsymbol{\theta}), \qquad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\,(\nabla \mathcal{L} + \mu \mathbf{v})`,
    fix: 'corrects the overshoot before it happens'
  },
  {
    act: { no: 'Act III', title: 'A learning rate per parameter', intro: 'Momentum fought the ravine by smoothing across <em>time</em>. Here is a different attack on the same wall: leave time alone and give every <em>parameter</em> its own step size, so the cramped direction and the roomy one stop having to share a single learning rate.' },
    year: '2011',
    name: 'AdaGrad',
    by: 'Duchi, Hazan & Singer',
    idea:
      'A different failure: one shared $\\gamma$ is wrong when the two parameters need very different step sizes. The cure: give each its own. Divide a parameter’s step by the running size of its own past gradients — so a parameter that rarely moves takes bold steps while a busy one calms down. The running size is a sum of past squared gradients $s$, and the step becomes $\\gamma\\,\\nabla\\mathcal{L}/(\\sqrt{s}+\\varepsilon)$. This made it the workhorse of sparse problems like word embeddings.',
    formula: String.raw`s \leftarrow s + (\nabla \mathcal{L})^2, \qquad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \frac{\nabla \mathcal{L}}{\sqrt{s} + \varepsilon}`,
    fix: 'every parameter gets its own learning rate',
    brk: 'that history only grows, so the step shrinks toward zero — it strangles itself'
  },
  {
    year: '2012',
    name: 'RMSProp',
    lead: 'AdaGrad’s generosity was also its undoing. Because it never forgets a single past gradient, its memory only ever grows — and a step divided by a forever-growing number can only shrink, until the marker freezes mid-journey. What if it could <em>forget?</em>',
    by: 'Geoffrey Hinton — never formally published; the world cites a Coursera slide',
    idea:
      'The failure to fix: AdaGrad’s ever-growing memory chokes long runs. The cure: let it forget. Swap the growing sum for a moving average of squared gradients (the tool from Act II). Old gradients fade, so the per-parameter step size stays alive even on long, winding, non-convex problems.',
    formula: String.raw`s \leftarrow \rho\, s + (1-\rho)(\nabla \mathcal{L})^2, \qquad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \frac{\nabla \mathcal{L}}{\sqrt{s} + \varepsilon}`,
    fix: 'forgetting keeps the step size alive'
  },
  {
    year: '2012',
    name: 'AdaDelta',
    lead: 'Forgetting kept the steps alive, and for most people that closed the case. But Matthew Zeiler, squinting at the very same update that very same year, caught something nobody else had: the equation was, quite literally, <em>dimensionally wrong.</em>',
    by: 'Matthew Zeiler — same year, same fix, one step further',
    idea:
      'RMSProp’s twin, born the same year against the same AdaGrad flaw — but Zeiler spotted a deeper oddity: a raw gradient step has the wrong units. AdaDelta divides by $\\mathrm{RMS}[\\nabla\\mathcal{L}]$ like RMSProp, then multiplies by the RMS of its OWN recent steps. That second memory hands the step $\\theta$’s own units — the very thing a raw gradient step lacks, and exactly what Newton’s $\\mathbf H^{-1}\\nabla\\mathcal{L}$ buys with curvature — so no unit-carrying $\\gamma$ is needed and the learning rate falls out of the math entirely: there is nothing left to set but the decay $\\rho$.',
    formula: String.raw`\Delta\boldsymbol{\theta} = -\frac{\sqrt{\mathbf{u}+\varepsilon}}{\sqrt{\mathbf{s}+\varepsilon}}\,\nabla \mathcal{L}, \qquad \mathbf{u} \leftarrow \rho\,\mathbf{u} + (1-\rho)\,\Delta\boldsymbol{\theta}^2`,
    fix: 'no learning rate to tune — it sizes its own steps',
    brk: 'one knob fewer, but no $\\gamma$ to crank when you DO want it faster'
  },
  {
    act: { no: 'Act IV', title: 'Put the two together', intro: 'Two good ideas are now on the table — momentum’s smoothing of the gradient, and a per-parameter step size. They mend different halves of the ravine and they do not get in each other’s way, so the obvious move is to use <strong>both at once</strong>. That move became the most widely used optimizer in deep learning.' },
    year: '2014',
    name: 'Adam',
    by: 'Kingma & Ba — "adaptive moments"',
    idea:
      'The merger the whole trunk builds to: take Momentum’s moving average of gradients (decay $\\beta_1$) AND RMSProp’s moving average of squared gradients (decay $\\beta_2$), and use them together. One honest detail: both averages start at zero and read too low at first, so each is divided by $1-\\beta^t$ to correct that early bias — giving the bias-corrected $\\hat{\\mathbf m}$ and $\\hat s$ that the update below pits against each other. The result became the workhorse of modern deep learning — its paper is now one of the most-cited in all of science — and the launch point for every branch that follows.',
    formula: String.raw`\hat{\mathbf{m}} = \frac{\mathbf{m}}{1-\beta_1^t}, \quad \hat{s} = \frac{s}{1-\beta_2^t}, \qquad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \frac{\hat{\mathbf{m}}}{\sqrt{\hat{s}} + \varepsilon}`,
    fix: 'robust out of the box almost everywhere',
    brk: 'not perfect — three later papers each sand down one rough edge'
  },
  {
    year: '2016',
    name: 'Nadam',
    lead: 'Adam looked like the end of the road — robust, popular, everywhere at once. It wasn’t. Within a couple of years three different people each tugged on a single loose thread, and one careful refinement at a time, sanded it smoother. The first of them had been paying very close attention back in Act II.',
    by: 'Timothy Dozat — Nesterov-accelerated Adam',
    idea:
      'The first refinement. Remember Act II, where Nesterov beat plain momentum by measuring the gradient a step ahead? Nadam plays that exact trick inside Adam: swap the bias-corrected momentum $\\hat{\\mathbf m}$ for a blend that leans toward where the momentum is heading, then divide by the same adaptive $\\sqrt{\\hat s}$. A small change bought for a little less overshoot and a slightly quicker settle.',
    formula: String.raw`\bar{\mathbf{m}} = \beta_1 \hat{\mathbf{m}} + \frac{(1{-}\beta_1)\nabla \mathcal{L}}{1-\beta_1^t}, \qquad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\,\frac{\bar{\mathbf{m}}}{\sqrt{\hat{\mathbf{s}}}+\varepsilon}`,
    fix: 'Nesterov foresight on Adam’s momentum'
  },
  {
    year: '2017',
    name: 'AdamW',
    lead: 'The second thread was the one that mattered most in practice — and it had been hiding in plain sight inside nearly every training run on Earth. The culprit was a line everyone trusted without a second glance: <em>weight decay.</em>',
    by: 'Loshchilov & Hutter — the actual default today',
    idea:
      'The refinement that matters most: nearly every large model — GPT, BERT, the lot — trains with AdamW, not plain Adam. Weight decay gently pulls every parameter toward zero to curb overfitting; Adam folded that pull into the gradient, where its adaptive $\\sqrt{\\hat s}$ scaling then distorted it. AdamW decouples them — the $\\lambda\\boldsymbol\\theta$ decay lands straight on $\\boldsymbol\\theta$, outside the scaling. One honest caveat here: these toy losses carry no overfitting to regularize, so $\\lambda$ shows up as a literal, visible pull of the marker toward the origin. Crank it and watch the fit drift inward; set $\\lambda$ to 0 and you are back to exact Adam.',
    formula: String.raw`\boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\left(\frac{\hat{\mathbf{m}}}{\sqrt{\hat{\mathbf{s}}} + \varepsilon} + \lambda\,\boldsymbol{\theta}\right)`,
    fix: 'decoupled decay — why it’s the real-world default',
    brk: 'with no overfitting to fight here, $\\lambda$ is a pull toward 0 more than a regularizer'
  },
  {
    year: '2019',
    name: 'RAdam',
    lead: 'The third thread was the quietest of all. For years practitioners had patched a rough spot in Adam’s opening steps with a hand-tuned <em>warmup</em>, half-superstition — runs just blew up without it, and nobody could say exactly why. What if that warmup could be <em>derived</em> instead of guessed?',
    by: 'Liu et al. — Adam’s warmup, automated',
    idea:
      'The third refinement closes a quieter Adam wart. In the first handful of steps Adam has barely any squared-gradient history, so its $\\sqrt{\\hat s}$ scaling is pure noise — the practitioner’s fix was a hand-tuned warmup that crept the rate up by hand. RAdam computes how trustworthy that variance actually is (a number $\\rho_t$) and, until it can be trusted, just skips the scaling and takes a plain momentum step. A rectification factor then eases the adaptive part in. Warmup, but derived rather than guessed — nothing to tune.',
    formula: String.raw`\rho_t = \rho_\infty - \frac{2t\,\beta_2^{t}}{1-\beta_2^{t}}, \qquad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, r_t\,\frac{\hat{\mathbf{m}}}{\sqrt{\hat{\mathbf{s}}}+\varepsilon}\;\;(\rho_t > 4)`,
    fix: 'an automatic warmup — no schedule to hand-tune',
    brk: 'only smooths the opening steps; past warmup it just is Adam'
  },
  {
    act: { no: 'Branch', title: 'Sign steps', intro: 'The first fork throws away the piece everyone had been copying — the adaptive square-root rescaling — and asks what is left when a step is nothing but a direction and a single fixed size.' },
    year: '2023',
    name: 'Lion',
    by: 'Chen et al. (Google) — found by program search, not designed',
    idea:
      'Adam scaled the step by gradient history. Lion throws that out and takes a different shape — and it wasn’t invented by a person: a program searched the space of optimizers and this fell out. The name is a fitting backronym — EvoLved Sign Momentum. Keep one momentum buffer, blend it with the fresh gradient, and step by the $\\operatorname{sign}$ of the result — so every step is the same size $\\gamma$ on each axis, no matter how steep or flat. That makes it light (one buffer, no squared-gradient term) and competitive with Adam on big vision and language models. The catch is the very thing that makes it clean: a step that never shrinks can’t settle by itself.',
    formula: String.raw`\mathbf{c} \leftarrow \beta_1 \mathbf{m} + (1{-}\beta_1)\nabla\mathcal{L}, \;\; \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \operatorname{sign}(\mathbf{c}), \;\; \mathbf{m} \leftarrow \beta_2 \mathbf{m} + (1{-}\beta_2)\nabla\mathcal{L}`,
    fix: 'fixed-size steps from one tiny buffer — light and fast',
    brk: 'the step never shrinks, so it orbits the minimum until $\\gamma$ is decayed by a schedule'
  },
  {
    act: { no: 'Branch', title: 'Use curvature', intro: 'A second fork goes the opposite way: instead of dropping information, it adds some. Every method so far reads only the <em>slope</em>; this branch also reads how the slope is <strong>bending</strong>.' },
    year: '1680s',
    name: 'Newton',
    by: 'Isaac Newton — the original, three centuries early',
    idea:
      'The branch that reaches back furthest — and the method every optimizer above is a cheap stand-in for. They all read only the slope $\\nabla\\mathcal{L}$. Newton also reads the CURVATURE: fit a quadratic bowl to the surface right here (the Hessian $\\mathbf H$) and jump straight to that bowl’s bottom, $-\\mathbf H^{-1}\\nabla\\mathcal{L}$. On a real bowl that nails the minimum in ONE step, with no learning rate to tune. This app already draws that jump — it is the violet Newton ghost in the curvature lens. So why isn’t it everywhere? $\\mathbf H$ is $N\\times N$ for $N$ parameters: trivial for our 2, ruinous for a billion. And away from a convex bowl $-\\mathbf H^{-1}\\nabla\\mathcal{L}$ can aim uphill, so this app runs the damped form real implementations use: near saddles and flats the curvature is propped up and the jump reined in toward a plain gradient step. (The $\\gamma$ in the formula is a safety throttle — pure Newton is $\\gamma = 1$, which is what this app keeps.)',
    formula: String.raw`\boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \mathbf{H}^{-1}\nabla \mathcal{L}`,
    fix: 'curvature-aware: one step to the bottom of any true bowl',
    brk: 'the $N\\times N$ Hessian is hopeless at scale — and it stumbles on saddles'
  },
  {
    year: '2023',
    name: 'Sophia',
    lead: 'Newton’s method is the king nobody can afford — exact, and ruinously expensive, all because of that one beautiful matrix. So the question for the age of billion-parameter models is blunt: can you keep the <em>idea</em> and throw away the bill?',
    by: 'Liu et al. — Newton, cut down to fit an LLM',
    idea:
      'Newton’s curvature is unbeatable and unaffordable; Sophia keeps the affordable part. Drop the full Hessian for just its DIAGONAL — one curvature number $\\mathbf h$ per parameter, no matrix to invert — and precondition the momentum by it. Then the safety move: CLIP every coordinate’s step to $\\pm\\rho$. Where the diagonal estimate is tiny or noisy (and $\\mathbf m/\\mathbf h$ would blow up) the clip bounds the move; where it’s solid, the step stays curvature-scaled. Its paper reports GPT-2-scale pretraining in roughly half the steps Adam needs — a headline later independent benchmarks have contested — but either way, it is second-order thinking made cheap enough to try.',
    formula: String.raw`\boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\,\operatorname{clip}\!\left(\frac{\mathbf{m}}{\max(\mathbf{h},\varepsilon)},\,\rho\right)`,
    fix: 'diagonal curvature + a clip — second-order on a budget',
    brk: 'only the diagonal: blind to the off-axis stretch Newton corrects'
  },
  {
    act: { no: 'Branch', title: 'Tune itself', intro: 'The last fork aims at the one knob nothing has managed to remove. Even the adaptive methods still made you choose γ; this branch tries to read it straight off the problem.' },
    year: '2024',
    name: 'Prodigy',
    by: 'Mishchenko & Defazio — the learning rate, removed',
    idea:
      'Every method so far still made you pick $\\gamma$. This branch deletes that last knob. The insight: the ideal step size is set by how far the start is from the solution — a distance $d$. You don’t know $d$, so Prodigy estimates it live, ramping a tiny seed upward from how the gradients line up with how far you’ve already travelled ($\\langle g,\\, x_0 - x\\rangle$), and scales an Adam step by it. Set nothing and watch the marker creep, then accelerate as $d$ finds its level — the learning rate, discovered rather than tuned. Prodigy sharpens the same lab’s earlier D-Adaptation, and the parameter-free idea is taken seriously: a sibling schedule-free method from these authors won the self-tuning track of MLCommons’ 2024 AlgoPerf benchmark.',
    formula: String.raw`d_{t+1} = \max\!\left(d_t,\, \frac{r_{t+1}}{\lVert \mathbf{s}_{t+1}\rVert_1}\right), \;\; \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, d_t\,\frac{\mathbf{m}}{\sqrt{\mathbf{v}} + d_t\varepsilon}`,
    fix: 'no learning rate to choose — it finds its own',
    brk: 'the estimate only climbs, so a bad early ramp can overshoot'
  }
];

// Citations + inventor portraits, keyed by optimizer name so the optTree
// cards stay readable. Portraits are placeholders (initials) until real
// images are dropped into /public/inventors/ at the paths below.
export type Author = { name: string; img?: string; credit?: string };
export type Cite = { wiki?: string; paper?: string; cite?: string; person?: string; img?: string; credit?: string; people?: Author[] };
export const OPT_CITE: Record<string, Cite> = {
  'Gradient Descent': {
    wiki: 'https://en.wikipedia.org/wiki/Gradient_descent',
    person: 'Augustin-Louis Cauchy',
    img: '/inventors/cauchy.jpg'
  },
  'The moving average': {
    wiki: 'https://en.wikipedia.org/wiki/Exponential_smoothing'
  },
  Momentum: {
    wiki: 'https://en.wikipedia.org/wiki/Stochastic_gradient_descent#Momentum',
    paper: 'https://doi.org/10.1016/0041-5553(64)90137-5',
    cite: 'Polyak, 1964',
    person: 'Boris Polyak',
    img: '/inventors/polyak.jpg'
  },
  Nesterov: {
    wiki: 'https://en.wikipedia.org/wiki/Stochastic_gradient_descent#Momentum',
    person: 'Yurii Nesterov',
    img: '/inventors/nesterov.jpg',
    credit: 'Photo: Renate Schmid / Oberwolfach (MFO), CC BY-SA 2.0 DE'
  },
  AdaGrad: {
    wiki: 'https://en.wikipedia.org/wiki/Stochastic_gradient_descent#AdaGrad',
    paper: 'https://jmlr.org/papers/v12/duchi11a.html',
    cite: 'Duchi et al., 2011',
    people: [
      { name: 'John Duchi', img: '/inventors/duchi.jpg' },
      { name: 'Elad Hazan', img: '/inventors/hazan.jpg' },
      { name: 'Yoram Singer', img: '/inventors/singer.jpg' }
    ]
  },
  RMSProp: {
    wiki: 'https://en.wikipedia.org/wiki/Stochastic_gradient_descent#RMSProp',
    paper: 'https://www.cs.toronto.edu/~tijmen/csc321/slides/lecture_slides_lec6.pdf',
    cite: 'Hinton, 2012',
    person: 'Geoffrey Hinton',
    img: '/inventors/hinton.jpg',
    credit: 'Photo: Arthur Petron, CC BY-SA 4.0'
  },
  AdaDelta: {
    paper: 'https://arxiv.org/abs/1212.5701',
    cite: 'arXiv:1212.5701',
    person: 'Matthew Zeiler',
    img: '/inventors/zeiler.jpg'
  },
  Adam: {
    wiki: 'https://en.wikipedia.org/wiki/Stochastic_gradient_descent#Adam',
    paper: 'https://arxiv.org/abs/1412.6980',
    cite: 'arXiv:1412.6980',
    people: [
      { name: 'Diederik Kingma', img: '/inventors/kingma.jpg' },
      { name: 'Jimmy Ba', img: '/inventors/ba.jpg' }
    ]
  },
  Nadam: {
    paper: 'https://www.semanticscholar.org/paper/d44efdc542f2cc5e196f04bc76bc783bfd7084af',
    cite: 'Dozat, 2016',
    person: 'Timothy Dozat',
    img: '/inventors/dozat.jpg'
  },
  AdamW: {
    paper: 'https://arxiv.org/abs/1711.05101',
    cite: 'arXiv:1711.05101',
    people: [
      { name: 'Ilya Loshchilov', img: '/inventors/loshchilov.jpg' },
      { name: 'Frank Hutter', img: '/inventors/hutter.jpg' }
    ]
  },
  RAdam: {
    paper: 'https://arxiv.org/abs/1908.03265',
    cite: 'arXiv:1908.03265',
    people: [
      { name: 'Liyuan Liu', img: '/inventors/liu-radam.jpg' },
      { name: 'Haoming Jiang', img: '/inventors/jiang-radam.jpg' },
      { name: 'Pengcheng He', img: '/inventors/he-radam.jpg' }
    ]
  },
  Lion: {
    paper: 'https://arxiv.org/abs/2302.06675',
    cite: 'arXiv:2302.06675',
    person: 'Xiangning Chen',
    img: '/inventors/chen-lion.jpg'
  },
  Newton: {
    wiki: 'https://en.wikipedia.org/wiki/Newton%27s_method_in_optimization',
    person: 'Isaac Newton',
    img: '/inventors/newton.jpg'
  },
  Sophia: {
    paper: 'https://arxiv.org/abs/2305.14342',
    cite: 'arXiv:2305.14342',
    person: 'Hong Liu',
    img: '/inventors/liu-sophia.jpg'
  },
  Prodigy: {
    paper: 'https://arxiv.org/abs/2306.06101',
    cite: 'arXiv:2306.06101',
    people: [
      { name: 'Konstantin Mishchenko', img: '/inventors/mishchenko.jpg' },
      { name: 'Aaron Defazio', img: '/inventors/defazio.jpg' }
    ]
  }
};
