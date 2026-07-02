# Gradient Lab → a small, beautiful textbook on optimization

*Master plan, 2026-07-01. Synthesized from a 126-agent audit of the guide, the codebase, and six
deep-dive studies (book architecture, beginner walkthrough, high-dimensional honesty, app
capabilities, library extraction, LaTeX pipeline). The full reports live in [`docs/plan/`](plan/).*

---

## 1. The verdict, honestly

The guide is already unusually good — better than it thinks it is. Every reviewer independently
converged on the same picture:

- **Correctness: strong.** 18 review units, graded B− to A. Of 51 flagged errors, adversarial
  fact-checking confirmed only 20 (all fixed the same day, §2), refuted 27, and left 4 disputed.
  The optimizer history and math — the riskiest content — came back nearly spotless: Cauchy 1847,
  Polyak 1964, the RMSProp Coursera-slide story, Adam's bias correction, AdamW's decoupling,
  RAdam's ρ_t threshold — all check out.
- **Pedagogy: the voice is book-ready; the structure isn't.** The prose ladder (term defined
  before symbol, symbol before formula) genuinely works. But a handful of load-bearing concepts
  are *used before — or without ever — being taught*, and one gap dominates everything:
  **curvature / the Hessian**. It silently underpins three chapters (γ < 2/λ_max, the condition
  number κ, Newton/Sophia) and the app's own curvature lens, and is never taught anywhere.
- **The codebase is closer to "textbook infrastructure" than expected.** The optimizer engine is
  pure, tested, honestly commented (~70% library-grade); URL state already round-trips a complete
  scenario (the key to a printed book that deep-links into live demos); 2D/3D/1D views render from
  one cached grid so figures can't disagree; the ghost/fan/lens overlays run the *actual*
  optimizer code — nothing on screen is a cartoon. That last property is the book's brand.

**The single sentence version:** the content is trustworthy, the voice is right, and the machine
underneath is honest — what's missing is two chapters of foundations, a systematic
"in higher dimensions…" channel, the code itself as content, and structure that can survive print.

## 2. What was fixed immediately (2026-07-01)

Twenty confirmed errors, each verified against the source by two independent fact-checkers before
touching anything. Highlights (full ledger: [`plan/00-audit-findings.md`](plan/00-audit-findings.md)):

