# Vision report: extracting the Gradient Lab optimizers into a library + "reveal the code" in-app

*Audit unit — read-only assessment of `src/utils/optimizers.ts`, `schedules.ts`, `trainer.ts`, `hessian.ts`, `types/types.ts`, `optimizers.test.ts`, `hyperMeta.ts`, `package.json`, `vite.config.ts`. Nothing was modified.*

---

## (a) How close is this code to library-grade? Honest assessment

**Short answer: closer than most app code ever gets — perhaps 70% of the way — but it is 70% of the way to a *pedagogical* library, not a numerical one, and that distinction should drive every decision below.**

### What is already library-shaped

- **`optimizers.ts` is a genuinely clean module.** Fourteen optimizers, each a pure `step(params, gradient, state, lr, hyper, ctx) → {params, state}` function with an explicit `init()`. No Svelte imports, no store reads, no DOM, no globals. State is threaded, never hidden. The only imports are `types.ts` (one interface) and `hessian.ts` (one function + one type). This is textbook functional-core design and would extract almost verbatim.
- **Metadata rides along with the math.** Each optimizer carries `name`, `description`, `updateRuleLatex`, `hyperparams` (a full slider spec with min/max/step/default/hint), `fixedLearningRate`, `usesHessian`, and a presentation taxonomy (`optimizerGroups`). For a *teaching* library this metadata is not baggage — it is half the product. No mainstream optimizer library ships the LaTeX of its own update rule next to the code that implements it; that pairing is Gradient Lab's genuinely novel asset.
- **`schedules.ts` is trivially extractable.** Pure `factor(t, T)` multipliers, one type import. Five minutes of work.
- **`hessian.ts` is extractable and quietly excellent** — finite-difference Hessian from an analytic gradient, closed-form 2×2 eigendecomposition, condition number, definiteness classification. It only needs `ProblemConfig` replaced by a `(params) => gradient` callback to be fully standalone.
- **Tests already exist** (`optimizers.test.ts`, 296 lines; plus `hessian.test.ts`, `schedules.test.ts`). They test real invariants: descent on a convex bowl, momentum → GD at μ=0, Adam's first-step magnitude ≈ γ. A library needs more (see below) but the harness and the culture are in place.
- **Comment quality is unusually high.** Each optimizer has a header explaining the idea, the paper, the state-slot reuse, and — crucially — where the implementation *deliberately deviates* (AdaDelta's ε=1e-4 vs the canonical 1e-6; Lion dropping weight decay; Prodigy's seed/cap). This honesty is exactly what a pedagogical library needs; it just needs to become *machine-readable* (see §d).

### What is not library-grade yet

1. **The `ModelParameters {a, b}` coupling — the elephant.** Every arithmetic line is written twice, once per coordinate (`params.a - lr * g.a`, `params.b - lr * g.b`). ~14 optimizers × ~6 lines each of duplicated per-axis math. Any consumer with 3+ parameters cannot use it.
2. **Pedagogical guards are fused into the algorithms.** Newton's eigenvalue floor + trust region, Prodigy's d-seed/d-cap/trust region, Sophia's non-negative-clamped diagonal fallback, AdaDelta's enlarged ε — all are *defensible teaching choices*, all are *not the paper's algorithm*, and none is separable by a caller today. A library user benchmarking "Prodigy" would silently benchmark Prodigy-with-training-wheels. This is the single biggest correctness-of-representation risk.
3. **State-slot punning.** `OptimizerState.v` means velocity (momentum), first moment (Adam), E[Δθ²] (AdaDelta), momentum buffer (Lion), and "last gradient, for the UI" (GD/AdaGrad/RMSProp store `v: {...g}` purely so the app can draw an arrow). A library should let each optimizer own its state shape; the `v: {...g}` UI hack especially must not ship.
4. **`fixedLearningRate`, hint HTML, and hyperparam `min/max` ranges are app policy, not algorithm truth.** The hints contain literal `<br/><span style=...>` markup. Slider ranges like β₂ ∈ [0.8, 0.9999] are curation for a toy landscape. Fine to ship, but they belong in a clearly-labeled "presentation" layer of the metadata, not intermixed with math-bearing fields.
5. **Trainer is app-owned and should stay.** `trainer.ts` imports 15+ Svelte stores, drives `setInterval` animation, the coach, races, challenges. None of it extracts; the library boundary is exactly at `opt.step(...)` and `schedules[x].factor(...)`, and the trainer already respects that boundary cleanly. Good news: extraction requires no trainer rewrite, only import-path changes.
6. **Missing library table stakes:** no build for a `dist/` with `.d.ts`, no reference tests against PyTorch/optax outputs, no docs beyond comments, no versioning, no license file decision, `"private": true`.

