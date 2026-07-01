# Gradient Lab — Vision: from in-app guide to a small textbook

*Role: vision architect. Sources read: `src/components/HelpModal.svelte` (TOC lines 111–131, formulas object 183–190, optimizer cards 210–372, chapters 1240–2498), `src/utils/lessons.ts` (10 predict-run-reflect lessons), `src/utils/experiments.ts` (9 experiments + 8 chapterPresets), `src/utils/hyperMeta.ts`, `src/utils/problems.ts` (problem names).*

---

## 1. What exists today, honestly appraised

The current guide is already unusually good: it has a narrative spine (bowl → landscape → gradient → step → γ → schedules → noise → optimizers → generalization), a genuinely excellent optimizer family-tree told as "fix what just broke," one real proof (steepest descent via cosine), live figures, per-chapter presets, and a predict-run-reflect course (`lessons.ts`) that is pedagogically state-of-the-art in miniature.

Its structural weaknesses as a *book*:

1. **Prerequisites are consumed before they are taught.** Chapter 5 (γ) uses λ_max and "curvature"; Chapter 8 uses eigenvalue-flavored κ, condition numbers, and convergence factors (κ−1)/(κ+1) — but the Hessian, second derivatives, and eigen-intuition are never taught anywhere. Newton's card *uses* H⁻¹∇ℒ on a reader who has never met a matrix. Similarly, the very first chapter assumes the reader knows what a derivative is; the target reader does not.
2. **One chapter is a whole part in disguise.** `ch-optimizers` contains ~40% of the book's content (conditioning theory, ravine figure, family tree, 14-optimizer race, 15 cards, frontier note). No print chapter can carry that.
3. **The TOC numbering is already broken** (two chapters numbered "3", two numbered "9", two "10" in the `toc` array) — a symptom that the flat 12-chapter structure has outgrown itself.
4. **Duplication between the three teaching surfaces.** The guide, the course (`lessons.ts`), and the experiments teach overlapping content with no shared numbering — a book needs one canonical exercise system that all three surfaces reference.
5. **High-dimensional honesty is patchy.** `ch-shapes` has the excellent Dauphin-2014 saddle paragraph; the noise and generalization chapters gesture at flat minima; but there is no *systematic* "where 2-D lies to you" thread, which the owner explicitly wants.

Everything below is designed so that the Svelte guide and the LaTeX export are two renderings of one source structure.

---

## 2. Design principles

- **Teach-before-use, strictly.** Every symbol appears in a chapter *after* the chapter that defines it. The two big insertions this forces: a derivatives-from-scratch chapter before the gradient, and a curvature/Hessian chapter before the stability limit and conditioning are used quantitatively.
- **Every chapter ends at the app.** One promise, one paired demo (existing `chapterPresets` / `experiments` / `lessons` where possible; gaps flagged as NEW-DEMO), 2–4 numbered exercises in the predict-run-reflect pattern the course already uses.
- **Margin notes as a typed system.** Three recurring margin-note types, each with a fixed icon/environment: ⚠ *In a billion dimensions…* (where 2-D misleads), ⌨ *Read the code* (pointer into `optimizers.ts`/`schedules.ts`), and 📜 *History* (the inventor material from the cards).
- **The optimizer cards survive as boxed "portrait cards"** inside Part IV chapters — they are the book's signature asset, not something to flatten into prose.

---

## 3. The complete table of contents

### Part I — Seeing the problem

**Ch 1. Machines with two knobs** *(maps: ch-bowl)*
Promise: after this chapter you can state, in one sentence, what "learning" means — and read a loss number off the app.
Sections: 1.1 Knobs, predictions, and being wrong · 1.2 Mean squared error, and why we square · 1.3 Yes/no questions: probabilities and cross-entropy · 1.4 The game: minimize ℒ(α, β).
Demo: `chapterPresets['ch-bowl']` (Roll into the bowl).
Exercise 1.1 [predict]: before pressing Train on Linear Regression, predict whether loss can reach exactly 0 on noisy data; run; reflect on the noise floor. Exercise 1.2 [explore]: drag the marker to make the loss *worse* on purpose; reflect: what did the number reward?

