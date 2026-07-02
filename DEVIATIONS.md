# DEVIATIONS.md — the honesty ledger

Every place where Gradient Lab's optimizer implementations knowingly differ
from the published algorithms, and why. The source of truth for the
implementations is `src/optim/optimizers/` (one file per method — the same
files the guide's *reveal-the-code* shows); each entry here is also noted in
that file's header.

Two kinds of deviation appear below:

- **Convention** — a legitimate published variant (usually the one major
  frameworks ship). Not a correctness issue; listed so a reader comparing
  against a specific paper isn't surprised.
- **⚠ Classroom guard** — a safety rail added for this lab's wild two-knob
  landscapes, *not* part of the algorithm. Every guard is marked
  `⚠ CLASSROOM GUARD` at its use site and can be switched off by passing
  `ctx.guards = false` to `step()`, which runs the paper-faithful update.

---

## Conventions

| Method | Deviation | Detail |
|---|---|---|
| Momentum | PyTorch form | `v ← μv + g`, step `−γv` (γ not folded into v, unlike Polyak's original bookkeeping). Effective steady-state step is γ/(1−μ). |
| Nesterov | Framework reformulation | Step blends the fresh gradient with the updated velocity (`−γ(g + μv)`), equivalent to the look-ahead evaluation under a change of variables — as in PyTorch. |
| AdaGrad / RMSProp / Adam family | ε placement | ε sits **outside** the root: `γ·g/(√s + ε)` (paper/PyTorch style). TensorFlow and some texts use `√(s + ε)`; the two differ visibly near s ≈ 0. |
| AdaDelta | ε = 1e-4 (paper: 1e-6) | ε floors the very first step (when E[Δθ²] = 0); the canonical value warms up too slowly for this lab's short runs. Still a legitimate AdaDelta ε. γ kept as a plain global gain, default 1 (= the paper). |
| Nadam | Simplified Dozat form | No μₜ product schedule — the common framework variant. First step ≈ (1+β₁)γ, nearly double Adam's. |
| AdamW | PyTorch semantics | Decay multiplied by γ: `θ ← θ − γ(m̂/(√v̂+ε) + λθ)`. The paper's schedule-normalized form scales λ by the schedule only. |
| Lion | Weight decay dropped | The paper's decoupled decay term is omitted — this lab's losses carry no regularizer for it to act on. Every reported Lion win pairs sign updates *with* decay; keep that in mind before generalizing from the sandbox. |
| Sophia | Exact curvature, every step | The lab hands Sophia the exact finite-difference Hessian diagonal at each step; the paper uses cheap stochastic estimators (Hutchinson / Gauss–Newton–Bartlett) refreshed only every k ≈ 10 steps. The clip is parameterized as ±ρ per coordinate (equivalent to the paper's form up to reparametrization). |

## ⚠ Classroom guards

| Method | Guard | Constants | Paper behavior with `guards: false` |
|---|---|---|---|
| Newton | Damped (Levenberg–Marquardt-style) Newton: lift the smallest Hessian eigenvalue to a floor via a +τI shift, then cap the step to a trust region | floor 0.5 (relative cap 1e-3·λmax), trust radius 0.28 × domain span | Pure `−γH⁻¹∇ℒ` by dense solve: explodes on plateaus, walks uphill into saddles — exactly what the textbooks warn about, on demand. |
| Prodigy | Domain-scaled seed and cap for the distance estimate d, plus a per-step trust region | d₀ = 1e-4 × span, d ≤ 1.5 × span, trust radius 0.18 × span | The paper's absolute seed d₀ = 1e-6, no cap, no clip. d only ever grows; on small non-convex surfaces a bad ramp then never recovers. |

## Not deviations (but worth knowing)

- **The UI's gradient-in-v convention.** For methods with no velocity of
  their own (GD, AdaGrad, RMSProp, Newton), the *app's* state record carries
  the last gradient in its `v` slot so the marker's arrow overlay can draw
  it. This lives entirely in the adapter (`src/utils/optimizers.ts`), not in
  the algorithms.
- **Equivalence guarantee.** The n-dim core reproduces the original
  hand-written implementation's trajectories to < 1e-12 over 60 steps for
  all 14 methods (`src/optim/__goldens__`, enforced by
  `equivalence.test.ts` and `adapter.test.ts`).
