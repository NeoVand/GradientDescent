# Gradient Lab — Capability & Vision Audit
*(read-only survey; sources: App.svelte, Sidebar.svelte, stores.ts, trainer.ts, urlState.ts, replay.ts, lessons.ts, tour.ts, experiments.ts, RaceSettingsModal.svelte, LossLandscape[3D].svelte, DataVisualization.svelte, LossHistory.svelte, GuidePanel.svelte, hessian.ts, preview.ts, basins.ts, schedules.ts, optimizers.ts, problems.ts, vite.config)*

---

## (a) Feature inventory — every user-facing capability

### Layout & chrome
- **Desktop**: CSS-grid — sidebar (Problem → Data → Optimizer → Run cards) | main area with top row (Data plot + Loss landscape) and bottom row (Loss history + live-formula GuidePanel). Analytic (`noData`) problems hide the Data plot; landscape takes the full row.
- **Mobile (≤768 px)**: sticky top bar (menu, Train pill, tour, share, help, theme), off-canvas sidebar drawer, vertically stacked scrolling plots; the formulas panel is hidden entirely on mobile.
- **Floating tool corner (desktop)**: tour (compass), share, guide (graduation cap), fullscreen (Fullscreen API), theme toggle.
- **Theme**: light ("day mode", full re-tinted heatmap with dark-basins-on-light) / dark; persisted; follows system preference initially. Day mode reaches the 2D plot, guide viz, and the 3D surface (per memory: 2026-07 sprint).
- **PWA**: vite-plugin-pwa with `registerType: 'autoUpdate'`, manifest + icons; installable, offline-capable.
- **Problem-switch veil**: a brief fade masks the multi-panel redraw.

### Problems (24 configs in `problems.ts`; picker groups them by learning arc)
- **Start in 1D** (3): Fit a Slope, Double Well, Bumpy Valley — rendered as a loss-vs-α curve (`LossCurve1D`), 2D/3D toggle disabled (`oneParam`).
- **Fit curves** (9): Linear, Polynomial, Sine, Gaussian Peak, Exponential Decay, Damped Oscillator, Logistic Growth, Power Law, Gaussian Mixture.
- **Classify & locate** (4): Logistic Regression, Circle Classifier, Source Localization, Mean-Shift Cluster. For "2D-point problems" (circle, source-loc, mean-shift) the marker (α, β) is drawn ON the data plot itself in the same coordinate frame.
- **Time series** (2): AR(2), AR(2) Rollout (read-only data — hand edits would break lag structure).
- **Neural network** (1): Tiny Net ŷ = β·tanh(αX) with twin sign-symmetric minima.
- **Classic surfaces** (3, `noData`): Rosenbrock, Saddle Point, Himmelblau.
- **Your data** (2): Custom Regression (line / quadratic / exponential / power / typed formula with finite-difference gradients, adaptive parameter window) and Custom Classification (linear boundary / circle), with CSV/text paste import.
- Note: the guide chapter is titled "The 22 landscapes" while the picker holds 24 entries (22 built-in + 2 custom) — worth keeping consistent as the textbook firms up.
- Each problem carries curated defaults: `defaultLearningRate`, optional `defaultMomentum`, optional `parameterRange`, `getInitialParameters`, `tagline` (coach line on switch).

### Optimizers (14) & training engine
- gd, momentum, nesterov, adagrad, rmsprop, adadelta, adam, nadam, adamw, radam, newton, sophia, lion, prodigy. Adaptive ones carry `fixedLearningRate`; Newton/Sophia flag `usesHessian` and receive a finite-difference Hessian (`computeHessian`, same batch as the gradient). Hyperparameter sliders are generated from each optimizer's spec (shared icon/colour language via `hyperMeta`).
- **Trainer** (`trainer.ts`): single API for run/step/reset/problem-switch/optimizer-switch; animated loop at `stepsPerSecond` (live-rebuilding ticker); marker-drag holds the loop; **continuous (∞) mode** (steps slider pulled past max) loops forever with schedule disabled; divergence detected per-step (non-finite or |θ|>1e4) BEFORE committing — banner + never-NaN charts.
- **Schedules** (4): constant, step decay, cosine (→5 %), warmup+cosine, plus a `scheduleSpeed` multiplier; applied by progress-through-run; charted as an overlay in LossHistory.
- **Batching**: 1/2/4/8/16/32/all; uniform sample without replacement, deliberately **unseeded** per step (SGD noise is the exhibit). Chart always reports full-train-set loss.
- **Post-run coach verdicts**: converged (first-entry-into-basin step count, log-space basin threshold), stalled (flatlined + tiny ‖∇ℒ‖), descending ("out of steps"); "started inside the basin" honesty check.

