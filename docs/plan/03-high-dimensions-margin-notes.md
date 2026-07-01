# "In higher dimensions…" — a margin-note catalog for the Gradient Lab guide

**Scope.** Every place in the guide (`src/components/HelpModal.svelte`) where the honest, lovely 2-D picture quietly misleads about what happens at a million or a billion parameters — and a short, warm margin note that would repair it. The app's whole premise is *two knobs so you can see everything*; these notes are the price of admission stated out loud, and paying it visibly is what earns the reader's trust.

**Proposed device.** A recurring styled aside — suggested class `hd-note`, with a fixed opening tag like **"In higher dimensions…"** — visually distinct from the existing `.aside` (e.g. a thin violet left rule and a small ∞ or dⁿ glyph). Because it recurs with the same voice and badge, readers learn to *expect* the correction, which turns a limitation of the sandbox into a running subplot: "here is what the picture can't show you, and here is the 2-D shadow of it you *can* still see." The guide already does this twice in-line (Dauphin et al. in ch-shapes; backprop in ch-downhill); the catalog below regularizes the habit and fills the gaps.

Line numbers below refer to `src/components/HelpModal.svelte` at commit `a9202ac`.

---

## Note 1 — Saddles outnumber minima (and why)

**Attach to:** Chapter 3, `ch-shapes`, immediately after the Dauphin et al. paragraph (~line 1475–1481). The *claim* is already in the text; what's missing is the *reason*, which is a one-breath counting argument a beginner can own.

**Draft note.**
> In higher dimensions, here is why saddles take over. At a flat spot the surface curves independently along each of the d directions, and a *minimum* needs every single one to curve up. With two knobs that's two coin flips; with a million it's a million — so a random flat spot is all but certain to curve down somewhere, and "somewhere down" is exactly a saddle. The mountain pass isn't the rare case up there; it's nearly the only case.

**In-app demo.** The saddle already drawn in the ch-shapes figure (x²−y²), plus the Classic saddle surface: park the marker exactly on the saddle, watch the gradient die, then nudge one key-press sideways (arrow keys) and watch it fall — "now imagine 999,999 sideways directions to find."

---

## Note 2 — "Bad local minima" is the 2-D villain, not the real one

**Attach to:** Chapter 3, `ch-shapes`, as a coda to the basin-of-attraction paragraph (~line 1417–1425). The Dauphin paragraph already states the reversal; this note makes the *pedagogical* point that the app's own multi-basin landscapes are the exception, so the reader doesn't over-learn them.

**Draft note.**
> A confession about this playground: with two knobs, dodging the wrong valley really is the game, and several landscapes in Part IV are built to punish a bad start. In a large network the drama fades — almost every minimum you can actually roll into sits nearly as low as the best one, and theory backs the experiments (Dauphin et al., 2014; Choromanska et al., 2015). Keep the basin picture; just know that at scale the enemy is the long flat crawl, not the wrong valley.

**In-app demo.** Any multi-basin problem (e.g. the four-way-tie surface in "The 22 landscapes"): drag the start across the ridge, land somewhere different — then the note reframes it.

---

## Note 3 — Initialization at scale: a random point on a giant sphere

**Attach to:** Chapter 3, `ch-shapes`, to the sentence "…which is what makes **initialization** a real design choice" (~line 1424). Alternative home: ch-downhill.

**Draft note.**
> In higher dimensions "where you start" changes meaning. With a million knobs each set to a small random number, every start lands on a thin shell at almost exactly the same distance from the origin, and two random starts are nearly perpendicular to each other. So real initialization science isn't about picking the right basin — it's about picking the right *scale* (Xavier/He initialization), so the first gradients are neither vanishingly small nor explosive.