### The strategic question: generalize to `Float64Array`/ndarray, or ship a deliberately-2-param pedagogical library?

Weighing the options honestly:

| | Generic n-dim (`Float64Array`) | Deliberate 2-param `{a, b}` |
|---|---|---|
| Effort | Rewrite of all 14 steppers + tests; loop-based code | Near-zero; publish what exists |
| Readability of source (the "reveal code" asset) | Loops and index juggling obscure the math | `a`/`b` duplication is verbose but *transparent* |
| Reference-checkability vs PyTorch | Easy | Easy (2 dims is enough to compare) |
| Real-world usability | Competes with TensorFlow.js/optax — and loses (no autodiff, no tensors) | Honest: "for learning and visualization" |
| Fit with the book/app ("every model has two parameters") | Breaks the project's core design promise | Reinforces it |
| Hessian story | Needs full ndarray linear algebra | Closed-form 2×2 stays beautiful |

**Recommendation: a middle path, biased strongly toward pedagogy.** Ship the library as **generic over the vector type via ~6 tiny primitives** (`zip2`, `map`, `scale`, `dot`, `norm`, `zeroLike`) with the 2-param `{a, b}` record as the *canonical, documented, default* instantiation — but write each optimizer's step over abstract element-wise ops so the per-axis duplication disappears. If that abstraction hurts readability (it will, slightly), fall back to the pure option: **publish 2-param as-is and state it proudly in the README** ("two parameters, so every trajectory is drawable — this is a feature"). Do *not* build an ndarray library; that market is served, and the moment you need real training you need autodiff too, which is far out of scope. The unique value here is *readable reference implementations with matched math, metadata, and safety-rails you can switch off* — none of which requires n dimensions.

A pragmatic tie-breaker: the "reveal the code" feature (§c) shows the *actual running source*. Whatever form the library takes **is** the textbook listing. `params.a - lr * v.a` next to θ ← θ − γv is self-explanatory to a beginner; `axpy(-lr, v, params)` is not. That argues for keeping the 2-param concrete form in the published source and treating n-dim as a possible v2.

---

## (b) Proposed package design

### Name

