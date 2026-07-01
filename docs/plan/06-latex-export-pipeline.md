# From Svelte Guide to Printed Book: a Migration Vision for Gradient Lab

*Audit unit: LaTeX/PDF export strategy. Sources read: `src/components/HelpModal.svelte` (3,446 lines), `src/utils/urlState.ts`, `src/utils/experiments.ts`, `src/utils/hyperMeta.ts`, `package.json`.*

---

## 1. What the guide actually is, structurally

Before choosing a pipeline, it matters exactly what kind of artifact `HelpModal.svelte` is. It is **not** a document with some code sprinkled in; it is four different kinds of content braided into one 3,446-line component:

1. **Prose** — fourteen `<section data-ch="…">` chapters (`ch-bowl` … `ch-keys`), written directly in Svelte markup as `<p>`, `<strong>`, `<em>`, `.concept` asides, `.look` callouts, `figcaption`s. High quality, voice-consistent, but physically entangled with layout HTML.

2. **Math** — already 100% LaTeX. There is a small named registry (`formulas` object, lines 183–190: `updateRule`, `lossDefinition`, `gradientDefinition`, `stepRule`, `stability`, `directional`) rendered via `katex.renderToString`, plus dozens of anonymous inline `String.raw` literals in the markup (`{@html tex(String.raw\`\kappa = \lambda_{\max}/\lambda_{\min}\`)}` etc.), plus per-optimizer `formula` strings in the `optTree` cards, plus `$...$` micro-math inside prose strings handled by `mathText()` (line 106). **This is the single biggest asset for export: the math needs zero translation.**

3. **Figures** — and here is the part every naive plan gets wrong: most figures are not drawings, they are **simulations**. The opening race figure (`raceDemo`, lines 557–688) runs the *actual optimizer engine* (`optimizers[id].step`, finite-difference Hessian and all) on a real sine-ravine loss and plots true trajectories with true step counts. `scheduleCurves` (lines 50–62) samples the *same schedule factors the trainer uses* "so the curves are honest." `lrRegimes` (lines 785+) simulates real GD at three γ on an anisotropic bowl. Heatmaps are computed on a `<canvas>` at module scope and exported as data URLs; contours come from `d3-contour`. A handful of figures are hand-authored static SVG (the hero, the bowl cross-section, the two-views landscape figure). The guide's whole epistemic brand is *"the figures are honest little simulations"* — the book must inherit that, which rules out screenshotting or redrawing by hand.

4. **Structured data** — `optTree` (14 optimizer story cards with year/name/by/idea/formula/fix/brk/act), `OPT_CITE` (citations + inventor portraits in `/public/inventors/`), `chRefs` (further reading per chapter), the `problems` table (22 landscapes with mini-formulas and tags), `chapterPresets` and `experiments` in `src/utils/experiments.ts` (each with `id`, `title`, `description`, imperative `apply()`), keyboard table, panel reference. This is already halfway to being a database.

Plus one more asset from `urlState.ts`: **the entire app state round-trips through a URL hash** — problem, optimizer + hyperparameters, γ, schedule, batch size, dataset seed, marker position, 2D/3D view, even a challenge goal. Data generation is seeded, so a link reproduces the exact scenario. This is precisely what a printed book needs to stay *interactive*: every "Try it" box can carry a link/QR that reconstructs the live experiment.

The stack (`package.json`) is plain Vite + Svelte 5 + TypeScript + vitest — no SvelteKit, no SSR, no markdown pipeline. Any content format we adopt must either be TypeScript or come with its own loader.

---

## 2. The three options, weighed honestly

### Option A — keep Svelte as source; write a walker that emits LaTeX

**How it would work.** Parse `HelpModal.svelte` with the Svelte compiler's AST (or a custom HTML-ish parser), walk the `<section data-ch>` trees, map `<p>`→paragraph, `{@html texD(...)}`→display math, `.concept`→boxed aside, `<figure>`→figure include, and evaluate the `String.raw` expressions to recover TeX.

**Why it's tempting.** Zero migration cost; the app stays exactly as is; the guide keeps evolving in one file.