**Ch 2. Loss is a landscape** *(maps: ch-landscape)*
Promise: you will never again see training as algebra — it is walking downhill on a surface you can now read like a hiking map.
Sections: 2.1 One loss per (α, β): the surface · 2.2 Contour maps and the 3-D view · 2.3 Bright is low: reading the panel.
Demo: `chapterPresets['ch-landscape']` (Lift the map into 3D).
Exercise 2.1 [predict]: shown only the contour map, predict where the 3-D valley floor is; flip to 3D; reflect. Margin ⚠: a billion-parameter landscape cannot be drawn at all — every picture in this book is a 2-D slice, and slices can lie (link to Appendix F).

**Ch 3. The derivative, from scratch** *(NEW — the missing calculus on-ramp)*
Promise: you will build the derivative with your own hands — a nudge, a response, a ratio — and need no prior calculus.
Sections: 3.1 Nudge a knob, watch the loss (finite differences) · 3.2 The tangent line: the limit of smaller nudges · 3.3 Slope rules you'll actually need (powers, sums, chain rule *stated*, not drilled) · 3.4 Two knobs: partial derivatives, holding the other still · 3.5 Margin ⌨: how the app really computes ∇ℒ (analytic per-problem gradients in `problems.ts`); aside on backprop (moved here from ch-downhill's aside, in gentler form).
Demo: NEW-DEMO wanted — a "nudge meter" on `slope-1d`: hold a key to nudge α by h and display Δℒ/h converging to dℒ/dα as h shrinks. Until built, pair with lesson `downhill`'s tangent-line staging.
Exercise 3.1 [predict]: for the 1-D parabola at α=2, is the ratio Δℒ/Δα positive or negative? Run the nudge; reflect. Exercise 3.2 [prove-lite]: compute d(α²)/dα from the nudge definition on paper; check against the app's readout.

**Ch 4. The shape zoo: minima, saddles, plateaus** *(maps: ch-shapes)*
Promise: you will learn the four features every landscape is built from — and which of them actually matter at scale.
Sections: 4.1 Local vs global minima; basins and watersheds · 4.2 Initialization is a decision · 4.3 Saddle points: flat but not done · 4.4 Plateaus: the quiet trap · 4.5 ⚠ The great inversion: in high dimensions saddles, not bad minima, are the enemy (Dauphin 2014 — keep this superb passage verbatim).
Demo: `chapterPresets['ch-shapes']` (double well); lessons `trap`, `saddle`, `dead-gradient` become Exercises 4.1–4.3 nearly unchanged.

### Part II — Walking downhill