### Loss landscape (2D)
- Cached scene per (data, problem): heatmap image, contour thresholds, gradient vector field (`lossSceneStore`).
- **Layers popover**: field glyph = arrows / streamlines / off; density Low/High; iso-loss contours on/off; 3 colormaps (viridis, inferno, cubehelix) — all persisted and shared with 1D and 3D views.
- **Draggable marker** with: next-step **ghost** (true dry-run of the selected optimizer incl. live momentum state and scheduled γ, via `preview.ts`), blue −∇ℒ arrow vs red actual-Δθ arrow, **SGD gradient fan** (per-minibatch gradient spread) when batch < all.
- **Curvature lens** (persisted toggle): local quadratic ellipse from the FD Hessian, principal axes with up/down colouring, definiteness chip (bowl / saddle / dome / flat), condition number κ = |λ₁|/|λ₂| readout, and the **Newton step −H⁻¹∇ℒ** drawn at true scale.
- **Basins of attraction** (persisted toggle): Web-Worker map of which minimum plain GD reaches from every cell; categorical palette (deliberately not viridis); cached per (problem, data, γ, range); also colours the 3D surface per-vertex.
- **Race trails** with legend hover spotlight; divergence banner; coach overlay; challenge target pill.
- **Video export**: replays the run onto an offscreen 1080×1080 canvas → WebM (VP9/VP8), ≤8 s @30 fps, watermark + step counter (`replay.ts`).
- 1D problems swap in `LossCurve1D` (tangent line, ghost, same layer semantics).

### Loss landscape (3D)
- three.js surface (lazy-loaded), same cached grid + normalized log-loss mapping so 2D and 3D always agree; contour rings at shared thresholds; descent path as red tube; draggable marker sphere via raycast; draped arrow/streamline field; basin colouring; race trails; day/dark lighting; OrbitControls rotate/zoom. Keyboard `D` flips 2D↔3D (persisted).

### Data plot & editor
- Scatter + true function + live model fit; train vs test point styling.
- **Editable** for curve-fitting problems: toolbar tools add-train / add-test / erase (click on plot).
- **Class editor** for every binary classifier: place points by class (0/1) into train or test split.
- **Custom data ingestion**: paste CSV/whitespace rows (`x, y[, train-flag]` or `x₁, x₂, class[, flag]`).
- Dataset settings: n points (10–100), noise (0–2), train ratio (0.1–0.9), random/sequential split, **seeded** RNG with dice-reroll — same seed replays the same randomness so sliders deform data smoothly.

### Race mode
- Lineup of up to 14 optimizers from the marker's current start; shared minibatch per tick; per-racer curated-or-overridden γ/hypers; race-wide steps budget, speed, schedule, batch size; first-to-basin finish; coach posts finishing order. All config persisted in localStorage (`gd-race-config`). RaceSettingsModal: lineup column + focused-optimizer tuning column with sparse overrides.

### Course, tour, guide
- **Course** (`lessons.ts`): 10 predict-observe-explain lessons (downhill, step size, local-min trap, dead plateau, momentum race, SGD noise, Rosenbrock, Adam-on-plateau, saddle, tiny-net symmetry). Deterministic scenarios (fixed seeds/markers). Welcome card → setup → predict (commit an answer) → run → reveal; progress persisted; launchable per-chapter from the guide (`enterCourseFromChapter`).
- **Tour** (`tour.ts`): driver.js walk over 23 anchors (sidebar rows, run deck, plots, toggles); auto-pops once on first desktop visit; self-filters to visible anchors (so mobile shrinks it).
- **Guide** (HelpModal): booklet — Part contents: ch-bowl, ch-landscape, ch-shapes, ch-downhill, ch-step, ch-gamma, ch-schedule, ch-noise, ch-optimizers (five-act family tree with inventor portraits + further-reading refs), ch-generalize, ch-problems, ch-experiments, ch-panels, ch-keys. **Chapter presets** (`chapterPresets`) close the book and stage a matching live scenario with a coach note (8 chapters wired: generalize, shapes, bowl, landscape, downhill, step, gamma, noise). **Experiments** ("Things to try", 9): local-minimum, symmetric pair, vanishing gradient, narrow valley, noisy truth, Adam-vs-GD, banana race, Lion-needs-a-schedule, marker-is-model.
- **GuidePanel**: live KaTeX — model, parameters, loss, gradient, update rule per problem/optimizer.