- **Day-mode blindness (5 sites).** Since the day-mode heatmap reversed the tone ("dark basins on
  light"), every "brighter = lower loss / white contours / bright dimple" sentence taught
  light-theme readers to read the map exactly backwards. Now theme-aware (`gDark` conditionals) or
  theme-neutral, in the landscape chapter, the panels reference, and two coach toasts.
- **Cosine annealing described upside-down.** "Quick at first, feather-light by the end" — the
  cosine factor's decay is *zero* at the start, fastest mid-run. Holding γ near full strength
  early is the schedule's advertised advantage; the text now says so.
- **Broken demos.** `banana-race` configured `trainingStore`, which races never read — the
  showdown was silently capped at 300 steps (now sets `raceConfigStore`). `symmetric-pair`
  promised that re-rolling starts reaches mirror basins, but `getInitialParameters` always starts
  at β > 0 (coach now says to drag below β = 0). Three experiments left the previous optimizer
  active, so e.g. running "Why Adam exists" first made the vanishing-gradient demo walk briskly
  off its "dead" plateau (all now pin GD). `marker-is-model` told users to drag a marker that has
  no drag handler — on a problem where that click *adds a data point* (reworded; the drag feature
  is on the roadmap, §6).
- **Concept errors.** AdaDelta's card had Zeiler's units argument inverted (the step is
  dimensionally *correct*, not "dimensionless"). The Newton card claimed a saddle fallback to a
  gradient step that the damped-Newton implementation doesn't perform, and paired "no learning
  rate to tune" with a γ-bearing formula (both reconciled). Sophia's contested "2× faster than
  Adam" is now attributed to its paper and hedged. The early-stopping ≈ weight-decay equivalence
  is now credited correctly (Bishop 1995, not Prechelt 1998) with its near-zero-init assumption.
- **Small but real.** Bumpy Valley's global minimum is at α ≈ −0.731, not −0.8 (`trueParameters`
  corrected). The gradient-field concept figure aimed arrows at the *center* of elliptical
  contours — quietly contradicting the perpendicularity rule printed beside it (arrows now follow
  the true ellipse normals). The step-of-descent recipe said "a step of size γ" (now "γ times as
  long as the slope is steep" — which is the very fact its own linked lesson tests). Stale counts
  and over-promises in the zoo intro, course banner, decay-speed explanation, and the
  `optimizers.ts` header.

All 139 tests pass; `svelte-check` is clean.

## 3. The book: structure

Full design: [`plan/01-book-architecture.md`](plan/01-book-architecture.md). The shape: **five
parts, ~22 chapters, six appendices**, with the current 14 guide chapters mapping over mostly
intact and the optimizer family tree splitting into a whole part (it is ~40% of the content
crammed into one chapter today). Every chapter ends at the app: one demo, 2–4 numbered exercises
in the predict-run-reflect pattern the course already uses.

- **Part I — Seeing the problem:** knobs & loss → landscape → **NEW: the derivative, from
  scratch** (nudge → ratio → limit, on the 1-D slope problem) → the shape zoo (minima, saddles,
  plateaus).
- **Part II — Walking downhill:** the gradient (now legal — partials were taught) → one step →
  the learning rate → **NEW: curvature, the Hessian, and conditioning** (the load-bearing
  insertion: second derivative in 1-D → the 2×2 "table of bendings" → λ_min/λ_max by picture →
  derive γ < 2/λ_max → κ and the ravine → the curvature lens finally gets its chapter) →
  **NEW: convexity and convergence rates** (light; absorbs the (κ−1)/(κ+1) material) → schedules.
- **Part III — Descent under noise:** mini-batches → **NEW half-chapter: the noise ball &
  Robbins–Monro** (why a noisy walk converges at all; schedules get their payoff) →
  generalization.
- **Part IV — The optimizer family tree** (split into ~6 chapters: ravine part-opener with the
  race; momentum & Nesterov; the per-parameter act; Adam & repairs & Lion; second-order reality
  check with Newton/Sophia; Prodigy & self-tuning — closing with a one-page table of every update
  rule, the book's centerfold). Each chapter gets a **⌨ Read the code** section (§5).
- **Part V — Practice:** **NEW: tuning by hand, a field guide** (γ-bisection ritual, loss-curve
  symptom table, why random search beats grid) → the zoo, guided → **NEW: capstone projects**
  (write a tuning report; break every optimizer with a custom dataset; invent an optimizer on
  paper and test the nearest configurable stand-in; race commentary).
- **Appendices:** notation (with the θ/λ/β symbol-collision disambiguations); calculus refresher;
  just-enough linear algebra; the app reference (panels/keys move here); glossary; and
  **"Where two dimensions lie to you"** — the collected honesty notes made load-bearing.

**Cross-reference spine:** stable slugs (`ex:gamma:bisect`, `eq:update-rule`, `card:adamw`) shared
by Svelte and LaTeX; numbers derived at render time, never hand-typed (the current `toc` array
already has duplicate chapter numbers — a latent print bug). The 10 course lessons become canonical
numbered exercises so guide, course, and print finally share one spine.

## 4. The beginner on-ramp (smallest set that unblocks everything)

From the fall-off log in [`plan/02-beginner-walkthrough.md`](plan/02-beginner-walkthrough.md) —
the persona is high-school math, *no calculus*. Eight modules, ordered by how much each unblocks:

1. **P1 The derivative** (new mini-chapter; the nudge-and-divide recipe currently hides the limit).
2. **P5 Curvature/Hessian** (see §3 — retro-funds λ_max, κ, Newton, Sophia, and the lens).
3. **P3 Vectors, ‖·‖, dot product** (boxed section feeding the steepest-descent proof — the
   "shadow" metaphor gains arithmetic the reader can perform).
4. **P4 Notation box** (Σ, subscript i, ŷ, interval notation — beside the first MSE formula).
5. **P6 The sigmoid** (the guide's classifiers and cross-entropy depend on "outputs a
   probability" with σ never introduced; also defuses the Bernoulli/likelihood name-drop cliff).
6. **P8 "Convex"** (one margin definition; used at three load-bearing moments, never defined).
7. **P7 1/√n** (a dice-rolling micro-demo grounds the batch-size economics).
8. **P2 Map-reading drill** (three tap-to-answer questions at the end of the landscape chapter).

Plus symbol hygiene: rename the proof's angle θ → φ (collides with θ = parameters one chapter
later); one-line defusals where λ (curvature vs weight decay) and β (knob vs EMA decay) collide;
and an honest sentence on the Momentum card — its `v ← μv + ∇ℒ` is an exponentially-weighted
*sum*, not the (1−β)-normalized average the EMA tool card just taught (~10× effective step at
μ = 0.9, which is also why the race tunes momentum's γ down).

## 5. The honesty channel: "In higher dimensions…"

[`plan/03-high-dimensions-margin-notes.md`](plan/03-high-dimensions-margin-notes.md) catalogs 13
margin notes, each with an attachment point and a draft in the guide's voice. Make them a *typed,
recurring* device (a styled `hd-note` aside with a fixed glyph) so readers learn to expect the
correction — the sandbox's limitation becomes a running subplot. The five highest-leverage:

1. **Saddles outnumber minima** — the d-coin-flip counting argument (ch-shapes).
2. **Newton's bill** — d² memory, d³ solve: "unaffordable by a factor with eighteen zeros."
3. **Diagonal preconditioning is a bargain with Newton** — and fails on a 45°-rotated ravine
   (AdaGrad/Adam/Sophia); doubles as a new *rotated-ravine* preset.
4. **Sign-step geometry** — Lion's arrow can only point in 8 directions here; length γ√d at scale
   (directly visible in the app: watch the red arrow snap between compass headings).
5. **Every published loss-landscape picture is a 2-D slice** — this app is the one place the map
   is the whole truth (ch-landscape; finally motivates the existing Li et al. 2018 reference).

Two notes double as new experiment presets (rotated ravine; batch↔γ linear-scaling swap).

## 6. Code as content: the library and "reveal the code"

*(Revised 2026-07-01, owner decision — supersedes the "stay 2-param" recommendation in
[`plan/05-optimizer-library-and-reveal-code.md`](plan/05-optimizer-library-and-reveal-code.md).)*

The library **generalizes to n dimensions** and becomes genuinely useful for real in-browser
optimization — think *optax for the browser* — while the app and book keep their two-parameter
soul through a thin adapter. Layered design:

- **Core — `@gradientlab/optimizers`:** n-dimensional update rules over typed arrays
  (`Float32Array`/`Float64Array`). An optimizer is `init()` + a pure `step(params, grad, state,
  lr, hyper, ctx)`; the *caller brings gradients* (framework-agnostic, pluggable into anything
  that can produce a gradient — hand-derived, finite-difference, or TF.js/autodiff). All twelve
  first-order methods reduce to elementwise kernels plus a few reductions (Prodigy's ⟨g, x₀−x⟩
  and ‖s‖₁, norms for clipping) — and an elementwise Adam loop is just as readable as today's
  duplicated `a`/`b` form, so **the core source doubles as the book's listings** with no second
  copy to drift. Newton becomes a small-d dense solve; Sophia accepts a user-supplied
  Hessian-diagonal (or HVP) callback.
- **Backends:** CPU typed-array backend first (v0.1). Then a **WebGPU backend** (v0.2): the
  update rules are embarrassingly parallel elementwise ops that map 1:1 onto WGSL compute
  kernels; parameter/state buffers stay resident on the GPU across steps, hyperparameters ride in
  uniforms, with automatic CPU fallback where WebGPU is unavailable.
- **The app** consumes the same core at d = 2 via an `{a, b}` adapter, so the marker on the
  landscape runs the *published* library — the strongest possible honesty claim for
  reveal-the-code.
- **Documentation as a first-class product:** a real docs site (typedoc API reference +
  hand-written guides + live examples hosted under gradientlab.ai), README, DEVIATIONS.md, and
  golden-trajectory fixtures cross-checked against PyTorch/optax.

The blocking work is honesty infrastructure *plus* the dimension-generalization:

- Extract classroom guards (Newton's eigenvalue floor + trust region, Prodigy's d-seed/cap,
  Sophia's fallback diagonal) into a named `guards.ts` with a uniform `⚠ CLASSROOM GUARD (not in
  the paper)` banner, toggleable via `ctx.guards` (default on = current behavior; off =
  paper-faithful). A **DEVIATIONS.md** ledger promotes the existing honest comments to a citable
  document — and becomes book margin-note material.
- Kill the `v: {...g}` state pun (three optimizers stash the last gradient in `v` purely so the
  UI can draw an arrow); per-optimizer state types; de-HTML the hyperparameter hints; extract the
  4×-duplicated Adam-moment boilerplate so the Adam→AdamW code diff shrinks to exactly the
  weight-decay line — which is the whole lesson of AdamW.
- Add golden-trajectory tests against PyTorch/optax fixtures (current tests check behavioral
  signatures, which many subtly-wrong implementations would pass).

**Reveal the code:** Vite `?raw` imports of the *actual running per-optimizer files* (never
pasted strings — they rot), lazy-loaded Shiki with day/dark themes, a collapsible "The actual
code" block per card plus a `</>` popover, with a line-count badge ("Adam is 26 lines"). Then the
magic tier: `[eq:*]` marker comments in the source paired with KaTeX `\htmlClass` spans, so
hovering m̂ in the formula glows the bias-correction line — with a CI test asserting every tag
exists. The same raw strings later feed the LaTeX listings, so the book's code can never drift
from what the marker actually executes.

## 7. The LaTeX book pipeline

[`plan/06-latex-export-pipeline.md`](plan/06-latex-export-pipeline.md) weighs three routes and
lands firmly on **Option B — one structured source, two renderers**:

- Move guide content into **typed TypeScript block modules** (`p`, `display`, `concept`,
  `figure`, `margin` (tagged `highdim`/`history`/`caveat`), `tryit`, `optcards`, `widget`), with a
  single `$math$`/`**bold**` micro-syntax. A thin `<GuideBlocks>` component renders them in-app;
  a Node emitter (`scripts/emit-latex.ts`) prints `.tex`. Not Svelte-AST-walking (the figures are
  runtime *simulations* using canvas + the real optimizer engine — unimportable in Node); not a
  parallel hand-written book (guaranteed drift). KaTeX strings pass to LaTeX nearly verbatim —
  the single biggest asset.
- **Figures stay honest simulations:** split each into pure compute + themed SVG render; the day-
  mode theming work already did 80% of this — print is one more `theme: 'print'` enum value, with
  canvas injected via `@napi-rs/canvas` in Node.
- **Live demos become printed "Experiment" boxes** with QR codes + short URLs
  (`gradientlab.ai/x/ch5-overshoot` via a generated Cloudflare `_redirects` file) once presets
  gain a declarative `state` field feeding the existing `urlState` encoder.
- **Typesetting:** kaobook (memoir-based; wide margin for the honesty notes), LuaLaTeX +
  unicode-math (the prose is full of literal γ, ∇, ŷ), `latexmk` in CI publishing the PDF on
  every push.

## 8. App capabilities the book needs

[`plan/04-app-capability-audit.md`](plan/04-app-capability-audit.md). URL state already encodes a
complete scenario (problem, optimizer + hypers, γ, schedule, batch, steps, *seeded* dataset,
marker, view) — printed links are viable for all built-ins today. Gaps, in leverage order:

**Low-hanging (each ~a day or less):**
1. Encode overlay state in the URL (field/contours/colormap/basins/**curvature lens**/theme) —
   the single biggest gap for "open this link; the lens reads κ ≈ 2500."
2. Guide-chapter and course-lesson deep links (`ch=`, `lesson=`) — the plumbing exists.
3. Auto-run flag (`run=1`) — turns links into living figures.
4. Optional seeded minibatches (`bseed`) — so a stochastic figure's path is reproducible in print.
5. URL schema version param — trivial now, painful after the book prints.
6. Race-config sharing; PNG snapshot export (frame 0 of the existing WebM replay pipeline);
   surface the already-computed "steps to basin" in the UI.

**New teaching instruments (the book's chapters want these):**
7. **Condition-number dial** — an anisotropic quadratic ½(λ₁α² + λ₂β²) with a κ slider; makes
   ill-conditioning continuous instead of anecdotal. (Stretched Bowl κ = 10 and Rotated Valley
   now cover the anecdotes; the dial is optional polish.)
8. **Edge-of-stability tick on the γ slider** — **done**: the slider quietly marks 2/λ_max for
   the current problem.
9. Make the data-plot parameter marker actually **draggable** for 2D-point problems (repairs the
   `marker-is-model` promise properly).

**Struck by owner decision (2026-07-01):** the γ-sweep tool, trajectory pinning, and
same-optimizer A/B races. γ-sweep + pinning were built, reviewed and rejected: stateful
comparison instruments and persistent overlays make the UI busy and fight the app's directness —
re-running an experiment is cheap, and re-running it yourself IS the pedagogy. The book's U-curve
and A/B figures will come from headless simulation in the LaTeX pipeline (§7), not from in-app
instruments. Do not reintroduce this class of feature.

## 9. Sequencing

Each phase leaves the app shippable; order chosen so nothing is written twice:

- **Phase 0 — done (this audit).** Content verified; 20 errors fixed.
- **Phase 1 — structure lock-in (~1 week).** Extract data to `src/content/` (formulas named,
  optTree, cites, refs, problems table); declarative preset `state` + `stateToUrl`; slug/exercise
  registry; derived chapter numbers; symbol hygiene (φ for the proof angle; λ/β defusal notes);
  URL schema version + overlay/lesson/autorun params. *Everything later depends on this.*
- **Phase 2 — the two missing chapters + honesty channel (~1–2 weeks of writing).** Derivative
  chapter; curvature/Hessian chapter (with the condition-number dial + γ-slider tick built
  alongside); the 13 `hd-note` margin notes; prerequisite micro-modules P3/P4/P6/P7/P8.
- **Phase 3 — code as content (~1.5–2 weeks).** Per-optimizer files + guards.ts + DEVIATIONS.md +
  state-type cleanup; **n-dim CPU core + the d = 2 app adapter** (the app switches over here);
  reveal-the-code with Shiki; golden-trajectory tests vs PyTorch/optax fixtures.
- **Phase 4 — optimizer part split + exercises (~1 week).** ch-optimizers → Part IV chapters;
  lessons renumbered as canonical exercises; new presets (rotated ravine, batch↔γ, AdaGrad-freeze,
  cosine-pinch). (The instrument wishlist that was here — γ-sweep, A/B races, pinning — was
  struck; see §8.)
- **Phase 5 — block schema + LaTeX emitter (~2 weeks).** Migrate chapters to blocks one at a
  time; figure compute/render split with `print` theme; emitter + kaobook + QR shortlinks; CI PDF.
- **Phase 6 — publish (~2–3 weeks).** `@gradientlab/optimizers` 0.1.0 (CPU core) with the docs
  site; WebGPU backend as 0.2; tuning field-guide and capstone chapters; the book's first
  complete PDF.

## 10. What to protect

The audit was equally emphatic about what must *not* change: the teacherly, story-driven voice;
the fix→flaw→fix narrative of the family tree and its act structure; the directional-derivative
proof a beginner can *see*; the long-range setups that pay off (Lion's orbit → schedules; the
blue/red arrow gap → "the optimizer's personality"); the honest framing of the frontier box and
the AdamW λ caveat; predict-before-run as the exercise pattern; and the epistemic brand
underneath it all — **every figure is a real simulation, every overlay runs the real code.** The
book's job is to make the structure worthy of the prose, not to rewrite it.
