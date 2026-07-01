# Gradient Lab guide — the absolute-beginner walkthrough

**Audit unit:** read the entire guide (`src/components/HelpModal.svelte`, reading column lines ~1180–2500, optimizer cards lines 210–372, formulas object line 183, chRefs line 1091) as a motivated reader with high-school math and **no calculus**. Mark every point where that reader falls off. Then propose the minimal set of new prerequisite material, with placement and a teaching sketch in the app's visual two-parameter style.

**Persona:** knows algebra, graphs of functions, basic trig (sin/cos of an angle), Pythagoras, logarithms as "the inverse of exponents" (shakily). Does **not** know: limits, derivatives, Σ notation, vectors as objects with components, dot products, matrices, eigenvalues, probability beyond coin flips, "convex".

**Overall verdict up front.** The guide is unusually good at defining terms at first use (parameters, loss, contour lines, local/global minimum, basin of attraction, partial derivative-by-nudging, iteration/epoch, empirical vs. true risk are all genuinely *taught*). The prose ladder is real. The reader falls off in a small number of predictable places, and almost all of them are the same species of failure: **a symbol arrives before its concept** (Σ, ∂, ‖·‖, λ_max, H, ⟨·,·⟩), or **a concept arrives one chapter early** (∇ℒ in Chapter 3, "generalize" in Chapter 7). One structural gap dominates everything else: *curvature / second derivative / Hessian* is load-bearing in three chapters (γ-stability, condition number, Newton/Sophia) and is never taught anywhere.

---

## Part A — Chapter-by-chapter fall-off log

### Cover + course banner
No fall-offs. "Two knobs, a landscape of error" is exactly the right first sentence. The ∂ icon in the header is, amusingly, a symbol the guide never explains even when it later appears in a formula (see Ch. 4).

### Chapter 1 · The bottom of a bowl (lines 1244–1323)

Excellent opening: knobs → parameters → prediction → loss, each bolded and defined in sequence.

Fall-off points, in reading order:

1. **The MSE formula (line 1288, `formulas.lossDefinition`).** The prose walk-through ("take each prediction ŷ, subtract, square, average") is perfect — but the formula then shows `(1/n) Σᵢ₌₁ⁿ (ŷᵢ − yᵢ)²`. Three unexplained artifacts land at once: the **Σ symbol**, the **subscript i** (indexing data points), and the **hat on ŷ** (the "prediction" decoration — the prose uses ŷ but never says "the hat marks a *predicted* quantity, read it 'y-hat'"). A no-calculus reader can survive by trusting the prose, but the formula becomes decoration rather than a second reading of the same idea. Fix is a two-line notation note, not a chapter (see P4 below).
2. **"a smooth, rounded bowl rather than a creased tent"** — the claim that squaring (vs. absolute value) buys smoothness is asserted, never shown. It is a lovely, checkable fact: plot `|x|` next to `x²` and point at the kink. One tiny inline figure would convert an assertion into an observation. (Also, "smooth" is doing silent technical work — differentiability — that pays off in Ch. 4; worth one sentence of foreshadowing: "smooth here means: zoom in anywhere and it flattens into a straight line — we will lean on that hard in Part II.")
3. **The cross-entropy passage (lines 1294–1309) is the first genuine cliff.** In one paragraph the reader gets: interval notation `ŷ∈(0,1)` (which a high-schooler may parse as a coordinate pair — in an app where coordinate pairs (α, β) are the main object!), the idea that "the model outputs a **probability**" (how? nothing so far outputs anything but a number), `log` of numbers between 0 and 1 going negative and `−log(1−ŷ)` "rocketing to infinity" (needs a picture of −log on (0,1)), and then the sentence *"It is precisely the negative log-likelihood of a coin-flip (Bernoulli) model"* — **likelihood** and **Bernoulli** are both undefined, and no high-school reader knows either. This sentence is written for someone who already knows the answer.
   - Minimal repair: keep cross-entropy but (a) show a 60-px sketch of −log(ŷ) on (0,1); (b) replace the Bernoulli sentence with a plain-words version ("it is the loss you get if you score the model by *how much probability it put on the truth* — a fact we'll take on faith here") and demote the likelihood remark to a margin note for returning readers; (c) say "read (0,1) as: any number strictly between 0 and 1."
   - Alternative structural repair: move the whole cross-entropy block to sit next to the *Classification & geometry* problems (Ch. 10) where the reader has met σ(αX+βY), and leave Chapter 1 purely MSE. Chapter 1 currently teaches two losses before the reader has taken a single step.