- **`@gradientlab/optimizers`** — first choice. Scoped under the brand (gradientlab.ai already exists), unambiguous, leaves room for `@gradientlab/landscapes` (the `problems.ts` surfaces would make a lovely companion package) and `@gradientlab/schedules` if ever split.
- Alternatives considered: `descent-kit` (cute, unscoped, squattable), `fourteen-optimizers` (ages badly the day #15 lands), `toy-optim` (undersells the rigor).

### Package layout (same repo, npm workspace)

```
GradientDescent/
├── package.json              # workspaces: ["packages/*"], app stays at root (or moves to apps/lab)
├── packages/
│   └── optimizers/
│       ├── package.json      # name: @gradientlab/optimizers, type: module
│       ├── src/
│       │   ├── index.ts      # public exports
│       │   ├── types.ts      # ModelParameters, Optimizer, OptimizerState, HyperparamSpec, StepContext
│       │   ├── optimizers/   # ONE FILE PER OPTIMIZER  ← key for reveal-code
│       │   │   ├── gd.ts, momentum.ts, nesterov.ts, adagrad.ts, rmsprop.ts,
│       │   │   ├── adadelta.ts, adam.ts, nadam.ts, adamw.ts, radam.ts,
│       │   │   ├── newton.ts, sophia.ts, lion.ts, prodigy.ts
│       │   ├── schedules.ts
│       │   ├── hessian.ts    # decoupled: takes (params)=>grad, not ProblemConfig
│       │   └── guards.ts     # trust-region clip, d-cap, curvature floor — named, reusable, opt-out
│       └── test/             # existing vitest suites move here + reference tests
```

Splitting one-file-per-optimizer matters twice over: it makes `?raw` imports per-optimizer trivial (§c), and it makes each file a self-contained "listing" for the eventual LaTeX book (one file ↔ one book section).

### How the app consumes it

**npm workspaces with a same-repo path, consumed by package name.** In root `package.json`: `"workspaces": ["packages/*"]`; app depends on `"@gradientlab/optimizers": "workspace:*"` (or `*` with plain npm). Vite resolves workspace symlinks natively — no build step during dev, the app imports TypeScript source directly via the package's `exports` field pointing at `src/index.ts` in dev (`publishConfig`/`exports` conditions flip to `dist/` for the published artifact, built with `tsc` or `tsdown`/`unbuild`). This is strictly better than a subpath export from the app package (the app is `"private": true` and should stay unpublishable) and better than a separate repo (the guide, the presets in `experiments.ts`, and the optimizer code co-evolve constantly — a repo split would add release friction for zero benefit at this stage).

Migration cost inside the app: change `from './optimizers'` → `from '@gradientlab/optimizers'` in `trainer.ts`, `stores.ts`, and the handful of components; move `RACE_COLORS` and `hyperMeta.ts` **out** of the library candidates (icon/color/lucide are app presentation and must not be dependencies of the package).

### API surface (index.ts)

```ts
// Types
export type { ModelParameters, Optimizer, OptimizerId, OptimizerState,
              HyperparamSpec, OptimizerStepContext, Hessian2, Eigen2, Schedule, ScheduleId };

// The optimizers — individually and as a registry
export { gradientDescent, momentum, nesterov, adagrad, rmsprop, adadelta,
         adam, nadam, adamw, radam, newton, sophia, lion, prodigy };
export { optimizers, optimizerOrder, optimizerGroups, defaultHyper };

// Schedules
export { schedules, scheduleOrder };

// Curvature toolkit
export { computeHessian, eigenSym2, conditionNumber, newtonStep,
         isPositiveDefinite, classifyDefiniteness };

// Pedagogical guards — exported so they are inspectable and optional
export { trustRegionClip, curvatureFloor, GUARD_DEFAULTS };

// Convenience runner (pure; the app's trainer does NOT use this — demos do)
export function descend(opts: {
  optimizer: Optimizer | OptimizerId;
  gradient: (p: ModelParameters) => ModelParameters;
  hessian?: (p: ModelParameters) => Hessian2;      // auto-FD from gradient if usesHessian
  start: ModelParameters;
  steps: number;
  learningRate?: number;                            // defaults to fixedLearningRate ?? 0.01
  hyper?: Record<string, number>;
  schedule?: ScheduleId;
  guards?: boolean | GuardConfig;                   // true (default) = classroom mode; false = paper-faithful
}): { path: ModelParameters[]; states: OptimizerState[] };
```

Design notes:
- **`guards` is the API expression of the pedagogy/paper split** (see §d). `Optimizer.step` gains an optional `ctx.guards?: GuardConfig`; `descend` surfaces it. Default ON preserves current app behavior exactly.
- Keep `updateRuleLatex` and `hyperparams` on the optimizer objects — they are the differentiator — but strip HTML from `hint` (plain text; the app re-wraps).
- `descend` is new but ~40 lines, and it is what makes the README's 30-second example possible.

### README sketch

```markdown
# @gradientlab/optimizers

Fourteen gradient-descent optimizers — GD, Momentum, Nesterov, AdaGrad, RMSProp,
AdaDelta, Adam, Nadam, AdamW, RAdam, Newton (damped), Sophia, Lion, Prodigy —
as small, readable, dependency-free TypeScript. Every model has exactly TWO
parameters, so every trajectory is drawable. This is the engine behind
https://gradientlab.ai.

**This is a teaching library.** Two parameters is a feature: you can see the
whole loss surface. If you need to train real models, use PyTorch or
TensorFlow.js. If you want to *understand* what your optimizer does — and read
an implementation that matches the paper's math line for line — you're home.

## 30 seconds
    import { descend, adam } from '@gradientlab/optimizers';
    const grad = (p) => ({ a: 2*p.a, b: 20*p.b });          // stretched bowl
    const { path } = descend({ optimizer: adam, gradient: grad,
                               start: { a: 5, b: 5 }, steps: 100 });

## Anatomy of an optimizer
Each optimizer is data + one pure function: `updateRuleLatex` (the math),
`hyperparams` (a UI-buildable spec with defaults and plain-language hints),
and `step()` (the code). Math and code are kept in provable correspondence.

## Classroom guards ⚠️
By default, Newton and Prodigy carry labeled safety rails (trust regions,
curvature floors, d-caps) so they behave on wild 2-D landscapes. Pass
`guards: false` for the paper-faithful updates — and expect fireworks on
saddles. Every deviation from the source paper is listed in DEVIATIONS.md.

## The fourteen  (table: name · paper · year · one-liner · guards?)
## Schedules  ·  Curvature toolkit (2×2 Hessian, eigen, κ, Newton step)
## License: MIT
```

The **DEVIATIONS.md** file is the honesty ledger the current comments already contain (AdaDelta ε, Lion's dropped weight decay, Prodigy's seed/cap, Newton's regularization, Nesterov's PyTorch-style reformulation) — promoted from comments to a citable document. It doubles as book margin-note source material.

---

## (c) "Reveal the code" — showing the REAL running source in the guide/cards

### Principle

Never paste code into the guide as strings — it will rot. Import the *actual module source* so what the reader sees is byte-identical to what the marker on the landscape is executing.

### Mechanism: Vite `?raw` imports

```ts
// in HelpModal.svelte / an OptimizerCode.svelte component
import adamSource from '@gradientlab/optimizers/src/optimizers/adam.ts?raw';
```

`?raw` is built into Vite (already on Vite 8) — the file's text is inlined as a string at build time, zero runtime cost, works in the PWA offline precache automatically (it's just part of a JS chunk). This is the decisive argument for **one file per optimizer** (§b): `optimizers.ts` today is 824 lines; revealing "the Adam code" means slicing line ranges out of a shared file, which breaks on every edit. With `adam.ts` a self-contained ~60-line file, the reveal is the file, headers and honest comments included — the comments *are* the annotation layer.