**Why it fails.** The prose is interleaved with Svelte control flow (`{#if chapterPresets['ch-bowl']}`), component instances (`<ChapterCta>`, `<GuideVizLayers>`), reactive expressions, and *computed* attributes (`d={shapesFig.curveD}` — the walker cannot know that path without executing the script block). You'd end up embedding a partial Svelte evaluator inside a LaTeX emitter, coupled to every styling refactor anyone ever makes to the modal. Every class rename becomes a book-breaking change with no type error to catch it. The figures problem is worse: `raceDemo` calls `document.createElement('canvas')` at module scope — the component *cannot even be imported in Node*. A is a research project disguised as a build script. **Rejected**, but with one idea worth stealing: the walker's *taxonomy* (paragraph / display / concept / figure / cta) is exactly the block schema Option B should formalize.

### Option C — hand-written LaTeX book maintained in parallel

**Why it's tempting.** Total typographic control, start today, no refactor.

**Why it fails.** The owner's stated goal is that the guide *is* the book. With two sources, every correctness fix from the current audit must land twice; the optimizer cards, the 22-problem table, and the honest figures will drift within a month. Worse, the figures would be redrawn in TikZ by hand — severing them from the simulation engine and forfeiting the "these curves are real" guarantee. Parallel maintenance is how textbooks and their software companions always diverge. **Rejected.**

### Option B — extract content into a structured, typed format; render both targets

**How it would work.** Move each chapter's content out of the markup into **typed TypeScript content modules** — an array of tagged blocks:

```ts
type Block =
  | { kind: 'p'; text: Rich }                 // Rich = string with $math$, **b**, *i* micro-syntax
  | { kind: 'display'; tex: string; ref?: string }
  | { kind: 'concept'; title: string; text: Rich; figure?: FigId }
  | { kind: 'figure'; id: FigId; caption: Rich }
  | { kind: 'margin'; tag: 'highdim' | 'history' | 'caveat'; text: Rich }  // ← the honesty notes
  | { kind: 'tryit'; preset: string }          // chapterPresets key → CTA in app, QR box in print
  | { kind: 'optcards'; cards: OptChapter[] }  // the family-tree interlude
  | { kind: 'widget'; id: 'race' | 'layers' | 'schedules'; printFallback: FigId };
```

In the app, a small `<GuideBlocks blocks={...}>` renderer (~200 lines) replaces the hand-written markup; `HelpModal.svelte` shrinks to the shell (TOC rail, scroll-spy, hero, modal chrome) plus interactive "islands" (the SMIL race player, the layered viz) mounted where a `widget` block appears. In print, a Node script `scripts/emit-latex.ts` walks the same arrays and prints `.tex`.

**Why not markdown/MDX + pandoc instead?** Honestly weighed: markdown is nicer to *write* and diff, and pandoc gives LaTeX for free. But (a) this repo has no markdown toolchain and no SvelteKit to host MDX; (b) the content is unusually structured — optimizer cards, margin-note tags, preset CTAs, simulation-figure references — so you'd immediately be writing pandoc Lua filters for custom fenced divs, i.e. building the emitter anyway but inside a weaker type system; (c) TS modules give compile-time checks that every `tryit` preset exists, every `FigId` resolves, every citation key matches — `svelte-check` already runs in CI (`npm run check`). The `mathText()` splitter proves the team already likes "prose strings with `$…$` inside." Keep that grammar, add `**bold**`/`*em*`, and both renderers share one tiny parser. If authoring friction ever becomes real, a markdown front-end that *compiles to* these typed blocks can be added later without touching either emitter.

**The figures.** This is Option B's real work and real payoff. Split every figure into a **pure compute layer** (loss function → grid values, trajectories, contour thresholds — already nearly pure inside those IIFEs) and a **render layer** that turns the computed geometry into an SVG string. The browser mounts that SVG reactively; the Node emitter calls the same function and writes `figures/ch8-race.svg`, then shells to `rsvg-convert` (or Inkscape) for PDF. Two blockers to remove now:

- `document.createElement('canvas')` at module scope (`raceDemo`, `shapesFig.saddleURL`, `tintGridURL`) — inject a canvas factory; use `@napi-rs/canvas` in Node. Heat layers become PNGs referenced by the SVG (or `\includegraphics` layers under a TikZ/SVG overlay).
- Theme: the July day-mode work ("dark basins on light", `theme` param on `gridToImageURL`/`tintGridURL`) is a gift — **print mode is day mode plus a `print` palette** (white background, CMYK-safe viridis, thicker strokes). One more enum value, not a new system.