**In-app demo.** Weak in 2-D (that's the point). Best hinted with the reset-marker button: "here, re-rolling the start moves you to a different basin; at scale it barely changes anything *except* the norm."

---

## Note 4 — The ravine's real name at scale: a broken spectrum, not one bad ratio

**Attach to:** Chapter 8, `ch-optimizers`, at the end of the condition-number paragraph (~line 2024–2038), which already defines κ = λmax/λmin beautifully.

**Draft note.**
> In higher dimensions the ravine doesn't just stretch — it multiplies. A real network's loss has millions of curvature directions, and measured spectra show a huge flat bulk hugging zero plus a handful of steep outliers: less a valley than a canyon system with a few sheer walls and endless soft floor. Condition numbers in the wild reach 10⁵ and beyond, so the crawl this paragraph proves isn't a corner case — it's the default. That's why every method below ships in every deep-learning library.

**In-app demo.** The ravine race itself: raise the data correlation in a regression problem (custom dataset editor) and watch the contours stretch — "now imagine a million axes, most of them the gentle one."

---

## Note 5 — Why nobody runs full Newton: the O(d²) matrix and the O(d³) solve

**Attach to:** Newton optimizer card (optTree entry ~line 341–349). The card already says "trivial for our 2, ruinous for a billion" — the note makes the arithmetic land.

**Draft note.**
> Put numbers on "ruinous." The Hessian holds one curvature entry per *pair* of parameters — d² numbers — and using it means solving a d×d system, whose cost grows like d³. For our two knobs that's a 2×2 matrix: four numbers, instant. For a billion-parameter model it's 10¹⁸ numbers — millions of times more memory than the model itself — before you even start the solve. Newton isn't wrong at scale; it's unaffordable by a factor with eighteen zeros.

**In-app demo.** The curvature lens's violet Newton ghost — already referenced in the card's aside (~line 2283–2289). Frame it: "you are watching the one place on Earth where Newton is free."

---

## Note 6 — Diagonal preconditioning: the affordable sliver of Newton

**Attach to:** Best single home is the **AdaGrad** card (Act III intro, ~line 254–263), with a back-reference from **Sophia** (~line 351–359), whose card already says "only the diagonal: blind to the off-axis stretch."

**Draft note.**
> In higher dimensions, "a learning rate per parameter" is really a bargain struck with Newton. The full curvature matrix has d² entries; its *diagonal* has just d — one number per knob, same cost as the gradient itself. AdaGrad, RMSProp, Adam and Sophia all live on that diagonal. The fine print: a diagonal can only stretch the axes, so it fixes a ravine aligned with the knobs and does nothing for one running diagonally — rotate the valley 45° and Adam zig-zags like plain GD.

**In-app demo.** Strong and genuinely 2-D-able: two regression fits, one with uncorrelated features (axis-aligned ravine — Adam shines) and one with correlated features (rotated ravine — Adam's advantage collapses). If a "correlated data" preset exists or can be built in the custom dataset editor, this is a first-class experiment card candidate.

---

## Note 7 — Sign steps have a geometry, and in 2-D you can see all of it

**Attach to:** Lion card (~line 330–338) and/or its aside (~line 2291–2299).

**Draft note.**
> Watch Lion's red arrow: with two knobs, sign(c) can only point in eight directions — the axes and the four diagonals. That is the whole geometry of a sign step: it moves γ along *every* axis at once, so in d dimensions its true length is γ√d no matter how faint the gradient, and it can point far from steepest descent (it is steepest descent if you measure distance by the largest single-knob change, not straight-line length). At a billion parameters that √d is enormous — which is why Lion runs on a much smaller γ than Adam.

**In-app demo.** Excellent in-app: turn on the step arrow with Lion selected and watch the red arrow snap between the 8 compass headings while blue rotates freely. This could even be a one-line "Watch it:" callout.

---

## Note 8 — Random gradients are nearly perpendicular up there

**Attach to:** Chapter 7, `ch-noise`, after the fan-of-arrows paragraph (~line 1937–1947).

**Draft note.**
> The fan tells the truth in 2-D, but in higher dimensions it would look strange: two random directions among a million axes are almost always nearly *perpendicular* — there are simply too many ways to be orthogonal and only one way to agree. So gradient noise mostly pushes sideways, at right angles to the true downhill, rather than backwards against it. The run drifts and wanders more than it backtracks — one reason noisy SGD keeps making progress even when individual arrows look hopeless.

**In-app demo.** Set batch size to 1 and watch the fan: even in 2-D the rays rarely point backwards. The note extends it: "at scale, nearly the whole fan squeezes toward the 90° ring."

---

## Note 9 — Batch size buys steadiness at √n rates — until it buys nothing

**Attach to:** Chapter 7, `ch-noise`, after the √n paragraph (~line 1940–1947), which already teaches diminishing returns.

**Draft note.**
> At scale this √n law becomes an economic one. The useful ratio is noise-to-signal: below a problem-specific *critical batch size* you can double the batch and (roughly) double the learning rate for the same trajectory — the linear scaling rule behind giant training runs; above it, extra data per step only buys calm the run no longer needs (McCandlish et al., 2018; Goyal et al., 2017). Bigger is not better — bigger is *quieter*, and quiet has a price and a ceiling.

**In-app demo.** Directly demoable: batch 4 at γ vs batch 16 at a larger γ landing similar trajectories on a noisy fit — a natural experiment card ("double the batch, double the rate").

---

## Note 10 — Every published "loss landscape" picture is a trick of projection

**Attach to:** Chapter 2, `ch-landscape` (~line 1330–1349). The Further-reading link to Li et al., 2018 is *already there* (~line 1104) — but nothing in the prose tells the reader why that paper is listed.

**Draft note.**
> One luxury to savor: this app draws the *entire, exact* loss surface, because two knobs are all there are. A real network's surface lives in a billion dimensions, so every landscape picture you'll ever see of one is a 2-D *slice* — pick two directions, sweep them, plot. And raw slices lie: rescaling tricks inside networks stretch some directions and shrink others, so honest pictures need careful normalization of the slice directions (that's the "filter normalization" of Li et al., 2018, in the reading list below). Here, and almost nowhere else, what you see is the whole truth.

**In-app demo.** The 3D toggle itself — "rotate it and remember: for GPT you'd be rotating a 2-D shadow of 10¹¹ dimensions."

---

## Note 11 — The 2/λmax cliff-edge is where real networks *choose* to live

**Attach to:** Chapter 5, `ch-gamma`, after the stability-limit paragraph (~line 1769–1781).

**Draft note.**
> A modern surprise to file away: for the smooth bowls here, γ > 2/λmax means certain divergence — a theorem. But full-batch training of real networks was found to hover *right at* that edge: the curvature itself rises until 2/λmax meets the γ you chose, and the loss then falls non-monotonically along the knife's edge (Cohen et al., 2021, "edge of stability"). The clean law you can verify on this bowl becomes, at scale, a strange equilibrium the theory is still catching up to.

**In-app demo.** Push γ just past the limit on a clean bowl and let the app's divergence-catch explain; the note reframes the same edge as a place, not just a wall.

---

## Note 12 — "Flat minima generalize better" needs two asterisks

**Attach to:** Chapter 9, `ch-generalize`, final paragraph (~line 2398–2408), which states the flat-vs-sharp story confidently.

**Draft note.**
> Two honest asterisks on this tidy story. First, "flat" is slippery: networks can be rescaled — same function, same predictions — while the basin's measured sharpness changes arbitrarily, so naive flatness isn't the whole answer (Dinh et al., 2017). Second, in large networks good minima aren't isolated dips like the ones drawn here: they connect into long low-loss valleys you can walk between without climbing (Garipov et al., 2018). The intuition survives — restless SGD prefers forgiving regions — but hold it as a compass, not a theorem.

**In-app demo.** Weakly demoable; the sharp-vs-wide basin contrast could be shown on a landscape with one narrow and one broad minimum plus small-batch noise settling into the broad one — the caveat then rides on top as text.

---

## Note 13 — Contours are loops here, hyper-surfaces there (small, optional)

**Attach to:** Chapter 4, `ch-downhill`, the perpendicular-to-contours paragraph (~line 1525–1534).

**Draft note.**
> A quiet upgrade for later: with two knobs, a contour is a loop — one line of "no change." With d knobs it is a whole (d−1)-dimensional sheet: at any point there is just *one* uphill direction and a vast flat wall of sideways ones. The gradient's job gets lonelier as d grows — it is the single needle of change in a haystack of directions that change nothing. (This is also Note 8 wearing different clothes.)

**In-app demo.** The existing gradient-field overlay; arrows crossing contours at right angles reads the same at any d.

---

## Summary table

| # | Attach to | Theme | Demoable in 2-D? |
|---|-----------|-------|------------------|
| 1 | ch-shapes | saddles dominate: counting argument | yes — saddle surface + arrow-key nudge |
| 2 | ch-shapes | bad local minima ≈ non-issue at scale | yes — ridge-crossing starts, reframed |
| 3 | ch-shapes | init = scale, not basin, at scale | weak — reset-marker framing |
| 4 | ch-optimizers | Hessian spectra: bulk + outliers, κ ~ 10⁵ | partial — stretched ravine |
| 5 | Newton card | d² memory, d³ solve, 18 zeros | yes — curvature lens ghost |
| 6 | AdaGrad card (+Sophia) | diagonal = affordable sliver; fails rotated | **yes — rotated-ravine preset (build it)** |
| 7 | Lion card | sign geometry: 8 directions, γ√d length | **yes — red arrow snaps to compass** |
| 8 | ch-noise | random gradients nearly orthogonal | partial — fan rarely points backward |
| 9 | ch-noise | critical batch size / linear scaling | yes — batch↔γ swap experiment |
| 10 | ch-landscape | all real landscape plots are slices; Li et al. | yes — 3D toggle as framing |
| 11 | ch-gamma | edge of stability at 2/λmax | yes — divergence catch reframed |
| 12 | ch-generalize | flatness caveats; mode connectivity | weak — narrow-vs-wide basin |
| 13 | ch-downhill | contours become (d−1)-sheets | yes — existing overlay |

## Implementation observations (read-only findings)

- The guide already contains three proto-notes of exactly this kind: the Dauphin paragraph in ch-shapes (~1475), the backprop aside in ch-downhill (~1582), and the "frontier" box on Muon/Shampoo/SOAP in ch-optimizers (~2302) — the last being the best existing model for the voice: it names precisely what a 2-parameter sandbox cannot show and why. The new notes should match its register.
- Li et al. 2018 (`ch-landscape` refs, line 1104) and Keskar 2017 (`ch-generalize`, line 1136) are cited but never motivated in prose; Notes 10 and 12 give them their sentences. New citations needed: Choromanska et al. 2015 (opt.), McCandlish et al. 2018, Cohen et al. 2021, Dinh et al. 2017, Garipov et al. 2018.
- Two notes are more than margin notes — they suggest *presets*: the rotated-ravine / correlated-features demo (Note 6) and the batch↔γ linear-scaling swap (Note 9) would slot naturally into `src/utils/experiments.ts` alongside `banana-race` and `lion-schedule`.
- Highest-leverage if only a few are adopted: Notes 1, 5, 6, 7, 10 — each corrects a misconception the app otherwise actively teaches (villainous local minima; Newton as merely "clever"; per-parameter rates as a free lunch; sign steps as a curiosity; the heatmap as what practitioners see).
