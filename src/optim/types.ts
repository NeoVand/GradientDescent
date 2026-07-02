/**
 * The optimizer core — n-dimensional, dependency-free, and readable on
 * purpose: each optimizer lives in its own file under ./optimizers, written
 * as plain elementwise loops so the source doubles as the textbook listing
 * the guide reveals. The app consumes this core at d = 2 through the adapter
 * in src/utils/optimizers.ts; nothing here knows about Svelte, stores, or
 * the DOM.
 *
 * Conventions:
 *  - Parameters, gradients, and state buffers are Float64Array of length d.
 *  - step() mutates params and state IN PLACE (the norm for optimizer
 *    libraries, and what a future WebGPU backend will mirror); callers who
 *    need immutability copy first — the app's adapter does.
 *  - The caller brings gradients (and, for second-order methods, curvature):
 *    the core is framework-agnostic, like a gradient-transformation library.
 *  - Classroom guards (trust regions, seeds, caps that keep wild toy
 *    landscapes teachable) are marked ⚠ CLASSROOM GUARD at every use, listed
 *    in DEVIATIONS.md, and switched off with ctx.guards === false for the
 *    paper-faithful update.
 */

export type Vec = Float64Array;

export interface HyperparamSpec {
  key: string;
  /** Short display label, e.g. "Momentum". */
  label: string;
  /** Greek/short symbol shown next to the label, e.g. "μ". */
  symbol: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** One-line plain-text explanation (no markup — renderers style it). */
  hint: string;
  /** Optional second, smaller line of detail. */
  hintDetail?: string;
}

export interface StepContext {
  /** Dense row-major d×d Hessian, for second-order methods at small d. */
  hessian?: Float64Array;
  /** Diagonal-only curvature — the affordable n-dim alternative (Sophia). */
  hessianDiag?: Vec;
  /** Parameter domain, so trust regions can size themselves to the landscape. */
  range?: { min: number; max: number };
  /**
   * Classroom guards default ON (undefined). Pass false for the
   * paper-faithful update — and expect fireworks on saddles.
   */
  guards?: boolean;
}

export interface CoreOptimizer<S> {
  id: string;
  name: string;
  /** One-line description for pickers. */
  description: string;
  /** KaTeX source for the update rule. */
  updateRuleLatex: string;
  /** Teachable hyperparameters; ε-style constants stay internal. */
  hyperparams: HyperparamSpec[];
  /**
   * Adaptive methods normalize the gradient away, so one learning rate
   * works across problems; when set, it overrides per-problem γ defaults.
   */
  fixedLearningRate?: number;
  /** Second-order methods set this so callers supply curvature in ctx. */
  usesHessian?: boolean;
  /** Fresh state for a d-dimensional problem. */
  init(d: number): S;
  /** One update: mutates params and state in place. */
  step(
    params: Vec,
    gradient: Vec,
    state: S,
    learningRate: number,
    hyper: Record<string, number>,
    ctx?: StepContext
  ): void;
}

/** Shared ε for the adaptive-rate family (√s + ε placement, as in PyTorch). */
export const EPS = 1e-8;

export const zeros = (d: number): Vec => new Float64Array(d);