### Sharing & misc
- **Share popover**: plain scenario link, or **challenge link** ("reach the basin in ≤ N steps") — target prefilled from your own last converged run ("beat my score"); challenge judged by the trainer with beaten/missed verdicts.
- **Keyboard**: Space train/pause, S step, R reset, D 2D/3D, A arrows-field, F streamlines, C contours, arrow keys nudge marker (Shift = coarse), all suppressed during modal/tour.
- **Coach** one-liners (success/info/warn, TTL or sticky), divergence explainer, loss-history log-scale toggle, GA4 gated to gradientlab.ai.

---

## (b) URL state — what a printed textbook could and could not deep-link

`urlState.ts` encodes into the **location hash** (good: works on a static host, survives QR codes, never hits the server):

| Encoded | Param | Notes |
|---|---|---|
| Challenge goal | `g` | optional; 1–10000 |
| Problem | `p` | validated against `problemConfigs` |
| Optimizer + hypers | `o`, `h_*` | hypers clamped to each spec's min/max |
| Learning rate | `lr` | 3 sig figs; decode clamps to [1e-4, 1] (slider range) |
| Batch size, steps | `bs`, `st` | steps clamped [10, 1000] |
| Schedule + speed | `sch`, `scs` | only if non-constant |
| Dataset | `n`, `no`, `tr`, `rs`, `sd` | **seed included** → exact same data reproduces |
| Marker | `a`, `b` | 4 decimals |
| View | `v` | 2d/3d |

Decoding is defensive (fallbacks, clamps, unknown problem → abort) — good for links printed in a book that must not rot. **So yes: for the 22 built-in problems, a textbook margin QR can already pin problem, optimizer, every hyperparameter, γ, schedule (+speed), batch size, step budget, the exact dataset, the exact starting marker, and 2D-vs-3D.** That is a genuinely strong baseline most edu tools lack.

### What a textbook deep link CANNOT yet express
1. **Overlay state** — the field mode (arrows/streamlines/off), density, contours, colormap, **basins toggle**, and **curvature lens** all live in localStorage only. A chapter that says "open this link; the curvature lens shows κ ≈ 2500" cannot guarantee the lens is on. This is the single biggest gap for the book.
2. **Custom problems** — the chosen custom model (line/quadratic/…/typed formula) and, critically, **hand-placed or pasted data points** are not encoded. `custom-regression`/`custom-classification` links will decode the problem id but regenerate nothing meaningful (custom data lives only in memory). Any hand-edited dataset (click-added/erased points on built-ins too) silently reverts to the seeded generation.
3. **Race setups** — lineup, overrides, race budget/schedule/batch are localStorage-only; there is no way to link "race GD vs Momentum vs Adam on Rosenbrock with these γs", nor an auto-start-race flag. Race is one of the book's best demos and it is unshareable.
4. **Course & guide anchors** — no `?lesson=saddle` or `#ch-gamma` deep link; the book cannot say "continue in Lesson 7" as a link. (Lessons are already deterministic — the plumbing is all there.)
5. **Run dynamics** — `stepsPerSecond` and continuous (∞) mode aren't encoded; an "auto-train on open" flag doesn't exist (a challenge link still requires pressing Train — arguably a feature, but a "watch this" figure link may want autoplay).
6. **SGD reproducibility** — minibatch sampling is *deliberately* unseeded (`sampleBatch` uses `Math.random`), so a shared stochastic scenario reproduces the dataset and start but **not the trajectory**. Fine pedagogically, but the book cannot print "your path will match Figure 7.3" for any batch < all. An optional `bseed` param (rng.ts already has seeding infrastructure) would make stochastic figures reproducible.
7. **No schema version** — a `v=1`-style version field would future-proof printed links against param renames over the book's lifetime.
8. Theme (day/dark) isn't encoded — book screenshots will presumably be day-mode; a `th` param would let links match the printed figure.

---

## (c) Demos the textbook will want that the app can't do yet