### Chapter 2 · Loss is a landscape (1327–1404)

The strongest chapter for a beginner. "The loss is not one fixed number — it is a number *for every possible setting of the knobs*" is the single most important sentence in the guide, and it is exactly right. Contour lines get the hiking-map treatment; the two-view figure (map from above / surface from the side) is precisely the right picture.

Minor fall-offs:

4. **Dimension bookkeeping is silent.** Two knobs make a flat *plane*; loss adds a *third* direction (height). The reader who tries to count dimensions ("two knobs… so why is the 3D view three-dimensional?") gets no help. One sentence: "two knobs give the floor plan; the loss is the altitude — two plus one is why the 3D view is three-dimensional."
5. **No practice.** The chapter tells the reader how to read a contour map but never makes them *do* it. A three-question inline exercise ("which of these two points has lower loss? where is it steepest? which way would water flow from here?") would cost 40 px and cement the skill everything else relies on. (See P2.)

### Chapter 3 · When the bowl isn't a bowl (1407–1503)

Content is correct and the Dauphin high-dimensions paragraph (1474–1481) is the single best "honest margin note" in the guide — it explicitly reverses the 2-D intuition it just built. Keep it exactly as is.

Fall-offs:

6. **`∇ℒ = 0` appears one chapter before ∇ℒ is defined** (line 1469; the gradient chapter is next). The words around it ("the gradient there is zero") carry the meaning, but the reader meets the guide's most important symbol as an unexplained glyph. Either strip the symbol here (pure prose survives fine) or add "(a symbol we unpack in the next chapter)".
   More broadly this chapter narrates *gradient descent's behavior* — "gradient descent only ever feels the slope under its feet," basins, stalling on saddles — before the walk itself is defined in Chapters 4–5. It works as foreshadowing because the language stays physical, but consider whether Chapter 3 belongs *after* "One step of descent" — the reader would then watch traps happen to a walker they understand. If the order stays (there are good narrative reasons: landscape-Part-I coherence), keep the language symbol-free.
7. **"critical points" (line 1477)** — used exactly once, undefined. The reader can't know it means "all the places where the ground is flat: minima, maxima, and saddles together." Define inline in six words or drop the term.
8. **"non-convex optimization" (line 1480)** — *convex* is never defined anywhere in the guide, yet it recurs (Nesterov card: "on a smooth convex bowl"; RMSProp card: "non-convex problems"; Newton card: "away from a convex bowl"). It always appears at load-bearing moments (this is where Nesterov's optimality and Newton's failure live). Needs a one-line margin definition once: "**convex** = shaped like a single bowl everywhere: hang a straight rope between any two points of the surface and the rope never dips below it. One basin, no traps."

### Chapter 4 · Which way is downhill? (1507–1703)

This chapter tries hardest and mostly succeeds: slope-by-feel, gradient as bundled slopes, partials as "nudge one knob, hold the other," the perpendicular-to-contours argument, and a real proof with a picture. For a no-calculus reader it is the best available on-ramp — but it papers over the one concept it can't teach in passing:

9. **The derivative itself is never taught.** The nudge-and-divide recipe (lines 1574–1581) is a *finite difference* — it quietly assumes the answer doesn't depend on how big the nudge is. A reader who thinks about it will ask "a hair — how small? does it matter?" and the guide has no answer. The limit idea ("make the nudge smaller and smaller; the ratio settles down to one number; *that* number is the slope at a point") is the missing floor under the whole of Part II. This is the top-priority new prerequisite (P1 below). It also would redeem the ∂ symbol: `∂ℒ/∂α` appears in the displayed gradient formula (line 1591) with the **∂ glyph never named or explained** — in the app whose logo is ∂.
10. **Vectors are assumed, not built.** "Stack those two answers into a little arrow" is a good start, but within a page the reader needs: components in a column with **bracket notation** `[· ; ·]` (line 1591 — never explained that this is just "two numbers stacked"), **length** ‖∇ℒ‖ (the double-bar norm symbol is used at 1631 and again in gradient clipping and the weight-decay formula, **never defined** — Pythagoras is all it takes), a **unit vector** u ("take a unit step in some direction u" — *unit* undefined), and the **dot product** (the proof at 1626–1633 says "their dot product ∇ℒ·u" and leans entirely on the "shadow" metaphor). The shadow metaphor is genuinely good — but the reader never learns the dot product is *computable* (multiply matching components, add), so the proof reads as poetry rather than arithmetic. See P3.
11. **θ symbol collision.** The proof introduces "θ for the angle between u and ∇ℒ" (line 1629); the very next chapter defines **θ as the parameter pair (α, β)** (line 1715) — the meaning it keeps for the rest of the book, including in the cards' formulas. A beginner tracking symbols carefully (the ones we want!) is punished for it. Rename the angle to φ (or ψ) in the proof and the `formulas.directional` string; this is a five-character fix.
12. **The backprop aside (1582–1590)** name-drops the **chain rule** with no gloss. Fine as an aside, but one clause — "the rule for how slopes compose when one machine feeds another" — keeps the no-calculus reader on board.
13. Good marks: "the gradient is only the truth right where you stand… zoom in and any smooth surface flattens into a tilted plane" (1679–1686) is exactly the local-linearity intuition the derivative mini-chapter (P1) should set up; these two would reinforce each other.

### Chapter 5 · One step of descent (1706–1746)

Short, correct, well-placed; θ defined as shorthand at first use ✓. The blue-vs-red arrow ("that gap is the optimizer's personality") is a great forward hook.

14. Trivial: `formulas.updateRule` (line 184, the superscripted `θ^(t+1)` version) is defined but never rendered — dead code, and just as well, since the superscript-step notation would be one more unexplained decoration. If it's ever used, teach "the little (t) counts steps" first.

### Chapter 6 · The learning rate γ (1749–1833)

The Goldilocks framing and the triptych figure are ideal. Two real problems:

15. **"Steepness" vs. "curvature" — a genuinely misleading conflation (lines 1762–1767).** The reader has *just* spent a chapter learning steepness = gradient length. Now: "push γ past roughly two divided by the **steepness** of the valley… That 'steepness' is the **curvature**." Steepness (first derivative) and curvature (second derivative — how fast the steepness *changes*) are different quantities, and the stability bound depends on the second, not the first. The follow-up sentence does correct itself ("the steepest second derivative — how sharply the slope itself is bending"), but the first pass actively teaches the wrong association. Rewrite: never call it steepness; introduce it as "a new number — not how *tilted* the ground is, but how quickly the tilt itself changes as you walk: the **curvature**."
16. **λ_max appears from nowhere (line 1772, formula at 1775).** "Written λ_max" — the subscript implies a λ_min and a whole family; the reader has no idea these are the two principal curvatures of the bowl (Hessian eigenvalues). The symbol pays off two chapters later (κ = λ_max/λ_min), so it must be planted properly — this is the Hessian mini-chapter's job (P5). Until that exists, the honest minimum is: "λ_max — the curvature in the *most curved* direction; a bowl bends by different amounts in different directions, and the steepest bend is the one that limits γ."
17. **Where does the 2 come from?** The bound γ < 2/λ_max is stated as revealed truth, but the 1-D derivation is high-school algebra and deeply satisfying: on `L = ½λx²` each GD step multiplies x by `(1 − γλ)`; the walk converges exactly when that factor is between −1 and 1, i.e. γ < 2/λ; at γ = 1/λ you land in one hop; between 1/λ and 2/λ you overshoot but the overshoots shrink. A four-line boxed derivation (or an interactive slider on the multiplier) would turn the guide's sharpest magic number into the reader's own result. Note the code *already knows this*: `lrRegimes` (line 785) simulates exactly `p·(1−γλ)` per axis — the figure is honest; the text just doesn't let the reader in on the mechanism.
18. Symbol collision, minor: λ here is curvature; in Chapter 9 (generalization) and the AdamW card, λ is weight-decay strength. Both are standard, but a beginner deserves a margin note at the second use: "an unrelated λ — the alphabet is small and the field is greedy."