Animated figures (hero, SMIL race) get a `printFallback`: the race renders as full trajectories with step-count labels and a small legend — arguably *better* on paper, since arrival order becomes annotation rather than motion.

**The live demos.** `chapterPresets` + `urlState.encodeStateUrl` already almost compose. One restructuring is required: presets currently expose only an imperative `apply()` closure. Add a declarative `state` field (problem, optimizer, hyper, lr, schedule, seed, marker, view) from which *both* `apply()` and a URL are derived. Then the emitter turns every `tryit` block into a `tcolorbox` "Try it live" environment with the experiment title, a one-line setup description, a **QR code** (`qrcode` LaTeX package) and a printed short URL. Raw hash URLs run ~250–350 characters — scannable but ugly QR at that density — so add a `_redirects` file on Cloudflare Pages mapping `gradientlab.ai/x/ch5-overshoot → /#p=…&o=…`, generated by the same build script. Short, human-typeable, and the QR drops three versions in density.

**Verdict: Option B.** It is the only option where the audit fixes, the app, and the book share one source of truth; where the honest-simulation figures stay honest; and where the migration itself *forces* the content restructuring the textbook project needs anyway.

---

## 3. LaTeX design language

**Class: `kaobook`** (a modern, actively maintained memoir-derived class built for exactly this genre: wide outer margin, sidenotes, margin figures, boxed environments) — with plain **`memoir` + `sidenotes`/`marginnote`** as the conservative fallback if kaobook's opinions chafe. `tufte-latex` is the spiritual ancestor but is effectively unmaintained and fights modern packages; take its ideas, not its code.

**Engine: LuaLaTeX + `unicode-math`.** The prose is full of literal γ, α, β, κ, ∇, ŷ, → characters; LuaLaTeX eats them natively instead of demanding a `\gamma`-ification pass. Font pairing suggestion: a humanist serif for text (STIX Two or Source Serif), matching math font via unicode-math, and Fira Mono for the keyboard/reference tables. Build with `latexmk -lualatex` in a GitHub Action that publishes the PDF artifact on every push to main.

**The vocabulary of environments**, mapped one-to-one from block kinds:

| Guide element | Print environment |
|---|---|
| `.concept` aside | `kaobox`/`tcolorbox` "Concept" with its mini-figure in the margin |
| **`margin` blocks, tag `highdim`** | **margin note with a small ∞-dimensions glyph — the "honest note" channel.** This is where "in 2-D you can see the whole map; in a billion dimensions saddle points outnumber minima and nobody sees anything" lives, adjacent to the very sentence whose 2-D intuition it corrects. Making these first-class *now* (rather than burying honesty in parentheticals) is the single highest-leverage restructuring for the book. |
| `tryit` / chapter CTA | numbered "Experiment" box: title, setup, QR + short URL |
| `optTree` cards | full-width "Interlude" spreads: year + portrait (already in `/public/inventors/`) in the margin, idea prose, formula, `fix`/`brk` as ✓/✗ margin pair; the `act` intros become section epigraphs |
| `formulas` registry | numbered equations with stable `\label{eq:updateRule}` — the registry key *is* the label |
| `OPT_CITE` / `chRefs` | biblatex entries; "Further reading" becomes per-chapter bibliography notes |
| 22-problem table | a "bestiary" appendix, one landscape per entry with its mini contour figure |
| keyboard/panel reference | colophon-style appendix, or dropped from print |

Front matter: the hero's tagline ("Two knobs, a landscape of error…") is already a perfect epigraph. Add a notation table (θ, γ, ∇ℒ, λ, κ, β vs. the *parameter* β — see restructuring note below) generated from a small symbols registry.

---

## 4. Phased migration plan

**Phase 0 — audit lands first (now).** Correctness and pedagogy fixes from the parallel audit go into the current component. Do not migrate wrong content.

**Phase 1 — extract what is already data (1–2 sessions, zero visual change).** Move `formulas`, `optTree`, `OPT_CITE`, `chRefs`, `problems`, the keyboard table into `src/content/*.ts`. Give every display formula a registry name (today many are anonymous `String.raw` in markup). Add declarative `state` to every preset in `experiments.ts` and derive `apply()` from it; add a `stateToUrl(state)` helper next to `encodeStateUrl`. App renders identically.