1. **Condition-number dial**: an anisotropic quadratic ½(λ₁α² + λ₂β²) with a κ slider (1 → 10⁴). The book's ill-conditioning chapter wants "turn κ up and watch GD's zig-zag angle and step cap change *continuously*" — today κ is only whatever Rosenbrock/exponential-decay happen to have. Cheap to add as one more analytic problem, and it makes the 2/λ_max stability story quantitative.
2. **Step-size stability boundary demo**: the guide teaches γ < 2/λ_max, and `hessian.ts` can compute λ_max at the minimum — but nothing marks the critical γ on the LR slider or plots "steps grow vs shrink" against it. A tick on the γ slider ("edge of stability for this problem") would turn a formula into an instrument.
3. **γ-sweep / convergence plot**: "steps-to-basin vs γ" is THE canonical U-curve figure. The trainer already computes steps-to-basin per run (`evaluateRun`); a headless sweep (no animation, run k γ values × m seeds, plot the curve) is a contained feature with huge textbook payoff. Same machinery generalizes to μ-sweeps and batch-size-vs-noise-ball plots.
4. **Hessian eigenvector / quiver overlay**: the lens shows curvature at *one point*; the book will want the eigenvector cross-field (or curvature-coloured map) over the whole landscape to explain why trajectories bend. `eigenSym2` + the existing Poisson-disk glyph placement make this mostly plumbing.
5. **Same-optimizer A/B race with locked noise**: race can't field two copies of one optimizer (racers are keyed by `OptimizerId`), so "GD γ=0.01 vs GD γ=0.1 from the same start" — the single most-wanted textbook comparison — is impossible. Also, side-by-side runs can't share a minibatch RNG seed, so SGD comparisons aren't controlled experiments.
6. **Trajectory persistence / overlay**: reset erases the previous trail. "Pin this run, change one knob, run again, compare the two ghost trails" is the natural predict-observe-explain amplifier and would serve nearly every chapter.
7. **Noise-ball quantification**: ch-noise shows the fuzzy band qualitatively; a "final-loss variance vs batch size" mini-plot (or a running std readout) would let the book state the 1/√B law with the app as evidence.
8. **Momentum physics view**: no visualization of the velocity vector itself (the ghost implies it). An optional velocity arrow / "heavy ball" trail would support the momentum chapter's β=0.9 ≈ 10-step-memory claim.
9. **Schedule comparison**: LossHistory shows one schedule at a time; the scheduling chapter wants constant-vs-cosine loss curves on one axes (pairs naturally with #6).
10. **Data/figure export**: only WebM video export exists. The book pipeline (LaTeX) will want PNG/SVG stills of the landscape and **CSV export of run history** for externally typeset figures.

## (d) Low-hanging capability wins

1. **Extend `urlState` with overlay params** (`f`=field, `c`=contours, `cm`=colormap, `bas`=basins, `lens`, `th`=theme, `sps`, `inf`): ~20 lines each side; instantly makes every guide/book figure reproducible-by-link.
2. **Guide/course deep links** (`ch=ch-gamma`, `lesson=saddle`): the chapter ids and `enterCourseFromChapter` already exist.
3. **Auto-run flag** (`run=1` / `race=1`): one branch in `App.svelte`'s mount path; turns links into living figures.
4. **Encode race config in the share URL**: serialize `raceConfigStore` (it's already JSON-persisted) into the hash.
5. **Optional seeded minibatches** (`bseed`): `rng.ts` already ships seeded RNG + shuffle; thread it through `sampleBatch` when present.
6. **Custom-data links**: base64 (or lz-string) the points array + model/formula into the hash for datasets under ~100 points; this also fixes hand-edited built-in datasets silently not surviving sharing.
7. **PNG snapshot export**: `replay.ts` already rebuilds the whole scene on canvas — exporting frame 0 (or the final frame) as PNG is nearly free, and is the direct feed for the LaTeX book's figures.
8. **Race duplicates**: key racers by instance (id + index) instead of `OptimizerId` to unlock same-optimizer A/B (#c5).
9. **URL schema version param** — trivial now, painful to retrofit after the book prints.
10. **"Steps to basin" surfaced in the UI readout** (it's computed every run) — gives every experiment and challenge a visible score, and is the raw material for the γ-sweep tool later.

### Notable strengths worth preserving (context for the book)
- One trainer API for everything (runs, course, race, experiments) — new demo types stay cheap.
- Deterministic, seeded data + validated URL decode — printed links are already viable for built-ins.
- 2D/3D/1D views all render from ONE cached, log-normalized grid — figures across views can't disagree.
- The ghost/fan/lens overlays reuse the *actual* optimizer step and *actual* FD Hessian — nothing in the visualization is a cartoon, which is exactly the standard the textbook claims.