**Ch 5. The gradient: which way is down** *(maps: ch-downhill; now legal, since Ch 3 taught partials)*
Promise: one arrow, assembled from the two slopes you already know how to measure, and a one-line proof it is the best possible arrow.
Sections: 5.1 Stacking partials into ∇ℒ · 5.2 Steepest ascent, and its opposite · 5.3 Gradients are perpendicular to contours · 5.4 The proof: D_u ℒ = ‖∇ℒ‖cos θ (keep the proof box and both figures) · 5.5 The honest caveat: the gradient is only true where you stand.
Demo: `chapterPresets['ch-downhill']` (arrow field, don't train yet). Exercise 5.1 [predict] = lesson `downhill`. Exercise 5.2 [explore]: find a spot where the blue arrow is shortest; reflect on what short means.

**Ch 6. One step of descent** *(maps: ch-step)*
Promise: the eleven-symbol update rule the entire field is built on — and you will take it one press at a time.
Sections: 6.1 The recipe · 6.2 θ ← θ − γ∇ℒ · 6.3 Blue arrow vs red arrow: the optimizer's personality gap · 6.4 ⌨ Read the code: the five-line `gd` update in `optimizers.ts`.
Demo: `chapterPresets['ch-step']` (Step key). Exercise 6.1 [predict]: from (−3.5, 3), predict the marker's landing quadrant after one step; step; reflect.

**Ch 7. The learning rate γ** *(maps: ch-gamma, minus the λ_max math, which moves to Ch 8)*
Promise: the one dial you will touch more than all others, and how to break it on purpose, safely.
Sections: 7.1 Goldilocks: creep, glide, explode · 7.2 There is an exact edge (qualitative teaser: "two divided by the steepness — a number we will be able to compute in the next chapter") · 7.3 Aside: freak gradients and clipping.
Demo: `chapterPresets['ch-gamma']` (γ = 1.3 blow-up). Exercise 7.1 [predict] = lesson `step-size`. Exercise 7.2 [explore]: bisect by hand to find the critical γ on Linear Regression to two decimals; reflect — you have just measured curvature without knowing it (hook to Ch 8).

**Ch 8. Curvature, the Hessian, and conditioning** *(NEW — the load-bearing insertion; currently name-dropped in ch-gamma, ch-optimizers, and Newton's card)*
Promise: the second number at every point — how the slope itself bends — explains the γ edge you just measured, the ravine, and (later) Newton's near-teleport.
Sections: 8.1 The second derivative: bending, in 1-D · 8.2 A bowl fitted to where you stand (local quadratic model) · 8.3 Two directions, two curvatures: the Hessian as a 2×2 table of bendings · 8.4 Principal directions and λ_min, λ_max (taught as "the stiffest and softest axes of the fitted bowl"; eigenvectors by picture, not by determinant) · 8.5 The stability limit γ < 2/λ_max, derived in 1-D, believed in 2-D · 8.6 The condition number κ and the ravine · 8.7 ⚠ In a billion dimensions the Hessian has a billion curvatures and can't even be stored — remember this when Part IV reaches Newton.
Demo: the existing **curvature lens** (hexagon button; reads out κ; draws Newton's ghost) finally gets its own chapter. Exercise 8.1 [predict]: given the lens's κ on Rosenbrock vs Linear Regression, predict which tolerates the larger γ; run; reflect. Exercise 8.2 [explore] = lesson `narrow-valley`. Exercise 8.3 [prove-lite]: verify 2/λ_max against the γ you bisected in Ex 7.2.

**Ch 9. Convexity, and how fast you get there** *(NEW — light theory chapter; absorbs the (κ−1)/(κ+1) material currently squatting in ch-optimizers)*
Promise: on an honest bowl you can predict, with a formula, how many steps you'll need — and why a stretched bowl is slow *no matter how you tune γ*.
Sections: 9.1 What convex means (chord test; one bowl, no traps) · 9.2 Linear convergence: closing a fixed fraction per step · 9.3 The κ tax: (κ−1)/(κ+1), and momentum's √κ discount (statement + plot, no proof) · 9.4 Nesterov's optimality claim, stated honestly · 9.5 ⚠ Nothing you will ever train is convex — why the theory still pays rent (it governs the *end-game* inside any basin).
Demo: NEW-DEMO wanted — step-counter overlay: same bowl at κ = 1, 10, 100 (the app's ravine figure generalized), predicted vs actual steps to tolerance. Exercise 9.1 [predict]: double κ; does step count roughly double? run; reflect.

**Ch 10. Scheduling the learning rate** *(maps: ch-schedule)*
Promise: stop choosing between fast and precise — γ can be both, if it changes over time.
Sections: 10.1 The compromise, revisited · 10.2 Constant, step decay, cosine, warmup+cosine (keep the four-card figure) · 10.3 Why warmup protects the opening · 10.4 The deeper payoff: a preview of noise (forward-ref to Ch 12) · 10.5 ⌨ Read the code: `schedules.ts`.
Demo: `lion-schedule` experiment ("Watch Lion orbit, then land") — flagged as a *flash-forward*, since Lion itself arrives in Ch 17. Exercise 10.1 [predict]: on step decay, predict what the loss curve looks like at the moment γ is cut; run; reflect (the cliff).

### Part III — Descent under noise

**Ch 11. Mini-batches and the S in SGD** *(maps: ch-noise, first half)*
Promise: you will trade a perfect arrow for a cheap noisy one — and see exactly what the noise costs and buys.
Sections: 11.1 Full batch: the true gradient and its bill · 11.2 Sampling a batch; the fan of arrows · 11.3 √n: the law of diminishing returns · 11.4 Vocabulary: iteration, epoch.
Demo: `chapterPresets['ch-noise']` (batch = 1 noise ball). Exercise 11.1 [predict] = lesson `sgd-noise`. Exercise 11.2 [explore]: find the smallest batch whose path you can't visually distinguish from full-batch; reflect on √n.

**Ch 12. The noise ball: SGD as stochastic approximation** *(NEW half-chapter + ch-noise, second half)*
Promise: why a noisy walk converges at all — the 1951 idea underneath every modern training run.
Sections: 12.1 Right on average: unbiased estimates · 12.2 The noise ball; radius grows with γ and fan width · 12.3 Robbins–Monro: shrink γ enough to settle, not so fast you stall (Σγ = ∞, Σγ² < ∞, told in words) · 12.4 Decay is *how* a stochastic run converges — the schedule chapter's payoff · 12.5 Useful noise: escaping saddles and shallow dips; the flat-minima teaser · 12.6 📜 History: Robbins & Herbert Monro, 1951 — SGD is older than the computer it runs on.
Demo: cosine-pinch demo already scripted in the guide's "Watch it" paragraph (make it a preset). Exercise 12.1 [predict]: constant vs cosine at batch 1 — which loss curve's final band is narrower? run both; reflect.

**Ch 13. Training loss isn't the goal** *(maps: ch-generalize)*
Promise: the number you've spent twelve chapters minimizing is a stand-in — here is what it stands for, and when it betrays you.
Sections: 13.1 Empirical vs true risk · 13.2 Overfitting and the two curves · 13.3 Held-out data and early stopping · 13.4 Regularization and weight decay (θ ← (1−γλ)θ …) · 13.5 Flat vs sharp minima; batch size and the generalization gap · 13.6 ⚠ In high dimensions models can *interpolate noise and still generalize* (double descent, one honest margin paragraph — the 2-D picture of "overfitting = too low training loss" is incomplete).
Demo: `chapterPresets['ch-generalize']` (fit the noise); `noisy-truth` experiment as Exercise 13.2.

### Part IV — The optimizer family tree
*(splits the monolithic ch-optimizers; keeps every card as a boxed portrait-card; each chapter gets a ⌨ Read-the-code section pointing at the real update in `optimizers.ts` — the "implementation chapter per family" requirement, distributed rather than ghettoized)*

**Ch 14. The ravine, and the shape of the whole story** *(part-opener)*
Promise: one nemesis (ill-conditioning), one 170-year repair job, one tree — and a race you can re-run yourself.
Sections: 14.1 The ravine, quantitatively (now a recap: κ from Ch 8, rates from Ch 9) · 14.2 The family tree figure · 14.3 The 14-way race, and how to read it · 14.4 Cauchy's card (Act I).
Demo: `banana-race` experiment. Exercise 14.1 [predict] = lesson `momentum-race`.

**Ch 15. Memory: momentum and Nesterov** *(Act II cards)*
Promise: give the marker mass and it stops rattling — then teach it to look before it leaps.
Sections: 15.1 The moving average (the "tool" card — promote to a proper section; it is the single most reused idea in the book) · 15.2 Polyak's heavy ball · 15.3 Overshoot, orbit, and Nesterov's foresight · 15.4 ⌨ Read the code: `momentum`/`nesterov` in `optimizers.ts` (note the implemented Nesterov variant vs the paper's — an honest formulas-vs-code box).
Demo: the Gaussian-Peak μ = 0 → 0.9 aside becomes Exercise 15.1 [predict-run-reflect]. Exercise 15.2 [explore]: crank μ to 0.99 and watch the orbit — the break the card promised.

**Ch 16. A learning rate per parameter: AdaGrad, RMSProp, AdaDelta** *(Act III cards)*
Promise: attack the ravine across parameters instead of across time — and watch the first attempt strangle itself.
Sections: 16.1 Why one γ can't serve two axes · 16.2 AdaGrad and the ever-growing memory · 16.3 RMSProp: forgetting (the moving average, again) · 16.4 AdaDelta and the units argument (dimensional analysis as a *teaching moment* — flag it as the book's first taste of "sanity-checking an equation by its units") · 16.5 ⌨ Read the code: the three-line difference between AdaGrad and RMSProp.
Demo: `adam-vs-gd` experiment retargeted at RMSProp. Exercise 16.1 [predict]: on a long run, AdaGrad vs RMSProp — who freezes? run; reflect.

**Ch 17. Adam and its repairs** *(Act IV + refinement cards + Lion)*
Promise: bolt the two working ideas together, then spend a decade sanding the result.
Sections: 17.1 Adam: both moving averages, plus bias correction (derive 1−βᵗ properly — the card asserts it; the book should show the two-line geometric-series argument) · 17.2 Nadam · 17.3 AdamW and decoupled decay (bridge back to Ch 13's λ) · 17.4 RAdam and derived warmup (bridge back to Ch 10) · 17.5 The sign-step branch: Lion, and why it cannot settle (bridge to Ch 10/12: schedules as the cure) · 17.6 ⌨ Read the code: Adam in eight lines.
Demo: `lion-schedule` (now home, no longer a flash-forward); lesson `adam` = Exercise 17.1.

**Ch 18. Second-order methods: a reality check** *(Branch cards: Newton, Sophia; frontier box; the "second-order reality check" chapter)*
Promise: the method everything in Part IV is a cheap stand-in for — why it teleports here, and why nobody can afford it out there.
Sections: 18.1 Newton: jump to the fitted bowl's bottom (now fully legal — Ch 8 taught H) · 18.2 Where Newton fails: saddles, non-convexity, the uphill jump · 18.3 The bill: N×N at a billion parameters (⚠ margin: in 2-D the Hessian is 3 numbers; at GPT scale it would outweigh the internet) · 18.4 Sophia: the diagonal + a clip · 18.5 The frontier box (Muon/Shampoo/SOAP) — kept verbatim; it is the most honest paragraph in the guide.
Demo: curvature-lens Newton-ghost aside becomes Exercise 18.1; Exercise 18.2 [predict]: Newton on the saddle problem — teleport or stall? run; reflect (it falls back to a gradient step — and *read the code* to see that guard).

**Ch 19. Removing the last knob: Prodigy and self-tuning** *(Prodigy card + a short survey)*
Promise: the endgame of the whole story — an optimizer that estimates its own γ from how far it has come.
Sections: 19.1 The distance-to-solution insight · 19.2 D-Adaptation → Prodigy · 19.3 What "parameter-free" honestly means (and doesn't) · 19.4 The story so far, on one page: a single table of every update rule in the book (the LaTeX export's centerfold).
Demo: NEW-DEMO wanted — Prodigy's d-estimate plotted live over a run. Exercise 19.1 [predict]: seed Prodigy far vs near the minimum; which ramps γ higher? run; reflect.

### Part V — Practice

**Ch 20. Tuning by hand: a field guide** *(NEW — hyperparameter-tuning practice)*
Promise: a repeatable ritual for arriving at a new problem: what to touch first, what to read, when to stop.
Sections: 20.1 The order of operations (γ first, always; the bisect-the-blow-up trick from Ex 7.2) · 20.2 Reading loss curves as symptoms (spikes, cliffs, bands, plateaus — a diagnostic table keyed to figures from earlier chapters) · 20.3 Grid vs random search in 2 knobs (⚠ margin: random beats grid *because* of high dimensions — Bergstra & Bengio) · 20.4 Budgets and early stopping as a tuning tool · 20.5 A tuning worksheet (printable / in-app checklist).
Demo: every problem in the picker. Exercise 20.1 [explore]: tune plain GD on Damped Oscillator to beat a par step-count; Exercise 20.2: same, Adam, and reflect on which knobs mattered.

**Ch 21. The zoo, guided** *(maps: ch-problems, upgraded from a card grid to one paragraph per landscape)*
Promise: 22 landscapes, each a one-paragraph story: what shape it is, which chapter it demonstrates, which optimizer embarrasses itself on it.
Sections grouped as in the picker (Learning curves / Classifiers / Classic surfaces / Custom), each entry: formula, shape, "teaches", "try". Cross-reference table: problem ↔ chapter ↔ exercise. The custom-dataset editors get a section: design your own classifier data.
Demo: `marker-is-model` experiment (Circle Classifier) as the flagship. Exercise 21.1 [explore] = lesson `tiny-net` ("You've been doing deep learning").

**Ch 22. Capstone projects** *(NEW)*
Promise: leave the book with something you made: a tuned run, a written diagnosis, or a brand-new optimizer.
Projects (pick one): P1 *The report* — pick any landscape, produce a one-page tuning report using Ch 20's worksheet (predict → run → reflect at full scale). P2 *Break every optimizer* — design a custom dataset on which each of three named optimizers fails; explain why. P3 *Invent an optimizer* — combine two ideas from Part IV (e.g., sign steps + warmup) on paper, predict behavior on three named landscapes, then verify with the closest configurable stand-in. P4 *The race commentary* — full 14-way race on Himmelblau; write the sports commentary, citing chapters for each racer's behavior.
Demo: custom regression/classification problems; race mode.

### Backmatter

- **Appendix A. Notation** — every symbol (θ, γ, μ, β₁, β₂, ρ, λ, κ, ε, ∇, H, ℒ, ŷ), the chapter that defines it, and the app control it corresponds to. (The γ-vs-η and β-as-data-symbol-vs-EMA-decay collisions get an explicit disambiguation note — the guide currently uses β for both a model parameter and EMA decay.)
- **Appendix B. Calculus refresher** — the fuller companion to Ch 3: limits, rules, chain rule with worked examples, partials, a two-page Taylor-to-first-and-second-order (feeding Ch 8).
- **Appendix C. Just enough linear algebra** — vectors, dot product (feeding the Ch 5 proof), matrices as machines, the eigen-picture of a 2×2 symmetric matrix (feeding Ch 8/18). Deliberately last-resort: the main text teaches by picture.
- **Appendix D. The app: panels, controls, keyboard** *(maps: ch-panels + ch-keys — reference material does not belong in the narrative spine)*.
- **Appendix E. Glossary** — every bolded term, one sentence each, with chapter refs.
- **Appendix F. Where two dimensions lie to you** — the collected ⚠ margin notes, expanded: saddles vs minima (Dauphin), volume concentration, why random search wins, why the Hessian is unstorable, near-orthogonality of random vectors, double descent, and why *this app is still worth trusting* (the end-game inside any basin is locally 2-D-like along the top curvature directions). This appendix is the owner's "honest margin-notes" requirement made load-bearing.
- **Bibliography** — the existing `chRefs` + `OPT_CITE` objects already contain most of it; normalize to BibTeX keys (see §5).

---

## 4. Mapping summary (existing → new)

| Existing | New home |
|---|---|
| ch-bowl | Ch 1 |
| ch-landscape | Ch 2 |
| — | **Ch 3 NEW** (derivatives from scratch) |
| ch-shapes | Ch 4 |
| ch-downhill | Ch 5 (backprop aside → Ch 3.5) |
| ch-step | Ch 6 |
| ch-gamma | Ch 7 (λ_max math → Ch 8) |
| — | **Ch 8 NEW** (curvature/Hessian/conditioning) |
| — | **Ch 9 NEW** (convexity & rates; absorbs κ-rate math from ch-optimizers) |
| ch-schedule | Ch 10 |
| ch-noise | Ch 11 + Ch 12 (**12 half-NEW**: stochastic approximation) |
| ch-generalize | Ch 13 |
| ch-optimizers | **Ch 14–19** (split; read-the-code sections NEW) |
| — | **Ch 20 NEW** (tuning practice) |
| ch-problems | Ch 21 (upgraded) |
| ch-experiments | dissolved into per-chapter exercises |
| — | **Ch 22 NEW** (capstone) |
| ch-panels, ch-keys | Appendix D |
| lessons.ts (10 lessons) | become canonical exercises: downhill→Ex 5.1, step-size→7.1, trap→4.1, dead-gradient→4.3, momentum-race→14.1, sgd-noise→11.1, narrow-valley→8.2, adam→17.1, saddle→4.2, tiny-net→21.1 |

New-demo backlog implied by the book (small, in priority order): nudge-meter (Ch 3), κ step-counter (Ch 9), Prodigy d-plot (Ch 19), presets for Ch 12's cosine-pinch and Ch 16's AdaGrad-freeze.

---

## 5. Exercise numbering and cross-reference scheme (LaTeX-survivable)

**One source of truth: slug IDs, not numbers.** Numbers are *derived* at render time (Svelte counts; LaTeX counts). Every referenceable object carries a stable slug that both renderers share:

- Chapters: `ch:gradient`, `ch:curvature`, … (rename the Svelte `data-ch` anchors from `ch-downhill` style to the same slugs, or keep a 1:1 alias map).
- Exercises: `ex:<chapter-slug>:<short-name>` — e.g. `ex:gamma:bisect`, `ex:curvature:kappa-race`. Rendered as **Exercise 7.2** (chapter.sequence), never hand-numbered.
- Figures `fig:…`, equations `eq:…` (the `formulas` object's keys — `updateRule`, `stability`, `directional` — become `eq:update-rule`, `eq:stability`, `eq:steepest`), margin notes `mn:…`, optimizer cards `card:adamw`, problems `prob:rosenbrock`, projects `proj:break-everything`.

**LaTeX side.** One environment per pedagogical move, so the pattern is typographically enforced:

```latex
\begin{exercise}{ex:gamma:bisect}      % -> Exercise 7.2
  \predict{Past which γ does the run diverge? Bracket it.}
  \run{app:preset-gamma}                % renders as margin QR/short-URL
  \reflect{You measured 2/λ\_max without knowing it — name the quantity.}
\end{exercise}
```

`\run{app:…}` is the bridge: in the app it is the "Try it" button (via `experiments.ts` id); in print it renders a short URL using the existing `urlState.ts` deep-link encoding (`gradientlab.ai/#s=…`), so a paper reader can open the exact staged scenario. **This means every lesson/preset id must become a stable public URL — the one infrastructure investment the book requires.**

Cross-references always via `\cref{ex:gamma:bisect}` (cleveref), so renumbering chapters never breaks prose; in Svelte, the same slugs resolve through a tiny registry to "Exercise 7.2" links that scroll or launch. Margin-note types map to three environments (`\dimwarn`, `\readcode`, `\history`) with fixed icons matching the app's.

**Numbering rules:** exercises number per chapter (7.1, 7.2); figures and equations per chapter; projects letter-free (Project 1–4); appendix exercises A.1 etc. Lessons in the app display their book number ("Exercise 5.1 · Which way is down?") so the three surfaces (guide, course, print) finally share one spine.

---

## 6. Sequencing advice (what to build first)

1. **Ch 8 (curvature/Hessian)** — it retroactively legalizes ch-gamma's λ_max, ch-optimizers' κ, and Newton's card; the curvature lens demo already exists, so it is high-value, low-cost.
2. **Ch 3 (derivatives)** — unblocks the "absolute beginner" promise; everything after it gets easier to write.
3. **Split ch-optimizers into Ch 14–19** — mostly editorial; the cards, race, and tree carry over intact.
4. **Slug/exercise registry + URL presets** — do this before writing more exercises, or renumbering pain compounds.
5. Ch 9, 12, 20, 22 in any order; Appendix F grows organically as ⚠ notes accumulate.

The guide's voice — teacherly, story-driven, honest about its own toy-ness — is already the book's voice. Nothing above asks it to change register; it asks the structure to catch up to the prose.
