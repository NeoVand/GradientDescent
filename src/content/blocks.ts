/**
 * The block schema — a chapter's content as typed data instead of markup.
 *
 * Each guide chapter is an ordered array of tagged blocks; the app renders
 * them through <GuideBlocks> and the LaTeX emitter will walk the very same
 * arrays. Prose fields are Rich strings (see rich.ts). Figures stay
 * app-rendered: a block only names its figure and owns the caption, and the
 * chapter shell supplies the visual through a snippet — the compute/render
 * split for print happens figure by figure, later.
 */

import type { formulas } from './formulas';

/** A prose string in the Rich micro-syntax ($math$, **strong**, *em*, {g:}, {dark:}/{light:}). */
export type Rich = string;

/** Keys into the named formula registry — the key doubles as the print label. */
export type FormulaKey = keyof typeof formulas;

export type Block =
  /** A body paragraph. */
  | { kind: 'p'; text: Rich }
  /** A quiet detour (p.aside) — definitions, symbol-decoding, historical footnotes. */
  | { kind: 'aside'; text: Rich }
  /** A "look at the app right now" pointer (p.look) — an app-only register. */
  | { kind: 'look'; text: Rich }
  /** A numbered display equation from the formula registry. */
  | { kind: 'display'; formula: FormulaKey; center?: boolean }
  /** The imperative recipe blockquote — "Nudge. Measure. Divide." */
  | { kind: 'recipe'; text: Rich }
  /** A bulleted list: ▸-marker knob style (default), or the plain viz-list. */
  | { kind: 'list'; items: Rich[]; variant?: 'viz' }
  /** A titled concept box, optionally with a small illustration beside it. */
  | { kind: 'concept'; title: string; text: Rich; fig?: string }
  /**
   * The full-bleed concept variant: a background visual (named by fig,
   * supplied by the chapter shell) behind a fade, with the titled text
   * overlaid on the right.
   */
  | { kind: 'conceptOverlay'; title: string; paras: Rich[]; fig: string }
  /**
   * A boxed derivation. Inner blocks render in the proof register (p →
   * .proof-p, displays centred, figures as .proof-fig); the renderer seals
   * the last paragraph with the ∎.
   */
  | { kind: 'proof'; title: string; blocks: Block[] }
  /** An "In a billion dimensions" honesty note — print's margin channel. */
  | { kind: 'hd'; text: Rich }
  /** A figure: the id names an app-side (later: computed) visual; the caption lives here. */
  | { kind: 'figure'; id: string; caption: Rich }
  /** The optimizer story cards for one family-tree chapter (data in optimizerCards.ts). */
  | { kind: 'optcards'; chapter: string }
  /** The dashed closing box — the frontier beyond the playground. */
  | { kind: 'frontier'; title: string; text: Rich }
  /**
   * An interactive island with no print analogue of its own (the schedule
   * gallery, later the race) — the shell supplies it; print will use a
   * fallback figure.
   */
  | { kind: 'widget'; id: string };