**Phase 2 — block schema + renderer (the real refactor).** Define `Block`/`Rich`, write `<GuideBlocks>`, and migrate chapters one at a time (start with `ch-bowl`, the simplest; end with `ch-optimizers`, the richest). `HelpModal.svelte` becomes shell + islands. Simultaneously split each figure into `compute()`/`renderSVG()` with an injectable canvas and a `theme: 'dark' | 'day' | 'print'` parameter. Acceptance test: the app is pixel-comparable before/after per chapter.

**Phase 3 — the emitter.** `scripts/emit-latex.ts`: Rich-string parser → TeX (`$…$` passes through; escape `%`, `&`, `#`; map `**`/`*`), blocks → environments, figures → SVG→PDF via `rsvg-convert`, presets → QR boxes + generated `_redirects`. Snapshot-test the `.tex` output in vitest so content edits show their print diff in review.

**Phase 4 — the book skeleton.** kaobook class file, preamble, front/back matter, biblatex from `OPT_CITE`/`chRefs`, `latexmk` + GitHub Action producing `gradient-lab.pdf`. First end-to-end compile with placeholder styling; then typographic passes.

**Phase 5 — book-only depth.** Exercises (seed: the `experiments` array *is* an exercise set — add "predict before you run" questions and printed answers), the notation appendix, an index (`\index` calls can live in the content modules as optional block metadata), and the new chapters the roadmap wants (Hessian/curvature — the guide already name-drops λ_max, κ, and Newton's H⁻¹∇ℒ, so a proper "reading curvature" chapter slots between ch-gamma and ch-optimizers and retroactively grounds the `stability` formula γ < 2/λ_max).

---

## 5. Restructure now, export painlessly later

1. **Declarative preset state** (Phase 1) — the keystone; unlocks QR links, shortlinks, and reproducible exercises.
2. **Name every formula.** Anonymous inline `String.raw` display math can't be numbered, cross-referenced, or reused. The `formulas` registry pattern already exists — finish it.
3. **One micro-syntax for rich prose.** Today `optTree.idea` strings mix raw HTML (`<em>`, `<strong>`) with `$math$`; chapter prose uses real markup; `mathText` handles only the cards. Converge on the `$…$`/`**…**` grammar everywhere so one parser serves both renderers.
4. **Promote honesty notes to a block type.** Tag every "in high dimensions this intuition breaks" remark as `margin`/`highdim` rather than an inline aside — in-app they can render as a distinct tinted note; in print they become the margin-note channel that gives the book its intellectual integrity.
5. **Purify figure computation.** No DOM at module scope; canvas injected; theme parameterized (the day-mode work already did 80% of this).
6. **Resolve the β collision.** The model parameter β and the EMA decay β (and Adam's β₁, β₂) share a letter; the moving-average card even defines EMA with β while the app's second knob is β. Fine on screen with context, ambiguous in a book — pick a convention (e.g. EMA decay ρ or explicit β₁) and encode it in the notation registry.
7. **Chapter metadata.** Fix the duplicate TOC numbering (two chapters numbered "3", two "9" in the `toc` array — lines 111–131) by making chapter numbers derived, not hand-typed; add a stable slug + one-sentence abstract per chapter (feeds both the TOC rail tooltip and the book's chapter openings).
8. **Keep captions mandatory.** Every `<figure>` already has a real `figcaption` — preserve that discipline; print amplifies caption quality.

---

## 6. Summary recommendation

Adopt **Option B**: typed TypeScript content modules (blocks with `$math$` micro-syntax) rendered by a thin Svelte component in-app and by a Node emitter to LaTeX; figures refactored into pure compute + themed SVG render shared by both targets; live demos exported as QR/shortlink "Experiment" boxes powered by declarative preset state over the existing `urlState` hash encoding. Typeset with **kaobook (memoir-based) + LuaLaTeX + unicode-math**, margin notes reserved for the high-dimensional honesty channel, built by `latexmk` in CI. Migrate in five phases, starting by extracting the already-structured data and — before anything else — landing the correctness audit, so that the single source of truth is *true* before it becomes singular.