Build an eager glob so cards stay data-driven like everything else in this app:

```ts
const sources = import.meta.glob('@gradientlab/optimizers/src/optimizers/*.ts',
                                 { query: '?raw', import: 'default', eager: true });
export const optimizerSource = (id: OptimizerId) => sources[pathFor(id)];
```

(Caveat: glob patterns can't start with a bare package specifier in older Vite; use a resolved alias like `$optim/` pointing at `packages/optimizers/src` — one line in `vite.config.ts`.)

One subtlety: `?raw` shows the *TypeScript source*, while the browser runs the transpiled JS. For this codebase that gap is only type annotations — acceptable, and arguably better (types teach). State it once in the UI ("this is the actual TypeScript source of the optimizer you're running").

### Syntax highlighting under Svelte 5 + existing deps

Current deps include KaTeX (math) but no highlighter. Options, in order of fit:

1. **Shiki (`shiki` or fine-grained `@shikijs/core` + the TS grammar + one theme), lazy-loaded — recommended.** TextMate-quality TypeScript highlighting, dual-theme support matches the app's new day/dark modes (`css-variables` theme or the `light/dark` dual-theme API dovetails with the existing theme param work), zero runtime CSS conflicts (inline styles). Cost: ~a few hundred kB for grammar+wasm, which is why it must be a dynamic `import()` inside the reveal component — the same lazy pattern the app already uses for the three.js chunk, and the PWA workbox precache picks the chunk up via the existing `**/*.{js,...}` glob.
2. **highlight.js with only the TypeScript language registered** (~30 kB) — the lightweight fallback if Shiki's size offends. Classes-based theming means writing a small day/dark CSS theme, but the app already maintains dual-mode styling.
3. **Prism** — fine, but ESM story is clumsier and it offers nothing over hljs here.
4. **A hand-rolled regex tokenizer** — tempting for a 60-line snippet vocabulary, but it becomes a maintenance liability the first time a template literal appears. Don't.

No Svelte-specific wrapper is needed: highlight the string to HTML in an `$effect`/`onMount` after lazy import, render with `{@html}` into a `<pre>` (source is your own build-time asset — no sanitization concern; still avoid ever routing user content through the same path).

### Keeping card-math ↔ code line correspondence

The cards already show `updateRuleLatex`. The reveal feature's magic moment is *hover the m̂ term in the formula → the `mHatA = v.a / mc1` line glows*. Proposal:

- **Marker comments in the source** are the only robust mechanism — line numbers rot, and AST anchoring is over-engineering. Adopt a light convention that doubles as good comment style:

  ```ts
  // [eq:m] first moment — EMA of the gradient
  const v = { a: b1 * state.v.a + (1 - b1) * g.a, ... };
  // [eq:corr] bias correction: divide by 1 − β₁ᵗ
  const mHatA = v.a / mc1;
  ```

  and matching KaTeX `\htmlClass{eq-m}{...}` / `\htmlId` wrappers in `updateRuleLatex` (KaTeX supports these with `trust: true` for the specific html classes — gate the trust callback to class/id only). At render time, parse `[eq:*]` tags out of the raw source (they are visible in the code view as ordinary comments — readers just see well-labeled code), map tag → line span (from the tag to the next tag or blank line), and wire `mouseenter` on `.eq-m` to a line-highlight class in the `<pre>`. ~80 lines of glue, no build tooling.
- Fallback tier (ship first): no interactivity, just the formula card directly above the code block with the `[eq:*]` labels textually mirrored (`m ←` in the formula, `[eq:m]` in the code). Even this static pairing is beyond what any textbook offers.
- Add a vitest that asserts every `[eq:*]` tag referenced by an `updateRuleLatex` exists in the corresponding source file — correspondence becomes CI-enforced, not aspirational.

### Where it surfaces in the app

- **Guide (HelpModal booklet):** a collapsible "The actual code" block per optimizer section, and later per book chapter — with a line-count badge ("Adam is 26 lines") reinforcing the "these are small ideas" message.
- **Optimizer picker/cards:** a `</>` icon opening the same component in a popover.
- **Export path:** the same raw strings feed the LaTeX pipeline later (`listings`/`minted` blocks), so the book's code listings can never drift from the app — one source of truth all the way to print.

---

## (d) Cleanup the current code needs first

Ordered by importance; items 1–3 are prerequisites for publishing anything.

1. **Separate pedagogical guards into visibly-labeled, named blocks.** Today Newton's floor/trust-region and Prodigy's seed/cap/trust-region are inline with `const NEWTON_TRUST_FRAC = 0.28` style constants. Refactor into a `guards.ts` with named functions (`trustRegionClip(step, radius)`, `liftSmallestEigenvalue(H, floor)`) and mark call sites with a uniform banner comment convention, e.g. `// ⚠ CLASSROOM GUARD (not in the paper): ...` — the same tag the reveal-code UI can render as a colored gutter stripe, and DEVIATIONS.md can index. Make guards toggleable via `ctx.guards` with the current values as defaults. Also decide and document Sophia's fallback (`g²` diagonal when no Hessian) under the same banner.
2. **Kill the `v: {...g}` state pun for the UI.** GD/AdaGrad/RMSProp/Newton stash the last gradient in `v` purely so the app can draw arrows. Either return the gradient explicitly in the step result (`{ params, state, lastGradient? }`) or have the app remember the gradient it just passed in (it computed it!). A published `OptimizerState` where `v` sometimes means "nothing, just UI convenience" is a doc-writing nightmare.
3. **Per-optimizer state types.** Replace the one-size `OptimizerState {v, s, t, d?, rNum?...}` with `Optimizer<S>` generic (each file defines its own `AdamState`, `ProdigyState`); keep a union export for the app's store. The comments currently explaining "s = E[g²], v = E[Δθ²] — there's no velocity here to collide with" (AdaDelta) exist *because* of the punning; proper types delete the need for them.
4. **Comment style consistency.** Two registers coexist: terse JSDoc (`/** Second-order methods set this... */`) and long essay-style `//` headers (AdaDelta, Nadam, AdamW, RAdam, Sophia, Lion, Prodigy) — while GD, Momentum, Nesterov, AdaGrad, RMSProp, Adam have little or none. For reveal-code, the essay headers are gold; normalize by *adding* matching headers to the under-commented early optimizers (paper, year, one-paragraph idea, deviations block — a fixed template: `Idea / Paper / State / Deviations`), and converting headers to `/** */` JSDoc so editors surface them on hover for library consumers.
5. **De-HTML the hyperparam hints.** `hint` currently embeds `<br/><span style="opacity:0.8...">`. Split into `hint: string` (plain) + `hintDetail?: string`; the app owns the styling. A library exporting inline-styled HTML strings is a smell and an XSS-adjacent liability.
6. **Decouple `hessian.ts` from `ProblemConfig`** — signature `computeHessian(gradFn: (p) => ModelParameters, p, h?)`; the app wraps `config.computeGradient(data, ·)` in a closure. Also move `newtonStep`'s null-on-singular contract into the docs of the Newton optimizer (they currently describe overlapping ideas in two places).
7. **Extract the shared Adam-moment boilerplate.** Adam/Nadam/AdamW/RAdam each re-derive `v, s, mc1, mc2, mHat, sHat` (~15 duplicated lines × 4). A tiny internal `adamMoments(state, g, b1, b2, t)` helper keeps each file readable *and* makes the family resemblance explicit — pedagogically better, since the reveal-code diff between Adam and AdamW shrinks to exactly the `+ wd * params.a` line, which is the whole lesson of AdamW.
8. **Housekeeping:** move `RACE_COLORS`/`hyperMeta` out of any library path (lucide-svelte must not become a dependency); pick a license (MIT) and add headers; strengthen tests with reference-value tests (fixed gradient sequence → assert first 5 iterates against PyTorch/optax outputs recorded as fixtures, at least for GD/Momentum/Adam/AdamW/Lion where references are unambiguous); `EPS` placement note (Adam's `√ŝ + ε` matches the paper; document that some frameworks use `√(ŝ+ε)`).

---

## (e) Realistic phased plan

**Phase 0 — Decide (½ day).** Lock the strategy: 2-param concrete source, guards-toggleable, workspace package named `@gradientlab/optimizers`, MIT. Write DEVIATIONS.md from the existing comments (mostly transcription).

**Phase 1 — In-place cleanup, app unchanged (2–3 days).** Items d.1–d.7 inside `src/utils/`: split `optimizers.ts` into per-optimizer files under `src/utils/optimizers/` with a barrel `index.ts` re-exporting today's exact API (so `trainer.ts`, stores, components need only an import-path touch or none), introduce `guards.ts` + banner convention, per-optimizer state types, comment template, de-HTML hints, decouple hessian. Ship: `npm test` + `npm run check` green, app pixel-identical. This phase is worth doing even if the package never ships.

**Phase 2 — Reveal the code (2–3 days).** `OptimizerCode.svelte`: `import.meta.glob(..., ?raw)`, lazy-loaded Shiki with dual day/dark theme, collapsible blocks in HelpModal + `</>` popover on cards. Start with the static formula-above-code tier; add the `[eq:*]` hover-linking and its CI test as a fast-follow. This lands user value *before* any npm publishing and pressure-tests the file layout.

**Phase 3 — Workspace extraction (1–2 days).** Create `packages/optimizers/`, move the per-optimizer files + schedules + hessian + tests, add root `workspaces`, alias `$optim`, flip app imports to the package name. Add the `descend()` runner + `guards` option. Still unpublished.

**Phase 4 — Publish (1–2 days).** README, DEVIATIONS.md, LICENSE, reference-fixture tests vs PyTorch, `exports`/`dist` build (tsdown), `npm publish --access public` at `0.1.0`. Announce on the site ("the engine is open — and the guide shows you its every line").

**Phase 5 — Later / optional.** `@gradientlab/landscapes` (the problems/surfaces are arguably the *more* unique dataset); n-dim generic layer as a non-breaking addition (`stepN` alongside `step`) only if real demand appears; LaTeX export pipeline consuming the same raw sources for the book's listings.

Total to a published package with in-app reveal: **~7–10 working days**, with user-visible value landing at Phase 2 and every phase leaving the app shippable.

---

### Bottom line

The optimizer core is already the best-factored code in the repo — pure, tested, honestly commented — and its 2-param concreteness should be embraced as the product, not apologized for. The real work before publishing is not generalization but **honesty infrastructure**: named, toggleable classroom guards; a deviations ledger; per-file optimizers so the guide can show the true running source. Do the cleanup regardless; the package and the reveal feature then fall out almost for free, and both feed directly into the textbook pipeline.