### Chapter 7 · Scheduling the learning rate (1837–1911)

No fall-offs of substance — genuinely beginner-clean, and the Lion foreshadowing (with the payoff in the cards and the `lion-schedule` experiment) is the guide's best-executed long-range setup. The claim about warmup being standard for large-model training is accurate; cosine "about 5%" floor matches the app's schedule.

### Chapter 8 · Mini-batches & the S in SGD (1915–2008)

Very good: full-batch defined, unbiasedness ("still points the right way *on average*") is the right emphasis, iteration/epoch vocabulary planted, the fan-of-arrows ties the concept to a visible thing, the noise-ball → schedule payoff closes the loop with Chapter 7. The √n arithmetic (batch 4 ≈ 2× steadier than 1; 16 to halve again) is correct.

19. **The 1/√n law is asserted bare (lines 1941–1946).** "The error of an average shrinks only with the square root of how many samples" — a no-statistics reader has never seen this fact. It doesn't need a proof; it needs one grounding instance: "average 4 dice rolls and the average is typically about half as far from 3.5 as a single roll; average 16 and it halves again — try it." A margin die-rolling micro-demo would be very in the app's spirit. (P7.)
20. **"generalize to new data" (line 1952) is used two chapters before it is defined** (Chapter 9 does it properly, empirical vs. true risk). Add "(a word Chapter 9 unpacks)" or swap in plain words here ("keep working on data it hasn't seen").
21. The wide-vs-sharp-basin claim here is stated as tendency ("tends to steer"), which is the honest strength of evidence — good. Chapter 9's version cites Hochreiter/Schmidhuber and Keskar — also good. No change needed; noted as a strength.

### Chapter 9 (part III) · The optimizer family tree (2012–2335)

