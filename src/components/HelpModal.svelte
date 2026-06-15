<script lang="ts">
  /**
   * Help Modal
   *
   * A little book, in chapters: an animated hero, then 01 prerequisites
   * (loss & gradient), 02 the algorithm and its one knob, 03 the optimizer
   * story (GD → Adam as 170 years of fixes, opened by a real simulated
   * race), 04 the 22 problems, 05 ready-made experiments, 06 a key for the
   * on-screen panels, and 07 the keyboard map.
   */

  import { onMount, afterUpdate } from 'svelte';
  import {
    X,
    Activity, Mountain, TrendingUp, TrendingDown, Percent, Waves,
    Target, Radio, ScatterChart, Brain,
    Compass, Rocket, Zap,
    BookOpen, FlaskConical, Layers, Map, Play
  } from 'lucide-svelte';
  import katex from 'katex';
  import 'katex/dist/katex.min.css';
  import { rgb, geoPath } from 'd3';
  import { contours } from 'd3-contour';
  import { interpolateViridis } from 'd3-scale-chromatic';
  import { experiments } from '../utils/experiments';

  function runExperiment(exp: (typeof experiments)[number]) {
    onClose();
    exp.apply();
  }

  // ---------- The optimizer story ----------
  // 170 years of "fix what just broke", told as cards in three acts plus
  // a finale. Each act opens with the failure it exists to fix; the one
  // prerequisite tool (the moving average) appears exactly where it is
  // first needed. Formulas render straight to HTML — no element refs.
  const tex = (src: string) => katex.renderToString(src, { throwOnError: false });

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
        'Cauchy, grinding through astronomical calculations by hand, writes down the move everything else builds on: measure the slope, step the other way. A century and a half later it is still the backbone of all of machine learning.',
      formula: String.raw`\boldsymbol{\theta} \;\leftarrow\; \boldsymbol{\theta} - \gamma\, \nabla \mathcal{L}`,
      fix: 'every step is locally downhill',
      brk: 'one γ for every parameter, and it zig-zags across ravines (the grey racer above)'
    },
    {
      act: { no: 'Act II', title: 'Add memory' },
      prereq: true,
      year: 'tool',
      name: 'The moving average',
      by: 'the one tool Acts II and III are built from',
      idea:
        'An exponential moving average is a leaky memory: keep a fraction β of what you believed, mix in a fraction (1−β) of what you just saw. Its horizon is roughly 1/(1−β) steps — β = 0.9 remembers about the last 10 values, β = 0.999 about the last 1000. Momentum is a moving average of gradients; RMSProp and Adam keep one of squared gradients.',
      formula: String.raw`v \;\leftarrow\; \beta\, v + (1-\beta)\, x`
    },
    {
      year: '1964',
      name: 'Momentum',
      by: 'Boris Polyak — the "heavy ball"',
      idea:
        'Give the marker mass. Keep a velocity — a moving average of gradients — and let each new gradient push it. The side-to-side wobble cancels itself out while the consistent downhill component compounds into a tailwind of up to 1/(1−μ): μ = 0.9 is worth roughly ten plain steps along the valley floor.',
      formula: String.raw`\mathbf{v} \leftarrow \mu \mathbf{v} + \nabla \mathcal{L}, \qquad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \mathbf{v}`,
      fix: 'damps the zig-zag, powers through plateaus',
      brk: 'inertia overshoots — it orbits the minimum before settling'
    },
    {
      year: '1983',
      name: 'Nesterov',
      by: 'Yurii Nesterov — accelerated gradient',
      idea:
        'Look before you leap: measure the gradient where the velocity is about to carry you, not where you stand. That one reordering acts like braking into a corner instead of after it — and provably achieves the best convergence rate any gradient-only method can have on smooth convex problems.',
      formula: String.raw`\mathbf{v} \leftarrow \mu \mathbf{v} + \nabla \mathcal{L}(\boldsymbol{\theta}), \qquad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\,(\nabla \mathcal{L} + \mu \mathbf{v})`,
      fix: 'corrects the momentum mistake before making it'
    },
    {
      act: { no: 'Act III', title: 'A learning rate per parameter' },
      year: '2011',
      name: 'AdaGrad',
      by: 'Duchi, Hazan & Singer',
      idea:
        'A different failure, a different cure: parameters are not equals. Divide each parameter’s step by the history of its own gradients — rarely-updated parameters take bold steps, busy ones calm down. This made it the workhorse of sparse problems like word embeddings.',
      formula: String.raw`s \leftarrow s + (\nabla \mathcal{L})^2, \qquad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \frac{\nabla \mathcal{L}}{\sqrt{s} + \varepsilon}`,
      fix: 'every parameter gets its own learning rate',
      brk: 'the history only grows, so the step shrinks toward zero — it strangles itself'
    },
    {
      year: '2012',
      name: 'RMSProp',
      by: 'Geoffrey Hinton — famously never published; the world cites a Coursera slide ("Lecture 6.5")',
      idea:
        'AdaGrad with amnesia: replace the ever-growing sum with a moving average of squared gradients — the prerequisite tool, applied to ∇ℒ². Old gradients fade away, so the effective learning rate stays alive on long, non-convex runs.',
      formula: String.raw`s \leftarrow \rho\, s + (1-\rho)(\nabla \mathcal{L})^2, \qquad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \frac{\nabla \mathcal{L}}{\sqrt{s} + \varepsilon}`,
      fix: 'forgetting keeps the step size alive'
    },
    {
      act: { no: 'Finale', title: 'Combine everything' },
      year: '2014',
      name: 'Adam',
      by: 'Kingma & Ba — "adaptive moments"',
      idea:
        'The merger: momentum’s moving average of gradients (decay β₁) AND RMSProp’s moving average of squares (decay β₂) — plus one honest bookkeeping detail. Both averages start at zero and underestimate at first, so each is divided by 1−βᵗ to de-bias it. The result is the default optimizer of modern deep learning.',
      formula: String.raw`\hat{\mathbf{m}} = \frac{\mathbf{m}}{1-\beta_1^t}, \quad \hat{s} = \frac{s}{1-\beta_2^t}, \qquad \boldsymbol{\theta} \leftarrow \boldsymbol{\theta} - \gamma\, \frac{\hat{\mathbf{m}}}{\sqrt{\hat{s}} + \varepsilon}`,
      fix: 'robust out of the box almost everywhere',
      brk: 'sometimes generalizes worse than carefully tuned SGD — the story isn’t over'
    }
  ];

  const raceExperiment = experiments.find(e => e.id === 'banana-race');

  // ---------- The opening picture: a real race on a real landscape ----------
  // A curved ravine, ℒ = 9(y − c(x))² + 0.22(x − x*)² with a sine valley
  // c(x), rendered exactly the way the app renders every landscape
  // (log loss → reversed viridis, white contour lines) — and four
  // optimizers ACTUALLY simulated on it, in the same colors as Race mode.
  // Arrival times in the animation are the true step counts.
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

    // Heatmap — same log → reversed-viridis mapping as lossGrid, one pixel
    // per cell, scaled up smoothly by the <image>.
    const gw = 110, gh = 55;
    const vals: number[] = new Array(gw * gh);
    let vMin = Infinity, vMax = -Infinity;
    for (let j = 0; j < gh; j++) {
      const y = Y1 - ((j + 0.5) / gh) * (Y1 - Y0); // row 0 = top of frame
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

    // Contour lines at log-spaced loss levels, in grid coordinates
    // (template scales them up; non-scaling-stroke keeps lines crisp).
    const levels: number[] = [];
    for (let k = 1; k < 10; k++) levels.push(Math.exp(lMin + (k / 10) * (lMax - lMin)) - EPS);
    const toPath = geoPath();
    const contourPaths = contours().size([gw, gh]).thresholds(levels)(vals)
      .map((poly, idx) => ({ d: toPath(poly) ?? '', o: 0.12 + 0.022 * idx }));

    // The race: same start, each optimizer with the γ it likes; a run ends
    // when it enters the basin around the minimum (or the step cap).
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
      // Fraction of the loop spent racing: true step count ÷ slowest,
      // squeezed into 72% of the cycle so the finished picture lingers.
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

  export let isOpen = false;
  export let onClose: () => void;

  let updateRuleEl: HTMLSpanElement;
  let lossDefinitionEl: HTMLSpanElement;
  let gradientDefinitionEl: HTMLSpanElement;

  const formulas = {
    updateRule: String.raw`\boldsymbol{\theta}^{(t+1)} \leftarrow \boldsymbol{\theta}^{(t)} - \gamma\, \nabla \mathcal{L}(\boldsymbol{\theta}^{(t)})`,
    lossDefinition: String.raw`\mathcal{L}(\boldsymbol{\theta}) = \tfrac{1}{n}\sum_{i=1}^{n} \big(\hat{y}_i - y_i\big)^{2}`,
    gradientDefinition: String.raw`\nabla \mathcal{L} = \begin{bmatrix} \tfrac{\partial \mathcal{L}}{\partial \alpha} \\[2pt] \tfrac{\partial \mathcal{L}}{\partial \beta} \end{bmatrix}`
  };

  function renderLatex() {
    const opts = { throwOnError: false, displayMode: false };
    const safe = (el: HTMLElement | undefined, src: string) => {
      if (!el) return;
      try { katex.render(src, el, opts); } catch (e) { console.error(e); }
    };
    safe(updateRuleEl, formulas.updateRule);
    safe(lossDefinitionEl, formulas.lossDefinition);
    safe(gradientDefinitionEl, formulas.gradientDefinition);
  }

  onMount(renderLatex);
  afterUpdate(renderLatex);

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (isOpen && e.key === 'Escape') onClose();
  }

  // ----- Gradient concept SVG: a real vector field that fills the whole card -----
  // Same loss as the Loss Landscape panel: L(α, β) = (α − cα)² + (β − cβ)².
  // Negative gradient at every grid cell points toward (cα, cβ).
  // The viewBox is intentionally wide (3:1) so the SVG can stretch across
  // the entire concept card; the basin is placed in the left third so the
  // most informative part of the field stays visible while a gradient
  // overlay on the right side carries the explanatory text.
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
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div
    class="modal-backdrop"
    role="presentation"
    on:click={handleBackdropClick}
  >
    <div class="modal-content" role="dialog" aria-modal="true" aria-label="Help and guide">
      <div class="modal-header">
        <div class="modal-title">
          <span class="modal-icon">∂</span>
          <h2>Gradient Lab</h2>
        </div>
        <button class="close-btn" on:click={onClose}>
          <X size={24} strokeWidth={2} />
        </button>
      </div>

      <div class="modal-body">
        <!-- ============================== HERO ============================== -->
        <div class="hero">
          <svg class="hero-svg" viewBox="0 0 460 200" preserveAspectRatio="xMidYMid meet">
            <defs>
              <radialGradient id="bowl-glow" cx="60%" cy="55%" r="42%">
                <stop offset="0%" stop-color="#fde047" stop-opacity="0.55" />
                <stop offset="35%" stop-color="#10b981" stop-opacity="0.30" />
                <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
              </radialGradient>
              <clipPath id="hero-clip">
                <rect x="0" y="0" width="460" height="200" rx="10" />
              </clipPath>
              <!-- Curved descent path: starts upper-left, curves into the basin -->
              <path id="descent-path"
                    d="M 50,30 Q 110,45 170,85 T 250,118 Q 285,128 296,116"
                    fill="none" />
            </defs>

            <g clip-path="url(#hero-clip)">
              <!-- Subtle bowl background -->
              <rect x="0" y="0" width="460" height="200" fill="url(#bowl-glow)" rx="10" />

              <!-- Concentric contours around the basin (296, 116). Sized so the
                   biggest one still fits inside the 460-wide viewBox. -->
              <ellipse cx="296" cy="116" rx="14"  ry="10"  class="contour" style="stroke-opacity: 0.55" />
              <ellipse cx="296" cy="116" rx="36"  ry="26"  class="contour" style="stroke-opacity: 0.42" />
              <ellipse cx="296" cy="116" rx="64"  ry="46"  class="contour" style="stroke-opacity: 0.30" />
              <ellipse cx="296" cy="116" rx="98"  ry="68"  class="contour" style="stroke-opacity: 0.20" />
              <ellipse cx="296" cy="116" rx="135" ry="92"  class="contour" style="stroke-opacity: 0.13" />
              <ellipse cx="296" cy="116" rx="160" ry="108" class="contour" style="stroke-opacity: 0.07" />
            </g>

            <!-- Comet trail: dots sliding along the same path with offsets -->
            <g class="trail">
              {#each [0.0, 0.18, 0.34, 0.48] as begin, i}
                <circle r="3" fill="#f59e0b" opacity={0.10 + i * 0.10}>
                  <animateMotion dur="3.2s" repeatCount="indefinite" begin="{begin}s">
                    <mpath xlink:href="#descent-path" />
                  </animateMotion>
                </circle>
              {/each}
            </g>

            <!-- Lead marker -->
            <g>
              <circle r="9" fill="none" stroke="#f59e0b" stroke-width="2" opacity="0.9">
                <animateMotion dur="3.2s" repeatCount="indefinite" begin="0.6s">
                  <mpath xlink:href="#descent-path" />
                </animateMotion>
              </circle>
              <circle r="5.5" fill="#f59e0b" stroke="#fff" stroke-width="2">
                <animateMotion dur="3.2s" repeatCount="indefinite" begin="0.6s">
                  <mpath xlink:href="#descent-path" />
                </animateMotion>
              </circle>
            </g>
          </svg>

          <div class="hero-text">
            <div class="hero-eyebrow">An interactive playground for</div>
            <div class="hero-title">finding the bottom of a bowl.</div>
            <div class="hero-subtitle">Drag the orange marker. Hit Train. Watch loss fall.</div>
          </div>
        </div>

        <!-- ============================== 01 · PREREQS ============================== -->
        <section>
          <h3><span class="chap">01</span><BookOpen size={18} strokeWidth={2} /> Prerequisites</h3>

          <div class="concept">
            <div class="concept-text">
              <h4>Loss — how wrong is the model?</h4>
              <p>
                A single number that says how badly the model is doing right now.
                Lower is better. The whole game is to make this number small.
              </p>
              <p>
                For most fits here it's <em>mean squared error</em> — average of
                (prediction − truth)² across the data points:
              </p>
              <div class="formula-inline" bind:this={lossDefinitionEl}></div>
            </div>
            <svg class="concept-svg" viewBox="0 0 200 120">
              <!-- Loss curve: a parabola opening up -->
              <path d="M 20,15 Q 100,180 180,15"
                    fill="none" stroke="#10b981" stroke-width="2.5" />
              <!-- Minimum dot -->
              <circle cx="100" cy="98" r="6" fill="#f59e0b" stroke="#fff" stroke-width="2" />
              <text x="100" y="118" class="caption" text-anchor="middle">minimum</text>
              <!-- Loss arrow -->
              <text x="40" y="38" class="caption">loss ↑</text>
            </svg>
          </div>

          <div class="concept concept-bg-overlay">
            <svg class="concept-bg-svg" viewBox={`0 0 ${gradVizW} ${gradVizH}`} preserveAspectRatio="xMidYMid slice">
              <defs>
                <radialGradient id="grad-bowl-bg" cx="25%" cy="50%" r="55%">
                  <stop offset="0%" stop-color="#fde047" stop-opacity="0.55" />
                  <stop offset="45%" stop-color="#10b981" stop-opacity="0.22" />
                  <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
                </radialGradient>
                <marker id="grad-arrowhead" viewBox="0 -5 10 10"
                        refX="8" refY="0" markerWidth="4" markerHeight="4" orient="auto">
                  <path d="M0,-5L10,0L0,5" fill="currentColor" />
                </marker>
              </defs>

              <rect x="0" y="0" width={gradVizW} height={gradVizH} fill="url(#grad-bowl-bg)" />

              {#each gradFieldArrows as a}
                <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
                      stroke="currentColor" stroke-width={a.w}
                      opacity={a.o} marker-end="url(#grad-arrowhead)" />
              {/each}

              <ellipse cx={gradVizCx} cy={gradVizCy} rx="10" ry="7"
                       fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="1" />
              <ellipse cx={gradVizCx} cy={gradVizCy} rx="28" ry="20"
                       fill="none" stroke="#fff" stroke-opacity="0.32" stroke-width="1" />
              <ellipse cx={gradVizCx} cy={gradVizCy} rx="55" ry="40"
                       fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="1" />

              <circle cx={gradVizCx} cy={gradVizCy} r="6" fill="none"
                      stroke="#f59e0b" stroke-width="1.5" />
              <circle cx={gradVizCx} cy={gradVizCy} r="3.5" fill="#f59e0b"
                      stroke="#fff" stroke-width="1.5" />
            </svg>
            <div class="concept-fade"></div>
            <div class="concept-text concept-text-overlay">
              <h4>Gradient — the slope of the loss</h4>
              <p>
                The gradient <strong>∇ℒ</strong> is a vector with one component
                per parameter. Each component measures how loss changes when you
                nudge that parameter:
              </p>
              <div class="overlay-formula" bind:this={gradientDefinitionEl}></div>
              <p>
                It points <em>uphill</em> — the direction of steepest ascent.
                To minimize loss you walk the <strong>opposite</strong> way; the
                arrows here are exactly that <em>negative gradient</em>, longer
                where the surface is steeper.
              </p>
            </div>
          </div>
        </section>

        <!-- ============================== 02 · ALGORITHM ============================== -->
        <section>
          <h3><span class="chap">02</span><Compass size={18} strokeWidth={2} /> The algorithm</h3>
          <p>
            That's it. One step of gradient descent is just:
          </p>
          <div class="formula-display" bind:this={updateRuleEl}></div>
          <ol class="algo-steps">
            <li>Start with random parameters <strong>θ</strong> (the orange marker).</li>
            <li>Compute the gradient <strong>∇ℒ</strong> at that point.</li>
            <li>Step in the negative-gradient direction with stride <strong>γ</strong> (learning rate).</li>
            <li>Repeat until loss stops dropping.</li>
          </ol>

          <div class="knob">
            <div class="knob-head"><Zap size={16} strokeWidth={2} /> All the art is in the stride: learning rate <em class="g">γ</em></div>
            <ul class="knob-bullets">
              <li><strong>Too small:</strong> the marker creeps; you burn the whole step budget without arriving.</li>
              <li><strong>Too big:</strong> overshoots the minimum; loss bounces or diverges to infinity.</li>
              <li><strong>Just right:</strong> a smooth curve into the basin. Every problem ships with a sane default.</li>
            </ul>
            <p class="aside">
              The other dial is <strong>Training steps</strong> — how many updates one click of
              Train runs. Everything else in the optimizer panel exists to survive a γ you can't
              hand-tune. That fight is the next chapter.
            </p>
          </div>
        </section>

        <!-- ============================== 03 · THE OPTIMIZER STORY ============================== -->
        <section>
          <h3><span class="chap">03</span><Rocket size={18} strokeWidth={2} /> Six optimizers, one story</h3>
          <p>
            Every optimizer in the picker is a patch for a specific failure of the one
            before it — 170 years of <em>fix what just broke</em>. The recurring villain
            is the <strong>ravine</strong>: a valley much steeper across than along.
            Here are all four families on one, actually simulated — the dots arrive in
            their true step counts:
          </p>

          <div class="race-demo">
            <svg viewBox="0 0 {RACE_W} {RACE_H}" preserveAspectRatio="xMidYMid meet">
              <defs>
                <clipPath id="race-clip"><rect x="0" y="0" width={RACE_W} height={RACE_H} rx="10" /></clipPath>
              </defs>
              <g clip-path="url(#race-clip)">
                <image href={raceDemo.heatURL} x="0" y="0" width={RACE_W} height={RACE_H} preserveAspectRatio="none" />
                <g transform="scale({RACE_W / raceDemo.gw}, {RACE_H / raceDemo.gh})">
                  {#each raceDemo.contourPaths as cp}
                    <path d={cp.d} fill="none" stroke="#fff" stroke-opacity={cp.o} stroke-width="1" vector-effect="non-scaling-stroke" />
                  {/each}
                </g>
                {#each raceDemo.racers as r (r.name)}
                  <path
                    d={r.d}
                    fill="none"
                    stroke={r.color}
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    pathLength="100"
                    stroke-dasharray="100"
                    stroke-dashoffset="100"
                    opacity="0.92"
                  >
                    <animate attributeName="stroke-dashoffset" values="100;0;0" keyTimes="0;{r.frac};1" dur="7s" repeatCount="indefinite" />
                  </path>
                {/each}
                <!-- the basin -->
                <circle cx={raceDemo.min[0]} cy={raceDemo.min[1]} r="7" fill="none" stroke="#10b981" stroke-width="1.5" stroke-dasharray="3,2.5" />
                <!-- the shared start: the app's orange marker -->
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
            <div class="race-caption">
              Same start, each optimizer with the γ it likes best. Plain GD burns its budget
              bouncing wall to wall; Momentum cancels the bounce and glides; RMSProp and Adam
              size every parameter's step from gradient history. The numbers are steps to the basin.
            </div>
          </div>

          {#each optTree as c (c.name)}
            {#if c.act}
              <div class="opt-act">
                <span class="act-no">{c.act.no}</span>
                <span class="act-title">{c.act.title}</span>
              </div>
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
                Feel Act II yourself: pick <strong>Gaussian Peak</strong> with μ = 0 — the
                gradient out in the flats is so faint the marker stalls. Crank μ to 0.9 and
                watch it power through. The blue arrow on the marker is raw steepest descent,
                the red arrow is the step actually taken — the gap is the optimizer's personality.
              </p>
            {/if}
          {/each}

          {#if raceExperiment}
            <div class="opt-cta">
              <span>Now run the real thing:</span>
              <button class="try-btn" on:click={() => runExperiment(raceExperiment)}>
                <Play size={13} strokeWidth={2.5} />
                <span>Race them on Rosenbrock</span>
              </button>
            </div>
          {/if}
        </section>

        <!-- ============================== 04 · PROBLEMS ============================== -->
        <section>
          <h3><span class="chap">04</span><Layers size={18} strokeWidth={2} /> 22 problems to explore</h3>
          <p>
            Each problem has two parameters (α, β), a loss surface you can see live, and a
            curated default for learning rate, momentum, and visible range.
          </p>

          {#each Object.entries(problems) as [groupName, list]}
            <div class="problem-group-label">{groupName}</div>
            <div class="problem-grid">
              {#each list as p}
                <div class="problem-card">
                  <div class="problem-icon">
                    {#if p.customIcon}
                      <span class="custom-icon">{p.customIcon}</span>
                    {:else if p.icon}
                      <svelte:component this={p.icon} size={18} strokeWidth={2} />
                    {/if}
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

        <!-- ============================== 05 · EXPERIMENTS ============================== -->
        <section>
          <h3><span class="chap">05</span><FlaskConical size={18} strokeWidth={2} /> Things to try</h3>
          <p>
            Each card is a ready-made scenario — one click sets everything up,
            starts training, and tells you what to watch for.
          </p>

          {#each experiments as exp (exp.id)}
            <div class="experiment">
              <div class="experiment-text">
                <h4>{exp.title}</h4>
                <p>{exp.blurb}</p>
              </div>
              <button class="try-btn" on:click={() => runExperiment(exp)}>
                <Play size={13} strokeWidth={2.5} />
                <span>Try it</span>
              </button>
            </div>
          {/each}
        </section>

        <!-- ============================== 06 · VIZ KEY ============================== -->
        <section>
          <h3><span class="chap">06</span><Map size={18} strokeWidth={2} /> Reading the panels</h3>
          <ul class="viz-list">
            <li>
              <strong>Data plot</strong> — the data points and the current model.
              For curve fits, blue solid is the current fit, green dashed is the truth.
              For 2D problems, the orange marker shows your parameters directly on the plot.
            </li>
            <li>
              <strong>Loss & Gradient</strong> — the loss surface as a function of (α, β).
              Bright = low loss. White contour lines connect points of equal loss. Field arrows
              show the steepest-descent direction at each grid cell. On the marker itself,
              the <span style="color:#3b82f6; font-weight:600">blue arrow</span> is the local
              steepest descent (−∇ℒ) and the <span style="color:#ef4444; font-weight:600">red
              arrow</span> is the step the optimizer actually took. Drag the marker to teleport.
            </li>
            <li>
              <strong>Loss History</strong> — train and test loss vs. step number. A clean
              decline is a healthy run. Big spikes mean you're overshooting (too much γ or μ).
              A persistent gap between train and test hints at overfitting.
            </li>
          </ul>
        </section>

        <!-- ============================== 07 · KEYBOARD ============================== -->
        <section>
          <h3><span class="chap">07</span><Zap size={18} strokeWidth={2} /> Keyboard</h3>
          <div class="kbd-row">
            <span class="kbd-item"><kbd>Space</kbd> Train / Pause</span>
            <span class="kbd-item"><kbd>S</kbd> Step</span>
            <span class="kbd-item"><kbd>R</kbd> Reset</span>
            <span class="kbd-item"><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> Nudge marker <span class="kbd-note">(⇧ = bigger)</span></span>
            <span class="kbd-item"><kbd>D</kbd> 2D / 3D</span>
          </div>
        </section>
      </div>

      <footer class="modal-footer">
        <p>Built with ∂ by <strong>Neo Mohsenvand</strong></p>
        <a
          class="github-link"
          href="https://github.com/NeoVand/GradientDescent"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source on GitHub"
        >
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
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 2rem;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal-content {
    background: var(--color-bg-secondary);
    border-radius: 16px;
    max-width: 760px;
    width: 100%;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.3s ease;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .modal-header {
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .modal-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .modal-icon {
    font-family: 'Times New Roman', 'Georgia', serif;
    font-size: 2rem;
    font-style: italic;
    color: #10b981;
    line-height: 1;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.01em;
  }

  .close-btn {
    width: 36px; height: 36px;
    flex-shrink: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--color-text-tertiary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    padding: 0;
  }
  .close-btn :global(svg) { width: 22px; height: 22px; flex-shrink: 0; }
  .close-btn:hover { background: var(--color-bg-tertiary); color: var(--color-text-primary); }
  .close-btn:active { transform: scale(0.94); }

  .modal-body {
    padding: 1.25rem 1.5rem 1.5rem;
    overflow-y: auto;
    flex: 1;
  }
  .modal-body::-webkit-scrollbar { width: 8px; }
  .modal-body::-webkit-scrollbar-track { background: var(--color-bg-tertiary); border-radius: 4px; }
  .modal-body::-webkit-scrollbar-thumb { background: rgba(16, 185, 129, 0.3); border-radius: 4px; }
  .modal-body::-webkit-scrollbar-thumb:hover { background: rgba(16, 185, 129, 0.5); }

  /* ---------- Hero ---------- */
  .hero {
    position: relative;
    border-radius: 14px;
    overflow: hidden;
    margin-bottom: 2rem;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
  }
  .hero-svg {
    display: block;
    width: 100%;
    height: 200px;
  }
  .contour {
    fill: none;
    stroke: #10b981;
    stroke-width: 1.4;
  }
  .hero-text {
    position: absolute;
    top: 18px;
    left: 24px;
    right: 24px;
    pointer-events: none;
  }
  .hero-eyebrow {
    font-size: 0.78rem;
    color: var(--color-text-tertiary);
    letter-spacing: 0.03em;
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .hero-title {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--color-text-primary);
    line-height: 1.2;
    letter-spacing: -0.01em;
    margin-bottom: 6px;
  }
  .hero-subtitle {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  /* ---------- Sections ---------- */
  section {
    margin-bottom: 2rem;
  }
  section:last-of-type { margin-bottom: 0.5rem; }

  h3 {
    margin: 0 0 0.875rem 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    letter-spacing: -0.005em;
  }
  h3 :global(svg) { color: #10b981; }

  h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  p {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--color-text-secondary);
  }
  p:last-child { margin-bottom: 0; }

  ul, ol {
    margin: 0.5rem 0 0.75rem 0;
    padding-left: 1.5rem;
  }
  li {
    margin: 0.375rem 0;
    font-size: 0.875rem;
    line-height: 1.55;
    color: var(--color-text-secondary);
  }
  li strong { color: var(--color-text-primary); }
  em.g {
    font-family: Georgia, serif;
    font-style: italic;
    color: #10b981;
    font-weight: 500;
  }

  /* ---------- Concept blocks (loss & gradient) ---------- */
  .concept {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 200px;
    gap: 1.25rem;
    align-items: center;
    padding: 1rem 1.25rem;
    background: var(--color-bg-tertiary);
    border-radius: 12px;
    border: 1px solid var(--color-border);
    margin-bottom: 0.875rem;
  }
  .concept-text { min-width: 0; }
  .concept-text h4 {
    color: #10b981;
    margin-bottom: 0.5rem;
    font-size: 1rem;
  }
  .concept-svg {
    width: 100%;
    height: 120px;
    color: var(--color-text-tertiary);
  }
  .concept :global(.caption) {
    fill: var(--color-text-tertiary);
    font-size: 11px;
    font-family: inherit;
  }

  /* Overlay variant: the SVG fills the whole card and the text sits on
     the right with a left-to-right fade hiding the field underneath it. */
  .concept-bg-overlay {
    display: grid;
    /* Two columns: vector field on the left, text on the right. The right
       column's exact width must match the fade-to-opaque stop in the
       overlay so the text always sits on a fully-opaque background. */
    grid-template-columns: 1fr 50%;
    position: relative;
    padding: 0;
    overflow: hidden;
    /* No min-height — the card grows with the (right-column) text content
       and the SVG stretches to fill via background positioning. */
  }
  .concept-bg-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    color: var(--color-text-secondary);
    pointer-events: none;
  }
  /* The fade overlay: transparent on the left so the field shows through,
     opaque on the right so the text is fully readable. */
  .concept-fade {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      to right,
      transparent 0%,
      transparent 35%,
      var(--color-bg-tertiary) 50%,
      var(--color-bg-tertiary) 100%
    );
  }
  /* The text sits in the second grid column so the card height tracks the
     text — no clipping. The fade lines up because the column starts at 50%. */
  .concept-text-overlay {
    grid-column: 2;
    position: relative;
    padding: 1.25rem 1.5rem 1.25rem 1.25rem;
    z-index: 1;
    align-self: center;
  }
  .concept-text-overlay h4 { margin-top: 0; }
  .concept-text-overlay p { margin-bottom: 0.6rem; }
  .concept-text-overlay p:last-child { margin-bottom: 0; }
  .overlay-formula {
    display: block;
    margin: 0.5rem 0;
    text-align: center;
  }
  .overlay-formula :global(.katex) {
    font-size: 1rem;
    color: var(--color-text-primary);
  }

  /* ---------- Formulas ---------- */
  .formula-display {
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.22);
    border-radius: 8px;
    padding: 0.875rem 1rem;
    margin: 0.5rem 0 0.75rem 0;
    overflow-x: auto;
  }
  .formula-display :global(.katex) {
    font-size: 1.05rem;
    color: var(--color-text-primary);
  }
  .formula-inline {
    display: inline-block;
    background: rgba(16, 185, 129, 0.06);
    border: 1px solid rgba(16, 185, 129, 0.15);
    border-radius: 6px;
    padding: 0.25rem 0.6rem;
    margin: 0.25rem 0;
  }
  .formula-inline :global(.katex) {
    font-size: 0.95rem;
    color: var(--color-text-primary);
  }

  /* ---------- Algorithm steps ---------- */
  .algo-steps { padding-left: 1.5rem; }
  .algo-steps li::marker {
    color: #10b981;
    font-weight: 700;
  }
  .aside {
    font-size: 0.8125rem;
    color: var(--color-text-tertiary);
    font-style: italic;
    border-left: 3px solid rgba(16, 185, 129, 0.4);
    padding-left: 0.75rem;
    margin-top: 0.5rem;
  }

  /* ---------- Knob blocks ---------- */
  .knob {
    background: var(--color-bg-tertiary);
    border-left: 3px solid #10b981;
    border-radius: 8px;
    padding: 0.875rem 1.125rem;
    margin-bottom: 0.875rem;
  }
  .knob-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 0.4rem;
  }
  .knob-head :global(svg) { color: #10b981; }
  .knob-bullets li {
    font-size: 0.84rem;
  }

  /* ---------- Problem grid ---------- */
  .problem-group-label {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #10b981;
    margin: 0.875rem 0 0.5rem 0;
  }
  .problem-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.625rem;
  }
  .problem-card {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.625rem 0.75rem;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    transition: border-color 0.15s, transform 0.15s;
  }
  .problem-card:hover {
    border-color: rgba(16, 185, 129, 0.5);
    transform: translateY(-1px);
  }
  .problem-icon {
    width: 28px; height: 28px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #10b981;
    background: rgba(16, 185, 129, 0.1);
    border-radius: 6px;
  }
  .custom-icon {
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 0.95rem;
    font-weight: 700;
  }
  .problem-text { min-width: 0; flex: 1; }
  .problem-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 1px;
  }
  .problem-formula {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.72rem;
    color: var(--color-text-tertiary);
    margin-bottom: 1px;
  }
  .problem-tag {
    font-size: 0.72rem;
    color: var(--color-text-secondary);
    font-style: italic;
  }

  /* ---------- Experiments ---------- */
  .experiment {
    background: var(--color-bg-tertiary);
    border-left: 3px solid #10b981;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-bottom: 0.625rem;
    display: flex;
    align-items: center;
    gap: 0.875rem;
  }
  .experiment-text { flex: 1; min-width: 0; }
  .experiment h4 {
    color: #10b981;
    font-size: 0.9rem;
    margin-bottom: 0.35rem;
  }
  .experiment p { margin-bottom: 0; font-size: 0.85rem; }

  .try-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.45rem 0.8rem;
    border: 1px solid rgba(16, 185, 129, 0.45);
    border-radius: 8px;
    background: rgba(16, 185, 129, 0.1);
    color: #10b981;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .try-btn:hover {
    background: rgba(16, 185, 129, 0.22);
    border-color: #10b981;
    transform: translateY(-1px);
  }

  /* ---------- Viz list ---------- */
  .viz-list { padding-left: 1.25rem; }
  .viz-list li { margin-bottom: 0.5rem; }

  /* ---------- Chapter numbers ---------- */
  .chap {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.6875rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #10b981;
    background: rgba(16, 185, 129, 0.1);
    border-radius: 5px;
    padding: 0.1rem 0.35rem;
  }

  /* ---------- The optimizer story ---------- */
  .race-demo {
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 0.5rem 0.5rem 0.6rem;
    margin: 0.75rem 0 0.9rem;
    background: var(--color-bg-primary);
  }

  .race-demo svg {
    width: 100%;
    display: block;
  }

  .race-legend {
    display: flex;
    justify-content: center;
    gap: 0.9rem;
    flex-wrap: wrap;
    margin-top: 0.45rem;
  }

  .race-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .race-swatch {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    display: inline-block;
  }

  .race-caption {
    font-size: 0.75rem;
    color: var(--color-text-tertiary);
    text-align: center;
    margin-top: 0.3rem;
    line-height: 1.45;
  }

  .opt-act {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin: 1.1rem 0 0.5rem;
    padding-top: 0.7rem;
    border-top: 1px dashed var(--color-border);
  }

  .act-no {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.625rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #f59e0b;
  }

  .act-title {
    font-weight: 700;
    font-size: 0.875rem;
    color: var(--color-text-primary);
  }

  .opt-card {
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-bg-primary);
    padding: 0.7rem 0.85rem 0.6rem;
    margin-bottom: 0.6rem;
  }

  .opt-card.prereq-card {
    border-style: dashed;
  }

  .opt-head {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.25rem;
  }

  .opt-year {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.625rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #10b981;
    background: rgba(16, 185, 129, 0.12);
    border-radius: 5px;
    padding: 0.1rem 0.4rem;
  }

  .opt-name {
    font-weight: 700;
    font-size: 0.9375rem;
    color: var(--color-text-primary);
  }

  .opt-by {
    font-size: 0.7188rem;
    color: var(--color-text-tertiary);
  }

  .opt-idea {
    font-size: 0.8125rem;
    line-height: 1.55;
    margin: 0.25rem 0 0.4rem;
  }

  .opt-formula {
    overflow-x: auto;
    padding: 0.15rem 0;
  }

  .opt-formula :global(.katex) {
    font-size: 1rem;
  }

  .opt-foot {
    display: flex;
    gap: 0.5rem 1.25rem;
    flex-wrap: wrap;
    font-size: 0.75rem;
    font-weight: 600;
    margin-top: 0.4rem;
  }

  .opt-fix { color: #10b981; }
  .opt-break { color: #f59e0b; }

  .opt-cta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-top: 0.75rem;
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
  }

  /* ---------- Keyboard ---------- */
  .kbd-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.625rem 1.25rem;
    align-items: center;
  }

  .kbd-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
  }

  .kbd-item kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--color-border);
    border-bottom-width: 2px;
    border-radius: 6px;
    background: var(--color-bg-primary);
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--color-text-primary);
  }

  .kbd-note {
    font-size: 0.6875rem;
    opacity: 0.7;
  }

  /* ---------- Footer ---------- */
  .modal-footer {
    border-top: 1px solid var(--color-border);
    padding: 0.875rem 1.5rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .modal-footer p {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-text-tertiary);
  }
  .modal-footer strong { color: #10b981; font-weight: 600; }
  .github-link {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-secondary);
    text-decoration: none;
    font-size: 0.8125rem;
    font-weight: 500;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  .github-link:hover {
    color: #10b981;
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.08);
  }
  .github-link :global(svg) { width: 18px; height: 18px; flex-shrink: 0; }

  /* ---------- Mobile ---------- */
  @media (max-width: 768px) {
    .modal-backdrop { padding: 0.5rem; }
    .modal-content { max-height: 95dvh; border-radius: 14px; }
    .modal-header { padding: 0.875rem 1rem; }
    .modal-header h2 { font-size: 1.1rem; }
    .modal-icon { font-size: 1.5rem; }
    .modal-body { padding: 1rem; }
    .modal-footer { padding: 0.75rem 1rem; }

    .hero-svg { height: 150px; }
    .hero-text { top: 12px; left: 16px; right: 16px; }
    .hero-title { font-size: 1.05rem; }
    .hero-subtitle { font-size: 0.78rem; }
    .hero-eyebrow { font-size: 0.7rem; }

    .concept {
      grid-template-columns: 1fr;
    }
    .concept-svg { height: 100px; }

    /* On mobile, drop the overlay layout: stack SVG on top, text below. */
    .concept-bg-overlay {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .concept-bg-svg {
      position: relative;
      height: 110px;
      flex-shrink: 0;
    }
    .concept-fade { display: none; }
    .concept-text-overlay {
      position: relative;
      width: 100%;
      padding: 1rem 1.25rem;
    }

    .problem-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
