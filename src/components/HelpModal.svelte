<script lang="ts">
  /**
   * The Guide — a little book you can read.
   *
   * A two-pane reading view: a sticky chapter rail (table of contents with
   * scroll-spy + a reading-progress bar) beside a calm, measured reading
   * column. The book climbs a gentle ladder — Part I the landscape, Part II
   * walking downhill (the gradient, one step, the learning rate and its
   * schedule), Part III descent in the real world (noisy mini-batches, then
   * the optimizer family tree with its real simulated race), Part IV the zoo
   * of problems, then a short reference. Each chapter can launch a matching
   * preset in the live app; every term is defined where it is first used.
   */

  import {
    X,
    Activity, Mountain, TrendingUp, TrendingDown, Percent, Waves,
    Target, Radio, ScatterChart, Brain,
    Compass, Rocket, Zap,
    BookOpen, FlaskConical, Layers, Map, Play, Pause, RotateCcw, Keyboard,
    FileText
  } from 'lucide-svelte';
  import katex from 'katex';
  import 'katex/dist/katex.min.css';
  import { rgb, geoPath } from 'd3';
  import { contours } from 'd3-contour';
  import { interpolateViridis } from 'd3-scale-chromatic';
  import { experiments, chapterPresets } from '../utils/experiments';
  import { schedules, scheduleOrder } from '../utils/schedules';
  import { optimizers, optimizerOrder, defaultHyper, type OptimizerId } from '../utils/optimizers';

  export let isOpen = false;
  export let onClose: () => void;

  // Tiny γ-vs-step previews for the scheduling chapter, sampled from the SAME
  // schedule factors the trainer uses, so the curves are honest.
  const SCH_W = 132, SCH_H = 60, SCH_PAD = 6;
  const scheduleCurves = scheduleOrder.map((id) => {
    const f = schedules[id].factor;
    const N = 72, T = 100;
    const pts: string[] = [];
    for (let k = 0; k <= N; k++) {
      const v = Math.max(0, Math.min(1, f((k / N) * T, T)));
      const x = SCH_PAD + (k / N) * (SCH_W - 2 * SCH_PAD);
      const y = SCH_PAD + (1 - v) * (SCH_H - 2 * SCH_PAD);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return { id, name: schedules[id].name, desc: schedules[id].description, d: 'M ' + pts.join(' L ') };
  });

  function runExperiment(exp: (typeof experiments)[number]) {
    onClose();
    exp.apply();
  }

  // A chapter's matching preset: close the book and set the live app to what
  // the chapter just explained. Rendered as a small CTA at the chapter's end.
  function runPreset(id: string) {
    const p = chapterPresets[id];
    if (!p) return;
    onClose();
    p.apply();
  }

  // Formulas render straight to HTML — no element refs, no afterUpdate.
  const tex = (src: string) => katex.renderToString(src, { throwOnError: false, displayMode: false });
  const texD = (src: string) => katex.renderToString(src, { throwOnError: false, displayMode: true });

  // Prose with inline math: render every $...$ segment with KaTeX so symbols in
  // the running text (β, ∇ℒ, √ŝ …) match the displayed equations, and leave the
  // rest as escaped text. Used for the optimizer cards' idea / fix / break lines.
  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const mathText = (src: string) =>
    src.split(/\$([^$]+)\$/).map((seg, i) => (i % 2 === 1 ? tex(seg) : escHtml(seg))).join('');

  // ---------- The table of contents (drives the rail + scroll-spy) ----------
  type TocEntry = { part?: string; id?: string; n?: string; title?: string };
  const toc: TocEntry[] = [
    { part: 'Part I · The landscape' },
    { id: 'ch-bowl', n: '1', title: 'The bottom of a bowl' },
    { id: 'ch-landscape', n: '2', title: 'Loss is a landscape' },
    { part: 'Part II · Walking downhill' },
    { id: 'ch-downhill', n: '3', title: 'Which way is downhill?' },
    { id: 'ch-step', n: '4', title: 'One step of descent' },
    { id: 'ch-gamma', n: '5', title: 'The learning rate γ' },
    { id: 'ch-schedule', n: '6', title: 'Scheduling the learning rate' },
    { part: 'Part III · Descent in the real world' },
    { id: 'ch-noise', n: '7', title: 'Mini-batches & the S in SGD' },
    { id: 'ch-optimizers', n: '8', title: 'The optimizer family tree' },
    { part: 'Part IV · The zoo' },
    { id: 'ch-problems', n: '9', title: 'The 22 landscapes' },
    { id: 'ch-experiments', n: '10', title: 'Things to try' },
    { part: 'Reference' },
    { id: 'ch-panels', n: '11', title: 'Reading the panels' },
    { id: 'ch-keys', n: '12', title: 'Keyboard' }
  ];
  const chapters = toc.filter(t => t.id) as Required<Pick<TocEntry, 'id' | 'n' | 'title'>>[];

  let bodyEl: HTMLElement;
  let activeId = 'ch-bowl';
  let progress = 0;

  function onScroll() {
    if (!bodyEl) return;
    const max = bodyEl.scrollHeight - bodyEl.clientHeight;
    progress = max > 0 ? bodyEl.scrollTop / max : 0;
    const base = bodyEl.getBoundingClientRect().top;
    let cur = chapters[0].id;
    for (const s of Array.from(bodyEl.querySelectorAll('section[data-ch]'))) {
      if (s.getBoundingClientRect().top - base <= 140) cur = s.getAttribute('data-ch') ?? cur;
    }
    activeId = cur;
  }

  function goTo(id: string) {
    activeId = id;
    bodyEl?.querySelector(`section[data-ch="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Auto-hiding scrollbar for the TOC rail: flag it as scrolling, then clear
  // the flag a beat after the last scroll event so the bar fades back out.
  let tocScrolling = false;
  let tocScrollTimer: ReturnType<typeof setTimeout> | undefined;
  function onTocScroll() {
    tocScrolling = true;
    clearTimeout(tocScrollTimer);
    tocScrollTimer = setTimeout(() => { tocScrolling = false; }, 700);
  }

  // Reset to the top whenever the book is opened.
  let prevOpen = false;
  $: if (isOpen !== prevOpen) {
    prevOpen = isOpen;
    if (isOpen) {
      activeId = 'ch-bowl';
      progress = 0;
      requestAnimationFrame(() => { if (bodyEl) { bodyEl.scrollTop = 0; onScroll(); } });
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }
  function handleKeydown(e: KeyboardEvent) {
    if (isOpen && e.key === 'Escape') onClose();
  }

  const formulas = {
    updateRule: String.raw`\boldsymbol{\theta}^{(t+1)} \leftarrow \boldsymbol{\theta}^{(t)} - \gamma\, \nabla \mathcal{L}(\boldsymbol{\theta}^{(t)})`,
    lossDefinition: String.raw`\mathcal{L}(\alpha,\beta) = \tfrac{1}{n}\sum_{i=1}^{n} \big(\hat{y}_i - y_i\big)^{2}`,
    gradientDefinition: String.raw`\nabla \mathcal{L} = \begin{bmatrix} \partial \mathcal{L}/\partial \alpha \\[2pt] \partial \mathcal{L}/\partial \beta \end{bmatrix}`,
    stepRule: String.raw`\boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \nabla \mathcal{L}`,
    stability: String.raw`\gamma < \frac{2}{\lambda_{\max}}`,
    directional: String.raw`D_{\mathbf{u}}\,\mathcal{L} \;=\; \nabla \mathcal{L}\cdot\mathbf{u} \;=\; \lVert \nabla \mathcal{L}\rVert\,\cos\theta`
  };

  // ---------- The optimizer story ----------
  // 170 years of "fix what just broke", told as cards: a main trunk (Acts I–IV,
  // GD → Adam) that forks into branches after Adam (sign steps, and — as later
  // chapters land — second-order and self-tuning). Each card leads with the
  // failure it exists to fix.
  type OptChapter = {
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

  const optTree: OptChapter[] = [
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
        'RMSProp’s twin, born the same year against the same AdaGrad flaw — but Zeiler spotted a deeper oddity: a raw gradient step has the wrong units. AdaDelta divides by $\\mathrm{RMS}[\\nabla\\mathcal{L}]$ like RMSProp, then multiplies by the RMS of its OWN recent steps. The two memories make the ratio dimensionless, and the learning rate falls out of the math entirely — there is nothing left to set but the decay $\\rho$.',
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
        'The branch that reaches back furthest — and the method every optimizer above is a cheap stand-in for. They all read only the slope $\\nabla\\mathcal{L}$. Newton also reads the CURVATURE: fit a quadratic bowl to the surface right here (the Hessian $\\mathbf H$) and jump straight to that bowl’s bottom, $-\\mathbf H^{-1}\\nabla\\mathcal{L}$. On a real bowl that nails the minimum in ONE step, with no learning rate to tune. This app already draws that jump — it is the violet Newton ghost in the curvature lens. So why isn’t it everywhere? $\\mathbf H$ is $N\\times N$ for $N$ parameters: trivial for our 2, ruinous for a billion. And away from a convex bowl $-\\mathbf H^{-1}\\nabla\\mathcal{L}$ can aim uphill, so here it falls back to a gradient step on saddles.',
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
        'Newton’s curvature is unbeatable and unaffordable; Sophia keeps the affordable part. Drop the full Hessian for just its DIAGONAL — one curvature number $\\mathbf h$ per parameter, no matrix to invert — and precondition the momentum by it. Then the safety move: CLIP every coordinate’s step to $\\pm\\rho$. Where the diagonal estimate is tiny or noisy (and $\\mathbf m/\\mathbf h$ would blow up) the clip bounds the move; where it’s solid, the step stays curvature-scaled. Light enough that it trained GPT-class models roughly twice as fast as Adam by step count — second-order thinking that actually ships.',
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
  type Author = { name: string; img?: string; credit?: string };
  type Cite = { wiki?: string; paper?: string; cite?: string; person?: string; img?: string; credit?: string; people?: Author[] };
  const OPT_CITE: Record<string, Cite> = {
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
  // Two-letter monogram for the portrait placeholder (first + last initial).
  function initials(name: string): string {
    const parts = name.replace(/[^A-Za-z\s]/g, ' ').trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  const raceExperiment = experiments.find(e => e.id === 'banana-race');
  const scheduleExperiment = experiments.find(e => e.id === 'lion-schedule');

  // ---------- Race palette, tuned rates, and on/off state ----------
  // One colour per optimizer; cousins share a hue family so the taxonomy reads
  // at a glance (violet = momentum, cyan/teal = adaptive rates, rose = Adam
  // family, emerald = second-order).
  const RACE_COLORS: Record<OptimizerId, string> = {
    gd: '#94a3b8',
    momentum: '#a855f7',
    nesterov: '#c084fc',
    adagrad: '#f59e0b',
    rmsprop: '#22d3ee',
    adadelta: '#2dd4bf',
    adam: '#f43f5e',
    nadam: '#fb7185',
    adamw: '#e11d48',
    radam: '#fb923c',
    lion: '#facc15',
    newton: '#10b981',
    sophia: '#34d399',
    prodigy: '#3b82f6'
  };
  // Rates tuned for THIS landscape. Adaptive methods keep their own fixed γ;
  // only the gradient-scaled methods and a few slow ones need a nudge.
  const RACE_LR: Partial<Record<OptimizerId, number>> = {
    gd: 0.06,
    momentum: 0.012,
    nesterov: 0.012,
    adagrad: 1.0,
    rmsprop: 0.06,
    adadelta: 2.5,
    radam: 0.15,
    sophia: 0.25
  };
  // A gentler momentum reads better here; AdamW's decay has no regularizer to
  // act on, so zero it (it would otherwise bias the fit off the true minimum).
  const RACE_HYPER: Partial<Record<OptimizerId, Record<string, number>>> = {
    momentum: { mu: 0.86 },
    nesterov: { mu: 0.86 },
    adamw: { wd: 0 }
  };
  // Start with a legible, diverse handful lit; the rest are one click away.
  const RACE_DEFAULT_ON: OptimizerId[] = ['gd', 'momentum', 'rmsprop', 'adam', 'lion', 'newton'];
  let raceOn: Record<OptimizerId, boolean> = Object.fromEntries(
    optimizerOrder.map(id => [id, RACE_DEFAULT_ON.includes(id)])
  ) as Record<OptimizerId, boolean>;
  let raceHover: OptimizerId | null = null;
  function toggleRacer(id: OptimizerId) {
    raceOn = { ...raceOn, [id]: !raceOn[id] };
  }

  // ---------- Race player (drives the SVG's SMIL timeline) ----------
  let raceSvg: SVGSVGElement;
  let racePlaying = true;
  function toggleRacePlay() {
    if (!raceSvg) return;
    if (racePlaying) raceSvg.pauseAnimations();
    else raceSvg.unpauseAnimations();
    racePlaying = !racePlaying;
  }
  function resetRace() {
    // Jump the whole animation back to the start; keep the current play state.
    raceSvg?.setCurrentTime(0);
    if (!racePlaying) raceSvg?.pauseAnimations();
  }

  // ---------- The opening picture: a real race on a real landscape ----------
  // A curved ravine, ℒ = 9(y − c(x))² + 0.22(x − x*)² with a sine valley
  // c(x), rendered exactly the way the app renders every landscape (log loss
  // → reversed viridis, white contour lines) — and four optimizers ACTUALLY
  // simulated on it, in Race-mode colors. Arrival times are true step counts.
  const RACE_W = 460;
  const RACE_H = 230;
  const raceDemo = (() => {
    const X0 = -2.2, X1 = 2.2, Y0 = -1.15, Y1 = 1.15;
    const XSTAR = 1.55;
    const c = (x: number) => 0.55 * Math.sin(1.35 * x + 0.4);
    const cp = (x: number) => 0.55 * 1.35 * Math.cos(1.35 * x + 0.4);
    const loss = (x: number, y: number) => 9 * (y - c(x)) ** 2 + 0.22 * (x - XSTAR) ** 2;
    const grad = (x: number, y: number): [number, number] => {
      const d = y - c(x);
      return [-18 * d * cp(x) + 0.44 * (x - XSTAR), 18 * d];
    };
    const px = (x: number) => ((x - X0) / (X1 - X0)) * RACE_W;
    const py = (y: number) => ((Y1 - y) / (Y1 - Y0)) * RACE_H;

    const gw = 110, gh = 55;
    const vals: number[] = new Array(gw * gh);
    let vMin = Infinity, vMax = -Infinity;
    for (let j = 0; j < gh; j++) {
      const y = Y1 - ((j + 0.5) / gh) * (Y1 - Y0);
      for (let i = 0; i < gw; i++) {
        const v = loss(X0 + ((i + 0.5) / gw) * (X1 - X0), y);
        vals[j * gw + i] = v;
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
    }
    const EPS = 0.001;
    const lMin = Math.log(vMin + EPS), lMax = Math.log(vMax + EPS);
    const canvas = document.createElement('canvas');
    canvas.width = gw;
    canvas.height = gh;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(gw, gh);
    for (let k = 0; k < vals.length; k++) {
      const t = Math.min(1, Math.max(0, (Math.log(vals[k] + EPS) - lMin) / (lMax - lMin)));
      const col = rgb(interpolateViridis(1 - t));
      img.data[k * 4] = col.r;
      img.data[k * 4 + 1] = col.g;
      img.data[k * 4 + 2] = col.b;
      img.data[k * 4 + 3] = 217;
    }
    ctx.putImageData(img, 0, 0);
    const heatURL = canvas.toDataURL();

    const levels: number[] = [];
    for (let k = 1; k < 10; k++) levels.push(Math.exp(lMin + (k / 10) * (lMax - lMin)) - EPS);
    const toPath = geoPath();
    const contourPaths = contours().size([gw, gh]).thresholds(levels)(vals)
      .map((poly, idx) => ({ d: toPath(poly) ?? '', o: 0.12 + 0.022 * idx }));

    const start: [number, number] = [-1.85, -0.75];
    const minPt: [number, number] = [XSTAR, c(XSTAR)];

    // Run the REAL optimizer engine on this landscape, one trajectory each, so
    // the race always reflects the actual algorithms (and any new ones). A
    // finite-difference Hessian feeds the second-order methods; the range sizes
    // Newton's / Prodigy's trust regions.
    const fdHess = (x: number, y: number) => {
      const e = 1e-3;
      const gpx = grad(x + e, y), gmx = grad(x - e, y);
      const gpy = grad(x, y + e), gmy = grad(x, y - e);
      return {
        h11: (gpx[0] - gmx[0]) / (2 * e),
        h12: (gpy[0] - gmy[0]) / (2 * e),
        h22: (gpy[1] - gmy[1]) / (2 * e)
      };
    };
    const range = { min: X0, max: X1 };
    const MAXSTEPS = 250;
    const simOpt = (id: OptimizerId): { pts: [number, number][]; steps: number; converged: boolean } => {
      const opt = optimizers[id];
      // RACE_LR takes precedence over the optimizer's own fixed γ — several
      // adaptive methods need a landscape-specific rate to actually reach the
      // basin here (AdaGrad in particular strangles its step at the default).
      const lr = RACE_LR[id] ?? opt.fixedLearningRate ?? 0.06;
      const hyper = { ...defaultHyper(id), ...(RACE_HYPER[id] ?? {}) };
      let p = { a: start[0], b: start[1] };
      let st = opt.init();
      const pts: [number, number][] = [[p.a, p.b]];
      let converged = false;
      let steps = MAXSTEPS;
      for (let s = 0; s < MAXSTEPS; s++) {
        const [gx, gy] = grad(p.a, p.b);
        const ctx = opt.usesHessian ? { hessian: fdHess(p.a, p.b), range } : { range };
        const out = opt.step(p, { a: gx, b: gy }, st, lr, hyper, ctx);
        if (!Number.isFinite(out.params.a) || !Number.isFinite(out.params.b)) {
          steps = s;
          break;
        }
        p = out.params;
        st = out.state;
        pts.push([p.a, p.b]);
        if (Math.hypot(p.a - minPt[0], p.b - minPt[1]) < 0.15) {
          converged = true;
          steps = s + 1;
          break;
        }
      }
      return { pts, steps, converged };
    };
    const runners = optimizerOrder.map(id => {
      const r = simOpt(id);
      return { id, name: optimizers[id].name, color: RACE_COLORS[id], ...r };
    });
    const slowest = Math.max(...runners.map(r => r.pts.length - 1));
    const racers = runners.map(r => ({
      id: r.id,
      name: r.name,
      color: r.color,
      d: 'M ' + r.pts.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join(' L '),
      frac: +(((r.pts.length - 1) / slowest) * 0.72).toFixed(4),
      steps: r.steps,
      converged: r.converged
    }));
    return {
      heatURL,
      contourPaths,
      racers,
      gw,
      gh,
      start: [px(start[0]), py(start[1])],
      min: [px(minPt[0]), py(minPt[1])]
    };
  })();

  // ----- Gradient concept SVG: a real vector field that fills the figure -----
  const gradVizW = 300;
  const gradVizH = 100;
  const gradVizCx = 75;
  const gradVizCy = 50;
  type Arrow = { x1: number; y1: number; x2: number; y2: number; w: number; o: number };
  const gradFieldArrows: Arrow[] = (() => {
    const arrows: Arrow[] = [];
    const cols = 18, rows = 7;
    const stepX = gradVizW / (cols + 1);
    const stepY = gradVizH / (rows + 1);
    let maxMag = 0;
    const raw: { gx: number; gy: number; ox: number; oy: number; m: number }[] = [];
    for (let j = 1; j <= rows; j++) {
      for (let i = 1; i <= cols; i++) {
        const ox = i * stepX, oy = j * stepY;
        const dx = gradVizCx - ox, dy = gradVizCy - oy;
        const m = Math.sqrt(dx * dx + dy * dy);
        if (m < 5) { raw.push({ gx: 0, gy: 0, ox, oy, m: 0 }); continue; }
        raw.push({ gx: dx / m, gy: dy / m, ox, oy, m });
        if (m > maxMag) maxMag = m;
      }
    }
    for (const r of raw) {
      if (r.m === 0) continue;
      const lenScale = 0.45 + 0.55 * (r.m / maxMag);
      const len = 9 * lenScale;
      arrows.push({
        x1: r.ox, y1: r.oy,
        x2: r.ox + r.gx * len, y2: r.oy + r.gy * len,
        w: 0.7 + 0.6 * lenScale,
        o: 0.5 + 0.4 * lenScale
      });
    }
    return arrows;
  })();

  // All problems, grouped — formulas kept tiny so they fit in card layout.
  type ProblemCard = { name: string; icon: any; customIcon?: string; formula: string; tag: string };
  const problems: Record<string, ProblemCard[]> = {
    'Start in 1D': [
      { name: 'Fit a Slope', icon: null, customIcon: '╱', formula: 'αX', tag: 'one parameter, one parabola' },
      { name: 'Double Well', icon: null, customIcon: 'W', formula: '(α²−4)²/8 + 0.6α', tag: 'the simplest local-minimum trap' },
      { name: 'Bumpy Valley', icon: null, customIcon: '∿', formula: '0.15α² + sin 2α', tag: 'four dips, one true bottom' }
    ],
    'Curve fitting': [
      { name: 'Linear', icon: TrendingUp, formula: 'αX + β', tag: 'one bowl, one minimum' },
      { name: 'Polynomial', icon: null, customIcon: 'x²', formula: 'αX² + βX', tag: 'curvature; convex bowl' },
      { name: 'Sine', icon: Activity, formula: 'α sin(βX)', tag: 'frequency aliasing → many minima' },
      { name: 'Exponential', icon: TrendingDown, formula: 'α e^(−βX)', tag: 'anisotropic; momentum shines' },
      { name: 'Damped Osc.', icon: Waves, formula: 'e^(−αt) cos(βt)', tag: 'decay × ringing; symmetric ±β' },
      { name: 'Gaussian Peak', icon: Mountain, formula: 'exp(−(X−α)²/2β²)', tag: 'vanishing gradients far out' },
      { name: 'Logistic Growth', icon: null, customIcon: 'σ', formula: '1 / (1 + e^(−(αX+β)))', tag: 'sigmoid — saturates at extremes' },
      { name: 'Power Law', icon: null, customIcon: 'xⁿ', formula: 'αX^β', tag: 'long, narrow valley' },
      { name: 'Mixture', icon: null, customIcon: 'ΛΛ', formula: 'e^−(X−α)² + e^−(X−β)²', tag: 'two equivalent minima (α↔β)' },
    ],
    'Classification & geometry': [
      { name: 'Logistic Reg.', icon: Percent, formula: 'σ(αX + βY)', tag: 'find the linear boundary' },
      { name: 'Circle Classifier', icon: Target, formula: 'σ((R²−d²)/τ)', tag: 'find a circle center' },
      { name: 'Source Localization', icon: Radio, formula: 'K / (d² + ε)', tag: 'inverse-square triangulation' },
      { name: 'Mean-Shift Cluster', icon: ScatterChart, formula: 'Σ(1 − kᵢ)/n', tag: 'two cluster modes' }
    ],
    'Time series': [
      { name: 'AR(2)', icon: null, customIcon: 'xₜ', formula: 'αxₜ₋₁ + βxₜ₋₂', tag: 'least squares on the series’ own past' },
      { name: 'AR(2) Rollout', icon: null, customIcon: 'x̂ₜ', formula: 'αx̂ₜ₋₁ + βx̂ₜ₋₂, rolled 6×', tag: 'errors compound — the stability triangle becomes a cliff' }
    ],
    'Neural network': [
      { name: 'Tiny Neural Net', icon: Brain, formula: 'β tanh(αX)', tag: 'mirror minima; zero-init is a dead saddle' }
    ],
    'Pure surfaces (no data)': [
      { name: 'Rosenbrock Valley', icon: null, customIcon: '∪', formula: '(1−α)² + 100(β−α²)²', tag: 'the classic banana benchmark' },
      { name: 'Saddle Point', icon: null, customIcon: '±', formula: 'α² − β² + β⁴/8 + 2', tag: 'gradients die at dead center' },
      { name: 'Himmelblau', icon: null, customIcon: '∷', formula: '(α²+β−11)² + (α+β²−7)²', tag: 'four equally deep minima' }
    ]
  };

  // ---------- Inline teaching figures: honest little simulations ----------
  type Pt = { x: number; y: number };

  // 1) Three learning-rate regimes — real GD on the same anisotropic bowl
  // (gentle along x, steeper along y) at three γ. Per-axis factor 1 − γλ:
  // small γ creeps; good γ glides; γ past 2/λ_y makes y overshoot and grow,
  // so the iterate zig-zags up the steep walls.
  const lrRegimes = (() => {
    const cx = 75, cy = 70, lx = 0.6, ly = 1.0, p0: Pt = { x: -46, y: -30 };
    const sim = (gamma: number, n: number, color: string, label: string, sub: string) => {
      let p = { ...p0 };
      const dots: Pt[] = [{ x: cx + p.x, y: cy + p.y }];
      for (let k = 0; k < n; k++) {
        p = { x: p.x * (1 - gamma * lx), y: p.y * (1 - gamma * ly) };
        dots.push({ x: cx + p.x, y: cy + p.y });
      }
      return { cx, cy, color, label, sub, dots,
        d: 'M ' + dots.map(q => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' L ') };
    };
    return [
      sim(0.12, 12, '#94a3b8', 'γ too small', 'creeps, stalls short'),
      sim(0.95, 7, '#10b981', 'γ just right', 'glides into the basin'),
      sim(2.18, 6, '#f59e0b', 'γ too big', 'overshoots, diverges')
    ];
  })();

  // 2) The ravine — one γ safe across the steep axis crawls along the gentle
  // one. GD zig-zags wall to wall; momentum builds speed and glides. Real
  // iterations on an anisotropic quadratic, over a reversed-viridis density
  // heatmap + contours so it matches the race / landscape panels.
  const ravineFig = (() => {
    const W = 460, H = 150;
    const X0 = -1.18, X1 = 0.36, Y0 = -0.72, Y1 = 0.72;
    const ax = 0.05, ay = 1.0;            // gentle along x, steep across y
    const loss = (x: number, y: number) => 0.5 * (ax * x * x + ay * y * y);
    const sx = (x: number) => ((x - X0) / (X1 - X0)) * W;
    const sy = (y: number) => ((Y1 - y) / (Y1 - Y0)) * H;

    // density heatmap (log loss → reversed viridis, the app's look)
    const gw = 124, gh = 42;
    const vals: number[] = new Array(gw * gh);
    let vMin = Infinity, vMax = -Infinity;
    for (let j = 0; j < gh; j++) {
      const y = Y1 - ((j + 0.5) / gh) * (Y1 - Y0);
      for (let i = 0; i < gw; i++) {
        const v = loss(X0 + ((i + 0.5) / gw) * (X1 - X0), y);
        vals[j * gw + i] = v;
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
    }
    const EPS = 0.0006;
    const lMin = Math.log(vMin + EPS), lMax = Math.log(vMax + EPS);
    const canvas = document.createElement('canvas');
    canvas.width = gw; canvas.height = gh;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(gw, gh);
    for (let k = 0; k < vals.length; k++) {
      const t = Math.min(1, Math.max(0, (Math.log(vals[k] + EPS) - lMin) / (lMax - lMin)));
      const col = rgb(interpolateViridis(1 - t));
      img.data[k * 4] = col.r; img.data[k * 4 + 1] = col.g; img.data[k * 4 + 2] = col.b; img.data[k * 4 + 3] = 217;
    }
    ctx.putImageData(img, 0, 0);
    const heatURL = canvas.toDataURL();
    const levels: number[] = [];
    for (let k = 1; k < 9; k++) levels.push(Math.exp(lMin + (k / 9) * (lMax - lMin)) - EPS);
    const toPath = geoPath();
    const contourPaths = contours().size([gw, gh]).thresholds(levels)(vals)
      .map((poly, idx) => ({ d: toPath(poly) ?? '', o: 0.1 + 0.02 * idx }));

    const start: Pt = { x: -1.02, y: 0.58 };
    const simGD = () => {
      const g = 1.72; let p = { ...start }; const out: Pt[] = [{ ...p }];
      for (let k = 0; k < 34; k++) { p = { x: p.x - g * ax * p.x, y: p.y - g * ay * p.y }; out.push({ ...p }); }
      return out;
    };
    const simMom = () => {
      const g = 0.6, mu = 0.86; let v = { x: 0, y: 0 }, p = { ...start }; const out: Pt[] = [{ ...p }];
      for (let k = 0; k < 34; k++) { v = { x: mu * v.x + ax * p.x, y: mu * v.y + ay * p.y }; p = { x: p.x - g * v.x, y: p.y - g * v.y }; out.push({ ...p }); }
      return out;
    };
    const toScreen = (arr: Pt[]) => arr.map(p => ({ x: sx(p.x), y: sy(p.y) }));
    const gdPts = toScreen(simGD()), momPts = toScreen(simMom());
    const path = (pts: Pt[]) => 'M ' + pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ');
    return { W, H, gw, gh, heatURL, contourPaths,
      gd: path(gdPts), mom: path(momPts), gdPts, momPts,
      min: { x: sx(0), y: sy(0) }, start: { x: sx(start.x), y: sy(start.y) } };
  })();

  // 3) The noise ball — SGD orbits the minimum in a cloud whose radius scales
  // with γ; decay γ and the cloud closes to a point. Deterministic scatter so
  // the figure never reshuffles between renders.
  const noiseBall = (() => {
    let s = 1337 >>> 0;
    const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
    const cloud = (cx: number, cy: number, sigma: number, n: number) =>
      Array.from({ length: n }, () => ({ x: cx + gauss() * sigma, y: cy + gauss() * sigma * 0.82, r: 1.3 + rnd() * 1.4 }));
    return { big: cloud(112, 74, 25, 52), small: cloud(348, 74, 6.5, 52) };
  })();

  // 4) Loss is a landscape — the flat contour map is the 3-D surface from
  // above. Right panel: level rings stacked by height z ∝ r² (an oblique bowl).
  const landscapeFig = (() => {
    const cx = 348, baseY = 95;
    const rings: { rx: number; ry: number; cy: number; o: number }[] = [];
    for (let k = 6; k >= 1; k--) {
      const rx = k * 8.3;
      rings.push({ rx, ry: rx * 0.36, cy: baseY - k * k * 1.7, o: 0.14 + (6 - k) * 0.12 });
    }
    const topL = { x: cx - 6 * 8.3, y: baseY - 36 * 1.7 };
    const topR = { x: cx + 6 * 8.3, y: baseY - 36 * 1.7 };
    return { cx, baseY, rings, topL, topR };
  })();

  // (The gradient chapter's 3-D bowl is a real WebGL scene — see GuideGradient3D.svelte.)

  // Proof figure, right panel: the rate of change ‖∇ℒ‖cosθ as the direction u
  // sweeps from along ∇ℒ (θ=0, max) through a contour (θ=90°, zero) to −∇ℒ
  // (θ=180°, min). A plain cosine — the claim, plotted.
  const proofCurve = (() => {
    const x0 = 286, x1 = 410, yc = 76, amp = 50, N = 60;
    const asc: string[] = [], desc: string[] = [];
    for (let i = 0; i <= N; i++) {
      const th = Math.PI * (i / N);
      const x = x0 + (i / N) * (x1 - x0), y = yc - Math.cos(th) * amp;
      const pt = `${x.toFixed(1)},${y.toFixed(1)}`;
      if (th <= Math.PI / 2 + 1e-9) asc.push(pt);
      if (th >= Math.PI / 2 - 1e-9) desc.push(pt);
    }
    return { x0, x1, yc, amp,
      ascD: 'M ' + asc.join(' L '), descD: 'M ' + desc.join(' L '),
      p0: { x: x0, y: yc - amp }, p90: { x: (x0 + x1) / 2, y: yc }, p180: { x: x1, y: yc + amp } };
  })();

  // 6) The optimizer family tree, drawn as an actual tree. DATA-DRIVEN: each
  // node lists a parent (and reuses RACE_COLORS); the tidy left→right layout
  // (x = lineage depth, y = leaf order, parents centred on their children)
  // reflows automatically, so a new optimizer just needs a row here + a colour.
  const familyTree = (() => {
    type TNode = { id: OptimizerId; name: string; year: string; parent: OptimizerId | null; merge?: OptimizerId };
    // Order matters: the adaptive branch first, then Momentum/Nesterov placed
    // right beneath Adam, then the Newton branch — so the dashed Momentum→Adam
    // merge stays a short local hop instead of crossing the whole tree.
    const data: TNode[] = [
      { id: 'gd', name: 'Gradient Descent', year: '1847', parent: null },
      { id: 'adagrad', name: 'AdaGrad', year: '2011', parent: 'gd' },
      { id: 'rmsprop', name: 'RMSProp', year: '2012', parent: 'adagrad' },
      { id: 'adadelta', name: 'AdaDelta', year: '2012', parent: 'rmsprop' },
      { id: 'adam', name: 'Adam', year: '2014', parent: 'rmsprop', merge: 'momentum' },
      { id: 'nadam', name: 'Nadam', year: '2016', parent: 'adam' },
      { id: 'adamw', name: 'AdamW', year: '2017', parent: 'adam' },
      { id: 'radam', name: 'RAdam', year: '2019', parent: 'adam' },
      { id: 'lion', name: 'Lion', year: '2023', parent: 'adam' },
      { id: 'prodigy', name: 'Prodigy', year: '2024', parent: 'adam' },
      { id: 'momentum', name: 'Momentum', year: '1964', parent: 'gd' },
      { id: 'nesterov', name: 'Nesterov', year: '1983', parent: 'momentum' },
      { id: 'newton', name: 'Newton', year: '1680s', parent: 'gd' },
      { id: 'sophia', name: 'Sophia', year: '2023', parent: 'newton' }
    ];
    const kids = (pid: OptimizerId | null) => data.filter(n => n.parent === pid).map(n => n.id);
    const depth: Record<string, number> = {};
    const setDepth = (id: OptimizerId, d: number) => { depth[id] = d; kids(id).forEach(c => setDepth(c, d + 1)); };
    setDepth('gd', 0);
    let r = 0; const rowOf: Record<string, number> = {};
    const assign = (id: OptimizerId) => {
      const ks = kids(id);
      if (!ks.length) { rowOf[id] = r++; return; }
      ks.forEach(assign);
      rowOf[id] = (rowOf[ks[0]] + rowOf[ks[ks.length - 1]]) / 2;
    };
    assign('gd');
    const maxDepth = Math.max(...Object.values(depth)), maxRow = r - 1;
    const padL = 72, padR = 76, padT = 26, dyR = 42, W = 640;
    const dx = (W - padL - padR) / maxDepth;
    const H = padT + maxRow * dyR + 32;
    const pos = (id: OptimizerId): Pt => ({ x: padL + depth[id] * dx, y: padT + rowOf[id] * dyR });
    const curve = (a: Pt, b: Pt) => {
      const mx = (a.x + b.x) / 2;
      return `M ${a.x.toFixed(1)},${a.y.toFixed(1)} C ${mx.toFixed(1)},${a.y.toFixed(1)} ${mx.toFixed(1)},${b.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
    };
    // Each branch carries its endpoints + the two node colours so it can be
    // stroked with a gradient interpolating parent → child.
    const edges = data.filter(n => n.parent).map(n => {
      const a = pos(n.parent as OptimizerId), b = pos(n.id);
      return {
        d: curve(a, b), w: Math.max(1.4, 5 - depth[n.id] * 0.8),
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        c0: RACE_COLORS[n.parent as OptimizerId], c1: RACE_COLORS[n.id]
      };
    });
    const merges = data.filter(n => n.merge).map(n => ({ d: curve(pos(n.merge as OptimizerId), pos(n.id)) }));
    // Nodes are plain colour-coded disks (root a touch larger) — cleaner than
    // a leaf glyph at this size.
    const nodes = data.map(n => {
      const p = pos(n.id);
      return { ...n, x: p.x, y: p.y, color: RACE_COLORS[n.id], root: n.parent === null };
    });
    return { W, H, edges, merges, nodes };
  })();

  const chIcon: Record<string, any> = {
    'ch-bowl': BookOpen, 'ch-landscape': Mountain, 'ch-downhill': TrendingDown,
    'ch-step': Compass, 'ch-gamma': Zap, 'ch-optimizers': Rocket, 'ch-noise': Waves,
    'ch-schedule': Activity,
    'ch-problems': Layers, 'ch-experiments': FlaskConical, 'ch-panels': Map, 'ch-keys': Keyboard
  };

  // "Further reading" per concept chapter — Wikipedia for the idea, the
  // landmark paper where there is one. (Optimizer cards carry their own
  // citations via OPT_CITE.) Verified canonical URLs.
  type ChRef = { kind: 'wiki' | 'paper'; label: string; href: string };
  const chRefs: Record<string, ChRef[]> = {
    'ch-bowl': [
      { kind: 'wiki', label: 'Mathematical optimization', href: 'https://en.wikipedia.org/wiki/Mathematical_optimization' },
      { kind: 'wiki', label: 'Mean squared error', href: 'https://en.wikipedia.org/wiki/Mean_squared_error' }
    ],
    'ch-landscape': [
      { kind: 'wiki', label: 'Level set', href: 'https://en.wikipedia.org/wiki/Level_set' },
      { kind: 'paper', label: 'Visualizing loss landscapes — Li et al., 2018', href: 'https://arxiv.org/abs/1712.09913' }
    ],
    'ch-downhill': [
      { kind: 'wiki', label: 'Gradient', href: 'https://en.wikipedia.org/wiki/Gradient' },
      { kind: 'wiki', label: 'Directional derivative', href: 'https://en.wikipedia.org/wiki/Directional_derivative' }
    ],
    'ch-step': [
      { kind: 'wiki', label: 'Gradient descent', href: 'https://en.wikipedia.org/wiki/Gradient_descent' }
    ],
    'ch-gamma': [
      { kind: 'wiki', label: 'Learning rate', href: 'https://en.wikipedia.org/wiki/Learning_rate' },
      { kind: 'wiki', label: 'Condition number', href: 'https://en.wikipedia.org/wiki/Condition_number' }
    ],
    'ch-schedule': [
      { kind: 'wiki', label: 'Learning-rate schedule', href: 'https://en.wikipedia.org/wiki/Learning_rate#Learning_rate_schedule' },
      { kind: 'paper', label: 'Cosine annealing / SGDR — Loshchilov & Hutter, 2017', href: 'https://arxiv.org/abs/1608.03983' },
      { kind: 'paper', label: 'Warmup — Goyal et al., 2017', href: 'https://arxiv.org/abs/1706.02677' }
    ],
    'ch-noise': [
      { kind: 'wiki', label: 'Stochastic gradient descent', href: 'https://en.wikipedia.org/wiki/Stochastic_gradient_descent' },
      { kind: 'paper', label: 'Stochastic approximation — Robbins & Monro, 1951', href: 'https://doi.org/10.1214/aoms/1177729586' }
    ]
  };
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div class="modal-backdrop" role="presentation" on:click={handleBackdropClick}>
    <div class="modal-content book" role="dialog" aria-modal="true" aria-label="Gradient Lab guide">
      <div class="modal-header">
        <div class="modal-title">
          <span class="modal-icon">∂</span>
          <h2>Gradient Lab</h2>
          <span class="book-tag">The Guide</span>
        </div>
        <button class="close-btn" on:click={onClose} aria-label="Close guide">
          <X size={22} strokeWidth={2} />
        </button>
      </div>

      <div class="reading-progress" aria-hidden="true">
        <div class="reading-progress-fill" style="transform: scaleX({progress})"></div>
      </div>

      <div class="reading-shell">
        <!-- ---------------- Table of contents rail ---------------- -->
        <aside class="toc" class:scrolling={tocScrolling} on:scroll={onTocScroll} aria-label="Table of contents">
          <nav>
            {#each toc as t}
              {#if t.part}
                <div class="toc-part">{t.part}</div>
              {:else}
                <button class="toc-item" class:active={activeId === t.id} on:click={() => goTo(t.id!)}>
                  <span class="toc-ic"><svelte:component this={chIcon[t.id!]} size={16} strokeWidth={2} /></span>
                  <span class="toc-title">{t.title}</span>
                </button>
              {/if}
            {/each}
          </nav>
        </aside>

        <!-- ---------------- Reading column ---------------- -->
        <div class="modal-body" bind:this={bodyEl} on:scroll={onScroll}>
          <div class="reading-column">
            <!-- ============== COVER ============== -->
            <div class="hero">
              <svg class="hero-svg" viewBox="0 0 460 200" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <radialGradient id="bowl-glow" cx="60%" cy="55%" r="42%">
                    <stop offset="0%" stop-color="#fde047" stop-opacity="0.55" />
                    <stop offset="35%" stop-color="#10b981" stop-opacity="0.30" />
                    <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
                  </radialGradient>
                  <clipPath id="hero-clip"><rect x="0" y="0" width="460" height="200" rx="10" /></clipPath>
                  <path id="descent-path" d="M 50,30 Q 110,45 170,85 T 250,118 Q 285,128 296,116" fill="none" />
                </defs>
                <g clip-path="url(#hero-clip)">
                  <rect x="0" y="0" width="460" height="200" fill="url(#bowl-glow)" rx="10" />
                  <ellipse cx="296" cy="116" rx="14"  ry="10"  class="contour" style="stroke-opacity: 0.55" />
                  <ellipse cx="296" cy="116" rx="36"  ry="26"  class="contour" style="stroke-opacity: 0.42" />
                  <ellipse cx="296" cy="116" rx="64"  ry="46"  class="contour" style="stroke-opacity: 0.30" />
                  <ellipse cx="296" cy="116" rx="98"  ry="68"  class="contour" style="stroke-opacity: 0.20" />
                  <ellipse cx="296" cy="116" rx="135" ry="92"  class="contour" style="stroke-opacity: 0.13" />
                  <ellipse cx="296" cy="116" rx="160" ry="108" class="contour" style="stroke-opacity: 0.07" />
                </g>
                <g class="trail">
                  {#each [0.0, 0.18, 0.34, 0.48] as begin, i}
                    <circle r="3" fill="#f59e0b" opacity={0.10 + i * 0.10}>
                      <animateMotion dur="3.2s" repeatCount="indefinite" begin="{begin}s"><mpath xlink:href="#descent-path" /></animateMotion>
                    </circle>
                  {/each}
                </g>
                <g>
                  <circle r="9" fill="none" stroke="#f59e0b" stroke-width="2" opacity="0.9">
                    <animateMotion dur="3.2s" repeatCount="indefinite" begin="0.6s"><mpath xlink:href="#descent-path" /></animateMotion>
                  </circle>
                  <circle r="5.5" fill="#f59e0b" stroke="#fff" stroke-width="2">
                    <animateMotion dur="3.2s" repeatCount="indefinite" begin="0.6s"><mpath xlink:href="#descent-path" /></animateMotion>
                  </circle>
                </g>
              </svg>
              <div class="hero-text">
                <div class="hero-eyebrow">An interactive guide to</div>
                <div class="hero-title">gradient-based optimization.</div>
                <div class="hero-subtitle">Two knobs, a landscape of error, and the search for its lowest point. Drag the marker, press Train, watch the loss fall — then learn why it does.</div>
              </div>
            </div>

            <!-- ============== 1 · THE BOWL ============== -->
            <section data-ch="ch-bowl" id="ch-bowl">
              <div class="part-label">Part I · The landscape</div>
              <h3><svelte:component this={chIcon['ch-bowl']} size={18} strokeWidth={2} /> The bottom of a bowl</h3>

              <p>
                Everything in this lab is one idea wearing many costumes: a machine has a few
                <strong>knobs</strong>, and <em>learning</em> means turning those knobs until the
                machine’s guesses line up with reality.
              </p>
              <p>
                Here every machine has exactly <strong>two</strong> knobs, called <em class="g">α</em>
                and <em class="g">β</em> (alpha and beta). Together they are the model’s
                <strong>parameters</strong> — the numbers that decide how it behaves. Choose values
                for α and β and the model makes a <strong>prediction</strong> for every input.
                Compare those predictions with the real answers and you get the <strong>loss</strong>:
                one number for how wrong the model is right now. Lower is better; a perfect fit sits
                near zero.
              </p>
              <p>
                That is the whole game — <em>find the α and β that make the loss as small as
                possible.</em> The orange marker is your current guess. Drag it around the
                <strong>Loss &amp; Gradient</strong> panel, press <strong>Train</strong>, and watch
                the number fall.
              </p>

              <div class="concept">
                <div class="concept-text">
                  <h4>Why a “bowl”?</h4>
                  <p>
                    For a simple fit, the loss is smallest at one best setting and grows as you move
                    away in any direction — a valley with a single lowest point. Slide along it and
                    the loss traces a bowl shape; the marker just wants to roll to the bottom.
                  </p>
                </div>
                <svg class="concept-svg" viewBox="0 0 200 120">
                  <path d="M 20,15 Q 100,180 180,15" fill="none" stroke="#10b981" stroke-width="2.5" />
                  <circle cx="100" cy="98" r="6" fill="#f59e0b" stroke="#fff" stroke-width="2" />
                  <text x="100" y="118" class="caption" text-anchor="middle">minimum</text>
                  <text x="40" y="38" class="caption">loss ↑</text>
                </svg>
              </div>

              <p>
                We can write that “how wrong” down exactly. For most fits here the loss is the
                <strong>mean squared error</strong>: take each prediction <em>ŷ</em>, subtract the
                true value <em>y</em>, square the gap so that overshooting and undershooting both
                count as wrong, and average over all <em>n</em> data points.
              </p>
              <div class="formula-display">{@html texD(formulas.lossDefinition)}</div>
              <p>
                The squaring is the quiet hero here: it punishes a big miss far more than a small one,
                and it makes the loss a smooth, rounded <em>bowl</em> rather than a creased tent — and
                a smooth bowl is exactly what lets us roll downhill in the chapters ahead.
              </p>
              {#if chapterPresets['ch-bowl']}
                <div class="opt-cta">
                  <span>Try it live:</span>
                  <button class="try-btn" on:click={() => runPreset('ch-bowl')}>
                    <Play size={13} strokeWidth={2.5} /><span>{chapterPresets['ch-bowl'].title}</span>
                  </button>
                </div>
              {/if}
              {#if chRefs['ch-bowl']}
                <div class="ch-refs">
                  <span class="ch-refs-label">Further reading</span>
                  {#each chRefs['ch-bowl'] as r}
                    <a class="opt-cite-link" href={r.href} target="_blank" rel="noopener noreferrer">
                      {#if r.kind === 'paper'}<FileText size={11} strokeWidth={2.2} />{:else}<BookOpen size={11} strokeWidth={2.2} />{/if}
                      {r.label}
                    </a>
                  {/each}
                </div>
              {/if}
            </section>

            <!-- ============== 2 · LOSS IS A LANDSCAPE ============== -->
            <section data-ch="ch-landscape" id="ch-landscape">
              <h3><svelte:component this={chIcon['ch-landscape']} size={18} strokeWidth={2} /> Loss is a landscape</h3>

              <p>
                Here is the move that makes everything visual. The loss is not one fixed number —
                it is a number <em>for every possible setting of the knobs.</em> Pick one (α, β) and
                you get a loss. Nudge to a nearby pair and you get a slightly different loss. Sweep
                across <strong>all</strong> pairs and those losses trace out a <strong>surface</strong>:
                a landscape floating above the flat plane of every possible α and β.
              </p>
              <p>
                Low places in that landscape are good models; high places are bad ones.
                <em>Training is simply walking downhill on this surface</em>, and the orange marker
                is you, standing somewhere on it.
              </p>
              <p>
                The <strong>Loss &amp; Gradient</strong> panel is a map of that landscape seen from
                straight above. <strong>Brighter colours are lower</strong> (better) loss; dark is
                high. The thin white loops are <strong>contour lines</strong> — exactly like a
                hiking map: each loop joins points of equal loss, and loops bunched tightly together
                mean a steep slope. Flip the panel to <strong>3D</strong> and the same map lifts into
                real hills and valleys you can rotate.
              </p>
              <figure class="fig">
                <svg viewBox="0 0 460 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                  <defs>
                    <radialGradient id="lf-bowl" cx="50%" cy="50%" r="55%">
                      <stop offset="0%" stop-color="#fde047" stop-opacity="0.5" />
                      <stop offset="45%" stop-color="#10b981" stop-opacity="0.22" />
                      <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
                    </radialGradient>
                  </defs>
                  <!-- left: the contour map, from straight above -->
                  <ellipse cx="112" cy="72" rx="70" ry="62" fill="url(#lf-bowl)" />
                  {#each [62, 48, 34, 20, 8] as rr}
                    <ellipse cx="112" cy="72" rx={rr} ry={rr * 0.9} class="fig-contour" style="stroke-opacity:0.3" />
                  {/each}
                  <circle cx="112" cy="72" r="3.5" fill="#f59e0b" stroke="#fff" stroke-width="1" />
                  <text x="112" y="142" class="fig-svg-label">the map — from straight above</text>
                  <!-- arrow: same thing, two views -->
                  <g stroke="var(--color-text-tertiary)" fill="none" stroke-width="1.4" opacity="0.55">
                    <line x1="200" y1="72" x2="236" y2="72" />
                    <path d="M230,67 L237,72 L230,77" />
                  </g>
                  <!-- right: the surface, lifted into 3-D -->
                  <path d="M {landscapeFig.topL.x},{landscapeFig.topL.y} Q {landscapeFig.cx - 26},{landscapeFig.baseY + 6} {landscapeFig.cx},{landscapeFig.baseY}" fill="none" stroke="#10b981" stroke-width="1.4" stroke-opacity="0.5" />
                  <path d="M {landscapeFig.topR.x},{landscapeFig.topR.y} Q {landscapeFig.cx + 26},{landscapeFig.baseY + 6} {landscapeFig.cx},{landscapeFig.baseY}" fill="none" stroke="#10b981" stroke-width="1.4" stroke-opacity="0.5" />
                  {#each landscapeFig.rings as r}
                    <ellipse cx={landscapeFig.cx} cy={r.cy} rx={r.rx} ry={r.ry} class="fig-contour" style="stroke-opacity:{r.o}" />
                  {/each}
                  <circle cx={landscapeFig.cx} cy={landscapeFig.baseY} r="3.5" fill="#f59e0b" stroke="#fff" stroke-width="1" />
                  <text x={landscapeFig.cx} y="142" class="fig-svg-label">the surface — from the side</text>
                </svg>
                <figcaption class="fig-cap">
                  The same loss, two ways: the flat contour map (left) is exactly the 3-D surface (right)
                  seen from straight above. Each ring joins points of equal loss; the bright dimple is the
                  basin every run is trying to reach.
                </figcaption>
              </figure>
              <p class="look">
                Look at the Loss &amp; Gradient panel right now: the bright dimple is where the loss
                is lowest, and the marker is trying to reach it.
              </p>
              {#if chapterPresets['ch-landscape']}
                <div class="opt-cta">
                  <span>Try it live:</span>
                  <button class="try-btn" on:click={() => runPreset('ch-landscape')}>
                    <Play size={13} strokeWidth={2.5} /><span>{chapterPresets['ch-landscape'].title}</span>
                  </button>
                </div>
              {/if}
              {#if chRefs['ch-landscape']}
                <div class="ch-refs">
                  <span class="ch-refs-label">Further reading</span>
                  {#each chRefs['ch-landscape'] as r}
                    <a class="opt-cite-link" href={r.href} target="_blank" rel="noopener noreferrer">
                      {#if r.kind === 'paper'}<FileText size={11} strokeWidth={2.2} />{:else}<BookOpen size={11} strokeWidth={2.2} />{/if}
                      {r.label}
                    </a>
                  {/each}
                </div>
              {/if}
            </section>

            <!-- ============== 3 · WHICH WAY IS DOWNHILL ============== -->
            <section data-ch="ch-downhill" id="ch-downhill">
              <div class="part-label">Part II · Walking downhill</div>
              <h3><svelte:component this={chIcon['ch-downhill']} size={18} strokeWidth={2} /> Which way is downhill?</h3>

              <p>
                Standing on a hillside in fog, you can still feel which way is down — the ground
                tilts under your feet. That tilt is the <strong>slope</strong>. With two knobs there
                are two slopes at once: how the loss changes as you nudge α, and how it changes as
                you nudge β. Bundle those two together and you get the <strong>gradient</strong>,
                written <strong>∇ℒ</strong> (say “grad L”).
              </p>
              <p>
                The gradient is an arrow, and it always points in the direction of <em>steepest
                increase</em> — straight uphill. So to go <strong>down</strong>, you walk the
                <strong>opposite</strong> way, along <strong>−∇ℒ</strong>. That negative gradient is
                the single most important arrow in this whole app.
              </p>
              <p>
                Why <em>steepest</em>? Picture standing on the slope and trying every direction you
                could step. Each heading has its own rate of climb, and the gradient is simply the one
                whose climb is fastest. Every other direction is a watered-down version of it: its
                steepness is the gradient’s shadow cast onto that heading — full strength straight along
                ∇ℒ, and fading to <em>nothing</em> at a right angle to it. Those flat, right-angle
                directions are exactly the <strong>contour lines</strong> on the map: walk along a
                contour and the loss never changes, so the steepest way off it has to be square across
                it. <em>The gradient is always perpendicular to the contours</em> — which is why the
                field arrows below cut straight through the white loops rather than running along them.
              </p>

              <div class="concept concept-bg-overlay">
                <svg class="concept-bg-svg" viewBox={`0 0 ${gradVizW} ${gradVizH}`} preserveAspectRatio="xMidYMid slice">
                  <defs>
                    <radialGradient id="grad-bowl-bg" cx="25%" cy="50%" r="55%">
                      <stop offset="0%" stop-color="#fde047" stop-opacity="0.55" />
                      <stop offset="45%" stop-color="#10b981" stop-opacity="0.22" />
                      <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
                    </radialGradient>
                    <marker id="grad-arrowhead" viewBox="0 -5 10 10" refX="8" refY="0" markerWidth="4" markerHeight="4" orient="auto">
                      <path d="M0,-5L10,0L0,5" fill="currentColor" />
                    </marker>
                  </defs>
                  <rect x="0" y="0" width={gradVizW} height={gradVizH} fill="url(#grad-bowl-bg)" />
                  {#each gradFieldArrows as a}
                    <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="currentColor" stroke-width={a.w} opacity={a.o} marker-end="url(#grad-arrowhead)" />
                  {/each}
                  <ellipse cx={gradVizCx} cy={gradVizCy} rx="10" ry="7" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="1" />
                  <ellipse cx={gradVizCx} cy={gradVizCy} rx="28" ry="20" fill="none" stroke="#fff" stroke-opacity="0.32" stroke-width="1" />
                  <ellipse cx={gradVizCx} cy={gradVizCy} rx="55" ry="40" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="1" />
                  <circle cx={gradVizCx} cy={gradVizCy} r="6" fill="none" stroke="#f59e0b" stroke-width="1.5" />
                  <circle cx={gradVizCx} cy={gradVizCy} r="3.5" fill="#f59e0b" stroke="#fff" stroke-width="1.5" />
                </svg>
                <div class="concept-fade"></div>
                <div class="concept-text concept-text-overlay">
                  <h4>The field of downhill arrows</h4>
                  <p>
                    Every faint arrow on the loss map is <strong>−∇ℒ</strong> at that spot — the
                    steepest way down — and they all stream toward the basin. They are longer where
                    the surface is steeper.
                  </p>
                  <p>
                    On the marker itself, the <span class="ink-blue">blue arrow</span> is this same
                    −∇ℒ: the steepest descent from exactly where you stand. (Its red partner arrives
                    in the next chapter.)
                  </p>
                </div>
              </div>

              <p>
                Formally, the gradient is a column of <strong>partial derivatives</strong> — one
                slope per parameter. Each entry answers a single, narrow question: <em>if I wiggle
                only this knob and hold the other still, how fast does the loss change?</em> There is
                nothing mystical in measuring one: nudge α by a hair, see how far the loss moved, and
                divide the change by the nudge. Do that once for α and once for β and you have the two
                numbers the gradient is built from.
              </p>
              <div class="formula-display">{@html texD(formulas.gradientDefinition)}</div>
              <p>
                Stack those two answers into a little arrow and you have ∇ℒ. Its
                <strong>direction</strong> is the steepest way uphill; its <strong>length</strong> is
                how steep. That is why the field arrows stretch long on the steep walls and shrink to
                almost nothing at the basin floor — at the very bottom there is no downhill left, so
                the gradient, and the step it drives, fades to zero. The marker arriving and going
                still <em>is</em> the gradient vanishing.
              </p>

              <p>
                We keep calling −∇ℒ the <em>steepest</em> way down. That is not loose talk — and it is
                worth seeing why, first in three dimensions, then in one short line of proof.
              </p>
              <figure class="fig">
                <div class="fig-3d">
                  {#await import('./GuideGradient3D.svelte') then m}
                    <svelte:component this={m.default} />
                  {/await}
                  <div class="fig-3d-legend">
                    <span><span class="leg-sw leg-amber"></span>{@html tex(String.raw`\nabla\mathcal{L}`)} — steepest ascent</span>
                    <span><span class="leg-sw leg-emerald"></span>−{@html tex(String.raw`\nabla\mathcal{L}`)} — toward the basin</span>
                  </div>
                  <div class="fig-3d-hint">drag to orbit</div>
                </div>
                <figcaption class="fig-cap">
                  The same idea in three dimensions: on the wall of the bowl,
                  {@html tex(String.raw`\nabla\mathcal{L}`)} (amber) points straight up the steepest rise
                  and −{@html tex(String.raw`\nabla\mathcal{L}`)} (emerald) straight down toward the basin —
                  both perpendicular to the green level ring they sit on. Drag to spin it.
                </figcaption>
              </figure>

              <div class="proof">
                <div class="proof-title">Why the negative gradient is exactly the steepest descent</div>
                <p class="proof-p">
                  Take a unit step in some direction {@html tex(String.raw`\mathbf{u}`)}. The loss changes
                  at a rate equal to the gradient’s <em>shadow</em> on that direction — their dot product
                  {@html tex(String.raw`\nabla\mathcal{L}\cdot\mathbf{u}`)}. Writing {@html tex(String.raw`\theta`)}
                  for the angle between {@html tex(String.raw`\mathbf{u}`)} and {@html tex(String.raw`\nabla\mathcal{L}`)},
                  that shadow has length {@html tex(String.raw`\lVert\nabla\mathcal{L}\rVert\cos\theta`)}:
                </p>
                <div class="formula-display center">{@html texD(formulas.directional)}</div>
                <figure class="proof-fig">
                  <svg viewBox="0 0 420 162" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                    <defs>
                      <marker id="pf-grad" viewBox="0 -5 10 10" refX="8" refY="0" markerWidth="5.5" markerHeight="5.5" orient="auto"><path d="M0,-5L10,0L0,5" fill="#f59e0b" /></marker>
                      <marker id="pf-u" viewBox="0 -5 10 10" refX="8" refY="0" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,-5L10,0L0,5" fill="var(--color-text-tertiary)" /></marker>
                    </defs>
                    <line x1="261" y1="16" x2="261" y2="150" class="fig-contour" style="stroke-opacity:0.16" />
                    <!-- Panel A · the shadow (projection of ∇ℒ onto u) -->
                    <line x1="74" y1="110" x2="246" y2="110" stroke="var(--color-text-tertiary)" stroke-width="1.2" stroke-dasharray="3,3" stroke-opacity="0.6" marker-end="url(#pf-u)" />
                    <line x1="74" y1="110" x2="202.2" y2="110" stroke="#3b82f6" stroke-width="4.5" stroke-linecap="round" />
                    <line x1="202.2" y1="36" x2="202.2" y2="110" stroke="var(--color-text-tertiary)" stroke-width="1" stroke-dasharray="2.5,2.5" stroke-opacity="0.75" />
                    <path d="M 195.2,110 L 195.2,103 L 202.2,103" fill="none" stroke="var(--color-text-tertiary)" stroke-width="1" stroke-opacity="0.75" />
                    <line x1="74" y1="110" x2="200" y2="37.2" stroke="#f59e0b" stroke-width="2.6" marker-end="url(#pf-grad)" />
                    <path d="M 102,110 A 28,28 0 0 0 98,95.5" fill="none" stroke="var(--color-text-tertiary)" stroke-width="1.2" />
                    <circle cx="74" cy="110" r="2.8" fill="var(--color-text-primary)" />
                    <text x="206" y="34" class="proof-lbl" style="text-anchor:start;fill:#f59e0b">∇ℒ</text>
                    <text x="250" y="114" class="proof-lbl" style="text-anchor:start;fill:var(--color-text-secondary)">u</text>
                    <text x="111" y="103" class="proof-lbl" style="fill:var(--color-text-tertiary)">θ</text>
                    <text x="138" y="126" class="proof-lbl" style="fill:#3b82f6">‖∇ℒ‖ cos θ</text>
                    <!-- Panel B · rate vs angle is a cosine -->
                    <line x1={proofCurve.x0 - 8} y1={proofCurve.yc} x2={proofCurve.x1 + 8} y2={proofCurve.yc} stroke="var(--color-text-tertiary)" stroke-width="1" stroke-dasharray="3,3" stroke-opacity="0.45" />
                    <path d={proofCurve.ascD} fill="none" stroke="#f59e0b" stroke-width="2.4" stroke-linecap="round" />
                    <path d={proofCurve.descD} fill="none" stroke="#10b981" stroke-width="2.4" stroke-linecap="round" />
                    <circle cx={proofCurve.p0.x} cy={proofCurve.p0.y} r="3.1" fill="#f59e0b" />
                    <circle cx={proofCurve.p90.x} cy={proofCurve.p90.y} r="3.1" fill="var(--color-text-tertiary)" />
                    <circle cx={proofCurve.p180.x} cy={proofCurve.p180.y} r="3.1" fill="#10b981" />
                    <text x={proofCurve.p0.x - 3} y={proofCurve.p0.y - 8} class="proof-lbl" style="text-anchor:start;fill:#f59e0b">along ∇ℒ</text>
                    <text x={proofCurve.p90.x} y={proofCurve.p90.y - 9} class="proof-lbl" style="fill:var(--color-text-tertiary)">contour · flat</text>
                    <text x={proofCurve.p180.x + 3} y={proofCurve.p180.y + 13} class="proof-lbl" style="text-anchor:end;fill:#10b981">along −∇ℒ</text>
                  </svg>
                  <figcaption class="proof-figcap">
                    Left: the rate is ∇ℒ’s shadow on <strong>u</strong>. Right: sweep <strong>u</strong>
                    around and that shadow traces a cosine — biggest along ∇ℒ, zero across a contour,
                    most negative along −∇ℒ.
                  </figcaption>
                </figure>
                <p class="proof-p">
                  Because {@html tex(String.raw`\cos\theta`)} only ever runs from +1 to −1, that rate is
                  largest when {@html tex(String.raw`\mathbf{u}`)} lines up with {@html tex(String.raw`\nabla\mathcal{L}`)}
                  (the fastest <em>rise</em>), exactly zero at a right angle (walking a contour — the loss
                  holds still), and most negative along {@html tex(String.raw`-\nabla\mathcal{L}`)} (the
                  fastest <em>fall</em>). No direction can beat it. <span class="proof-qed">∎</span>
                </p>
              </div>

              <p>
                One honest caveat to carry forward: the gradient is only the truth <em>right where you
                stand.</em> Zoom in close enough and any smooth surface flattens into a tilted plane,
                and ∇ℒ is exactly that tilt — but step too far and the real ground curves away from the
                plane you trusted. That gap between the slope underfoot and the surface a stride away is
                the whole reason a step can be <em>too big</em>, and taming it is what the learning rate
                exists to do.
              </p>
              {#if chapterPresets['ch-downhill']}
                <div class="opt-cta">
                  <span>Try it live:</span>
                  <button class="try-btn" on:click={() => runPreset('ch-downhill')}>
                    <Play size={13} strokeWidth={2.5} /><span>{chapterPresets['ch-downhill'].title}</span>
                  </button>
                </div>
              {/if}
              {#if chRefs['ch-downhill']}
                <div class="ch-refs">
                  <span class="ch-refs-label">Further reading</span>
                  {#each chRefs['ch-downhill'] as r}
                    <a class="opt-cite-link" href={r.href} target="_blank" rel="noopener noreferrer">
                      {#if r.kind === 'paper'}<FileText size={11} strokeWidth={2.2} />{:else}<BookOpen size={11} strokeWidth={2.2} />{/if}
                      {r.label}
                    </a>
                  {/each}
                </div>
              {/if}
            </section>

            <!-- ============== 4 · ONE STEP ============== -->
            <section data-ch="ch-step" id="ch-step">
              <h3><svelte:component this={chIcon['ch-step']} size={18} strokeWidth={2} /> One step of descent</h3>

              <p>Now we can actually walk. One step of <strong>gradient descent</strong> is almost insultingly simple:</p>
              <blockquote class="recipe">
                Stand at your current (α, β). Look downhill — that’s <strong>−∇ℒ</strong>. Take a
                step of size <em class="g">γ</em> in that direction. Repeat.
              </blockquote>
              <p>
                In symbols, that is the rule the entire field is built on. We write <strong>θ</strong>
                (“theta”) as shorthand for the pair (α, β) together:
              </p>
              <div class="formula-display center">{@html texD(formulas.stepRule)}</div>
              <p>
                Press <strong>Step</strong> to take exactly one of these; press <strong>Train</strong>
                to take many in a row and watch the marker slide into a valley.
              </p>
              <p>
                You’ll now notice a <span class="ink-red">red arrow</span> on the marker beside the
                blue one. The blue arrow is the pure downhill direction; the
                <strong>red arrow is the step the optimizer actually took</strong>. Early on they
                almost agree. Once you add the tricks in Part III, they’ll split apart — and
                <em>that gap is the optimizer’s personality.</em>
              </p>
              {#if chapterPresets['ch-step']}
                <div class="opt-cta">
                  <span>Try it live:</span>
                  <button class="try-btn" on:click={() => runPreset('ch-step')}>
                    <Play size={13} strokeWidth={2.5} /><span>{chapterPresets['ch-step'].title}</span>
                  </button>
                </div>
              {/if}
              {#if chRefs['ch-step']}
                <div class="ch-refs">
                  <span class="ch-refs-label">Further reading</span>
                  {#each chRefs['ch-step'] as r}
                    <a class="opt-cite-link" href={r.href} target="_blank" rel="noopener noreferrer">
                      {#if r.kind === 'paper'}<FileText size={11} strokeWidth={2.2} />{:else}<BookOpen size={11} strokeWidth={2.2} />{/if}
                      {r.label}
                    </a>
                  {/each}
                </div>
              {/if}
            </section>

            <!-- ============== 5 · LEARNING RATE ============== -->
            <section data-ch="ch-gamma" id="ch-gamma">
              <h3><svelte:component this={chIcon['ch-gamma']} size={18} strokeWidth={2} /> The learning rate γ</h3>

              <p>
                There is one number you’ll reach for more than any other: <em class="g">γ</em>
                (gamma), the <strong>learning rate</strong> — how big each step is. It’s a Goldilocks
                dial.
              </p>
              <ul class="knob-bullets">
                <li><strong>Too small:</strong> the marker creeps; it never reaches the bottom before the steps run out.</li>
                <li><strong>Too big:</strong> it overshoots the valley floor and bounces up the far wall — loss leaps around, or rockets off to infinity. (The app catches this, stops, and explains what happened.)</li>
                <li><strong>Just right:</strong> a smooth glide into the basin. Every problem ships with a sane default — but the fastest way to <em>feel</em> γ is to break it on purpose.</li>
              </ul>
              <p>
                There’s even a sharp edge to it: push γ past roughly <strong>two divided by the
                steepness of the valley</strong> and the steps grow instead of shrink, and the run
                diverges. That “steepness” is the <strong>curvature</strong> — and outwitting it is
                what the optimizer family tree in Part III is built for.
              </p>

              <p>
                That edge is not vague — it has an exact location. For a smooth bowl, gradient descent
                only settles when γ stays below <strong>two divided by the largest curvature</strong>,
                written λ<sub>max</sub> (the steepest second derivative of the surface — how sharply
                the slope itself is bending).
              </p>
              <div class="formula-display">{@html texD(formulas.stability)}</div>
              <p>
                Stay under that line and each step lands closer to the bottom than the last, so the run
                converges. Cross it and the opposite happens: every step overshoots a little more than
                the one before, the bounce compounds, and the loss runs off to infinity. That single
                number — the curvature — is the villain the optimizer family tree is built to outwit.
              </p>
              <figure class="fig fig-lr">
                <div class="fig-triptych">
                  {#each lrRegimes as g}
                    <div class="fig-cell">
                      <svg viewBox="0 0 150 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                        <ellipse cx={g.cx} cy={g.cy} rx="58" ry="46" class="fig-contour" style="stroke-opacity:0.10" />
                        <ellipse cx={g.cx} cy={g.cy} rx="37" ry="29" class="fig-contour" style="stroke-opacity:0.16" />
                        <ellipse cx={g.cx} cy={g.cy} rx="18" ry="14" class="fig-contour" style="stroke-opacity:0.24" />
                        <circle cx={g.cx} cy={g.cy} r="3" fill="#10b981" />
                        <path d={g.d} fill="none" stroke={g.color} stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
                        {#each g.dots as d, i}
                          {#if i > 0}<circle cx={d.x} cy={d.y} r="1.7" fill={g.color} />{/if}
                        {/each}
                        <circle cx={g.dots[0].x} cy={g.dots[0].y} r="4.2" fill="#f59e0b" stroke="#fff" stroke-width="1.2" />
                      </svg>
                      <div class="fig-cell-label" style="color:{g.color}">{g.label}</div>
                      <div class="fig-cell-sub">{g.sub}</div>
                    </div>
                  {/each}
                </div>
                <figcaption class="fig-cap">
                  Gradient descent from the same start (orange) at three step sizes, on one bowl. Below the
                  stability limit it settles — sluggishly, or briskly; cross the limit and every step
                  overshoots a little more than the last.
                </figcaption>
              </figure>
              {#if chapterPresets['ch-gamma']}
                <div class="opt-cta">
                  <span>Try it live:</span>
                  <button class="try-btn" on:click={() => runPreset('ch-gamma')}>
                    <Play size={13} strokeWidth={2.5} /><span>{chapterPresets['ch-gamma'].title}</span>
                  </button>
                </div>
              {/if}
              {#if chRefs['ch-gamma']}
                <div class="ch-refs">
                  <span class="ch-refs-label">Further reading</span>
                  {#each chRefs['ch-gamma'] as r}
                    <a class="opt-cite-link" href={r.href} target="_blank" rel="noopener noreferrer">
                      {#if r.kind === 'paper'}<FileText size={11} strokeWidth={2.2} />{:else}<BookOpen size={11} strokeWidth={2.2} />{/if}
                      {r.label}
                    </a>
                  {/each}
                </div>
              {/if}
            </section>

            <!-- ============== 6 · SCHEDULING THE LEARNING RATE ============== -->
            <section data-ch="ch-schedule" id="ch-schedule">
              <h3><svelte:component this={chIcon['ch-schedule']} size={18} strokeWidth={2} /> Scheduling the learning rate</h3>
              <p>
                The learning rate just handed us a single, unavoidable compromise: a <strong>large</strong>
                γ covers ground fast but overshoots the floor; a <strong>small</strong> γ lands precisely
                but crawls to get there. You don’t actually have to choose. Stop treating γ as one frozen
                number and <strong>schedule</strong> it — large early to cover ground, small late to settle
                cleanly — and you get both halves of the bargain. The <strong>Schedule</strong> control
                beneath the learning rate does exactly that: it multiplies your base γ by a factor that
                changes on every step of the run.
              </p>
              <p>
                The four schedules trace four different shapes for that factor over a run — flat, then
                three ways of bleeding γ away as the steps tick by:
              </p>
              <div class="schedule-grid">
                {#each scheduleCurves as s (s.id)}
                  <div class="schedule-card">
                    <svg viewBox="0 0 {SCH_W} {SCH_H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                      <line x1={SCH_PAD} y1={SCH_H - SCH_PAD} x2={SCH_W - SCH_PAD} y2={SCH_H - SCH_PAD} class="sch-axis" />
                      <line x1={SCH_PAD} y1={SCH_PAD} x2={SCH_PAD} y2={SCH_H - SCH_PAD} class="sch-axis" />
                      <path d={s.d} fill="none" class="sch-curve" />
                    </svg>
                    <div class="schedule-name">{s.name}</div>
                    <div class="schedule-desc">{s.desc}</div>
                  </div>
                {/each}
              </div>
              <p>
                <strong>Constant</strong> holds γ start to finish — the honest baseline, and always the
                compromise above. <strong>Step decay</strong> keeps γ flat, then cuts it by a fixed factor
                at set milestones (here ×0.3 a third of the way in, and again at two-thirds). It leaves the
                loss curve’s most recognizable fingerprint: a long plateau, then a sudden <em>cliff</em>
                the instant γ drops and the smaller step resolves detail the larger one skated over. For
                most of deep learning’s history, that staircase trained nearly every network.
              </p>
              <p>
                <strong>Cosine</strong> does the same work without the jolts — γ eases down the first half
                of a cosine from full strength to a small floor (about 5%), quick at first and
                feather-light by the end. With no brutal transition the run simply settles, which is why
                cosine annealing is the modern default. <strong>Warmup + cosine</strong> bolts a short
                on-ramp onto the front: γ starts near zero and climbs over the first tenth before the
                cosine takes over. That protects the opening, where a run <em>begins</em> at a random,
                often dreadful point and one full-size step could fling the marker off the map — so it is
                now standard for training large models from scratch.
              </p>
              <p>
                One practical wrinkle: these shapes were designed for runs of thousands of steps, so over
                a short run here the decay can be too gentle to see. The <strong>Decay speed</strong>
                slider — it appears whenever a non-constant schedule is active — compresses the whole
                schedule into a fraction of the run, so at <em>4×</em> it finishes annealing a quarter of
                the way in. Turn it up and read the result off the dotted γ(t) line in the loss chart.
              </p>
              <p>
                Scheduling has a second, deeper payoff that only lands once gradients turn <em>noisy</em>
                — the subject of the next part. A γ bled toward zero is the one thing that pulls a restless
                run in to a clean stop. And one optimizer you’ll meet there, <strong>Lion</strong>, takes a
                fixed-size step and so cannot settle <em>at all</em> on a constant γ: it just orbits the
                minimum forever. It is the purest illustration of why schedules exist — switch it to cosine
                and the orbit closes to a point.
              </p>
              {#if scheduleExperiment}
                <div class="opt-cta">
                  <span>See it now:</span>
                  <button class="try-btn" on:click={() => runExperiment(scheduleExperiment)}>
                    <Play size={13} strokeWidth={2.5} /><span>Watch Lion orbit, then land</span>
                  </button>
                </div>
              {/if}
              {#if chRefs['ch-schedule']}
                <div class="ch-refs">
                  <span class="ch-refs-label">Further reading</span>
                  {#each chRefs['ch-schedule'] as r}
                    <a class="opt-cite-link" href={r.href} target="_blank" rel="noopener noreferrer">
                      {#if r.kind === 'paper'}<FileText size={11} strokeWidth={2.2} />{:else}<BookOpen size={11} strokeWidth={2.2} />{/if}
                      {r.label}
                    </a>
                  {/each}
                </div>
              {/if}
            </section>

            <!-- ============== 7 · NOISE / SGD ============== -->
            <section data-ch="ch-noise" id="ch-noise">
              <div class="part-label">Part III · Descent in the real world</div>
              <h3><svelte:component this={chIcon['ch-noise']} size={18} strokeWidth={2} /> Mini-batches &amp; the S in SGD</h3>
              <p>
                Every gradient so far has been the <strong>true</strong> one — measured on all your
                data at once. That is <strong>full-batch</strong> descent: the <strong>Batch
                size</strong> dial set to <em>All</em>. It gives the cleanest possible arrow, and it
                is the most expensive thing you can do, because every single step has to read every
                single data point.
              </p>
              <p>
                Real datasets are far too large for that, so instead you <em>estimate</em> the
                gradient from a small random <strong>batch</strong> — a handful of points, freshly
                resampled each step. The arrow you get back is <strong>noisy</strong>: it jitters
                around the true downhill, because a different handful would have pulled in a slightly
                different direction. But it is cheap, and — this is the quiet miracle that makes modern
                training possible — it still points the right way <em>on average</em>. Averaging your
                way downhill through that noise is the <strong>S</strong> (stochastic) in
                <strong>SGD</strong>, stochastic gradient descent.
              </p>
              <p>
                Slide the <strong>Batch size</strong> down from <em>All</em> toward <em>1</em> and a
                faint <strong>fan</strong> of arrows opens at the marker: each ray is the gradient a
                different random batch would have handed you, so the <em>width of the fan is the noise
                itself.</em> The fewer points in the batch, the wider it spreads — and it spreads in a
                very specific way. The error of an average shrinks only with the <em>square root</em>
                of how many samples go into it, so a batch of 4 is roughly twice as steady as a batch
                of 1, and you need 16 to halve the noise again. That is the law of diminishing returns
                behind every batch-size choice: a batch of 32 already looks almost as calm as the full
                dataset, for a fraction of the cost.
              </p>
              <p>
                And the noise is not pure cost. A little jitter is genuinely <strong>useful</strong>: a
                noisy step can rattle the marker out of a shallow dip or a flat saddle that a perfectly
                smooth step would have settled into and never left, and the constant restlessness tends
                to steer a run toward <em>wide, gentle</em> basins — the forgiving kind that generalize
                to new data — rather than narrow, brittle cracks. This is why a touch of stochasticity
                is often kept on purpose, even when the full gradient is affordable.
              </p>
              <p>
                The bill comes due at the <em>end</em>. Because the gradient never goes quiet, SGD never
                fully stops: near the bottom it stops descending and starts <strong>orbiting</strong>,
                buzzing around the minimum inside a small <strong>noise ball</strong> whose radius grows
                with both the step size γ and the width of the fan. On the loss curve it shows up as a
                fuzzy <em>band</em> rather than a clean line that flatlines — the run has arrived, but it
                can’t hold still. This is where the <strong>schedule</strong> from the last chapter earns
                its keep: a γ bled toward zero draws that ball in tight, turning the restless buzz into a
                soft landing. Under noise, decay isn’t a luxury — it is <em>how a stochastic run converges
                at all.</em>
              </p>
              <figure class="fig">
                <svg viewBox="0 0 460 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                  {#each [62, 42, 24] as rr, i}
                    <ellipse cx="112" cy="74" rx={rr} ry={rr * 0.8} class="fig-contour" style="stroke-opacity:{0.1 + i * 0.05}" />
                  {/each}
                  {#each noiseBall.big as d}<circle cx={d.x} cy={d.y} r={d.r} fill="#f59e0b" opacity="0.5" />{/each}
                  <circle cx="112" cy="74" r="3.5" fill="#10b981" stroke="#fff" stroke-width="1" />
                  {#each [62, 42, 24] as rr, i}
                    <ellipse cx="348" cy="74" rx={rr} ry={rr * 0.8} class="fig-contour" style="stroke-opacity:{0.1 + i * 0.05}" />
                  {/each}
                  {#each noiseBall.small as d}<circle cx={d.x} cy={d.y} r={d.r} fill="#10b981" opacity="0.55" />{/each}
                  <circle cx="348" cy="74" r="3.5" fill="#10b981" stroke="#fff" stroke-width="1" />
                  <text x="112" y="142" class="fig-svg-label">large γ — wide noise ball</text>
                  <text x="348" y="142" class="fig-svg-label">γ → 0 — the ring closes in</text>
                </svg>
                <figcaption class="fig-cap">
                  Under noisy gradients the run never quite stops — it orbits the minimum in a cloud whose
                  radius grows with γ (left). Bleed γ toward zero and the cloud draws in to a point (right):
                  the schedule, doing its quiet job.
                </figcaption>
              </figure>
              <p class="look">
                Watch it: set a small <strong>Batch size</strong> so the loss settles into a fuzzy band on
                <strong>Const</strong>, then switch the schedule to <strong>Cosine</strong> and see the
                band pinch shut over the final steps.
              </p>
              {#if chapterPresets['ch-noise']}
                <div class="opt-cta">
                  <span>Try it live:</span>
                  <button class="try-btn" on:click={() => runPreset('ch-noise')}>
                    <Play size={13} strokeWidth={2.5} /><span>{chapterPresets['ch-noise'].title}</span>
                  </button>
                </div>
              {/if}
              {#if chRefs['ch-noise']}
                <div class="ch-refs">
                  <span class="ch-refs-label">Further reading</span>
                  {#each chRefs['ch-noise'] as r}
                    <a class="opt-cite-link" href={r.href} target="_blank" rel="noopener noreferrer">
                      {#if r.kind === 'paper'}<FileText size={11} strokeWidth={2.2} />{:else}<BookOpen size={11} strokeWidth={2.2} />{/if}
                      {r.label}
                    </a>
                  {/each}
                </div>
              {/if}
            </section>

            <!-- ============== 8 · THE OPTIMIZER STORY ============== -->
            <section data-ch="ch-optimizers" id="ch-optimizers">
              <h3><svelte:component this={chIcon['ch-optimizers']} size={18} strokeWidth={2} /> The optimizer family tree</h3>
              <p>
                Plain gradient descent has one recurring nemesis: the <strong>ravine</strong> — a
                valley far steeper across than along. The γ that’s safe on the steep walls is
                hopeless along the gentle floor, so the marker rattles wall to wall. Every optimizer
                in the picker is a patch for that pain (or the new pain the last patch created) —
                170 years of <em>fix what just broke</em>: a single trunk of fixes that, once it
                reaches Adam, finally splits into the branches still being explored today. The
                picker is grouped to match.
              </p>
              <figure class="fig">
                <svg class="fig-heat" viewBox="0 0 {ravineFig.W} {ravineFig.H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                  <defs>
                    <clipPath id="ravine-clip"><rect x="0" y="0" width={ravineFig.W} height={ravineFig.H} /></clipPath>
                    <clipPath id="ravine-contour-clip"><rect x="1.5" y="1.5" width={ravineFig.W - 3} height={ravineFig.H - 3} /></clipPath>
                  </defs>
                  <g clip-path="url(#ravine-clip)">
                    <image href={ravineFig.heatURL} x="0" y="0" width={ravineFig.W} height={ravineFig.H} preserveAspectRatio="none" />
                    <g clip-path="url(#ravine-contour-clip)">
                      <g transform="scale({ravineFig.W / ravineFig.gw}, {ravineFig.H / ravineFig.gh})">
                        {#each ravineFig.contourPaths as cp}
                          <path d={cp.d} fill="none" stroke="#fff" stroke-opacity={cp.o} stroke-width="1" vector-effect="non-scaling-stroke" />
                        {/each}
                      </g>
                    </g>
                    <circle cx={ravineFig.min.x} cy={ravineFig.min.y} r="5" fill="none" stroke="#10b981" stroke-width="1.6" stroke-dasharray="3,2.5" />
                    <path d={ravineFig.gd} fill="none" stroke="#e2e8f0" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" />
                    <path d={ravineFig.mom} fill="none" stroke="#d8b4fe" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
                    {#each ravineFig.gdPts as p}<circle cx={p.x} cy={p.y} r="1.6" fill="#f1f5f9" />{/each}
                    {#each ravineFig.momPts as p}<circle cx={p.x} cy={p.y} r="1.9" fill="#e9d5ff" />{/each}
                    <circle cx={ravineFig.start.x} cy={ravineFig.start.y} r="4.2" fill="#f59e0b" stroke="#fff" stroke-width="1.3" />
                    <g transform="translate(11,12)">
                      <rect x="-5" y="-9" width="152" height="33" rx="5" fill="#0a1218" opacity="0.4" />
                      <line x1="2" y1="0" x2="17" y2="0" stroke="#e2e8f0" stroke-width="2.5" />
                      <text x="22" y="3.5" class="fig-svg-label" style="text-anchor:start;fill:#fff">plain GD — zig-zags</text>
                      <line x1="2" y1="15" x2="17" y2="15" stroke="#d8b4fe" stroke-width="2.5" />
                      <text x="22" y="18.5" class="fig-svg-label" style="text-anchor:start;fill:#fff">momentum — glides</text>
                    </g>
                  </g>
                </svg>
                <figcaption class="fig-cap">
                  The ravine: a valley far steeper across than along. One safe step size makes plain GD
                  (grey) rattle wall to wall while it crawls along the floor; momentum (violet) builds
                  speed down the valley and glides to the minimum.
                </figcaption>
              </figure>
              <p>
                Every fix that follows is a leaf on one tree. Here is the whole lineage at a glance —
                170 years from Cauchy’s root to today’s canopy, each branch running parent → child:
              </p>
              <figure class="fig fig-tree">
                <svg viewBox="0 0 {familyTree.W} {familyTree.H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                  <defs>
                    {#each familyTree.edges as e, i}
                      <linearGradient id="tree-edge-{i}" gradientUnits="userSpaceOnUse" x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}>
                        <stop offset="0%" stop-color={e.c0} />
                        <stop offset="100%" stop-color={e.c1} />
                      </linearGradient>
                    {/each}
                  </defs>
                  {#each familyTree.merges as m}
                    <path d={m.d} class="tree-merge" />
                  {/each}
                  {#each familyTree.edges as e, i}
                    <path d={e.d} class="tree-branch" stroke="url(#tree-edge-{i})" stroke-width={e.w} />
                  {/each}
                  {#each familyTree.nodes as n (n.id)}
                    <g transform="translate({n.x.toFixed(1)},{n.y.toFixed(1)})">
                      <circle r={n.root ? 6.5 : 5} fill={n.color} stroke="#fff" stroke-width="1.4" />
                      <text class="tree-label" x="0" y="-10">{n.name}</text>
                    </g>
                  {/each}
                </svg>
                <figcaption class="fig-cap">
                  Every leaf is an optimizer in the picker; branches run parent → child, and the dashed
                  violet strand marks where momentum and the adaptive line merge into Adam. Colours match
                  the race below, and new methods join the canopy as the field grows.
                </figcaption>
              </figure>
              <p>
                Here they are racing on the same ravine from the same start — every one running its
                real update rule, the dots arriving in their true step counts. Click a name to add or
                remove it; hover one to pick it out of the pack:
              </p>

              <figure class="race-demo">
                <div class="race-player">
                  <button type="button" class="race-pbtn" on:click={toggleRacePlay} aria-label={racePlaying ? 'Pause race' : 'Play race'} title={racePlaying ? 'Pause' : 'Play'}>
                    {#if racePlaying}<Pause size={14} strokeWidth={2.5} />{:else}<Play size={14} strokeWidth={2.5} />{/if}
                  </button>
                  <button type="button" class="race-pbtn" on:click={resetRace} aria-label="Restart race" title="Restart">
                    <RotateCcw size={14} strokeWidth={2.5} />
                  </button>
                </div>
                <svg bind:this={raceSvg} viewBox="0 0 {RACE_W} {RACE_H}" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <clipPath id="race-clip"><rect x="0" y="0" width={RACE_W} height={RACE_H} /></clipPath>
                    <!-- Contours close along the grid edge; clip them a hair inside
                         the frame so those boundary segments don't draw a white box. -->
                    <clipPath id="race-contour-clip"><rect x="1.5" y="1.5" width={RACE_W - 3} height={RACE_H - 3} /></clipPath>
                  </defs>
                  <g clip-path="url(#race-clip)">
                    <image href={raceDemo.heatURL} x="0" y="0" width={RACE_W} height={RACE_H} preserveAspectRatio="none" />
                    <g clip-path="url(#race-contour-clip)">
                      <g transform="scale({RACE_W / raceDemo.gw}, {RACE_H / raceDemo.gh})">
                        {#each raceDemo.contourPaths as cp}
                          <path d={cp.d} fill="none" stroke="#fff" stroke-opacity={cp.o} stroke-width="1" vector-effect="non-scaling-stroke" />
                        {/each}
                      </g>
                    </g>
                    {#each raceDemo.racers as r (r.id)}
                      {@const hot = raceHover === r.id}
                      {@const dim = raceHover !== null && !hot}
                      <path d={r.d} fill="none" stroke={r.color} stroke-width={hot ? 3 : 1.7} stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" opacity={hot ? 1 : !raceOn[r.id] ? 0 : dim ? 0.13 : 0.9} style="transition: opacity 0.15s ease, stroke-width 0.15s ease;">
                        <animate attributeName="stroke-dashoffset" values="100;0;0" keyTimes="0;{r.frac};1" dur="7s" repeatCount="indefinite" />
                      </path>
                    {/each}
                    <circle cx={raceDemo.min[0]} cy={raceDemo.min[1]} r="7" fill="none" stroke="#10b981" stroke-width="1.5" stroke-dasharray="3,2.5" />
                    <circle cx={raceDemo.start[0]} cy={raceDemo.start[1]} r="8" fill="none" stroke="#f59e0b" stroke-width="1.75" opacity="0.9" />
                    <circle cx={raceDemo.start[0]} cy={raceDemo.start[1]} r="4.5" fill="#f59e0b" stroke="#fff" stroke-width="1.5" />
                    {#each raceDemo.racers as r (r.id)}
                      {@const hot = raceHover === r.id}
                      {@const dim = raceHover !== null && !hot}
                      <circle r={hot ? 4.6 : 3.2} fill={r.color} stroke="#fff" stroke-width="1.25" opacity={hot ? 1 : !raceOn[r.id] ? 0 : dim ? 0.13 : 1} style="transition: opacity 0.15s ease;">
                        <animateMotion path={r.d} keyPoints="0;1;1" keyTimes="0;{r.frac};1" calcMode="linear" dur="7s" repeatCount="indefinite" />
                      </circle>
                    {/each}
                  </g>
                </svg>
                <div class="race-legend">
                  {#each raceDemo.racers as r (r.id)}
                    <button
                      type="button"
                      class="race-chip"
                      class:off={!raceOn[r.id]}
                      class:hot={raceHover === r.id}
                      on:click={() => toggleRacer(r.id)}
                      on:mouseenter={() => (raceHover = r.id)}
                      on:mouseleave={() => (raceHover = null)}
                      on:focus={() => (raceHover = r.id)}
                      on:blur={() => (raceHover = null)}
                    >
                      <span class="race-swatch" style="--sw:{r.color}"></span>
                      <span class="race-cname">{r.name}</span>
                      <span class="race-steps">{r.steps}{r.converged ? '' : '+'}</span>
                    </button>
                  {/each}
                </div>
                <figcaption class="race-caption">
                  All {raceDemo.racers.length} optimizers, same start, same ravine — each running its real
                  update rule, the dots arriving in their true step counts. Click a name to toggle it,
                  hover to spotlight one. Watch the contrasts: Newton nearly teleports, GD rattles wall to
                  wall, Momentum glides past it, and RAdam’s self-warmup keeps it cautious to the end. Use
                  the play / restart controls to watch it again.
                </figcaption>
              </figure>

              {#each optTree as c (c.name)}
                {#if c.name === 'Lion'}
                  <p class="opt-lead">
                    Adam looked like the destination. It wasn’t — past it the trunk
                    <strong>forks</strong>, and each later method keeps most of Adam (or throws it
                    out) to rethink one piece. These are the branches the field is still walking.
                  </p>
                {/if}
                {#if c.act}
                  <div class="opt-act"><span class="act-no">{c.act.no}</span><span class="act-title">{c.act.title}</span></div>
                  {#if c.act.intro}<p class="opt-act-intro">{@html c.act.intro}</p>{/if}
                {/if}
                {#if c.lead}<p class="opt-lead">{@html c.lead}</p>{/if}
                {@const cite = OPT_CITE[c.name]}
                {@const authors = cite?.people ?? (cite?.person ? [{ name: cite.person, img: cite.img, credit: cite.credit }] : [])}
                <div class="opt-card" class:prereq-card={c.prereq}>
                  <div class="opt-top">
                    <div class="opt-head">
                      <span class="opt-year">{c.year}</span>
                      <span class="opt-name">{c.name}</span>
                      <span class="opt-by">{c.by}</span>
                    </div>
                    {#if authors.length}
                      <div class="opt-portraits" class:multi={authors.length > 1}>
                        {#each authors as a (a.name)}
                          <div class="opt-portrait" title={a.credit ? `${a.name} · ${a.credit}` : a.name}>
                            <span class="opt-portrait-ph" aria-hidden="true">{initials(a.name)}</span>
                            {#if a.img}
                              <img class="opt-portrait-img" src={a.img} alt={a.name} loading="lazy" on:error={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                  <p class="opt-idea">{@html mathText(c.idea)}</p>
                  <div class="opt-formula-tag">{c.prereq ? 'the tool, in symbols' : 'the same idea, in symbols'}</div>
                  <div class="opt-formula">{@html tex(c.formula)}</div>
                  {#if c.fix || c.brk}
                    <div class="opt-foot">
                      {#if c.fix}<span class="opt-fix">✓ {@html mathText(c.fix)}</span>{/if}
                      {#if c.brk}<span class="opt-break">✗ {@html mathText(c.brk)}</span>{/if}
                    </div>
                  {/if}
                  {#if cite?.wiki || cite?.paper}
                    <div class="opt-cite">
                      {#if authors.length}<span class="opt-cite-who">{authors.map(a => a.name).join(', ')}</span>{/if}
                      {#if cite.wiki}
                        <a class="opt-cite-link" href={cite.wiki} target="_blank" rel="noopener noreferrer">
                          <BookOpen size={11} strokeWidth={2.2} /> Wikipedia
                        </a>
                      {/if}
                      {#if cite.paper}
                        <a class="opt-cite-link" href={cite.paper} target="_blank" rel="noopener noreferrer">
                          <FileText size={11} strokeWidth={2.2} /> {cite.cite ?? 'Paper'}
                        </a>
                      {/if}
                    </div>
                  {/if}
                </div>
                {#if c.name === 'Nesterov'}
                  <p class="aside">
                    Feel Act II yourself: pick <strong>Gaussian Peak</strong> with {@html tex(String.raw`\mu = 0`)} — far from
                    the peak the gradient is so faint the marker stalls. Crank {@html tex(String.raw`\mu`)} to 0.9 and watch it
                    power through. Remember the marker arrows from Part II: blue is raw steepest
                    descent, red is the step actually taken — here the gap is momentum at work.
                  </p>
                {/if}
                {#if c.name === 'Newton'}
                  <p class="aside">
                    Turn on the <strong>curvature lens</strong> (the hexagon button on the Loss &amp;
                    Gradient panel) to see Newton’s violet ghost arrow — that is exactly the step it
                    takes. Pick a clean bowl like <strong>Linear Regression</strong>, drop the marker
                    anywhere, and Newton snaps to the bottom almost at once; then try a saddle from
                    the Classic surfaces and watch it give up the jump and crawl.
                  </p>
                {/if}
                {#if c.name === 'Lion'}
                  <p class="aside">
                    Pick <strong>Lion</strong> and watch the marker move in equal-size hops, the
                    same stride on a cliff or a flat — every other method takes smaller steps as it
                    nears the bottom; Lion can’t. So it circles the minimum in a fixed ring instead
                    of homing in — exactly the case the scheduling chapter built on: bleed {@html tex(String.raw`\gamma`)} to zero
                    and the ring closes to a point.
                  </p>
                {/if}
              {/each}

              <div class="opt-frontier">
                <div class="opt-frontier-title">The frontier — and why it isn’t in the picker</div>
                <p>
                  The optimizers winning 2025’s biggest training runs — <strong>Muon</strong> (used
                  to train Kimi K2 and GLM), <strong>Shampoo</strong>, and <strong>SOAP</strong> —
                  share a trick this playground can’t show. They treat a layer’s weights as a
                  <em>matrix</em> and precondition <em>across</em> it: Muon (<em>momentum
                  orthogonalized by Newton–Schulz</em>) straightens the momentum matrix, Shampoo and
                  SOAP whiten it. With only two independent numbers,
                  α and β, there is no matrix to exploit — strip the structure away and they collapse
                  to methods already in the list. That matrix structure is exactly why they scale to
                  billions of parameters, and exactly why a two-parameter sandbox is the wrong stage
                  for them. To meet them you have to leave the playground — which is a fair note to
                  end the tree on.
                </p>
              </div>

              {#if raceExperiment}
                <div class="opt-cta">
                  <span>Now run the real thing:</span>
                  <button class="try-btn" on:click={() => runExperiment(raceExperiment)}>
                    <Play size={13} strokeWidth={2.5} /><span>Race them on Rosenbrock</span>
                  </button>
                </div>
              {/if}
            </section>

            <!-- ============== 9 · THE PROBLEMS ============== -->
            <section data-ch="ch-problems" id="ch-problems">
              <div class="part-label">Part IV · The zoo</div>
              <h3><svelte:component this={chIcon['ch-problems']} size={18} strokeWidth={2} /> The 22 landscapes</h3>
              <p>
                Every problem has the same two parameters (α, β) and a loss surface you can see live —
                but each surface tells a different story, from a single clean bowl to four-way ties
                and exploding cliffs. Each ships with a curated default learning rate, momentum, and
                view.
              </p>

              {#each Object.entries(problems) as [groupName, list]}
                <div class="problem-group-label">{groupName}</div>
                <div class="problem-grid">
                  {#each list as p}
                    <div class="problem-card">
                      <div class="problem-icon">
                        {#if p.customIcon}<span class="custom-icon">{p.customIcon}</span>
                        {:else if p.icon}<svelte:component this={p.icon} size={18} strokeWidth={2} />{/if}
                      </div>
                      <div class="problem-text">
                        <div class="problem-name">{p.name}</div>
                        <div class="problem-formula">{p.formula}</div>
                        <div class="problem-tag">{p.tag}</div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/each}
            </section>

            <!-- ============== 10 · EXPERIMENTS ============== -->
            <section data-ch="ch-experiments" id="ch-experiments">
              <h3><svelte:component this={chIcon['ch-experiments']} size={18} strokeWidth={2} /> Things to try</h3>
              <p>Each card is a ready-made scenario — one click sets everything up, starts training, and tells you what to watch for.</p>
              {#each experiments as exp (exp.id)}
                <div class="experiment">
                  <div class="experiment-text">
                    <h4>{exp.title}</h4>
                    <p>{exp.blurb}</p>
                  </div>
                  <button class="try-btn" on:click={() => runExperiment(exp)}>
                    <Play size={13} strokeWidth={2.5} /><span>Try it</span>
                  </button>
                </div>
              {/each}
            </section>

            <!-- ============== 11 · READING THE PANELS ============== -->
            <section data-ch="ch-panels" id="ch-panels">
              <div class="part-label">Reference</div>
              <h3><svelte:component this={chIcon['ch-panels']} size={18} strokeWidth={2} /> Reading the panels</h3>
              <ul class="viz-list">
                <li><strong>Data plot</strong> — the data points and the current model. For curve fits, blue solid is the current fit and green dashed is the truth. For 2D problems, the orange marker shows your parameters directly on the plot.</li>
                <li><strong>Loss &amp; Gradient</strong> — the landscape from Chapter 2: bright = low loss, white contours join equal-loss points, and the field arrows are −∇ℒ. On the marker, the <span class="ink-blue">blue arrow</span> is steepest descent and the <span class="ink-red">red arrow</span> is the step actually taken (Chapters 3–4). Drag the marker to teleport.</li>
                <li><strong>Loss History</strong> — train and test loss versus step. A clean decline is healthy; spikes mean you’re overshooting (too much γ or μ); a persistent train/test gap hints at overfitting.</li>
              </ul>
            </section>

            <!-- ============== 12 · KEYBOARD ============== -->
            <section data-ch="ch-keys" id="ch-keys">
              <h3><svelte:component this={chIcon['ch-keys']} size={18} strokeWidth={2} /> Keyboard</h3>
              <div class="kbd-row">
                <span class="kbd-item"><kbd>Space</kbd> Train / Pause</span>
                <span class="kbd-item"><kbd>S</kbd> Step</span>
                <span class="kbd-item"><kbd>R</kbd> Reset</span>
                <span class="kbd-item"><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> Nudge marker <span class="kbd-note">(⇧ = bigger)</span></span>
                <span class="kbd-item"><kbd>D</kbd> 2D / 3D</span>
              </div>
              <div class="end-mark">∂</div>
            </section>
          </div>
        </div>
      </div>

      <footer class="modal-footer">
        <p>Built with ∂ by <strong>Neo Mohsenvand</strong></p>
        <a class="github-link" href="https://github.com/NeoVand/GradientDescent" target="_blank" rel="noopener noreferrer" aria-label="View source on GitHub">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
          <span>GitHub</span>
        </a>
      </footer>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 2rem;
    animation: fadeIn 0.2s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .modal-content {
    background: var(--color-bg-secondary);
    border-radius: 16px;
    width: 100%;
    max-width: 1040px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.4);
    animation: slideUp 0.3s ease;
    overflow: hidden;
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ---------- Header ---------- */
  .modal-header {
    padding: 0.62rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .modal-title { display: flex; align-items: center; gap: 0.65rem; }
  .modal-icon {
    font-family: 'Times New Roman', 'Georgia', serif;
    font-size: 1.6rem;
    font-style: italic;
    color: #10b981;
    line-height: 1;
  }
  .modal-header h2 {
    margin: 0;
    font-size: 1.18rem;
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.01em;
  }
  .book-tag {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #10b981;
    background: rgba(16, 185, 129, 0.1);
    border-radius: 5px;
    padding: 0.18rem 0.45rem;
    margin-left: 0.1rem;
  }
  .close-btn {
    width: 38px; height: 38px;
    flex-shrink: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    transition: background 0.18s, color 0.18s, transform 0.1s;
  }
  /* flex-shrink:0 is the fix — without it the icon collapsed to a 4px sliver
     (the "tiny cross"). 24px stroke, plain neutral colour, no box. */
  .close-btn :global(svg) { width: 24px; height: 24px; flex-shrink: 0; }
  .close-btn:hover { background: var(--color-bg-tertiary); color: var(--color-text-primary); }
  .close-btn:active { transform: scale(0.94); }

  /* ---------- Reading-progress bar ---------- */
  .reading-progress {
    height: 2px;
    background: var(--color-bg-tertiary);
    flex-shrink: 0;
  }
  .reading-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #10b981, #34d399);
    transform-origin: left;
    transform: scaleX(0);
    transition: transform 0.08s linear;
  }

  /* ---------- Two-pane shell ---------- */
  .reading-shell {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  /* ---------- TOC rail ---------- */
  .toc {
    flex: 0 0 224px;
    border-right: 1px solid var(--color-border);
    overflow-y: auto;
    padding: 1.1rem 0.65rem 1.5rem;
    /* Light mode: a soft mint rail, not a dingy grey overlay. Dark mode keeps
       a gentle darkening (below) since the rail sits on a near-black panel. */
    background: rgba(16, 185, 129, 0.06);
  }
  :global([data-theme='dark']) .toc { background: rgba(0, 0, 0, 0.14); }
  /* WebKit (Chrome/Safari): a slim, themed bar that only paints its thumb
     while the rail is being scrolled (or hovered, so it can still be grabbed).
     NB: setting the standard scrollbar-width/-color here would make Chrome
     ignore these pseudo rules, so Firefox is handled separately below. */
  .toc::-webkit-scrollbar { width: 6px; }
  .toc::-webkit-scrollbar-track { background: transparent; }
  .toc::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 3px;
    transition: background 0.25s ease;
  }
  .toc.scrolling::-webkit-scrollbar-thumb,
  .toc:hover::-webkit-scrollbar-thumb {
    background: rgba(16, 185, 129, 0.32);
  }
  .toc.scrolling::-webkit-scrollbar-thumb:hover,
  .toc:hover::-webkit-scrollbar-thumb:hover {
    background: rgba(16, 185, 129, 0.5);
  }
  /* Firefox has no ::-webkit-scrollbar; give it the same hidden-until-scrolling
     treatment via the standard properties (scoped so Chrome keeps the rules above). */
  @supports not selector(::-webkit-scrollbar) {
    .toc { scrollbar-width: thin; scrollbar-color: transparent transparent; }
    .toc.scrolling, .toc:hover { scrollbar-color: rgba(16, 185, 129, 0.4) transparent; }
  }
  .toc nav { display: flex; flex-direction: column; gap: 1px; }
  .toc-part {
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--color-text-tertiary);
    padding: 0.9rem 0.7rem 0.35rem;
  }
  .toc-part:first-child { padding-top: 0.2rem; }
  .toc-item {
    display: flex;
    align-items: center;
    justify-content: flex-start; /* not the global button's centering — keep every row left-aligned */
    gap: 0.6rem;
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    border-radius: 8px;
    padding: 0.4rem 0.6rem;
    cursor: pointer;
    color: var(--color-text-secondary);
    transition: background 0.15s, color 0.15s;
  }
  .toc-item:hover { background: var(--color-bg-tertiary); color: var(--color-text-primary); }
  .toc-item.active { background: rgba(16, 185, 129, 0.12); color: var(--color-text-primary); }
  .toc-ic {
    flex-shrink: 0;
    width: 1.35rem; height: 1.35rem;
    display: inline-flex; align-items: center; justify-content: center;
    color: #10b981; /* same green the chapter icons use in the text */
  }
  .toc-ic :global(svg) { width: 16px; height: 16px; flex-shrink: 0; }
  .toc-title { font-size: 0.82rem; font-weight: 500; line-height: 1.25; }

  /* ---------- Reading column ---------- */
  .modal-body {
    flex: 1;
    overflow-y: auto;
    min-width: 0;
    scroll-behavior: smooth;
  }
  .modal-body::-webkit-scrollbar { width: 9px; }
  .modal-body::-webkit-scrollbar-track { background: var(--color-bg-secondary); }
  .modal-body::-webkit-scrollbar-thumb { background: rgba(16, 185, 129, 0.28); border-radius: 5px; }
  .modal-body::-webkit-scrollbar-thumb:hover { background: rgba(16, 185, 129, 0.5); }
  .reading-column {
    max-width: 760px;
    margin: 0 auto;
    padding: 1.9rem 2.5rem 3rem;
  }

  /* ---------- Cover ---------- */
  .hero {
    position: relative;
    border-radius: 14px;
    overflow: hidden;
    margin-bottom: 2.25rem;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
  }
  .hero-svg { display: block; width: 100%; height: 188px; }
  .contour { fill: none; stroke: #10b981; stroke-width: 1.4; }
  .hero-text { position: absolute; top: 18px; left: 24px; right: 24px; pointer-events: none; }
  .hero-eyebrow {
    font-size: 0.72rem;
    color: var(--color-text-tertiary);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 5px;
  }
  .hero-title {
    font-size: 1.7rem;
    font-weight: 700;
    color: var(--color-text-primary);
    line-height: 1.15;
    letter-spacing: -0.015em;
    margin-bottom: 7px;
  }
  .hero-subtitle {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    font-weight: 500;
    max-width: 30ch;
    line-height: 1.4;
  }

  /* ---------- Sections & typographic scale ---------- */
  section { margin-bottom: 2.75rem; scroll-margin-top: 0.5rem; }
  section:last-of-type { margin-bottom: 1rem; }

  .part-label {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: #10b981;
    margin-bottom: 0.85rem;
  }

  h3 {
    margin: 0 0 1rem 0;
    font-size: 1.45rem;
    font-weight: 700;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: 0.6rem;
    letter-spacing: -0.015em;
    line-height: 1.2;
  }
  h3 :global(svg) { color: #10b981; flex-shrink: 0; }

  h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  p {
    margin: 0 0 1rem 0;
    font-size: 1.0rem;
    line-height: 1.72;
    color: var(--color-text-secondary);
  }
  p:last-child { margin-bottom: 0; }
  p strong { color: var(--color-text-primary); font-weight: 600; }

  .look {
    font-size: 0.9rem;
    color: var(--color-text-tertiary);
    border-left: 2px solid var(--color-border);
    padding-left: 0.85rem;
    font-style: italic;
  }

  ul { margin: 0.5rem 0 1rem 0; padding-left: 1.4rem; }
  li { margin: 0.5rem 0; font-size: 1.0rem; line-height: 1.6; color: var(--color-text-secondary); }
  li strong { color: var(--color-text-primary); }

  em.g { font-family: Georgia, serif; font-style: italic; color: #10b981; font-weight: 500; }
  .ink-blue { color: #3b82f6; font-weight: 600; }
  .ink-red { color: #ef4444; font-weight: 600; }

  /* ---------- Recipe blockquote ---------- */
  .recipe {
    margin: 0 0 1rem 0;
    padding: 0.85rem 1.1rem;
    border-left: 2px solid var(--color-border);
    background: var(--color-bg-tertiary);
    border-radius: 0 8px 8px 0;
    font-size: 1.0rem;
    line-height: 1.65;
    color: var(--color-text-secondary);
  }
  .recipe strong { color: var(--color-text-primary); }

  /* ---------- Go deeper ---------- */
  /* ---------- Schedule preview cards ---------- */
  .schedule-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
    margin: 1.15rem 0 1.5rem;
  }
  .schedule-card {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-tertiary);
    padding: 0.45rem 0.5rem 0.55rem;
  }
  .schedule-card svg { display: block; width: 100%; height: auto; }
  .sch-axis { stroke: var(--color-border); stroke-width: 1; }
  .sch-curve { stroke: #10b981; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .schedule-name {
    font-size: 0.76rem;
    font-weight: 700;
    color: var(--color-text-primary);
    margin-top: 0.3rem;
  }
  .schedule-desc {
    font-size: 0.66rem;
    line-height: 1.35;
    color: var(--color-text-tertiary);
    margin-top: 0.1rem;
  }
  @media (max-width: 560px) { .schedule-grid { grid-template-columns: repeat(2, 1fr); } }

  /* ---------- Concept blocks ---------- */
  .concept {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 190px;
    gap: 1.25rem;
    align-items: center;
    padding: 1rem 1.25rem;
    background: var(--color-bg-tertiary);
    border-radius: 12px;
    border: 1px solid var(--color-border);
    margin: 1.25rem 0;
  }
  .concept-text { min-width: 0; }
  .concept-text h4 { color: #10b981; margin-bottom: 0.5rem; font-size: 1rem; }
  .concept-text p { font-size: 0.9rem; margin-bottom: 0; }
  .concept-svg { width: 100%; height: 120px; color: var(--color-text-tertiary); }
  .concept :global(.caption) { fill: var(--color-text-tertiary); font-size: 11px; font-family: inherit; }

  .concept-bg-overlay {
    display: grid;
    grid-template-columns: 1fr 52%;
    position: relative;
    padding: 0;
    overflow: hidden;
  }
  .concept-bg-svg { position: absolute; inset: 0; width: 100%; height: 100%; color: var(--color-text-secondary); pointer-events: none; }
  .concept-fade {
    position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(to right, transparent 0%, transparent 33%, var(--color-bg-tertiary) 50%, var(--color-bg-tertiary) 100%);
  }
  .concept-text-overlay { grid-column: 2; position: relative; padding: 1.1rem 1.35rem; z-index: 1; align-self: center; }
  .concept-text-overlay h4 { margin-top: 0; }
  .concept-text-overlay p { margin-bottom: 0.6rem; }
  .concept-text-overlay p:last-child { margin-bottom: 0; }

  /* ---------- Inline teaching figures ---------- */
  .fig { margin: 1.6rem 0; }
  .fig > svg,
  .fig-triptych {
    display: block;
    width: 100%;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 12px;
  }
  .fig > svg { padding: 0.4rem; }
  .fig-triptych {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0;
  }
  .fig-cell { padding: 0.7rem 0.4rem 0.85rem; text-align: center; border-right: 1px solid var(--color-border); }
  .fig-cell:last-child { border-right: none; }
  .fig-cell svg { display: block; width: 100%; height: auto; }
  .fig-cell-label { font-size: 0.8rem; font-weight: 700; margin-top: 0.3rem; }
  .fig-cell-sub { font-size: 0.72rem; color: var(--color-text-tertiary); margin-top: 0.1rem; }
  .fig :global(.fig-contour) { fill: none; stroke: #10b981; stroke-width: 1; }
  .fig :global(.fig-svg-label) {
    fill: var(--color-text-secondary); font-size: 11px; font-weight: 600;
    text-anchor: middle; font-family: inherit;
  }
  .fig-cap {
    font-size: 0.8rem; line-height: 1.55; text-align: center;
    color: var(--color-text-tertiary); margin: 0.6rem auto 0; max-width: 56ch;
  }
  /* The optimizer family tree */
  .fig-tree > svg { padding: 0.3rem 0.4rem; }
  .tree-branch { fill: none; stroke-linecap: round; stroke-opacity: 0.85; }
  .tree-merge { fill: none; stroke: #a855f7; stroke-width: 1.3; stroke-dasharray: 3,3; stroke-opacity: 0.5; }
  .tree-label { font-size: 10.5px; font-weight: 600; font-family: inherit; fill: var(--color-text-secondary); text-anchor: middle; }
  /* Live 3-D gradient bowl */
  .fig-3d {
    position: relative; width: 100%; height: 300px;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    overflow: hidden;
  }
  .fig-3d-legend {
    position: absolute; top: 11px; left: 13px;
    display: flex; flex-direction: column; gap: 4px;
    font-size: 0.78rem; color: var(--color-text-secondary);
    pointer-events: none;
  }
  .fig-3d-legend > span { display: inline-flex; align-items: center; gap: 6px; }
  .leg-sw { width: 11px; height: 3px; border-radius: 2px; display: inline-block; }
  .leg-amber { background: #f59e0b; }
  .leg-emerald { background: #34d399; }
  .fig-3d-hint {
    position: absolute; bottom: 9px; right: 13px;
    font-size: 0.7rem; color: var(--color-text-tertiary);
    pointer-events: none; opacity: 0.7;
  }

  /* ---------- Proof callout (the steepest-descent argument) ---------- */
  .proof {
    margin: 1.6rem 0;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-bg-tertiary);
    padding: 1rem 1.2rem;
  }
  .proof-title {
    font-size: 0.7rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--color-text-secondary); margin-bottom: 0.7rem;
  }
  .proof-p { font-size: 0.88rem; line-height: 1.65; margin: 0 0 0.7rem; }
  .proof :global(.formula-display) { margin: 0.6rem 0; }
  .proof-fig { margin: 0.7rem 0 0.5rem; }
  .proof-fig svg { display: block; width: 100%; height: auto; }
  .proof-lbl { font-size: 10.5px; font-weight: 600; font-family: inherit; text-anchor: middle; }
  .proof-figcap { font-size: 0.74rem; line-height: 1.5; text-align: center; color: var(--color-text-tertiary); margin-top: 0.45rem; }
  .proof-qed { color: #10b981; font-weight: 700; margin-left: 0.15rem; }

  /* ---------- Formulas ---------- */
  .formula-display {
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.22);
    border-radius: 8px;
    padding: 0.6rem 1rem;
    margin: 0.75rem 0;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .formula-display.center { text-align: center; }
  .formula-display :global(.katex) { color: var(--color-text-primary); }

  /* Wide formulas may scroll sideways; keep the scrollbar thin and themed,
     and never let overflow-x:auto spawn a stray vertical scrollbar. */
  .formula-display::-webkit-scrollbar,
  .opt-formula::-webkit-scrollbar { height: 5px; }
  .formula-display::-webkit-scrollbar-thumb,
  .opt-formula::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 3px; }
  .formula-display::-webkit-scrollbar-track,
  .opt-formula::-webkit-scrollbar-track { background: transparent; }

  /* ---------- Knob bullets ---------- */
  .knob-bullets { padding-left: 0; list-style: none; }
  .knob-bullets li {
    position: relative;
    padding-left: 1.1rem;
    font-size: 0.95rem;
  }
  .knob-bullets li::before {
    content: '';
    position: absolute;
    left: 0; top: 0.65em;
    width: 5px; height: 5px;
    border-radius: 50%;
    background: #10b981;
  }

  /* ---------- The optimizer story ---------- */
  .race-demo {
    position: relative;
    margin: 1.25rem 0 1.5rem;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    overflow: hidden;
    background: var(--color-bg-primary);
  }
  .race-demo svg { width: 100%; display: block; }

  /* Minimal play / pause / restart player, floated over the race corner. */
  .race-player {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    display: flex;
    gap: 0.3rem;
    z-index: 2;
  }
  .race-pbtn {
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 7px;
    background: rgba(10, 14, 20, 0.55);
    color: #e2e8f0;
    cursor: pointer;
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
  }
  .race-pbtn:hover { background: rgba(16, 185, 129, 0.28); border-color: rgba(16, 185, 129, 0.6); color: #fff; }
  .race-pbtn:active { transform: scale(0.92); }
  .race-legend {
    display: flex; justify-content: center; gap: 0.3rem 0.4rem; flex-wrap: wrap;
    padding: 0.7rem 0.6rem 0.1rem;
  }
  /* Each legend entry is a toggle: click to turn a racer on/off, hover to
     spotlight it. Off chips read as muted outlines so the lit set stands out. */
  .race-chip {
    display: inline-flex; align-items: center; gap: 0.32rem;
    padding: 0.2rem 0.5rem;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.6875rem; font-weight: 600;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, opacity 0.15s ease;
  }
  .race-chip:hover, .race-chip.hot { background: rgba(127, 127, 127, 0.14); color: var(--color-text-primary); }
  .race-chip.off { opacity: 0.42; }
  .race-chip.off:hover { opacity: 0.7; }
  .race-chip .race-steps {
    font-size: 0.625rem; opacity: 0.6; font-variant-numeric: tabular-nums;
  }
  .race-swatch {
    width: 9px; height: 9px; border-radius: 50%; display: inline-block;
    background: var(--sw); border: 1.5px solid var(--sw);
    box-sizing: border-box;
    transition: background 0.15s ease;
  }
  /* Off: hollow ring in the racer's colour, so you still know which is which. */
  .race-chip.off .race-swatch { background: transparent; }
  .race-caption {
    font-size: 0.78rem;
    color: var(--color-text-tertiary);
    text-align: center;
    margin-top: 0.4rem;
    line-height: 1.5;
    padding: 0 1rem 0.7rem;
  }

  .opt-act {
    display: flex; align-items: baseline; gap: 0.5rem;
    margin: 1.7rem 0 0.6rem;
  }
  .act-no {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.625rem; font-weight: 800;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: #f59e0b;
  }
  .act-title { font-weight: 700; font-size: 0.95rem; color: var(--color-text-primary); }
  .opt-act-intro {
    margin: 0 0 0.75rem;
    color: var(--color-text-secondary);
    font-size: 0.92rem;
    line-height: 1.65;
  }
  .opt-act-intro :global(em) { color: var(--color-text-primary); font-style: italic; }
  .opt-act-intro :global(strong) { color: var(--color-text-primary); font-weight: 650; }

  .opt-card {
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-bg-primary);
    padding: 0.8rem 0.95rem 0.7rem;
    margin-bottom: 0.65rem;
  }
  .opt-card.prereq-card { border-style: dashed; }
  /* Head row + inventor portrait sit side by side; the portrait holds the top
     right corner of each card. */
  .opt-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.85rem; }
  .opt-head { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.3rem; }
  /* One author, or a small facepile for co-authored methods (AdaGrad, Adam, AdamW). */
  .opt-portraits { display: flex; flex-shrink: 0; }
  .opt-portraits.multi .opt-portrait { width: 44px; height: 44px; }
  .opt-portraits.multi .opt-portrait:not(:first-child) { margin-left: -16px; }
  .opt-portraits.multi .opt-portrait-ph,
  .opt-portraits.multi .opt-portrait-img { box-shadow: 0 0 0 2px var(--color-bg-primary); }
  .opt-portrait {
    flex-shrink: 0;
    position: relative;
    width: 50px; height: 50px;
  }
  .opt-portrait-ph {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
    background: rgba(16, 185, 129, 0.12);
    color: #10b981;
    font-family: 'SF Mono', Monaco, monospace;
    font-weight: 700; font-size: 0.95rem;
    border: 1px solid var(--color-border);
  }
  .opt-portrait-img {
    position: absolute; inset: 0; z-index: 1;
    width: 100%; height: 100%;
    object-fit: cover;
    object-position: center top; /* portraits frame the head near the top */
    border-radius: 50%;
    border: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
  }
  /* Citation footer: who + Wikipedia + paper, on a hairline rule. */
  .opt-cite {
    display: flex; align-items: center; gap: 0.4rem 0.9rem; flex-wrap: wrap;
    margin-top: 0.6rem; padding-top: 0.5rem;
    border-top: 1px solid var(--color-border);
  }
  .opt-cite-who { font-size: 0.72rem; color: var(--color-text-tertiary); font-style: italic; margin-right: auto; }
  .opt-cite-link {
    display: inline-flex; align-items: center; gap: 0.3rem;
    font-size: 0.72rem; font-weight: 600;
    color: var(--color-text-secondary);
    text-decoration: none;
    transition: color 0.15s ease;
  }
  .opt-cite-link:hover { color: #10b981; }
  .opt-cite-link :global(svg) { opacity: 0.75; }
  /* Per-chapter "Further reading" row — same link styling as a card citation. */
  .ch-refs {
    display: flex; align-items: baseline; gap: 0.4rem 0.9rem; flex-wrap: wrap;
    margin-top: 1.6rem; padding-top: 0.6rem;
    border-top: 1px solid var(--color-border);
  }
  .ch-refs-label {
    font-size: 0.625rem; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--color-text-tertiary);
  }
  .opt-year {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.625rem; font-weight: 800;
    letter-spacing: 0.06em; text-transform: uppercase;
    color: #10b981; background: rgba(16, 185, 129, 0.12);
    border-radius: 5px; padding: 0.1rem 0.4rem;
  }
  .opt-name { font-weight: 700; font-size: 1rem; color: var(--color-text-primary); }
  .opt-by { font-size: 0.75rem; color: var(--color-text-tertiary); }
  .opt-idea { font-size: 0.9rem; line-height: 1.6; margin: 0.3rem 0 0.5rem; }
  .opt-formula-tag {
    font-size: 0.6rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase;
    color: var(--color-text-tertiary); margin: 0.55rem 0 0.1rem;
  }
  .opt-formula { overflow-x: auto; overflow-y: hidden; padding: 0.25rem 0; }
  .opt-formula :global(.katex) { font-size: 1rem; }
  .opt-foot { display: flex; gap: 0.5rem 1.25rem; flex-wrap: wrap; font-size: 0.78rem; font-weight: 600; margin-top: 0.45rem; }
  .opt-fix { color: #10b981; }
  .opt-break { color: #f59e0b; }

  .aside {
    font-size: 0.875rem;
    color: var(--color-text-tertiary);
    font-style: italic;
    border-left: 2px solid var(--color-border);
    padding-left: 0.85rem;
    margin: 0.6rem 0;
  }
  .aside strong { color: var(--color-text-secondary); }

  /* The trunk → branches transition that introduces the post-Adam fork. */
  .opt-lead {
    font-size: 0.9rem;
    line-height: 1.6;
    color: var(--color-text-secondary);
    margin: 1.7rem 0 0.75rem;
  }
  .opt-lead strong { color: var(--color-text-primary); }
  .opt-lead :global(em) { color: var(--color-text-primary); font-style: italic; }
  .opt-lead :global(strong) { color: var(--color-text-primary); font-weight: 650; }

  /* The 2025 matrix-optimizer note: real, relevant, deliberately not runnable. */
  .opt-frontier {
    margin-top: 1.2rem;
    border: 1px dashed var(--color-border);
    border-radius: 10px;
    background: var(--color-bg-primary);
    padding: 0.8rem 0.95rem;
  }
  .opt-frontier-title {
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--color-text-primary);
    margin-bottom: 0.35rem;
  }
  .opt-frontier p {
    font-size: 0.85rem;
    line-height: 1.6;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .opt-cta {
    display: flex; align-items: center; justify-content: space-between;
    gap: 1rem; flex-wrap: wrap;
    margin-top: 1rem;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }

  .try-btn {
    flex-shrink: 0;
    display: inline-flex; align-items: center; gap: 0.35rem;
    padding: 0.45rem 0.8rem;
    border: 1px solid rgba(16, 185, 129, 0.45);
    border-radius: 8px;
    background: rgba(16, 185, 129, 0.1);
    color: #10b981;
    font-size: 0.8rem; font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .try-btn:hover { background: rgba(16, 185, 129, 0.22); border-color: #10b981; transform: translateY(-1px); }

  /* ---------- Problem grid ---------- */
  .problem-group-label {
    font-size: 0.7rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em;
    color: #10b981;
    margin: 1.1rem 0 0.5rem 0;
  }
  .problem-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(195px, 1fr)); gap: 0.625rem; }
  .problem-card {
    display: flex; align-items: flex-start; gap: 0.625rem;
    padding: 0.65rem 0.75rem;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    transition: border-color 0.15s, transform 0.15s;
  }
  .problem-card:hover { border-color: rgba(16, 185, 129, 0.5); transform: translateY(-1px); }
  .problem-icon {
    width: 28px; height: 28px; flex-shrink: 0;
    display: inline-flex; align-items: center; justify-content: center;
    color: #10b981; background: rgba(16, 185, 129, 0.1); border-radius: 6px;
  }
  .custom-icon { font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 0.95rem; font-weight: 700; }
  .problem-text { min-width: 0; flex: 1; }
  .problem-name { font-size: 0.85rem; font-weight: 600; color: var(--color-text-primary); margin-bottom: 1px; }
  .problem-formula { font-family: 'SF Mono', Monaco, monospace; font-size: 0.72rem; color: var(--color-text-tertiary); margin-bottom: 1px; }
  .problem-tag { font-size: 0.72rem; color: var(--color-text-secondary); font-style: italic; }

  /* ---------- Experiments ---------- */
  .experiment {
    background: var(--color-bg-tertiary);
    border-left: 2px solid var(--color-border);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-bottom: 0.625rem;
    display: flex; align-items: center; gap: 0.875rem;
  }
  .experiment-text { flex: 1; min-width: 0; }
  .experiment h4 { color: #10b981; font-size: 0.9rem; margin-bottom: 0.35rem; }
  .experiment p { margin-bottom: 0; font-size: 0.875rem; }

  /* ---------- Viz list ---------- */
  .viz-list { padding-left: 1.2rem; }
  .viz-list li { margin-bottom: 0.6rem; }

  /* ---------- Keyboard ---------- */
  .kbd-row { display: flex; flex-wrap: wrap; gap: 0.625rem 1.25rem; align-items: center; }
  .kbd-item { display: flex; align-items: center; gap: 0.4rem; font-size: 0.875rem; color: var(--color-text-secondary); }
  .kbd-item kbd {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 1.5rem; padding: 0.1rem 0.4rem;
    border: 1px solid var(--color-border); border-bottom-width: 2px;
    border-radius: 6px; background: var(--color-bg-primary);
    font-family: 'SF Mono', Monaco, monospace; font-size: 0.6875rem; font-weight: 700;
    color: var(--color-text-primary);
  }
  .kbd-note { font-size: 0.6875rem; opacity: 0.7; }

  .end-mark {
    text-align: center;
    font-family: 'Times New Roman', Georgia, serif;
    font-style: italic;
    font-size: 1.6rem;
    color: rgba(16, 185, 129, 0.4);
    margin-top: 2.5rem;
  }

  /* ---------- Footer ---------- */
  .modal-footer {
    border-top: 1px solid var(--color-border);
    padding: 0.5rem 1.5rem;
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  }
  .modal-footer p { margin: 0; font-size: 0.8125rem; color: var(--color-text-tertiary); }
  .modal-footer strong { color: #10b981; font-weight: 600; }
  .github-link {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.3rem 0.7rem;
    border-radius: 8px; border: 1px solid var(--color-border);
    background: transparent; color: var(--color-text-secondary);
    text-decoration: none; font-size: 0.8125rem; font-weight: 500;
    transition: all 0.2s; flex-shrink: 0;
  }
  .github-link:hover { color: #10b981; border-color: #10b981; background: rgba(16, 185, 129, 0.08); }
  .github-link :global(svg) { width: 18px; height: 18px; flex-shrink: 0; }

  /* ---------- Tablet ---------- */
  @media (max-width: 900px) {
    .toc { flex-basis: 200px; }
    .reading-column { padding: 1.5rem 1.5rem 3rem; }
  }

  /* ---------- Mobile ---------- */
  @media (max-width: 768px) {
    .modal-backdrop { padding: 0.5rem; }
    .modal-content { max-height: 95dvh; border-radius: 14px; }
    .modal-header { padding: 0.875rem 1rem; }
    .modal-header h2 { font-size: 1.1rem; }
    .modal-icon { font-size: 1.5rem; }
    .book-tag { display: none; }

    /* Drop the rail; the reading column takes the full width. */
    .toc { display: none; }
    .reading-column { padding: 1.25rem 1.1rem 2.5rem; max-width: 100%; }

    .hero-svg { height: 150px; }
    .hero-title { font-size: 1.3rem; }
    h3 { font-size: 1.25rem; }
    p, li, .recipe { font-size: 0.95rem; }

    .concept { grid-template-columns: 1fr; }
    .concept-svg { height: 100px; }
    .concept-bg-overlay { display: flex; flex-direction: column; }
    .concept-bg-svg { position: relative; height: 110px; flex-shrink: 0; }
    .concept-fade { display: none; }
    .concept-text-overlay { position: relative; width: 100%; padding: 1rem 1.25rem; }

    .problem-grid { grid-template-columns: 1fr; }
    .modal-footer { padding: 0.75rem 1rem; }
  }
</style>
