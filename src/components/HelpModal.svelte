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
    Compass, Rocket, Zap, GraduationCap,
    BookOpen, FlaskConical, Layers, Map, Play, Pause, RotateCcw, Keyboard,
    FileText, MountainSnow, TrendingUpDown, Ruler, Gauge
  } from 'lucide-svelte';
  import katex from 'katex';
  import 'katex/dist/katex.min.css';
  import { rgb, geoPath } from 'd3';
  import { contours } from 'd3-contour';
  import { interpolateViridis, interpolateCubehelixDefault } from 'd3-scale-chromatic';
  import { experiments, chapterPresets } from '../utils/experiments';
  import { schedules, scheduleOrder } from '../utils/schedules';
  import { optimizers, optimizerOrder, defaultHyper, type OptimizerId } from '../utils/optimizers';
  import GuideVizLayers from './GuideVizLayers.svelte';
  import ChapterCta from './ChapterCta.svelte';
  import { enterCourseFromChapter, startCourseIntro } from '../utils/lessons';
  import {
    tintGridURL, contourPathsFor, fieldArrows, colormapStops, cmapStopColors,
    CONTOUR_N, FIELD_RES, GUIDE_VIZ_DEFAULT, type VizState
  } from '../utils/guideViz';
  import { themeStore } from '../stores/stores';
  import { formulas } from '../content/formulas';
  import { optTree, OPT_CITE } from '../content/optimizerCards';
  import { problemCards } from '../content/problemCards';
  import { chRefs } from '../content/chapterRefs';
  import { guideParts, guideChapters, chapterLesson } from '../content/registry';

  // Day/dark for the guide's heatmap figures (ravine + race). The figures were
  // authored for dark; day flips to "dark basins on light" (see tintGridURL).
  $: gTheme = $themeStore;
  $: gDark = gTheme === 'dark';

  export let isOpen = false;
  export let onClose: () => void;
  /** Open scrolled to this chapter slug (deep links); null = top of the book. */
  export let initialChapter: string | null = null;

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

  // Chapters whose concept has a hands-on lesson in the guided course — the
  // mapping lives in the registry so every surface shares one spine.
  const chLesson = chapterLesson;

  // Close the book and drop the reader into the lesson for this chapter.
  function startLessonFromChapter(chId: string) {
    const lessonId = chLesson[chId];
    if (!lessonId) return;
    onClose();
    enterCourseFromChapter(lessonId);
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
  // Same, but for our own trusted content strings that carry real markup
  // (<em>, <strong>) alongside $math$ — no escaping, math still KaTeX'd.
  const mathHtml = (src: string) =>
    src.split(/\$([^$]+)\$/).map((seg, i) => (i % 2 === 1 ? tex(seg) : seg)).join('');

  // ---------- The table of contents (drives the rail + scroll-spy) ----------
  // Built from the registry: parts and chapters in reading order, numbers
  // derived — never hand-typed.
  type TocEntry = { part?: string; id?: string; title?: string };
  const toc: TocEntry[] = guideParts.flatMap(p => [
    { part: p.title },
    ...p.chapters.map(c => ({ id: c.slug, title: c.title }))
  ]);
  const chapters = guideChapters;

  let bodyEl: HTMLElement;
  let activeId = 'ch-bowl';
  let progress = 0;

  function onScroll() {
    if (!bodyEl) return;
    const max = bodyEl.scrollHeight - bodyEl.clientHeight;
    progress = max > 0 ? bodyEl.scrollTop / max : 0;
    const base = bodyEl.getBoundingClientRect().top;
    let cur = chapters[0].slug;
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

  // Opening the book: land at the top, or — for a chapter deep link — jump
  // straight to that chapter (instantly, not smoothly: it's an arrival).
  let prevOpen = false;
  $: if (isOpen !== prevOpen) {
    prevOpen = isOpen;
    if (isOpen) {
      const target = initialChapter && chapters.some(c => c.slug === initialChapter)
        ? initialChapter
        : chapters[0].slug;
      activeId = target;
      progress = 0;
      const jump = () => {
        if (!bodyEl) return;
        if (target === chapters[0].slug) {
          bodyEl.scrollTop = 0;
        } else {
          bodyEl.querySelector(`section[data-ch="${target}"]`)?.scrollIntoView({ block: 'start' });
        }
        onScroll();
      };
      requestAnimationFrame(jump);
      // Figures settle (and the browser's scroll restoration fires) a beat
      // after mount, either of which can shove a deep-linked chapter off
      // target — re-assert once things quiet down.
      if (initialChapter) setTimeout(jump, 450);
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }
  function handleKeydown(e: KeyboardEvent) {
    if (isOpen && e.key === 'Escape') onClose();
  }


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
      vals, visMin: vMin, visMax: vMax,
      domain: { x0: X0, x1: X1, y0: Y0, y1: Y1 }, grad, px, py,
      start: [px(start[0]), py(start[1])],
      min: [px(minPt[0]), py(minPt[1])]
    };
  })();

  // ---- Reactive Layers state for the race figure ----
  let raceViz: VizState = { ...GUIDE_VIZ_DEFAULT };
  const raceLogMin = Math.log(raceDemo.visMin + 0.001);
  const raceLogMax = Math.log(raceDemo.visMax + 0.001);
  $: raceHeat = tintGridURL(raceDemo.vals, raceDemo.gw, raceDemo.gh, raceLogMin, raceLogMax, raceViz.colormap, gTheme);
  $: raceCont = raceViz.contours
    ? contourPathsFor(raceDemo.vals, raceDemo.gw, raceDemo.gh, raceLogMin, raceLogMax, CONTOUR_N[raceViz.density])
    : [];
  $: raceArrows = raceViz.field === 'arrows'
    ? fieldArrows(raceDemo.grad, raceDemo.domain, { px: raceDemo.px, py: raceDemo.py }, FIELD_RES[raceViz.density])
    : [];

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
    // Arrows follow −∇ of the elliptical bowl the contours draw (rx:ry = 55:40),
    // i.e. (dx/rx², dy/ry²) — normal to the rings, not aimed at the centre, so
    // the figure obeys the perpendicularity rule the chapter teaches.
    const ky = (55 / 40) ** 2;
    for (let j = 1; j <= rows; j++) {
      for (let i = 1; i <= cols; i++) {
        const ox = i * stepX, oy = j * stepY;
        const dx = gradVizCx - ox, dy = gradVizCy - oy;
        const m = Math.sqrt(dx * dx + dy * dy);
        if (m < 5) { raw.push({ gx: 0, gy: 0, ox, oy, m: 0 }); continue; }
        const gx = dx, gy = dy * ky;
        const gm = Math.sqrt(gx * gx + gy * gy);
        raw.push({ gx: gx / gm, gy: gy / gm, ox, oy, m });
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
    const W = 460, H = 345;               // 4:3 — a taller cross-section of the valley
    const X0 = -1.18, X1 = 0.36, Y0 = -0.72, Y1 = 0.72;
    const ax = 0.05, ay = 1.0;            // gentle along x, steep across y
    const loss = (x: number, y: number) => 0.5 * (ax * x * x + ay * y * y);
    const grad = (x: number, y: number): [number, number] => [ax * x, ay * y];
    const sx = (x: number) => ((x - X0) / (X1 - X0)) * W;
    const sy = (y: number) => ((Y1 - y) / (Y1 - Y0)) * H;

    // Raw value grid (the heatmap, contours and field are derived reactively
    // from this so the Layers control can re-tint / re-draw without a recompute).
    const gw = 124, gh = 96;
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

    const start: Pt = { x: -1.02, y: 0.58 };
    // Run long enough that the gentle (x) axis actually reaches the floor — both
    // trajectories converge onto the minimum at the origin, not a hair short of it.
    const simGD = () => {
      const g = 1.72; let p = { ...start }; const out: Pt[] = [{ ...p }];
      for (let k = 0; k < 80; k++) { p = { x: p.x - g * ax * p.x, y: p.y - g * ay * p.y }; out.push({ ...p }); }
      return out;
    };
    const simMom = () => {
      const g = 0.6, mu = 0.86; let v = { x: 0, y: 0 }, p = { ...start }; const out: Pt[] = [{ ...p }];
      for (let k = 0; k < 82; k++) { v = { x: mu * v.x + ax * p.x, y: mu * v.y + ay * p.y }; p = { x: p.x - g * v.x, y: p.y - g * v.y }; out.push({ ...p }); }
      return out;
    };
    const toScreen = (arr: Pt[]) => arr.map(p => ({ x: sx(p.x), y: sy(p.y) }));
    // The line traces every iterate; the dots are thinned by screen distance so
    // they don't pile into a blob as the tiny end-steps crawl onto the minimum.
    const decimate = (pts: Pt[], minD: number) => {
      const out: Pt[] = [pts[0]]; let last = pts[0];
      for (let i = 1; i < pts.length - 1; i++) {
        if (Math.hypot(pts[i].x - last.x, pts[i].y - last.y) >= minD) { out.push(pts[i]); last = pts[i]; }
      }
      out.push(pts[pts.length - 1]);
      return out;
    };
    const gdScreen = toScreen(simGD()), momScreen = toScreen(simMom());
    const path = (pts: Pt[]) => 'M ' + pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ');
    return { W, H, gw, gh, vals, visMin: vMin, visMax: vMax,
      domain: { x0: X0, x1: X1, y0: Y0, y1: Y1 }, grad, px: sx, py: sy,
      gd: path(gdScreen), mom: path(momScreen),
      gdPts: decimate(gdScreen, 6.5), momPts: decimate(momScreen, 6.5),
      min: { x: sx(0), y: sy(0) }, start: { x: sx(start.x), y: sy(start.y) } };
  })();

  // ---- Reactive Layers state for the ravine figure ----
  let ravineViz: VizState = { ...GUIDE_VIZ_DEFAULT };
  const ravLogMin = Math.log(ravineFig.visMin + 0.001);
  const ravLogMax = Math.log(ravineFig.visMax + 0.001);
  $: ravHeat = tintGridURL(ravineFig.vals, ravineFig.gw, ravineFig.gh, ravLogMin, ravLogMax, ravineViz.colormap, gTheme);
  $: ravCont = ravineViz.contours
    ? contourPathsFor(ravineFig.vals, ravineFig.gw, ravineFig.gh, ravLogMin, ravLogMax, CONTOUR_N[ravineViz.density])
    : [];
  $: ravArrows = ravineViz.field === 'arrows'
    ? fieldArrows(ravineFig.grad, ravineFig.domain, { px: ravineFig.px, py: ravineFig.py }, FIELD_RES[ravineViz.density])
    : [];

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

  // Derivative figure A: chords through a shrinking nudge settling onto the
  // tangent — the limit, drawn. Real y = x² geometry, not a sketch. Chords
  // run point-to-point on the curve (no stray line ends); only the tangent
  // extends, gently, past the anchor.
  const secantFig = (() => {
    const W = 300, H = 140, a = 1.0;
    const xMin = -0.3, xMax = 3.2, yMax = xMax * xMax;
    const px = (x: number) => 14 + ((x - xMin) / (xMax - xMin)) * (W - 28);
    const py = (y: number) => H - 20 - (y / yMax) * (H - 40);
    const N = 48;
    const curve = 'M ' + Array.from({ length: N + 1 }, (_, i) => {
      const x = xMin + (i / N) * (xMax - xMin);
      return `${px(x).toFixed(1)},${py(x * x).toFixed(1)}`;
    }).join(' L ');
    const at = (x: number) => ({ x: px(x), y: py(x * x) });
    const chords = [1.9, 1.15, 0.6].map((h, i) => ({
      x1: at(a).x, y1: at(a).y, x2: at(a + h).x, y2: at(a + h).y,
      end: at(a + h), o: 0.3 + i * 0.18
    }));
    // The tangent (slope 2a), drawn a touch past the point on both sides.
    const tan = (x: number) => a * a + 2 * a * (x - a);
    const tangent = { x1: px(a - 0.75), y1: py(tan(a - 0.75)), x2: px(a + 1.15), y2: py(tan(a + 1.15)) };
    return { W, H, curve, chords, tangent, p: at(a), pEnd: at(a + 1.9) };
  })();

  // Derivative figure B: the two partial-derivative slices of a real bowl
  // z = 0.16x² + 0.32y², drawn in the app's own 3-D language — a rim, two
  // contour rings, and the two slice curves through the marked point, each
  // with a short one-way tangent arrow. Freezing β gives the blue curve;
  // freezing α the amber one.
  const sliceFig = (() => {
    const W = 340, H = 176, cx = 170, cy = 112, sx = 24, sy = 10, sz = 34;
    const z = (x: number, y: number) => 0.16 * x * x + 0.32 * y * y;
    const P = (x: number, y: number) => ({
      X: cx + (x - y) * sx,
      Y: cy + (x + y) * sy - z(x, y) * sz
    });
    const path = (pts: { X: number; Y: number }[], close = false) =>
      'M ' + pts.map(q => `${q.X.toFixed(1)},${q.Y.toFixed(1)}`).join(' L ') + (close ? ' Z' : '');
    const span = (f: (t: number) => { X: number; Y: number }, n = 36) =>
      Array.from({ length: n + 1 }, (_, i) => f(-2 + (4 * i) / n));
    // The surface patch's four boundary edges: the back pair sits faint, the
    // front pair carries the silhouette.
    const edgeBack = [path(span(y => P(-2, y))), path(span(x => P(x, -2)))];
    const edgeFront = [path(span(y => P(2, y))), path(span(x => P(x, 2)))];
    // Two level rings (z = c), the same contour rings the live 3-D view draws.
    const ring = (c: number) => path(Array.from({ length: 49 }, (_, i) => {
      const t = (i / 48) * 2 * Math.PI;
      return P(Math.sqrt(c / 0.16) * Math.cos(t), Math.sqrt(c / 0.32) * Math.sin(t));
    }), true);
    const rings = [ring(0.22), ring(0.58)];
    const p0 = { x: 0.9, y: 0.55 };
    const sliceA = path(span(x => P(x, p0.y)));            // β frozen → vary α
    const sliceB = path(span(y => P(p0.x, y)));            // α frozen → vary β
    const pt = P(p0.x, p0.y);
    // One-way tangent arrows from the point, along each slice.
    const arrow = (dX: number, dY: number, len: number, gap: number) => {
      const m = Math.hypot(dX, dY);
      return { x1: pt.X + (dX / m) * gap, y1: pt.Y + (dY / m) * gap,
               x2: pt.X + (dX / m) * (gap + len), y2: pt.Y + (dY / m) * (gap + len) };
    };
    const arrA = arrow(sx, sy - 0.32 * p0.x * sz, 30, 7);        // d/dx
    const arrB = arrow(-sx, sy - 0.64 * p0.y * sz, 30, 7);       // d/dy
    return { W, H, edgeBack, edgeFront, rings, sliceA, sliceB, pt, arrA, arrB };
  })();

  // Curvature figure A: same slope underfoot, two different futures — a tight
  // curve and a relaxed one sharing one tangent at the marked point. Curve
  // ends are where the labels live, clear of all three lines.
  const bendFig = (() => {
    // Screen y grows DOWNWARD, so a loss curve that bends UP (positive λ)
    // needs its quadratic term SUBTRACTED. Staged as a descent to the right:
    // the sharp curve bottoms out and curls back up; the gentle one keeps
    // rolling — same tangent at the marker.
    const W = 300, H = 126, x0 = 104, y0 = 82, m = 0.35;
    const mk = (c: number, lo: number, hi: number) => {
      const f = (dx: number) => y0 + m * dx - c * dx * dx;
      const pts: string[] = [];
      for (let dx = lo; dx <= hi; dx += 4) pts.push(`${(x0 + dx).toFixed(1)},${f(dx).toFixed(1)}`);
      return { d: 'M ' + pts.join(' L '), end: { x: x0 + hi, y: f(hi) } };
    };
    const sharp = mk(0.0075, -78, 88);
    const gentle = mk(0.0015, -92, 118);
    return { W, H, x0, y0, sharp, gentle,
      tan: { x1: x0 - 86, y1: y0 + m * -86, x2: x0 + 100, y2: y0 + m * 100 } };
  })();

  // Curvature figure B: the (1 − γλ) multiplier, run honestly. Four regimes of
  // real gradient descent on y = x², dots at α_k = (1−γλ)^k · α₀.
  const regimeFig = (() => {
    const PW = 110, H = 128, pad = 14;
    const panel = (gl: number, a0: number, latex: string, word: string, i: number) => {
      const ox = i * PW;
      const px = (x: number) => ox + PW / 2 + x * (PW / 2 - pad);
      const py = (y: number) => H - 34 - y * (H - 62);
      const N = 30;
      const curve = 'M ' + Array.from({ length: N + 1 }, (_, k) => {
        const x = -1.12 + (2.24 * k) / N;
        return `${px(x).toFixed(1)},${py(x * x).toFixed(1)}`;
      }).join(' L ');
      const dots: { x: number; y: number }[] = [];
      let aK = a0;
      for (let k = 0; k <= 6 && Math.abs(aK) <= 1.12; k++) {
        dots.push({ x: px(aK), y: py(aK * aK) });
        aK = (1 - gl) * aK;
      }
      const hops = 'M ' + dots.map(d => `${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(' L ');
      return { ox, curve, dots, hops, latex, word, lx: ox + PW / 2 };
    };
    // The diverging run starts closer in, so its growing bounces stay on
    // stage long enough to be seen growing.
    return { W: PW * 4, H, PW, panels: [
      panel(0.35, -1, String.raw`\gamma\lambda = 0.35`, 'glide', 0),
      panel(1.0, -1, String.raw`\gamma\lambda = 1`, 'one hop', 1),
      panel(1.75, -1, String.raw`\gamma\lambda = 1.75`, 'bounce in', 2),
      panel(2.2, -0.5, String.raw`\gamma\lambda = 2.2`, 'diverge', 3)
    ] };
  })();

  // Proof figure, right panel: the rate of change ‖∇ℒ‖cosφ as the direction u
  // sweeps from along ∇ℒ (φ=0, max) through a contour (φ=90°, zero) to −∇ℒ
  // (φ=180°, min). A plain cosine — the claim, plotted.
  const proofCurve = (() => {
    const x0 = 252, x1 = 378, yc = 80, amp = 46, N = 60;
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

  // 7) The shape of the landscape. Left: a 1-D loss with a shallow local min and
  // a deep global min split by a ridge — two starts on either side roll to
  // different basins. Right: a 2-D saddle (x²−y²) as a density, where −∇f flows
  // IN along one axis and OUT along the other.
  const shapesFig = (() => {
    const PX0 = 16, PX1 = 244, PYt = 24, PYb = 150, Lmin = 0.1, Lmax = 0.86;
    const L = (x: number) => 0.78
      - 0.34 * Math.exp(-((x - 0.30) ** 2) / (2 * 0.055 ** 2))
      - 0.60 * Math.exp(-((x - 0.74) ** 2) / (2 * 0.062 ** 2));
    const sx = (x: number) => PX0 + x * (PX1 - PX0);
    const sy = (v: number) => PYb - ((v - Lmin) / (Lmax - Lmin)) * (PYb - PYt);
    const pts: Pt[] = [];
    for (let i = 0; i <= 150; i++) { const x = i / 150; pts.push({ x: sx(x), y: sy(L(x)) }); }
    const curveD = 'M ' + pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ');
    let ridge = 0.52, best = -Infinity;
    for (let x = 0.42; x <= 0.64; x += 0.001) { const v = L(x); if (v > best) { best = v; ridge = x; } }
    const areaPath = (a: number, b: number) => {
      let d = `M ${sx(a).toFixed(1)},${PYb}`;
      for (let i = 0; i <= 90; i++) { const x = a + (b - a) * (i / 90); d += ` L ${sx(x).toFixed(1)},${sy(L(x)).toFixed(1)}`; }
      return d + ` L ${sx(b).toFixed(1)},${PYb} Z`;
    };
    const mk = (x: number) => ({ x: sx(x), y: sy(L(x)) });
    // 2-D saddle density (linear normalize — values straddle zero). A 4:3 panel
    // so the square x²−y² domain doesn't read as squished, in the same cubehelix
    // spectrum the ravine / landscape panels default to.
    const SW = 190, SH = 143, gw = 60, gh = 44;
    const f = (x: number, y: number) => x * x - y * y;
    const vals: number[] = new Array(gw * gh);
    let vmin = Infinity, vmax = -Infinity;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const v = f(-1 + 2 * ((i + 0.5) / gw), 1 - 2 * ((j + 0.5) / gh));
      vals[j * gw + i] = v; if (v < vmin) vmin = v; if (v > vmax) vmax = v;
    }
    const canvas = document.createElement('canvas'); canvas.width = gw; canvas.height = gh;
    const ctx = canvas.getContext('2d')!; const img = ctx.createImageData(gw, gh);
    for (let k = 0; k < vals.length; k++) {
      const col = rgb(interpolateCubehelixDefault(1 - (vals[k] - vmin) / (vmax - vmin)));
      img.data[k * 4] = col.r; img.data[k * 4 + 1] = col.g; img.data[k * 4 + 2] = col.b; img.data[k * 4 + 3] = 220;
    }
    ctx.putImageData(img, 0, 0);
    const saddleURL = canvas.toDataURL();
    const levels: number[] = []; for (let k = 1; k < 8; k++) levels.push(vmin + (k / 8) * (vmax - vmin));
    const toPath = geoPath();
    const saddleContours = contours().size([gw, gh]).thresholds(levels)(vals).map(poly => toPath(poly) ?? '');
    // The little cross of slope arrows, centred and scaled to the panel: inward
    // along x (downhill into the centre), outward along y (uphill out of it).
    const cxS = SW / 2, cyS = SH / 2;
    const hOut = SW * 0.19, hIn = SW * 0.095, vIn = SH * 0.14, vOut = SH * 0.265;
    const saddleArrows = [
      { x1: cxS + hOut, y1: cyS, x2: cxS + hIn, y2: cyS },
      { x1: cxS - hOut, y1: cyS, x2: cxS - hIn, y2: cyS },
      { x1: cxS, y1: cyS - vIn, x2: cxS, y2: cyS - vOut },
      { x1: cxS, y1: cyS + vIn, x2: cxS, y2: cyS + vOut }
    ];
    return {
      curveD, PYb, ridgeX: sx(ridge),
      leftBasin: areaPath(0, ridge), rightBasin: areaPath(ridge, 1),
      startA: mk(0.45), startB: mk(0.59), localMin: mk(0.30), globalMin: mk(0.74),
      SW, SH, gw, gh, saddleURL, saddleContours, cxS, cyS, saddleArrows
    };
  })();

  // 8) Generalization — training loss falls forever, but test loss (held-out
  // data) bottoms out then climbs as the model starts fitting noise. The dip is
  // where early stopping wants to stop.
  const genFig = (() => {
    const W = 460, H = 188, padL = 40, padR = 16, padT = 18, padB = 34;
    const train = (t: number) => 0.9 * Math.exp(-3.4 * t) + 0.05;
    const test = (t: number) => 0.9 * Math.exp(-3.4 * t) + 0.13 + 0.92 * t * t;
    const Lo = 0, Hi = 1.12;
    const sx = (t: number) => padL + t * (W - padL - padR);
    const sy = (v: number) => (H - padB) - ((v - Lo) / (Hi - Lo)) * (H - padT - padB);
    const line = (f: (t: number) => number) => {
      const pts: string[] = [];
      for (let i = 0; i <= 100; i++) { const t = i / 100; pts.push(`${sx(t).toFixed(1)},${sy(f(t)).toFixed(1)}`); }
      return 'M ' + pts.join(' L ');
    };
    // test minimum (early-stop point)
    let tStar = 0, best = Infinity;
    for (let i = 0; i <= 200; i++) { const t = i / 200; const v = test(t); if (v < best) { best = v; tStar = t; } }
    return {
      W, H, padL, padB, padT,
      trainD: line(train), testD: line(test),
      x0: sx(0), x1: sx(1), yBase: sy(Lo),
      stop: { x: sx(tStar), y: sy(test(tStar)), yTop: sy(Hi) },
      trainEnd: { x: sx(1), y: sy(train(1)) }, testEnd: { x: sx(1), y: sy(test(1)) },
      testStart: { x: sx(0), y: sy(test(0)) }
    };
  })();

  const chIcon: Record<string, any> = {
    'ch-bowl': BookOpen, 'ch-landscape': Mountain, 'ch-shapes': MountainSnow,
    'ch-derivative': Ruler, 'ch-curvature': Gauge,
    'ch-downhill': TrendingDown,
    'ch-step': Compass, 'ch-gamma': Zap, 'ch-optimizers': Rocket, 'ch-noise': Waves,
    'ch-schedule': Activity, 'ch-generalize': TrendingUpDown,
    'ch-problems': Layers, 'ch-experiments': FlaskConical, 'ch-panels': Map, 'ch-keys': Keyboard
  };

  // Problem-card icons: content ids → lucide components. The mapping lives
  // here so src/content stays pure data (the print export ignores icons).
  const probIcon: Record<string, any> = {
    'trending-up': TrendingUp, 'activity': Activity, 'trending-down': TrendingDown,
    'waves': Waves, 'mountain': Mountain, 'percent': Percent, 'target': Target,
    'radio': Radio, 'scatter-chart': ScatterChart, 'brain': Brain
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
                  <span class="toc-title">{@html mathText(t.title ?? '')}</span>
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

            <!-- Prefer learning by doing? Launch the guided course. Most
                 teaching chapters below open a matching lesson or demo. -->
            <div class="course-banner">
              <div class="course-banner-text">
                <strong>Prefer to learn by doing?</strong>
                <span>Take the guided course — ten short predict-then-run lessons. Most teaching chapters below open a matching lesson or live demo.</span>
              </div>
              <button class="course-banner-btn" on:click={() => { onClose(); startCourseIntro(); }}>
                <GraduationCap size={15} strokeWidth={2.3} />
                <span>Start the course</span>
              </button>
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
                Here every machine has exactly <strong>two</strong> knobs, called <em class="g">{@html tex(String.raw`\alpha`)}</em>
                and <em class="g">{@html tex(String.raw`\beta`)}</em> (alpha and beta). Together they are the model’s
                <strong>parameters</strong> — the numbers that decide how it behaves. Choose values
                for {@html tex(String.raw`\alpha`)} and {@html tex(String.raw`\beta`)} and the model makes a <strong>prediction</strong> for every input.
                Compare those predictions with the real answers and you get the <strong>loss</strong>:
                one number for how wrong the model is right now. Lower is better; a perfect fit sits
                near zero.
              </p>
              <p>
                That is the whole game — <em>find the {@html tex(String.raw`\alpha`)} and {@html tex(String.raw`\beta`)} that make the loss as small as
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
                <strong>mean squared error</strong>: take each prediction <em>{@html tex(String.raw`\hat{y}`)}</em>, subtract the
                true value <em>y</em>, square the gap so that overshooting and undershooting both
                count as wrong, and average over all <em>n</em> data points.
              </p>
              <div class="formula-display">{@html texD(formulas.lossDefinition)}</div>
              <p class="aside">
                <strong>Reading the symbols</strong> — your first formula, decoded once and for
                all: {@html tex(String.raw`\Sigma`)} (capital sigma) means “add up one copy per
                data point” — a for-loop, in Greek; the subscript {@html tex(String.raw`i`)} names
                <em>which</em> data point; and the hat on {@html tex(String.raw`\hat{y}`)} marks a
                <em>prediction</em> (say “y-hat” — bare {@html tex(String.raw`y`)} is always the
                truth). Every formula in this book is built from pieces this small.
              </p>
              <p>
                The squaring is the quiet hero here: it punishes a big miss far more than a small one,
                and it makes the loss a smooth, rounded <em>bowl</em> rather than a creased tent — and
                a smooth bowl is exactly what lets us roll downhill in the chapters ahead.
              </p>
              <p>
                Squared error is the right “how wrong” when the answer is a <em>number</em>. But several
                problems here ask a <em>yes/no</em> question — is this point inside the circle? on which
                side of the line? — and there the model outputs a <strong>probability</strong>
                {@html tex(String.raw`\hat{y}\in(0,1)`)} that the answer is “yes” (read
                {@html tex(String.raw`(0,1)`)} as “any number strictly between 0 and 1” — not a
                coordinate pair). Where does a probability come from? The model computes a plain
                score — any number at all — and squashes it through the S-shaped
                <strong>sigmoid</strong> {@html tex(String.raw`\sigma`)}, which bends the whole
                number line smoothly into {@html tex(String.raw`(0,1)`)}: hugely positive scores
                land near 1, hugely negative near 0, a score of zero at an honest ½. You will spot
                {@html tex(String.raw`\sigma`)} doing exactly this in the zoo’s classifier
                formulas. The natural loss for a probability is <strong>cross-entropy</strong>
                (log-loss):
              </p>
              <div class="formula-display">{@html texD(String.raw`\mathcal{L} = -\big[\,y\,\log \hat{y} + (1-y)\,\log(1-\hat{y})\,\big]`)}</div>
              <p>
                It is gentle when the model is confidently right and brutal when it is confidently wrong:
                predict {@html tex(String.raw`\hat{y}=0.99`)} while the truth is {@html tex(String.raw`y=0`)}
                and the penalty is already {@html tex(String.raw`-\log(0.01) \approx 4.6`)} — and it
                climbs toward infinity as the confidence approaches certainty. In plain words,
                cross-entropy scores the model by <em>how much probability it placed on what
                actually happened</em> (statisticians call that quantity the likelihood; this loss
                is its negative logarithm) — which is why it, not squared error, is the standard
                loss for classification: squared error for numbers, cross-entropy for categories.
              </p>
              {#if chapterPresets['ch-bowl']}
                <ChapterCta demo={() => runPreset('ch-bowl')} demoLabel={chapterPresets['ch-bowl'].title} />
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
                it is a number <em>for every possible setting of the knobs.</em> Pick one {@html tex(String.raw`(\alpha, \beta)`)} and
                you get a loss. Nudge to a nearby pair and you get a slightly different loss. Sweep
                across <strong>all</strong> pairs and those losses trace out a <strong>surface</strong>:
                a landscape floating above the flat plane of every possible {@html tex(String.raw`\alpha`)} and {@html tex(String.raw`\beta`)}.
              </p>
              <p>
                Low places in that landscape are good models; high places are bad ones.
                <em>Training is simply walking downhill on this surface</em>, and the orange marker
                is you, standing somewhere on it.
              </p>
              <p>
                The <strong>Loss &amp; Gradient</strong> panel is a map of that landscape seen from
                straight above. {#if gDark}<strong>Brighter colours are lower</strong> (better) loss;
                dark is high.{:else}<strong>Deeper, richer colours are lower</strong> (better) loss;
                the pale wash is high.{/if} (The panel’s colour bar always shows which end is low.)
                The thin loops are <strong>contour lines</strong> — exactly like a
                hiking map: each loop joins points of equal loss, and loops bunched tightly together
                mean a steep slope. Flip the panel to <strong>3D</strong> and the same map lifts into
                real hills and valleys you can rotate.
              </p>
              <aside class="hd-note">
                <span class="hd-note-tag">In a billion dimensions</span>
                <p>
                  One luxury to savor while you have it: this app draws the <em>entire, exact</em>
                  loss surface, because two knobs are all there are. A real network’s surface lives
                  in a billion dimensions, so every landscape picture you will ever see of one is a
                  two-dimensional <em>slice</em> — pick two directions, sweep them, plot. And raw
                  slices lie: scaling tricks inside networks stretch some directions and shrink
                  others, so honest pictures need careful normalization (that is the “filter
                  normalization” of Li et al., 2018, in the reading list below). Here, and almost
                  nowhere else, what you see is the whole truth.
                </p>
              </aside>
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
                Look at the Loss &amp; Gradient panel right now: the {gDark ? 'bright' : 'deep-coloured'}
                dimple at the centre of the rings is where the loss is lowest, and the marker is
                trying to reach it.
              </p>
              {#if chapterPresets['ch-landscape']}
                <ChapterCta demo={() => runPreset('ch-landscape')} demoLabel={chapterPresets['ch-landscape'].title} />
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

            <!-- ============== 3 · WHEN THE BOWL ISN'T A BOWL ============== -->
            <section data-ch="ch-shapes" id="ch-shapes">
              <h3><svelte:component this={chIcon['ch-shapes']} size={18} strokeWidth={2} /> When the bowl isn’t a bowl</h3>

              <p>
                So far the landscape has been one tidy bowl with a single lowest point. That is the
                exception, not the rule. A real loss surface can ripple with many dips, rise into
                ridges, and stretch into near-flat plains — and each of those features changes what
                gradient descent does.
              </p>
              <p>
                A dip lower than everything around it is a <strong>local minimum</strong>; the single
                lowest dip anywhere is the <strong>global minimum</strong> — the answer we actually want.
                Gradient descent only ever feels the slope <em>under its feet</em>, so it cannot tell the
                two apart: it rolls into whatever valley it is already in and stops. Each minimum owns a
                <strong>basin of attraction</strong> — the starting points that drain into it — and the
                ridge between two basins is the watershed. That is why <em>where you start</em> can matter
                as much as how you step: move the first guess across a ridge and the run ends somewhere
                else entirely, which is what makes <strong>initialization</strong> a real design choice.
              </p>

              <figure class="fig">
                <svg viewBox="0 0 460 188" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                  <defs>
                    <marker id="shp-arw" viewBox="0 -5 10 10" refX="7.5" refY="0" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,-5L10,0L0,5" fill="var(--color-text-secondary)" /></marker>
                  </defs>
                  <!-- Panel A · a 1-D landscape with two basins -->
                  <path d={shapesFig.leftBasin} fill="#f59e0b" opacity="0.1" />
                  <path d={shapesFig.rightBasin} fill="#10b981" opacity="0.1" />
                  <line x1={shapesFig.ridgeX} y1="22" x2={shapesFig.ridgeX} y2={shapesFig.PYb} class="fig-contour" style="stroke-opacity:0.35" stroke-dasharray="3,3" />
                  <path d={shapesFig.curveD} fill="none" stroke="var(--color-text-secondary)" stroke-width="2" stroke-linejoin="round" />
                  <circle cx={shapesFig.localMin.x} cy={shapesFig.localMin.y} r="3" fill="#f59e0b" />
                  <circle cx={shapesFig.globalMin.x} cy={shapesFig.globalMin.y} r="3" fill="#10b981" />
                  <circle cx={shapesFig.startA.x} cy={shapesFig.startA.y} r="4" fill="#f59e0b" stroke="#fff" stroke-width="1.2" />
                  <circle cx={shapesFig.startB.x} cy={shapesFig.startB.y} r="4" fill="#10b981" stroke="#fff" stroke-width="1.2" />
                  <text x={shapesFig.localMin.x} y={shapesFig.localMin.y + 16} class="fig-svg-label" style="fill:var(--color-text-tertiary)">local min</text>
                  <text x={shapesFig.globalMin.x} y={shapesFig.globalMin.y + 16} class="fig-svg-label" style="fill:var(--color-text-tertiary)">global min</text>
                  <text x={shapesFig.ridgeX} y="16" class="fig-svg-label" style="fill:var(--color-text-tertiary)">ridge</text>
                  <!-- Panel B · a 2-D saddle (x²−y²) -->
                  <g transform="translate(262,28)">
                    <image href={shapesFig.saddleURL} x="0" y="0" width={shapesFig.SW} height={shapesFig.SH} preserveAspectRatio="none" />
                    <g transform="scale({shapesFig.SW / shapesFig.gw},{shapesFig.SH / shapesFig.gh})">
                      {#each shapesFig.saddleContours as d}<path d={d} fill="none" stroke="#fff" stroke-opacity="0.16" stroke-width="1" vector-effect="non-scaling-stroke" />{/each}
                    </g>
                    {#each shapesFig.saddleArrows as a}
                      <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="var(--color-text-secondary)" stroke-width="1.7" marker-end="url(#shp-arw)" />
                    {/each}
                    <circle cx={shapesFig.cxS} cy={shapesFig.cyS} r="3.6" fill="#fff" stroke="#0a1218" stroke-width="1" />
                    <text x={shapesFig.cxS} y={shapesFig.SH + 14} class="fig-svg-label" style="fill:var(--color-text-tertiary)">saddle point</text>
                  </g>
                </svg>
                <figcaption class="fig-cap">
                  Left: a 1-D loss with a shallow local minimum and a deep global one, split by a ridge —
                  the amber start drains into the shallow basin, the emerald start (just across the ridge)
                  into the deep one. Right: a 2-D saddle, downhill <em>into</em> the centre along one axis
                  and <em>out</em> along the other — the gradient is zero there, yet it is no minimum.
                </figcaption>
              </figure>

              <p>
                There is a subtler trap than a local minimum. A <strong>saddle point</strong> is a spot
                where the ground curves <em>down</em> one way and <em>up</em> another — a mountain pass.
                The gradient there is zero, exactly as at a minimum
                ({@html tex(String.raw`\nabla\mathcal{L} = \mathbf{0}`)}), so a method that watches only
                the slope can grind almost to a halt even though one step sideways would keep it falling.
                Broad, gentle <strong>plateaus</strong>, where the gradient nearly vanishes, slow a run the
                same way — more quietly.
              </p>
              <p>
                In two dimensions, bad local minima look like the main hazard. In the millions of
                dimensions a real model lives in, the reverse holds: critical points are
                <em>overwhelmingly</em> saddles, and almost every true minimum sits close to the global
                one in value. The hard part of training a large network is escaping saddles and plateaus,
                not dodging bad valleys — a finding (Dauphin et al., 2014) that reshaped how the field
                thinks about non-convex optimization.
              </p>
              <p class="aside">
                <strong>“Convex”?</strong> A surface is <strong>convex</strong> when it is one bowl
                everywhere: stretch a straight rope between any two points on it and the rope never
                dips below the surface. One basin, no traps — the world where optimization comes
                with clean guarantees, and the word you’ll meet on several optimizer cards. This
                chapter is about what happens when that promise breaks (<em>non-convex</em>) —
                which is where deep learning lives.
              </p>
              <aside class="hd-note">
                <span class="hd-note-tag">In a billion dimensions</span>
                <p>
                  Here is <em>why</em> saddles take over up there. At a flat spot the surface
                  curves independently along each of the <em>d</em> directions, and a minimum needs
                  every single one to curve <em>up</em>. With two knobs that’s two coin flips; with
                  a million it’s a million — so a random flat spot is all but certain to curve down
                  somewhere, and “somewhere down” is exactly a saddle. The mountain pass isn’t the
                  rare case at scale; it’s nearly the only case.
                </p>
              </aside>
              <p>
                This is the backdrop for Part III. Plain descent stalls on saddles, crawls across
                plateaus, and settles in the first basin it finds. The momentum, noise, and curvature
                tricks ahead are, in large part, ways to keep moving when the slope alone is no longer
                enough to go on.
              </p>
              <ChapterCta
                lessonId={chLesson['ch-shapes']}
                onLesson={() => startLessonFromChapter('ch-shapes')}
                demo={chapterPresets['ch-shapes'] ? () => runPreset('ch-shapes') : null}
              />
              {#if chRefs['ch-shapes']}
                <div class="ch-refs">
                  <span class="ch-refs-label">Further reading</span>
                  {#each chRefs['ch-shapes'] as r}
                    <a class="opt-cite-link" href={r.href} target="_blank" rel="noopener noreferrer">
                      {#if r.kind === 'paper'}<FileText size={11} strokeWidth={2.2} />{:else}<BookOpen size={11} strokeWidth={2.2} />{/if}
                      {r.label}
                    </a>
                  {/each}
                </div>
              {/if}
            </section>

            <!-- ============== 4 · HOW STEEP, EXACTLY? ============== -->
            <section data-ch="ch-derivative" id="ch-derivative">
              <div class="part-label">Part II · Walking downhill</div>
              <h3><svelte:component this={chIcon['ch-derivative']} size={18} strokeWidth={2} /> How steep, exactly?</h3>

              <p>
                Part I kept saying <em>slope</em> and trusted your legs to know what it meant. Before
                the walking starts in earnest, let’s put a number on it — because the number is the
                whole trick, and you can build it yourself with nothing but a subtraction and a
                division.
              </p>
              <p>
                Here is the move. Stand somewhere on a 1-D loss curve — say {@html tex(String.raw`\alpha = 2`)} on
                <strong>Fit a Slope</strong>, whose loss happens to be {@html tex(String.raw`\mathcal{L}(\alpha)=\alpha^2`)}, so {@html tex(String.raw`\mathcal{L}(2)=4`)}.
                <strong>Nudge</strong> the knob by some small amount <em>h</em>, and divide the
                loss’s response by the nudge. Nudge by <em>h</em> = 0.1 and the loss climbs from
                4 to 4.41 — a rise of 0.41 over a run of 0.1: ratio <strong>4.1</strong>. Try
                <em>h</em> = 0.01: the ratio comes out 4.01. Try 0.001: <strong>4.001</strong>.
                The nudges are vanishing, but the ratio isn’t wandering — it is
                <em>settling</em>, and the number it settles on is 4.
              </p>
              <blockquote class="recipe">
                Nudge. Measure the response. Divide. Then let the nudge shrink — the number the
                ratio settles on is the <strong>derivative</strong>: the slope of the loss
                <em>at a point</em>.
              </blockquote>
              <div class="formula-display center">{@html texD(formulas.derivativeLimit)}</div>
              <p>
                Read it slowly, once: the fraction is exactly the nudge-and-divide you just did, and
                {@html tex(String.raw`\lim_{h \to 0}`)} (“the limit as <em>h</em> goes to zero”) is
                the settling you just watched. Nothing else is hiding in there. The settling also
                tells you something about the ground itself: zoom in far enough on any smooth curve
                and it straightens into a line — the derivative is that line’s slope. Two chapters
                from now, that “zoom until straight” picture carries a real proof on its back; and
                its fine print — <em>the line only speaks for the ground right under you</em> —
                grows up to become the learning rate’s whole story.
              </p>
              <figure class="fig">
                <svg viewBox="0 0 {secantFig.W} {secantFig.H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                  <path d={secantFig.curve} fill="none" stroke="#10b981" stroke-width="1.6" stroke-opacity="0.65" />
                  {#each secantFig.chords as s}
                    <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="var(--color-text-tertiary)" stroke-width="1" stroke-opacity={s.o} />
                    <circle cx={s.end.x} cy={s.end.y} r="1.8" fill="var(--color-text-tertiary)" fill-opacity={s.o + 0.2} />
                  {/each}
                  <line x1={secantFig.tangent.x1} y1={secantFig.tangent.y1} x2={secantFig.tangent.x2} y2={secantFig.tangent.y2} stroke="#3b82f6" stroke-width="1.7" stroke-opacity="0.95" />
                  <circle cx={secantFig.p.x} cy={secantFig.p.y} r="3" fill="#f59e0b" stroke="#fff" stroke-width="1.2" />
                  <foreignObject x={secantFig.p.x - 10} y={secantFig.p.y + 8} width="24" height="18">
                    <span class="fig-tex">{@html tex(String.raw`\alpha`)}</span>
                  </foreignObject>
                  <foreignObject x={secantFig.pEnd.x - 16} y={secantFig.pEnd.y - 22} width="44" height="18">
                    <span class="fig-tex dim">{@html tex(String.raw`\alpha + h`)}</span>
                  </foreignObject>
                  <foreignObject x={secantFig.p.x + 46} y={secantFig.p.y - 4} width="46" height="18">
                    <span class="fig-tex dim">{@html tex(String.raw`h \to 0`)}</span>
                  </foreignObject>
                </svg>
                <figcaption class="fig-cap">
                  The limit, drawn: each grey chord leans on the curve a nudge <em>h</em> away —
                  slope {@html tex(String.raw`2\alpha + h`)} on this parabola — and as <em>h</em>
                  shrinks, the chords tilt into the one blue line whose slope is exactly
                  {@html tex(String.raw`2\alpha`)}: the tangent. The derivative is where the chords
                  were heading all along.
                </figcaption>
              </figure>
              <p>
                Two knobs, same recipe, one new courtesy: with {@html tex(String.raw`\alpha`)} and {@html tex(String.raw`\beta`)} both live, nudge
                <strong>one and freeze the other</strong>. The ratio you get is a
                <strong>partial derivative</strong>, written with a curly
                {@html tex(String.raw`\partial`)} — say it “partial”, and yes, it is the symbol on
                this lab’s front door:
              </p>
              <div class="formula-display center">{@html texD(formulas.partialDef)}</div>
              <p>
                {@html tex(String.raw`\partial \mathcal{L}/\partial \alpha`)} reads: <em>nudge {@html tex(String.raw`\alpha`)},
                hold {@html tex(String.raw`\beta`)} still, divide the response by the nudge.</em> Do it once per knob and you are
                holding two numbers. Stacking those two numbers into a single arrow is exactly where
                the next chapter begins.
              </p>
              <figure class="fig">
                <svg viewBox="0 0 {sliceFig.W} {sliceFig.H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                  <defs>
                    <marker id="slice-a" viewBox="0 -4 8 8" refX="7" refY="0" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,-3.2 L7,0 L0,3.2" fill="#3b82f6" /></marker>
                    <marker id="slice-b" viewBox="0 -4 8 8" refX="7" refY="0" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,-3.2 L7,0 L0,3.2" fill="#f59e0b" /></marker>
                  </defs>
                  {#each sliceFig.edgeBack as d}
                    <path {d} fill="none" stroke="var(--color-text-tertiary)" stroke-width="0.9" stroke-opacity="0.28" />
                  {/each}
                  {#each sliceFig.rings as d}
                    <path {d} fill="none" stroke="var(--color-text-tertiary)" stroke-width="0.9" stroke-opacity="0.35" />
                  {/each}
                  {#each sliceFig.edgeFront as d}
                    <path {d} fill="none" stroke="var(--color-text-tertiary)" stroke-width="0.9" stroke-opacity="0.5" />
                  {/each}
                  <path d={sliceFig.sliceA} fill="none" stroke="#3b82f6" stroke-width="1.7" stroke-opacity="0.9" />
                  <path d={sliceFig.sliceB} fill="none" stroke="#f59e0b" stroke-width="1.7" stroke-opacity="0.9" />
                  <line x1={sliceFig.arrA.x1} y1={sliceFig.arrA.y1} x2={sliceFig.arrA.x2} y2={sliceFig.arrA.y2} stroke="#3b82f6" stroke-width="1.3" marker-end="url(#slice-a)" />
                  <line x1={sliceFig.arrB.x1} y1={sliceFig.arrB.y1} x2={sliceFig.arrB.x2} y2={sliceFig.arrB.y2} stroke="#f59e0b" stroke-width="1.3" marker-end="url(#slice-b)" />
                  <circle cx={sliceFig.pt.X} cy={sliceFig.pt.Y} r="3" fill="#f59e0b" stroke="#fff" stroke-width="1.2" />
                  <foreignObject x={sliceFig.arrA.x2 + 6} y={sliceFig.arrA.y2 - 20} width="58" height="18">
                    <span class="fig-tex" style="color:#3b82f6">{@html tex(String.raw`\partial\mathcal{L}/\partial\alpha`)}</span>
                  </foreignObject>
                  <foreignObject x={sliceFig.arrB.x2 - 64} y={sliceFig.arrB.y2 - 20} width="58" height="18">
                    <span class="fig-tex" style="color:#f59e0b;display:block;text-align:right">{@html tex(String.raw`\partial\mathcal{L}/\partial\beta`)}</span>
                  </foreignObject>
                </svg>
                <figcaption class="fig-cap">
                  The two partials, on a real bowl: freeze {@html tex(String.raw`\beta`)} and the
                  whole surface collapses to the <span class="ink-blue">blue slice</span>, an
                  ordinary curve whose slope at the marker is
                  {@html tex(String.raw`\partial\mathcal{L}/\partial\alpha`)}; freeze
                  {@html tex(String.raw`\alpha`)} instead and you get the amber slice and
                  {@html tex(String.raw`\partial\mathcal{L}/\partial\beta`)}. Two ordinary
                  derivatives, at right angles, on one surface.
                </figcaption>
              </figure>
              <p class="aside">
                <strong>How the app really does it:</strong> you could compute every slope by
                literal nudging (the finite-difference recipe above — it’s how the curvature lens
                works). But nudging carries a whisper of error, so each problem here ships a
                hand-derived exact formula for its gradient instead — and the test suite trusts
                nothing: every formula is re-checked against nudge-and-divide at many random
                points. <em>Differentiate by hand, verify by nudge</em> — a professional habit
                worth stealing.
              </p>
              {#if chapterPresets['ch-derivative']}
                <ChapterCta demo={() => runPreset('ch-derivative')} demoLabel={chapterPresets['ch-derivative'].title} />
              {/if}
              {#if chRefs['ch-derivative']}
                <div class="ch-refs">
                  <span class="ch-refs-label">Further reading</span>
                  {#each chRefs['ch-derivative'] as r}
                    <a class="opt-cite-link" href={r.href} target="_blank" rel="noopener noreferrer">
                      {#if r.kind === 'paper'}<FileText size={11} strokeWidth={2.2} />{:else}<BookOpen size={11} strokeWidth={2.2} />{/if}
                      {r.label}
                    </a>
                  {/each}
                </div>
              {/if}
            </section>

            <!-- ============== 5 · WHICH WAY IS DOWNHILL ============== -->
            <section data-ch="ch-downhill" id="ch-downhill">
              <h3><svelte:component this={chIcon['ch-downhill']} size={18} strokeWidth={2} /> Which way is downhill?</h3>

              <p>
                Standing on a hillside in fog, you can still feel which way is down — the ground
                tilts under your feet. That tilt is the <strong>slope</strong>. With two knobs there
                are two slopes at once: how the loss changes as you nudge {@html tex(String.raw`\alpha`)}, and how it changes as
                you nudge {@html tex(String.raw`\beta`)}. Bundle those two together and you get the <strong>gradient</strong>,
                written <strong>{@html tex(String.raw`\nabla\mathcal{L}`)}</strong> (say “grad L”).
              </p>
              <p>
                The gradient is an arrow, and it always points in the direction of <em>steepest
                increase</em> — straight uphill. So to go <strong>down</strong>, you walk the
                <strong>opposite</strong> way, along <strong>{@html tex(String.raw`-\nabla\mathcal{L}`)}</strong>. That negative gradient is
                the single most important arrow in this whole app.
              </p>
              <p>
                Why <em>steepest</em>? Picture standing on the slope and trying every direction you
                could step. Each heading has its own rate of climb, and the gradient is simply the one
                whose climb is fastest. Every other direction is a watered-down version of it: its
                steepness is the gradient’s shadow cast onto that heading — full strength straight along
                {@html tex(String.raw`\nabla\mathcal{L}`)}, and fading to <em>nothing</em> at a right angle to it. Those flat, right-angle
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
                    Every faint arrow on the loss map is <strong>{@html tex(String.raw`-\nabla\mathcal{L}`)}</strong> at that spot — the
                    steepest way down — and they all stream toward the basin. They are longer where
                    the surface is steeper.
                  </p>
                  <p>
                    On the marker itself, the <span class="ink-blue">blue arrow</span> is this same
                    {@html tex(String.raw`-\nabla\mathcal{L}`)}: the steepest descent from exactly where you stand. (Its red partner arrives
                    in the next chapter.)
                  </p>
                </div>
              </div>

              <p>
                Formally, the gradient is a column of <strong>partial derivatives</strong> — one
                slope per parameter. Each entry answers a single, narrow question: <em>if I wiggle
                only this knob and hold the other still, how fast does the loss change?</em> There is
                nothing mystical in measuring one: nudge {@html tex(String.raw`\alpha`)} by a hair, see how far the loss moved, and
                divide the change by the nudge. Do that once for {@html tex(String.raw`\alpha`)} and once for {@html tex(String.raw`\beta`)} and you have the two
                numbers the gradient is built from.
              </p>
              <p class="aside">
                Two knobs make that easy — but a real model has millions or billions, and nudging each
                one in turn would be hopeless. They use <strong>backpropagation</strong> (reverse-mode
                automatic differentiation): one backward sweep of the chain rule that hands back the
                derivative for <em>every</em> parameter at once, at about the cost of a single forward
                pass (Rumelhart, Hinton &amp; Williams, 1986; Baydin et al., 2018). The meaning is exactly
                the {@html tex(String.raw`\nabla\mathcal{L}`)} here — it is just computed without ever
                nudging anything.
              </p>
              <div class="formula-display">{@html texD(formulas.gradientDefinition)}</div>
              <p>
                Stack those two answers into a little arrow and you have {@html tex(String.raw`\nabla\mathcal{L}`)}. Its
                <strong>direction</strong> is the steepest way uphill; its <strong>length</strong> is
                how steep. That is why the field arrows stretch long on the steep walls and shrink to
                almost nothing at the basin floor — at the very bottom there is no downhill left, so
                the gradient, and the step it drives, fades to zero. The marker arriving and going
                still <em>is</em> the gradient vanishing.
              </p>

              <p>
                We keep calling {@html tex(String.raw`-\nabla\mathcal{L}`)} the <em>steepest</em> way down. That is not loose talk — and it is
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

              <div class="concept">
                <div class="concept-text">
                  <h4>An arrow is two numbers</h4>
                  <p>
                    Three tools before the proof. An arrow on the {@html tex(String.raw`(\alpha, \beta)`)}
                    plane <em>is</em> its two components stacked — how far along
                    {@html tex(String.raw`\alpha`)}, how far along {@html tex(String.raw`\beta`)};
                    that is all the bracket notation means. Its <strong>length</strong>, written
                    {@html tex(String.raw`\lVert\mathbf{v}\rVert`)}, is Pythagoras on those legs:
                    for {@html tex(String.raw`\mathbf{v} = [3, 2]`)},
                    {@html tex(String.raw`\lVert\mathbf{v}\rVert = \sqrt{3^2 + 2^2} = \sqrt{13}`)}.
                    A <strong>unit vector</strong> has length exactly 1 — pure direction, no size.
                    And the <strong>dot product</strong> multiplies matching components and adds:
                    {@html tex(String.raw`\mathbf{v}\cdot\mathbf{u} = v_1 u_1 + v_2 u_2`)} — one
                    number, and for a unit {@html tex(String.raw`\mathbf{u}`)} it is precisely the
                    length of {@html tex(String.raw`\mathbf{v}`)}’s <em>shadow</em> on
                    {@html tex(String.raw`\mathbf{u}`)}. That shadow is the whole proof below.
                  </p>
                </div>
                <svg class="concept-svg" viewBox="0 0 200 120">
                  <line x1="26" y1="100" x2="186" y2="100" stroke="var(--color-text-tertiary)" stroke-width="1" stroke-opacity="0.4" />
                  <line x1="26" y1="100" x2="26" y2="12" stroke="var(--color-text-tertiary)" stroke-width="1" stroke-opacity="0.4" />
                  <line x1="26" y1="100" x2="128" y2="100" stroke="var(--color-text-tertiary)" stroke-width="1" stroke-dasharray="3,3" stroke-opacity="0.7" />
                  <line x1="128" y1="100" x2="128" y2="32" stroke="var(--color-text-tertiary)" stroke-width="1" stroke-dasharray="3,3" stroke-opacity="0.7" />
                  <line x1="26" y1="100" x2="126" y2="33.3" stroke="#f59e0b" stroke-width="1.7" />
                  <path d="M 120.5,34.5 L 128,32 L 124,39.5" fill="none" stroke="#f59e0b" stroke-width="1.7" />
                  <foreignObject x="69" y="103" width="16" height="16">
                    <span class="fig-tex dim">{@html tex('3')}</span>
                  </foreignObject>
                  <foreignObject x="134" y="60" width="16" height="16">
                    <span class="fig-tex dim">{@html tex('2')}</span>
                  </foreignObject>
                  <foreignObject x="26" y="38" width="78" height="18">
                    <span class="fig-tex">{@html tex(String.raw`\lVert\mathbf{v}\rVert = \sqrt{13}`)}</span>
                  </foreignObject>
                </svg>
              </div>

              <div class="proof">
                <div class="proof-title">Why the negative gradient is exactly the steepest descent</div>
                <p class="proof-p">
                  Take a unit step in some direction {@html tex(String.raw`\mathbf{u}`)}. The loss changes
                  at a rate equal to the gradient’s <em>shadow</em> on that direction — their dot product
                  {@html tex(String.raw`\nabla\mathcal{L}\cdot\mathbf{u}`)}. Writing {@html tex(String.raw`\varphi`)}
                  (“phi”) for the angle between {@html tex(String.raw`\mathbf{u}`)} and {@html tex(String.raw`\nabla\mathcal{L}`)},
                  that shadow has length {@html tex(String.raw`\lVert\nabla\mathcal{L}\rVert\cos\varphi`)}:
                </p>
                <div class="formula-display center">{@html texD(formulas.directional)}</div>
                <figure class="proof-fig">
                  <svg viewBox="0 0 420 156" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                    <defs>
                      <marker id="pf-grad" viewBox="0 -5 10 10" refX="8" refY="0" markerWidth="5.5" markerHeight="5.5" orient="auto"><path d="M0,-5L10,0L0,5" fill="#f59e0b" /></marker>
                      <marker id="pf-u" viewBox="0 -5 10 10" refX="8" refY="0" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,-5L10,0L0,5" fill="var(--color-text-tertiary)" /></marker>
                    </defs>
                    <line x1="210" y1="16" x2="210" y2="146" class="fig-contour" style="stroke-opacity:0.16" />
                    <!-- Panel A · the shadow (projection of ∇ℒ onto u) — centred in the left half -->
                    <line x1="36" y1="112" x2="174" y2="112" stroke="var(--color-text-tertiary)" stroke-width="1.2" stroke-dasharray="3,3" stroke-opacity="0.6" marker-end="url(#pf-u)" />
                    <line x1="36" y1="112" x2="130.5" y2="112" stroke="#3b82f6" stroke-width="4.5" stroke-linecap="round" />
                    <line x1="130.5" y1="48.3" x2="130.5" y2="112" stroke="var(--color-text-tertiary)" stroke-width="1" stroke-dasharray="2.5,2.5" stroke-opacity="0.75" />
                    <path d="M 123.5,112 L 123.5,105 L 130.5,105" fill="none" stroke="var(--color-text-tertiary)" stroke-width="1" stroke-opacity="0.75" />
                    <line x1="36" y1="112" x2="128.6" y2="49.5" stroke="#f59e0b" stroke-width="2.6" marker-end="url(#pf-grad)" />
                    <path d="M 64,112 A 28,28 0 0 0 60.4,97.6" fill="none" stroke="var(--color-text-tertiary)" stroke-width="1.2" />
                    <circle cx="36" cy="112" r="2.8" fill="var(--color-text-primary)" />
                    <text x="134" y="46" class="proof-lbl" style="text-anchor:start;fill:#f59e0b">∇ℒ</text>
                    <text x="178" y="116" class="proof-lbl" style="text-anchor:start;fill:var(--color-text-secondary)">u</text>
                    <text x="72" y="105" class="proof-lbl" style="fill:var(--color-text-tertiary)">φ</text>
                    <text x="83" y="128" class="proof-lbl" style="fill:#3b82f6">‖∇ℒ‖ cos φ</text>
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
                    Left: the rate is {@html tex(String.raw`\nabla\mathcal{L}`)}’s shadow on <strong>u</strong>. Right: sweep <strong>u</strong>
                    around and that shadow traces a cosine — biggest along {@html tex(String.raw`\nabla\mathcal{L}`)}, zero across a contour,
                    most negative along {@html tex(String.raw`-\nabla\mathcal{L}`)}.
                  </figcaption>
                </figure>
                <p class="proof-p">
                  Because {@html tex(String.raw`\cos\varphi`)} only ever runs from +1 to −1, that rate is
                  largest when {@html tex(String.raw`\mathbf{u}`)} lines up with {@html tex(String.raw`\nabla\mathcal{L}`)}
                  (the fastest <em>rise</em>), exactly zero at a right angle (walking a contour — the loss
                  holds still), and most negative along {@html tex(String.raw`-\nabla\mathcal{L}`)} (the
                  fastest <em>fall</em>). No direction can beat it. <span class="proof-qed">∎</span>
                </p>
              </div>

              <p>
                One honest caveat to carry forward: the gradient is only the truth <em>right where you
                stand.</em> Zoom in close enough and any smooth surface flattens into a tilted plane,
                and {@html tex(String.raw`\nabla\mathcal{L}`)} is exactly that tilt — but step too far and the real ground curves away from the
                plane you trusted. That gap between the slope underfoot and the surface a stride away is
                the whole reason a step can be <em>too big</em>, and taming it is what the learning rate
                exists to do.
              </p>
              <ChapterCta
                lessonId={chLesson['ch-downhill']}
                onLesson={() => startLessonFromChapter('ch-downhill')}
                demo={chapterPresets['ch-downhill'] ? () => runPreset('ch-downhill') : null}
              />
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
                Stand at your current {@html tex(String.raw`(\alpha, \beta)`)}. Look downhill — that’s <strong>{@html tex(String.raw`-\nabla\mathcal{L}`)}</strong>. Take a
                step in that direction — <em class="g">{@html tex(String.raw`\gamma`)}</em> times as long as the slope is steep.
                Repeat.
              </blockquote>
              <p>
                In symbols, that is the rule the entire field is built on. We write <strong>{@html tex(String.raw`\theta`)}</strong>
                (“theta”) as shorthand for the pair {@html tex(String.raw`(\alpha, \beta)`)} together:
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
              <ChapterCta
                lessonId={chLesson['ch-step']}
                onLesson={() => startLessonFromChapter('ch-step')}
                demo={chapterPresets['ch-step'] ? () => runPreset('ch-step') : null}
              />
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
              <h3><svelte:component this={chIcon['ch-gamma']} size={18} strokeWidth={2} /> The learning rate {@html tex(String.raw`\gamma`)}</h3>

              <p>
                There is one number you’ll reach for more than any other: <em class="g">{@html tex(String.raw`\gamma`)}</em>
                (gamma), the <strong>learning rate</strong> — how big each step is. It’s a Goldilocks
                dial.
              </p>
              <ul class="knob-bullets">
                <li><strong>Too small:</strong> the marker creeps; it never reaches the bottom before the steps run out.</li>
                <li><strong>Too big:</strong> it overshoots the valley floor and bounces up the far wall — loss leaps around, or rockets off to infinity. (The app catches this, stops, and explains what happened.)</li>
                <li><strong>Just right:</strong> a smooth glide into the basin. Every problem ships with a sane default — but the fastest way to <em>feel</em> {@html tex(String.raw`\gamma`)} is to break it on purpose.</li>
              </ul>
              <p>
                And “too big” is not vague — it has an exact edge. For a smooth bowl, gradient
                descent settles only while {@html tex(String.raw`\gamma`)} stays below <strong>two divided by the sharpest bend
                of the surface</strong>, a number written {@html tex(String.raw`\lambda_{\max}`)}. Careful with the word:
                this is <em>not</em> the steepness you’ve been reading off the arrows (how tilted
                the ground is) but a genuinely new quantity — how fast the tilt <em>itself</em>
                changes as you walk. That is the <strong>curvature</strong>.
              </p>
              <div class="formula-display">{@html texD(formulas.stability)}</div>
              <p>
                Stay under that line and each step lands closer to the bottom than the last, so the
                run converges. Cross it and the opposite compounds: every step overshoots a little
                more than the one before, and the loss runs off to infinity. Where does the 2 come
                from, and what exactly is bending? The <em>next chapter</em> builds curvature with
                your own hands — the same nudge-and-divide trick, aimed at the slope this time —
                and derives this edge in four honest lines.
              </p>
              <aside class="hd-note">
                <span class="hd-note-tag">In a billion dimensions</span>
                <p>
                  For the clean bowls here, {@html tex(String.raw`\gamma > 2/\lambda_{\max}`)} means certain divergence — a
                  theorem you can verify with a slider. The modern surprise: full-batch training of
                  real networks was found to hover <em>right at</em> that edge — the curvature
                  itself rises until {@html tex(String.raw`2/\lambda_{\max}`)} meets whatever {@html tex(String.raw`\gamma`)} you chose, and the loss
                  then falls raggedly along the knife’s edge (Cohen et al., 2021, “edge of
                  stability”). The law you can check on this bowl becomes, at scale, a strange
                  equilibrium the theory is still catching up to.
                </p>
              </aside>
              <p class="aside">
                Sometimes the blow-up comes not from {@html tex(String.raw`\gamma`)} but from a freak gradient — a cliff in the
                surface, or the deep, recurrent networks where gradients can <strong>explode</strong>.
                The standard guard is <strong>gradient clipping</strong>: if the gradient’s length
                exceeds a threshold {@html tex(String.raw`c`)}, rescale it back to that length before
                stepping, {@html tex(String.raw`\nabla\mathcal{L} \leftarrow c\,\nabla\mathcal{L}/\lVert\nabla\mathcal{L}\rVert`)},
                keeping its direction but capping its size (Pascanu et al., 2013). The opposite failure —
                gradients that <strong>vanish</strong> on a flat plateau — just stalls a run, the quiet
                trap from the landscape chapter.
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
              <ChapterCta
                lessonId={chLesson['ch-gamma']}
                onLesson={() => startLessonFromChapter('ch-gamma')}
                demo={chapterPresets['ch-gamma'] ? () => runPreset('ch-gamma') : null}
              />
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

            <!-- ============== 8 · THE BEND OF THE BOWL ============== -->
            <section data-ch="ch-curvature" id="ch-curvature">
              <h3><svelte:component this={chIcon['ch-curvature']} size={18} strokeWidth={2} /> The bend of the bowl</h3>

              <p>
                The last chapter ended on a formula pulled out of a hat: stay under
                {@html tex(String.raw`2/\lambda_{\max}`)}. This chapter earns it. What we need is
                one more number at every point of the landscape — not how tilted the ground is, but
                how quickly the tilt itself changes as you walk. The slope of the slope: the
                <strong>curvature</strong>.
              </p>
              <p>
                Feel the difference first. A wine glass and a soup bowl can be equally steep where
                you stand — same slope — but descend a little and the glass <em>tightens</em> while
                the bowl <em>relaxes</em>. Curvature is the rate of that tightening, and you already
                own the tool that measures it: nudge {@html tex(String.raw`\alpha`)} and divide — only this time, watch how the
                <em>slope</em> answers, not the loss. The derivative of the derivative, written
                {@html tex(String.raw`\partial^2 \mathcal{L}/\partial \alpha^2`)} and, for the rest
                of this chapter, called {@html tex(String.raw`\lambda`)}: big {@html tex(String.raw`\lambda`)}, sharp bend; small
                {@html tex(String.raw`\lambda`)}, gentle one; zero, flat as a board.
              </p>
              <figure class="fig">
                <svg viewBox="0 0 {bendFig.W} {bendFig.H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                  <line x1={bendFig.tan.x1} y1={bendFig.tan.y1} x2={bendFig.tan.x2} y2={bendFig.tan.y2} stroke="var(--color-text-tertiary)" stroke-width="1" stroke-dasharray="3,3.5" stroke-opacity="0.55" />
                  <path d={bendFig.sharp.d} fill="none" stroke="#f87171" stroke-width="1.6" stroke-opacity="0.9" />
                  <path d={bendFig.gentle.d} fill="none" stroke="#34d399" stroke-width="1.6" stroke-opacity="0.9" />
                  <circle cx={bendFig.x0} cy={bendFig.y0} r="3" fill="#f59e0b" stroke="#fff" stroke-width="1.2" />
                  <foreignObject x={bendFig.sharp.end.x + 5} y={bendFig.sharp.end.y - 8} width="70" height="18">
                    <span class="fig-tex" style="color:#f87171">{@html tex(String.raw`\lambda`)} large</span>
                  </foreignObject>
                  <foreignObject x={bendFig.gentle.end.x + 5} y={bendFig.gentle.end.y - 8} width="70" height="18">
                    <span class="fig-tex" style="color:#34d399">{@html tex(String.raw`\lambda`)} small</span>
                  </foreignObject>
                </svg>
                <figcaption class="fig-cap">
                  Same slope underfoot — the dashed tangent is shared — but two different futures:
                  the red curve tightens, the green one relaxes. The first derivative can’t tell
                  them apart at the marker; the second one, {@html tex(String.raw`\lambda`)}, is
                  exactly what does.
                </figcaption>
              </figure>

              <div class="proof">
                <div class="proof-title">Where the 2 comes from — in four lines</div>
                <p class="proof-p">
                  Take the cleanest bowl there is: {@html tex(String.raw`\mathcal{L} = \tfrac{1}{2}\lambda\alpha^2`)},
                  curvature {@html tex(String.raw`\lambda`)} everywhere, minimum at zero. Its slope at {@html tex(String.raw`\alpha`)} is
                  {@html tex(String.raw`\lambda\alpha`)}, so one step of gradient descent is
                </p>
                <div class="formula-display center">{@html texD(formulas.contraction)}</div>
                <p class="proof-p">
                  Every step <em>multiplies the distance to the bottom</em> by the same factor
                  {@html tex(String.raw`(1-\gamma\lambda)`)} — and that one multiplier is the whole
                  story. While {@html tex(String.raw`\gamma\lambda < 1`)} the factor sits between 0
                  and 1: a smooth glide in. At {@html tex(String.raw`\gamma\lambda = 1`)} the factor
                  is 0 — you land at the bottom in <em>one hop</em> ({@html tex(String.raw`\gamma = 1/\lambda`)} is this bowl’s own
                  perfect learning rate). Between 1 and 2 the factor is negative but small:
                  overshoot to the far wall, yet closer each bounce. At exactly 2, you bounce
                  between two mirror points forever. And past 2 every bounce lands
                  <em>higher</em> than the last — divergence. There is the edge, and there is
                  the 2. <span class="proof-qed">∎</span>
                </p>
              </div>
              <figure class="fig">
                <svg viewBox="0 0 {regimeFig.W} {regimeFig.H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                  {#each regimeFig.panels as pn, i}
                    {#if i > 0}
                      <line x1={pn.ox} y1="10" x2={pn.ox} y2={regimeFig.H - 30} stroke="var(--color-border)" stroke-width="1" stroke-opacity="0.5" />
                    {/if}
                    <path d={pn.curve} fill="none" stroke="#10b981" stroke-width="1.4" stroke-opacity="0.6" />
                    <path d={pn.hops} fill="none" stroke="#f59e0b" stroke-width="1" stroke-opacity="0.55" />
                    {#each pn.dots as dt, k}
                      <circle cx={dt.x} cy={dt.y} r={k === 0 ? 2.8 : 2} fill="#f59e0b" fill-opacity={k === 0 ? 1 : 0.8} stroke={k === 0 ? '#fff' : 'none'} stroke-width="1" />
                    {/each}
                    <foreignObject x={pn.ox + 4} y={regimeFig.H - 27} width={regimeFig.PW - 8} height="27">
                      <span class="fig-tex" style="display:block;text-align:center">{@html tex(pn.latex)}</span>
                      <span class="fig-word" style="text-align:center;margin-top:2px">{pn.word}</span>
                    </foreignObject>
                  {/each}
                </svg>
                <figcaption class="fig-cap">
                  The multiplier, run for real: amber dots are actual gradient-descent iterates on
                  {@html tex(String.raw`\mathcal{L} = \tfrac{1}{2}\lambda\alpha^2`)}, starting from
                  the ringed point. Glide, one-hop, shrinking bounce, growing bounce — four values
                  of {@html tex(String.raw`\gamma\lambda`)}, one factor {@html tex(String.raw`(1-\gamma\lambda)`)}.
                </figcaption>
              </figure>

              <p>
                Now open the second knob. At any point of a real landscape the surface bends by a
                <em>different amount in different directions</em> — along a valley’s floor, barely;
                across it, sharply. The honest bookkeeping is a small table of bendings called the
                <strong>Hessian</strong>:
              </p>
              <div class="formula-display center">{@html texD(formulas.hessianMatrix)}</div>
              <p>
                Don’t let the box intimidate you. The two diagonal entries are exactly the
                {@html tex(String.raw`\partial^2`)} curvatures you just built, one per knob; the
                corner entry (the same number twice) records the <em>twist</em> — how nudging one
                knob changes the <em>other</em> knob’s slope. Four numbers, and together they pin
                down the little bowl that best fits the surface right where you stand. Zoom in on
                any smooth landscape and that fitted bowl <em>is</em> the landscape — the same way
                the fitted line was, one derivative ago.
              </p>
              <p class="aside">
                <strong>Meet the whole family.</strong> Stack one output’s slopes into a column and
                you have the <strong>gradient</strong>. Give the machine <em>many</em> outputs — a
                network predicting a hundred things at once — and each output brings its own row of
                slopes; the full table is the <strong>Jacobian</strong>, the gradient’s big sibling.
                And the Hessian you just met? Differentiate each entry of the gradient and stack the
                results: <em>the Hessian is exactly the Jacobian of the gradient.</em> One move —
                nudge, divide, tabulate — wearing three sizes.
              </p>
              <p>
                A stretched or twisted bowl still has a <strong>gentlest</strong> direction and a
                <strong>sharpest</strong> one — turn it in your hands until you face them. Their two
                bendings are called {@html tex(String.raw`\lambda_{\min}`)} and
                {@html tex(String.raw`\lambda_{\max}`)}, and the last chapter’s speed limit can now
                be read honestly: the <em>sharpest</em> bend polices {@html tex(String.raw`\gamma`)} — that is
                {@html tex(String.raw`\gamma < 2/\lambda_{\max}`)} — while your progress along the
                <em>gentlest</em> direction is paid at the rate
                {@html tex(String.raw`(1 - \gamma\lambda_{\min})`)} per step. One {@html tex(String.raw`\gamma`)}, two masters.
              </p>
              <p>
                How badly can the two masters disagree? Take their ratio:
              </p>
              <div class="formula-display center">{@html texD(formulas.kappa)}</div>
              <p>
                the <strong>condition number</strong>. {@html tex(String.raw`\kappa = 1`)} is a perfectly round bowl: any safe {@html tex(String.raw`\gamma`)}
                lands you in a few hops. {@html tex(String.raw`\kappa = 10`)} means the sharp direction forces a {@html tex(String.raw`\gamma`)} so timid that
                the gentle direction keeps about 80% of its remaining distance <em>every step</em>.
                Ravines, trenches, the long crawl — they are all this one number wearing different
                landscapes, and Part III’s entire optimizer family tree is organised around
                outwitting it.
              </p>
              <p class="look">
                The app will show you the Hessian live. In the Loss &amp; Gradient panel’s header,
                switch on the <strong>curvature lens</strong>: the ellipse drawn at the marker
                <em>is</em> the fitted bowl seen from above — long axis the gentle bend, short axis
                the sharp one — with {@html tex(String.raw`\kappa`)} read out beside it. On a saddle, the direction that curves
                <em>down</em> turns red and dashed: the escape route.
              </p>
              <aside class="hd-note">
                <span class="hd-note-tag">In a billion dimensions</span>
                <p>
                  Up there the ravine doesn’t just stretch — it multiplies. A real network’s loss
                  has millions of curvature directions, and measured spectra show a vast, nearly
                  flat bulk hugging zero plus a handful of steep outliers: less a valley than a
                  canyon system with a few sheer walls and endless soft floor. Condition numbers in
                  the wild reach 10⁵ and beyond, so the crawl this chapter proved isn’t a corner
                  case — it is the default condition of deep learning. That is why every method in
                  Part III ships in every deep-learning library.
                </p>
              </aside>
              {#if chapterPresets['ch-curvature']}
                <ChapterCta demo={() => runPreset('ch-curvature')} demoLabel={chapterPresets['ch-curvature'].title} />
              {/if}
              {#if chRefs['ch-curvature']}
                <div class="ch-refs">
                  <span class="ch-refs-label">Further reading</span>
                  {#each chRefs['ch-curvature'] as r}
                    <a class="opt-cite-link" href={r.href} target="_blank" rel="noopener noreferrer">
                      {#if r.kind === 'paper'}<FileText size={11} strokeWidth={2.2} />{:else}<BookOpen size={11} strokeWidth={2.2} />{/if}
                      {r.label}
                    </a>
                  {/each}
                </div>
              {/if}
            </section>

            <!-- ============== 9 · SCHEDULING THE LEARNING RATE ============== -->
            <section data-ch="ch-schedule" id="ch-schedule">
              <h3><svelte:component this={chIcon['ch-schedule']} size={18} strokeWidth={2} /> Scheduling the learning rate</h3>
              <p>
                The learning rate just handed us a single, unavoidable compromise: a <strong>large</strong>
                {@html tex(String.raw`\gamma`)} covers ground fast but overshoots the floor; a <strong>small</strong> {@html tex(String.raw`\gamma`)} lands precisely
                but crawls to get there. You don’t actually have to choose. Stop treating {@html tex(String.raw`\gamma`)} as one frozen
                number and <strong>schedule</strong> it — large early to cover ground, small late to settle
                cleanly — and you get both halves of the bargain. The <strong>Schedule</strong> control
                beneath the learning rate does exactly that: it multiplies your base {@html tex(String.raw`\gamma`)} by a factor that
                changes on every step of the run.
              </p>
              <p>
                The four schedules trace four different shapes for that factor over a run — flat, then
                three ways of bleeding {@html tex(String.raw`\gamma`)} away as the steps tick by:
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
                <strong>Constant</strong> holds {@html tex(String.raw`\gamma`)} start to finish — the honest baseline, and always the
                compromise above. <strong>Step decay</strong> keeps {@html tex(String.raw`\gamma`)} flat, then cuts it by a fixed factor
                at set milestones (here ×0.3 a third of the way in, and again at two-thirds). It leaves the
                loss curve’s most recognizable fingerprint: a long plateau, then a sudden <em>cliff</em>
                the instant {@html tex(String.raw`\gamma`)} drops and the smaller step resolves detail the larger one skated over. For
                most of deep learning’s history, that staircase trained nearly every network.
              </p>
              <p>
                <strong>Cosine</strong> does the same work without the jolts — {@html tex(String.raw`\gamma`)} eases down the first half
                of a cosine from full strength to a small floor (about 5%): gentle at first, fastest
                through the middle, feather-light by the end. Lingering near full strength early is
                the point — the run banks its fast progress before precision matters. With no brutal
                transition it then simply settles, which is why cosine annealing is the modern default. <strong>Warmup + cosine</strong> bolts a short
                on-ramp onto the front: {@html tex(String.raw`\gamma`)} starts near zero and climbs over the first tenth before the
                cosine takes over. That protects the opening, where a run <em>begins</em> at a random,
                often dreadful point and one full-size step could fling the marker off the map — so it is
                now standard for training large models from scratch.
              </p>
              <p>
                One practical wrinkle: each shape stretches to fit the run, and at 1× the decay only
                finishes on the run’s very last step — so you never get to watch the <em>settled</em>
                tail. The <strong>Decay speed</strong> slider — it appears whenever a non-constant
                schedule is active on a finite run (in ∞ mode there is no horizon, so schedules switch
                off) — compresses the whole schedule into a fraction of the run, so at <em>4×</em> it
                finishes annealing a quarter of the way in and the rest of the run shows you the
                landing. Turn it up and read the result off the dotted {@html tex(String.raw`\gamma(t)`)} line in the loss chart.
              </p>
              <p>
                Scheduling has a second, deeper payoff that only lands once gradients turn <em>noisy</em>
                — the subject of the next part. A {@html tex(String.raw`\gamma`)} bled toward zero is the one thing that pulls a restless
                run in to a clean stop. And one optimizer you’ll meet there, <strong>Lion</strong>, takes a
                fixed-size step and so cannot settle <em>at all</em> on a constant {@html tex(String.raw`\gamma`)}: it just orbits the
                minimum forever. It is the purest illustration of why schedules exist — switch it to cosine
                and the orbit closes to a point.
              </p>
              {#if scheduleExperiment}
                <ChapterCta demo={() => runExperiment(scheduleExperiment)} demoLabel="Watch Lion orbit, then land" />
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
                <strong>SGD</strong>, stochastic gradient descent. (Two words of vocabulary while we are
                here: one batch update is an <strong>iteration</strong> or step; one full sweep through
                the whole dataset is an <strong>epoch</strong>.)
              </p>
              <p>
                Slide the <strong>Batch size</strong> down from <em>All</em> toward <em>1</em> and a
                faint <strong>fan</strong> of arrows opens at the marker: each ray is the gradient a
                different random batch would have handed you, so the <em>width of the fan is the noise
                itself.</em> The fewer points in the batch, the wider it spreads — and it spreads in a
                very specific way — the same law that steadies dice: average four rolls and the
                result wobbles about half as much as a single roll. The error of an average
                shrinks only with the <em>square root</em>
                of how many samples go into it, so a batch of 4 is roughly twice as steady as a batch
                of 1, and you need 16 to halve the noise again. That is the law of diminishing returns
                behind every batch-size choice: a batch of 32 already looks almost as calm as the full
                dataset, for a fraction of the cost.
              </p>
              <aside class="hd-note">
                <span class="hd-note-tag">In a billion dimensions</span>
                <p>
                  At scale this √n law becomes an economic one. The useful ratio is noise to
                  signal: below a problem-specific <em>critical batch size</em>, doubling the batch
                  lets you (roughly) double {@html tex(String.raw`\gamma`)} for the same trajectory — the linear-scaling rule
                  behind giant training runs; above it, extra data per step buys calm the run no
                  longer needs (Goyal et al., 2017; McCandlish et al., 2018). Bigger is not better —
                  bigger is <em>quieter</em>, and quiet has a price and a ceiling.
                </p>
              </aside>
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
                with both the step size {@html tex(String.raw`\gamma`)} and the width of the fan. On the loss curve it shows up as a
                fuzzy <em>band</em> rather than a clean line that flatlines — the run has arrived, but it
                can’t hold still. This is where the <strong>schedule</strong> from the last chapter earns
                its keep: a {@html tex(String.raw`\gamma`)} bled toward zero draws that ball in tight, turning the restless buzz into a
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
                  radius grows with {@html tex(String.raw`\gamma`)} (left). Bleed {@html tex(String.raw`\gamma`)} toward zero and the cloud draws in to a point (right):
                  the schedule, doing its quiet job.
                </figcaption>
              </figure>
              <p class="look">
                Watch it: set a small <strong>Batch size</strong> so the loss settles into a fuzzy band on
                <strong>Const</strong>, then switch the schedule to <strong>Cosine</strong> and see the
                band pinch shut over the final steps.
              </p>
              <ChapterCta
                lessonId={chLesson['ch-noise']}
                onLesson={() => startLessonFromChapter('ch-noise')}
                demo={chapterPresets['ch-noise'] ? () => runPreset('ch-noise') : null}
              />
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
                valley far steeper across than along. The {@html tex(String.raw`\gamma`)} that’s safe on the steep walls is
                hopeless along the gentle floor, so the marker rattles wall to wall. Every optimizer
                in the picker is a patch for that pain (or the new pain the last patch created) —
                170 years of <em>fix what just broke</em>: a single trunk of fixes that, once it
                reaches Adam, finally splits into the branches still being explored today. The
                picker is grouped to match.
              </p>
              <p>
                That ravine has a precise name: <strong>ill-conditioning</strong>. A smooth bowl curves
                at two rates — gently along its floor ({@html tex(String.raw`\lambda_{\min}`)}) and
                steeply across it ({@html tex(String.raw`\lambda_{\max}`)}) — and their ratio is the
                <strong>condition number</strong> {@html tex(String.raw`\kappa = \lambda_{\max}/\lambda_{\min}`)}.
                A round bowl has {@html tex(String.raw`\kappa = 1`)} and one good step reaches the bottom;
                a long, thin ravine has a huge {@html tex(String.raw`\kappa`)}, and that one number sets
                how slowly you converge. Even with the best fixed step,
                {@html tex(String.raw`\gamma = 2/(\lambda_{\min}+\lambda_{\max})`)}, each move closes the
                gap to the minimum by only a factor {@html tex(String.raw`(\kappa-1)/(\kappa+1)`)} — which
                creeps toward 1 as {@html tex(String.raw`\kappa`)} grows, so a stretched valley crawls no
                matter how you tune {@html tex(String.raw`\gamma`)}. Momentum sharpens that to roughly
                {@html tex(String.raw`(\sqrt{\kappa}-1)/(\sqrt{\kappa}+1)`)}, a
                {@html tex(String.raw`\sqrt{\kappa}`)} speed-up — the first hint of why the whole family
                below exists.
              </p>
              <figure class="fig">
                <div class="fig-viz">
                <svg class="fig-heat" viewBox="0 0 {ravineFig.W} {ravineFig.H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                  <defs>
                    <clipPath id="ravine-clip"><rect x="0" y="0" width={ravineFig.W} height={ravineFig.H} /></clipPath>
                    <clipPath id="ravine-contour-clip"><rect x="1.5" y="1.5" width={ravineFig.W - 3} height={ravineFig.H - 3} /></clipPath>
                    <marker id="ravine-arrow" viewBox="0 -5 10 10" refX="7" refY="0" markerWidth="3.1" markerHeight="3.1" orient="auto"><path d="M0,-5L10,0L0,5" fill={gDark ? '#cdd9f2' : '#475569'} /></marker>
                  </defs>
                  <g clip-path="url(#ravine-clip)">
                    <image href={ravHeat} x="0" y="0" width={ravineFig.W} height={ravineFig.H} preserveAspectRatio="none" />
                    <g clip-path="url(#ravine-contour-clip)">
                      <g transform="scale({ravineFig.W / ravineFig.gw}, {ravineFig.H / ravineFig.gh})">
                        {#each ravCont as cp}
                          <path d={cp.d} fill="none" stroke={gDark ? '#fff' : '#334155'} stroke-opacity={cp.o} stroke-width="1" vector-effect="non-scaling-stroke" />
                        {/each}
                      </g>
                    </g>
                    {#each ravArrows as a}<line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={gDark ? '#cdd9f2' : '#475569'} stroke-width={a.w} opacity={a.o} marker-end="url(#ravine-arrow)" />{/each}
                    <circle cx={ravineFig.min.x} cy={ravineFig.min.y} r="5" fill="none" stroke={gDark ? '#34d399' : '#059669'} stroke-width="1.8" stroke-dasharray="3,2.5" />
                    <!-- halos (dark on the night heatmap, light on the day one) so the trajectories read over any colour -->
                    <path d={ravineFig.gd} fill="none" stroke={gDark ? '#0a1218' : '#f8fafc'} stroke-opacity="0.55" stroke-width="3.8" stroke-linejoin="round" stroke-linecap="round" />
                    <path d={ravineFig.mom} fill="none" stroke={gDark ? '#0a1218' : '#f8fafc'} stroke-opacity="0.55" stroke-width="4.4" stroke-linejoin="round" stroke-linecap="round" />
                    <path d={ravineFig.gd} fill="none" stroke={gDark ? '#ffffff' : '#1e293b'} stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round" />
                    <path d={ravineFig.mom} fill="none" stroke={gDark ? '#c084fc' : '#7c3aed'} stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />
                    {#each ravineFig.gdPts as p}<circle cx={p.x} cy={p.y} r="1.7" fill={gDark ? '#ffffff' : '#1e293b'} stroke={gDark ? '#0a1218' : '#f8fafc'} stroke-opacity="0.55" stroke-width="0.7" />{/each}
                    {#each ravineFig.momPts as p}<circle cx={p.x} cy={p.y} r="2" fill={gDark ? '#c084fc' : '#7c3aed'} stroke={gDark ? '#0a1218' : '#f8fafc'} stroke-opacity="0.55" stroke-width="0.7" />{/each}
                    <circle cx={ravineFig.start.x} cy={ravineFig.start.y} r="4.2" fill="#f59e0b" stroke={gDark ? '#fff' : '#1e293b'} stroke-width="1.3" />
                    <g transform="translate(9,9)">
                      <rect x="-4" y="-7" width="116" height="25" rx="5" fill={gDark ? '#ffffff' : '#0f172a'} fill-opacity={gDark ? 0.86 : 0.055} stroke="#0f172a" stroke-opacity="0.14" stroke-width="0.5" />
                      <!-- GD swatch: white line on a dark halo in the night box; a plain dark line on the day box -->
                      <line x1="1" y1="0" x2="12" y2="0" stroke="#0a1218" stroke-opacity={gDark ? 0.5 : 0} stroke-width="2.8" stroke-linecap="round" />
                      <line x1="1" y1="0" x2="12" y2="0" stroke={gDark ? '#ffffff' : '#1e293b'} stroke-width="1.6" stroke-linecap="round" />
                      <text x="16" y="2.4" class="fig-svg-label" style="text-anchor:start;fill:#1e293b;font-size:8.5px">plain GD — zig-zags</text>
                      <line x1="1" y1="11" x2="12" y2="11" stroke="#a855f7" stroke-width="2.1" stroke-linecap="round" />
                      <text x="16" y="13.4" class="fig-svg-label" style="text-anchor:start;fill:#1e293b;font-size:8.5px">momentum — glides</text>
                    </g>
                  </g>
                </svg>
                <GuideVizLayers state={ravineViz} onpatch={(p) => (ravineViz = { ...ravineViz, ...p })} />
                <div class="fig-cbar">
                  <span class="fig-cbar-lbl">loss</span>
                  <span class="fig-cbar-val">{ravineFig.visMax.toFixed(2)}</span>
                  <div class="fig-cbar-bar" style="background: linear-gradient(to bottom, {colormapStops(ravineViz.colormap, 8, gTheme)});"></div>
                  <span class="fig-cbar-val">{ravineFig.visMin.toFixed(2)}</span>
                </div>
                </div>
                <figcaption class="fig-cap">
                  The ravine: a valley far steeper across than along. One safe step size makes plain GD
                  (white) rattle wall to wall while it crawls along the floor; momentum (violet) builds
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
                    <marker id="race-arrow" viewBox="0 -5 10 10" refX="7" refY="0" markerWidth="3.1" markerHeight="3.1" orient="auto"><path d="M0,-5L10,0L0,5" fill={gDark ? '#cdd9f2' : '#475569'} /></marker>
                    <linearGradient id="race-cbar" x1="0" y1="0" x2="0" y2="1">
                      {#each cmapStopColors(raceViz.colormap, 8, gTheme) as col, i}<stop offset={i / 8} stop-color={col} />{/each}
                    </linearGradient>
                  </defs>
                  <g clip-path="url(#race-clip)">
                    <image href={raceHeat} x="0" y="0" width={RACE_W} height={RACE_H} preserveAspectRatio="none" />
                    <g clip-path="url(#race-contour-clip)">
                      <g transform="scale({RACE_W / raceDemo.gw}, {RACE_H / raceDemo.gh})">
                        {#each raceCont as cp}
                          <path d={cp.d} fill="none" stroke={gDark ? '#fff' : '#334155'} stroke-opacity={cp.o} stroke-width="1" vector-effect="non-scaling-stroke" />
                        {/each}
                      </g>
                    </g>
                    {#each raceArrows as a}<line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={gDark ? '#cdd9f2' : '#475569'} stroke-width={a.w} opacity={a.o} marker-end="url(#race-arrow)" />{/each}
                    {#each raceDemo.racers as r (r.id)}
                      {@const hot = raceHover === r.id}
                      {@const dim = raceHover !== null && !hot}
                      <path d={r.d} fill="none" stroke={r.color} stroke-width={hot ? 3 : 1.7} stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" opacity={hot ? 1 : !raceOn[r.id] ? 0 : dim ? 0.13 : 0.9} style="transition: opacity 0.15s ease, stroke-width 0.15s ease; filter: {gDark ? 'none' : 'drop-shadow(0 0 0.7px rgba(15,23,42,0.85))'};">
                        <animate attributeName="stroke-dashoffset" values="100;0;0" keyTimes="0;{r.frac};1" dur="7s" repeatCount="indefinite" />
                      </path>
                    {/each}
                    <circle cx={raceDemo.min[0]} cy={raceDemo.min[1]} r="7" fill="none" stroke={gDark ? '#10b981' : '#059669'} stroke-width="1.5" stroke-dasharray="3,2.5" />
                    <circle cx={raceDemo.start[0]} cy={raceDemo.start[1]} r="8" fill="none" stroke="#f59e0b" stroke-width="1.75" opacity="0.9" />
                    <circle cx={raceDemo.start[0]} cy={raceDemo.start[1]} r="4.5" fill="#f59e0b" stroke={gDark ? '#fff' : '#1e293b'} stroke-width="1.5" />
                    {#each raceDemo.racers as r (r.id)}
                      {@const hot = raceHover === r.id}
                      {@const dim = raceHover !== null && !hot}
                      <circle r={hot ? 4.6 : 3.2} fill={r.color} stroke={gDark ? '#fff' : '#0f172a'} stroke-width="1.25" opacity={hot ? 1 : !raceOn[r.id] ? 0 : dim ? 0.13 : 1} style="transition: opacity 0.15s ease;">
                        <animateMotion path={r.d} keyPoints="0;1;1" keyTimes="0;{r.frac};1" calcMode="linear" dur="7s" repeatCount="indefinite" />
                      </circle>
                    {/each}
                    <!-- loss colorbar (bottom-right, in viewBox coords) -->
                    <g>
                      <rect x="439" y="164" width="7" height="50" rx="2" fill="url(#race-cbar)" stroke={gDark ? 'rgba(255,255,255,0.32)' : 'rgba(15,23,42,0.35)'} stroke-width="0.5" />
                      <text x="442.5" y="159" class="fig-svg-label" style="fill:{gDark ? '#fff' : '#1e293b'};stroke:{gDark ? '#0a1218' : '#fff'};stroke-width:2.4;paint-order:stroke;font-size:8px">{raceDemo.visMax.toFixed(0)}</text>
                      <text x="442.5" y="224" class="fig-svg-label" style="fill:{gDark ? '#fff' : '#1e293b'};stroke:{gDark ? '#0a1218' : '#fff'};stroke-width:2.4;paint-order:stroke;font-size:8px">{raceDemo.visMin.toFixed(1)}</text>
                    </g>
                  </g>
                </svg>
                <GuideVizLayers state={raceViz} onpatch={(p) => (raceViz = { ...raceViz, ...p })} />
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
                  {#if c.act.intro}<p class="opt-act-intro">{@html mathHtml(c.act.intro)}</p>{/if}
                {/if}
                {#if c.lead}<p class="opt-lead">{@html mathHtml(c.lead)}</p>{/if}
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
                  {#if c.hd}
                    <aside class="hd-note">
                      <span class="hd-note-tag">In a billion dimensions</span>
                      <p>{@html mathText(c.hd)}</p>
                    </aside>
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
                  {@html tex(String.raw`\alpha`)} and {@html tex(String.raw`\beta`)}, there is no matrix to exploit — strip the structure away and they collapse
                  to methods already in the list. That matrix structure is exactly why they scale to
                  billions of parameters, and exactly why a two-parameter sandbox is the wrong stage
                  for them. To meet them you have to leave the playground — which is a fair note to
                  end the tree on.
                </p>
              </div>

              <ChapterCta
                lessonId={chLesson['ch-optimizers']}
                onLesson={() => startLessonFromChapter('ch-optimizers')}
                demo={raceExperiment ? () => runExperiment(raceExperiment) : null}
              />
              {#if chRefs['ch-optimizers']}
                <div class="ch-refs">
                  <span class="ch-refs-label">Further reading</span>
                  {#each chRefs['ch-optimizers'] as r}
                    <a class="opt-cite-link" href={r.href} target="_blank" rel="noopener noreferrer">
                      {#if r.kind === 'paper'}<FileText size={11} strokeWidth={2.2} />{:else}<BookOpen size={11} strokeWidth={2.2} />{/if}
                      {r.label}
                    </a>
                  {/each}
                </div>
              {/if}
            </section>

            <!-- ============== 9 · TRAINING LOSS ISN'T THE GOAL ============== -->
            <section data-ch="ch-generalize" id="ch-generalize">
              <h3><svelte:component this={chIcon['ch-generalize']} size={18} strokeWidth={2} /> Training loss isn’t the goal</h3>

              <p>
                Every chapter so far has worked to drive the <em>training</em> loss down. But that number
                is only a stand-in for what we actually want. We don’t care about fitting the data we
                already have — we care about predicting data we <strong>haven’t seen</strong>. Doing well
                on new data is <strong>generalization</strong>, and it is the whole point.
              </p>
              <p>
                The loss we minimize is the average error over the training set — the <strong>empirical
                risk</strong> — but the real target is the average error over <em>all</em> future data,
                the <strong>true risk</strong>. With limited or noisy data the two come apart. Push the
                training loss too low and the model starts memorizing the quirks and noise of <em>this</em>
                sample: training loss keeps falling while error on held-out data turns and climbs. That
                divergence is <strong>overfitting</strong>.
              </p>

              <figure class="fig">
                <svg viewBox="0 0 {genFig.W} {genFig.H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                  <line x1={genFig.padL} y1={genFig.yBase} x2={genFig.x1} y2={genFig.yBase} class="fig-contour" style="stroke-opacity:0.35" />
                  <line x1={genFig.padL} y1={genFig.padT} x2={genFig.padL} y2={genFig.yBase} class="fig-contour" style="stroke-opacity:0.35" />
                  <line x1={genFig.stop.x} y1={genFig.stop.yTop} x2={genFig.stop.x} y2={genFig.yBase} stroke="var(--color-text-tertiary)" stroke-width="1" stroke-dasharray="3,3" stroke-opacity="0.65" />
                  <path d={genFig.testD} fill="none" stroke="#f59e0b" stroke-width="2.3" stroke-linecap="round" />
                  <path d={genFig.trainD} fill="none" stroke="#10b981" stroke-width="2.3" stroke-linecap="round" />
                  <circle cx={genFig.stop.x} cy={genFig.stop.y} r="3.6" fill="#f59e0b" stroke="#fff" stroke-width="1.2" />
                  <text x={genFig.testEnd.x - 4} y={genFig.testEnd.y + 2} class="fig-svg-label" style="text-anchor:end;fill:#f59e0b">test loss</text>
                  <text x={genFig.trainEnd.x - 4} y={genFig.trainEnd.y - 7} class="fig-svg-label" style="text-anchor:end;fill:#10b981">training loss</text>
                  <text x={genFig.stop.x} y={genFig.stop.yTop - 3} class="fig-svg-label" style="fill:var(--color-text-tertiary)">early stop</text>
                  <text x={genFig.padL - 6} y={genFig.padT + 4} class="fig-svg-label" style="text-anchor:end;fill:var(--color-text-tertiary)">loss</text>
                  <text x={genFig.x1} y={genFig.yBase + 18} class="fig-svg-label" style="text-anchor:end;fill:var(--color-text-tertiary)">training time →</text>
                </svg>
                <figcaption class="fig-cap">
                  Training loss (green) keeps falling; test loss (amber), measured on held-out data, bottoms
                  out and then rises as the model begins fitting noise. The dip is where you’d want to stop.
                </figcaption>
              </figure>

              <p>
                Two fixes follow directly. The first is to <em>measure</em> the gap: hold out part of the
                data as a <strong>test</strong> (or validation) set, and watch its loss alongside the
                training loss — that is the second curve in the <strong>Loss History</strong> panel. The
                second is <strong>early stopping</strong>: end training at the test-loss minimum rather
                than the training-loss minimum. It is the simplest regularizer there is, and — for a
                run started near zero — in the quadratic case it is provably close to an explicit
                weight penalty (Bishop, 1995; Goodfellow et al., 2016, §7.8).
              </p>
              <p>
                That penalty is <strong>regularization</strong>: instead of minimizing the loss alone, add
                a term that prefers smaller, simpler parameters,
              </p>
              <div class="formula-display center">{@html texD(String.raw`\min_{\boldsymbol{\theta}}\;\; \mathcal{L}(\boldsymbol{\theta}) \;+\; \tfrac{\lambda}{2}\,\lVert \boldsymbol{\theta}\rVert^2`)}</div>
              <p>
                where {@html tex(String.raw`\lambda`)} sets how hard to pull toward zero. (An unrelated
                {@html tex(String.raw`\lambda`)}, by the way — not the curvature
                {@html tex(String.raw`\lambda_{\max}`)} from the learning-rate chapter. The alphabet is
                small and the field is greedy.) For plain SGD the
                gradient of that penalty is exactly <strong>weight decay</strong> —
                {@html tex(String.raw`\boldsymbol{\theta} \leftarrow (1-\gamma\lambda)\,\boldsymbol{\theta} - \gamma\nabla\mathcal{L}`)}
                — shrinking every weight a touch each step (Krogh &amp; Hertz, 1991). This is the same
                {@html tex(String.raw`\lambda`)} you met on <strong>AdamW</strong>, which decouples the
                decay from the adaptive scaling so it behaves like a true penalty again.
              </p>
              <p>
                Geometry has the last word, and it loops back to the noise chapter. Not all minima
                generalize equally: a <em>wide, flat</em> basin is forgiving — small shifts in the data
                barely move the loss — while a <em>sharp</em> one is brittle. Flat minima tend to
                generalize better (Hochreiter &amp; Schmidhuber, 1997), the restless noise of small-batch
                SGD tends to settle into them, and very large batches tend to find sharper minima with a
                measurable generalization gap (Keskar et al., 2017). So the real target was never the exact
                bottom of the training bowl — it is a low, <em>wide</em> region that also sits low on data
                you will never see. Optimization gets you down; generalization decides whether down was
                worth reaching.
              </p>
              <aside class="hd-note">
                <span class="hd-note-tag">In a billion dimensions</span>
                <p>
                  Two honest asterisks on this tidy story. First, “flat” is slippery: a network can
                  be rescaled — same function, same predictions — while its measured sharpness
                  changes arbitrarily, so naive flatness can’t be the whole answer (Dinh et al.,
                  2017). Second, at scale good minima aren’t isolated dips like the ones drawn
                  here: they connect into long low-loss valleys you can walk between without
                  climbing (Garipov et al., 2018). The intuition survives — restless SGD prefers
                  forgiving regions — but hold it as a compass, not a theorem.
                </p>
              </aside>
              {#if chapterPresets['ch-generalize']}
                <ChapterCta demo={() => runPreset('ch-generalize')} demoLabel={chapterPresets['ch-generalize'].title} />
              {/if}
              {#if chRefs['ch-generalize']}
                <div class="ch-refs">
                  <span class="ch-refs-label">Further reading</span>
                  {#each chRefs['ch-generalize'] as r}
                    <a class="opt-cite-link" href={r.href} target="_blank" rel="noopener noreferrer">
                      {#if r.kind === 'paper'}<FileText size={11} strokeWidth={2.2} />{:else}<BookOpen size={11} strokeWidth={2.2} />{/if}
                      {r.label}
                    </a>
                  {/each}
                </div>
              {/if}
            </section>

            <!-- ============== 10 · THE PROBLEMS ============== -->
            <section data-ch="ch-problems" id="ch-problems">
              <div class="part-label">Part IV · The zoo</div>
              <h3><svelte:component this={chIcon['ch-problems']} size={18} strokeWidth={2} /> The landscape zoo</h3>
              <p>
                Every problem here has at most two parameters — the three 1D warm-ups use just {@html tex(String.raw`\alpha`)} —
                and a loss surface you can see live. Each surface tells a different story, from a
                single clean bowl to four-way ties and exploding cliffs, and each ships with a
                curated default learning rate and view (and, where it helps, momentum).
              </p>

              {#each Object.entries(problemCards) as [groupName, list]}
                <div class="problem-group-label">{groupName}</div>
                <div class="problem-grid">
                  {#each list as p}
                    <div class="problem-card">
                      <div class="problem-icon">
                        {#if p.customIcon}<span class="custom-icon">{p.customIcon}</span>
                        {:else if p.icon}<svelte:component this={probIcon[p.icon]} size={18} strokeWidth={2} />{/if}
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
                <li><strong>Loss &amp; Gradient</strong> — the loss landscape seen from above: the vivid end of the colour scale marks low loss (bright in night mode, deep in day mode — the colour bar shows which), thin contours join equal-loss points, and the field arrows are {@html tex(String.raw`-\nabla\mathcal{L}`)}. On the marker, the <span class="ink-blue">blue arrow</span> is steepest descent and the <span class="ink-red">red arrow</span> is the step actually taken. Drag the marker to teleport.</li>
                <li><strong>Loss History</strong> — train and test loss versus step. A clean decline is healthy; spikes mean you’re overshooting (too much {@html tex(String.raw`\gamma`)} or {@html tex(String.raw`\mu`)}); a persistent train/test gap hints at overfitting.</li>
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
                <span class="kbd-item"><kbd>A</kbd> Arrows</span>
                <span class="kbd-item"><kbd>F</kbd> Flow</span>
                <span class="kbd-item"><kbd>C</kbd> Contours</span>
              </div>
              <div class="end-mark">∂</div>
            </section>
          </div>
        </div>
      </div>

      <footer class="modal-footer">
        <p>Built with {@html tex(String.raw`\partial`)} by <strong>Neo Mohsenvand</strong></p>
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
    position: relative;
    --bar-h: 50px; /* shared header/footer height — both equally thin */
    background: var(--color-bg-secondary);
    border-radius: 16px;
    width: 100%;
    max-width: 1040px;
    height: min(90vh, 880px);
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

  /* ---------- Header (frosted overlay; the reading column drifts under it) ---------- */
  .modal-header {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 4;
    height: var(--bar-h);
    padding: 0 1.4rem;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(255, 255, 255, 0.72);
    -webkit-backdrop-filter: blur(14px) saturate(1.4);
    backdrop-filter: blur(14px) saturate(1.4);
  }
  :global([data-theme='dark']) .modal-header { background: rgba(20, 31, 46, 0.7); }
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
    width: 32px; height: 32px;
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
     (the "tiny cross"). Plain neutral colour, no box. */
  .close-btn :global(svg) { width: 20px; height: 20px; flex-shrink: 0; }
  .close-btn:hover { background: var(--color-bg-tertiary); color: var(--color-text-primary); }
  .close-btn:active { transform: scale(0.94); }

  /* ---------- Reading-progress bar (rides the header's lower edge) ---------- */
  .reading-progress {
    position: absolute;
    top: var(--bar-h);
    left: 0;
    right: 0;
    z-index: 4;
    height: 2px;
    background: var(--color-bg-tertiary);
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
    /* clear the frosted header/footer top and bottom */
    padding: calc(var(--bar-h) + 1rem) 0.65rem calc(var(--bar-h) + 1rem);
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
    /* clear the frosted header/footer so content drifts under, never behind */
    padding: calc(var(--bar-h) + 1.4rem) 2.5rem calc(var(--bar-h) + 1.6rem);
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
  /* Layered landscape figures (ravine, race): a relative frame holding the SVG,
     the Layers popover, and the loss colorbar. */
  .fig-viz {
    position: relative;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    overflow: hidden;
  }
  .fig-viz > svg { display: block; width: 100%; }
  .fig-cbar {
    position: absolute; right: 9px; bottom: 9px; z-index: 4;
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    pointer-events: none;
  }
  .fig-cbar-lbl { font-size: 8.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #e2e8f0; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7); }
  .fig-cbar-val { font-size: 9px; font-weight: 600; color: #e2e8f0; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7); }
  .fig-cbar-bar { width: 8px; height: 46px; border-radius: 2px; border: 1px solid rgba(255, 255, 255, 0.32); }
  /* Day: dark labels + a light halo so they read where the bar edge is light. */
  :global([data-theme='light']) .fig-cbar-lbl,
  :global([data-theme='light']) .fig-cbar-val { color: #1e293b; text-shadow: 0 1px 2px rgba(255, 255, 255, 0.75); }
  :global([data-theme='light']) .fig-cbar-bar { border-color: rgba(15, 23, 42, 0.28); }
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
    font-size: 0.8rem; line-height: 1.5; text-align: left;
    color: var(--color-text-tertiary); margin: 0.55rem 0 0;
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
  .proof-figcap { font-size: 0.76rem; line-height: 1.5; text-align: left; color: var(--color-text-tertiary); margin-top: 0.5rem; }
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
    text-align: left;
    margin-top: 0.4rem;
    line-height: 1.5;
    padding: 0.1rem 0.2rem 0.7rem;
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

  /* KaTeX labels inside SVG figures (via foreignObject) — the same math
     type as the running text, so figures and prose can't drift apart. */
  .modal-body :global(.fig-tex) {
    display: inline-block;
    font-size: 10.5px;
    line-height: 1;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
  .modal-body :global(.fig-tex.dim) { color: var(--color-text-tertiary); }
  .modal-body :global(.fig-tex .katex) { font-size: 1em; }
  .modal-body :global(.fig-word) {
    display: block;
    font-size: 9px;
    letter-spacing: 0.04em;
    color: var(--color-text-tertiary);
    white-space: nowrap;
  }

  /* "In higher dimensions…" — the recurring honesty channel. Same badge and
     voice everywhere, so readers learn to expect the correction. */
  .hd-note {
    margin: 0.9rem 0;
    padding: 0.65rem 0.9rem 0.7rem 1rem;
    border-left: 3px solid #8b5cf6;
    border-radius: 0 10px 10px 0;
    background: color-mix(in srgb, #8b5cf6 7%, transparent);
  }
  .hd-note-tag {
    display: block;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #8b5cf6;
    margin-bottom: 0.25rem;
  }
  .hd-note-tag::before { content: '∞ '; font-weight: 600; }
  .hd-note p {
    margin: 0;
    font-size: 0.865rem;
    line-height: 1.55;
    color: var(--color-text-secondary);
  }

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

  /* ---------- Top-of-guide "take the course" banner ---------- */
  .course-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.25rem;
    flex-wrap: wrap;
    margin: 0 0 2.4rem;
    padding: 0.95rem 1.1rem;
    border: 1px solid rgba(16, 185, 129, 0.35);
    border-radius: 12px;
    background: rgba(16, 185, 129, 0.07);
  }
  .course-banner-text { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .course-banner-text strong { font-size: 0.95rem; font-weight: 700; color: var(--color-text-primary); }
  .course-banner-text span { font-size: 0.82rem; color: var(--color-text-secondary); line-height: 1.45; }
  /* Same vibrant-emerald + near-black treatment as the chapters' "Learn by
     doing" pill, so the two read as one family. */
  .course-banner-btn {
    flex-shrink: 0;
    display: inline-flex; align-items: center; gap: 0.45rem;
    padding: 0.55rem 1.05rem;
    border: none; border-radius: 9px;
    background: #10b981; color: #04130d;
    font-size: 0.85rem; font-weight: 700;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
    transition: background 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
  }
  .course-banner-btn:hover { background: #34d399; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35); }
  .course-banner-btn:active { transform: scale(0.98); }

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
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 4;
    min-height: var(--bar-h);
    border-top: 1px solid var(--color-border);
    padding: 0 1.4rem;
    display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    background: rgba(255, 255, 255, 0.72);
    -webkit-backdrop-filter: blur(14px) saturate(1.4);
    backdrop-filter: blur(14px) saturate(1.4);
  }
  :global([data-theme='dark']) .modal-footer { background: rgba(20, 31, 46, 0.7); }
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
    .modal-content { height: 95dvh; border-radius: 14px; --bar-h: 46px; }
    .modal-header { padding: 0 1rem; }
    .modal-header h2 { font-size: 1.1rem; }
    .modal-icon { font-size: 1.5rem; }
    .book-tag { display: none; }

    /* Drop the rail; the reading column takes the full width. */
    .toc { display: none; }
    .reading-column { padding: calc(var(--bar-h) + 0.9rem) 1.1rem calc(var(--bar-h) + 1rem); max-width: 100%; }

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
    .modal-footer { padding: 0 1rem; }
  }
</style>
