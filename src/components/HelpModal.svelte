<script lang="ts">
  /**
   * The Guide — a little book you can read.
   *
   * A two-pane reading view: a sticky chapter rail (table of contents with
   * scroll-spy + a reading-progress bar) beside a calm, measured reading
   * column. The book climbs a gentle ladder — Part I the landscape, Part II
   * one step, Part III when one step isn't enough (the optimizer story, with
   * its real simulated race), Part IV the zoo of problems, then a short
   * reference. Heavy math hides inside "Go deeper" so the main line stays
   * readable; every term is defined where it is first used.
   */

  import {
    X,
    Activity, Mountain, TrendingUp, TrendingDown, Percent, Waves,
    Target, Radio, ScatterChart, Brain,
    Compass, Rocket, Zap,
    BookOpen, FlaskConical, Layers, Map, Play, Keyboard
  } from 'lucide-svelte';
  import katex from 'katex';
  import 'katex/dist/katex.min.css';
  import { rgb, geoPath } from 'd3';
  import { contours } from 'd3-contour';
  import { interpolateViridis } from 'd3-scale-chromatic';
  import { experiments } from '../utils/experiments';
  import { schedules, scheduleOrder } from '../utils/schedules';

  export let isOpen = false;
  export let onClose: () => void;

  // Tiny γ-vs-step previews for the scheduling chapter, sampled from the SAME
  // schedule factors the trainer uses, so the curves are honest.
  const SCH_W = 150, SCH_H = 78, SCH_PAD = 7;
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

  // Formulas render straight to HTML — no element refs, no afterUpdate.
  const tex = (src: string) => katex.renderToString(src, { throwOnError: false, displayMode: false });
  const texD = (src: string) => katex.renderToString(src, { throwOnError: false, displayMode: true });

  // ---------- The table of contents (drives the rail + scroll-spy) ----------
  type TocEntry = { part?: string; id?: string; n?: string; title?: string };
  const toc: TocEntry[] = [
    { part: 'Part I · The landscape' },
    { id: 'ch-bowl', n: '1', title: 'The bottom of a bowl' },
    { id: 'ch-landscape', n: '2', title: 'Loss is a landscape' },
    { part: 'Part II · One step' },
    { id: 'ch-downhill', n: '3', title: 'Which way is downhill?' },
    { id: 'ch-step', n: '4', title: 'One step of descent' },
    { id: 'ch-gamma', n: '5', title: 'The learning rate γ' },
    { part: "Part III · When one step isn't enough" },
    { id: 'ch-optimizers', n: '6', title: 'Seven optimizers, one story' },
    { id: 'ch-noise', n: '7', title: 'Mini-batches & the S in SGD' },
    { id: 'ch-schedule', n: '8', title: 'Scheduling the learning rate' },
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
    stability: String.raw`\gamma < \frac{2}{\lambda_{\max}}`
  };

  // ---------- The optimizer story ----------
  // 170 years of "fix what just broke", told as cards in three acts plus a
  // finale. Each card now leads with the failure it exists to fix.
  type OptChapter = {
    year: string;
    name: string;
    by: string;
    idea: string;
    formula: string;
    fix?: string;
    brk?: string;
    prereq?: boolean;
    act?: { no: string; title: string };
  };

  const optTree: OptChapter[] = [
    {
      act: { no: 'Act I', title: 'Follow the slope' },
      year: '1847',
      name: 'Gradient Descent',
      by: 'Augustin-Louis Cauchy',
      idea:
        'Cauchy, grinding through astronomical calculations by hand, writes down the move everything else builds on: measure the slope, step the other way. A century and a half later it is still the backbone of all of machine learning — and the baseline every later trick is trying to beat.',
      formula: String.raw`\boldsymbol{\theta} \;\leftarrow\; \boldsymbol{\theta} - \gamma\, \nabla \mathcal{L}`,
      fix: 'every step is locally downhill',
      brk: 'one γ for every parameter, so it zig-zags across ravines (the grey racer above)'
    },
    {
      act: { no: 'Act II', title: 'Add memory' },
      prereq: true,
      year: 'tool',
      name: 'The moving average',
      by: 'the one tool Acts II and III are built from',
      idea:
        'Before the next two fixes, one small tool. An exponential moving average is a leaky memory: keep a fraction β of what you already believed, and mix in a fraction (1−β) of what you just saw. It smooths a jittery signal into a steady one. Roughly, it remembers the last 1/(1−β) values — β = 0.9 is about the last ten. Momentum averages gradients with it; RMSProp and Adam average squared gradients.',
      formula: String.raw`v \;\leftarrow\; \beta\, v + (1-\beta)\, x`
    },
    {
      year: '1964',
      name: 'Momentum',
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
      by: 'Yurii Nesterov — accelerated gradient',
      idea:
        'The failure to fix: momentum overshoots because it looks where it stands. The cure: look ahead. Measure the gradient where the velocity is about to carry you, not where you are — like braking into a corner instead of after it. The same heavy ball, now with foresight; it settles without the orbit.',
      formula: String.raw`\mathbf{v} \leftarrow \mu \mathbf{v} + \nabla \mathcal{L}(\boldsymbol{\theta}), \qquad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\,(\nabla \mathcal{L} + \mu \mathbf{v})`,
      fix: 'corrects the overshoot before it happens'
    },
    {
      act: { no: 'Act III', title: 'A learning rate per parameter' },
      year: '2011',
      name: 'AdaGrad',
      by: 'Duchi, Hazan & Singer',
      idea:
        'A different failure: one shared γ is wrong when the two parameters need very different step sizes. The cure: give each its own. Divide a parameter’s step by the running size of its own past gradients — parameters that rarely move take bold steps, busy ones calm down. This made it the workhorse of sparse problems like word embeddings.',
      formula: String.raw`s \leftarrow s + (\nabla \mathcal{L})^2, \qquad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \frac{\nabla \mathcal{L}}{\sqrt{s} + \varepsilon}`,
      fix: 'every parameter gets its own learning rate',
      brk: 'that history only grows, so the step shrinks toward zero — it strangles itself'
    },
    {
      year: '2012',
      name: 'RMSProp',
      by: 'Geoffrey Hinton — never formally published; the world cites a Coursera slide',
      idea:
        'The failure to fix: AdaGrad’s ever-growing memory chokes long runs. The cure: let it forget. Swap the growing sum for a moving average of squared gradients (the tool from Act II). Old gradients fade, so the per-parameter step size stays alive even on long, winding, non-convex problems.',
      formula: String.raw`s \leftarrow \rho\, s + (1-\rho)(\nabla \mathcal{L})^2, \qquad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \frac{\nabla \mathcal{L}}{\sqrt{s} + \varepsilon}`,
      fix: 'forgetting keeps the step size alive'
    },
    {
      act: { no: 'Finale', title: 'Combine everything' },
      year: '2014',
      name: 'Adam',
      by: 'Kingma & Ba — "adaptive moments"',
      idea:
        'The merger that ends the story: take Momentum’s moving average of gradients (decay β₁) AND RMSProp’s moving average of squared gradients (decay β₂), and use them together. One honest detail: both averages start at zero and read too low at first, so each is divided by 1−βᵗ to correct that early bias. The result is the default optimizer of modern deep learning.',
      formula: String.raw`\hat{\mathbf{m}} = \frac{\mathbf{m}}{1-\beta_1^t}, \quad \hat{s} = \frac{s}{1-\beta_2^t}, \qquad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \frac{\hat{\mathbf{m}}}{\sqrt{\hat{s}} + \varepsilon}`,
      fix: 'robust out of the box almost everywhere',
      brk: 'sometimes generalizes worse than carefully tuned SGD — the story isn’t over'
    },
    {
      act: { no: 'Coda', title: 'A different shape' },
      year: '2023',
      name: 'Lion',
      by: 'Chen et al. (Google) — found by program search, not designed',
      idea:
        'Adam was the finale of one idea — scale the step by gradient history. Lion takes a different shape entirely, and it wasn’t invented by a person: a program searched the space of optimizers and this fell out. Keep one momentum buffer, blend it with the fresh gradient, and step by the SIGN of the result — so every step is the same size γ on each axis, no matter how steep or flat. That makes it light (one buffer, no squared-gradient term) and competitive with Adam on big vision and language models. The catch is the very thing that makes it clean: a step that never shrinks can’t settle by itself.',
      formula: String.raw`\mathbf{c} \leftarrow \beta_1 \mathbf{m} + (1{-}\beta_1)\nabla\mathcal{L}, \;\; \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \operatorname{sign}(\mathbf{c}), \;\; \mathbf{m} \leftarrow \beta_2 \mathbf{m} + (1{-}\beta_2)\nabla\mathcal{L}`,
      fix: 'fixed-size steps from one tiny buffer — light and fast',
      brk: 'the step never shrinks, so it orbits the minimum until γ is decayed (Chapter 8)'
    }
  ];

  const raceExperiment = experiments.find(e => e.id === 'banana-race');
  const scheduleExperiment = experiments.find(e => e.id === 'lion-schedule');

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
    type Stepper = (g: [number, number], st: Record<string, number>, s: number) => [number, number];
    const simulate = (step: Stepper): [number, number][] => {
      let [x, y] = start;
      const pts: [number, number][] = [[x, y]];
      const st: Record<string, number> = { vx: 0, vy: 0, sx: 0, sy: 0, mx: 0, my: 0 };
      for (let s = 0; s < 170; s++) {
        const [dx, dy] = step(grad(x, y), st, s);
        x += dx;
        y += dy;
        pts.push([x, y]);
        if (Math.hypot(x - minPt[0], y - minPt[1]) < 0.1) break;
      }
      return pts;
    };
    const E = 1e-8;
    const runners = [
      { name: 'GD', color: '#94a3b8', pts: simulate(g => [-0.085 * g[0], -0.085 * g[1]]) },
      {
        name: 'Momentum', color: '#a855f7',
        pts: simulate((g, st) => {
          st.vx = 0.86 * st.vx + g[0];
          st.vy = 0.86 * st.vy + g[1];
          return [-0.025 * st.vx, -0.025 * st.vy];
        })
      },
      {
        name: 'RMSProp', color: '#22d3ee',
        pts: simulate((g, st) => {
          st.sx = 0.94 * st.sx + 0.06 * g[0] ** 2;
          st.sy = 0.94 * st.sy + 0.06 * g[1] ** 2;
          return [-0.08 * g[0] / (Math.sqrt(st.sx) + E), -0.08 * g[1] / (Math.sqrt(st.sy) + E)];
        })
      },
      {
        name: 'Adam', color: '#f43f5e',
        pts: simulate((g, st, s) => {
          st.mx = 0.9 * st.mx + 0.1 * g[0];
          st.my = 0.9 * st.my + 0.1 * g[1];
          st.sx = 0.999 * st.sx + 0.001 * g[0] ** 2;
          st.sy = 0.999 * st.sy + 0.001 * g[1] ** 2;
          const b1 = 1 - 0.9 ** (s + 1), b2 = 1 - 0.999 ** (s + 1);
          return [
            -0.16 * (st.mx / b1) / (Math.sqrt(st.sx / b2) + E),
            -0.16 * (st.my / b1) / (Math.sqrt(st.sy / b2) + E)
          ];
        })
      }
    ];
    const slowest = Math.max(...runners.map(r => r.pts.length - 1));
    const racers = runners.map(r => ({
      name: r.name,
      color: r.color,
      d: 'M ' + r.pts.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join(' L '),
      frac: +(((r.pts.length - 1) / slowest) * 0.72).toFixed(4),
      steps: r.pts.length - 1
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

  const chIcon: Record<string, any> = {
    'ch-bowl': BookOpen, 'ch-landscape': Mountain, 'ch-downhill': TrendingDown,
    'ch-step': Compass, 'ch-gamma': Zap, 'ch-optimizers': Rocket, 'ch-noise': Waves,
    'ch-schedule': Activity,
    'ch-problems': Layers, 'ch-experiments': FlaskConical, 'ch-panels': Map, 'ch-keys': Keyboard
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
                <div class="hero-eyebrow">A short, friendly book about</div>
                <div class="hero-title">finding the bottom of a bowl.</div>
                <div class="hero-subtitle">Drag the orange marker. Hit Train. Watch the loss fall — and learn why it works.</div>
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
              <p class="look">
                Look at the Loss &amp; Gradient panel right now: the bright dimple is where the loss
                is lowest, and the marker is trying to reach it.
              </p>
            </section>

            <!-- ============== 3 · WHICH WAY IS DOWNHILL ============== -->
            <section data-ch="ch-downhill" id="ch-downhill">
              <div class="part-label">Part II · One step</div>
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
                only this knob and hold the other still, how fast does the loss change?</em>
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
                diverges. That “steepness” is the <strong>curvature</strong> — and taming it is the
                whole subject of Part III.
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
                number — the curvature — is the villain the whole next part is built to outwit.
              </p>
            </section>

            <!-- ============== 6 · THE OPTIMIZER STORY ============== -->
            <section data-ch="ch-optimizers" id="ch-optimizers">
              <div class="part-label">Part III · When one step isn’t enough</div>
              <h3><svelte:component this={chIcon['ch-optimizers']} size={18} strokeWidth={2} /> Seven optimizers, one story</h3>
              <p>
                Plain gradient descent has one recurring nemesis: the <strong>ravine</strong> — a
                valley far steeper across than along. The γ that’s safe on the steep walls is
                hopeless along the gentle floor, so the marker rattles wall to wall. Every optimizer
                in the picker is a patch for that pain (or the new pain the last patch created) —
                170 years of <em>fix what just broke.</em>
              </p>
              <p>
                Here are four of them racing on the same ravine from the same start, each actually
                simulated — the dots arrive in their true step counts:
              </p>

              <figure class="race-demo">
                <svg viewBox="0 0 {RACE_W} {RACE_H}" preserveAspectRatio="xMidYMid meet">
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
                    {#each raceDemo.racers as r (r.name)}
                      <path d={r.d} fill="none" stroke={r.color} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" opacity="0.92">
                        <animate attributeName="stroke-dashoffset" values="100;0;0" keyTimes="0;{r.frac};1" dur="7s" repeatCount="indefinite" />
                      </path>
                    {/each}
                    <circle cx={raceDemo.min[0]} cy={raceDemo.min[1]} r="7" fill="none" stroke="#10b981" stroke-width="1.5" stroke-dasharray="3,2.5" />
                    <circle cx={raceDemo.start[0]} cy={raceDemo.start[1]} r="8" fill="none" stroke="#f59e0b" stroke-width="1.75" opacity="0.9" />
                    <circle cx={raceDemo.start[0]} cy={raceDemo.start[1]} r="4.5" fill="#f59e0b" stroke="#fff" stroke-width="1.5" />
                    {#each raceDemo.racers as r (r.name)}
                      <circle r="3.4" fill={r.color} stroke="#fff" stroke-width="1.25">
                        <animateMotion path={r.d} keyPoints="0;1;1" keyTimes="0;{r.frac};1" calcMode="linear" dur="7s" repeatCount="indefinite" />
                      </circle>
                    {/each}
                  </g>
                </svg>
                <div class="race-legend">
                  {#each raceDemo.racers as r (r.name)}
                    <span class="race-chip"><span class="race-swatch" style="background:{r.color}"></span>{r.name} · {r.steps}</span>
                  {/each}
                </div>
                <figcaption class="race-caption">
                  Same start, each with the γ it likes. Plain GD burns its budget bouncing wall to
                  wall; Momentum cancels the bounce and glides; RMSProp and Adam size every
                  parameter’s step from gradient history. Numbers are steps to the basin.
                  (Nesterov and AdaGrad sit this race out — they’re close cousins of Momentum and
                  RMSProp, and you’ll meet them below.)
                </figcaption>
              </figure>

              {#each optTree as c (c.name)}
                {#if c.act}
                  <div class="opt-act"><span class="act-no">{c.act.no}</span><span class="act-title">{c.act.title}</span></div>
                {/if}
                <div class="opt-card" class:prereq-card={c.prereq}>
                  <div class="opt-head">
                    <span class="opt-year">{c.year}</span>
                    <span class="opt-name">{c.name}</span>
                    <span class="opt-by">{c.by}</span>
                  </div>
                  <p class="opt-idea">{c.idea}</p>
                  <div class="opt-formula">{@html tex(c.formula)}</div>
                  {#if c.fix || c.brk}
                    <div class="opt-foot">
                      {#if c.fix}<span class="opt-fix">✓ {c.fix}</span>{/if}
                      {#if c.brk}<span class="opt-break">✗ {c.brk}</span>{/if}
                    </div>
                  {/if}
                </div>
                {#if c.name === 'Nesterov'}
                  <p class="aside">
                    Feel Act II yourself: pick <strong>Gaussian Peak</strong> with μ = 0 — far from
                    the peak the gradient is so faint the marker stalls. Crank μ to 0.9 and watch it
                    power through. Remember the marker arrows from Part II: blue is raw steepest
                    descent, red is the step actually taken — here the gap is momentum at work.
                  </p>
                {/if}
                {#if c.name === 'Lion'}
                  <p class="aside">
                    Pick <strong>Lion</strong> and watch the marker move in equal-size hops, the
                    same stride on a cliff or a flat — every other method takes smaller steps as it
                    nears the bottom; Lion can’t. So it circles the minimum in a fixed ring instead
                    of homing in. Chapter 8 turns that into a one-click lesson on why learning-rate
                    schedules exist.
                  </p>
                {/if}
              {/each}

              {#if raceExperiment}
                <div class="opt-cta">
                  <span>Now run the real thing:</span>
                  <button class="try-btn" on:click={() => runExperiment(raceExperiment)}>
                    <Play size={13} strokeWidth={2.5} /><span>Race them on Rosenbrock</span>
                  </button>
                </div>
              {/if}
            </section>

            <!-- ============== 7 · NOISE / SGD ============== -->
            <section data-ch="ch-noise" id="ch-noise">
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
                can’t hold still. Pulling that band shut is exactly what the next chapter is for.
              </p>
            </section>

            <!-- ============== 8 · SCHEDULING THE LEARNING RATE ============== -->
            <section data-ch="ch-schedule" id="ch-schedule">
              <h3><svelte:component this={chIcon['ch-schedule']} size={18} strokeWidth={2} /> Scheduling the learning rate</h3>
              <p>
                Chapter 5 left us with a dilemma, and Chapter 7 sharpened it. A <strong>large</strong>
                γ covers ground quickly but overshoots, and under noise it orbits the minimum in a wide
                ball. A <strong>small</strong> γ lands precisely but crawls to get there. The trick is
                that you don’t have to choose: stop treating γ as one frozen number and start
                <strong>scheduling</strong> it — large early to make fast progress, small late to settle
                cleanly. The <strong>Schedule</strong> control beneath the learning rate does exactly
                that, multiplying your base γ by a factor that changes on every step of the run.
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
                <strong>Constant</strong> is the baseline every earlier chapter quietly assumed — γ holds
                its value start to finish. It is the honest choice when you want to watch raw behaviour,
                but it forces you to pick a single γ that is always a compromise between fast and precise.
              </p>
              <p>
                <strong>Step decay</strong> holds γ flat, then cuts it by a fixed factor at set milestones
                — here ×0.3 a third of the way in, and ×0.3 again at two-thirds. On the loss curve it
                leaves the field’s most recognizable fingerprint: a long plateau, then a sudden
                <em>cliff</em> downward the instant γ drops, as the smaller step finally resolves detail
                the larger one kept skating over. For most of deep learning’s history, this staircase was
                how nearly every network was trained.
              </p>
              <p>
                <strong>Cosine</strong> does the same work without the jolts. γ glides along the first
                half of a cosine, easing from full strength down to a small floor (about 5%) — quick at
                first, feather-light by the end. With no single brutal transition the run simply
                <em>eases</em> into its minimum, which is why cosine annealing has become the modern
                default.
              </p>
              <p>
                <strong>Warmup + cosine</strong> bolts a short on-ramp onto the front: γ starts near zero
                and climbs over the first tenth of the run before the cosine takes over. It looks fussy
                until you remember where a run <em>begins</em> — at a random, often dreadful point, where
                the gradient can be enormous and the adaptive optimizers from Chapter 6 have no history
                yet to calibrate against. A full-size first step there can fling the marker clean off the
                map. Warmup lets the optimizer find its footing on small, safe steps before it opens the
                throttle, and it is now standard practice for training large models from scratch.
              </p>
              <p>
                There is a deeper reason the late shrink matters, and it is the noise ball from Chapter 7.
                That ball’s radius scales with γ — so a γ annealing toward zero draws the orbit in tight
                around the true minimum, turning SGD’s restless buzzing into a soft landing. Decay isn’t
                only about speed: under noise, it is <em>how a stochastic run converges at all.</em>
              </p>
              <p>
                One optimizer makes this visible with no noise at all. <strong>Lion</strong> (Chapter 6)
                steps by the <em>sign</em> of its momentum, so every step is the same size ±γ — even on
                the exact full-batch gradient it cannot take a smaller step as it nears the bottom. On
                <strong>Constant</strong> it simply orbits the minimum in a ring of radius γ and never
                lands. That makes it the purest illustration of why a schedule has to exist: bleed γ to
                zero with <strong>Cosine</strong> and the ring closes to a point — the optimizer has no
                other way to stop.
              </p>
              {#if scheduleExperiment}
                <div class="opt-cta">
                  <span>See it happen:</span>
                  <button class="try-btn" on:click={() => runExperiment(scheduleExperiment)}>
                    <Play size={13} strokeWidth={2.5} /><span>Watch Lion orbit, then land</span>
                  </button>
                </div>
              {/if}
              <p class="look">
                Or with noise: set a small batch so the loss settles into a fuzzy band on
                <strong>Const</strong>, then switch to <strong>Cosine</strong> and watch the band pinch
                shut over the final steps.
              </p>
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

            <!-- ============== 9 · EXPERIMENTS ============== -->
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

            <!-- ============== 10 · READING THE PANELS ============== -->
            <section data-ch="ch-panels" id="ch-panels">
              <div class="part-label">Reference</div>
              <h3><svelte:component this={chIcon['ch-panels']} size={18} strokeWidth={2} /> Reading the panels</h3>
              <ul class="viz-list">
                <li><strong>Data plot</strong> — the data points and the current model. For curve fits, blue solid is the current fit and green dashed is the truth. For 2D problems, the orange marker shows your parameters directly on the plot.</li>
                <li><strong>Loss &amp; Gradient</strong> — the landscape from Chapter 2: bright = low loss, white contours join equal-loss points, and the field arrows are −∇ℒ. On the marker, the <span class="ink-blue">blue arrow</span> is steepest descent and the <span class="ink-red">red arrow</span> is the step actually taken (Chapters 3–4). Drag the marker to teleport.</li>
                <li><strong>Loss History</strong> — train and test loss versus step. A clean decline is healthy; spikes mean you’re overshooting (too much γ or μ); a persistent train/test gap hints at overfitting.</li>
              </ul>
            </section>

            <!-- ============== 11 · KEYBOARD ============== -->
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
    background: rgba(0, 0, 0, 0.14);
  }
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
    border-left: 3px solid rgba(16, 185, 129, 0.4);
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
    border-left: 3px solid #10b981;
    background: rgba(16, 185, 129, 0.06);
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
    grid-template-columns: repeat(2, 1fr);
    gap: 0.7rem;
    margin: 1.15rem 0 1.5rem;
  }
  .schedule-card {
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-bg-tertiary);
    padding: 0.6rem 0.75rem 0.75rem;
  }
  .schedule-card svg { display: block; width: 100%; height: auto; }
  .sch-axis { stroke: var(--color-border); stroke-width: 1; }
  .sch-curve { stroke: #10b981; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .schedule-name {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--color-text-primary);
    margin-top: 0.45rem;
  }
  .schedule-desc {
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--color-text-tertiary);
    margin-top: 0.12rem;
  }

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
    margin: 1.25rem 0 1.5rem;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    overflow: hidden;
    background: var(--color-bg-primary);
  }
  .race-demo svg { width: 100%; display: block; }
  .race-legend { display: flex; justify-content: center; gap: 0.9rem; flex-wrap: wrap; padding: 0.6rem 0.6rem 0; }
  .race-chip {
    display: inline-flex; align-items: center; gap: 0.3rem;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.6875rem; font-weight: 600;
    color: var(--color-text-secondary);
  }
  .race-swatch { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
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
    margin: 1.6rem 0 0.7rem;
  }
  .act-no {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.625rem; font-weight: 800;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: #f59e0b;
  }
  .act-title { font-weight: 700; font-size: 0.95rem; color: var(--color-text-primary); }

  .opt-card {
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-bg-primary);
    padding: 0.8rem 0.95rem 0.7rem;
    margin-bottom: 0.65rem;
  }
  .opt-card.prereq-card { border-style: dashed; }
  .opt-head { display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.3rem; }
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
  .opt-formula { overflow-x: auto; overflow-y: hidden; padding: 0.25rem 0; }
  .opt-formula :global(.katex) { font-size: 1rem; }
  .opt-foot { display: flex; gap: 0.5rem 1.25rem; flex-wrap: wrap; font-size: 0.78rem; font-weight: 600; margin-top: 0.45rem; }
  .opt-fix { color: #10b981; }
  .opt-break { color: #f59e0b; }

  .aside {
    font-size: 0.875rem;
    color: var(--color-text-tertiary);
    font-style: italic;
    border-left: 3px solid rgba(16, 185, 129, 0.4);
    padding-left: 0.85rem;
    margin: 0.6rem 0;
  }
  .aside strong { color: var(--color-text-secondary); }

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
    border-left: 3px solid #10b981;
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