The condition-number paragraph (2024–2038) is **correct** (optimal fixed step γ = 2/(λ_min+λ_max); contraction (κ−1)/(κ+1); momentum's (√κ−1)/(√κ+1)) — and it is the densest wall in the book:

22. **Four new ideas in one paragraph:** two curvatures of one bowl (still no Hessian under them), a *ratio* κ as the villain, "closes the gap to the minimum by a factor…" (the notion of a **per-step contraction factor** has never been introduced — it is the same `(1−γλ)` mechanism from fall-off #17, which is precisely why the boxed 1-D derivation in Chapter 6 would pay double here), and an asymptotic argument ("creeps toward 1 as κ grows"). A beginner needs a worked number: "κ = 100: plain GD keeps ~98% of its remaining distance each step — about 115 steps to halve it; momentum keeps ~82% — about 4. That is the whole family tree in two numbers."
23. **The cards' EMA doesn't match the tool that was just taught.** The "moving average" prereq card teaches `v ← βv + (1−β)x` — then the Momentum card's formula is `v ← μv + ∇ℒ`, with **no (1−β) factor and a new symbol μ**. A reader doing the thing we've trained them to do (match formula to tool) will conclude they've misunderstood. In truth Polyak momentum is an exponentially weighted *sum* (≈ 1/(1−μ) times the average), which is also why its effective step is bigger. One honest sentence on the Momentum card fixes it: "almost the tool from the last card — momentum skips the (1−μ) shrink, so its memory *adds up* rather than averages; that stored-up push is the point." Also say μ is momentum's traditional name for the decay.
24. **Newton card internal tension:** prose says "jump straight to that bowl's bottom … with no learning rate to tune," formula reads `θ ← θ − γH⁻¹∇ℒ` (γ present). Damped Newton is what the app runs, so the formula is honest — but the beginner sees a γ in a method advertised as γ-free. Add: "(pure Newton is γ = 1; the γ here is a safety throttle, and the app keeps one for the same reason)."
25. **The Hessian is name-dropped, never taught** (Newton card line 345: "fit a quadratic bowl to the surface right here (the Hessian **H**)"). This is the guide's known, and biggest, conceptual gap: λ_max (Ch. 6), λ_min/λ_max/κ (Ch. 8→9), "the diagonal" (Sophia card), "H is N×N" (Newton card), and the curvature-lens feature of the app itself all sit on it. See P5 — placement and sketch.
26. Smaller card-level fall-offs: Prodigy's `⟨g, x₀−x⟩` uses **angle-bracket inner-product notation** never seen elsewhere (the proof used the dot); Sophia's "precondition" is jargon with no gloss ("divide each coordinate's step by its own curvature" is available in plain words); RAdam's ρ_t formula includes ρ_∞ undefined on the card (fine to leave the formula as texture, but say "a number ρ_t (its formula is for the curious)"). AdaDelta's units argument ("dimensionally wrong") is a *wonderful* hook that deserves one more sentence of explanation for beginners — "if θ were meters, the gradient has units of loss-per-meter, so subtracting γ∇ℒ only balances if γ carries units too; AdaDelta builds a step whose units are meters by construction."
27. Historical/factual spot-checks (all pass, one pedantic flag): Cauchy 1847 ✓; Polyak 1964 heavy ball ✓; Nesterov 1983 + optimal-first-order-rate claim correctly scoped to smooth convex ✓; AdaGrad 2011 (Duchi–Hazan–Singer, JMLR) ✓; RMSProp as unpublished Hinton Coursera slide ✓ (charming and true); AdaDelta 2012 Zeiler ✓; Adam 2014, bias-correction story ✓; Nadam Dozat 2016 ✓; AdamW 2017, decoupling story ✓, and the "λ here is a pull toward 0, not a regularizer" caveat is a model of honesty; RAdam 2019 ✓ (ρ_t > 4 threshold matches the paper); Lion 2023 program-search origin + sign-step orbit ✓; Sophia 2023 "≈2× by step count" matches the paper's claim (fair to attribute, it's contested in replications — a "the paper reports" hedge would be safer); Prodigy card year "2024" vs. arXiv June 2023 (ICML 2024 — defensible; consider "2023/24"). **Newton "1680s"** is storytelling: Newton's method was a root-finder (De analysi, 1669; Raphson 1690); its use for *optimization* is much later. The card's framing ("the original, three centuries early") survives if one clause is added: "born as a root-finding trick — pointing it at the slope of a loss came centuries later."
28. The "frontier" box (Muon/Shampoo/SOAP can't be shown with two parameters, and why) is exactly the right way to end — honest about the sandbox's limits. Keep.

### Chapter 9 (part IV) · Training loss isn't the goal (2338–2423)

Conceptually the most "adult" chapter and still beginner-readable; empirical vs. true risk is defined cleanly.

29. `min_θ` notation (line 2389) is new — the reader has seen updates, never an *argmin-style declaration*. One clause: "read: find the θ that makes the bracket smallest."
30. `‖θ‖²` — the norm again (see #10); by now it must have been defined or this formula is runes.
31. The weight-decay identity `θ ← (1−γλ)θ − γ∇ℒ` is correct and connects beautifully to AdamW — but note the reader can only *verify* the "gradient of the penalty" claim if they can differentiate ½λθ²; with P1 in place this becomes a one-line "check it yourself" exercise, which would be the book's first closed loop of calculus.

### Chapters 10–12 · Zoo, experiments, panels, keyboard (2426–2498)

Reference material; appropriately terse. The problem-card formulas use unexplained symbols (σ, τ, R², d², κᵢ) but function as labels, not teaching. One real item:

32. In `σ(αX + βY)` and `σ((R²−d²)/τ)`, **σ (the sigmoid) is never introduced anywhere in the guide**, despite the Logistic Growth card, two classifiers, and the cross-entropy passage all depending on "the model outputs a probability." A two-sentence sigmoid note (with its S-curve) belongs wherever cross-entropy ends up (see P6). Also σ collides visually with Σ for beginners; one margin wink defuses it.

### Cross-cutting: the α/β vs. β₁/β₂ collision

33. The model's second *knob* is named **β** — and every EMA decay in Part III is *also* β (β, β₁, β₂). The moving-average card says "keep a fraction β of what you already believed" about a decay while β-the-parameter is literally one of the two numbers being optimized on screen. Nothing can rename the field's β₁/β₂; but the guide should defuse it once, at the moving-average card: "(this β is a *dial on the optimizer*, nothing to do with your knob β — the field ran out of letters long ago)." Same treatment as λ (#18) and θ (#11). A tiny "symbol table" in the Reference part (θ, α, β, γ, μ, λ vs λ_max, β₁/β₂, ∇, ∂, ‖·‖, κ, H) would cost 20 lines and end the whole class of problem.

### TOC nit
34. `toc` (lines 111–131): ch-shapes and ch-downhill both carry `n: '3'`; ch-generalize and ch-problems both `n: '9'`. The numbers appear unused by the template today, so this is latent — but it will bite the LaTeX export the moment chapter numbers become real.

---

## Part B — The minimal new-prerequisite set

Ordered by how much of the book each one un-blocks. Each entry: where it slots, and a 2–3 sentence sketch of how to teach it *in this app's visual, two-parameter style*.

**P1 · "How steep, exactly? The derivative" — new mini-chapter (or opening section) at the top of Ch. 4, before "Which way is downhill?".** Use the 1-D *Fit a Slope* problem (the zoo already leads with it) so there is one knob and one curve. Teach: pick a point on the loss curve; zoom in until the curve looks straight (the app's own "zoom and it flattens into a tilted plane" line, one chapter early and one dimension down); slope = rise/run of that straight line; shrink the nudge and watch the ratio *settle* — the number it settles to is the derivative, the slope *at a point*. An interactive zoom-slider on the 1-D loss curve makes the limit a thing you *do* rather than a definition; it also names ∂ ("the curly d marks 'slope with the other knobs frozen'") so the header icon and the gradient formula stop being runes.

**P2 · "Reading the map" — three-question interactive drill, end of Ch. 2.** Not new theory; deliberate practice for the guide's central literacy. Show a small static contour panel; ask (tap to answer): which of two marked points is lower? where is the slope steepest (where loops bunch)? from this dot, which way does water flow? The app already renders exactly these panels (`ravineFig`/`raceDemo` machinery); a read-only micro-version with tap targets is cheap and locks in the skill every later figure assumes.

**P3 · "An arrow is two numbers: vectors, length, and the shadow" — boxed section inside Ch. 4, between the field-of-arrows figure and the proof.** Teach with the marker's own blue arrow: an arrow on the (α, β) plane *is* its two components stacked in brackets (this legitimizes the gradient column at line 1591); its length is Pythagoras — introduce ‖·‖ here, once, forever; the dot product is "multiply matching components and add," and the *picture* of it is the shadow one arrow casts on another — the exact metaphor the proof already uses, now backed by arithmetic the reader can perform. Interactive: drag a direction-arrow u around the marker and watch ∇ℒ·u computed live, tracing the cosine curve the proof figure shows — the proof then confirms what the reader's hand already found. (Also rename the proof's angle θ→φ; see #11.)

**P4 · "The notation box" — a compact aside in Ch. 1 next to the MSE formula.** Four rows, one line each: Σ ("add up one copy per data point — a for-loop, in Greek"); subscript i ("which data point"); ŷ ("y-hat — the hat marks a prediction; bare y is the truth"); (0,1) ("any number strictly between 0 and 1 — not a coordinate pair"). This is deliberately not a chapter; it is a legend for the guide's formula language, and the LaTeX book will want it as a front-matter table anyway (see #33's symbol table — same artifact, grown-up version).

**P5 · "The bend of the road: second derivatives, curvature, and the Hessian" — new mini-chapter between Ch. 6 (γ) and Ch. 7 (schedules), with a pointer back from the Newton card.** The gap everything else orbits. Teach in three moves. (1) 1-D: the derivative of the slope — does the tilt itself grow as you walk? Sharp bowl = slope changes fast = big curvature; the reader immediately re-derives *why* γ's danger line is set by curvature, not steepness (repairs #15–17: put the four-line `(1−γλ)` derivation here or in Ch. 6 and cross-link). (2) Two knobs: at one point the bowl bends by *different amounts in different directions* — along the ravine floor, gently (λ_min); across it, sharply (λ_max); the honest bookkeeping is four numbers in a 2×2 box, **H**, whose two principal bends are exactly those λ's, and their ratio is κ. No eigen-machinery — "the direction of gentlest bend and the direction of sharpest bend" is rigorous enough at this altitude, with a margin IOU for the linear-algebra reader. (3) Point the reader at the app's **curvature lens** (hexagon button): the ellipse it draws *is* H made visible — long axis = gentle bend, short axis = sharp bend — and Newton's violet ghost is "divide each direction's step by its own bend." This single chapter retro-funds λ_max (Ch. 6), κ and the contraction-factor paragraph (Ch. 8-tree), Newton, and Sophia's "diagonal."

**P6 · "From score to probability: the sigmoid" — half-page, wherever cross-entropy lands (recommend: moved to sit with the classifiers in the zoo, or as a boxed aside at the end of Ch. 1).** Teach: the model computes a plain score (any number, −∞ to ∞); σ squashes it through an S-curve into (0,1) so it can be read as a probability — big positive score ≈ "almost surely yes," zero ≈ "shrug." Show σ's curve beside −log(ŷ)'s curve; cross-entropy then reads as "the penalty for the probability you gave the truth," and the Bernoulli/likelihood sentence can retire to a margin note (repairs #3 and #32 together).

**P7 · "Why averages calm down: the 1/√n note" — margin note + micro-demo in Ch. 8.** One interactive line: a button that rolls n dice and plots the running average's wobble for n = 1, 4, 16 — the fan-of-arrows for dice. Two sentences of text: errors partly cancel when averaged; the cancellation buys √n, not n — which is both why batch-32 looks calm and why it stops being worth paying for bigger batches (repairs #19, and grounds the batch-size economics the chapter already states).

**P8 · "Convex" — one margin definition, first use (Ch. 3, line 1480).** The rope-never-dips-below-the-surface sentence from #8; then Nesterov's and Newton's cards can cross-reference it instead of assuming it. Not a chapter; a footnote with a 100-px sketch (bowl vs. double-well with a chord drawn on each — the double-well is already in the zoo).

**Explicitly not needed:** matrices/linear algebra beyond P5's "2×2 box" framing; probability theory beyond P6/P7; trig beyond what Ch. 4's proof already uses (cos of an angle, with a picture). The guide's instinct to teach operationally-first is right — the prerequisite set above is the smallest floor that makes the existing prose load-bearing rather than trust-me.

---

## Part C — Honest margin notes: where the 2-D picture misleads

The guide already does this once, superbly (Ch. 3's Dauphin paragraph). These are the other places that deserve the same treatment, as short italic margin notes:

1. **"You will never see this map again."** (Ch. 2 or Reference.) In a real model the landscape has millions of axes; no heatmap, no contours, no marker. Practitioners see exactly one panel from this app: **Loss History**. Everything else here is X-ray vision the real world doesn't offer — which is the point of the lab, and worth saying out loud.
2. **Basins are 2-D folklore.** (Ch. 3.) In high dimensions, "separate valleys" are typically *connected*: distinct trained solutions can often be joined by low-loss paths (mode connectivity — Garipov et al., 2018; Draxler et al., 2018). The watershed picture is true here and misleading there.
3. **The ravine, scaled honestly.** (Ch. 8-tree.) Here κ is maybe 20 and the zig-zag is visible; real networks live at κ so large the "ravine" is thousands of near-flat directions and a few cliffs at once — the reason adaptive-per-parameter methods matter more in practice than the tidy 2-D race suggests.
4. **The noise ball isn't round.** (Ch. 8.) Gradient noise in real training is strongly direction-dependent (large along some axes, tiny along others); the isotropic cloud in the figure is a 2-D convenience. The *radius grows with γ* lesson survives; the shape doesn't.
5. **Rates were proved on quadratics.** (Ch. 8-tree.) The (κ−1)/(κ+1) and √κ story is exact for quadratic bowls; on real non-convex surfaces they are guidance, not guarantees. One clause protects the guide's credibility with readers who later meet the theory.
6. **Newton's card already does this well** ("trivial for our 2, ruinous for a billion") — as do AdamW's no-overfitting caveat and the Muon/Shampoo frontier box. Praise, keep, and use their voice as the template for notes 1–5.

---

## Part D — Summary lists (for the merge)

**Errors (wrong or seriously misleading as written) — 3:**
1. Ch. 6 first introduces the stability limit as "two divided by the *steepness*," directly colliding with the previous chapter's steepness = gradient-length lesson; the quantity is curvature (second derivative). Self-corrects a paragraph later, but the first pass teaches a wrong association. (line ~1763)
2. Momentum card's formula (`v ← μv + ∇ℒ`) contradicts the "moving average" tool card taught two cards earlier (`v ← βv + (1−β)x`) with no acknowledgment — the (1−β) factor silently vanishes and β becomes μ; a formula-matching beginner concludes they misunderstood. (line 239 vs. 230)
3. Newton card: prose "no learning rate to tune" beside a formula containing γ; and "1680s" credits optimization use that historically was root-finding. Both fixed by one clause each. (lines 342–348)

**Gaps (concepts used but never taught) — 8:** the derivative/limit (P1); vectors, norm ‖·‖, unit vector, dot-product arithmetic (P3); the Hessian / second derivative / where λ_max, λ_min, κ come from (P5); convexity (P8); Σ / subscript / hat / interval notation (P4); sigmoid & "model outputs a probability," likelihood/Bernoulli (P6); 1/√n standard-error fact (P7); "critical points" (one-line, #7).

**Ordering / symbol-hygiene issues — 5:** ∇ℒ symbol used one chapter early (#6); "generalize" used two chapters early (#20); θ angle-vs-parameters collision in the proof (#11); λ decay-vs-curvature and β knob-vs-decay collisions need one-line defusals plus a Reference symbol table (#18, #33); toc duplicate chapter numbers, latent for LaTeX export (#34).

**Strengths worth protecting — 5:** every core term defined at first use, in prose, before its symbol (parameters, loss, contours, minima, partials-by-nudging, epoch/iteration, empirical vs. true risk); Ch. 3's high-dimensions honesty paragraph — the model for all future margin notes; the directional-derivative proof with its shadow figure — a real proof a beginner can *see*; the long-range setups that pay off (Lion orbit → schedules; blue/red arrow → optimizer personality; AdamW λ caveat); the frontier box's honesty about what a two-parameter sandbox cannot show.
